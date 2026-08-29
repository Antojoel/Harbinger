"""
In-memory user store.
======================
Not a database — mirrors shipment_store.py's pattern. Tracks users by
Google `sub` (or a synthetic id for guest sessions) so we can tell a
genuinely first-time user apart from a returning one, which is what
drives the onboarding walkthrough.
"""

from typing import Any, Dict, Optional
from datetime import datetime, timezone

_USERS: Dict[str, Dict[str, Any]] = {}


def get_or_create(user_id: str, email: str, name: str, picture: str = "") -> Dict[str, Any]:
    """Returns (user, is_new_user)."""
    existing = _USERS.get(user_id)
    if existing:
        return existing, False

    user = {
        "id": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "has_seen_onboarding": False,
    }
    _USERS[user_id] = user
    return user, True


def mark_onboarding_seen(user_id: str) -> None:
    if user_id in _USERS:
        _USERS[user_id]["has_seen_onboarding"] = True


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    return _USERS.get(user_id)
