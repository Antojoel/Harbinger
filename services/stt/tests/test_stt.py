"""Unit tests for the STT service (no model download, ffmpeg optional)."""

from __future__ import annotations

import shutil
import wave
from io import BytesIO

import app as app_module
import numpy as np
import pytest
from audio import AudioDecodeError, decode_to_mono_16k
from config import SAMPLE_RATE, STTConfig
from fastapi.testclient import TestClient
from recognizer import _resolve_model_files

_HAS_FFMPEG = shutil.which("ffmpeg") is not None


def _make_wav_bytes(seconds: float = 0.2, rate: int = SAMPLE_RATE) -> bytes:
    n = int(seconds * rate)
    samples = (np.sin(np.linspace(0, 40, n)) * 0.3 * 32767).astype("<i2")
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(samples.tobytes())
    return buffer.getvalue()


@pytest.mark.unit
class TestConfig:
    def test_defaults_are_public_model(self):
        config = STTConfig.from_env({})
        assert "sherpa-onnx-streaming-zipformer" in config.hf_repo
        assert config.hf_token == ""
        assert config.port == 8100

    def test_kroko_override(self):
        config = STTConfig.from_env(
            {
                "STT_HF_REPO": "Banafo/test-onnx",
                "STT_HF_TOKEN": "hf_x",
                "STT_PROVIDER": "cuda",
            }
        )
        assert config.hf_repo == "Banafo/test-onnx"
        assert config.hf_token == "hf_x"
        assert config.provider == "cuda"


@pytest.mark.unit
class TestResolveModelFiles:
    def test_missing_mounted_dir_files_raises(self, tmp_path):
        config = STTConfig.from_env({"STT_MODEL_DIR": str(tmp_path)})
        with pytest.raises(FileNotFoundError) as excinfo:
            _resolve_model_files(config)
        assert "encoder" in str(excinfo.value)

    def test_mounted_dir_with_all_files_ok(self, tmp_path):
        for name in ("enc.onnx", "dec.onnx", "join.onnx", "tok.txt"):
            (tmp_path / name).write_bytes(b"x")
        config = STTConfig.from_env(
            {
                "STT_MODEL_DIR": str(tmp_path),
                "STT_ENCODER": "enc.onnx",
                "STT_DECODER": "dec.onnx",
                "STT_JOINER": "join.onnx",
                "STT_TOKENS": "tok.txt",
            }
        )
        paths = _resolve_model_files(config)
        assert paths["encoder"].endswith("enc.onnx")


@pytest.mark.unit
class TestAudioDecode:
    def test_empty_bytes(self):
        assert decode_to_mono_16k(b"").size == 0

    @pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg not installed")
    def test_decodes_wav_to_16k_mono_float32(self):
        samples = decode_to_mono_16k(_make_wav_bytes(0.2))
        assert samples.dtype == np.float32
        assert abs(len(samples) - int(0.2 * SAMPLE_RATE)) < 400

    @pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg not installed")
    def test_garbage_bytes_raise_decode_error(self):
        with pytest.raises(AudioDecodeError):
            decode_to_mono_16k(b"not audio at all" * 10)


class _FakeRecognizer:
    def __init__(self, text="what is the hold risk"):
        self.text = text
        self.received: np.ndarray | None = None

    def transcribe(self, samples: np.ndarray) -> str:
        self.received = samples
        return self.text


@pytest.fixture
def client(monkeypatch):
    fake = _FakeRecognizer()
    monkeypatch.setattr(app_module, "_recognizer", fake)
    monkeypatch.setattr(app_module, "build_recognizer", lambda _c: fake)
    monkeypatch.setattr(
        app_module,
        "decode_to_mono_16k",
        lambda data: np.frombuffer(data[:8], dtype=np.uint8).astype(np.float32),
    )
    with TestClient(app_module.app) as test_client:
        test_client.fake = fake
        yield test_client


@pytest.mark.unit
class TestTranscribeEndpoint:
    def test_health(self, client):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["sample_rate"] == SAMPLE_RATE

    def test_transcribe_returns_text(self, client):
        response = client.post(
            "/transcribe", files={"audio": ("q.wav", b"RIFFDATA0", "audio/wav")}
        )
        assert response.status_code == 200
        assert response.json() == {"text": "what is the hold risk"}
        assert client.fake.received is not None

    def test_empty_upload_rejected(self, client):
        response = client.post(
            "/transcribe", files={"audio": ("q.wav", b"", "audio/wav")}
        )
        assert response.status_code == 422

    def test_decode_failure_is_422(self, client, monkeypatch):
        def boom(_data):
            raise AudioDecodeError("bad container")

        monkeypatch.setattr(app_module, "decode_to_mono_16k", boom)
        response = client.post(
            "/transcribe", files={"audio": ("q.webm", b"junk", "audio/webm")}
        )
        assert response.status_code == 422
        assert "bad container" in response.json()["detail"]
