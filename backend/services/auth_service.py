import bcrypt
import jwt
import os
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
# Reused across calls on purpose — it internally caches Google's public signing keys instead of
# refetching them on every sign-in.
_google_auth_request = google_requests.Request()


class AuthService:
    # Exposed as a class attribute (rather than making callers import the module-level constant
    # directly) purely so routers/auth.py's "is Google Sign-In configured at all?" check reads
    # the same way as every other AuthService.* call it makes.
    GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID

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
        except Exception:
            # google-auth raises plain ValueError for most rejections (bad signature, expired,
            # wrong audience) but this guards against any transport/library error too — a failed
            # verification should always just mean "reject the sign-in", never a 500.
            return None
