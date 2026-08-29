"""
Google Sign-In (ID token verification) + our own session tokens.
==================================================================
Frontend uses Google Identity Services to get an ID token directly from
Google — we never see the user's Google password, only verify the token's
signature and audience server-side. On success we issue our OWN short-lived
session JWT (signed with SESSION_SECRET) so the rest of the app doesn't
need to re-verify against Google on every request.

Degrades gracefully: if GOOGLE_CLIENT_ID isn't set, is_configured() is
False and the frontend falls back to a "Continue as Guest" flow instead of
a hard login wall — same pattern as the Razorpay integration.
"""

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

logger = logging.getLogger("harbinger.auth")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
SESSION_SECRET = os.getenv("SESSION_SECRET") or "dev-only-insecure-secret-set-SESSION_SECRET-in-env"
SESSION_TTL_HOURS = 24 * 7

if not os.getenv("SESSION_SECRET"):
    logger.warning("SESSION_SECRET not set - using an insecure dev default. Set it in .env for anything beyond a demo.")


def is_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID)


def verify_google_id_token(token: str) -> Dict[str, Any]:
    """Verifies a Google ID token's signature and audience. Raises
    ValueError on any failure - callers should turn that into a 401."""
    if not is_configured():
        raise ValueError("Google login is not configured")
    claims = google_id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
    return {
        "sub": claims["sub"],
        "email": claims.get("email", ""),
        "name": claims.get("name", claims.get("email", "User")),
        "picture": claims.get("picture", ""),
    }


def issue_session_token(user_id: str, email: str, name: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "exp": datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SESSION_SECRET, algorithm="HS256")


def verify_session_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, SESSION_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def new_guest_id() -> str:
    return f"guest-{uuid.uuid4().hex[:12]}"
