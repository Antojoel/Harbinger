"""
Speech providers for the voice pipeline.

Each provider implements two async calls:

    transcribe(audio: bytes, mime: str) -> str
    synthesize(text: str) -> Audio

A provider raises :class:`VoiceProviderError` on a hard failure; the pipeline
catches it and degrades gracefully (empty transcript / empty audio, text answer
still returned).
"""

from __future__ import annotations

import base64
import io
import logging
import wave
from dataclasses import dataclass
from typing import Protocol

import httpx

from voice.config import VoiceSettings

logger = logging.getLogger("harbinger.voice")

# Gemini TTS returns raw signed 16-bit little-endian PCM at this rate / channel count.
_GEMINI_PCM_RATE = 24000
_GEMINI_PCM_CHANNELS = 1
_GEMINI_PCM_SAMPLE_WIDTH = 2


class VoiceProviderError(RuntimeError):
    """A speech provider could not complete a request."""


def build_client(**kwargs: object) -> httpx.AsyncClient:
    """Single seam for creating outbound HTTP clients (tests patch this)."""
    return httpx.AsyncClient(**kwargs)  # type: ignore[arg-type]


@dataclass(frozen=True)
class Audio:
    """Synthesised speech plus its MIME type."""

    data: bytes
    mime: str = "audio/wav"

    @property
    def is_empty(self) -> bool:
        return not self.data


EMPTY_AUDIO = Audio(b"", "audio/wav")


class SpeechProvider(Protocol):
    name: str

    async def transcribe(self, audio: bytes, mime: str) -> str: ...

    async def synthesize(self, text: str) -> Audio: ...


