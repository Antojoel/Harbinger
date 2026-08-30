"""On-demand data tools for the assistant.

The assistant is handed the whole book up front (see ``core.workspace``), but
a prompt can only hold so much and some questions need something that was
never packed — one dossier's full checklist, a slice of the graph, a filter
the aggregates don't cover. These tools let the model fetch that itself.

Everything is read-only and runs in-process against the same stores the REST
API uses. ``search_shipments`` filters over ``shipment_store`` directly rather
than calling ``GET /api/shipments``, which only accepts ``status`` and
``risk`` — importer, destination and HS code are needed here and adding them
to the public endpoint would change a contract other consumers depend on.

No tool raises. Failures come back as ``{"error": ...}`` so a bad tool call
degrades one answer instead of collapsing the request.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional

from core import engine, shipment_store
from core.workspace import REASON_LABELS
from voice.answer import fetch_graph_context

logger = logging.getLogger("harbinger.voice.tools")

# Cap what a single tool call can return. The model gets the whole book in the
# prompt already, so a tool returning hundreds of rows is a sign the question
# should have been answered from the aggregates.
MAX_ROWS = 60


def _row(s: Dict[str, Any], reason_codes: List[str]) -> Dict[str, Any]:
    sim = s.get("latest_simulation") or {}
    return {
        "reference": s["ref"],
        "id": s["id"],
        "importer": s["importer_name"],
        "exporter": s.get("exporter"),
        "goods": s.get("goods_desc"),
        "hs_code": s.get("hs_code"),
        "destination": s.get("destination_country"),
        "route": f"{s.get('pol')} to {s.get('pod')}",
        "status": s.get("status"),
        "hold_risk_percent": sim.get("score", 0),
        "risk_band": sim.get("band", "low"),
        "issues": [REASON_LABELS.get(c, c) for c in reason_codes],
    }


def _matches(value: Optional[str], wanted: Optional[str]) -> bool:
    """Case-insensitive substring match, so 'whitefield' finds
    'Whitefield Textiles Pvt Ltd' and 'DE' finds 'DE'."""
    if not wanted:
        return True
    return wanted.strip().lower() in str(value or "").lower()


def search_shipments(
    ensure_simulated: Callable[[Dict[str, Any]], Dict[str, Any]],
    reason_codes_for: Callable[[str], List[str]],
    *,
    importer: Optional[str] = None,
    destination: Optional[str] = None,
    hs_code: Optional[str] = None,
    status: Optional[str] = None,
    risk_band: Optional[str] = None,
    has_issue: Optional[str] = None,
) -> Dict[str, Any]:
    """Filter the book. Every argument is optional; omitting all returns
    everything (capped)."""
    out: List[Dict[str, Any]] = []
    for s in shipment_store.list_shipments():
        s = ensure_simulated(s)
        sim = s.get("latest_simulation") or {}
        if not _matches(s.get("importer_name"), importer):
            continue
        if not _matches(s.get("destination_country"), destination):
            continue
        if not _matches(s.get("hs_code"), hs_code):
            continue
        if status and str(s.get("status", "")).lower() != status.strip().lower():
            continue
        if risk_band and str(sim.get("band", "")).lower() != risk_band.strip().lower():
            continue

        codes = reason_codes_for(s["id"])
        if has_issue and not any(has_issue.strip().upper() in c for c in codes):
            continue
        out.append(_row(s, codes))

    out.sort(key=lambda r: -r["hold_risk_percent"])
    return {
        "matched": len(out),
        "shipments": out[:MAX_ROWS],
        "truncated": len(out) > MAX_ROWS,
    }


def get_shipment(
    ensure_simulated: Callable[[Dict[str, Any]], Dict[str, Any]],
    reason_codes_for: Callable[[str], List[str]],
    *,
    shipment_id: str,
) -> Dict[str, Any]:
    """One shipment in full, including its open checklist items — more detail
    than the book rows carry."""
    s = shipment_store.get_shipment(shipment_id)
    if not s:
        # Reference lookup too: the model sees SIRIUS-… references, not ids.
        wanted = str(shipment_id).strip().lower()
        s = next(
            (x for x in shipment_store.list_shipments() if str(x.get("ref", "")).lower() == wanted),
            None,
        )
    if not s:
        return {"error": f"no shipment matching '{shipment_id}'"}

    s = ensure_simulated(s)
    sim = s.get("latest_simulation") or {}
    row = _row(s, reason_codes_for(s["id"]))
    row.update(
        {
            "summary": sim.get("summary"),
            "recommended_next_action": sim.get("recommended_default"),
            "open_items": [
                {"item": c.get("item"), "state": c.get("status"), "action": c.get("action")}
                for c in (sim.get("checklist") or [])
            ],
        }
    )
    return row


def query_patterns(*, hs_code: Optional[str] = None, country: Optional[str] = None) -> Dict[str, Any]:
    """Learned failure patterns from the immune-memory graph."""
    filters: Dict[str, Any] = {}
    if hs_code:
        filters["hs_code"] = hs_code
    if country:
        filters["country"] = country
    patterns = engine.query_patterns(filters)
    return {
        "patterns": [
            {
                "type": p.get("type"),
                "times_seen": p.get("frequency"),
                "confidence_percent": round(float(p.get("confidence") or 0) * 100),
                "detail": p.get("detail"),
            }
            for p in patterns
        ]
    }


def get_graph_context(
    *,
    hs_code: Optional[str] = None,
    country: Optional[str] = None,
    reason_codes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Graph rules for a lane: required certificates, what resolves which
    rejection reason, how widely each pattern has been seen."""
    return fetch_graph_context(
        "", hs_code=hs_code or "", country=country or "", reason_codes=reason_codes
    ) or {"note": "the graph has nothing recorded for that lane"}


