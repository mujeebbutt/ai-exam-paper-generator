from fastapi import FastAPI
import os
import sentry_sdk

# No settings/config module exists in this project (checked) — every other env var here
# (JWT_SECRET_KEY, GEMINI_API_KEY, DATABASE_URL, ALLOWED_ORIGINS, ...) is read via a plain
# os.getenv() where it's needed, so this matches that established convention rather than
# introducing a new pattern for just this one value. Shared by both sentry_sdk.init()'s
# `environment` below and the /sentry-debug gate further down, so the two can't drift out of
# sync with each other (e.g. Sentry labeling events "production" while the debug route is still
# reachable, or vice versa) — one variable, read once.
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Must run before the FastAPI app is created — this is what lets Sentry's integration patch
# FastAPI/Starlette internals to auto-capture unhandled exceptions from every route.
#
# DSN hardcoded here per Sentry's own setup docs (a DSN is safe to expose publicly — it's
# write-only, good for sending events to this project, not for reading anything back — the same
# value Sentry has you drop directly into client-side JS in their browser SDK). Since this file
# only ever runs server-side, it's not even exposed to visitors the way a frontend DSN would be.
# The one non-security reason to move it to an env var later: local dev runs (and there are a lot
# of them in this project's workflow) will now also report to this same Sentry project, mixing
# dev/test noise in with real production errors. An env var would let local runs point at a
# separate Sentry project or unset it entirely — worth doing if that noise becomes annoying, not
# a security concern either way.
sentry_sdk.init(
    dsn="https://26cfde07d5f5d523f429913f2c543502@o4511954243354624.ingest.us.sentry.io/4511954248400896",
    send_default_pii=True,
    # 1.0 = trace every request. Fine (even desirable) at low traffic: it means zero missed
    # visibility while there's little volume to miss. This only affects performance/transaction
    # tracing, not error capture — errors are always reported regardless of this value. Dial it
    # down (e.g. 0.1) once real traffic/cost makes full tracing wasteful; you won't lose any error
    # reports by doing so, only some of the performance-trace detail.
    traces_sample_rate=1.0,
    # Was hardcoded nowhere before (unset) — now tags every event with which deployment sent it,
    # so "development"/"production" events aren't mixed together in the Sentry dashboard.
    environment=ENVIRONMENT,
)

from fastapi.middleware.cors import CORSMiddleware
from db.database import engine, Base
from routers import upload, generate, export, bank, attempts, auth, pages
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import asyncio
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Create DB tables
Base.metadata.create_all(bind=engine)


