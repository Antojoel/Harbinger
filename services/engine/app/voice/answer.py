"""
Build the spoken risk answer for a shipment.

Deterministic and local: reads the shipment's status and matched patterns
straight from the immune-memory graph (via ``graph_client.execute_read``, the
public generic helper — no change to the graph domain interface) and phrases a
short sentence suitable for text-to-speech. No LLM in this path.
"""

from __future__ import annotations

import logging

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


def _band(confidence: float) -> str:
    if confidence >= _HIGH:
        return "high"
    if confidence >= _ELEVATED:
        return "elevated"
    return "low"


def build_spoken_answer(shipment_id: str, transcript: str) -> str:
    """Return a one-or-two sentence spoken answer about the shipment's hold risk.

    ``transcript`` is currently only used for logging — the answer is driven by
    the graph, not by parsing the question — but it is part of the signature so
    a future intent classifier can slot in here.
    """
    shipment_id = (shipment_id or "").strip()
    if not shipment_id:
        return "I need a shipment number to check the hold risk."

    logger.info("voice answer for %s (asked: %r)", shipment_id, transcript[:120])

    rows = graph_client.execute_read(_SHIPMENT_RISK_QUERY, shipment_id=shipment_id)
    if not rows:
        return (
            f"I don't have a record for shipment {shipment_id} yet. "
            "Run a simulation on its documents first."
        )

    row = rows[0]
    patterns = [p for p in (row.get("patterns") or []) if p.get("pattern_id")]
    status = (row.get("status") or "").lower()

    if not patterns:
        if status == "cleared":
            return f"Shipment {shipment_id} cleared customs with no flagged issues."
        return f"Shipment {shipment_id} has no known hold risks on record."

    patterns.sort(key=lambda p: p.get("confidence", 0.0), reverse=True)
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
