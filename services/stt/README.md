# Harbinger STT

Kroko / Zipformer transducer speech recognition on the
[sherpa-onnx](https://k2-fsa.github.io/sherpa/) runtime, behind a minimal HTTP API.

## API

| Method | Path | Body / Response |
|---|---|---|
| `POST` | `/transcribe` | multipart form field `audio` (wav/mp3/webm/ogg/m4a/flac — decoded via ffmpeg) → `{"text": "..."}` |
| `GET` | `/health` | `{"status", "sample_rate", "provider", "model_loaded"}` |

## Run

```bash
docker build -t harbinger-stt services/stt
docker run -p 8100:8100 harbinger-stt
```

## Model selection (env)

The default model is fully public and needs no credentials.

| Var | Default | Notes |
|---|---|---|
| `STT_MODEL_DIR` | — | if set, load `*.onnx` + `tokens.txt` from this mounted dir |
| `STT_HF_REPO` | `csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26` | set to `Banafo/test-onnx` for the real Kroko community models |
| `STT_HF_TOKEN` | — | required for `Banafo/test-onnx` |
| `STT_ENCODER` / `STT_DECODER` / `STT_JOINER` / `STT_TOKENS` | (match the default repo) | filenames within the repo / dir |
| `STT_PROVIDER` | `cpu` | `cpu` \| `cuda` \| `coreml` |
| `STT_PORT` | `8100` | |

Kroko's public `Banafo/Kroko-ASR` repo ships a packed `.data` format that needs
their (not-yet-on-PyPI) `kroko-onnx` package; their `Banafo/test-onnx` repo
ships plain `encoder/decoder/joiner.onnx` that load directly here.
