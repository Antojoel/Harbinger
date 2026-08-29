# Harbinger TTS (Kokoro-82M).
#
# CPU (default):
#   docker build -t harbinger-tts services/tts
# NVIDIA CUDA:
#   docker build -t harbinger-tts \
#     --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu126 \
#     services/tts
#   (run with `--gpus all`; the cu126 torch wheels bundle the CUDA libraries,
#    only the host driver + nvidia-container-toolkit are required)
#
# Apple Silicon / MLX is not a container target — run natively, see README.md.

FROM python:3.11-slim

ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/models \
    KOKORO_DEVICE=auto

WORKDIR /app

# espeak-ng + its data: Kokoro's bundled libespeak-ng has a broken data path,
# so services/tts/espeak.py steers the phonemizer to this system copy.
RUN apt-get update && apt-get install -y --no-install-recommends \
        espeak-ng espeak-ng-data libespeak-ng1 libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url "${TORCH_INDEX_URL}" \
    && pip install --no-cache-dir -r requirements.txt

COPY *.py ./

# Bake the model + default voice into the image so the first request is fast
# and works offline.
ARG KOKORO_VOICE=af_heart
RUN python -c "from huggingface_hub import hf_hub_download as d; \
    [d('hexgrad/Kokoro-82M', f) for f in ('kokoro-v1_0.pth', 'config.json', 'voices/${KOKORO_VOICE}.pt')]"

EXPOSE 8200

CMD ["python", "app.py"]
