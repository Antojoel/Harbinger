"""
faster-whisper (Whisper on CTranslate2) transcription engine.

Same surface as :class:`recognizer.Recognizer`: build once, then call
``transcribe(samples)`` with float32 mono 16 kHz audio and get a string back.

Device resolution
-----------------
``STT_DEVICE=auto`` picks CUDA when CTranslate2 can see a GPU, otherwise CPU.
``STT_COMPUTE_TYPE=auto`` then picks ``float16`` on GPU / ``int8`` on CPU.
"""

from __future__ import annotations

import logging

import numpy as np

from config import STTConfig

logger = logging.getLogger("harbinger.stt")


def _cuda_available() -> bool:
    try:
        import ctranslate2

        return ctranslate2.get_cuda_device_count() > 0
    except Exception:  # noqa: BLE001 - any failure means "no usable CUDA"
        return False


def resolve_device(config: STTConfig) -> tuple[str, str]:
    device = config.device
    if device == "auto":
        device = "cuda" if _cuda_available() else "cpu"

    compute = config.compute_type
    if compute == "auto":
        compute = "float16" if device == "cuda" else "int8"

    return device, compute


class WhisperEngine:
    def __init__(self, config: STTConfig) -> None:
        from faster_whisper import WhisperModel

        self.device, self.compute_type = resolve_device(config)
        self._config = config
        logger.info(
            "loading faster-whisper model=%s device=%s compute=%s",
            config.whisper_model,
            self.device,
            self.compute_type,
        )
        try:
            self._model = WhisperModel(
                config.whisper_model,
                device=self.device,
                compute_type=self.compute_type,
                download_root=config.model_cache,
            )
        except Exception:
            if self.device == "cuda":
                logger.exception("CUDA load failed; falling back to CPU int8")
                self.device, self.compute_type = "cpu", "int8"
                self._model = WhisperModel(
                    config.whisper_model,
                    device="cpu",
                    compute_type="int8",
                    download_root=config.model_cache,
                )
            else:
                raise
        logger.info("faster-whisper ready (device=%s)", self.device)

    def transcribe(self, samples: np.ndarray) -> str:
        if samples.size == 0:
            return ""
        segments, _info = self._model.transcribe(
            samples.astype(np.float32),
            language=self._config.language or None,
            beam_size=self._config.beam_size,
            vad_filter=self._config.vad_filter,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False,
        )
        return " ".join(seg.text.strip() for seg in segments).strip()


def build_whisper_engine(config: STTConfig) -> WhisperEngine:
    return WhisperEngine(config)
