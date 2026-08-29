"""Tests for GraphClient behaviour without a live Neo4j (degraded mode)."""

from __future__ import annotations

import pytest
from graph import neo4j_client
from graph.models import Pattern, pattern_from_record


@pytest.fixture
def degraded_client():
    """A GraphClient that is guaranteed not connected."""
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
