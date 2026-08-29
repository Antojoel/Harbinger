"""
Neo4j schema — the single source of truth for the immune-memory graph
====================================================================

Node labels and their key property
----------------------------------
- ``HSCode``               key ``code``          props: ``description``, ``deprecated`` (bool), ``replacement_code``
- ``Country``              key ``code``          props: ``name``            (ISO 3166-1 alpha-2, e.g. "US", "DE")
- ``CertificateRequirement`` key ``name``        props: ``issuing_body``
- ``DocumentType``         key ``name``          props: ``label``           (e.g. "commercial_invoice")
- ``RejectionReason``      key ``reason_code``   props: ``description``
- ``Shipment``             key ``shipment_id``   props: ``status``          ("pending" | "cleared" | "held")
- ``Pattern``              key ``pattern_id``    props: ``type``, ``frequency`` (int), ``confidence`` (float 0-1),
                                                        ``reason_code``, ``detail``

Relationships
-------------
Canonical (from TASKS.md V2):
- ``(HSCode)-[:REQUIRES {destination_country}]->(CertificateRequirement)``
      ``destination_country`` null => required for every destination.
- ``(DocumentType)-[:CONTRADICTS]->(DocumentType)``
- ``(Pattern)-[:CAUSED_REJECTION]->(RejectionReason)``
- ``(Shipment)-[:MATCHES]->(Pattern)``
- ``(RejectionReason)-[:RESOLVED_BY]->(CertificateRequirement)``  (or ``DocumentType``)

Structural (added by V2 — needed to connect shipments to codes/countries so
patterns can be filtered by HS code / country; flagged to Anto):
- ``(Shipment)-[:DECLARES_HS]->(HSCode)``
- ``(Shipment)-[:DESTINED_FOR]->(Country)``

Snapshot node id scheme: ``f"{Label}:{keyValue}"`` e.g. ``"HSCode:8471.30"``,
``"Pattern:PAT-001"``.
"""

from __future__ import annotations

from typing import Any

# Key property per node label, used to build stable snapshot ids.
KEY_PROPERTY: dict[str, str] = {
    "HSCode": "code",
    "Country": "code",
    "CertificateRequirement": "name",
    "DocumentType": "name",
    "RejectionReason": "reason_code",
    "Shipment": "shipment_id",
    "Pattern": "pattern_id",
}

# Preferred label when a node carries more than one.
_LABEL_PRIORITY = list(KEY_PROPERTY.keys())


def primary_label(labels: list[str]) -> str:
    """Pick the most specific known label from a node's label list."""
    for label in _LABEL_PRIORITY:
        if label in labels:
            return label
    return labels[0] if labels else "Node"


def node_id(label: str, props: dict[str, Any]) -> str:
    """Stable id for the ``/api/graph`` snapshot, e.g. ``"HSCode:8471.30"``."""
    key = KEY_PROPERTY.get(label)
    value = props.get(key) if key else None
    if value is None:
        value = props.get("name") or props.get("id") or "unknown"
    return f"{label}:{value}"


def node_label_text(label: str, props: dict[str, Any]) -> str:
    """Human-friendly label for a snapshot node."""
    for candidate in (
        "label",
        "description",
        "name",
        "reason_code",
        "code",
        "shipment_id",
        "pattern_id",
        "type",
    ):
        if props.get(candidate):
            return str(props[candidate])
    return label


# Bayesian-style smoothing constant for confidence:
#   confidence = frequency / (frequency + CONFIDENCE_PRIOR)
# A brand-new pattern (frequency 1) starts at 0.25 and asymptotes toward 1.0.
CONFIDENCE_PRIOR = 3

# Uniqueness constraints. Creating a constraint also creates the backing index,
# so lookups on these keys are fast. Idempotent (``IF NOT EXISTS``).
CONSTRAINTS: tuple[str, ...] = (
    "CREATE CONSTRAINT hs_code_key IF NOT EXISTS FOR (n:HSCode) REQUIRE n.code IS UNIQUE",
    "CREATE CONSTRAINT country_key IF NOT EXISTS FOR (n:Country) REQUIRE n.code IS UNIQUE",
    (
        "CREATE CONSTRAINT certificate_key IF NOT EXISTS "
        "FOR (n:CertificateRequirement) REQUIRE n.name IS UNIQUE"
    ),
    (
        "CREATE CONSTRAINT document_type_key IF NOT EXISTS "
        "FOR (n:DocumentType) REQUIRE n.name IS UNIQUE"
    ),
    (
        "CREATE CONSTRAINT rejection_reason_key IF NOT EXISTS "
        "FOR (n:RejectionReason) REQUIRE n.reason_code IS UNIQUE"
    ),
    (
        "CREATE CONSTRAINT shipment_key IF NOT EXISTS "
        "FOR (n:Shipment) REQUIRE n.shipment_id IS UNIQUE"
    ),
    (
        "CREATE CONSTRAINT pattern_key IF NOT EXISTS "
        "FOR (n:Pattern) REQUIRE n.pattern_id IS UNIQUE"
    ),
)


def confidence_for(frequency: int) -> float:
    """Confidence score for a pattern seen ``frequency`` times, rounded to 2dp."""
    if frequency <= 0:
        return 0.0
    return round(frequency / (frequency + CONFIDENCE_PRIOR), 2)
