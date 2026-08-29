"""Unit tests for the speech providers (no live speech services)."""

from __future__ import annotations

import base64
import json

import httpx
import pytest
from voice import providers
from voice.config import VoiceSettings
from voice.providers import (
    GeminiProvider,
    LocalProvider,
    OpenAIProvider,
    TextOnlyProvider,
    VoiceProviderError,
    get_provider,
    pcm_to_wav,
)


def _mock_transport(monkeypatch, handler):
    real = httpx.AsyncClient

    def factory(**kwargs):
        kwargs.pop("transport", None)
        return real(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(providers, "build_client", factory)


@pytest.mark.unit
class TestTextOnlyProvider:
    async def test_transcribe_decodes_bytes_as_text(self):
        text = await TextOnlyProvider().transcribe(b"  what is the risk  ", "audio/wav")
        assert text == "what is the risk"

    async def test_synthesize_returns_empty_audio(self):
        audio = await TextOnlyProvider().synthesize("anything")
        assert audio.is_empty


@pytest.mark.unit
class TestOpenAIProvider:
    def _settings(self):
        return VoiceSettings.from_env({"OPENAI_API_KEY": "sk-test"})

    def test_requires_api_key(self):
        with pytest.raises(VoiceProviderError):
            OpenAIProvider(VoiceSettings.from_env({}))

    async def test_transcribe(self, monkeypatch):
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["url"] = str(request.url)
            seen["auth"] = request.headers.get("authorization")
            return httpx.Response(200, json={"text": "what's the hold risk"})

        _mock_transport(monkeypatch, handler)
        result = await OpenAIProvider(self._settings()).transcribe(
            b"RIFFfake", "audio/wav"
        )

        assert result == "what's the hold risk"
        assert seen["url"].endswith("/audio/transcriptions")
        assert seen["auth"] == "Bearer sk-test"

    async def test_transcribe_empty_audio_skips_call(self, monkeypatch):
        _mock_transport(monkeypatch, lambda r: httpx.Response(500))
        assert await OpenAIProvider(self._settings()).transcribe(b"", "audio/wav") == ""

    async def test_synthesize_returns_audio_bytes(self, monkeypatch):
        _mock_transport(
            monkeypatch, lambda r: httpx.Response(200, content=b"ID3mp3bytes")
        )
        audio = await OpenAIProvider(self._settings()).synthesize("held, missing cert")

        assert audio.data == b"ID3mp3bytes"
        assert audio.mime == "audio/mpeg"

    async def test_http_error_becomes_provider_error(self, monkeypatch):
        _mock_transport(
            monkeypatch, lambda r: httpx.Response(401, json={"error": "no"})
        )
        with pytest.raises(VoiceProviderError):
            await OpenAIProvider(self._settings()).synthesize("x")


@pytest.mark.unit
class TestGeminiProvider:
    def _settings(self):
        return VoiceSettings.from_env({"GEMINI_API_KEY": "g-test"})

    def test_requires_api_key(self):
        with pytest.raises(VoiceProviderError):
            GeminiProvider(VoiceSettings.from_env({}))

    async def test_transcribe_reads_first_text_part(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            assert "g-test" in str(request.url)
            return httpx.Response(
                200,
                json={
                    "candidates": [{"content": {"parts": [{"text": "risk please"}]}}]
                },
            )

        _mock_transport(monkeypatch, handler)
        assert (
            await GeminiProvider(self._settings()).transcribe(b"aud", "audio/wav")
            == "risk please"
        )

    async def test_synthesize_wraps_pcm_in_wav(self, monkeypatch):
        pcm = b"\x00\x01" * 50
        payload = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"inline_data": {"data": base64.b64encode(pcm).decode()}}
                        ]
                    }
                }
            ]
        }
        _mock_transport(monkeypatch, lambda r: httpx.Response(200, json=payload))

        audio = await GeminiProvider(self._settings()).synthesize("hello")

        assert audio.mime == "audio/wav"
        assert audio.data.startswith(b"RIFF")

    async def test_synthesize_no_audio_part_returns_empty(self, monkeypatch):
        _mock_transport(
            monkeypatch, lambda r: httpx.Response(200, json={"candidates": []})
        )
        assert (await GeminiProvider(self._settings()).synthesize("x")).is_empty


@pytest.mark.unit
class TestLocalProvider:
    def _settings(self):
        return VoiceSettings.from_env(
            {"STT_URL": "http://stt:8100", "TTS_URL": "http://tts:8200"}
        )

    async def test_transcribe_posts_to_stt_service(self, monkeypatch):
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["url"] = str(request.url)
            return httpx.Response(200, json={"text": "spoken question"})

        _mock_transport(monkeypatch, handler)
        result = await LocalProvider(self._settings()).transcribe(b"RIFF", "audio/wav")

        assert result == "spoken question"
        assert seen["url"] == "http://stt:8100/transcribe"

    async def test_synthesize_posts_to_tts_service(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            assert json.loads(request.content) == {"text": "the answer"}
            return httpx.Response(
                200, content=b"RIFFwav", headers={"content-type": "audio/wav"}
            )

        _mock_transport(monkeypatch, handler)
        audio = await LocalProvider(self._settings()).synthesize("the answer")

        assert audio.data == b"RIFFwav"
        assert audio.mime == "audio/wav"

    async def test_stt_down_becomes_provider_error(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused", request=request)

        _mock_transport(monkeypatch, handler)
        with pytest.raises(VoiceProviderError):
            await LocalProvider(self._settings()).transcribe(b"RIFF", "audio/wav")


@pytest.mark.unit
class TestGetProvider:
    def test_text_only(self):
        assert isinstance(
            get_provider(VoiceSettings.from_env({"VOICE_PROVIDER": "text_only"})),
            TextOnlyProvider,
        )

    def test_openai_selected(self):
        provider = get_provider(
            VoiceSettings.from_env({"VOICE_PROVIDER": "openai", "OPENAI_API_KEY": "sk"})
        )
        assert isinstance(provider, OpenAIProvider)

    def test_falls_back_to_text_only_on_missing_key(self):
        provider = get_provider(VoiceSettings.from_env({"VOICE_PROVIDER": "openai"}))
        assert isinstance(provider, TextOnlyProvider)


@pytest.mark.unit
class TestPcmToWav:
    def test_produces_valid_riff_header(self):
        wav = pcm_to_wav(b"\x00\x00" * 100, rate=24000)
        assert wav[:4] == b"RIFF"
        assert wav[8:12] == b"WAVE"
