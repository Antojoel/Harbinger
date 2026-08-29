"""Unit tests for document field extraction (no live Vertex AI calls)."""

from __future__ import annotations

import httpx
import pytest
from documents import extraction
from documents.extraction import ExtractionError, extract_document
from test_voice_providers import _fake_service_account_b64
from voice.config import VoiceSettings


def _mock_transport(monkeypatch, handler):
    real = httpx.AsyncClient

    def factory(**kwargs):
        kwargs.pop("transport", None)
        return real(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(extraction, "build_client", factory)
    # A syntactically valid but fake service account still hits Google's
    # real OAuth endpoint when the token is actually minted - bypass that
    # entirely, same as test_voice_llm_answer.py's Vertex-Gemini tests.
    monkeypatch.setattr(extraction, "vertex_access_token", lambda _settings: "fake-token")


def _settings():
    return VoiceSettings.from_env(
        {
            "GOOGLE_SERVICE_ACCOUNT_JSON_B64": _fake_service_account_b64(),
            "VERTEX_PROJECT_ID": "test-project",
        }
    )


def _gemini_response(text: str) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


@pytest.mark.unit
class TestExtractDocument:
    async def test_unknown_document_type_raises(self):
        with pytest.raises(ExtractionError, match="unknown document type"):
            await extract_document("shipping_manifest", "f.pdf", b"data", None, _settings())

    async def test_empty_content_raises(self):
        with pytest.raises(ExtractionError, match="no file content"):
            await extract_document("commercial_invoice", "f.pdf", b"", None, _settings())

    async def test_missing_vertex_credentials_raises(self):
        settings = VoiceSettings.from_env({})  # no service account configured
        with pytest.raises(ExtractionError, match="Vertex AI not configured"):
            await extract_document("commercial_invoice", "f.pdf", b"%PDF-1.4", None, settings)

    async def test_extracts_invoice_fields(self, monkeypatch):
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["url"] = str(request.url)
            seen["auth"] = request.headers.get("authorization")
            return httpx.Response(200, json=_gemini_response('{"units": 250, "hs_code": "8471.30"}'))

        _mock_transport(monkeypatch, handler)
        fields = await extract_document(
            "commercial_invoice", "invoice.pdf", b"%PDF-1.4 fake", "application/pdf", _settings()
        )

        assert fields == {"units": 250, "hs_code": "8471.30"}
        assert "generateContent" in seen["url"]
        assert "test-project" in seen["url"]

    async def test_extracts_packing_list_units_only(self, monkeypatch):
        _mock_transport(
            monkeypatch, lambda r: httpx.Response(200, json=_gemini_response('{"units": 480}'))
        )
        fields = await extract_document(
            "packing_list", "packing.pdf", b"%PDF-1.4 fake", "application/pdf", _settings()
        )
        assert fields == {"units": 480}

    async def test_extracts_bill_of_lading_hs_code_only(self, monkeypatch):
        _mock_transport(
            monkeypatch, lambda r: httpx.Response(200, json=_gemini_response('{"hs_code": "8504.41"}'))
        )
        fields = await extract_document(
            "bill_of_lading", "bol.pdf", b"%PDF-1.4 fake", "application/pdf", _settings()
        )
        assert fields == {"hs_code": "8504.41"}

    async def test_strips_markdown_code_fence(self, monkeypatch):
        _mock_transport(
            monkeypatch,
            lambda r: httpx.Response(200, json=_gemini_response('```json\n{"units": 100}\n```')),
        )
        fields = await extract_document(
            "packing_list", "p.pdf", b"%PDF-1.4 fake", "application/pdf", _settings()
        )
        assert fields == {"units": 100}

    async def test_unparseable_response_raises(self, monkeypatch):
        _mock_transport(
            monkeypatch, lambda r: httpx.Response(200, json=_gemini_response("I can't read this scan."))
        )
        with pytest.raises(ExtractionError, match="could not parse"):
            await extract_document("packing_list", "p.pdf", b"data", "application/pdf", _settings())

    async def test_empty_model_response_raises(self, monkeypatch):
        _mock_transport(monkeypatch, lambda r: httpx.Response(200, json=_gemini_response("")))
        with pytest.raises(ExtractionError, match="no text"):
            await extract_document("packing_list", "p.pdf", b"data", "application/pdf", _settings())

    async def test_http_error_raises(self, monkeypatch):
        _mock_transport(monkeypatch, lambda r: httpx.Response(500))
        with pytest.raises(ExtractionError, match="request failed"):
            await extract_document("packing_list", "p.pdf", b"data", "application/pdf", _settings())

    async def test_mime_type_guessed_from_filename_when_absent(self, monkeypatch):
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            import json

            seen["mime"] = json.loads(request.content)["contents"][0]["parts"][1]["inline_data"]["mime_type"]
            return httpx.Response(200, json=_gemini_response('{"units": 1}'))

        _mock_transport(monkeypatch, handler)
        await extract_document("packing_list", "packing.png", b"pngdata", None, _settings())

        assert seen["mime"] == "image/png"
