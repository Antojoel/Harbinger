"""
Harbinger TTS service — Kokoro-82M behind a minimal HTTP API.

    POST /speak   {"text": "...", "voice": "af_heart"?, "speed": 1.0?}  -> audio/wav
    GET  /health

No web UI, no upstream branding — just the model.
"""

from __future__ import annotations

import logging

from config import SAMPLE_RATE, TTSConfig
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field
from synth import build_synthesizer, samples_to_wav

logging.basicConfig(
    level="INFO",
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("harbinger.tts")

config = TTSConfig.from_env()
app = FastAPI(title="Harbinger TTS", version="1.0.0")

_synthesizer = None


def _get_synthesizer():
    global _synthesizer
    if _synthesizer is None:
        _synthesizer = build_synthesizer(config)
    return _synthesizer


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    voice: str | None = Field(None, description="Kokoro voice id, e.g. 'af_heart'")
    speed: float | None = Field(None, gt=0.25, le=4.0)


@app.on_event("startup")
def _warm_up() -> None:
    # Load the model at startup so the first request is not slow / does not race.
    _get_synthesizer()
    logger.info("Harbinger TTS ready (backend=%s)", config.backend)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "backend": config.backend,
        "sample_rate": SAMPLE_RATE,
        "model_loaded": _synthesizer is not None,
    }


@app.post("/speak")
def speak(request: SpeakRequest) -> Response:
    try:
        samples = _get_synthesizer().synthesize(
            request.text, voice=request.voice, speed=request.speed
        )
    except Exception as exc:  # model / runtime errors -> 500 with a clear message
        logger.exception("synthesis failed")
        raise HTTPException(status_code=500, detail=f"synthesis failed: {exc}") from exc

    if samples.size == 0:
        raise HTTPException(
            status_code=422, detail="no audio produced for the given text"
        )

    return Response(content=samples_to_wav(samples), media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=config.host, port=config.port)
