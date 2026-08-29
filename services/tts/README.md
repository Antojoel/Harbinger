# Harbinger TTS

[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) text-to-speech behind a
minimal HTTP API. No web UI, no upstream branding — just the model.

## API

| Method | Path | Body / Response |
|---|---|---|
| `POST` | `/speak` | `{"text": "...", "voice": "af_heart"?, "speed": 1.0?}` → `audio/wav` (24 kHz mono) |
| `GET` | `/health` | `{"status", "backend", "sample_rate", "model_loaded"}` |

## Run

```bash
# CPU
docker build -t harbinger-tts services/tts
docker run -p 8200:8200 harbinger-tts

# NVIDIA CUDA
docker build -t harbinger-tts \
  --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu126 \
  services/tts
docker run --gpus all -p 8200:8200 harbinger-tts

# Apple Silicon (native, no container)
pip install -r requirements.txt mlx-audio
TTS_BACKEND=mlx python app.py
```

## Config (env)

| Var | Default | Notes |
|---|---|---|
| `TTS_BACKEND` | `torch` | `torch` (CUDA/CPU) or `mlx` (Apple Silicon) |
| `KOKORO_DEVICE` | `auto` | `auto` \| `cpu` \| `cuda` (torch backend) |
| `KOKORO_VOICE` | `af_heart` | any Kokoro voice id |
| `KOKORO_LANG_CODE` | `a` | `a` = American English |
| `TTS_PORT` | `8200` | |

`espeak.py` steers the phonemizer to the system `espeak-ng` because Kokoro's
bundled `libespeak-ng` has a data path hard-compiled to its CI build directory.
