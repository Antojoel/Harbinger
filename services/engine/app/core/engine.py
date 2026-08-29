"""
Core Engine Module for Harbinger
================================
Implements trade document simulation, contradiction detection (unit mismatch,
missing certificates, HS code mismatch), outcome recording, and graph snapshot
extraction by interfacing with graph_client (Neo4j).
"""

import logging
from typing import Dict, Any, List, Optional
from graph.neo4j_client import graph_client

logger = logging.getLogger("engine")


def _get_doc(documents: Dict[str, Any], *names: str) -> Optional[Dict[str, Any]]:
    """Helper to retrieve a document dict from the documents dictionary by candidate names."""
    if not isinstance(documents, dict):
        return None
    for name in names:
        doc = documents.get(name)
        if isinstance(doc, dict):
            return doc
    return None


def _get_field(doc: Optional[Dict[str, Any]], *keys: str) -> Any:
    """Helper to extract a field value from a document dict using candidate keys."""
    if not isinstance(doc, dict):
        return None
    for key in keys:
        if key in doc and doc[key] is not None:
            return doc[key]
    return None


def simulate(shipment_docs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Simulates customs clearance for a shipment by evaluating uploaded trade documents
    against Neo4j graph rules and historical rejection patterns.

    Args:
        shipment_docs (dict): Payload containing shipment_id and documents = {
                              commercial_invoice, packing_list, bill_of_lading,
                              certificate_of_origin}.

    Returns:
        dict: Exact shape:
              {
                "shipment_id": str,
                "risk_score": float,
                "reasons": [{"code": str, "detail": str}, ...],
                "matched_patterns": [pattern_id, ...]
              }
    """
    shipment_id = str(shipment_docs.get("shipment_id") or shipment_docs.get("id") or "MSKU1234567")
    raw_docs = shipment_docs.get("documents")
    documents = raw_docs if isinstance(raw_docs, dict) else {}

    commercial_invoice = _get_doc(documents, "commercial_invoice", "invoice")
    packing_list = _get_doc(documents, "packing_list", "packing")
    bill_of_lading = _get_doc(documents, "bill_of_lading", "bol")
    certificate_of_origin = _get_doc(documents, "certificate_of_origin", "coo", "certificate")

    # Extract HS Code and Destination Country for graph lookup
    hs_code = str(
        _get_field(commercial_invoice, "hs_code", "hts_code", "hscode") or
        _get_field(packing_list, "hs_code", "hts_code", "hscode") or
        _get_field(bill_of_lading, "hs_code", "hts_code", "hscode") or
        shipment_docs.get("hs_code") or ""
    ).strip()

    country = str(
        _get_field(commercial_invoice, "country", "destination_country", "destination") or
        shipment_docs.get("country") or
        shipment_docs.get("destination_country") or ""
    ).strip()

    reasons: List[Dict[str, str]] = []
    has_unit_mismatch = False
    has_hs_mismatch = False
    req_certs: List[Dict[str, Any]] = []

    # 1. Check UNIT_MISMATCH: commercial_invoice.units != packing_list.units
    if commercial_invoice and packing_list:
        ci_units = _get_field(commercial_invoice, "units", "unit_count", "quantity", "pieces")
        pl_units = _get_field(packing_list, "units", "unit_count", "quantity", "pieces")

        if ci_units is not None and pl_units is not None and str(ci_units) != str(pl_units):
            has_unit_mismatch = True
            reasons.append({
                "code": "UNIT_MISMATCH",
                "detail": f"Commercial Invoice lists {ci_units} units, Packing List lists {pl_units} units — mismatch detected"
            })

    # 2. Check MISSING_CERTIFICATE: certificate_of_origin is None/missing AND required certs exist
    has_coo = bool(certificate_of_origin)
    if not has_coo:
        req_certs = graph_client.get_required_certificates(hs_code, country)
        if req_certs:
            cert_names = [c.get("name", "Certificate of Origin") for c in req_certs if isinstance(c, dict)]
            cert_str = ", ".join(cert_names) if cert_names else "Certificate of Origin"
            reasons.append({
                "code": "MISSING_CERTIFICATE",
                "detail": f"Required certificate ({cert_str}) is missing for HS Code '{hs_code}' to country '{country}'"
            })

    # 3. Check HS_CODE_MISMATCH: commercial_invoice.hs_code doesn't match other documents
    ci_hs = _get_field(commercial_invoice, "hs_code", "hts_code", "hscode")
    if ci_hs:
        ci_hs_str = str(ci_hs).strip()
        other_docs = [
            ("Packing List", packing_list),
            ("Bill of Lading", bill_of_lading),
            ("Certificate of Origin", certificate_of_origin),
        ]
        for doc_name, doc in other_docs:
            if doc:
                other_hs = _get_field(doc, "hs_code", "hts_code", "hscode")
                if other_hs and str(other_hs).strip() != ci_hs_str:
                    has_hs_mismatch = True
                    reasons.append({
                        "code": "HS_CODE_MISMATCH",
                        "detail": f"Commercial Invoice HS code '{ci_hs_str}' contradicts {doc_name} HS code '{other_hs}'"
                    })
                    break

    # Build signal dict for pattern matching
    missing_cert_names = [c.get("name", "Certificate of Origin") for c in req_certs] if (not has_coo and req_certs) else []
    signal = {
        "unit_mismatch": has_unit_mismatch,
        "missing_certs": missing_cert_names,
        "hs_code_mismatch": has_hs_mismatch,
    }

    # Query graph for matching historical risk patterns
    matched_patterns_raw = graph_client.find_matching_patterns(hs_code, country, signal)
    matched_pattern_ids = [
        p["pattern_id"] for p in matched_patterns_raw if isinstance(p, dict) and "pattern_id" in p
    ]

    # Append pattern reason details if matched
    for pat in matched_patterns_raw:
        if isinstance(pat, dict) and pat.get("detail"):
            reasons.append({
                "code": pat.get("reason_code", "HISTORICAL_PATTERN_MATCH"),
                "detail": str(pat["detail"])
            })

    # Compute risk score (0.0 - 1.0) based on detected issues & pattern confidence
    base_issue_risk = len(reasons) * 0.3
    pattern_risk = sum(
        p.get("confidence", 0.5) for p in matched_patterns_raw if isinstance(p, dict)
    ) * 0.2 if matched_patterns_raw else 0.0

    risk_score = round(min(1.0, max(0.0, base_issue_risk + pattern_risk)), 2)

    return {
        "shipment_id": shipment_id,
        "risk_score": risk_score,
        "reasons": reasons,
        "matched_patterns": matched_pattern_ids
    }


def record_outcome(shipment_id: str, actual_outcome: Dict[str, Any]) -> Dict[str, Any]:
    """
    Records the actual customs outcome for a shipment to reinforce or create Pattern nodes/edges
    in Neo4j ("immune memory growing" mechanic).

    Args:
        shipment_id (str): The ID of the shipment (e.g. 'MSKU1234567').
        actual_outcome (dict): Contains was_held (bool) and reason_code (str, optional).

    Returns:
        dict: Exact shape:
              {"status": "recorded", "pattern_updated": bool, "new_nodes": [...], "new_edges": [...]}
    """
    if not isinstance(actual_outcome, dict):
        actual_outcome = {}

    was_held = bool(actual_outcome.get("was_held"))
    reason_code = actual_outcome.get("reason_code")

    if was_held and reason_code:
        detail = actual_outcome.get("detail") or f"Customs hold recorded for shipment {shipment_id} due to {reason_code}"
        res = graph_client.record_pattern(
            reason_code=str(reason_code),
            detail=str(detail),
            shipment_context={"shipment_id": shipment_id}
        )
        new_nodes = res.get("new_nodes", []) if isinstance(res, dict) else []
        new_edges = res.get("new_edges", []) if isinstance(res, dict) else []
        pattern_id = res.get("pattern_id") if isinstance(res, dict) else None
        pattern_updated = bool(pattern_id or new_nodes or new_edges)

        return {
            "status": "recorded",
            "pattern_updated": pattern_updated,
            "new_nodes": new_nodes,
            "new_edges": new_edges
        }

    return {
        "status": "recorded",
        "pattern_updated": False,
        "new_nodes": [],
        "new_edges": []
    }


def query_patterns(filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Queries historical rejection and resolution patterns stored in the graph.

    Args:
        filters (dict, optional): Optional filter parameters (e.g. hs_code, country).

    Returns:
        list[dict]: Bare list of matched risk patterns returned from graph_client.list_patterns.
    """
    if filters is None:
        filters = {}
    hs_code = filters.get("hs_code")
    country = filters.get("country")
    return graph_client.list_patterns(hs_code=hs_code, country=country)


def graph_snapshot() -> Dict[str, Any]:
    """
    Returns a complete node & edge snapshot of the Neo4j knowledge graph formatted for
    frontend visualization.

    Returns:
        dict: Object with 'nodes' list and 'edges' list from graph_client.get_graph_snapshot().
    """
    return graph_client.get_graph_snapshot()