# --------------------------------------------------------------------------
# OpenAI function-calling schemas
# --------------------------------------------------------------------------

TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_shipments",
            "description": (
                "Filter the shipment book. Use when the question needs a set of "
                "containers the provided aggregates cannot answer exactly — a "
                "specific importer, destination, HS code, status or risk band. "
                "All arguments optional; matching is case-insensitive substring."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "importer": {"type": "string", "description": "Importer name or part of it, e.g. 'Whitefield'"},
                    "destination": {"type": "string", "description": "Destination country code, e.g. 'DE'"},
                    "hs_code": {"type": "string", "description": "Declared HS code, e.g. '8471.30'"},
                    "status": {"type": "string", "description": "Exact status: Draft, Ready to file, Filed, Cleared, Held or Rejected"},
                    "risk_band": {"type": "string", "enum": ["low", "medium", "high"]},
                    "has_issue": {
                        "type": "string",
                        "description": "Reason code to require: UNIT_MISMATCH, MISSING_CERTIFICATE, HS_CODE_MISMATCH or HS_CODE_DEPRECATED",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_shipment",
            "description": (
                "Full detail for one shipment including its open checklist items. "
                "Accepts either the internal id or the SIRIUS-… reference."
            ),
            "parameters": {
                "type": "object",
                "properties": {"shipment_id": {"type": "string"}},
                "required": ["shipment_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_patterns",
            "description": "Learned failure patterns, optionally narrowed to an HS code or destination country.",
            "parameters": {
                "type": "object",
                "properties": {
                    "hs_code": {"type": "string"},
                    "country": {"type": "string"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_graph_context",
            "description": (
                "Knowledge-graph rules for a lane: which certificates that HS "
                "code and destination require, what resolves each rejection "
                "reason, and how often each pattern has been seen."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "hs_code": {"type": "string"},
                    "country": {"type": "string"},
                    "reason_codes": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
    },
]


def build_executor(
    ensure_simulated: Callable[[Dict[str, Any]], Dict[str, Any]],
    reason_codes_for: Callable[[str], List[str]],
) -> Callable[[str, Dict[str, Any]], Dict[str, Any]]:
    """Return a ``(name, args) -> result`` dispatcher.

    The two callables are injected rather than imported so this module stays
    free of the route layer, and so the caller's per-request memoisation of
    reason codes is reused instead of re-simulating on every tool call.
    """

    def execute(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        try:
            if name == "search_shipments":
                return search_shipments(ensure_simulated, reason_codes_for, **args)
            if name == "get_shipment":
                return get_shipment(ensure_simulated, reason_codes_for, **args)
            if name == "query_patterns":
                return query_patterns(**args)
            if name == "get_graph_context":
                return get_graph_context(**args)
            return {"error": f"unknown tool '{name}'"}
        except TypeError as e:  # bad/extra arguments from the model
            return {"error": f"{name}: invalid arguments ({e})"}
        except Exception as e:
            logger.warning("tool %s failed: %s", name, e)
            return {"error": f"{name} failed: {e}"}

    return execute
