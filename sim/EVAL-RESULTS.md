# Voiceprint accuracy — first real measurement (2026-09-08)

**Dataset:** Mozilla Common Voice 17 (Turkish), test split, CC0. 60 speakers,
spread across gender labels, 9 clips each → concatenated into 3 samples of ~12 s
(a single CV sentence is ~4 s; a real scam call is 1-2 min, so these are still
short — the live numbers should be a bit **better** than this).

**Pipeline:** each sample telephone-degraded (8 kHz + μ-law round-trip + 300-3400
Hz band, matching the SIP codec) → ECAPA embedding via `POST /embed` → all
pairwise cosines. 180 same-speaker pairs, 15 930 different-speaker pairs.

```
same-speaker  cosine   mean 0.693   p05 0.456   min 0.315
diff-speaker  cosine   mean 0.236   p95 0.437   max 0.773

EER                 4.05 %   at cosine 0.450
0.1 % false-accept  at cosine 0.670   → 37 % of repeat calls missed
```

| threshold | false-accept (innocent wrongly matched) | miss (same voice not linked) |
|-----------|------|------|
| 0.45 (EER) | 4.2 % | 3.9 % |
| **0.55** (old default) | 0.79 % | 12 % |
| **0.60** (new `VP_JOIN`) | ~0.4 % | ~18 % |
| 0.67 | 0.10 % | 37 % |

## What changed

- `VP_JOIN` 0.55 → **0.60** for community cluster joins — a wrong *shared* merge
  can taint an innocent number, so this side is kept strict. Halves the
  false-merge rate for ~6 pp of recall.
- New **`VP_PERSONAL_JOIN` = 0.52** for personal-block hits — the user flagged
  that voice themselves; lower stakes, keep the recall.
- Both live-tunable via `guard_config/voiceprint` (`join`, `personalJoin`).

## Honest read

- **The safety property holds:** at 0.60, ~1 in 250 different-speaker
  comparisons falsely matches, and a match never auto-acts — `push` still needs
  `verified` OR cluster size ≥ 2, and the admin has split/merge tools. Nobody
  gets wrongly warned about from a single loose match.
- **Recall is the weak side:** ~18 % of a scammer's repeat calls won't link at
  0.60 on 12 s audio. Real 1-2 min calls will do better, but "caught this voice
  12 times" will in practice be more like "caught 8-9 times". Still a moat,
  slightly softer than hoped.
- **The tail is real:** one pair of *different* CV speakers hit cosine 0.773.
  Biometrics always has this — the `verified` human check is the backstop.
- ECAPA is trained on English VoxCeleb; a Turkish-tuned or telephone-tuned
  speaker model would cut EER further. Not worth it yet.

## Re-run

```
# on the server (VP /embed is localhost-only):
cd /root/guard
python3 sim/cv-fetch.py /tmp/cv_test.tsv /tmp/cv_test.tar sim/voices 60 9 3
VP_URL=http://127.0.0.1:8090 node sim/voiceprint-eval.mjs sim/voices
```
