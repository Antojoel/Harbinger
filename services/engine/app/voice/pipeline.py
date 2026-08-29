"""Voice-query orchestration: STT -> graph risk answer -> TTS."""

from __future__ import annotations

import base64
import binascii
import logging

from voice.answer import build_spoken_answer
from voice.config import VoiceSettings
from voice.providers import VoiceProviderError, get_provider

logger = logging.getLogger("harbinger.voice")


def _decode_audio(audio_base64: str) -> bytes:
    if not audio_base64:
        return b""
    try:
        return base64.b64decode(audio_base64, validate=True)
    except (binascii.Error, ValueError):
        logger.warning(
            "voice-query audio_base64 is not valid base64; treating as empty"
        )
        return b""


async def answer_voice_query(
    shipment_id: str,
    audio_base64: str,
    *,
    settings: VoiceSettings | None = None,
) -> dict[str, str]:
    """Answer a voice query about a shipment's customs hold risk.

    Returns the locked ``/api/voice-query`` contract shape::

        {"transcript": str, "response_text": str, "response_audio_base64": str}

    Never raises: a speech-provider failure degrades to an empty transcript /
    empty audio, but the text answer (from the graph) is always returned.
    """
    settings = settings or VoiceSettings.from_env()
    provider = get_provider(settings)
    audio = _decode_audio(audio_base64)

    transcript = ""
    try:
        transcript = await provider.transcribe(audio, "audio/wav")
    except VoiceProviderError as exc:
        logger.error("transcription failed (%s): %s", provider.name, exc)

    response_text = build_spoken_answer(shipment_id, transcript)

    response_audio_base64 = ""
    try:
        speech = await provider.synthesize(response_text)
        if not speech.is_empty:
            response_audio_base64 = base64.b64encode(speech.data).decode("ascii")
    except VoiceProviderError as exc:
        logger.error("speech synthesis failed (%s): %s", provider.name, exc)

    return {
        "transcript": transcript,
        "response_text": response_text,
        "response_audio_base64": response_audio_base64,
    }
