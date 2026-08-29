"""
Harbinger STT service — Kroko / Zipformer on sherpa-onnx behind a minimal API.

    POST /transcribe   multipart form field "audio" (wav/mp3/webm/ogg/...)  -> {"text": "..."}
    GET  /health
"""

from __future__ import annotations

import logging

from audio import AudioDecodeError, decode_to_mono_16k
from config import SAMPLE_RATE, STTConfig
from fastapi import FastAPI, HTTPException, UploadFile
from recognizer import build_recognizer

logging.basicConfig(
    level="INFO",
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("harbinger.stt")

config = STTConfig.from_env()
app = FastAPI(title="Harbinger STT", version="1.0.0")

_recognizer = None
_MAX_AUDIO_BYTES = 25 * 1024 * 1024


def _get_recognizer():
    global _recognizer
    if _recognizer is None:
        _recognizer = build_recognizer(config)
    return _recognizer


@app.on_event("startup")
def _warm_up() -> None:
    _get_recognizer()
    logger.info(
        "Harbinger STT ready (repo=%s, provider=%s)", config.hf_repo, config.provider
    )


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "sample_rate": SAMPLE_RATE,
        "provider": config.provider,
        "model_loaded": _recognizer is not None,
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
        text = _get_recognizer().transcribe(samples)
    except Exception as exc:  # model / runtime errors
        logger.exception("transcription failed")
        raise HTTPException(
            status_code=500, detail=f"transcription failed: {exc}"
        ) from exc

    return {"text": text}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=config.host, port=config.port)
