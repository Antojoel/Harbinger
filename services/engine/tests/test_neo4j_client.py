"""Tests for GraphClient behaviour without a live Neo4j (degraded mode)."""

from __future__ import annotations

import pytest
from graph import neo4j_client
from graph.models import Pattern, pattern_from_record
from neo4j.exceptions import Neo4jError, ServiceUnavailable


class _FakeSession:
    """Stands in for driver.session()'s context manager."""

    def __init__(self, *, raises: Exception | None = None, rows: list | None = None):
        self._raises = raises
        self._rows = rows if rows is not None else []

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def execute_read(self, work):
        if self._raises:
            raise self._raises
        return self._rows

    def execute_write(self, work):
        return self.execute_read(work)


class _FakeDriver:
    def __init__(self, session: _FakeSession):
        self._session = session
        self.closed = False

    def session(self, database=None):
        return self._session

    def close(self):
        self.closed = True


@pytest.fixture
def degraded_client(monkeypatch):
    """A GraphClient guaranteed to stay degraded, regardless of whether a
    real Neo4j happens to be reachable at the default URI in this
    environment - GraphClient now lazily retries connect() on the next
    query whenever its driver is unset (see the reconnect fix below), so
    without pointing at a genuinely unreachable address these tests would
    silently connect to a live Neo4j and stop testing degraded-mode
    behavior at all."""
    monkeypatch.setattr(neo4j_client, "NEO4J_URI", "bolt://127.0.0.1:59999")
    client = neo4j_client.GraphClient()
    assert not client.is_connected
    return client


@pytest.mark.unit
class TestDegradedMode:
    def test_connect_never_raises_when_db_absent(self, monkeypatch):
        monkeypatch.setattr(neo4j_client, "NEO4J_URI", "bolt://127.0.0.1:59999")
        client = neo4j_client.GraphClient()

        client.connect()  # must not raise

        assert client.is_connected is False

    def test_reads_return_empty(self, degraded_client):
        assert degraded_client.execute_read("MATCH (n) RETURN n") == []
        assert degraded_client.list_patterns() == []
        assert degraded_client.graph_snapshot().to_dict() == {"nodes": [], "edges": []}

    def test_find_matching_patterns_still_detects_document_contradictions(
        self, degraded_client
    ):
        documents = {
            "commercial_invoice": {"units": 500, "hs_code": "8471.30"},
            "packing_list": {"units": 480},
            "certificate_of_origin": None,
        }

        patterns = degraded_client.find_matching_patterns("8471.30", "DE", documents)

        assert [p.reason_code for p in patterns] == ["UNIT_MISMATCH"]
        assert patterns[0].detail == "Invoice lists 500 units, Packing List lists 480"
        assert 0.0 < patterns[0].confidence <= 1.0

    def test_record_pattern_returns_synthetic_pattern(self, degraded_client):
        pattern = degraded_client.record_pattern(
            "MISSING_CERTIFICATE", {"shipment_id": "MSKU1", "detail": "no CoO"}
        )

        assert isinstance(pattern, Pattern)
        assert pattern.type == "missing_certificate"
        assert pattern.reason_code == "MISSING_CERTIFICATE"
        assert pattern.frequency == 1

    def test_close_is_idempotent(self, degraded_client):
        degraded_client.close()
        degraded_client.close()


@pytest.mark.unit
class TestReconnect:
    """Neo4j restarting mid-session (e.g. a container recreate) used to
    leave the engine degraded forever - nothing ever invalidated the old
    driver or retried connect(). Confirmed live: /api/patterns stayed
    empty until a manual `docker-compose restart engine`. These test the
    fix: ServiceUnavailable drops the stale driver, and the next query
    lazily (and rate-limited) retries connect()."""

    def test_service_unavailable_invalidates_the_driver(self):
        client = neo4j_client.GraphClient()
        fake_driver = _FakeDriver(_FakeSession(raises=ServiceUnavailable("down")))
        client._driver = fake_driver

        result = client.execute_read("MATCH (n) RETURN n")

        assert result == []
        assert fake_driver.closed is True
        assert client._driver is None

    def test_generic_query_error_does_not_invalidate_the_driver(self):
        """A bad Cypher statement isn't a connectivity problem - the pool is
        still fine, so don't throw away a healthy driver over it."""
        client = neo4j_client.GraphClient()
        fake_driver = _FakeDriver(_FakeSession(raises=Neo4jError("syntax error")))
        client._driver = fake_driver

        result = client.execute_read("NOT VALID CYPHER")

        assert result == []
        assert client._driver is fake_driver

    def test_next_query_lazily_retries_connect_once_degraded(self, monkeypatch):
        client = neo4j_client.GraphClient()
        client._driver = None
        calls = []
        monkeypatch.setattr(client, "connect", lambda: calls.append(1))

        client.execute_read("MATCH (n) RETURN n")

        assert calls == [1]

    def test_reconnect_attempts_are_rate_limited(self, monkeypatch):
        """A sustained outage shouldn't turn every request into a blocking
        connect() call - only retry after the cooldown elapses."""
        client = neo4j_client.GraphClient()
        client._driver = None
        calls = []
        monkeypatch.setattr(client, "connect", lambda: calls.append(1))

        client.execute_read("MATCH (n) RETURN n")
        client.execute_read("MATCH (n) RETURN n")

        assert calls == [1]

    def test_reconnect_success_resumes_normal_queries(self, monkeypatch):
        client = neo4j_client.GraphClient()
        client._driver = None
        good_driver = _FakeDriver(_FakeSession(rows=[{"ok": True}]))

        def fake_connect():
            client._driver = good_driver

        monkeypatch.setattr(client, "connect", fake_connect)

        result = client.execute_read("MATCH (n) RETURN n")

        assert result == [{"ok": True}]
        assert client._driver is good_driver


@pytest.mark.unit
class TestNormaliseReasonCode:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("missing certificate", "MISSING_CERTIFICATE"),
            ("Missing-Certificate", "MISSING_CERTIFICATE"),
            ("unit__mismatch", "UNIT_MISMATCH"),
            ("  hs/code/mismatch  ", "HS_CODE_MISMATCH"),
            ("", "UNKNOWN"),
        ],
    )
    def test_normalises(self, raw, expected):
        assert neo4j_client._normalise_reason_code(raw) == expected


@pytest.mark.unit
class TestPatternModel:
    def test_pattern_from_record_fills_defaults(self):
        pattern = pattern_from_record({"pattern_id": "PAT-9", "type": "x"})

        assert pattern.frequency == 0
        assert pattern.confidence == 0.0

    def test_to_dict_round_trips_contract_fields(self):
        pattern = Pattern("PAT-1", "unit_mismatch", 14, 0.82, "UNIT_MISMATCH", "d")

        assert pattern.to_dict() == {
            "pattern_id": "PAT-1",
            "type": "unit_mismatch",
            "frequency": 14,
            "confidence": 0.82,
            "reason_code": "UNIT_MISMATCH",
            "detail": "d",
        }
