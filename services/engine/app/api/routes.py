"""
FastAPI REST API Routes for Harbinger Engine
============================================
Two layers in this file:

1. The LOCKED contract (TASKS.md) — /simulate, /simulate-from-documents,
   /record-outcome, /graph, /patterns, /voice-query, /create-payment-order,
   /verify-payment. Other consumers (the MCP server) depend on these exact
   response shapes; /simulate and /record-outcome are extended additively
   (new fields merged in), never with renamed/removed fields, so nothing
   else breaks.
2. UI-adapter endpoints for the ported dashboard frontend (apps/web) —
   /stats, /shipments, /shipments/{id}, /shipments/from-documents,
   /approve-fix, /outcome, /pricing, /payments/*, /voice, /config,
   /email/*, /integrations. These exist because that frontend expects a
   shipment catalog the original contract never had. Translation logic
   lives in ui_adapter.py, not here or in engine.py.
"""

import base64
import binascii
import os
import time
import datetime
import logging
import uuid
import httpx
from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional

logger = logging.getLogger("routes")


from core import engine, shipment_store, user_store, workspace
from api import ui_adapter
from documents import extraction
from integrations import razorpay_client, google_auth
from dataclasses import replace as _dc_replace

from voice import answer_voice_query
from voice.answer import fetch_graph_context, fetch_shipment_facts
from voice.llm_answer import build_llm_answer
from voice.providers import VoiceProviderError, get_provider
from voice.config import VALID_LLM_ANSWER_PROVIDERS, VALID_PROVIDERS, VoiceSettings

router = APIRouter()


class SimulateRequest(BaseModel):
    shipment_id: Optional[str] = Field("MSKU1234567", description="Container or shipment tracking number")
    documents: Dict[str, Any] = Field(default_factory=dict, description="Uploaded trade document payload")
    country: Optional[str] = Field(None, description="Destination country code, e.g. 'DE'")
    hs_code: Optional[str] = Field(None, description="Declared HS code, falls back to documents.commercial_invoice.hs_code")


class RecordOutcomeRequest(BaseModel):
    shipment_id: str = Field(..., description="Shipment tracking number")
    actual_outcome: Dict[str, Any] = Field(..., description="Customs outcome details (passed, hold, fee_amount)")


class DocumentUpload(BaseModel):
    filename: str = "document.pdf"
    content_base64: str = Field(..., description="Base64-encoded file content (PDF, PNG, or JPEG)")
    content_type: Optional[str] = Field(None, description="MIME type; guessed from filename if omitted")


class SimulateFromDocumentsRequest(BaseModel):
    shipment_id: str = Field(..., description="Shipment tracking number")
    country: str = Field(..., description="Destination country code, e.g. 'DE'")
    commercial_invoice: DocumentUpload
    packing_list: DocumentUpload
    bill_of_lading: DocumentUpload
    certificate_of_origin: Optional[DocumentUpload] = Field(
        None, description="Omit entirely if no certificate is attached"
    )


class VoiceQueryRequest(BaseModel):
    shipment_id: str = Field(..., description="Shipment tracking number")
    audio_base64: str = Field(..., description="Recorded driver/officer audio, base64-encoded")
    provider: Optional[str] = Field(
        None, description="Override VOICE_PROVIDER for this call: text_only | openai | gemini | vertex | local"
    )
    llm_provider: Optional[str] = Field(
        None,
        description="Override LLM_ANSWER_PROVIDER for this call: heuristic (default template) | openai | gemini",
    )


class CreatePaymentOrderRequest(BaseModel):
    plan_type: str = Field(..., description="'per_shipment' or 'subscription'")
    shipment_id: Optional[str] = Field(None, description="Shipment this order protects, if per-shipment")


class VerifyPaymentRequest(BaseModel):
    order_id: str
    payment_id: str
    signature: str


