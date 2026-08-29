"""
Document contradiction rules
============================
Pure functions that inspect a shipment's ``documents`` payload and decide
whether a given failure condition is present. No Neo4j, no I/O — the graph
supplies the *rules* (which HS code needs which certificate, which codes are
deprecated), these functions apply them to the actual documents.

Document payload shape (from the ``/api/simulate`` contract in TASKS.md)::

    {
      "commercial_invoice": {"units": 500, "hs_code": "8471.30"},
      "packing_list": {"units": 480},
      "bill_of_lading": {},
      "certificate_of_origin": null
    }
"""

from __future__ import annotations

from typing import Any

# Reason codes — keep in sync with the RejectionReason nodes seeded in
# services/engine/app/seed/seed_data.py and the contract examples.
REASON_UNIT_MISMATCH = "UNIT_MISMATCH"
REASON_MISSING_CERTIFICATE = "MISSING_CERTIFICATE"
REASON_HS_CODE_DEPRECATED = "HS_CODE_DEPRECATED"
REASON_HS_CODE_MISMATCH = "HS_CODE_MISMATCH"

_MISSING = object()


def _document(documents: dict[str, Any], name: str) -> dict[str, Any] | None:
    """Return a document sub-object, or ``None`` when absent/explicitly null."""
    value = documents.get(name, _MISSING)
    if value is _MISSING or value is None:
        return None
    if not isinstance(value, dict):
        return {}
    return value


def detect_unit_mismatch(documents: dict[str, Any]) -> str | None:
    """Commercial invoice and packing list disagree on unit count.

    Returns a human-readable detail string when the two documents are both
    present and their ``units`` differ, otherwise ``None``.
    """
    invoice = _document(documents, "commercial_invoice")
    packing_list = _document(documents, "packing_list")
    if invoice is None or packing_list is None:
        return None

    invoice_units = invoice.get("units")
    packing_units = packing_list.get("units")
    if invoice_units is None or packing_units is None:
        return None

    if invoice_units != packing_units:
        return (
            f"Invoice lists {invoice_units} units, Packing List lists {packing_units}"
        )
    return None


def detect_missing_certificate(
    required_certificates: list[str],
    documents: dict[str, Any],
) -> str | None:
    """A certificate the destination requires for this HS code is absent.

    ``required_certificates`` comes from the graph. If any are required and the
    shipment carries no ``certificate_of_origin``, that is a hold risk.
    """
    if not required_certificates:
        return None
    if _document(documents, "certificate_of_origin") is not None:
        return None

    names = ", ".join(sorted(required_certificates))
    return f"Destination requires {names}; none attached to this shipment"


def detect_hs_code_deprecated(
    hs_code: str,
    is_deprecated: bool,
    replacement_code: str | None,
) -> str | None:
    """The declared HS code is flagged deprecated in the graph."""
    if not is_deprecated:
        return None
    if replacement_code:
        return f"HS code {hs_code} is deprecated; use {replacement_code}"
    return f"HS code {hs_code} is deprecated"


def detect_hs_code_mismatch(
    documents: dict[str, Any], declared_hs_code: str
) -> str | None:
    """The invoice's HS code does not match the shipment's declared HS code."""
    invoice = _document(documents, "commercial_invoice")
    if invoice is None:
        return None
    invoice_hs = invoice.get("hs_code")
    if not invoice_hs or not declared_hs_code:
        return None
    if str(invoice_hs) != str(declared_hs_code):
        return (
            f"Invoice HS code {invoice_hs} does not match "
            f"declared HS code {declared_hs_code}"
        )
    return None
