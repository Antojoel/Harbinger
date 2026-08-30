"""Voice-query orchestration: STT -> graph risk answer -> TTS."""

from __future__ import annotations

import base64
import binascii
import logging

from voice.answer import (
    build_spoken_answer,
    fetch_graph_context,
    fetch_shipment_facts,
    format_heuristic_answer,
)
from voice.config import VoiceSettings
from voice.llm_answer import build_llm_answer
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

    response_text = await _build_answer(shipment_id, transcript, settings)

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


async def _build_answer(shipment_id: str, transcript: str, settings: VoiceSettings) -> str:
    """Word the answer: the heuristic template, or an LLM grounded in the same
    graph facts. An LLM failure (missing key, network error, ...) falls back
    to the heuristic template rather than breaking the query.
    """
    shipment_id = (shipment_id or "").strip()
    if not shipment_id:
        return "I need a shipment number to check the hold risk."

    if settings.llm_answer_provider == "heuristic":
        return build_spoken_answer(shipment_id, transcript)

    logger.info(
        "voice answer for %s via %s (asked: %r)",
        shipment_id,
        settings.llm_answer_provider,
        transcript[:120],
    )
    facts = fetch_shipment_facts(shipment_id)
    # The LLM path gets the surrounding knowledge-graph state as well (lane
    # certificate requirements, each pattern's rejection reason and known
    # resolution), so it can propose a grounded fix instead of only restating
    # the risk. The heuristic fallback below ignores it, as before.
    facts = {**facts, "graph_context": fetch_graph_context(shipment_id)}
    try:
        return await build_llm_answer(shipment_id, transcript, facts, settings)
    except VoiceProviderError as exc:
        logger.warning(
            "LLM answer (%s) failed, falling back to heuristic: %s",
            settings.llm_answer_provider,
            exc,
        )
        return format_heuristic_answer(shipment_id, facts)
