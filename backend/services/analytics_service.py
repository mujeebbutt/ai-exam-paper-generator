import os
import logging
import requests
from typing import Optional

# GA4 Measurement Protocol — server-side event tracking for exam_generated and
# grading_completed (see routers/generate.py and routers/attempts.py). These fire from the
# backend, not the frontend, specifically so an event isn't lost if the user closes the tab
# right after the operation succeeds — the whole point of using Measurement Protocol here
# instead of a client-side gtag() call. `sign_up` doesn't go through this: it's fired directly
# from frontend/src/core/auth.js via gtag.js, since it only ever happens right after a redirect
# the frontend is already handling synchronously.
#
# Same plain os.getenv() convention as every other credential in this project (GEMINI_API_KEY,
# JWT_SECRET_KEY, GOOGLE_CLIENT_ID/SECRET, ...) — no settings/config module exists here.
# GA4_MEASUREMENT_ID is the same "G-XXXXXXXXXX" stream ID gtag.js uses in frontend/index.html.
# GA4_API_SECRET is created separately, in GA4 Admin -> Data Streams -> (your web stream) ->
# Measurement Protocol API secrets -> Create — it must never reach the frontend, which is the
# entire reason this exchange happens server-side instead of the frontend calling this URL itself.
GA4_MEASUREMENT_ID = os.getenv("GA4_MEASUREMENT_ID")
GA4_API_SECRET = os.getenv("GA4_API_SECRET")
GA4_MP_URL = "https://www.google-analytics.com/mp/collect"


class AnalyticsService:
    """Fire-and-forget by design: every call site wraps this in FastAPI's BackgroundTasks (runs
    after the response is already sent, so it can never add latency to generation/grading), and
    every failure mode here (unconfigured, network error, bad response) is caught and logged,
    never raised — a broken/missing GA4 setup must never break the actual product feature."""

    @staticmethod
    def send_event(client_id: Optional[str], name: str, params: Optional[dict] = None) -> None:
        if not GA4_MEASUREMENT_ID or not GA4_API_SECRET:
            return  # Not configured — silent no-op, same convention as Google Sign-In's 501 gate
        if not client_id:
            # No _ga cookie was available client-side (ad blocker, cookie not set yet, etc.) —
            # GA4 requires a client_id to attribute the event to anyone, so there's nothing to send.
            logging.warning(f"GA4 event '{name}' skipped: no client_id provided")
            return
        try:
            resp = requests.post(
                GA4_MP_URL,
                params={"measurement_id": GA4_MEASUREMENT_ID, "api_secret": GA4_API_SECRET},
                json={"client_id": client_id, "events": [{"name": name, "params": params or {}}]},
                timeout=5,
            )
            # GA4 MP returns 204 on success but does NOT validate payloads in prod (only via the
            # /debug/mp/collect endpoint) — a non-204 here still means something's wrong (bad
            # measurement_id/api_secret, network proxy issue), worth logging even though the
            # event is unrecoverable either way.
            if resp.status_code != 204:
                logging.warning(f"GA4 event '{name}' returned unexpected status {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logging.error(f"GA4 event '{name}' failed to send: {e}")
