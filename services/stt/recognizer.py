"""
Offline transcription with a streaming Zipformer transducer, on the
sherpa-onnx runtime (the engine Kroko ASR is built on).

Model files (encoder / decoder / joiner ONNX + tokens.txt) come from either a
mounted directory (``STT_MODEL_DIR``) or a Hugging Face repo — see
``config.STTConfig``. Kroko community models drop straight in: point
``STT_HF_REPO`` at ``Banafo/test-onnx`` with an ``STT_HF_TOKEN``.
"""

from __future__ import annotations

import logging
import os

import numpy as np

from config import FEATURE_DIM, SAMPLE_RATE, STTConfig

logger = logging.getLogger("harbinger.stt")

# Seconds of silence appended so the streaming decoder flushes the final words.
_TAIL_PADDING_SECONDS = 0.66


def _resolve_model_files(config: STTConfig) -> dict[str, str]:
    if config.model_dir:
        paths = {
            "encoder": os.path.join(config.model_dir, config.encoder),
            "decoder": os.path.join(config.model_dir, config.decoder),
            "joiner": os.path.join(config.model_dir, config.joiner),
            "tokens": os.path.join(config.model_dir, config.tokens),
        }
        missing = [name for name, path in paths.items() if not os.path.isfile(path)]
        if missing:
            raise FileNotFoundError(
                f"STT_MODEL_DIR={config.model_dir!r} is missing: {', '.join(missing)}"
            )
        return paths

    from huggingface_hub import hf_hub_download

    token = config.hf_token or None
    logger.info("downloading STT model from %s", config.hf_repo)
    return {
        name: hf_hub_download(config.hf_repo, filename=filename, token=token)
        for name, filename in (
            ("encoder", config.encoder),
            ("decoder", config.decoder),
            ("joiner", config.joiner),
            ("tokens", config.tokens),
        )
    }


class Recognizer:
    """Loads the model once; :meth:`transcribe` decodes a whole utterance."""

    def __init__(self, config: STTConfig) -> None:
        import sherpa_onnx

        files = _resolve_model_files(config)
        logger.info("building sherpa-onnx recognizer (provider=%s)", config.provider)
        self._recognizer = sherpa_onnx.OnlineRecognizer.from_transducer(
            tokens=files["tokens"],
            encoder=files["encoder"],
            decoder=files["decoder"],
            joiner=files["joiner"],
            num_threads=config.num_threads,
            provider=config.provider,
            sample_rate=SAMPLE_RATE,
            feature_dim=FEATURE_DIM,
            decoding_method=config.decoding_method,
        )

    def transcribe(self, samples: np.ndarray) -> str:
        if samples.size == 0:
            return ""
        stream = self._recognizer.create_stream()
        stream.accept_waveform(SAMPLE_RATE, samples.astype(np.float32))
        tail = np.zeros(int(_TAIL_PADDING_SECONDS * SAMPLE_RATE), dtype=np.float32)
        stream.accept_waveform(SAMPLE_RATE, tail)
        stream.input_finished()

        while self._recognizer.is_ready(stream):
            self._recognizer.decode_streams([stream])

        return self._recognizer.get_result(stream).strip()


def build_recognizer(config: STTConfig) -> Recognizer:
    return Recognizer(config)
