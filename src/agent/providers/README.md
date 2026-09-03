# AI Guard — external providers

The engine, the ensemble and the agent loop are done and tested. These are the
seams for the parts that need a real account. Nothing here runs in `npm test`.

## The call path

```
  scammer ──PSTN──▶ Telnyx number ──SIP trunk──▶ LiveKit room
                                                     │
                                          ┌──────────┴──────────┐
                                          ▼                     ▼
                                   DeepgramStt            CartesiaTts
                                    (audio→text)           (text→audio)
                                          │                     ▲
                                          ▼                     │
                                    VoiceAgent ── GuardCall ── policy
                                          │
                                     onRisk ──▶ FCM ──▶ user's phone
```

## Wiring

| File | Provider | Env |
|---|---|---|
| `deepgram-stt.mjs` | Deepgram **Nova-3** streaming STT (best Turkish) | `DEEPGRAM_API_KEY` |
| `whisper-stt.mjs` | self-hosted faster-whisper (free) | `WHISPER_URL` |
| `elevenlabs-tts.mjs` | ElevenLabs TTS — most natural Turkish, `eleven_flash_v2_5`, 8 kHz μ-law | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` |
| `cartesia-tts.mjs` | Cartesia TTS — cheap real-time | `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID` |
| `piper-tts.mjs` | self-hosted Piper (free) | `PIPER_URL` |
| `livekit-worker.mjs` | LiveKit Agents worker (entrypoint) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| (Telnyx dashboard) | SIP trunk → LiveKit SIP ingress | `TELNYX_*` |

The worker picks providers from `STT_PROVIDER` / `TTS_PROVIDER` (see `deploy/env.sample`);
default is the free self-hosted pair. Swapping to ElevenLabs + Deepgram is two env lines.

## Sounding like a person, not a bot

Two seams, both on by default in the worker, neither touching *what* the AI is allowed to say:

- **`../humanize.mjs`** — a deterministic `polish` that prepends a short hesitation
  (`"Şey, …"`, `"Bir saniye, …"`) and the odd `"yavaş konuşur musunuz?"`. The result is
  re-checked by `isSafeLine`. Compose it under an LLM: `humanize(await llm(line, ctx), ctx)`.
- **`VoiceAgent({ paceMs })`** — a ~350 ms beat before each line so the AI does not answer
  with instant, robotic precision. `AGENT_PACE_MS` in the environment.
- **`llm-polish.mjs`** — optional hybrid: an LLM (`LLM_PROVIDER` = gemini/openai/anthropic/
  deepseek) rewords the vetted line so it varies and adapts to what the scammer just said.
  Gemini default `gemini-2.5-flash-lite`. The rewrite is dropped if it's empty, truncated,
  or contains a number/confirmation — and on any timeout/error — so it is never less safe
  and never silent. Compose: `humanize(await llm(line, ctx), ctx)`.

Also: request **8 kHz μ-law** from the TTS (the adapter default) so the voice matches the
phone line instead of sounding like studio audio dropped into a call.

## Telnyx → LiveKit

1. Buy a number, create a **SIP trunk** in Telnyx.
2. Create a **LiveKit SIP inbound trunk** and a **dispatch rule** that puts each
   inbound call into a fresh room named `guard-<callId>`.
3. Point the Telnyx trunk at LiveKit's SIP URI.
4. `livekit-worker.mjs` is dispatched into every `guard-*` room and runs the agent.

No custom bridge code — LiveKit SIP + a dispatch rule do it. The only code you
write is the worker.

## Cost per 5-min AI Guard call (approx, USD)

| STT | LLM (optional) | TTS | Telephony | Total |
|---|---|---|---|---|
| $0.02–0.05 | $0.01–0.04 | $0.05–0.20 | $0.02–0.08 | **~$0.12–0.40** |
