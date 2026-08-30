"""
Build the spoken risk answer for a shipment.

Deterministic and local: reads the shipment's status and matched patterns
straight from the immune-memory graph (via ``graph_client.execute_read``, the
public generic helper — no change to the graph domain interface) and phrases a
short sentence suitable for text-to-speech. No LLM in this path.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from graph.neo4j_client import graph_client

logger = logging.getLogger("harbinger.voice")

# Risk bands keyed off the highest matched-pattern confidence.
_HIGH = 0.75
_ELEVATED = 0.4

_SHIPMENT_RISK_QUERY = """
MATCH (s:Shipment {shipment_id: $shipment_id})
OPTIONAL MATCH (s)-[:MATCHES]->(p:Pattern)
RETURN s.status AS status,
       collect({
         pattern_id: p.pattern_id,
         type: p.type,
         detail: p.detail,
         confidence: coalesce(p.confidence, 0.0)
       }) AS patterns
"""

# Everything the graph knows that bears on *why* this shipment is at risk and
# what would resolve it: the declared HS code (and whether it's been
# superseded), the destination, the certificates that HS code / destination
# combination requires, and for each matched failure pattern the rejection
# reason it causes, what resolves that reason, and how many other shipments
# in the graph have hit the same pattern. Without this the model only sees
# "pattern X, confidence Y" and cannot reason about a fix.
_SHIPMENT_CONTEXT_QUERY = """
MATCH (s:Shipment {shipment_id: $shipment_id})
OPTIONAL MATCH (s)-[:DECLARES_HS]->(h:HSCode)
OPTIONAL MATCH (s)-[:DESTINED_FOR]->(c:Country)
OPTIONAL MATCH (h)-[req:REQUIRES]->(cert:CertificateRequirement)
  WHERE req.destination_country IS NULL OR c IS NULL
     OR req.destination_country = c.code
RETURN h.code               AS hs_code,
       h.description        AS hs_description,
       coalesce(h.deprecated, false) AS hs_deprecated,
       h.replacement_code   AS hs_replacement,
       c.code               AS country_code,
       c.name               AS country_name,
       collect(DISTINCT {
         name: cert.name,
         issuing_body: cert.issuing_body
       })                   AS required_certificates
"""

# Same lane rules, resolved without a Shipment node — dashboard shipments
# live in core.shipment_store and only ever consult the graph for rules.
_LANE_CONTEXT_QUERY = """
MATCH (h:HSCode {code: $hs_code})
OPTIONAL MATCH (c:Country {code: $country})
OPTIONAL MATCH (h)-[req:REQUIRES]->(cert:CertificateRequirement)
  WHERE $country IS NULL OR req.destination_country IS NULL
     OR req.destination_country = $country
RETURN h.code               AS hs_code,
       h.description        AS hs_description,
       coalesce(h.deprecated, false) AS hs_deprecated,
       h.replacement_code   AS hs_replacement,
       c.name               AS country_name,
       collect(DISTINCT {
         name: cert.name,
         issuing_body: cert.issuing_body
       })                   AS required_certificates
"""

# What the graph knows about a set of rejection reasons: the reason itself,
# what resolves it, and the learned pattern's frequency/confidence.
_REASON_CONTEXT_QUERY = """
UNWIND $reason_codes AS code
MATCH (r:RejectionReason {reason_code: code})
OPTIONAL MATCH (r)-[:RESOLVED_BY]->(fix:CertificateRequirement)
OPTIONAL MATCH (p:Pattern {reason_code: code})
RETURN code                             AS reason_code,
       r.description                    AS reason_description,
       p.type                           AS type,
       p.detail                         AS detail,
       coalesce(p.confidence, 0.0)      AS confidence,
       coalesce(p.frequency, 0)         AS frequency,
       collect(DISTINCT fix.name)       AS resolved_by
"""

_PATTERN_CONTEXT_QUERY = """
MATCH (s:Shipment {shipment_id: $shipment_id})-[:MATCHES]->(p:Pattern)
OPTIONAL MATCH (p)-[:CAUSED_REJECTION]->(r:RejectionReason)
OPTIONAL MATCH (r)-[:RESOLVED_BY]->(fix:CertificateRequirement)
OPTIONAL MATCH (other:Shipment)-[:MATCHES]->(p)
RETURN p.pattern_id                     AS pattern_id,
       p.type                           AS type,
       p.detail                         AS detail,
       coalesce(p.confidence, 0.0)      AS confidence,
       coalesce(p.frequency, 0)         AS frequency,
       r.reason_code                    AS reason_code,
       r.description                    AS reason_description,
       collect(DISTINCT fix.name)       AS resolved_by,
       count(DISTINCT other)            AS shipments_affected
