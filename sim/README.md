# AI Guard — simulation & proof harness

What can be proven **without** the Turkish SIP number and **without** `firebase deploy`.
The only thing none of these cover is the raw SIP audio path (Netgsm → LiveKit →
the AI hearing the real caller) and the FCM push physically landing on a phone —
both are a 10-minute manual test once the number exists.

## 1. `full-call.mjs` — the whole decision chain

```
node services/guard/sim/full-call.mjs
```

Runs scripted TR / ES / DE transcripts (scam, threat, harassment, legit, plus
voiceprint / personal-block cases) through `DetectionSession → GuardCall (policy
+ safe replies) → worker-policy`. Asserts, per scenario: risk band, dominant
category, whether recording arms, whether the number goes to the community scam
DB, whether a `guard_voice_match` push fires, and that every AI line passes
`isSafeLine`. Exits non-zero on any mismatch — it's a regression gate.

Caught one real bug on first run (personal-block push was gated behind `??`
instead of a hard OR).

`--live` also pings the real voiceprint `/health`.

## 2. `voiceprint-eval.mjs` — the accuracy number

```
node services/guard/sim/voiceprint-eval.mjs sim/voices
```

Feed it `sim/voices/<speaker>/<clip>.{wav,mp3,m4a,…}` — **≥5 speakers, ≥2 clips
each**, 5-15 s of speech. It telephone-degrades every clip (8 kHz + μ-law
round-trip via ffmpeg, matching the SIP codec), embeds each through the
voiceprint service `/embed`, then reports the same-speaker vs different-speaker
cosine distributions, the **EER**, the threshold for a target false-accept rate
(default 0.1 %), and how the current `VP_JOIN` scores.

Getting real audio, cheapest first:
- **record**: 5-10 people read a short paragraph twice on a phone call / voice
  memo. Zero cost, most realistic.
- **Mozilla Common Voice (Turkish)** validated clips — real speakers, free.
- **ElevenLabs** multi-voice generation (~$2 for a 6-speaker set) — fast but
  synthetic voices separate *better* than real humans, so the EER comes out
  optimistic. Baseline only.

## 3. Firestore rules (`test/rules.test.mjs`, when added)

`@firebase/rules-unit-testing` + the emulator, run with
`firebase emulators:exec`. Proves e.g. a user can create their own
`guard_block_requests` but not another user's, can read their own
`guard_voice_blocks` only, and the admin can flip `guard_voice_clusters.verified`
but not `.size`. No deploy needed.

## 4. FCM path (`sim/fcm-probe.mjs`, when added)

Fire a real `guard_voice_match` / `guard_risk` data message at a device's FCM
token (from `guard_pending` or a debug screen) — the phone should light up the
düello view / caller banner with **no call involved**. Proves worker → FCM → app
routing in isolation.
