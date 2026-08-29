"""Voice pipeline configuration, read from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass

VALID_PROVIDERS = ("text_only", "openai", "gemini", "local")

DEFAULT_PROVIDER = "text_only"


@dataclass(frozen=True)
class VoiceSettings:
    """Immutable snapshot of the voice-pipeline environment."""

    provider: str = DEFAULT_PROVIDER
    request_timeout: float = 30.0

    # OpenAI (also used for any OpenAI-compatible gateway via base_url)
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_stt_model: str = "whisper-1"
    openai_tts_model: str = "gpt-4o-mini-tts"
    openai_tts_voice: str = "alloy"

    # Gemini
    gemini_api_key: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_stt_model: str = "gemini-2.0-flash"
    gemini_tts_model: str = "gemini-2.5-flash-preview-tts"
    gemini_tts_voice: str = "Kore"

    # Local sidecar services
    stt_url: str = "http://stt:8100"
    tts_url: str = "http://tts:8200"

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> VoiceSettings:
        source = env if env is not None else os.environ
        provider = source.get("VOICE_PROVIDER", DEFAULT_PROVIDER).strip().lower()
        if provider not in VALID_PROVIDERS:
            provider = DEFAULT_PROVIDER
        return cls(
            provider=provider,
            request_timeout=_float(source, "VOICE_TIMEOUT", 30.0),
            openai_api_key=source.get("OPENAI_API_KEY", ""),
            openai_base_url=source.get(
                "OPENAI_BASE_URL", "https://api.openai.com/v1"
            ).rstrip("/"),
            openai_stt_model=source.get("OPENAI_STT_MODEL", "whisper-1"),
            openai_tts_model=source.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
            openai_tts_voice=source.get("OPENAI_TTS_VOICE", "alloy"),
            gemini_api_key=source.get("GEMINI_API_KEY", ""),
            gemini_base_url=source.get(
                "GEMINI_BASE_URL",
                "https://generativelanguage.googleapis.com/v1beta",
            ).rstrip("/"),
            gemini_stt_model=source.get("GEMINI_STT_MODEL", "gemini-2.0-flash"),
            gemini_tts_model=source.get(
                "GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts"
            ),
            gemini_tts_voice=source.get("GEMINI_TTS_VOICE", "Kore"),
            stt_url=source.get("STT_URL", "http://stt:8100").rstrip("/"),
            tts_url=source.get("TTS_URL", "http://tts:8200").rstrip("/"),
        )


def _float(source: dict[str, str], key: str, default: float) -> float:
    try:
        return float(source.get(key, default))
    except (TypeError, ValueError):
        return default
