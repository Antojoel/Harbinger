"""Extract the engine's required fields from uploaded customs documents.

Not general document understanding — the risk engine only ever reads five
values out of four documents (see graph/rules.py):
    commercial_invoice: units, hs_code
    packing_list:       units
    bill_of_lading:     hs_code (used as the shipment's *declared* hs_code)
    certificate_of_origin: presence only - no extraction needed at all

So this module extracts exactly those, via Vertex AI Gemini's multimodal
generateContent (the same service-account credential and endpoint pattern
already used for voice transcription in voice/providers.py's
VertexProvider - just swapping audio bytes for a document image/PDF).
"""

from __future__ import annotations

import base64
import json
import logging

import httpx

from voice.config import VoiceSettings
from voice.providers import VoiceProviderError, build_client, vertex_access_token

logger = logging.getLogger("harbinger.documents")

_DEFAULT_MODEL = "gemini-2.5-flash"

_PROMPTS = {
    "commercial_invoice": (
        "This is a commercial invoice for a customs shipment. Extract exactly "
        'these fields as JSON: {"units": <integer quantity/unit count declared '
        '(a whole number, e.g. 250)>, "hs_code": "<HS/tariff code as shown, '
        'e.g. 8471.30>"}. Reply with ONLY that JSON object, no other text, no '
        "markdown fencing."
    ),
    "packing_list": (
        "This is a packing list for a customs shipment. Extract exactly this "
        'field as JSON: {"units": <integer quantity/unit count declared>}. '
        "Reply with ONLY that JSON object, no other text, no markdown fencing."
    ),
    "bill_of_lading": (
        "This is a bill of lading for a customs shipment. Extract exactly this "
        'field as JSON: {"hs_code": "<HS/tariff code as shown, e.g. 8471.30>"}. '
        "Reply with ONLY that JSON object, no other text, no markdown fencing."
    ),
}

DOCUMENT_TYPES = tuple(_PROMPTS)


class ExtractionError(Exception):
    """A document's required field(s) couldn't be extracted."""


def _mime_for(filename: str, content_type: str | None) -> str:
    if content_type:
        return content_type
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return "application/pdf"
    if name.endswith(".png"):
        return "image/png"
    return "image/jpeg"


def _parse_json_response(doc_type: str, text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ExtractionError(
            f"{doc_type}: could not parse extracted fields from model output: {text[:200]!r}"
        ) from exc


async def extract_document(
    doc_type: str,
    filename: str,
    content: bytes,
    content_type: str | None,
    settings: VoiceSettings,
) -> dict:
    """Returns the extracted fields dict for one document (see _PROMPTS).

    Raises ExtractionError on any failure - missing/invalid Vertex
    credentials, a network error, or a response that isn't parseable JSON.
    Callers should turn that into a 422 (this is a caller-fixable problem -
    wrong file, unreadable scan - not a 500).
    """
    if doc_type not in _PROMPTS:
        raise ExtractionError(f"unknown document type '{doc_type}'")
    if not content:
        raise ExtractionError(f"{doc_type}: no file content provided")

    try:
        token = vertex_access_token(settings)
    except VoiceProviderError as exc:
        raise ExtractionError(f"{doc_type}: Vertex AI not configured ({exc})") from exc

    model = settings.vertex_stt_model or _DEFAULT_MODEL
    mime = _mime_for(filename, content_type)
    path = (
        f"/v1/projects/{settings.vertex_project_id}/locations/"
        f"{settings.vertex_location}/publishers/google/models/{model}:generateContent"
    )
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": _PROMPTS[doc_type]},
                    {"inline_data": {"mime_type": mime, "data": base64.b64encode(content).decode("ascii")}},
                ],
            }
        ],
        "generationConfig": {"maxOutputTokens": 512},
    }
    try:
        async with build_client(
            base_url=f"https://{settings.vertex_location}-aiplatform.googleapis.com",
            headers={"Authorization": f"Bearer {token}"},
            timeout=settings.request_timeout,
        ) as client:
            response = await client.post(path, json=payload)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ExtractionError(f"{doc_type}: Vertex AI request failed: {exc}") from exc

    data = response.json()
    try:
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(str(p.get("text", "")) for p in parts).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise ExtractionError(f"{doc_type}: malformed model response") from exc
    if not text:
        raise ExtractionError(f"{doc_type}: model returned no text (unreadable document?)")

    fields = _parse_json_response(doc_type, text)
    logger.info("extracted %s: %s", doc_type, fields)
    return fields
