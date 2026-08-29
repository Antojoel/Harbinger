"""Unit tests for the STT service (no model download, ffmpeg optional)."""

from __future__ import annotations

import shutil
import wave
from io import BytesIO

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app as app_module
from audio import AudioDecodeError, decode_to_mono_16k
from config import DEFAULT_ENGINE, SAMPLE_RATE, STTConfig
from recognizer import _resolve_model_files
from whisper_engine import resolve_device

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
    def test_default_engine_is_faster_whisper(self):
        config = STTConfig.from_env({})
        assert config.engine == DEFAULT_ENGINE == "faster_whisper"
        assert config.whisper_model == "small.en"
        assert config.device == "auto"
        assert config.port == 8100

    def test_invalid_engine_falls_back_to_default(self):
        assert STTConfig.from_env({"STT_ENGINE": "banana"}).engine == "faster_whisper"

    def test_whisper_overrides(self):
        config = STTConfig.from_env(
            {
                "STT_WHISPER_MODEL": "large-v3",
                "STT_DEVICE": "cuda",
                "STT_COMPUTE_TYPE": "float16",
                "STT_LANGUAGE": "",
                "STT_VAD_FILTER": "0",
            }
        )
        assert config.whisper_model == "large-v3"
        assert config.device == "cuda"
        assert config.compute_type == "float16"
        assert config.language == ""
        assert config.vad_filter is False

    def test_sherpa_engine_selectable(self):
        config = STTConfig.from_env(
            {"STT_ENGINE": "sherpa", "STT_HF_REPO": "Banafo/test-onnx", "STT_HF_TOKEN": "hf_x"}
        )
        assert config.engine == "sherpa"
        assert config.hf_repo == "Banafo/test-onnx"
        assert config.hf_token == "hf_x"


@pytest.mark.unit
class TestResolveDevice:
    def test_explicit_cpu(self):
        cfg = STTConfig.from_env({"STT_DEVICE": "cpu", "STT_COMPUTE_TYPE": "int8"})
        assert resolve_device(cfg) == ("cpu", "int8")

    def test_auto_without_cuda_is_cpu_int8(self, monkeypatch):
        monkeypatch.setattr("whisper_engine._cuda_available", lambda: False)
        assert resolve_device(STTConfig.from_env({})) == ("cpu", "int8")

    def test_auto_with_cuda_is_cuda_float16(self, monkeypatch):
        monkeypatch.setattr("whisper_engine._cuda_available", lambda: True)
        assert resolve_device(STTConfig.from_env({})) == ("cuda", "float16")


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


class _FakeEngine:
    device = "cpu"

    def __init__(self, text="what is the hold risk"):
        self.text = text
        self.received: np.ndarray | None = None

    def transcribe(self, samples: np.ndarray) -> str:
        self.received = samples
        return self.text


@pytest.fixture
def client(monkeypatch):
    fake = _FakeEngine()
    monkeypatch.setattr(app_module, "_engine", fake)
    monkeypatch.setattr(app_module, "build_engine", lambda _c: fake)
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
        assert body["engine"] == "faster_whisper"
        assert body["device"] == "cpu"
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
