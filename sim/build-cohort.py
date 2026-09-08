#!/usr/bin/env python3
"""
Build the s-norm cohort: N diverse speaker embeddings the voiceprint service
normalises every match score against. Adaptive symmetric normalisation (s-norm)
cut EER from 1.7% to 0.55% in the eval — this is the cohort it needs.

Run inside the voiceprint container against a Common Voice slice:

  python3 build-cohort.py /app/voices /app/cohort.npy 250

One clip per speaker, phone-band-limited to match production, embedded with the
same model the service uses. Commit the .npy (small) to deploy/voiceprint/.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from math import gcd

SRC, OUT = Path(sys.argv[1]), sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 250
SR = 16000

import torch  # noqa: E402
from speechbrain.inference.speaker import EncoderClassifier  # noqa: E402

torch.set_num_threads(4)
model = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb", savedir="/app/model",
    run_opts={"device": "cpu"})
model.eval()


def band_limit(src, dst):
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
         "-ac", "1", "-ar", "16000", "-af", "highpass=f=250,lowpass=f=3600",
         "-c:a", "pcm_s16le", str(dst)],
        check=True,
    )


def embed(path):
    data, sr = sf.read(str(path), dtype="float32", always_2d=True)
    x = data.mean(axis=1)
    if int(sr) != SR:
        g = gcd(int(sr), SR)
        x = resample_poly(x, SR // g, int(sr) // g).astype("float32")
    x = x[: 20 * SR]
    with torch.no_grad():
        e = model.encode_batch(torch.from_numpy(x).unsqueeze(0)).squeeze().cpu().numpy()
    e = e.astype("float32")
    n = np.linalg.norm(e)
    return e / n if n > 1e-9 else e


rows = []
tmp = Path(tempfile.mkdtemp())
speakers = sorted([d for d in SRC.iterdir() if d.is_dir()])
for i, d in enumerate(speakers):
    if len(rows) >= N:
        break
    clips = sorted(list(d.glob("*.wav")) + list(d.glob("*.mp3")))
    if not clips:
        continue
    try:
        bl = tmp / f"{i}.wav"
        band_limit(clips[0], bl)
        rows.append(embed(bl))
        print(".", end="", flush=True)
    except Exception as e:
        print("x", end="", flush=True)

mat = np.vstack(rows).astype("float32")
np.save(OUT, mat)
print(f"\ncohort: {mat.shape} -> {OUT}")
