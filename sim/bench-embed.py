#!/usr/bin/env python3
"""
Bake-off: compare speaker-embedding models on the local sim/voices set (already
telephone-degraded by cv-fetch.py --concat, or raw). Prints same/diff cosine
separation + EER for each model so we can pick the best backbone.

  python3 sim/bench-embed.py sim/voices ecapa wavlm

Run inside the voiceprint container (has torch + the models).
"""
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from math import gcd

DIR = Path(sys.argv[1])
MODELS = sys.argv[2:] or ["ecapa", "wavlm"]
SR = 16000
MAX_S = 20


def load_audio(p):
    data, sr = sf.read(str(p), dtype="float32", always_2d=True)
    x = data.mean(axis=1)
    if int(sr) != SR:
        g = gcd(int(sr), SR)
        x = resample_poly(x, SR // g, int(sr) // g).astype("float32")
    return x[: MAX_S * SR]


def l2(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v


def get_ecapa():
    import torch
    from speechbrain.inference.speaker import EncoderClassifier
    torch.set_num_threads(4)
    m = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb", savedir="/app/model",
        run_opts={"device": "cpu"})
    m.eval()

    def emb(x):
        with torch.no_grad():
            e = m.encode_batch(torch.from_numpy(x).unsqueeze(0)).squeeze().cpu().numpy()
        return l2(e.astype("float32"))
    return emb


def get_wavlm():
    import torch
    from transformers import Wav2Vec2FeatureExtractor, WavLMForXVector
    torch.set_num_threads(4)
    fe = Wav2Vec2FeatureExtractor.from_pretrained("microsoft/wavlm-base-plus-sv")
    m = WavLMForXVector.from_pretrained("microsoft/wavlm-base-plus-sv")
    m.eval()

    def emb(x):
        with torch.no_grad():
            inp = fe(x, sampling_rate=SR, return_tensors="pt")
            e = m(**inp).embeddings.squeeze().cpu().numpy()
        return l2(e.astype("float32"))
    return emb


def get_wavlm_ft():
    """wavlm-base-plus-sv but with pos_conv weight_norm reloaded correctly."""
    import torch
    from transformers import Wav2Vec2FeatureExtractor, WavLMForXVector
    torch.set_num_threads(4)
    fe = Wav2Vec2FeatureExtractor.from_pretrained("microsoft/wavlm-base-plus-sv")
    m = WavLMForXVector.from_pretrained("microsoft/wavlm-base-plus-sv")
    # older checkpoints store pos_conv as weight_g/weight_v; newer torch expects
    # parametrizations. Pull the raw tensors from the checkpoint and set them.
    from huggingface_hub import hf_hub_download
    import safetensors.torch as st
    sd = st.load_file(hf_hub_download("microsoft/wavlm-base-plus-sv", "model.safetensors"))
    conv = m.wavlm.encoder.pos_conv_embed.conv
    g = sd.get("wavlm.encoder.pos_conv_embed.conv.weight_g")
    v = sd.get("wavlm.encoder.pos_conv_embed.conv.weight_v")
    if g is not None and v is not None:
        with torch.no_grad():
            try:
                conv.parametrizations.weight.original0.copy_(g)
                conv.parametrizations.weight.original1.copy_(v)
                print("  [wavlm_ft] pos_conv weight_norm restored")
            except Exception as e:
                print("  [wavlm_ft] restore failed:", e)
    m.eval()

    def emb(x):
        with torch.no_grad():
            inp = fe(x, sampling_rate=SR, return_tensors="pt")
            e = m(**inp).embeddings.squeeze().cpu().numpy()
        return l2(e.astype("float32"))
    return emb


BUILDERS = {"ecapa": get_ecapa, "wavlm": get_wavlm, "wavlm_ft": get_wavlm_ft}

clips = []
for d in sorted(DIR.iterdir()):
    if not d.is_dir():
        continue
    for f in sorted(list(d.glob("*.wav")) + list(d.glob("*.mp3"))):
        clips.append((d.name, f))
print(f"{len(clips)} clips, {len(set(c[0] for c in clips))} speakers\n")
audio = [(spk, load_audio(f)) for spk, f in clips]

for name in MODELS:
    t0 = time.time()
    emb = BUILDERS[name]()
    vecs = [(spk, emb(x)) for spk, x in audio]
    same, diff = [], []
    for i in range(len(vecs)):
        for j in range(i + 1, len(vecs)):
            c = float(vecs[i][1] @ vecs[j][1])
            (same if vecs[i][0] == vecs[j][0] else diff).append(c)
    same, diff = np.array(same), np.array(diff)
    best_gap, best = 1.0, (0.0, 0.0, 0.0)
    for t in np.arange(0.0, 0.95, 0.005):
        far = float((diff >= t).mean())
        frr = float((same < t).mean())
        if abs(far - frr) < best_gap:
            best_gap, best = abs(far - frr), (t, far, frr)
    t, far, frr = best
    print(f"{name:10s} same {same.mean():.3f}  diff {diff.mean():.3f}  "
          f"maxdiff {diff.max():.3f}  EER {(far + frr) / 2 * 100:.2f}% @ cos {t:.3f}   "
          f"({time.time() - t0:.0f}s)")
