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
