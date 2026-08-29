"""
Neo4j Graph Client — Harbinger immune-memory graph
==================================================
Owns the Neo4j connection and every Cypher query the core engine
(``services/engine/app/core/engine.py``) calls into.

Design contract with the rest of the team
-----------------------------------------
- ``connect()`` / ``close()`` are called by ``main.py`` on startup/shutdown and
  must never raise. If Neo4j is unreachable the client stays in a *degraded*
  mode: reads return empty results, writes are logged and skipped, so the stub
  API keeps serving Harish's frontend regardless of DB state.
- The four domain calls Anto's engine uses are exposed both as methods on the
  singleton ``graph_client`` and as module-level functions:
  ``find_matching_patterns``, ``record_pattern``, ``list_patterns``,
  ``graph_snapshot``.

See ``schema.py`` for the node/edge model.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from graph import rules
from graph.models import GraphSnapshot, Pattern, pattern_from_record
from graph.schema import (
    CONFIDENCE_PRIOR,
    CONSTRAINTS,
    confidence_for,
    node_id,
    node_label_text,
    primary_label,
)
from neo4j import Driver, GraphDatabase
from neo4j.exceptions import Neo4jError, ServiceUnavailable

logger = logging.getLogger("harbinger.graph")

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")

# Connection pool lifetime / acquisition timeouts (seconds).
_CONNECTION_TIMEOUT = 15
_MAX_TRANSACTION_RETRY_TIME = 15

# ---------------------------------------------------------------------------
# Cypher
# ---------------------------------------------------------------------------

_HS_RULES_QUERY = """
MATCH (h:HSCode {code: $hs_code})
OPTIONAL MATCH (h)-[r:REQUIRES]->(c:CertificateRequirement)
WHERE r.destination_country IS NULL OR r.destination_country = $country
RETURN coalesce(h.deprecated, false)      AS deprecated,
       h.replacement_code                 AS replacement_code,
       collect(DISTINCT c.name)           AS required_certificates
"""

_PATTERN_BY_TYPE_QUERY = """
MATCH (p:Pattern {type: $type})
RETURN p.pattern_id AS pattern_id, p.type AS type, p.frequency AS frequency,
       p.confidence AS confidence, p.reason_code AS reason_code, p.detail AS detail
ORDER BY coalesce(p.confidence, 0) DESC
LIMIT 1
"""

_RECORD_PATTERN_QUERY = """
MATCH (existing:Pattern)
WITH count(existing) AS pattern_count
MERGE (p:Pattern {type: $type})
  ON CREATE SET p.pattern_id = 'PAT-' + toString(100 + pattern_count),
                p.frequency  = 1,
                p.detail     = coalesce($detail, $fallback_detail),
                p.reason_code = $reason_code
  ON MATCH SET  p.frequency  = p.frequency + 1,
                p.detail     = coalesce($detail, p.detail)
SET p.confidence = round(1.0 * p.frequency / (p.frequency + $prior), 2)
WITH p
MERGE (rr:RejectionReason {reason_code: $reason_code})
  ON CREATE SET rr.description = coalesce($detail, $fallback_detail)
MERGE (p)-[:CAUSED_REJECTION]->(rr)
WITH p
FOREACH (_ IN CASE WHEN $shipment_id IS NULL THEN [] ELSE [1] END |
  MERGE (s:Shipment {shipment_id: $shipment_id})
    ON CREATE SET s.status = coalesce($shipment_status, 'held')
    ON MATCH  SET s.status = coalesce($shipment_status, s.status)
  MERGE (s)-[:MATCHES]->(p)
)
RETURN p.pattern_id AS pattern_id, p.type AS type, p.frequency AS frequency,
       p.confidence AS confidence, p.reason_code AS reason_code, p.detail AS detail
