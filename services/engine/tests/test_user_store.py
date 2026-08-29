"""Unit tests for user_store's disk persistence.

A plain in-memory dict was getting wiped on every engine container
restart/rebuild, logging every user out and re-showing the onboarding
tour to accounts that had already seen it. These tests cover the fix:
every write is snapshotted to disk, and a fresh process (simulated here
by clearing _USERS and calling _load() again) recovers it.
"""

from __future__ import annotations

import json

import pytest
from core import user_store


@pytest.fixture
def isolated_store(tmp_path, monkeypatch):
    """A user_store pointed at a scratch file, with a clean in-memory dict."""
    data_file = tmp_path / "users.json"
    monkeypatch.setattr(user_store, "_DATA_FILE", str(data_file))
    monkeypatch.setattr(user_store, "_USERS", {})
    return data_file


@pytest.mark.unit
class TestPersistence:
    def test_get_or_create_new_user_is_saved_to_disk(self, isolated_store):
        user, is_new = user_store.get_or_create("u1", "a@b.com", "Ana")

        assert is_new is True
        assert user["has_seen_onboarding"] is False
        assert isolated_store.exists()
        on_disk = json.loads(isolated_store.read_text())
        assert on_disk["u1"]["email"] == "a@b.com"

    def test_get_or_create_existing_user_returns_not_new(self, isolated_store):
        user_store.get_or_create("u1", "a@b.com", "Ana")

        user, is_new = user_store.get_or_create("u1", "a@b.com", "Ana")

        assert is_new is False
        assert user["id"] == "u1"

    def test_mark_onboarding_seen_persists_to_disk(self, isolated_store):
        user_store.get_or_create("u1", "a@b.com", "Ana")

        user_store.mark_onboarding_seen("u1")

        on_disk = json.loads(isolated_store.read_text())
        assert on_disk["u1"]["has_seen_onboarding"] is True

    def test_fresh_process_recovers_state_from_disk(self, isolated_store, monkeypatch):
        """Simulates an engine container restart: _USERS is empty again,
        but _load() (normally run once at import time) recovers it."""
        user_store.get_or_create("u1", "a@b.com", "Ana")
        user_store.mark_onboarding_seen("u1")

        monkeypatch.setattr(user_store, "_USERS", {})  # pretend it's a new process
        user_store._load()

        recovered = user_store.get_user("u1")
        assert recovered is not None
        assert recovered["has_seen_onboarding"] is True
        # And a returning login correctly sees them as not-new:
        _, is_new = user_store.get_or_create("u1", "a@b.com", "Ana")
        assert is_new is False

    def test_load_with_no_file_yet_leaves_store_empty(self, isolated_store):
        user_store._load()  # file doesn't exist yet
        assert user_store.get_user("nobody") is None

    def test_load_with_corrupt_file_degrades_to_empty(self, isolated_store):
        isolated_store.write_text("not valid json{{{")

        user_store._load()  # must not raise

        assert user_store.get_user("nobody") is None

    def test_save_failure_degrades_gracefully(self, isolated_store, monkeypatch):
        # Point at a path whose parent can never be created (nested under a file).
        blocked = isolated_store  # a file, not a directory
        blocked.write_text("{}")
        monkeypatch.setattr(user_store, "_DATA_FILE", str(blocked / "nested" / "users.json"))

        user, is_new = user_store.get_or_create("u1", "a@b.com", "Ana")  # must not raise

        assert is_new is True
        assert user["id"] == "u1"