async def _warm_up_vector_store():
    """Pays the vector store's one-time cold-start cost (10-30s to load the SentenceTransformer
    embedding model — see services/vector_store.py) during boot instead of on whichever request
    happens to land first after a deploy/restart. get_health() is the same safe, already-public
    entry point /api/status uses — this doesn't touch _ensure_initialized()'s internals or its
    retry/cooldown behavior at all, just triggers it proactively.

    Deliberately run in a worker thread (asyncio.to_thread), not called directly: get_health()
    is a blocking synchronous call, and awaiting it directly on the event loop would freeze
    request handling for the full 10-30s load — defeating the whole point of doing this at
    startup instead of on a real request. Scheduled as a fire-and-forget task (see lifespan()
    below) rather than awaited, so a slow or failing warm-up can never delay the app reporting
    itself ready to Railway or block startup — get_health() already can't raise (that's the
    resilience fix this builds on), but the try/except here is a second, independent guard so a
    truly unexpected error inside this task specifically can never do anything worse than log.
    """
    logger.info("Vector store warm-up: starting...")
    try:
        health = await asyncio.to_thread(generate.vector_store.get_health)
        if health["available"]:
            logger.info("Vector store warm-up: succeeded.")
        else:
            logger.warning(f"Vector store warm-up: failed — {health['last_error']}")
    except Exception as e:
        logger.error(f"Vector store warm-up: unexpected error: {e}", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fire-and-forget: NOT awaited here on purpose. Scheduling the task and moving straight to
    # `yield` lets uvicorn finish startup and start accepting connections immediately, while the
    # warm-up keeps running concurrently in the background.
    asyncio.create_task(_warm_up_vector_store())
    yield
    # No shutdown-side cleanup needed — Chroma's PersistentClient and the embedding model don't
    # hold any resource that needs an explicit close.


app = FastAPI(title="UstadExam", version="1.0.0", lifespan=lifespan)

# Configure CORS for the frontend. In production (ustadexam.com, frontend+backend same origin
# behind Railway's proxy) same-origin fetches aren't subject to CORS at all, so this mainly
# matters for local dev (frontend on :5500, backend on :8000 — different origins) and any other
# legitimate cross-origin caller. Set ALLOWED_ORIGINS in the environment (comma-separated) to
# override the local-dev default — e.g. ALLOWED_ORIGINS=https://ustadexam.com,https://www.ustadexam.com
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(upload.router, prefix="/api", tags=["Upload"])
app.include_router(generate.router, prefix="/api", tags=["Generate"])
app.include_router(export.router, prefix="/api", tags=["Export"])
app.include_router(bank.router, prefix="/api", tags=["Bank"])
app.include_router(attempts.router, prefix="/api", tags=["Attempts"])
app.include_router(auth.router, prefix="/api", tags=["Auth"])

# Serve static files (for logos, etc.)
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Was at "/" — moved so the frontend can be served there instead. Kept under /api for consistency
# with every other route in this file.
@app.get("/api/status")
async def status():
    # vector_store.get_health() actively (re)attempts init if it isn't already up, subject to
    # its own retry cooldown — so polling this endpoint can't itself hammer a down dependency.
    # A degraded vector store never affects this endpoint's own 200 OK: see
    # services/vector_store.py — Chroma/embedding-model failures are isolated there on purpose,
    # so the rest of the app (this status check included) stays up regardless.
    return {
        "message": "UstadExam API is running in production (Railway)",
        "vector_store": generate.vector_store.get_health(),
    }

# ============================================================================
# TEMPORARY — Sentry verification route. Delete this once you've confirmed the
# test error actually shows up in the Sentry dashboard. Anyone can hit this
# and it does nothing useful once verified — don't leave it in production.
#
# Gated on ENVIRONMENT so it's unreachable (never even registered as a route —
# not just hidden/disabled) whenever ENVIRONMENT=production. Still worth
# deleting once verified rather than leaning on this gate long-term.
# ============================================================================
if ENVIRONMENT != "production":
    @app.get("/sentry-debug")
    async def trigger_error():
        division_by_zero = 1 / 0

# Real, separately-crawlable server-rendered routes for the public/marketing pages (Pricing,
# Features, About, and all legal docs) — see routers/pages.py for why these needed to exist as
# real URLs instead of JS-toggled panels inside index.html, and why "/" itself is deliberately
# NOT one of them (it stays the SPA's actual entry point/session-boot route below). Registered
# here, before the catch-all StaticFiles mount, so these specific paths take priority over it —
# same reasoning as /api/status and /sentry-debug above.
app.include_router(pages.router)

# Serve the frontend (plain HTML/CSS/JS, no build step) so ustadexam.com/ loads the actual UI
# instead of this API. Requires Railway's service Root Directory to be the repo root (not
# backend/), so frontend/ is actually present in the build alongside this file's parent
# directory — see railway.json at the repo root for the resulting build/start commands, which
# `cd backend` before running so everything else (relative "static" mount above, etc.) still
# resolves the same as before. If the directory really is missing (e.g. Root Directory reverted
# to backend/), StaticFiles raises at startup rather than silently serving nothing.
#
# Registered last and mounted at "/" on purpose: Starlette matches routes/mounts in registration
# order, and a mount at "/" matches any path — placed earlier, it would shadow /api/*, /static/*,
# and /api/status above. html=True makes it serve frontend/index.html for "/" (and for any
# directory-index request), so no change needed on the frontend side.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BACKEND_DIR, "..", "frontend")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    # Enable reload so changes take effect immediately
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
