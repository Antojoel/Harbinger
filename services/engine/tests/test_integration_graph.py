"""
Integration tests — require a running Neo4j.

Skipped automatically when Neo4j is unreachable. To run them::

    docker compose up -d neo4j
    NEO4J_URI=bolt://localhost:7687 python -m pytest -m integration

The suite seeds a fresh graph, so point it at a throwaway database only.
"""

from __future__ import annotations

import pytest
from graph import neo4j_client
from seed import seed_data

pytestmark = pytest.mark.integration


@pytest.fixture
def seeded_client():
    """A connected client over a freshly-seeded graph (isolated per test)."""
    probe = neo4j_client.GraphClient()
    probe.connect()
    if not probe.is_connected:
        probe.close()
        pytest.skip("Neo4j not reachable; skipping integration tests")
    probe.close()

    seed_data.seed_database(wipe=True)
    client = neo4j_client.GraphClient()
    client.connect()
    yield client
    client.close()


def test_unit_mismatch_and_missing_certificate_resolve_to_seeded_patterns(
    seeded_client,
):
    documents = {
        "commercial_invoice": {"units": 500, "hs_code": "8471.30"},
        "packing_list": {"units": 480},
        "bill_of_lading": {},
        "certificate_of_origin": None,
    }

    patterns = seeded_client.find_matching_patterns("8471.30", "DE", documents)

    by_reason = {p.reason_code: p for p in patterns}
    assert by_reason["UNIT_MISMATCH"].pattern_id == "PAT-001"
    assert by_reason["MISSING_CERTIFICATE"].pattern_id == "PAT-014"


def test_deprecated_hs_code_flagged(seeded_client):
    documents = {
        "commercial_invoice": {"units": 10, "hs_code": "8504.40"},
        "packing_list": {"units": 10},
        "certificate_of_origin": {"id": "CoO-1"},
    }

    patterns = seeded_client.find_matching_patterns("8504.40", "US", documents)

    assert [p.reason_code for p in patterns] == ["HS_CODE_DEPRECATED"]
    assert "8504.41" in patterns[0].detail


def test_clean_shipment_matches_nothing(seeded_client):
    documents = {
        "commercial_invoice": {"units": 10, "hs_code": "8504.41"},
        "packing_list": {"units": 10},
        "certificate_of_origin": {"id": "CoO-2"},
    }

    assert seeded_client.find_matching_patterns("8504.41", "IN", documents) == []


def test_record_pattern_reinforces_frequency_and_confidence(seeded_client):
    start = {p.type: p for p in seeded_client.list_patterns()}["missing_certificate"]

    updated = seeded_client.record_pattern(
        "MISSING_CERTIFICATE",
        {"shipment_id": "MSKU7654321", "detail": "CoO absent at port"},
    )

    assert updated.pattern_id == start.pattern_id
    assert updated.frequency == start.frequency + 1
    assert updated.confidence >= start.confidence


def test_record_pattern_creates_new_pattern_for_unknown_reason(seeded_client):
    created = seeded_client.record_pattern(
        "customs valuation dispute", {"shipment_id": "HLXU2223334"}
    )

    assert created.type == "customs_valuation_dispute"
    assert created.frequency == 1
    assert created.pattern_id.startswith("PAT-")


def test_list_patterns_filters_by_hs_code(seeded_client):
    ids = {p.pattern_id for p in seeded_client.list_patterns(hs_code="8471.30")}

    assert ids == {"PAT-001", "PAT-014"}


def test_graph_snapshot_shape_matches_contract(seeded_client):
    snapshot = seeded_client.graph_snapshot().to_dict()

    assert snapshot["nodes"] and snapshot["edges"]
    for node in snapshot["nodes"]:
        assert set(node) == {"id", "type", "label"}
    for edge in snapshot["edges"]:
        assert set(edge) == {"from", "to", "type"}
    assert "REQUIRES" in {e["type"] for e in snapshot["edges"]}