class CreateShipmentRequest(BaseModel):
    shipment_id: Optional[str] = Field(None, description="Auto-generated if omitted")
    importer_name: str = "Unknown Importer"
    exporter: str = "Unknown Exporter"
    hs_code: str = Field(..., description="Declared HS code, e.g. '8471.30'")
    country: str = Field(..., description="Destination country code, e.g. 'DE'")
    goods_desc: str = ""
    pol: str = ""
    pod: str = ""
    invoice_units: int = Field(..., description="Commercial invoice unit count")
    packing_units: int = Field(..., description="Packing list unit count")
    invoice_hs_code: Optional[str] = Field(
        None, description="Set only to intentionally trigger an HS-code mismatch"
    )
    has_certificate: bool = True
    demurrage_per_day_inr: int = 5000


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
    shipment_id: Optional[str] = Field(
        None, description="Shipment in focus, if the user is looking at one"
    )
    question: str
    page: Optional[str] = Field(
        None, description="Route the user is currently on, e.g. '/graph' — lets the assistant answer about what's on screen"
    )


class SendEmailRequest(BaseModel):
    recipient_email: str
    subject: str
    html_content: Optional[str] = ""
    shipment_id: Optional[str] = None


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(..., description="Google Identity Services ID token from the frontend")


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
        shipment_store.record_activity("check", shipment_id)

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


async def _extract_shipment_documents(
    commercial_invoice: DocumentUpload,
    packing_list: DocumentUpload,
    bill_of_lading: DocumentUpload,
    certificate_of_origin: Optional[DocumentUpload],
) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """Decode + extract all three required documents. Returns
    (invoice_fields, packing_fields, bol_fields). Raises HTTPException(422)
    on any decode or extraction failure - a caller-fixable problem (wrong
    file, unreadable scan), not a 500.
    """
    settings = VoiceSettings.from_env()
    try:
        invoice_fields = await extraction.extract_document(
            "commercial_invoice",
            commercial_invoice.filename,
            base64.b64decode(commercial_invoice.content_base64, validate=True),
            commercial_invoice.content_type,
            settings,
        )
        packing_fields = await extraction.extract_document(
            "packing_list",
            packing_list.filename,
            base64.b64decode(packing_list.content_base64, validate=True),
            packing_list.content_type,
            settings,
        )
        bol_fields = await extraction.extract_document(
            "bill_of_lading",
            bill_of_lading.filename,
            base64.b64decode(bill_of_lading.content_base64, validate=True),
            bill_of_lading.content_type,
            settings,
        )
    except extraction.ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except (ValueError, binascii.Error) as e:
        raise HTTPException(status_code=422, detail=f"invalid base64 document content: {e}")
    return invoice_fields, packing_fields, bol_fields


