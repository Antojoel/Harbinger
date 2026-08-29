# Harbinger STT

Speech-to-text behind a minimal HTTP API. Two interchangeable engines:

| `STT_ENGINE` | Backend | Notes |
|---|---|---|
| `faster_whisper` *(default)* | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (Whisper on CTranslate2) | Accurate on free-form speech. Uses CUDA automatically when a GPU is visible, else CPU int8. Built-in VAD. |
| `sherpa` | Kroko / Zipformer transducer on [sherpa-onnx](https://k2-fsa.github.io/sherpa/) | Light, streaming, CPU-only here. Much weaker on unconstrained speech. |

## API

| Method | Path | Body / Response |
|---|---|---|
| `POST` | `/transcribe` | multipart form field `audio` (wav/mp3/webm/ogg/m4a/flac — decoded via ffmpeg) → `{"text": "..."}` |
| `GET` | `/health` | `{"status", "engine", "model", "device", "sample_rate", "model_loaded"}` |

## Run

```bash
docker build -t harbinger-stt services/stt

# GPU (needs nvidia-container-toolkit on the host)
docker run --gpus all -p 8100:8100 harbinger-stt

# CPU only
docker run -p 8100:8100 harbinger-stt
```

The default Whisper weights (`small.en`) are baked into the image, so the first
request is fast and works offline.

## Config (env)

| Var | Default | Notes |
|---|---|---|
| `STT_ENGINE` | `faster_whisper` | `faster_whisper` \| `sherpa` |
| `STT_WHISPER_MODEL` | `small.en` | `tiny.en` … `small.en` … `distil-large-v3` … `large-v3`. Non-default models download on first start. |
| `STT_DEVICE` | `auto` | `auto` \| `cpu` \| `cuda` |
| `STT_COMPUTE_TYPE` | `auto` | `auto` → `float16` on GPU, `int8` on CPU. Also `int8_float16`, `float32`, … |
| `STT_LANGUAGE` | `en` | `""` to autodetect |
| `STT_BEAM_SIZE` | `5` | |
| `STT_VAD_FILTER` | `1` | `0` to disable the built-in silence filter |
| `STT_PORT` | `8100` | |

### sherpa engine only

| Var | Default | Notes |
|---|---|---|
| `STT_MODEL_DIR` | — | load `*.onnx` + `tokens.txt` from a mounted dir |
| `STT_HF_REPO` | `csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26` | `Banafo/test-onnx` for the real Kroko community models |
| `STT_HF_TOKEN` | — | required for `Banafo/test-onnx` |
| `STT_PROVIDER` | `cpu` | `cpu` \| `cuda` \| `coreml` |

CUDA note: CTranslate2 pulls cuBLAS / cuDNN 9 from the pip `nvidia-*-cu12`
wheels baked into the image; the Dockerfile puts them on `LD_LIBRARY_PATH`.
