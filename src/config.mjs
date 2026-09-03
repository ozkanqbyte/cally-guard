/**
 * The external providers the full AI Guard needs, and where each one plugs in.
 *
 * Nothing here is called by the tests - the engine and the agent run on fakes.
 * This file is the single place a deployment wires real accounts, and the
 * honest map of what is still "buy an account + money" versus "already built".
 */

export const INTEGRATIONS = {
  // ── Already in this repo, no account needed ────────────────────────────────
  rulesEngine:   { status: 'built',   module: 'src/detection/detector.mjs', note: 'locale-pluggable — src/detection/locales/{tr,en}.mjs; add a country = one data file' },
  mlClassifier:  { status: 'built',   module: 'src/ml/classifier.mjs', note: 'seed model; retrain server-side on reports' },
  ensemble:      { status: 'built',   module: 'src/ensemble/ensemble.mjs' },
  conversation:  { status: 'built',   module: 'src/guard/policy.mjs', note: 'runs with zero LLM' },
  agentLoop:     { status: 'built',   module: 'src/agent/voice-agent.mjs', note: 'paceMs adds a human "thinking" beat before each line' },
  humanize:      { status: 'built',   module: 'src/agent/humanize.mjs', note: 'deterministic "confused person" fillers; drop in as VoiceAgent.polish' },
  observability: { status: 'built',   module: 'src/observability/events.mjs', note: 'point the sink at Firestore/analytics' },

  // ── Needs an account + (usually) money. Interfaces are ready. ──────────────
  sip: {
    status: 'external',
    provider: 'Telnyx (or Twilio)',
    need: 'phone numbers + a SIP trunk that forwards inbound audio to LiveKit',
    seam: 'a webhook that creates a LiveKit room per call and bridges the trunk',
  },
  media: {
    status: 'external-selfhostable',
    provider: 'LiveKit',
    need: 'a media server (self-host on a VPS, or LiveKit Cloud)',
    seam: 'src/agent/voice-agent.mjs consumes STT events + emits TTS audio',
  },
  stt: {
    status: 'external',
    provider: 'Deepgram Nova-3 (or self-hosted Whisper)',
    need: 'streaming Turkish speech-to-text; emit { final: text } / { hangup }',
    built: 'src/agent/providers/deepgram-stt.mjs · src/agent/providers/whisper-stt.mjs',
    seam: 'src/agent/adapters.mjs — replace FakeStt with the same on()/events surface',
    env: 'DEEPGRAM_API_KEY  (or WHISPER_URL for self-host)',
  },
  tts: {
    status: 'external',
    provider: 'ElevenLabs (most natural) / Cartesia (cheap real-time) / Piper (free)',
    need: 'low-latency Turkish text-to-speech, phone-band (8 kHz μ-law)',
    built: 'src/agent/providers/{elevenlabs,cartesia,piper}-tts.mjs',
    seam: 'src/agent/adapters.mjs — replace FakeTts.speak(text) -> audio',
    env: 'ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID  (or CARTESIA_* / PIPER_URL)',
  },
  llmPolish: {
    status: 'external-optional',
    provider: 'Gemini Flash / GPT-4o-mini / Claude Haiku / DeepSeek (any)',
    need: 'rephrase the vetted line so it sounds natural; system runs fine without it',
    built: 'src/agent/providers/llm-polish.mjs — makeLlmPolish / llmPolishFromEnv',
    seam: 'VoiceAgent.polish; result re-checked by isSafeLine, raw line on drift/timeout',
    env: 'LLM_PROVIDER (gemini|openai|anthropic|deepseek) + <PROVIDER>_API_KEY',
  },
  llmJudge: {
    status: 'external-optional',
    provider: 'Claude / GPT',
    need: 'a third opinion on rules↔ML conflicts (~5% of calls); system runs without it',
    seam: 'src/ensemble/judge.mjs withFallback(judgeFn)',
  },
  push: {
    status: 'in-app',
    provider: 'Firebase Cloud Messaging',
    need: 'already in the Flutter app — deliver live risk to the phone',
    seam: 'onRisk callback -> FCM send',
  },
};

/** Runtime provider handles, filled from env in a real deployment. */
export const providers = {
  stt: null,
  tts: null,
  sip: null,
  judge: null,
};
