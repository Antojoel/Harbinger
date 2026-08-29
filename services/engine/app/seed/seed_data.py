"""
Neo4j seed data — Harbinger immune-memory graph
===============================================
Loads the schema constraints plus a small, demo-ready dataset covering the
three contradiction types the engine detects:

1. Unit mismatch      — Commercial Invoice vs Packing List disagree on units.
2. HS code deprecated  — declared HS code superseded under the 2026 schedule.
3. Missing certificate — HS code into this destination needs a Certificate of
   Origin and none is attached.

Run it (with the ``neo4j`` container up) from the engine ``app`` directory::

    python -m seed.seed_data            # wipes and reseeds
    python -m seed.seed_data --keep     # keep existing data, upsert seed on top

Idempotent: every write is a MERGE, so re-running converges to the same graph.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

# Allow ``python seed/seed_data.py`` as well as ``python -m seed.seed_data``.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from graph.neo4j_client import graph_client
from graph.schema import confidence_for

logger = logging.getLogger("harbinger.seed")

# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

COUNTRIES = [
    {"code": "US", "name": "United States"},
    {"code": "DE", "name": "Germany"},
    {"code": "IN", "name": "India"},
]

HS_CODES = [
    {
        "code": "8471.30",
        "description": "Portable automatic data-processing machines, <= 10 kg",
        "deprecated": False,
        "replacement_code": None,
    },
    {
        "code": "8504.40",
        "description": "Static converters (power supplies)",
        "deprecated": True,
        "replacement_code": "8504.41",
    },
    {
        "code": "8504.41",
        "description": "Static converters for telecom apparatus",
        "deprecated": False,
        "replacement_code": None,
    },
]

CERTIFICATES = [
    {"name": "Certificate of Origin", "issuing_body": "Chamber of Commerce"},
    {"name": "EUR.1 Movement Certificate", "issuing_body": "Customs Authority"},
]

DOCUMENT_TYPES = [
    {"name": "commercial_invoice", "label": "Commercial Invoice"},
    {"name": "packing_list", "label": "Packing List"},
    {"name": "bill_of_lading", "label": "Bill of Lading"},
    {"name": "certificate_of_origin", "label": "Certificate of Origin"},
]

REJECTION_REASONS = [
    {
        "reason_code": "UNIT_MISMATCH",
        "description": "Unit count differs between Commercial Invoice and Packing List",
    },
    {
        "reason_code": "HS_CODE_DEPRECATED",
        "description": "Declared HS code superseded under the current tariff schedule",
    },
    {
        "reason_code": "MISSING_CERTIFICATE",
        "description": "A certificate required for this HS code / destination is absent",
    },
]

# frequency drives confidence via schema.confidence_for().
PATTERNS = [
    {
        "pattern_id": "PAT-001",
        "type": "unit_mismatch",
        "frequency": 14,
        "reason_code": "UNIT_MISMATCH",
        "detail": "Invoice and Packing List unit counts diverge",
    },
    {
        "pattern_id": "PAT-002",
        "type": "hs_code_deprecated",
        "frequency": 8,
        "reason_code": "HS_CODE_DEPRECATED",
        "detail": "Deprecated HTS classification under 2026 US tariff schedule",
    },
    {
        "pattern_id": "PAT-014",
        "type": "missing_certificate",
        "frequency": 5,
        "reason_code": "MISSING_CERTIFICATE",
        "detail": "Certificate of Origin missing for FTA-eligible goods",
    },
]

# REQUIRES edges: HS code -> certificate, optionally scoped to a destination.
CERT_REQUIREMENTS = [
    {
        "hs_code": "8471.30",
        "certificate": "Certificate of Origin",
        "destination_country": "DE",
    },
    {
        "hs_code": "8504.41",
        "certificate": "EUR.1 Movement Certificate",
        "destination_country": "DE",
    },
]

# Shipments and the patterns they historically matched.
SHIPMENTS = [
    {
        "shipment_id": "MSKU1234567",
        "status": "held",
        "hs_code": "8471.30",
        "destination": "DE",
        "matched_patterns": ["PAT-001", "PAT-014"],
    },
    {
        "shipment_id": "MSKU7654321",
        "status": "held",
        "hs_code": "8504.40",
        "destination": "US",
        "matched_patterns": ["PAT-002"],
    },
    {
        "shipment_id": "HLXU2223334",
        "status": "held",
        "hs_code": "8471.30",
        "destination": "DE",
        "matched_patterns": ["PAT-014"],
    },
    {
        "shipment_id": "MSKU0000001",
        "status": "cleared",
        "hs_code": "8504.41",
        "destination": "IN",
        "matched_patterns": [],
    },
]

CONTRADICTING_DOCUMENTS = [("commercial_invoice", "packing_list")]

RESOLVED_BY = [("MISSING_CERTIFICATE", "Certificate of Origin")]

# ---------------------------------------------------------------------------
# Cypher
# ---------------------------------------------------------------------------

_WIPE = "MATCH (n) DETACH DELETE n"

_MERGE_COUNTRY = """
MERGE (c:Country {code: $code})
SET c.name = $name
"""

_MERGE_HS_CODE = """
MERGE (h:HSCode {code: $code})
SET h.description = $description,
    h.deprecated = $deprecated,
    h.replacement_code = $replacement_code
