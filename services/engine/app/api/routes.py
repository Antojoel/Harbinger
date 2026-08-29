"""
FastAPI REST API Routes for Harbinger Engine
============================================
Two layers in this file:

1. The LOCKED contract (TASKS.md) — /simulate, /record-outcome, /graph,
   /patterns, /voice-query, /create-payment-order, /verify-payment. Other
   consumers (the MCP server) depend on these exact response shapes; /simulate
   and /record-outcome are extended additively (new fields merged in), never
   with renamed/removed fields, so nothing else breaks.
2. UI-adapter endpoints for the ported dashboard frontend (apps/web) —
   /stats, /shipments, /shipments/{id}, /approve-fix, /outcome, /pricing,
   /payments/*, /voice, /config, /email/*, /integrations. These exist because
   that frontend expects a shipment catalog the original contract never had.
   Translation logic lives in ui_adapter.py, not here or in engine.py.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional

from core import engine, shipment_store
from api import ui_adapter
from integrations import razorpay_client

router = APIRouter()


class SimulateRequest(BaseModel):
    shipment_id: Optional[str] = Field("MSKU1234567", description="Container or shipment tracking number")
    documents: Dict[str, Any] = Field(default_factory=dict, description="Uploaded trade document payload")
    country: Optional[str] = Field(None, description="Destination country code, e.g. 'DE'")
    hs_code: Optional[str] = Field(None, description="Declared HS code, falls back to documents.commercial_invoice.hs_code")


class RecordOutcomeRequest(BaseModel):
    shipment_id: str = Field(..., description="Shipment tracking number")
    actual_outcome: Dict[str, Any] = Field(..., description="Customs outcome details (passed, hold, fee_amount)")


class VoiceQueryRequest(BaseModel):
    shipment_id: str = Field(..., description="Shipment tracking number")
    audio_base64: str = Field(..., description="Recorded driver/officer audio, base64-encoded")


class CreatePaymentOrderRequest(BaseModel):
    plan_type: str = Field(..., description="'per_shipment' or 'subscription'")
    shipment_id: Optional[str] = Field(None, description="Shipment this order protects, if per-shipment")


class VerifyPaymentRequest(BaseModel):
    order_id: str
    payment_id: str
    signature: str


class ApproveFixRequest(BaseModel):
    shipment_id: str
    fix_id: str


class OutcomeRequest(BaseModel):
    shipment_id: str
    actual_result: str = Field(..., description="'Cleared' | 'Held' | 'Rejected'")
    reason: Optional[str] = ""


class PaymentOrderUiRequest(BaseModel):
    tier_id: str
    shipment_id: Optional[str] = None


class VoiceUiRequest(BaseModel):
    shipment_id: str
    question: str


class SendEmailRequest(BaseModel):
    recipient_email: str
    subject: str
    html_content: Optional[str] = ""
    shipment_id: Optional[str] = None


# =========================================================================
# LOCKED CONTRACT — do not rename/remove fields, only add
# =========================================================================

def _run_simulation_for_shipment(shipment_id: str, documents: Dict[str, Any],
                                  country: Optional[str], hs_code: Optional[str]) -> Dict[str, Any]:
    """Shared by /simulate (raw contract) and the /shipments UI endpoints."""
    stored = shipment_store.get_shipment(shipment_id)

    if not documents and stored:
        documents = stored["engine_documents"]
    if not country and stored:
        country = stored["destination_country"]
    if not hs_code and stored:
        hs_code = stored["hs_code"]

    result = engine.simulate({
        "shipment_id": shipment_id,
        "documents": documents,
        "country": country,
        "hs_code": hs_code,
    })
    result.update(ui_adapter.simulate_to_ui(result))

    if stored:
        shipment_store.set_latest_simulation(shipment_id, result)

    return result


@router.post("/simulate", summary="Simulate customs clearance and detect risk")
async def simulate_endpoint(payload: SimulateRequest):
    """
    POST /simulate: Simulates customs clearance risk. If `documents` is
    omitted and `shipment_id` matches a stored shipment, its documents are
    used automatically (needed for the dashboard's per-shipment Simulate
    button, which only sends an id). Response is the locked shape plus
    additive UI fields (score, band, summary, checklist, recommended_default)
    — existing consumers (MCP server) only read the original fields and are
    unaffected.
    """
    try:
        return _run_simulation_for_shipment(
            payload.shipment_id, payload.documents, payload.country, payload.hs_code
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/record-outcome", summary="Record actual clearance outcome to update graph memory")
async def record_outcome_endpoint(payload: RecordOutcomeRequest):
    """
    POST /record-outcome: Records actual clearance result to reinforce pattern nodes in Neo4j.
    """
    try:
        result = engine.record_outcome(payload.shipment_id, payload.actual_outcome)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph", summary="Fetch graph nodes and edges for visualization")
async def graph_snapshot_endpoint():
    """
    GET /graph: Returns current Neo4j nodes and edges for the interactive frontend visualization.
    """
    try:
        return engine.graph_snapshot()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patterns", summary="Query historical risk patterns")
async def query_patterns_endpoint(hs_code: Optional[str] = Query(None), country: Optional[str] = Query(None)):
    """
    GET /patterns: Queries historical trade rejection and resolution patterns.
    """
    try:
        filters = {}
        if hs_code:
            filters["hs_code"] = hs_code
        if country:
            filters["country"] = country
        return {"patterns": engine.query_patterns(filters)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/voice-query", summary="Voice-driven shipment risk query")
async def voice_query_endpoint(payload: VoiceQueryRequest):
    """
    POST /voice-query: STUB for the audio_base64-based contract. The ported
    dashboard's VoiceWidget uses the browser's own Web Speech API for STT/TTS
    and calls /api/voice (below) with plain text instead — so this endpoint
    isn't on the demo's actual critical path anymore, but stays here for
    contract compatibility until Vignesh's V5 lands.
    """
    return {
        "transcript": "What's this shipment's hold risk?",
        "response_text": "73% likely held: missing Certificate of Origin.",
        "response_audio_base64": "STUB_AUDIO_BASE64_PLACEHOLDER"
    }


@router.post("/create-payment-order", summary="Create a real Razorpay test-mode order")
async def create_payment_order_endpoint(payload: CreatePaymentOrderRequest):
    """POST /create-payment-order: creates a real Razorpay order in test
    mode. Falls back to {awaiting_keys: True} if RAZORPAY_KEY/SECRET aren't
    set, so the frontend degrades gracefully rather than crashing."""
    return razorpay_client.create_order(payload.plan_type, payload.shipment_id)


@router.post("/verify-payment", summary="Verify a Razorpay payment signature")
async def verify_payment_endpoint(payload: VerifyPaymentRequest):
    """POST /verify-payment: verifies the HMAC signature server-side —
    never trust a client-reported success on its own."""
    ok = razorpay_client.verify_payment(payload.order_id, payload.payment_id, payload.signature)
    return {"status": "success" if ok else "failed"}


# =========================================================================
# UI-ADAPTER ENDPOINTS — for the ported dashboard frontend (apps/web)
# =========================================================================

def _ensure_simulated(shipment: Dict[str, Any]) -> Dict[str, Any]:
    if not shipment.get("latest_simulation"):
        shipment["latest_simulation"] = _run_simulation_for_shipment(
            shipment["id"], {}, shipment["destination_country"], shipment["hs_code"]
        )
    return shipment


def _dashboard_row(shipment: Dict[str, Any]) -> Dict[str, Any]:
    sim = shipment["latest_simulation"] or {}
    return {
        "id": shipment["id"],
        "ref": shipment["ref"],
        "goods_desc": shipment["goods_desc"],
        "importer_name": shipment["importer_name"],
        "hs_code": shipment["hs_code"],
        "pol": shipment["pol"],
        "pod": shipment["pod"],
        "status": shipment["status"],
        "risk_band": sim.get("band", "low"),
        "hold_probability": sim.get("score", 0),
    }


@router.get("/stats", summary="Dashboard summary stats (UI adapter)")
async def stats_endpoint():
    shipments = [_ensure_simulated(s) for s in shipment_store.list_shipments()]
    total = len(shipments)
    at_risk = sum(1 for s in shipments if s["latest_simulation"]["score"] >= 25)
    avg = round(sum(s["latest_simulation"]["score"] for s in shipments) / total) if total else 0
    totals = shipment_store.get_totals()
    return {
        "total_shipments": total,
        "at_risk": at_risk,
        "avg_hold_probability": avg,
        "cost_avoided_inr": totals["cost_avoided_inr"],
        "outcomes_recorded": totals["outcomes_recorded"],
    }


@router.get("/shipments", summary="List shipments for the dashboard (UI adapter)")
async def list_shipments_endpoint(status: Optional[str] = Query(None), risk: Optional[str] = Query(None)):
    shipments = [_ensure_simulated(s) for s in shipment_store.list_shipments()]
    rows = [_dashboard_row(s) for s in shipments]
    if status and status != "all":
        rows = [r for r in rows if r["status"] == status]
    if risk and risk != "all":
        rows = [r for r in rows if r["risk_band"] == risk]
    return rows


@router.get("/shipments/{shipment_id}", summary="Shipment detail (UI adapter)")
async def get_shipment_endpoint(shipment_id: str):
    shipment = shipment_store.get_shipment(shipment_id)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    shipment = _ensure_simulated(shipment)
    sim = shipment["latest_simulation"]
    contradictions = [{"type": r["code"].lower()} for r in
                       [{"code": c} for c in _reason_codes(shipment_id)]]
    return {
        "id": shipment["id"],
        "ref": shipment["ref"],
        "goods_desc": shipment["goods_desc"],
        "importer_name": shipment["importer_name"],
        "hs_code": shipment["hs_code"],
        "destination_country": shipment["destination_country"],
        "pol": shipment["pol"],
        "pod": shipment["pod"],
        "status": shipment["status"],
        "documents": shipment["ui_documents"],
        "contradictions": contradictions,
        "hold_probability": sim["score"],
        "risk_band": sim["band"],
        "latest_simulation": sim,
    }


def _reason_codes(shipment_id: str) -> List[str]:
    shipment = shipment_store.get_shipment(shipment_id)
    if not shipment or not shipment.get("latest_simulation"):
        return []
    engine_reasons = engine.simulate({
        "shipment_id": shipment_id,
        "documents": shipment["engine_documents"],
        "country": shipment["destination_country"],
        "hs_code": shipment["hs_code"],
    }).get("reasons", [])
    return [r["code"] for r in engine_reasons]


@router.post("/approve-fix", summary="Approve an auto-fixable defect (UI adapter)")
async def approve_fix_endpoint(payload: ApproveFixRequest):
    """
    Only internal transcription defects (unit mismatch) are auto-fixable.
    Missing certificates always require a human-approved draft — never
    auto-submitted — matching the product's own stated rule.
    """
    if payload.fix_id != "UNIT_MISMATCH":
        raise HTTPException(status_code=400, detail="This defect requires a human-approved draft, not an auto-fix.")
    ok = shipment_store.apply_unit_mismatch_fix(payload.shipment_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Shipment not found")
    _run_simulation_for_shipment(payload.shipment_id, {}, None, None)
    return {"status": "fixed", "fix_id": payload.fix_id}


@router.post("/outcome", summary="Record a real outcome from the dashboard (UI adapter)")
async def outcome_ui_endpoint(payload: OutcomeRequest):
    shipment = shipment_store.get_shipment(payload.shipment_id)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    was_held = payload.actual_result in ("Held", "Rejected")
    reason_code = None
    if was_held:
        codes = _reason_codes(payload.shipment_id)
        reason_code = codes[0] if codes else "UNSPECIFIED"

    actual_outcome: Dict[str, Any] = {"was_held": was_held}
    if reason_code:
        actual_outcome["reason_code"] = reason_code
    if payload.reason:
        actual_outcome["detail"] = payload.reason

    engine_result = engine.record_outcome(payload.shipment_id, actual_outcome)

    credited_inr = 0
    if payload.actual_result == "Cleared":
        credited_inr = shipment["demurrage_per_day_inr"] * 2
        shipment_store.record_credit(credited_inr)
    shipment_store.record_outcome_event()
    shipment_store.set_status(payload.shipment_id, payload.actual_result)

    result = dict(engine_result)
    result.update(ui_adapter.outcome_to_ui(engine_result, credited_inr))
    return result


@router.get("/pricing", summary="Pricing tiers for the Pricing page (UI adapter)")
async def pricing_endpoint():
    return {
        "tiers": [
            {
                "id": "per-shipment", "name": "Per Shipment", "price_inr": 149, "unit": "shipment",
                "highlight": True,
                "features": ["Full risk dossier per shipment", "Auto-fix internal defects",
                             "Human-approved certificate drafts", "Immune-memory learning"],
                "blurb": "Pay only when a shipment is checked.",
            },
            {
                "id": "success-fee", "name": "Success Fee", "price_inr": 0,
                "unit": "12% of verified demurrage avoided", "highlight": False,
                "features": ["No fixed fee", "Pay a share of what we save you", "Audit trail of avoided charges"],
                "blurb": "Aligned pricing — we earn only when you save.",
            },
        ],
        "avg_demurrage_per_day_inr": 5500,
        "razorpay_ready": razorpay_client.is_configured(),
        "note": "Fee shown against average demurrage avoided per prevented hold.",
    }


@router.post("/payments/order", summary="Create a real Razorpay test-mode order for a pricing tier (UI adapter)")
async def payments_order_endpoint(payload: PaymentOrderUiRequest):
    order = razorpay_client.create_order(payload.tier_id, payload.shipment_id)
    if order.get("awaiting_keys"):
        return order
    # This frontend's Razorpay Checkout.js call reads `key_id`, not the
    # locked contract's `razorpay_key_id` — translate here, not in
    # razorpay_client, so /api/create-payment-order's documented shape
    # stays untouched for other consumers.
    return {**order, "key_id": order["razorpay_key_id"]}


@router.post("/payments/verify", summary="Verify a completed checkout (UI adapter)")
async def payments_verify_endpoint(payload: Dict[str, Any]):
    ok = razorpay_client.verify_payment(
        payload.get("razorpay_order_id", ""),
        payload.get("razorpay_payment_id", ""),
        payload.get("razorpay_signature", ""),
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Payment signature verification failed")
    return {"status": "success"}


@router.post("/voice", summary="Text Q&A for the voice widget (UI adapter)")
async def voice_ui_endpoint(payload: VoiceUiRequest):
    """
    The dashboard's VoiceWidget does STT/TTS entirely in the browser (Web
    Speech API) and only sends transcribed text here — no audio ever
    reaches the backend, so this doesn't depend on Vertex AI or Vignesh's
    local-model work (V5) at all.
    """
    shipment = shipment_store.get_shipment(payload.shipment_id)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    shipment = _ensure_simulated(shipment)
    answer = ui_adapter.voice_answer(shipment["ref"], shipment["latest_simulation"])
    return {"answer": answer}


@router.get("/config", summary="Feature flags for pages outside the core demo (UI adapter)")
async def config_endpoint():
    return {"resend_ready": False}


@router.get("/email/log", summary="Email escalation log (UI adapter, out of scope)")
async def email_log_endpoint():
    return []


@router.post("/email/send", summary="Send an escalation email (UI adapter, out of scope, always stubbed)")
async def send_email_endpoint(payload: SendEmailRequest):
    return {"awaiting_keys": True, "message": "Email escalation is out of scope for this build — draft-only."}


@router.get("/integrations", summary="Integration docs shown in the Integrations page (UI adapter)")
async def integrations_endpoint():
    return {
        "rest_endpoints": [
            {"method": "POST", "path": "/api/simulate"},
            {"method": "POST", "path": "/api/record-outcome"},
            {"method": "GET", "path": "/api/graph"},
            {"method": "GET", "path": "/api/patterns"},
        ],
        "mcp_tools": ["check_shipment_risk", "record_outcome_tool", "query_patterns_tool"],
    }
