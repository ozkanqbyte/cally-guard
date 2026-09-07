# Cally AI Guard — voice-fingerprint service.
#
# Turns each recorded scam call into a 192-d speaker embedding (ECAPA-TDNN via
# SpeechBrain), clusters "same voice" across calls, and answers a live
# "is this a voice we've caught before?" query for the worker.
#
# CPU-only. ~600 MB RAM at rest. The ECAPA model is baked into the image so the
# first request doesn't wait on a HuggingFace download.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    SB_DISABLE_QUIRKS=1 \
    OMP_NUM_THREADS=2

RUN apt-get update && apt-get install -y --no-install-recommends \
      libsndfile1 ffmpeg git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-fetch the ECAPA speaker model into the image.
RUN python -c "from speechbrain.inference.speaker import EncoderClassifier; \
EncoderClassifier.from_hparams(source='speechbrain/spkrec-ecapa-voxceleb', savedir='/app/model', run_opts={'device':'cpu'})"

COPY app.py .

EXPOSE 8090
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8090", "--workers", "1"]