"""

_LIST_PATTERNS_QUERY = """
MATCH (p:Pattern)
OPTIONAL MATCH (s:Shipment)-[:MATCHES]->(p)
OPTIONAL MATCH (s)-[:DECLARES_HS]->(h:HSCode)
OPTIONAL MATCH (s)-[:DESTINED_FOR]->(co:Country)
WITH p,
     collect(DISTINCT h.code)  AS hs_codes,
     collect(DISTINCT co.code) AS countries
WHERE ($hs_code IS NULL OR $hs_code IN hs_codes)
  AND ($country IS NULL OR $country IN countries)
RETURN p.pattern_id AS pattern_id, p.type AS type, p.frequency AS frequency,
       p.confidence AS confidence, p.reason_code AS reason_code, p.detail AS detail
ORDER BY coalesce(p.frequency, 0) DESC
"""

_SNAPSHOT_NODES_QUERY = """
MATCH (n)
RETURN elementId(n) AS eid, labels(n) AS labels, properties(n) AS props
"""

_SNAPSHOT_EDGES_QUERY = """
MATCH (a)-[r]->(b)
RETURN elementId(a) AS from_eid, elementId(b) AS to_eid, type(r) AS type
"""

# reason_code -> pattern ``type`` (also the seeded Pattern.type values).
_REASON_TO_TYPE = {
    rules.REASON_UNIT_MISMATCH: "unit_mismatch",
    rules.REASON_MISSING_CERTIFICATE: "missing_certificate",
    rules.REASON_HS_CODE_DEPRECATED: "hs_code_deprecated",
    rules.REASON_HS_CODE_MISMATCH: "hs_code_mismatch",
}

# Confidence assigned to a triggered condition that has no Pattern node yet.
_EPHEMERAL_CONFIDENCE = 0.3


class GraphClient:
    """Thin wrapper around the Neo4j driver with the Harbinger domain queries."""

    def __init__(self) -> None:
        self._driver: Driver | None = None

    # -- connection lifecycle ------------------------------------------------

    def connect(self) -> None:
        """Open the driver pool and verify connectivity. Never raises."""
        if self._driver is not None:
            return
        try:
            driver = GraphDatabase.driver(
                NEO4J_URI,
                auth=(NEO4J_USER, NEO4J_PASSWORD),
                connection_timeout=_CONNECTION_TIMEOUT,
                max_transaction_retry_time=_MAX_TRANSACTION_RETRY_TIME,
            )
            driver.verify_connectivity()
        except (ServiceUnavailable, Neo4jError, OSError) as exc:
            logger.warning(
                "Neo4j unavailable at %s (%s). Graph layer running in degraded "
                "mode: reads return empty, writes are skipped.",
                NEO4J_URI,
                exc.__class__.__name__,
            )
            self._driver = None
            return
        self._driver = driver
        logger.info("Connected to Neo4j at %s (database=%s)", NEO4J_URI, NEO4J_DATABASE)

    def close(self) -> None:
        """Close the driver pool. Never raises."""
        if self._driver is None:
            return
        try:
            self._driver.close()
        except Neo4jError as exc:  # pragma: no cover - defensive
            logger.warning("Error while closing Neo4j driver: %s", exc)
        finally:
            self._driver = None
            logger.info("Neo4j driver closed")

    @property
    def is_connected(self) -> bool:
        return self._driver is not None

    # -- generic query helpers -------------------------------------------------

    def execute_read(self, query: str, /, **params: Any) -> list[dict[str, Any]]:
        """Run a read query in a managed transaction. ``[]`` when degraded."""
        return self._run(query, params, write=False)

    def execute_write(self, query: str, /, **params: Any) -> list[dict[str, Any]]:
        """Run a write query in a managed transaction. ``[]`` when degraded."""
        return self._run(query, params, write=True)

    def _run(
        self,
        query: str,
        params: dict[str, Any],
        *,
        write: bool,
    ) -> list[dict[str, Any]]:
        if self._driver is None:
            logger.debug(
                "Skipping %s query, Neo4j not connected", "write" if write else "read"
            )
            return []

        def work(tx: Any) -> list[dict[str, Any]]:
            result = tx.run(query, params)
            return [record.data() for record in result]

        try:
            with self._driver.session(database=NEO4J_DATABASE) as session:
                if write:
                    return session.execute_write(work)
                return session.execute_read(work)
        except (ServiceUnavailable, Neo4jError) as exc:
            logger.error("Cypher %s failed: %s", "write" if write else "read", exc)
            return []

    # -- schema --------------------------------------------------------------

    def apply_constraints(self) -> None:
        """Create the uniqueness constraints from ``schema.CONSTRAINTS``."""
        for statement in CONSTRAINTS:
            self.execute_write(statement)
        logger.info("Applied %d Neo4j constraints", len(CONSTRAINTS))

    # -- domain queries ----------------------------------------------------

    def find_matching_patterns(
        self,
        hs_code: str,
        country: str,
        documents: dict[str, Any],
    ) -> list[Pattern]:
        """Return the failure patterns this shipment's documents trigger.

        The graph supplies the rules (deprecated codes, certificate
        requirements); :mod:`graph.rules` applies them to ``documents``. Each
        triggered condition is resolved to its stored :class:`Pattern` (or an
        ephemeral low-confidence one when the graph has not learned it yet).
        """
        hs_code = (hs_code or "").strip()
        country = (country or "").strip()
        rule_rows = self.execute_read(_HS_RULES_QUERY, hs_code=hs_code, country=country)
        rule = rule_rows[0] if rule_rows else {}
        required_certificates: list[str] = [
            name for name in rule.get("required_certificates", []) if name
        ]

        triggered: list[tuple[str, str]] = []

        unit_detail = rules.detect_unit_mismatch(documents)
        if unit_detail:
            triggered.append((rules.REASON_UNIT_MISMATCH, unit_detail))

        cert_detail = rules.detect_missing_certificate(required_certificates, documents)
        if cert_detail:
            triggered.append((rules.REASON_MISSING_CERTIFICATE, cert_detail))

        hs_detail = rules.detect_hs_code_deprecated(
            hs_code,
            bool(rule.get("deprecated")),
            rule.get("replacement_code"),
        )
        if hs_detail:
            triggered.append((rules.REASON_HS_CODE_DEPRECATED, hs_detail))

        mismatch_detail = rules.detect_hs_code_mismatch(documents, hs_code)
        if mismatch_detail:
            triggered.append((rules.REASON_HS_CODE_MISMATCH, mismatch_detail))

        return [self._resolve_pattern(reason, detail) for reason, detail in triggered]

    def _resolve_pattern(self, reason_code: str, detail: str) -> Pattern:
        pattern_type = _REASON_TO_TYPE.get(reason_code, reason_code.lower())
        rows = self.execute_read(_PATTERN_BY_TYPE_QUERY, type=pattern_type)
        if rows:
            stored = pattern_from_record(rows[0])
            return Pattern(
                pattern_id=stored.pattern_id or f"PAT-{pattern_type.upper()}",
                type=stored.type,
                frequency=stored.frequency,
                confidence=stored.confidence or _EPHEMERAL_CONFIDENCE,
                reason_code=reason_code,
                detail=detail,
            )
        return Pattern(
            pattern_id=f"PAT-NEW-{pattern_type.upper()}",
            type=pattern_type,
            frequency=0,
            confidence=_EPHEMERAL_CONFIDENCE,
            reason_code=reason_code,
            detail=detail,
        )

    def record_pattern(
        self,
        rejection_reason: str,
        shipment_context: dict[str, Any] | None = None,
    ) -> Pattern:
        """Reinforce (or create) the pattern for a real customs rejection.

        ``rejection_reason`` is a reason code such as ``"MISSING_CERTIFICATE"``.
        ``shipment_context`` may carry ``shipment_id``, ``status`` and ``detail``.
        Returns the updated :class:`Pattern`.
        """
        context = shipment_context or {}
        reason_code = _normalise_reason_code(rejection_reason)
        pattern_type = _REASON_TO_TYPE.get(reason_code, reason_code.lower())
        caller_detail = str(context["detail"]) if context.get("detail") else None
        fallback_detail = f"Customs rejection: {reason_code}"
        shipment_id = context.get("shipment_id")

        rows = self.execute_write(
            _RECORD_PATTERN_QUERY,
            type=pattern_type,
            reason_code=reason_code,
            detail=caller_detail,
            fallback_detail=fallback_detail,
            prior=CONFIDENCE_PRIOR,
            shipment_id=str(shipment_id) if shipment_id else None,
            shipment_status=context.get("status"),
        )
        if rows:
            return pattern_from_record(rows[0])

        # Degraded mode: hand back a best-effort object so callers still work.
        logger.warning(
            "record_pattern(%s) not persisted (Neo4j degraded); returning synthetic pattern",
            reason_code,
        )
        return Pattern(
            pattern_id=f"PAT-NEW-{pattern_type.upper()}",
            type=pattern_type,
            frequency=1,
            confidence=confidence_for(1),
            reason_code=reason_code,
            detail=caller_detail or fallback_detail,
        )

    def list_patterns(
        self,
        hs_code: str | None = None,
        country: str | None = None,
    ) -> list[Pattern]:
        """All learned patterns, optionally filtered by HS code / destination."""
        rows = self.execute_read(
            _LIST_PATTERNS_QUERY,
            hs_code=hs_code or None,
            country=country or None,
        )
        return [pattern_from_record(row) for row in rows]

    def graph_snapshot(self) -> GraphSnapshot:
        """Full node/edge snapshot for the ``/api/graph`` visualisation."""
        node_rows = self.execute_read(_SNAPSHOT_NODES_QUERY)
        edge_rows = self.execute_read(_SNAPSHOT_EDGES_QUERY)

        eid_to_id: dict[str, str] = {}
        nodes: list[dict[str, Any]] = []
        for row in node_rows:
            label = primary_label(row.get("labels", []))
            props = row.get("props", {}) or {}
            identifier = node_id(label, props)
            eid_to_id[row["eid"]] = identifier
            nodes.append(
                {
                    "id": identifier,
                    "type": label,
                    "label": node_label_text(label, props),
                }
            )

        edges: list[dict[str, Any]] = []
        for row in edge_rows:
            source = eid_to_id.get(row["from_eid"])
            target = eid_to_id.get(row["to_eid"])
            if source is None or target is None:
                continue
            edge: dict[str, Any] = {"from": source, "to": target, "type": row["type"]}
            edges.append(edge)

        return GraphSnapshot(nodes=nodes, edges=edges)


def _normalise_reason_code(raw: str) -> str:
    """``"missing certificate"`` / ``"Missing-Certificate"`` -> ``"MISSING_CERTIFICATE"``."""
    cleaned = (raw or "").strip().upper()
    for separator in (" ", "-", "/"):
        cleaned = cleaned.replace(separator, "_")
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned.strip("_") or "UNKNOWN"


# Singleton used by main.py and the core engine.
graph_client = GraphClient()


# Module-level function aliases (call these or the ``graph_client`` methods).
def find_matching_patterns(
    hs_code: str,
    country: str,
    documents: dict[str, Any],
) -> list[Pattern]:
    return graph_client.find_matching_patterns(hs_code, country, documents)


def record_pattern(
    rejection_reason: str,
    shipment_context: dict[str, Any] | None = None,
) -> Pattern:
    return graph_client.record_pattern(rejection_reason, shipment_context)


def list_patterns(
    hs_code: str | None = None,
    country: str | None = None,
) -> list[Pattern]:
    return graph_client.list_patterns(hs_code, country)


def graph_snapshot() -> GraphSnapshot:
    return graph_client.graph_snapshot()
