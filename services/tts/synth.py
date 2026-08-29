"""
Kokoro-82M text-to-speech, wrapped as a small synchronous synthesizer.

Backend-agnostic: the ``torch`` backend uses the ``kokoro`` package (CUDA or
CPU); the ``mlx`` backend uses ``mlx-audio`` for Apple Silicon. Only the model
call differs — both return float32 mono samples at 24 kHz which
:func:`samples_to_wav` packs into a WAV container.

This module deliberately contains no web framework code and no project
branding — it is a plain library over the upstream model.
"""

from __future__ import annotations

import io
import logging
import wave
from typing import Protocol

import numpy as np
from config import SAMPLE_RATE, TTSConfig

logger = logging.getLogger("harbinger.tts")


class Synthesizer(Protocol):
    def synthesize(
        self, text: str, *, voice: str | None, speed: float | None
    ) -> np.ndarray: ...


def samples_to_wav(samples: np.ndarray, *, sample_rate: int = SAMPLE_RATE) -> bytes:
    """Pack float32 [-1, 1] mono samples into a 16-bit PCM WAV."""
    clipped = np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0)
    pcm16 = (clipped * 32767.0).astype("<i2").tobytes()
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm16)
    return buffer.getvalue()


def _resolve_torch_device(requested: str) -> str:
    import torch

    if requested in ("cpu", "cuda"):
        if requested == "cuda" and not torch.cuda.is_available():
            logger.warning("KOKORO_DEVICE=cuda but CUDA is unavailable; using cpu")
            return "cpu"
        return requested
    return "cuda" if torch.cuda.is_available() else "cpu"


class TorchKokoro:
    """Kokoro via the ``kokoro`` package (PyTorch; CUDA when available)."""

    def __init__(self, config: TTSConfig) -> None:
        import espeak

        espeak.configure()
        from kokoro import KPipeline

        self._config = config
        self._device = _resolve_torch_device(config.device)
        logger.info(
            "loading Kokoro (torch, device=%s, lang=%s)", self._device, config.lang_code
        )
        self._pipeline = KPipeline(lang_code=config.lang_code, device=self._device)

    def synthesize(
        self, text: str, *, voice: str | None, speed: float | None
    ) -> np.ndarray:
        voice = voice or self._config.voice
        speed = speed if speed is not None else self._config.speed
        chunks = [
            np.asarray(result.audio, dtype=np.float32)
            for result in self._pipeline(text, voice=voice, speed=speed)
            if result.audio is not None
        ]
        if not chunks:
            return np.zeros(0, dtype=np.float32)
        return np.concatenate(chunks)


class MlxKokoro:
    """Kokoro via ``mlx-audio`` (Apple Silicon). Not exercised in CI."""

    def __init__(self, config: TTSConfig) -> None:
        from mlx_audio.tts.generate import generate_audio

        self._config = config
        self._generate = generate_audio
        logger.info("loading Kokoro (mlx, lang=%s)", config.lang_code)

    def synthesize(
        self, text: str, *, voice: str | None, speed: float | None
    ) -> np.ndarray:
        result = self._generate(
            text=text,
            model="prince-canuma/Kokoro-82M",
            voice=voice or self._config.voice,
            speed=speed if speed is not None else self._config.speed,
            verbose=False,
        )
        return np.asarray(result, dtype=np.float32)


def build_synthesizer(config: TTSConfig) -> Synthesizer:
    if config.backend == "mlx":
        return MlxKokoro(config)
    return TorchKokoro(config)