"""

_MERGE_CERTIFICATE = """
MERGE (c:CertificateRequirement {name: $name})
SET c.issuing_body = $issuing_body
"""

_MERGE_DOCUMENT_TYPE = """
MERGE (d:DocumentType {name: $name})
SET d.label = $label
"""

_MERGE_REJECTION_REASON = """
MERGE (r:RejectionReason {reason_code: $reason_code})
SET r.description = $description
"""

_MERGE_PATTERN = """
MERGE (p:Pattern {pattern_id: $pattern_id})
SET p.type = $type,
    p.frequency = $frequency,
    p.confidence = $confidence,
    p.reason_code = $reason_code,
    p.detail = $detail
"""

_MERGE_REQUIRES = """
MATCH (h:HSCode {code: $hs_code})
MATCH (c:CertificateRequirement {name: $certificate})
MERGE (h)-[r:REQUIRES {destination_country: $destination_country}]->(c)
"""

_MERGE_CONTRADICTS = """
MATCH (a:DocumentType {name: $a})
MATCH (b:DocumentType {name: $b})
MERGE (a)-[:CONTRADICTS]->(b)
"""

_MERGE_CAUSED_REJECTION = """
MATCH (p:Pattern {reason_code: $reason_code})
MATCH (r:RejectionReason {reason_code: $reason_code})
MERGE (p)-[:CAUSED_REJECTION]->(r)
"""

_MERGE_RESOLVED_BY = """
MATCH (r:RejectionReason {reason_code: $reason_code})
MATCH (c:CertificateRequirement {name: $certificate})
MERGE (r)-[:RESOLVED_BY]->(c)
"""

_MERGE_SHIPMENT = """
MERGE (s:Shipment {shipment_id: $shipment_id})
SET s.status = $status
WITH s
MATCH (h:HSCode {code: $hs_code})
MATCH (co:Country {code: $destination})
MERGE (s)-[:DECLARES_HS]->(h)
MERGE (s)-[:DESTINED_FOR]->(co)
"""

_MERGE_SHIPMENT_MATCH = """
MATCH (s:Shipment {shipment_id: $shipment_id})
MATCH (p:Pattern {pattern_id: $pattern_id})
MERGE (s)-[:MATCHES]->(p)
"""


def seed_database(wipe: bool = True) -> None:
    """Apply constraints and load the seed dataset into Neo4j."""
    graph_client.connect()
    if not graph_client.is_connected:
        raise RuntimeError(
            f"Cannot seed: Neo4j not reachable at {os.getenv('NEO4J_URI', 'bolt://localhost:7687')}. "
            "Start it with `docker-compose up neo4j` and retry."
        )

    if wipe:
        logger.info("Wiping existing graph")
        graph_client.execute_write(_WIPE)

    graph_client.apply_constraints()

    for country in COUNTRIES:
        graph_client.execute_write(_MERGE_COUNTRY, **country)
    for hs_code in HS_CODES:
        graph_client.execute_write(_MERGE_HS_CODE, **hs_code)
    for certificate in CERTIFICATES:
        graph_client.execute_write(_MERGE_CERTIFICATE, **certificate)
    for document_type in DOCUMENT_TYPES:
        graph_client.execute_write(_MERGE_DOCUMENT_TYPE, **document_type)
    for reason in REJECTION_REASONS:
        graph_client.execute_write(_MERGE_REJECTION_REASON, **reason)
    for pattern in PATTERNS:
        graph_client.execute_write(
            _MERGE_PATTERN,
            confidence=confidence_for(pattern["frequency"]),
            **pattern,
        )

    for requirement in CERT_REQUIREMENTS:
        graph_client.execute_write(_MERGE_REQUIRES, **requirement)
    for left, right in CONTRADICTING_DOCUMENTS:
        graph_client.execute_write(_MERGE_CONTRADICTS, a=left, b=right)
        graph_client.execute_write(_MERGE_CONTRADICTS, a=right, b=left)
    for pattern in PATTERNS:
        graph_client.execute_write(
            _MERGE_CAUSED_REJECTION, reason_code=pattern["reason_code"]
        )
    for reason_code, certificate in RESOLVED_BY:
        graph_client.execute_write(
            _MERGE_RESOLVED_BY, reason_code=reason_code, certificate=certificate
        )

    for shipment in SHIPMENTS:
        graph_client.execute_write(
            _MERGE_SHIPMENT,
            shipment_id=shipment["shipment_id"],
            status=shipment["status"],
            hs_code=shipment["hs_code"],
            destination=shipment["destination"],
        )
        for pattern_id in shipment["matched_patterns"]:
            graph_client.execute_write(
                _MERGE_SHIPMENT_MATCH,
                shipment_id=shipment["shipment_id"],
                pattern_id=pattern_id,
            )

    logger.info(
        "Seed complete: %d countries, %d HS codes, %d certificates, %d patterns, %d shipments",
        len(COUNTRIES),
        len(HS_CODES),
        len(CERTIFICATES),
        len(PATTERNS),
        len(SHIPMENTS),
    )
    graph_client.close()


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed the Harbinger Neo4j graph")
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Upsert the seed data without wiping the existing graph first",
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )
    args = _parse_args()
    seed_database(wipe=not args.keep)