@router.post(
    "/simulate-from-documents",
    summary="Extract fields from uploaded customs documents and simulate (locked contract, additive)",
)
async def simulate_from_documents_endpoint(payload: SimulateFromDocumentsRequest):
    """
    POST /simulate-from-documents: reads the risk-relevant fields straight out
    of uploaded customs documents (commercial invoice, packing list, bill of
    lading - via Vertex AI Gemini's multimodal generateContent, see
    documents/extraction.py) instead of requiring them pre-typed into
    structured JSON, then runs the exact same engine /simulate does.

    The bill of lading's hs_code is treated as the shipment's *declared* HS
    code (matched against the invoice's own hs_code to detect a mismatch,
    and used for the certificate-requirement lookup); certificate_of_origin
    needs no extraction at all - only whether one was attached matters.

    Additive to the locked contract: identical response shape to /simulate,
    plus `extracted_documents` showing what was actually read from each file.
    """
    invoice_fields, packing_fields, bol_fields = await _extract_shipment_documents(
        payload.commercial_invoice, payload.packing_list, payload.bill_of_lading,
        payload.certificate_of_origin,
    )

    documents = {
        "commercial_invoice": {"units": invoice_fields.get("units"), "hs_code": invoice_fields.get("hs_code")},
        "packing_list": {"units": packing_fields.get("units")},
        "bill_of_lading": {"hs_code": bol_fields.get("hs_code")},
        "certificate_of_origin": {"issued": True} if payload.certificate_of_origin else None,
    }

    try:
        result = _run_simulation_for_shipment(
            payload.shipment_id, documents, payload.country, bol_fields.get("hs_code")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    result["extracted_documents"] = documents
    return result


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


@router.post("/voice-query", summary="Voice-driven shipment risk query (STT -> graph -> TTS)")
async def voice_query_endpoint(payload: VoiceQueryRequest):
    """
    POST /voice-query: transcribes the audio, answers the shipment's hold risk
    from the immune-memory graph, and speaks the answer back. The speech
    backend is selected by the ``VOICE_PROVIDER`` env var
    (``text_only`` | ``openai`` | ``gemini`` | ``vertex`` | ``local``), or
    overridden per-request via ``payload.provider``; see
    ``services/engine/app/voice/``.
    """
    settings = VoiceSettings.from_env()
    if payload.provider:
        requested = payload.provider.strip().lower()
        if requested not in VALID_PROVIDERS:
            raise HTTPException(
                status_code=422,
                detail=f"provider must be one of {VALID_PROVIDERS}, got '{payload.provider}'",
            )
        settings = _dc_replace(settings, provider=requested)
    if payload.llm_provider:
        requested_llm = payload.llm_provider.strip().lower()
        if requested_llm not in VALID_LLM_ANSWER_PROVIDERS:
            raise HTTPException(
                status_code=422,
                detail=f"llm_provider must be one of {VALID_LLM_ANSWER_PROVIDERS}, got '{payload.llm_provider}'",
            )
        settings = _dc_replace(settings, llm_answer_provider=requested_llm)
    try:
        return await answer_voice_query(payload.shipment_id, payload.audio_base64, settings=settings)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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

    bands = {"low": 0, "medium": 0, "high": 0}
    for s in shipments:
        bands[s["latest_simulation"].get("band", "low")] += 1

    # How often each reason code actually fired across the current book —
    # real counts from live simulations, not a stored leaderboard.
    reason_counts: Dict[str, int] = {}
    for s in shipments:
        for item in s["latest_simulation"].get("checklist", []) or []:
            code = item.get("ref")
            if code:
                reason_counts[code] = reason_counts.get(code, 0) + 1
    top_reasons = sorted(
        ({"code": c, "count": n} for c, n in reason_counts.items()),
        key=lambda r: r["count"],
        reverse=True,
    )

    patterns = engine.query_patterns({})

    return {
        "total_shipments": total,
        "at_risk": at_risk,
        "avg_hold_probability": avg,
        "cost_avoided_inr": totals["cost_avoided_inr"],
        "outcomes_recorded": totals["outcomes_recorded"],
        "patterns_learned": len(patterns),
        "risk_bands": bands,
        "top_reasons": top_reasons,
    }


@router.get("/activity", summary="Per-day engine activity for the dashboard chart (UI adapter)")
async def activity_endpoint(days: int = Query(7, ge=1, le=30)):
    """Real per-day counts of simulations run and outcomes recorded in this
    process. Empty days are returned as zeroes, never back-filled with
    invented numbers."""
    return {"series": shipment_store.activity_series(days)}


@router.post("/shipments", summary="Add a real shipment to the dashboard catalog and simulate it (UI adapter)")
async def create_shipment_endpoint(payload: CreateShipmentRequest):
    """POST /shipments: adds a genuinely new shipment (not seeded demo data)
    to the dashboard's catalog, then immediately runs it through the real
    /simulate engine — same code path as clicking Simulate on any seeded
    shipment. Use an hs_code/country combo Vignesh actually seeded
    certificate rules for (8471.30/DE or 8504.41/DE — see
    services/engine/app/seed/seed_data.py) to see a real missing-certificate
    check fire; other combos still run for real, just with no certificate
    requirement on record to check against.
    """
    shipment_id = payload.shipment_id or f"shp-{uuid.uuid4().hex[:8]}"
    if shipment_store.get_shipment(shipment_id):
        raise HTTPException(status_code=409, detail=f"Shipment '{shipment_id}' already exists")

    shipment_store.add_shipment(
        shipment_id=shipment_id,
        importer_name=payload.importer_name,
        exporter=payload.exporter,
        hs_code=payload.hs_code,
        country=payload.country,
        goods_desc=payload.goods_desc,
        pol=payload.pol,
        pod=payload.pod,
        invoice_units=payload.invoice_units,
        packing_units=payload.packing_units,
        invoice_hs_code=payload.invoice_hs_code,
        has_certificate=payload.has_certificate,
        demurrage_per_day_inr=payload.demurrage_per_day_inr,
    )
    shipment = _ensure_simulated(shipment_store.get_shipment(shipment_id))
    return _dashboard_row(shipment)


class CreateShipmentFromDocumentsRequest(BaseModel):
    shipment_id: Optional[str] = Field(None, description="Auto-generated if omitted")
    importer_name: str = "Unknown Importer"
    exporter: str = "Unknown Exporter"
    country: str = Field(..., description="Destination country code, e.g. 'DE'")
    goods_desc: str = ""
    pol: str = ""
    pod: str = ""
    commercial_invoice: DocumentUpload
    packing_list: DocumentUpload
    bill_of_lading: DocumentUpload
    certificate_of_origin: Optional[DocumentUpload] = None


@router.post(
    "/shipments/from-documents",
    summary="Add a shipment from uploaded customs documents and simulate it (UI adapter)",
)
async def create_shipment_from_documents_endpoint(payload: CreateShipmentFromDocumentsRequest):
    """POST /shipments/from-documents: same end result as POST /shipments
    (a new dashboard shipment, immediately simulated), but sourcing
    hs_code/units/certificate-presence from uploaded documents via Vertex AI
    Gemini extraction (documents/extraction.py) instead of typed fields.
    """
    shipment_id = payload.shipment_id or f"shp-{uuid.uuid4().hex[:8]}"
    if shipment_store.get_shipment(shipment_id):
        raise HTTPException(status_code=409, detail=f"Shipment '{shipment_id}' already exists")

    invoice_fields, packing_fields, bol_fields = await _extract_shipment_documents(
        payload.commercial_invoice, payload.packing_list, payload.bill_of_lading,
        payload.certificate_of_origin,
    )

    hs_code = bol_fields.get("hs_code")
    invoice_hs_code = invoice_fields.get("hs_code")
    invoice_units = invoice_fields.get("units")
    packing_units = packing_fields.get("units")
    if not hs_code or not invoice_hs_code or invoice_units is None or packing_units is None:
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not extract all required fields from the uploaded documents "
                f"(bill_of_lading.hs_code={hs_code!r}, commercial_invoice.hs_code="
                f"{invoice_hs_code!r}, commercial_invoice.units={invoice_units!r}, "
                f"packing_list.units={packing_units!r}). Try clearer scans, or use "
                "POST /shipments for manual entry instead."
            ),
        )

    shipment_store.add_shipment(
        shipment_id=shipment_id,
        importer_name=payload.importer_name,
        exporter=payload.exporter,
        hs_code=hs_code,
        country=payload.country,
        goods_desc=payload.goods_desc,
        pol=payload.pol,
        pod=payload.pod,
        invoice_units=invoice_units,
        packing_units=packing_units,
        invoice_hs_code=invoice_hs_code,
        has_certificate=payload.certificate_of_origin is not None,
    )
    shipment = _ensure_simulated(shipment_store.get_shipment(shipment_id))
    row = _dashboard_row(shipment)
    row["extracted_documents"] = {
        "commercial_invoice": invoice_fields,
        "packing_list": packing_fields,
        "bill_of_lading": bol_fields,
        "has_certificate": payload.certificate_of_origin is not None,
    }
    return row


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
    shipment_store.record_activity("outcome", payload.shipment_id)
    shipment_store.set_status(payload.shipment_id, payload.actual_result)

    result = dict(engine_result)
    result.update(ui_adapter.outcome_to_ui(engine_result, credited_inr))
    return result


