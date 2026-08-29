"""Unit tests for the TTS service (no model download)."""

from __future__ import annotations

import wave
from io import BytesIO

import app as app_module
import numpy as np
import pytest
from config import SAMPLE_RATE, TTSConfig
from fastapi.testclient import TestClient
from synth import samples_to_wav


@pytest.mark.unit
class TestConfig:
    def test_defaults(self):
        config = TTSConfig.from_env({})
        assert config.lang_code == "a"
        assert config.backend == "torch"
        assert config.port == 8200

    def test_env_override(self):
        config = TTSConfig.from_env(
            {"TTS_BACKEND": "MLX", "KOKORO_VOICE": "am_adam", "KOKORO_SPEED": "1.3"}
        )
        assert config.backend == "mlx"
        assert config.voice == "am_adam"
        assert config.speed == 1.3

    def test_bad_speed_falls_back(self):
        assert TTSConfig.from_env({"KOKORO_SPEED": "fast"}).speed == 1.0


@pytest.mark.unit
class TestSamplesToWav:
    def test_produces_readable_wav_at_24k_mono_16bit(self):
        samples = (np.sin(np.linspace(0, 20, SAMPLE_RATE)) * 0.5).astype(np.float32)

        data = samples_to_wav(samples)

        with wave.open(BytesIO(data)) as wav:
            assert wav.getframerate() == SAMPLE_RATE
            assert wav.getnchannels() == 1
            assert wav.getsampwidth() == 2
            assert wav.getnframes() == SAMPLE_RATE

    def test_clips_out_of_range_samples(self):
        data = samples_to_wav(np.array([2.0, -2.0, 0.0], dtype=np.float32))
        with wave.open(BytesIO(data)) as wav:
            frames = np.frombuffer(wav.readframes(3), dtype="<i2")
        assert frames[0] == 32767
        assert frames[1] == -32767


class _FakeSynth:
    def __init__(self, samples):
        self._samples = samples
        self.calls = []

    def synthesize(self, text, *, voice, speed):
        self.calls.append({"text": text, "voice": voice, "speed": speed})
        return self._samples


@pytest.fixture
def client(monkeypatch):
    fake = _FakeSynth(np.zeros(2400, dtype=np.float32))
    monkeypatch.setattr(app_module, "_synthesizer", fake)
    monkeypatch.setattr(app_module, "build_synthesizer", lambda _c: fake)
    with TestClient(app_module.app) as test_client:
        test_client.fake = fake
        yield test_client


@pytest.mark.unit
class TestSpeakEndpoint:
    def test_health(self, client):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["sample_rate"] == SAMPLE_RATE

    def test_speak_returns_wav(self, client):
        response = client.post(
            "/speak", json={"text": "Shipment held, missing certificate."}
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/wav"
        assert response.content[:4] == b"RIFF"
        assert client.fake.calls[0]["text"] == "Shipment held, missing certificate."

    def test_speak_passes_voice_and_speed(self, client):
        client.post("/speak", json={"text": "hi", "voice": "am_adam", "speed": 1.25})
        assert client.fake.calls[-1] == {
            "text": "hi",
            "voice": "am_adam",
            "speed": 1.25,
        }

    def test_empty_text_rejected_by_validation(self, client):
        assert client.post("/speak", json={"text": ""}).status_code == 422

    def test_no_audio_produced_returns_422(self, client, monkeypatch):
        client.fake._samples = np.zeros(0, dtype=np.float32)
        assert client.post("/speak", json={"text": "x"}).status_code == 422
