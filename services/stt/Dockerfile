# Harbinger STT.
#
#   docker build -t harbinger-stt services/stt
#
# Default engine is faster-whisper (Whisper on CTranslate2). It runs on CUDA
# automatically when the container can see a GPU:
#
#   docker run --gpus all -p 8100:8100 harbinger-stt
#
# With no GPU it falls back to CPU int8. Set STT_ENGINE=sherpa to use the
# lighter streaming Zipformer / Kroko transducer instead.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/models \
    STT_MODEL_CACHE=/models

# CTranslate2 loads cuBLAS / cuDNN from the pip-installed nvidia-*-cu12 wheels.
ENV LD_LIBRARY_PATH=/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./

# Bake the default Whisper weights into the image (fetched on CPU, used on GPU
# at runtime) so the first request is fast and works offline.
ARG STT_WHISPER_MODEL=small.en
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${STT_WHISPER_MODEL}', device='cpu', compute_type='int8', download_root='/models')"

EXPOSE 8100

CMD ["python", "app.py"]
