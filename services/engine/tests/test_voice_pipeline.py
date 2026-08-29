"""Unit tests for the voice-query orchestration pipeline."""

from __future__ import annotations

import base64

import pytest
from voice import pipeline as pipeline_module
from voice.config import VoiceSettings
from voice.providers import EMPTY_AUDIO, Audio, VoiceProviderError


class FakeProvider:
    name = "fake"

    def __init__(
        self, *, transcript="heard it", audio=None, fail_stt=False, fail_tts=False
    ):
        self._transcript = transcript
        self._audio = audio if audio is not None else Audio(b"WAVDATA", "audio/wav")
        self._fail_stt = fail_stt
        self._fail_tts = fail_tts
        self.synth_input: str | None = None

    async def transcribe(self, audio: bytes, mime: str) -> str:
        if self._fail_stt:
            raise VoiceProviderError("stt down")
        return self._transcript

    async def synthesize(self, text: str) -> Audio:
        self.synth_input = text
        if self._fail_tts:
            raise VoiceProviderError("tts down")
        return self._audio


@pytest.fixture
def patch_pipeline(monkeypatch):
    """Wire a FakeProvider and a canned graph answer into the pipeline."""

    def _apply(provider: FakeProvider, answer: str = "Shipment MSKU1 is high risk."):
        monkeypatch.setattr(pipeline_module, "get_provider", lambda _s: provider)
        monkeypatch.setattr(
            pipeline_module, "build_spoken_answer", lambda _sid, _t: answer
        )

    return _apply


@pytest.mark.unit
class TestAnswerVoiceQuery:
    async def test_happy_path_returns_contract_shape(self, patch_pipeline):
        provider = FakeProvider(transcript="what is the hold risk")
        patch_pipeline(provider, answer="Shipment MSKU1 is high risk, 82 percent.")

        result = await pipeline_module.answer_voice_query(
            "MSKU1", base64.b64encode(b"RIFF...").decode(), settings=VoiceSettings()
        )

        assert set(result) == {"transcript", "response_text", "response_audio_base64"}
        assert result["transcript"] == "what is the hold risk"
        assert result["response_text"] == "Shipment MSKU1 is high risk, 82 percent."
        assert base64.b64decode(result["response_audio_base64"]) == b"WAVDATA"
        assert provider.synth_input == "Shipment MSKU1 is high risk, 82 percent."

    async def test_invalid_base64_audio_is_treated_as_empty(self, patch_pipeline):
        provider = FakeProvider(transcript="")
        patch_pipeline(provider)

        result = await pipeline_module.answer_voice_query(
            "MSKU1", "not%%base64", settings=VoiceSettings()
        )

        assert result["transcript"] == ""

    async def test_stt_failure_degrades_but_still_answers(self, patch_pipeline):
        provider = FakeProvider(fail_stt=True)
        patch_pipeline(provider, answer="Shipment MSKU1 has no known hold risks.")

        result = await pipeline_module.answer_voice_query(
            "MSKU1", base64.b64encode(b"x").decode(), settings=VoiceSettings()
        )

        assert result["transcript"] == ""
        assert result["response_text"] == "Shipment MSKU1 has no known hold risks."
        assert base64.b64decode(result["response_audio_base64"]) == b"WAVDATA"

    async def test_tts_failure_leaves_audio_empty(self, patch_pipeline):
        provider = FakeProvider(fail_tts=True)
        patch_pipeline(provider)

        result = await pipeline_module.answer_voice_query(
            "MSKU1", base64.b64encode(b"x").decode(), settings=VoiceSettings()
        )

        assert result["response_audio_base64"] == ""
        assert result["response_text"]

    async def test_empty_synth_result_leaves_audio_empty(self, patch_pipeline):
        provider = FakeProvider(audio=EMPTY_AUDIO)
        patch_pipeline(provider)

        result = await pipeline_module.answer_voice_query(
            "MSKU1", "", settings=VoiceSettings()
        )

        assert result["response_audio_base64"] == ""


@pytest.mark.unit
class TestAnswerEngineSelection:
    """settings.llm_answer_provider picks response_text wording, independent
    of the speech provider (which FakeProvider stands in for here)."""

    async def test_heuristic_is_the_default_and_ignores_llm_machinery(
        self, monkeypatch, patch_pipeline
    ):
        provider = FakeProvider(transcript="why is this flagged?")
        patch_pipeline(provider, answer="heuristic sentence")

        async def boom(*a, **kw):
            raise AssertionError("build_llm_answer should not be called for heuristic")

        monkeypatch.setattr(pipeline_module, "build_llm_answer", boom)

        result = await pipeline_module.answer_voice_query(
            "MSKU1", base64.b64encode(b"x").decode(), settings=VoiceSettings()
        )

        assert result["response_text"] == "heuristic sentence"

    async def test_llm_provider_used_when_configured(self, monkeypatch, patch_pipeline):
        provider = FakeProvider(transcript="why is this flagged?")
        patch_pipeline(provider)
        monkeypatch.setattr(
            pipeline_module, "fetch_shipment_facts", lambda _sid: {"exists": True}
        )

        async def fake_llm(shipment_id, transcript, facts, settings):
            assert shipment_id == "MSKU1"
            assert transcript == "why is this flagged?"
            assert facts == {"exists": True}
            return "llm-worded answer"

        monkeypatch.setattr(pipeline_module, "build_llm_answer", fake_llm)

        result = await pipeline_module.answer_voice_query(
            "MSKU1",
            base64.b64encode(b"x").decode(),
            settings=VoiceSettings(llm_answer_provider="openai"),
        )

        assert result["response_text"] == "llm-worded answer"

    async def test_llm_failure_falls_back_to_heuristic_template(
        self, monkeypatch, patch_pipeline
    ):
        provider = FakeProvider(transcript="why?")
        patch_pipeline(provider)
        monkeypatch.setattr(
            pipeline_module, "fetch_shipment_facts", lambda _sid: {"exists": False}
        )

        async def fake_llm(*a, **kw):
            raise VoiceProviderError("no key")

        monkeypatch.setattr(pipeline_module, "build_llm_answer", fake_llm)
        monkeypatch.setattr(
            pipeline_module,
            "format_heuristic_answer",
            lambda sid, facts: f"heuristic fallback for {sid}",
        )

        result = await pipeline_module.answer_voice_query(
            "MSKU1",
            base64.b64encode(b"x").decode(),
            settings=VoiceSettings(llm_answer_provider="gemini"),
        )

        assert result["response_text"] == "heuristic fallback for MSKU1"
