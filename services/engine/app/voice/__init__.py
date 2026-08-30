"""
Voice pipeline for ``POST /api/voice-query``
============================================
Speech-to-text -> risk reasoning over the immune-memory graph -> text-to-speech.

The speech half is pluggable via the ``VOICE_PROVIDER`` env var:

- ``text_only``  no speech at all; the request's ``audio_base64`` is treated as
  UTF-8 text and echoed back as the transcript, ``response_audio_base64`` is
  empty. Zero external dependencies — the default.
- ``openai``     OpenAI ``/audio/transcriptions`` + ``/audio/speech``.
- ``gemini``     Gemini ``generateContent`` for transcription and TTS.
- ``local``      the bundled ``stt`` (sherpa-onnx / Kroko) and ``tts`` (Kokoro)
  containers.

Synthesis alone can be pointed elsewhere with ``TTS_PROVIDER``, since the best
STT and the best TTS are rarely the same service:

- ``smallest``   Smallest AI Waves (Lightning) — text-to-speech only, so it is
  available on this axis and not on ``VOICE_PROVIDER``. Needs no GPU.

Unset, ``TTS_PROVIDER`` changes nothing: both halves come from
``VOICE_PROVIDER`` as before.

The risk answer itself is always computed locally from the graph — no LLM is
in that path.
"""

from __future__ import annotations

from voice.pipeline import answer_voice_query

__all__ = ["answer_voice_query"]
