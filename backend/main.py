from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.database import engine, Base
from routers import upload, generate, export, bank, attempts, auth
from fastapi.staticfiles import StaticFiles
import os
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

# Create DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="UstadExam", version="1.0.0")

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
    return {"message": "UstadExam API is running in production (Railway)"}

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
