"""
Decode arbitrary uploaded audio to 16 kHz mono float32 via ffmpeg.

ffmpeg handles wav / mp3 / webm / ogg / m4a / flac uniformly, so the service
does not need format-specific Python audio libraries.
"""

from __future__ import annotations

import subprocess

import numpy as np
from config import SAMPLE_RATE


class AudioDecodeError(RuntimeError):
    """The uploaded bytes could not be decoded as audio."""


def decode_to_mono_16k(data: bytes) -> np.ndarray:
    """Return float32 mono samples at :data:`config.SAMPLE_RATE`."""
    if not data:
        return np.zeros(0, dtype=np.float32)

    command = [
        "ffmpeg",
        "-nostdin",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-f",
        "f32le",
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "pipe:1",
    ]
    try:
        result = subprocess.run(command, input=data, capture_output=True, check=True)
    except FileNotFoundError as exc:  # pragma: no cover - ffmpeg missing
        raise AudioDecodeError("ffmpeg is not installed") from exc
    except subprocess.CalledProcessError as exc:
        message = exc.stderr.decode("utf-8", "replace").strip() or "ffmpeg failed"
        raise AudioDecodeError(message) from exc

    return np.frombuffer(result.stdout, dtype="<f4").astype(np.float32)
