"""STT service configuration, from the environment.

Two engines are supported behind one HTTP contract (``POST /transcribe``):

* ``faster_whisper`` (default) — Whisper on CTranslate2. Accurate, GPU-friendly.
  Runs on CUDA automatically when a GPU is visible (``STT_DEVICE=auto``).
* ``sherpa`` — the streaming Zipformer / Kroko transducer on sherpa-onnx.
  Lighter, CPU-only here, but far less accurate on free-form speech.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# Both engines work in 16 kHz mono; sherpa transducers also want 80-dim feats.
SAMPLE_RATE = 16000
FEATURE_DIM = 80

VALID_ENGINES = ("faster_whisper", "sherpa")
DEFAULT_ENGINE = "faster_whisper"

# faster-whisper defaults. small.en is a good accuracy/speed balance on a
# laptop RTX; bump to distil-large-v3 / large-v3 for best quality on the 3060.
_DEFAULT_WHISPER_MODEL = "small.en"

# sherpa-onnx defaults: a fully public streaming Zipformer (no token needed).
_DEFAULT_REPO = "csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26"
_DEFAULT_ENCODER = "encoder-epoch-99-avg-1-chunk-16-left-64.int8.onnx"
_DEFAULT_DECODER = "decoder-epoch-99-avg-1-chunk-16-left-64.onnx"
_DEFAULT_JOINER = "joiner-epoch-99-avg-1-chunk-16-left-64.int8.onnx"
_DEFAULT_TOKENS = "tokens.txt"


@dataclass(frozen=True)
class STTConfig:
    engine: str = DEFAULT_ENGINE

    # --- faster-whisper ---
    whisper_model: str = _DEFAULT_WHISPER_MODEL
    device: str = "auto"          # "auto" | "cpu" | "cuda"
    compute_type: str = "auto"    # "auto" | "float16" | "int8" | "int8_float16" | ...
    beam_size: int = 5
    language: str = "en"          # "" -> autodetect
    vad_filter: bool = True

    # --- sherpa-onnx ---
    model_dir: str = ""           # if set, load *.onnx / tokens.txt from here
    hf_repo: str = _DEFAULT_REPO
    hf_token: str = ""
    encoder: str = _DEFAULT_ENCODER
    decoder: str = _DEFAULT_DECODER
    joiner: str = _DEFAULT_JOINER
    tokens: str = _DEFAULT_TOKENS
    num_threads: int = 2
    provider: str = "cpu"
    decoding_method: str = "greedy_search"

    # --- server ---
    host: str = "0.0.0.0"
    port: int = 8100
    model_cache: str = "/models"

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> STTConfig:
        source = env if env is not None else os.environ

        engine = source.get("STT_ENGINE", DEFAULT_ENGINE).strip().lower()
        if engine not in VALID_ENGINES:
            engine = DEFAULT_ENGINE

        return cls(
            engine=engine,
            whisper_model=source.get("STT_WHISPER_MODEL", _DEFAULT_WHISPER_MODEL),
            device=source.get("STT_DEVICE", "auto").strip().lower(),
            compute_type=source.get("STT_COMPUTE_TYPE", "auto").strip().lower(),
            beam_size=int(source.get("STT_BEAM_SIZE", "5")),
            language=source.get("STT_LANGUAGE", "en").strip(),
            vad_filter=source.get("STT_VAD_FILTER", "1").strip().lower()
            not in ("0", "false", "no"),
            model_dir=source.get("STT_MODEL_DIR", ""),
            hf_repo=source.get("STT_HF_REPO", _DEFAULT_REPO),
            hf_token=source.get("STT_HF_TOKEN", ""),
            encoder=source.get("STT_ENCODER", _DEFAULT_ENCODER),
            decoder=source.get("STT_DECODER", _DEFAULT_DECODER),
            joiner=source.get("STT_JOINER", _DEFAULT_JOINER),
            tokens=source.get("STT_TOKENS", _DEFAULT_TOKENS),
            num_threads=int(source.get("STT_NUM_THREADS", "2")),
            provider=source.get("STT_PROVIDER", "cpu").strip().lower(),
            decoding_method=source.get("STT_DECODING_METHOD", "greedy_search"),
            host=source.get("STT_HOST", "0.0.0.0"),
            port=int(source.get("STT_PORT", "8100")),
            model_cache=source.get("STT_MODEL_CACHE", "/models"),
        )