"""


def _band(confidence: float) -> str:
    if confidence >= _HIGH:
        return "high"
    if confidence >= _ELEVATED:
        return "elevated"
    return "low"


def fetch_shipment_facts(shipment_id: str) -> dict:
    """Read a shipment's status and matched patterns straight from the graph.

    Returns ``{"exists": bool, "status": str, "patterns": [...]}`` — the same
    facts both :func:`format_heuristic_answer` and the LLM answer path
    (``voice/llm_answer.py``) are grounded in, so neither can drift from what
    the graph actually says.
    """
    rows = graph_client.execute_read(_SHIPMENT_RISK_QUERY, shipment_id=shipment_id)
    if not rows:
        return {"exists": False, "status": "", "patterns": []}

    row = rows[0]
    patterns = [p for p in (row.get("patterns") or []) if p.get("pattern_id")]
    patterns.sort(key=lambda p: p.get("confidence", 0.0), reverse=True)
    return {"exists": True, "status": (row.get("status") or "").lower(), "patterns": patterns}


def fetch_graph_context(
    shipment_id: str,
    hs_code: str = "",
    country: str = "",
    reason_codes: Optional[List[str]] = None,
) -> dict:
    """Read the knowledge-graph context that bears on one shipment.

    Two lookups, because a shipment does not have to be a node in the graph
    for the graph to know about it. Dashboard shipments live in
    ``core.shipment_store`` and only ever consult Neo4j for *rules*, so the
    context is resolved by lane (``hs_code`` + ``country``) and by the
    rejection reasons its risk check actually raised:

    * the declared HS code — description, whether it has been superseded and
      by what — plus every certificate that HS code requires into that
      destination;
    * for each raised reason code, the rejection reason itself, what the graph
      knows resolves it, and how often the matching pattern has been seen.

    ``shipment_id`` is still used first: if the shipment *is* a graph node
    (the originally seeded ones are), its own edges are the better source.
    Returns ``{}`` when the graph is unreachable or knows nothing relevant,
    so callers degrade instead of failing.
    """
    context: dict = {}

    # 1. Shipment-node path — only the seeded shipments have DECLARES_HS /
    #    DESTINED_FOR edges of their own.
    rows = graph_client.execute_read(_SHIPMENT_CONTEXT_QUERY, shipment_id=shipment_id)
    if rows and rows[0].get("hs_code"):
        row = rows[0]
        certs = [c for c in (row.get("required_certificates") or []) if c.get("name")]
        context["shipment"] = {
            "hs_code": row.get("hs_code"),
            "hs_description": row.get("hs_description"),
            "hs_code_deprecated": bool(row.get("hs_deprecated")),
            "hs_replacement_code": row.get("hs_replacement"),
            "destination_country": row.get("country_name") or row.get("country_code"),
            "certificates_required_for_this_lane": certs,
        }
        pattern_rows = graph_client.execute_read(
            _PATTERN_CONTEXT_QUERY, shipment_id=shipment_id
        )
    else:
        # 2. Lane path — resolve the same rules from HS code + destination.
        pattern_rows = []
        if hs_code:
            lane_rows = graph_client.execute_read(
                _LANE_CONTEXT_QUERY, hs_code=hs_code, country=country or None
            )
            if lane_rows and lane_rows[0].get("hs_code"):
                row = lane_rows[0]
                certs = [c for c in (row.get("required_certificates") or []) if c.get("name")]
                context["shipment"] = {
                    "hs_code": row.get("hs_code"),
                    "hs_description": row.get("hs_description"),
                    "hs_code_deprecated": bool(row.get("hs_deprecated")),
                    "hs_replacement_code": row.get("hs_replacement"),
                    "destination_country": row.get("country_name") or country,
                    "certificates_required_for_this_lane": certs,
                }

    # 3. Reason-code path — what the graph knows about each issue raised.
    if not pattern_rows and reason_codes:
        pattern_rows = graph_client.execute_read(
            _REASON_CONTEXT_QUERY, reason_codes=list(reason_codes)
        )

    if pattern_rows:
        context["matched_failure_patterns"] = [
            {
                "type": r.get("type"),
                "what_went_wrong": r.get("detail") or r.get("reason_description"),
                "reason_code": r.get("reason_code"),
                "confidence_percent": round(float(r.get("confidence") or 0.0) * 100),
                "times_seen_in_graph": r.get("frequency"),
                "known_to_be_resolved_by": [f for f in (r.get("resolved_by") or []) if f],
            }
            for r in pattern_rows
        ]

    return context


def format_heuristic_answer(shipment_id: str, facts: dict) -> str:
    """Deterministic one-or-two sentence template over ``fetch_shipment_facts``."""
    if not facts.get("exists"):
        return (
            f"I don't have a record for shipment {shipment_id} yet. "
            "Run a simulation on its documents first."
        )

    patterns = facts.get("patterns") or []
    status = facts.get("status") or ""

    if not patterns:
        if status == "cleared":
            return f"Shipment {shipment_id} cleared customs with no flagged issues."
        return f"Shipment {shipment_id} has no known hold risks on record."

    top = patterns[0]
    top_confidence = float(top.get("confidence", 0.0))
    percent = round(top_confidence * 100)
    band = _band(top_confidence)

    lead = (
        f"Shipment {shipment_id} is {band} risk, around {percent} percent. "
        f"Main issue: {top.get('detail') or top.get('type')}."
    )
    if len(patterns) > 1:
        lead += f" {len(patterns) - 1} more issue"
        lead += "s." if len(patterns) - 1 > 1 else "."
    if status == "held":
        lead += " This shipment is currently held."
    return lead


def build_spoken_answer(shipment_id: str, transcript: str) -> str:
    """Return a one-or-two sentence spoken answer about the shipment's hold risk.

    ``transcript`` is currently only used for logging — the answer is driven by
    the graph, not by parsing the question — but it is part of the signature so
    a future intent classifier can slot in here. See ``voice/llm_answer.py``
    for the alternative that does read the question, via an LLM.
    """
    shipment_id = (shipment_id or "").strip()
    if not shipment_id:
        return "I need a shipment number to check the hold risk."

    logger.info("voice answer for %s (asked: %r)", shipment_id, transcript[:120])

    facts = fetch_shipment_facts(shipment_id)
    return format_heuristic_answer(shipment_id, facts)