@router.get("/pricing", summary="Pricing tiers for the Pricing page (UI adapter)")
async def pricing_endpoint():
    # Three published tiers. `price_inr_annual` is the effective per-month
    # price when billed yearly (20% off, pre-computed here so the UI never
    # has to invent a discount). Enterprise is quote-only: price_inr is None
    # and the UI turns its CTA into a contact-sales action.
    return {
        "tiers": [
            {
                "id": "payg", "name": "Pay as you go", "price_inr": 149,
                "price_inr_annual": 149, "unit": "shipment", "highlight": False,
                "metered": True,
                "features": [
                    "₹149 per shipment checked",
                    "No monthly commitment",
                    "Full risk dossier per shipment",
                    "Auto-fix internal defects",
                    "Pay only when you run a check",
                ],
                "blurb": "Try the engine on real shipments before committing to a plan.",
            },
            {
                "id": "starter", "name": "Starter", "price_inr": 7999, "price_inr_annual": 6399,
                "unit": "mo", "highlight": False,
                "features": [
                    "Up to 500 shipments / month",
                    "Full risk dossier per shipment",
                    "Auto-fix internal defects",
                    "Email + document workspace",
                    "Community support",
                ],
                "blurb": "For teams proving the value of pre-clearance checks.",
            },
            {
                "id": "growth", "name": "Growth", "price_inr": 23999, "price_inr_annual": 19199,
                "unit": "mo", "highlight": True,
                "features": [
                    "Up to 2,000 shipments / month",
                    "Everything in Starter",
                    "Human-approved certificate drafts",
                    "Immune-memory pattern learning",
                    "Graph explorer + pattern library",
                    "Priority support, 8h response",
                ],
                "blurb": "The working plan for a busy customs desk.",
            },
            {
                "id": "enterprise", "name": "Enterprise", "price_inr": None, "price_inr_annual": None,
                "unit": "mo", "highlight": False,
                "features": [
                    "Unlimited shipments",
                    "Everything in Growth",
                    "Private Neo4j immune memory",
                    "SSO, audit log, data residency",
                    "Custom broker + ERP integrations",
                    "Dedicated success engineer, SLA",
                ],
                "blurb": "For brokers and shippers running at national scale.",
            },
        ],
        "avg_demurrage_per_day_inr": 5500,
        "avg_hold_days": 4,
        "per_shipment_inr": 149,
        "razorpay_ready": razorpay_client.is_configured(),
        "note": "Per-shipment fee shown against the demurrage cost of one prevented hold.",
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


@router.post("/voice", summary="Text Q&A for the dashboard assistant (UI adapter)")
async def voice_ui_endpoint(payload: VoiceUiRequest):
    """
    Text-only Q&A for the Assistant panel — the browser handles speech itself,
    so no audio reaches this endpoint.

    The assistant is scoped to the whole workspace, not one shipment. It is
    handed the full book (every shipment's current risk, plus aggregates by
    importer, destination and HS code), the learned pattern library, a
    structural summary of the immune-memory graph, and a map of the product's
    own screens — so it can answer "how are all the Whitefield containers
    doing?", "what does this graph tell me?", and "where do I do that?" as
    well as questions about a single shipment.

    ``page`` is the route the user is on, so an answer can be about what is
    actually on screen. ``shipment_id`` is optional and only narrows focus.

    Any LLM failure falls back to the deterministic per-shipment template, so
    the panel always answers.
    """
    settings = VoiceSettings.from_env()

    shipment = shipment_store.get_shipment(payload.shipment_id) if payload.shipment_id else None
    simulation = None
    fallback = "Ask about a shipment's hold risk, the patterns the engine has learned, or where to find something in Harbinger."
    if shipment:
        shipment = _ensure_simulated(shipment)
        simulation = shipment["latest_simulation"]
        fallback = ui_adapter.voice_answer(shipment["ref"], simulation, payload.question)

    if settings.llm_answer_provider == "heuristic":
        return {"answer": fallback, "source": "heuristic"}

    # --- workspace-wide context ------------------------------------------
    all_shipments = [_ensure_simulated(s) for s in shipment_store.list_shipments()]
    focus_importer = workspace.find_importer(payload.question, all_shipments)

    graph_snapshot = None
    try:
        graph_snapshot = engine.graph_snapshot()
    except Exception as e:  # graph is optional context, never fatal here
        logger.warning("assistant: graph snapshot unavailable: %s", e)

    facts: Dict[str, Any] = {
        "workspace": workspace.build_workspace_context(
            all_shipments,
            reason_codes_for=_reason_codes,
            patterns=engine.query_patterns({}),
            graph=graph_snapshot,
            focus_importer=focus_importer,
        ),
        "current_page": payload.page or "/",
    }

    # --- narrow, per-shipment context when one is in focus ---------------
    if shipment and simulation:
        facts["exists"] = True
        facts["status"] = shipment.get("status", "")
        facts["graph_context"] = fetch_graph_context(
            payload.shipment_id,
            hs_code=shipment.get("hs_code", ""),
            country=shipment.get("destination_country", ""),
            reason_codes=_reason_codes(payload.shipment_id),
        )
        facts["focused_shipment"] = {
            "reference": shipment["ref"],
            "importer": shipment["importer_name"],
            "hs_code": shipment.get("hs_code"),
            "destination": shipment.get("destination_country"),
            "hold_risk_percent": simulation.get("score"),
            "risk_band": simulation.get("band"),
            "summary": simulation.get("summary"),
            "recommended_next_action": simulation.get("recommended_default"),
            "open_items": [
                {"item": c.get("item"), "state": c.get("status"), "action": c.get("action")}
                for c in (simulation.get("checklist") or [])
            ],
        }

    try:
        answer = await build_llm_answer(
            payload.shipment_id or "", payload.question, facts, settings
        )
        return {"answer": answer, "source": settings.llm_answer_provider}
    except Exception as e:
        logger.warning("assistant LLM answer failed, using template: %s", e)
        return {"answer": fallback, "source": "heuristic"}


class TranscribeRequest(BaseModel):
    audio_base64: str = Field(..., description="Base64-encoded WAV recorded in the browser")


@router.post("/transcribe", summary="Transcribe recorded mic audio (UI adapter)")
async def transcribe_endpoint(payload: TranscribeRequest):
    """Speech-to-text for the Assistant's mic button.

    The browser's own SpeechRecognition API needs a cloud speech service and
    fails immediately when that is blocked (offline, Brave/strict privacy
    settings), which reads to the user as "the mic closes the moment I click
    it". This routes the recording through whichever STT provider the engine
    is configured with instead — the local faster-whisper container when
    VOICE_PROVIDER=local — so the mic works on the same terms as the rest of
    the voice pipeline.
    """
    settings = VoiceSettings.from_env()
    try:
        audio = base64.b64decode(payload.audio_base64, validate=True)
    except (ValueError, binascii.Error) as e:
        raise HTTPException(status_code=422, detail=f"invalid base64 audio: {e}")
    if not audio:
        raise HTTPException(status_code=422, detail="empty recording")

    try:
        provider = get_provider(settings)
        # wavRecorder.js encodes real 16-bit PCM WAV in the browser.
        transcript = await provider.transcribe(audio, "audio/wav")
    except VoiceProviderError as e:
        # A configuration/transport problem, not a caller mistake — say so
        # plainly instead of returning an empty transcript that looks like
        # the user simply said nothing.
        raise HTTPException(status_code=503, detail=f"speech-to-text unavailable: {e}")

    return {"transcript": (transcript or "").strip()}


@router.get("/config", summary="Feature flags for pages outside the core demo (UI adapter)")
async def config_endpoint():
    resend_ready = bool(os.getenv("RESEND_API_KEY"))
    return {"resend_ready": resend_ready, "google_login_configured": google_auth.is_configured()}


# =========================================================================
# AUTH — Google Sign-In with a guest fallback (degrades gracefully if
# GOOGLE_CLIENT_ID isn't set, same pattern as the Razorpay integration)
# =========================================================================

def _current_user(authorization: Optional[str]) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    claims = google_auth.verify_session_token(authorization.removeprefix("Bearer ").strip())
    if not claims:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = user_store.get_user(claims["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="Session refers to an unknown user")
    return user


@router.post("/auth/google", summary="Exchange a Google ID token for a session")
async def auth_google_endpoint(payload: GoogleLoginRequest):
    try:
        claims = google_auth.verify_google_id_token(payload.id_token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    user, is_new_user = user_store.get_or_create(
        claims["sub"], claims["email"], claims["name"], claims.get("picture", "")
    )
    token = google_auth.issue_session_token(user["id"], user["email"], user["name"])
    return {"token": token, "user": user, "is_new_user": is_new_user}


@router.post("/auth/guest", summary="Start a guest session (no Google login required)")
async def auth_guest_endpoint():
    guest_id = google_auth.new_guest_id()
    user, is_new_user = user_store.get_or_create(guest_id, "", "Guest", "")
    token = google_auth.issue_session_token(user["id"], user["email"], user["name"])
    return {"token": token, "user": user, "is_new_user": is_new_user}


@router.get("/auth/me", summary="Get the current session's user")
async def auth_me_endpoint(authorization: Optional[str] = Header(None)):
    return {"user": _current_user(authorization)}


@router.post("/auth/onboarding-seen", summary="Mark the onboarding walkthrough as completed")
async def auth_onboarding_seen_endpoint(authorization: Optional[str] = Header(None)):
    user = _current_user(authorization)
    user_store.mark_onboarding_seen(user["id"])
    return {"status": "ok"}


@router.get("/email/log", summary="Email escalation log (UI adapter)")
async def email_log_endpoint():
    return shipment_store.list_email_logs()


@router.post("/email/send", summary="Send an escalation email (UI adapter)")
async def send_email_endpoint(payload: SendEmailRequest):
    resend_api_key = os.getenv("RESEND_API_KEY")
    msg_id = f"msg_{int(time.time()*1000)}"
    timestamp = datetime.datetime.utcnow().isoformat() + "Z"

    if resend_api_key:
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {resend_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": "ClearanceGuard <onboarding@resend.dev>",
                        "to": [payload.recipient_email],
                        "subject": payload.subject,
                        "html": payload.html_content or payload.subject,
                    },
                    timeout=10.0,
                )
                if res.status_code in (200, 201):
                    data = res.json()
                    entry = {
                        "id": data.get("id", msg_id),
                        "shipment_id": payload.shipment_id,
                        "recipient_email": payload.recipient_email,
                        "subject": payload.subject,
                        "body": payload.html_content or "",
                        "status": "sent",
                        "created_at": timestamp,
                    }
                    shipment_store.add_email_log(entry)
                    return {
                        "status": "sent",
                        "id": entry["id"],
                        "message": f"Email delivered to {payload.recipient_email} via Resend.",
                    }
        except Exception as e:
            logger.warning(f"Resend email dispatch failed: {e}")

    # Fallback / draft-logged when RESEND_API_KEY is unset or fails
    entry = {
        "id": msg_id,
        "shipment_id": payload.shipment_id,
        "recipient_email": payload.recipient_email,
        "subject": payload.subject,
        "body": payload.html_content or "",
        "status": "awaiting_keys",
        "created_at": timestamp,
    }
    shipment_store.add_email_log(entry)
    return {
        "awaiting_keys": True,
        "status": "awaiting_keys",
        "id": msg_id,
        "message": "Human-approved draft logged to escalation audit trail. Set RESEND_API_KEY for live delivery.",
    }



@router.get("/integrations", summary="Integration docs shown in the Integrations page (UI adapter)")
async def integrations_endpoint():
    return {
        "rest_endpoints": [
            {"method": "POST", "path": "/api/simulate", "desc": "Predict hold risk for a shipment before it ships"},
            {"method": "POST", "path": "/api/record-outcome", "desc": "Record what customs actually decided, growing the immune-memory graph"},
            {"method": "GET", "path": "/api/graph", "desc": "Read the current pattern graph"},
            {"method": "GET", "path": "/api/patterns", "desc": "Query learned hold patterns by HS code / country"},
            {"method": "POST", "path": "/api/voice-query", "desc": "Ask a shipment's hold risk by voice (STT -> graph -> TTS)"},
        ],
        "mcp_tools": [
            {"name": "check_shipment_risk", "desc": "MCP tool wrapping /api/simulate"},
            {"name": "record_outcome_tool", "desc": "MCP tool wrapping /api/record-outcome"},
            {"name": "query_patterns_tool", "desc": "MCP tool wrapping /api/patterns"},
        ],
        "voice_providers": list(VALID_PROVIDERS),
        "llm_answer_providers": list(VALID_LLM_ANSWER_PROVIDERS),
        "note": "REST and MCP are two views of the same locked contract - see TASKS.md.",
    }
