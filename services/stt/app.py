"""
Harbinger STT service behind a minimal HTTP API.

    POST /transcribe   multipart form field "audio" (wav/mp3/webm/ogg/...)  -> {"text": "..."}
    GET  /health

Engine is chosen by STT_ENGINE:
    faster_whisper  (default)  Whisper on CTranslate2, CUDA-accelerated
    sherpa                     streaming Zipformer / Kroko transducer (CPU)
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, UploadFile

from audio import AudioDecodeError, decode_to_mono_16k
from config import SAMPLE_RATE, STTConfig

logging.basicConfig(
    level="INFO",
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("harbinger.stt")

config = STTConfig.from_env()
app = FastAPI(title="Harbinger STT", version="2.0.0")

_engine = None
_MAX_AUDIO_BYTES = 25 * 1024 * 1024


def build_engine(cfg: STTConfig):
    if cfg.engine == "sherpa":
        from recognizer import build_recognizer

        return build_recognizer(cfg)
    from whisper_engine import build_whisper_engine

    return build_whisper_engine(cfg)


def _get_engine():
    global _engine
    if _engine is None:
        _engine = build_engine(config)
    return _engine


def _engine_device() -> str:
    engine = _engine
    if engine is None:
        return "unloaded"
    return getattr(engine, "device", config.provider)


@app.on_event("startup")
def _warm_up() -> None:
    _get_engine()
    logger.info("Harbinger STT ready (engine=%s, device=%s)", config.engine, _engine_device())


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "engine": config.engine,
        "model": config.whisper_model if config.engine == "faster_whisper" else config.hf_repo,
        "device": _engine_device(),
        "sample_rate": SAMPLE_RATE,
        "model_loaded": _engine is not None,
    }


@app.post("/transcribe")
async def transcribe(audio: UploadFile) -> dict[str, str]:
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=422, detail="empty audio upload")
    if len(data) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="audio upload too large")

    try:
        samples = decode_to_mono_16k(data)
    except AudioDecodeError as exc:
        raise HTTPException(
            status_code=422, detail=f"could not decode audio: {exc}"
        ) from exc

    try:
        text = _get_engine().transcribe(samples)
    except Exception as exc:  # model / runtime errors
        logger.exception("transcription failed")
        raise HTTPException(
            status_code=500, detail=f"transcription failed: {exc}"
        ) from exc

    return {"text": text}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=config.host, port=config.port)
