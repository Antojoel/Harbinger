"""
Core Engine Module for Harbinger
================================
Orchestrates trade document simulation, outcome recording, pattern queries,
and graph snapshots by delegating to graph_client (Neo4j).

Contradiction detection (unit mismatch, missing certificate, HS code
mismatch/deprecated) is NOT duplicated here — graph_client.find_matching_patterns()
already applies graph.rules internally to the raw documents payload. This
module's job is orchestration and shaping responses to the locked API
contract in TASKS.md, not re-implementing business rules that already live
in the graph layer.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

from graph.neo4j_client import graph_client

logger = logging.getLogger("engine")


def _extract_hs_code_and_country(shipment_docs: Dict[str, Any]) -> Tuple[str, str]:
    documents = shipment_docs.get("documents") or {}
    invoice = documents.get("commercial_invoice") or {}

    hs_code = str(
        shipment_docs.get("hs_code")
        or invoice.get("hs_code")
        or ""
    ).strip()

    country = str(
        shipment_docs.get("country")
        or shipment_docs.get("destination_country")
        or ""
    ).strip()

    return hs_code, country


def simulate(shipment_docs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Simulates customs clearance for a shipment by asking the immune-memory
    graph which known failure patterns this shipment's documents trigger.

    Args:
        shipment_docs (dict): Payload containing shipment_id, documents,
                              and optionally hs_code/country (see
                              api.routes.SimulateRequest).

    Returns:
        dict: Exact locked shape:
              {"shipment_id": str, "risk_score": float,
               "reasons": [{"code": str, "detail": str}, ...],
               "matched_patterns": [pattern_id, ...]}
    """
    shipment_id = str(shipment_docs.get("shipment_id") or shipment_docs.get("id") or "MSKU1234567")
    documents = shipment_docs.get("documents") or {}
    hs_code, country = _extract_hs_code_and_country(shipment_docs)

    patterns = graph_client.find_matching_patterns(hs_code, country, documents)

    reasons = [{"code": p.reason_code, "detail": p.detail} for p in patterns]
    matched_patterns = [p.pattern_id for p in patterns]

    if patterns:
        top_confidence = max(p.confidence for p in patterns)
        # Each additional corroborating issue nudges risk up slightly, capped at 1.0
        risk_score = round(min(1.0, top_confidence + 0.05 * (len(patterns) - 1)), 2)
    else:
        risk_score = 0.0

    return {
        "shipment_id": shipment_id,
        "risk_score": risk_score,
        "reasons": reasons,
        "matched_patterns": matched_patterns,
    }


def record_outcome(shipment_id: str, actual_outcome: Dict[str, Any]) -> Dict[str, Any]:
    """
    Records the actual customs outcome for a shipment to reinforce or create
    a Pattern node in Neo4j ("immune memory growing" mechanic).

    Args:
        shipment_id (str): The ID of the shipment (e.g. 'MSKU1234567').
        actual_outcome (dict): Contains was_held (bool), reason_code (str,
                               optional), and detail (str, optional).

    Returns:
        dict: Exact locked shape:
              {"status": "recorded", "pattern_updated": bool,
               "new_nodes": [...], "new_edges": [...]}
    """
    if not isinstance(actual_outcome, dict):
        actual_outcome = {}

    was_held = bool(actual_outcome.get("was_held"))
    reason_code = actual_outcome.get("reason_code")

    if was_held and reason_code:
        shipment_context: Dict[str, Any] = {"shipment_id": shipment_id, "status": "held"}
        detail = actual_outcome.get("detail")
        if detail:
            shipment_context["detail"] = detail

        pattern = graph_client.record_pattern(str(reason_code), shipment_context)

        return {
            "status": "recorded",
            "pattern_updated": True,
            "new_nodes": [pattern.pattern_id],
            "new_edges": [
                {"from": pattern.pattern_id, "to": pattern.reason_code, "type": "CAUSED_REJECTION"}
            ],
        }

    return {
        "status": "recorded",
        "pattern_updated": False,
        "new_nodes": [],
        "new_edges": [],
    }


def query_patterns(filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Queries historical rejection and resolution patterns stored in the graph.

    Args:
        filters (dict, optional): Optional filter parameters (hs_code, country).

    Returns:
        list[dict]: Bare list of Pattern.to_dict() results.
    """
    if filters is None:
        filters = {}
    patterns = graph_client.list_patterns(
        hs_code=filters.get("hs_code"),
        country=filters.get("country"),
    )
    return [p.to_dict() for p in patterns]


def graph_snapshot() -> Dict[str, Any]:
    """
    Returns a complete node & edge snapshot of the Neo4j knowledge graph
    formatted for frontend visualization.

    Returns:
        dict: {"nodes": [...], "edges": [...]} from GraphSnapshot.to_dict().
    """
    return graph_client.graph_snapshot().to_dict()
