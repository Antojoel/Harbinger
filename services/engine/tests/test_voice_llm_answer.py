"""Unit tests for the LLM-grounded answer path (no live LLM calls)."""

from __future__ import annotations

import httpx
import pytest
from test_voice_providers import _fake_service_account_b64
from voice import llm_answer
from voice.config import VoiceSettings
from voice.llm_answer import build_llm_answer
from voice.providers import VoiceProviderError


def _mock_transport(monkeypatch, handler):
    real = httpx.AsyncClient

    def factory(**kwargs):
        kwargs.pop("transport", None)
        return real(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(llm_answer, "build_client", factory)


FACTS_HELD = {
    "exists": True,
    "status": "held",
    "patterns": [
        {
            "pattern_id": "PAT-001",
            "type": "unit_mismatch",
            "detail": "Invoice 500 vs Packing List 480",
            "confidence": 0.82,
        }
    ],
}


@pytest.mark.unit
class TestBuildLlmAnswer:
    async def test_unsupported_provider_raises(self):
        settings = VoiceSettings.from_env({"LLM_ANSWER_PROVIDER": "heuristic"})
        with pytest.raises(VoiceProviderError):
            await build_llm_answer("MSKU1", "why?", FACTS_HELD, settings)


@pytest.mark.unit
class TestOpenAIAnswer:
    def _settings(self, **extra):
        env = {"LLM_ANSWER_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}
        env.update(extra)
        return VoiceSettings.from_env(env)

    async def test_requires_api_key(self):
        settings = VoiceSettings.from_env({"LLM_ANSWER_PROVIDER": "openai"})
        with pytest.raises(VoiceProviderError, match="OPENAI_API_KEY"):
            await build_llm_answer("MSKU1", "why?", FACTS_HELD, settings)

    async def test_sends_facts_and_question_returns_answer(self, monkeypatch):
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["url"] = str(request.url)
            seen["auth"] = request.headers.get("authorization")
            seen["body"] = request.content
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {"message": {"content": "This shipment is held over a unit mismatch."}}
                    ]
                },
            )

        _mock_transport(monkeypatch, handler)
        answer = await build_llm_answer("MSKU1234567", "why is this flagged?", FACTS_HELD, self._settings())

        assert answer == "This shipment is held over a unit mismatch."
        assert seen["url"].endswith("/chat/completions")
        assert seen["auth"] == "Bearer sk-test"
        assert b"unit_mismatch" in seen["body"]
        assert b"why is this flagged?" in seen["body"]

    async def test_malformed_response_raises(self, monkeypatch):
        _mock_transport(monkeypatch, lambda r: httpx.Response(200, json={"unexpected": True}))
        with pytest.raises(VoiceProviderError, match="malformed"):
            await build_llm_answer("MSKU1", "why?", FACTS_HELD, self._settings())

    async def test_http_error_raises(self, monkeypatch):
        _mock_transport(monkeypatch, lambda r: httpx.Response(500))
        with pytest.raises(VoiceProviderError, match="generation failed"):
            await build_llm_answer("MSKU1", "why?", FACTS_HELD, self._settings())

    async def test_uses_configured_model(self, monkeypatch):
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["body"] = request.content
            return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

        _mock_transport(monkeypatch, handler)
        await build_llm_answer(
            "MSKU1", "why?", FACTS_HELD, self._settings(LLM_ANSWER_MODEL="gpt-4o")
        )

        assert b'"model":"gpt-4o"' in seen["body"] or b'"gpt-4o"' in seen["body"]


@pytest.mark.unit
class TestGeminiAnswer:
    """gemini reuses the vertex speech provider's service-account credential,
    not a separate AI Studio API key - see voice/providers.py's
    vertex_access_token()."""

    def _settings(self, **extra):
        env = {
            "LLM_ANSWER_PROVIDER": "gemini",
            "GOOGLE_SERVICE_ACCOUNT_JSON_B64": _fake_service_account_b64(),
            "VERTEX_PROJECT_ID": "test-project",
        }
        env.update(extra)
        return VoiceSettings.from_env(env)

    async def test_requires_vertex_credentials(self):
        settings = VoiceSettings.from_env({"LLM_ANSWER_PROVIDER": "gemini"})
        with pytest.raises(VoiceProviderError, match="GOOGLE_SERVICE_ACCOUNT_JSON_B64"):
            await build_llm_answer("MSKU1", "why?", FACTS_HELD, settings)

    async def test_sends_facts_and_question_returns_answer(self, monkeypatch):
        monkeypatch.setattr(llm_answer, "vertex_access_token", lambda _settings: "fake-token")
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["url"] = str(request.url)
            seen["auth"] = request.headers.get("authorization")
            seen["body"] = request.content
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {"content": {"parts": [{"text": "Held: a unit count mismatch."}]}}
                    ]
                },
            )

        _mock_transport(monkeypatch, handler)
        answer = await build_llm_answer("MSKU1234567", "why?", FACTS_HELD, self._settings())

        assert answer == "Held: a unit count mismatch."
        assert "test-project" in seen["url"]
        assert "generateContent" in seen["url"]
        assert seen["auth"] == "Bearer fake-token"
        assert b"unit_mismatch" in seen["body"]

    async def test_malformed_response_raises(self, monkeypatch):
        monkeypatch.setattr(llm_answer, "vertex_access_token", lambda _settings: "fake-token")
        _mock_transport(monkeypatch, lambda r: httpx.Response(200, json={}))
        with pytest.raises(VoiceProviderError, match="malformed"):
            await build_llm_answer("MSKU1", "why?", FACTS_HELD, self._settings())

    async def test_http_error_raises(self, monkeypatch):
        monkeypatch.setattr(llm_answer, "vertex_access_token", lambda _settings: "fake-token")
        _mock_transport(monkeypatch, lambda r: httpx.Response(500))
        with pytest.raises(VoiceProviderError, match="generation failed"):
            await build_llm_answer("MSKU1", "why?", FACTS_HELD, self._settings())
