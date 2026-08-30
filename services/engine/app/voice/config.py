"""Voice pipeline configuration, read from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass

VALID_PROVIDERS = ("text_only", "openai", "gemini", "local", "vertex")

DEFAULT_PROVIDER = "text_only"

# Answer generation is a separate axis from the speech provider above: this
# picks how response_text is worded, not how audio is transcribed/synthesised.
# "heuristic" is the original deterministic template (no LLM call, always
# available); "openai"/"gemini" ground an LLM in the same graph facts.
VALID_LLM_ANSWER_PROVIDERS = ("heuristic", "openai", "gemini")

DEFAULT_LLM_ANSWER_PROVIDER = "heuristic"

# Synthesis can be pointed at a different backend than transcription. The
# providers above each do both halves, but the best STT and the best TTS are
# rarely the same service - the local faster-whisper container transcribes
# well while Smallest AI's Waves speaks far better than Kokoro, and Waves has
# no STT at all. An empty value (the default) means "use VOICE_PROVIDER for
# both", so nothing changes for anyone who does not set this.
VALID_TTS_PROVIDERS = ("smallest", "openai", "gemini", "local", "vertex", "text_only")


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

    # Smallest AI Waves (Lightning) - TTS only, no STT.
    smallest_api_key: str = ""
    smallest_base_url: str = "https://api.smallest.ai/waves/v1"
    smallest_tts_model: str = "lightning_v3.1"
    # A valid voice id is required - Waves 400s on an unknown one rather than
    # falling back to a default. List them with
    #   GET https://api.smallest.ai/waves/v1/lightning-v3.1/get_voices
    # (note: hyphenated model in that path, underscored in the /tts body).
    # "srishti" speaks English and Hindi, which matches the beachhead market.
    smallest_tts_voice: str = "srishti"
    smallest_tts_language: str = "en"
    smallest_tts_sample_rate: int = 24000
    smallest_tts_speed: float = 1.0

    # Local sidecar services
    stt_url: str = "http://stt:8100"
    tts_url: str = "http://tts:8200"

    # Vertex AI (service-account auth, not an API key). STT via Gemini
    # generateContent (standard multimodal, long-GA); TTS via the separate
    # Cloud Text-to-Speech API rather than generateContent's native-audio
    # output, since that's a newer capability with narrower region/preview
    # availability - not something to gamble a live demo on.
    vertex_service_account_json_b64: str = ""
    vertex_project_id: str = ""
    vertex_location: str = "us-central1"
    vertex_stt_model: str = "gemini-2.5-flash"
    vertex_tts_voice: str = "en-US-Neural2-C"

    # Answer generation (response_text wording) - independent of the speech
    # provider above. "heuristic" (default) needs no key. "openai"/"gemini"
    # reuse the API keys already configured for speech.
    llm_answer_provider: str = DEFAULT_LLM_ANSWER_PROVIDER
    llm_answer_model: str = ""

    # Synthesis-only override; "" means "same provider as `provider`".
    tts_provider: str = ""

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> VoiceSettings:
        source = env if env is not None else os.environ
        provider = source.get("VOICE_PROVIDER", DEFAULT_PROVIDER).strip().lower()
        if provider not in VALID_PROVIDERS:
            provider = DEFAULT_PROVIDER
        llm_answer_provider = (
            source.get("LLM_ANSWER_PROVIDER", DEFAULT_LLM_ANSWER_PROVIDER).strip().lower()
        )
        if llm_answer_provider not in VALID_LLM_ANSWER_PROVIDERS:
            llm_answer_provider = DEFAULT_LLM_ANSWER_PROVIDER
        tts_provider = source.get("TTS_PROVIDER", "").strip().lower()
        if tts_provider not in VALID_TTS_PROVIDERS:
            tts_provider = ""
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
            smallest_api_key=source.get("SMALLEST_AI_KEY", ""),
            smallest_base_url=source.get(
                "SMALLEST_BASE_URL", "https://api.smallest.ai/waves/v1"
            ).rstrip("/"),
            smallest_tts_model=source.get("SMALLEST_TTS_MODEL", "lightning_v3.1"),
            smallest_tts_voice=source.get("SMALLEST_TTS_VOICE", "srishti"),
            smallest_tts_language=source.get("SMALLEST_TTS_LANGUAGE", "en"),
            smallest_tts_sample_rate=_int(source, "SMALLEST_TTS_SAMPLE_RATE", 24000),
            smallest_tts_speed=_float(source, "SMALLEST_TTS_SPEED", 1.0),
            stt_url=source.get("STT_URL", "http://stt:8100").rstrip("/"),
            tts_url=source.get("TTS_URL", "http://tts:8200").rstrip("/"),
            vertex_service_account_json_b64=source.get(
                "GOOGLE_SERVICE_ACCOUNT_JSON_B64", ""
            ),
            vertex_project_id=source.get("VERTEX_PROJECT_ID", ""),
            vertex_location=source.get("VERTEX_LOCATION", "us-central1"),
            vertex_stt_model=source.get("VERTEX_STT_MODEL", "gemini-2.5-flash"),
            vertex_tts_voice=source.get("VERTEX_TTS_VOICE", "en-US-Neural2-C"),
            llm_answer_provider=llm_answer_provider,
            llm_answer_model=source.get("LLM_ANSWER_MODEL", ""),
            tts_provider=tts_provider,
        )


def _float(source: dict[str, str], key: str, default: float) -> float:
    try:
        return float(source.get(key, default))
    except (TypeError, ValueError):
        return default


def _int(source: dict[str, str], key: str, default: int) -> int:
    try:
        return int(source.get(key, default))
    except (TypeError, ValueError):
        return default
