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

    def test_is_frozen(self):
        settings = VoiceSettings.from_env({})
        with pytest.raises(AttributeError):
            settings.provider = "openai"  # type: ignore[misc]
