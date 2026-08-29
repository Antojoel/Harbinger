# Harbinger STT (Kroko / Zipformer on sherpa-onnx).
#
#   docker build -t harbinger-stt services/stt
#
# CPU only by default (streaming Zipformer runs comfortably faster than
# real time on CPU). For CUDA, install a GPU sherpa-onnx build and set
# STT_PROVIDER=cuda.
#
# The default model is public and downloaded on first start. To use the real
# Kroko community models, set STT_HF_REPO=Banafo/test-onnx and STT_HF_TOKEN,
# or mount a model directory and set STT_MODEL_DIR.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/models

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./

# Bake the default model into the image so first request is fast / offline-safe.
RUN python -c "from config import STTConfig; from recognizer import _resolve_model_files; _resolve_model_files(STTConfig())"

EXPOSE 8100

CMD ["python", "app.py"]
