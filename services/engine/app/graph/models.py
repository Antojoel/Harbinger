"""
Graph domain models
===================
Plain data structures returned by the graph layer. Kept free of any Neo4j
imports so they can be constructed in tests and serialised straight into
API responses.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Pattern:
    """A learned failure pattern from the immune-memory graph.

    Fields map 1:1 onto the ``/api/patterns`` contract in ``TASKS.md`` with a
    few extra descriptive fields that callers may ignore.
    """

    pattern_id: str
    type: str
    frequency: int
    confidence: float
    reason_code: str = ""
    detail: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Serialise to the contract shape (extra keys included, callers may drop them)."""
        return {
            "pattern_id": self.pattern_id,
            "type": self.type,
            "frequency": self.frequency,
            "confidence": self.confidence,
            "reason_code": self.reason_code,
            "detail": self.detail,
        }


@dataclass
class GraphSnapshot:
    """Node/edge snapshot formatted for the ``/api/graph`` contract."""

    nodes: list[dict[str, Any]] = field(default_factory=list)
    edges: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"nodes": self.nodes, "edges": self.edges}


def pattern_from_record(record: dict[str, Any]) -> Pattern:
    """Build a :class:`Pattern` from a Neo4j record (dict of node properties).

    Missing numeric fields fall back to safe defaults so a half-populated
    node never raises on read.
    """
    return Pattern(
        pattern_id=str(record.get("pattern_id", "")),
        type=str(record.get("type", "unknown")),
        frequency=int(record.get("frequency", 0) or 0),
        confidence=float(record.get("confidence", 0.0) or 0.0),
        reason_code=str(record.get("reason_code", "") or ""),
        detail=str(record.get("detail", "") or ""),
    )
