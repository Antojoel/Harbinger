"""
User store — in-memory, snapshotted to disk.
=============================================
Mirrors shipment_store.py's pattern (not a real database). Tracks users by
Google `sub` (or a synthetic id for guest sessions) so we can tell a
genuinely first-time user apart from a returning one, which is what drives
the onboarding walkthrough.

Snapshotted to USER_STORE_FILE on every write and reloaded at import time:
a plain in-memory dict was getting wiped on every engine container restart
(this happens a lot during active development, and would happen on any
crash/redeploy in a real run too), which logged every user out and made
the onboarding tour reappear for accounts that had already seen it. The
default path (/data/users.json) is meant to sit on a mounted volume (see
docker-compose.yml's engine service) so it survives a container recreate,
not just a process restart inside the same container.
"""

import json
import logging
import os
from typing import Any, Dict, Optional
from datetime import datetime, timezone

logger = logging.getLogger("harbinger.users")

_DATA_FILE = os.getenv("USER_STORE_FILE", "/data/users.json")

_USERS: Dict[str, Dict[str, Any]] = {}


def _load() -> None:
    if not os.path.exists(_DATA_FILE):
        return
    try:
        with open(_DATA_FILE, "r") as f:
            _USERS.update(json.load(f))
        logger.info("Loaded %d user(s) from %s", len(_USERS), _DATA_FILE)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning(
            "Could not load user store from %s (%s); starting empty", _DATA_FILE, exc
        )


def _save() -> None:
    try:
        os.makedirs(os.path.dirname(_DATA_FILE), exist_ok=True)
        with open(_DATA_FILE, "w") as f:
            json.dump(_USERS, f)
    except OSError as exc:
        logger.warning(
            "Could not persist user store to %s (%s); sessions won't survive a restart",
            _DATA_FILE,
            exc,
        )


_load()


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
    _save()
    return user, True


def mark_onboarding_seen(user_id: str) -> None:
    if user_id in _USERS:
        _USERS[user_id]["has_seen_onboarding"] = True
        _save()


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    return _USERS.get(user_id)
