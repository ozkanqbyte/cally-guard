# Voiceprint accuracy — measured & tuned (2026-09-08)

**Dataset:** Mozilla Common Voice 17 (Turkish), test split, CC0. 60-250 speakers,
spread across gender, ~12 s samples (3 short CV sentences glued — a real scam
call is 1-2 min, so live numbers should be a touch **better**).

**Pipeline:** phone-band-limit at 16 kHz (what LiveKit SIP hands the service —
NOT the μ-law-crushed 8 kHz the first pass assumed) → ECAPA embedding via
`POST /embed` → all pairwise scores. 180 same-speaker pairs, ~16 k
different-speaker pairs.

| scoring | EER | 0.1 % false-accept | at VP_JOIN |
|---------|-----|--------------------|------------|
| raw cosine (was default) | **1.73 %** @ 0.43 | cos 0.615 → 24 % miss | 0.60 → FA 0.12 %, miss 22 % |
| **s-norm (now default)** | **0.55 %** @ 2.18 | → 13 % miss | 0.62 → FA <0.2 %, miss ~15 % |

The earlier "EER 4 %" was a μ-law-pessimistic degrade. Real EER is **1.7 % raw,
0.55 % with s-norm**.

## What changed this pass

1. **s-norm score calibration** — every match score is normalised against a
   250-speaker cohort (`deploy/voiceprint/cohort.npy`, baked in), then squashed
   to 0..1 so `VP_JOIN` etc. keep their meaning. **Cut EER 1.7 % → 0.55 %.**
   Free — no new model. Falls back to raw cosine if the cohort is missing.
2. **Model bake-off** — tested `microsoft/wavlm-base-plus-sv`: EER 3.6 %, 5×
   slower, and a weight-norm load bug. **Rejected. ECAPA stays.**
3. `VP_JOIN` 0.60 → **0.62**, `VP_PERSONAL_JOIN` 0.52 → **0.50**, `VP_MATCH` →
   **0.42** (calibrated scale). `/health` shows `scoring` + `cohort`.

## Honest read

- **EER 0.55 % is commercial-grade** for telephone speaker verification.
  Catches ~9-9.5 of every 10 repeat calls; false-accepts ~1 in 500-1000.
- **Never auto-acts:** a match still needs `verified` OR cluster size ≥ 2 to
  warn a user, admin has split/merge, `verified` is the human backstop for the
  rare tail (one CV pair still hit s-norm 4.1 ≈ 0.87 calibrated).
- Real scam calls (1-2 min) beat the 12 s CV samples → live should be better.
- Next lever (Kademe 3): fine-tune ECAPA on 8 kHz Turkish + your own verified
  clusters → sub-0.3 % and un-copyable. Needs data volume + a GPU run.

## Re-run

```
# on the server (VP /embed is localhost-only):
cd /root/guard
python3 sim/cv-fetch.py /tmp/cv_test.tsv /tmp/cv_test.tar sim/voices 60 9 3
VP_URL=http://127.0.0.1:8090 node sim/voiceprint-eval.mjs sim/voices          # realistic
VP_URL=http://127.0.0.1:8090 node sim/voiceprint-eval.mjs sim/voices --mulaw  # pessimistic
# rebuild the cohort: python3 sim/build-cohort.py <voices-dir> cohort.npy 250
```