def pcm_to_wav(
    pcm: bytes,
    *,
    rate: int = _GEMINI_PCM_RATE,
    channels: int = _GEMINI_PCM_CHANNELS,
    sample_width: int = _GEMINI_PCM_SAMPLE_WIDTH,
) -> bytes:
    """Wrap raw little-endian PCM in a WAV container."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(sample_width)
        wav.setframerate(rate)
        wav.writeframes(pcm)
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# text_only
# ---------------------------------------------------------------------------


class TextOnlyProvider:
    """No speech. ``audio`` is treated as UTF-8 text; no audio is produced.

    Lets the whole pipeline (and the demo frontend) be exercised with no
    speech infrastructure — the client just sends base64-encoded text.
    """

    name = "text_only"

    async def transcribe(self, audio: bytes, mime: str) -> str:
        return audio.decode("utf-8", errors="replace").strip()

    async def synthesize(self, text: str) -> Audio:
        return EMPTY_AUDIO


# ---------------------------------------------------------------------------
# openai
# ---------------------------------------------------------------------------


class OpenAIProvider:
    """OpenAI (or any OpenAI-compatible endpoint) speech-to-text and TTS."""

    name = "openai"

    def __init__(self, settings: VoiceSettings) -> None:
        if not settings.openai_api_key:
            raise VoiceProviderError("OPENAI_API_KEY is not set")
        self._settings = settings
        self._headers = {"Authorization": f"Bearer {settings.openai_api_key}"}

    def _client(self) -> httpx.AsyncClient:
        return build_client(
            base_url=self._settings.openai_base_url,
            headers=self._headers,
            timeout=self._settings.request_timeout,
        )

    async def transcribe(self, audio: bytes, mime: str) -> str:
        if not audio:
            return ""
        extension = "mp3" if "mpeg" in mime or "mp3" in mime else "wav"
        try:
            async with self._client() as client:
                response = await client.post(
                    "/audio/transcriptions",
                    files={"file": (f"audio.{extension}", audio, mime)},
                    data={"model": self._settings.openai_stt_model},
                )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise VoiceProviderError(f"OpenAI transcription failed: {exc}") from exc
        return str(response.json().get("text", "")).strip()

    async def synthesize(self, text: str) -> Audio:
        if not text:
            return EMPTY_AUDIO
        try:
            async with self._client() as client:
                response = await client.post(
                    "/audio/speech",
                    json={
                        "model": self._settings.openai_tts_model,
                        "voice": self._settings.openai_tts_voice,
                        "input": text,
                        "response_format": "mp3",
                    },
                )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise VoiceProviderError(f"OpenAI speech synthesis failed: {exc}") from exc
        return Audio(response.content, "audio/mpeg")


# ---------------------------------------------------------------------------
# gemini
# ---------------------------------------------------------------------------


class GeminiProvider:
    """Google Gemini ``generateContent`` for transcription and TTS."""

    name = "gemini"

    def __init__(self, settings: VoiceSettings) -> None:
        if not settings.gemini_api_key:
            raise VoiceProviderError("GEMINI_API_KEY is not set")
        self._settings = settings

    def _client(self) -> httpx.AsyncClient:
        return build_client(
            base_url=self._settings.gemini_base_url,
            params={"key": self._settings.gemini_api_key},
            timeout=self._settings.request_timeout,
        )

    async def transcribe(self, audio: bytes, mime: str) -> str:
        if not audio:
            return ""
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": "Transcribe this audio verbatim. Reply with the transcript only."
                        },
                        {
                            "inline_data": {
                                "mime_type": mime or "audio/wav",
                                "data": base64.b64encode(audio).decode("ascii"),
                            }
                        },
                    ]
                }
            ]
        }
        data = await self._generate(self._settings.gemini_stt_model, payload)
        return _first_text_part(data).strip()

    async def synthesize(self, text: str) -> Audio:
        if not text:
            return EMPTY_AUDIO
        payload = {
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": self._settings.gemini_tts_voice
                        }
                    }
                },
            },
        }
        data = await self._generate(self._settings.gemini_tts_model, payload)
        pcm_b64 = _first_inline_data(data)
        if not pcm_b64:
            return EMPTY_AUDIO
        return Audio(pcm_to_wav(base64.b64decode(pcm_b64)), "audio/wav")

    async def _generate(self, model: str, payload: dict) -> dict:
        try:
            async with self._client() as client:
                response = await client.post(
                    f"/models/{model}:generateContent", json=payload
                )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise VoiceProviderError(f"Gemini request failed: {exc}") from exc
        return response.json()


def _candidate_parts(data: dict) -> list[dict]:
    candidates = data.get("candidates") or []
    if not candidates:
        return []
    return candidates[0].get("content", {}).get("parts", []) or []


def _first_text_part(data: dict) -> str:
    for part in _candidate_parts(data):
        if "text" in part:
            return str(part["text"])
    return ""


def _first_inline_data(data: dict) -> str:
    for part in _candidate_parts(data):
        inline = part.get("inline_data") or part.get("inlineData")
        if inline and inline.get("data"):
            return str(inline["data"])
    return ""


# ---------------------------------------------------------------------------
# vertex
# ---------------------------------------------------------------------------


class VertexProvider:
    """Vertex AI: Gemini ``generateContent`` for transcription (service-account
    auth, not an API key), Cloud Text-to-Speech for synthesis.

    TTS deliberately does NOT use generateContent's native-audio output —
    that's a newer capability with narrower region/preview availability.
    Cloud Text-to-Speech is a separate, long-GA product that's a much safer
    bet for something that has to work reliably in a live demo.

    Mints and caches a short-lived OAuth2 access token from the service
    account (scope: cloud-platform), refreshing it when it expires -
    google-auth's Credentials object tracks its own expiry.
    """

    name = "vertex"

    def __init__(self, settings: VoiceSettings) -> None:
        if not settings.vertex_service_account_json_b64:
            raise VoiceProviderError("GOOGLE_SERVICE_ACCOUNT_JSON_B64 is not set")
        if not settings.vertex_project_id:
            raise VoiceProviderError("VERTEX_PROJECT_ID is not set")
        self._settings = settings
        try:
            import base64 as _b64
            import json as _json

            from google.oauth2 import service_account

            info = _json.loads(
                _b64.b64decode(settings.vertex_service_account_json_b64)
            )
            self._credentials = service_account.Credentials.from_service_account_info(
                info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
        except Exception as exc:
            raise VoiceProviderError(f"invalid service account credentials: {exc}") from exc

    def _access_token(self) -> str:
        from google.auth.transport.requests import Request

        if not self._credentials.valid:
            self._credentials.refresh(Request())
        return self._credentials.token

    async def transcribe(self, audio: bytes, mime: str) -> str:
        if not audio:
            return ""
        path = (
            f"/v1/projects/{self._settings.vertex_project_id}/locations/"
            f"{self._settings.vertex_location}/publishers/google/models/"
            f"{self._settings.vertex_stt_model}:generateContent"
        )
        payload = {
            "contents": [
                {
                    # Vertex AI requires an explicit role - unlike the public
                    # Generative Language API, it does not default this.
                    "role": "user",
                    "parts": [
                        {"text": "Transcribe this audio verbatim. Reply with the transcript only."},
                        {"inline_data": {"mime_type": mime or "audio/wav", "data": base64.b64encode(audio).decode("ascii")}},
                    ]
                }
            ]
        }
        try:
            async with build_client(
                base_url=f"https://{self._settings.vertex_location}-aiplatform.googleapis.com",
                headers={"Authorization": f"Bearer {self._access_token()}"},
                timeout=self._settings.request_timeout,
            ) as client:
                response = await client.post(path, json=payload)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise VoiceProviderError(f"Vertex AI transcription failed: {exc}") from exc
        return _first_text_part(response.json()).strip()

    async def synthesize(self, text: str) -> Audio:
        if not text:
            return EMPTY_AUDIO
        try:
            async with build_client(
                base_url="https://texttospeech.googleapis.com",
                headers={"Authorization": f"Bearer {self._access_token()}"},
                timeout=self._settings.request_timeout,
            ) as client:
                response = await client.post(
                    "/v1/text:synthesize",
                    json={
                        "input": {"text": text},
                        "voice": {"languageCode": "en-US", "name": self._settings.vertex_tts_voice},
                        "audioConfig": {"audioEncoding": "LINEAR16"},
                    },
                )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise VoiceProviderError(f"Cloud Text-to-Speech failed: {exc}") from exc
        audio_b64 = response.json().get("audioContent", "")
        if not audio_b64:
            return EMPTY_AUDIO
        # LINEAR16 encoding from Cloud TTS already includes a WAV header.
        return Audio(base64.b64decode(audio_b64), "audio/wav")


def vertex_access_token(settings: VoiceSettings) -> str:
    """Mint a fresh Vertex AI access token from the same service-account
    credential as :class:`VertexProvider`, for callers (``voice/llm_answer.py``)
    that need Vertex auth without going through the full speech provider.
    Raises :class:`VoiceProviderError` with the same messages as
    ``VertexProvider(settings)`` on missing/invalid config.
    """
    return VertexProvider(settings)._access_token()


# ---------------------------------------------------------------------------
# local
# ---------------------------------------------------------------------------


class LocalProvider:
    """Calls the bundled ``stt`` (faster-whisper / Kroko) and ``tts`` (Kokoro) services."""

    name = "local"

    def __init__(self, settings: VoiceSettings) -> None:
        self._settings = settings

    async def transcribe(self, audio: bytes, mime: str) -> str:
        if not audio:
            return ""
        try:
            async with build_client(timeout=self._settings.request_timeout) as client:
                response = await client.post(
                    f"{self._settings.stt_url}/transcribe",
                    files={"audio": ("audio.wav", audio, mime or "audio/wav")},
                )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise VoiceProviderError(f"local STT failed: {exc}") from exc
        return str(response.json().get("text", "")).strip()

    async def synthesize(self, text: str) -> Audio:
        if not text:
            return EMPTY_AUDIO
        try:
            async with build_client(timeout=self._settings.request_timeout) as client:
                response = await client.post(
                    f"{self._settings.tts_url}/speak", json={"text": text}
                )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise VoiceProviderError(f"local TTS failed: {exc}") from exc
        return Audio(
            response.content, response.headers.get("content-type", "audio/wav")
        )


# ---------------------------------------------------------------------------
# factory
# ---------------------------------------------------------------------------

_PROVIDERS: dict[str, type] = {
    "text_only": TextOnlyProvider,
    "openai": OpenAIProvider,
    "gemini": GeminiProvider,
    "local": LocalProvider,
    "vertex": VertexProvider,
}


def get_provider(settings: VoiceSettings) -> SpeechProvider:
    """Build the speech provider named by ``settings.provider``.

    Falls back to :class:`TextOnlyProvider` if the configured provider cannot be
    constructed (e.g. a missing API key), so the endpoint never hard-fails on
    misconfiguration.
    """
    provider_cls = _PROVIDERS.get(settings.provider, TextOnlyProvider)
    if provider_cls is TextOnlyProvider:
        return TextOnlyProvider()
    try:
        return provider_cls(settings)
    except VoiceProviderError as exc:
        logger.warning(
            "voice provider %r unavailable (%s); falling back to text_only",
            settings.provider,
            exc,
        )
        return TextOnlyProvider()
