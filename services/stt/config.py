"""STT service configuration, from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass

# sherpa-onnx transducer models used here expect 16 kHz, 80-dim features.
SAMPLE_RATE = 16000
FEATURE_DIM = 80

# Default: a fully public streaming Zipformer transducer that needs no token.
# Point STT_HF_REPO at Kroko's "Banafo/test-onnx" (with STT_HF_TOKEN) to run the
# real Kroko community models in the same sherpa-onnx runtime.
_DEFAULT_REPO = "csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26"
_DEFAULT_ENCODER = "encoder-epoch-99-avg-1-chunk-16-left-64.int8.onnx"
_DEFAULT_DECODER = "decoder-epoch-99-avg-1-chunk-16-left-64.onnx"
_DEFAULT_JOINER = "joiner-epoch-99-avg-1-chunk-16-left-64.int8.onnx"
_DEFAULT_TOKENS = "tokens.txt"


@dataclass(frozen=True)
class STTConfig:
    model_dir: str = ""  # if set, load *.onnx / tokens.txt from here (a mounted model)
    hf_repo: str = _DEFAULT_REPO
    hf_token: str = ""
    encoder: str = _DEFAULT_ENCODER
    decoder: str = _DEFAULT_DECODER
    joiner: str = _DEFAULT_JOINER
    tokens: str = _DEFAULT_TOKENS
    num_threads: int = 2
    provider: str = "cpu"  # "cpu" | "cuda" | "coreml"
    decoding_method: str = "greedy_search"
    host: str = "0.0.0.0"
    port: int = 8100

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> STTConfig:
        source = env if env is not None else os.environ
        return cls(
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
        )
