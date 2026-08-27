import bcrypt
import jwt
import os
import requests
from datetime import datetime, timedelta
from typing import Optional
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

# Secret is read from the environment (same pattern as GEMINI_API_KEY in backend/.env) with a
# dev-only fallback so the app still boots without extra setup — but a real deployment MUST set
# JWT_SECRET_KEY, or every restart invalidates all sessions and the fallback is guessable.
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-only-insecure-secret-set-JWT_SECRET_KEY-in-env")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 24 * 7  # 7 days

# OAuth 2.0 Web Client ID from https://console.cloud.google.com/apis/credentials — must match
# the GOOGLE_CLIENT_ID the frontend initializes Google Identity Services with (frontend/src/core/
# auth.js) or every token verification below fails with "Wrong recipient". Unset by default: a
# fresh checkout has no Google Sign-In configured, and routers/auth.py's google_auth() reports
# that explicitly (501) rather than letting verify_google_id_token() fail silently.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
# Only needed server-side, for exchange_google_auth_code() below — must never reach the
# frontend. Set alongside GOOGLE_CLIENT_ID; that Client ID's page in Google Cloud Console has a
# "Client secrets" section to generate one (values aren't re-viewable once created — regenerate
# rather than trying to recover a lost one).
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
# Reused across calls on purpose — it internally caches Google's public signing keys instead of
# refetching them on every sign-in.
_google_auth_request = google_requests.Request()


class AuthService:
    # Exposed as class attributes (rather than making callers import the module-level constants
    # directly) purely so routers/auth.py's "is Google Sign-In configured at all?" checks read
    # the same way as every other AuthService.* call they make.
    GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET = GOOGLE_CLIENT_SECRET

    @staticmethod
    def hash_password(password: str) -> str:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        if not hashed:
            return False
        try:
            return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
        except ValueError:
            return False  # malformed hash

    @staticmethod
    def create_access_token(user_id: int) -> str:
        payload = {
            "sub": str(user_id),
            "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRES_HOURS),
            "iat": datetime.utcnow(),
        }
        return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

    @staticmethod
    def decode_access_token(token: str) -> Optional[int]:
        """Returns the user id encoded in the token, or None if invalid/expired."""
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            return int(payload["sub"])
        except (jwt.PyJWTError, KeyError, ValueError):
            return None

    @staticmethod
    def verify_google_id_token(token: str) -> Optional[dict]:
        """Verifies a Google Identity Services credential against Google's public keys and our
        configured Client ID. Returns the decoded claims (sub/email/name/email_verified/...) on
        success, or None if GOOGLE_CLIENT_ID isn't configured, or the token is invalid, expired,
        or was issued for a different client."""
        if not GOOGLE_CLIENT_ID:
            return None
        try:
            return google_id_token.verify_oauth2_token(token, _google_auth_request, GOOGLE_CLIENT_ID)
        except Exception as e:
            # google-auth raises plain ValueError for most rejections (bad signature, expired,
            # wrong audience) but this guards against any transport/library error too — a failed
            # verification should always just mean "reject the sign-in", never a 500. Logged
            # (not returned to the client) purely so a real rejection reason shows up in Railway's
            # deploy logs instead of every failure looking identical from the outside.
            print(f"Google ID token verification failed: {e}")
            return None

    @staticmethod
    def exchange_google_auth_code(code: str, redirect_uri: str) -> Optional[str]:
        """First half of the classic OAuth 2.0 Authorization Code flow (see auth.js's
        loginWithGoogle() for why we use this instead of Google Identity Services' One
        Tap/FedCM prompt — the latter gets silently blocked by Brave Shields and similar).
        Trades the authorization code for an id_token by POSTing to Google's token endpoint;
        redirect_uri must be byte-identical to the one used to obtain `code` in the first place,
        or Google rejects the exchange. Returns the raw id_token JWT — still independently
        verified via verify_google_id_token() above, exactly like the old flow's credential was
        — or None if GOOGLE_CLIENT_SECRET isn't configured or the exchange fails for any reason."""
        if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
            return None
        try:
            resp = requests.post("https://oauth2.googleapis.com/token", data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            }, timeout=10)
            resp.raise_for_status()
            return resp.json().get("id_token")
        except Exception as e:
            # Same rationale as verify_google_id_token()'s catch-all: never a 500, just a
            # rejected sign-in, with the real reason logged server-side for debugging.
            print(f"Google auth code exchange failed: {e}")
            return None
