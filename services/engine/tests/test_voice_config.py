"""Unit tests for voice pipeline configuration."""

from __future__ import annotations

import pytest
from voice.config import DEFAULT_PROVIDER, VoiceSettings


@pytest.mark.unit
class TestVoiceSettingsFromEnv:
    def test_defaults_when_env_empty(self):
        settings = VoiceSettings.from_env({})

        assert settings.provider == DEFAULT_PROVIDER
        assert settings.openai_base_url == "https://api.openai.com/v1"
        assert settings.request_timeout == 30.0

    def test_reads_provider_case_insensitively(self):
        assert (
            VoiceSettings.from_env({"VOICE_PROVIDER": "  OpenAI "}).provider == "openai"
        )

    def test_unknown_provider_falls_back_to_default(self):
        assert (
            VoiceSettings.from_env({"VOICE_PROVIDER": "whisper"}).provider
            == DEFAULT_PROVIDER
        )

    def test_strips_trailing_slash_from_urls(self):
        settings = VoiceSettings.from_env(
            {
                "OPENAI_BASE_URL": "https://gw.example/v1/",
                "STT_URL": "http://stt:8100/",
                "TTS_URL": "http://tts:8200/",
            }
        )

        assert settings.openai_base_url == "https://gw.example/v1"
        assert settings.stt_url == "http://stt:8100"
        assert settings.tts_url == "http://tts:8200"

    def test_bad_timeout_is_ignored(self):
        assert VoiceSettings.from_env({"VOICE_TIMEOUT": "soon"}).request_timeout == 30.0

    def test_smallest_defaults(self):
        settings = VoiceSettings.from_env({"SMALLEST_AI_KEY": "sk"})

        assert settings.smallest_api_key == "sk"
        assert settings.smallest_base_url == "https://api.smallest.ai/waves/v1"
        assert settings.smallest_tts_model == "lightning_v3.1"
        assert settings.smallest_tts_voice == "srishti"
        assert settings.smallest_tts_sample_rate == 24000
        assert settings.smallest_tts_speed == 1.0

    def test_smallest_base_url_trailing_slash_stripped(self):
        settings = VoiceSettings.from_env(
            {"SMALLEST_BASE_URL": "https://api.smallest.ai/waves/v1/"}
        )
        assert settings.smallest_base_url == "https://api.smallest.ai/waves/v1"

    def test_bad_sample_rate_is_ignored(self):
        assert (
            VoiceSettings.from_env({"SMALLEST_TTS_SAMPLE_RATE": "fast"})
            .smallest_tts_sample_rate
            == 24000
        )

    def test_tts_provider_defaults_to_unset(self):
        assert VoiceSettings.from_env({}).tts_provider == ""

    def test_tts_provider_read_case_insensitively(self):
        assert (
            VoiceSettings.from_env({"TTS_PROVIDER": " Smallest "}).tts_provider
            == "smallest"
        )

    def test_unknown_tts_provider_falls_back_to_unset(self):
        assert VoiceSettings.from_env({"TTS_PROVIDER": "polly"}).tts_provider == ""

    def test_is_frozen(self):
        settings = VoiceSettings.from_env({})
        with pytest.raises(AttributeError):
            settings.provider = "openai"  # type: ignore[misc]
