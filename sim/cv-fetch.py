#!/usr/bin/env python3
"""
Pull a speaker-labelled slice of Mozilla Common Voice (Turkish) for the
voiceprint accuracy eval. CC0 dataset, public download, no token.

  python3 cv-fetch.py <test.tsv> <tr_test_0.tar> <outdir> [maxSpeakers] [clipsPerSpeaker] [concatGroup]

Writes  <outdir>/<speaker>/<n>.mp3  ready for  sim/voiceprint-eval.mjs.
With concatGroup=K it instead glues every K clips into one <speaker>/long_<i>.wav
(needs ffmpeg) so each sample is ~K*4s — closer to a real 2-minute scam call
than a single 4s Common Voice sentence.
Prefers speakers with a gender label and spreads across genders for a fair mix.
"""
import csv
import random
import subprocess
import sys
import tarfile
from collections import defaultdict
from pathlib import Path

tsv_path, tar_path, outdir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
MAX_SPEAKERS = int(sys.argv[4]) if len(sys.argv) > 4 else 50
CLIPS = int(sys.argv[5]) if len(sys.argv) > 5 else 3
CONCAT = int(sys.argv[6]) if len(sys.argv) > 6 else 0
random.seed(42)

by_spk = defaultdict(list)
meta = {}
with open(tsv_path, encoding="utf-8") as f:
    r = csv.DictReader(f, delimiter="\t")
    for row in r:
        cid = row.get("client_id") or ""
        p = row.get("path") or ""
        if not cid or not p.endswith(".mp3"):
            continue
        by_spk[cid].append(p)
        meta.setdefault(cid, row.get("gender") or row.get("sex") or "")

eligible = [(c, ps) for c, ps in by_spk.items() if len(ps) >= CLIPS]
random.shuffle(eligible)
# spread across gender labels where present
buckets = defaultdict(list)
for c, ps in eligible:
    buckets[meta.get(c, "")].append((c, ps))
picked = []
i = 0
keys = [k for k in buckets if k] + [""]  # labelled first, then unknown
while len(picked) < MAX_SPEAKERS and any(buckets[k] for k in keys):
    k = keys[i % len(keys)]
    if buckets[k]:
        picked.append(buckets[k].pop())
    i += 1

want = {}  # tar member name -> (speaker short, local filename)
for c, ps in picked:
    short = c[:16]
    for n, p in enumerate(random.sample(ps, CLIPS)):
        want[p] = (short, f"{n}.mp3")
        want[Path(p).name] = (short, f"{n}.mp3")  # tar may store bare names

print(f"selected {len(picked)} speakers x {CLIPS} clips = {len(picked)*CLIPS} clips")
outdir.mkdir(parents=True, exist_ok=True)
got = 0
with tarfile.open(tar_path) as t:
    for m in t:
        base = Path(m.name).name
        hit = want.get(m.name) or want.get(base)
        if not hit or not m.isfile():
            continue
        short, fn = hit
        d = outdir / short
        d.mkdir(exist_ok=True)
        src = t.extractfile(m)
        if not src:
            continue
        (d / fn).write_bytes(src.read())
        got += 1
print(f"extracted {got} clips into {outdir}")

if CONCAT >= 2:
    n_long = 0
    for d in outdir.iterdir():
        if not d.is_dir():
            continue
        mp3s = sorted(d.glob("*.mp3"))
        for i in range(0, len(mp3s) - CONCAT + 1, CONCAT):
            grp = mp3s[i:i + CONCAT]
            lst = d / f"_list{i}.txt"
            lst.write_text("".join(f"file '{p.name}'\n" for p in grp))
            out = d / f"long_{i // CONCAT}.wav"
            subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                 "-f", "concat", "-safe", "0", "-i", str(lst),
                 "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(out)],
                check=True,
            )
            lst.unlink()
            n_long += 1
        for p in mp3s:
            p.unlink()
    print(f"concatenated into {n_long} long samples ({CONCAT} clips each)")

kept = [d for d in outdir.iterdir()
        if d.is_dir() and len(list(d.glob('*.mp3')) + list(d.glob('*.wav'))) >= 2]
print(f"{len(kept)} speakers with >=2 usable samples")
