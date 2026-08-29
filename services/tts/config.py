"""TTS service configuration, from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass

# Kokoro sample rate is fixed by the model.
SAMPLE_RATE = 24000


@dataclass(frozen=True)
class TTSConfig:
    lang_code: str = "a"  # 'a' = American English (see Kokoro docs for others)
    voice: str = "af_heart"
    speed: float = 1.0
    # "torch" (CUDA/CPU) or "mlx" (Apple Silicon, run natively — see README).
    backend: str = "torch"
    # torch device: "auto" | "cpu" | "cuda". "auto" picks cuda when available.
    device: str = "auto"
    host: str = "0.0.0.0"
    port: int = 8200

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> TTSConfig:
        source = env if env is not None else os.environ
        return cls(
            lang_code=source.get("KOKORO_LANG_CODE", "a"),
            voice=source.get("KOKORO_VOICE", "af_heart"),
            speed=_float(source, "KOKORO_SPEED", 1.0),
            backend=source.get("TTS_BACKEND", "torch").strip().lower(),
            device=source.get("KOKORO_DEVICE", "auto").strip().lower(),
            host=source.get("TTS_HOST", "0.0.0.0"),
            port=int(source.get("TTS_PORT", "8200")),
        )


def _float(source: dict[str, str], key: str, default: float) -> float:
    try:
        return float(source.get(key, default))
    except (TypeError, ValueError):
        return default
