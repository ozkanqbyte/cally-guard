/**
 * Cally AI Guard worker.
 *
 * LiveKit dispatches one instance of this into every `guard-*` room (a room is
 * created per inbound call by a LiveKit SIP dispatch rule). It wires the
 * caller's audio through self-hosted Whisper + Piper into the already-tested
 * `VoiceAgent`, and pushes the live risk to the user's phone via FCM.
 *
 * The decision logic (`../../src/`) is unit-tested and unchanged. This file is
 * glue and has to be run against a live LiveKit + Whisper + Piper to verify —
 * `docker compose up` does exactly that. Keep it thin.
 *
 *   docker compose up -d        # brings this up with everything it needs
 */
import { cli, defineAgent, JobContext } from '@livekit/agents';
import { AudioSource, AudioStream } from '@livekit/rtc-node';
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

import { VoiceAgent } from '../../src/agent/voice-agent.mjs';
import { humanize } from '../../src/agent/humanize.mjs';
import { llmPolishFromEnv, llmConverseFromEnv } from '../../src/agent/providers/llm-polish.mjs';
import { LexiconOverlay } from '../../src/detection/overlay.mjs';
import { CallRecorder } from '../../src/agent/call-recorder.mjs';
import { WhisperStt } from '../../src/agent/providers/whisper-stt.mjs';
import { DeepgramStt } from '../../src/agent/providers/deepgram-stt.mjs';
import { PiperTts } from '../../src/agent/providers/piper-tts.mjs';
import { CartesiaTts } from '../../src/agent/providers/cartesia-tts.mjs';
import { ElevenLabsTts } from '../../src/agent/providers/elevenlabs-tts.mjs';

// ── provider pick (env-driven) ───────────────────────────────────────────────
// STT_PROVIDER = whisper (default, free self-host) | deepgram
// TTS_PROVIDER = piper   (default, free self-host) | elevenlabs | cartesia
function makeStt() {
  if (process.env.STT_PROVIDER === 'deepgram') {
    return new DeepgramStt({ apiKey: process.env.DEEPGRAM_API_KEY });
  }
  return new WhisperStt({ baseUrl: process.env.WHISPER_URL });
}
function makeTts() {
  if (process.env.TTS_PROVIDER === 'elevenlabs') {
    return new ElevenLabsTts({
      apiKey: process.env.ELEVENLABS_API_KEY,
      voiceId: process.env.ELEVENLABS_VOICE_ID,
      model: process.env.ELEVENLABS_MODEL || undefined,
      output: 'pcm_16000', // LiveKit AudioSource below is 16 kHz linear PCM
    });
  }
  if (process.env.TTS_PROVIDER === 'cartesia') {
    return new CartesiaTts({
      apiKey: process.env.CARTESIA_API_KEY,
      voiceId: process.env.CARTESIA_VOICE_ID,
    });
  }
  return new PiperTts({ baseUrl: process.env.PIPER_URL });
}

// ── FCM ──────────────────────────────────────────────────────────────────────
if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(readFileSync(process.env.FCM_SERVICE_ACCOUNT_JSON, 'utf8')),
    ),
  });
}
const pushToPhone = async (token, data) => {
  if (!token || !admin.apps.length) return;
  await admin.messaging().send({
    token,
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
    ),
    android: { priority: 'high' },
  });
};

// ── shared scam lexicon ──────────────────────────────────────────────────────
// The admin panel writes extra scam phrases to Firestore `guard_lexicon/{locale}`
// ({ signalId: ["phrase" | "a + b", …] }). Load them once at boot and merge into
// the built-in lexicon so a phrase added in the panel protects the voice line
// too — the same doc the phone app reads on launch. Refreshed hourly.
const GUARD_LOCALE = process.env.GUARD_LOCALE || 'tr';
let lexiconOverlay = {};
async function refreshLexicon() {
  if (!admin.apps.length) return;
  try {
    const ov = new LexiconOverlay();
    const locales = GUARD_LOCALE === 'tr' ? ['tr'] : [GUARD_LOCALE, 'tr'];
    for (const loc of locales) {
      const snap = await admin.firestore().collection('guard_lexicon').doc(loc).get();
      if (!snap.exists) continue;
      for (const [signalId, phrases] of Object.entries(snap.data() || {})) {
        for (const p of Array.isArray(phrases) ? phrases : []) ov.addPhrase(GUARD_LOCALE, signalId, String(p));
      }
    }
    lexiconOverlay = ov.get(GUARD_LOCALE);
    const n = Object.values(lexiconOverlay).reduce((s, g) => s + g.length, 0);
    console.log(`[guard] lexicon overlay: ${n} extra phrase-group(s) from guard_lexicon`);
  } catch (e) {
    console.warn(`[guard] lexicon overlay load failed (using built-in only): ${e.message}`);
  }
}
await refreshLexicon();
setInterval(refreshLexicon, 60 * 60 * 1000).unref?.();

// ── The agent ────────────────────────────────────────────────────────────────
export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();
    const callId = ctx.room.name.replace(/^guard-/, '');
    // the app puts the user's FCM token in room metadata when it starts the call
    const fcmToken = safeJson(ctx.room.metadata)?.fcmToken;

    const caller = await waitForCaller(ctx);
    const pcmIn = pcmSourceFrom(new AudioStream(caller));

    const stt = makeStt();
    stt.attach(pcmIn);

    // optional evidence recorder — off unless GUARD_RECORD_DIR is set, and even
    // then only kept for a call the engine flags (armed in onRisk below)
    const recorder = CallRecorder.fromEnv(callId);
    if (recorder) pcmIn.on('data', (buf) => recorder.write(buf));

    const tts = makeTts();
    const out = new AudioSource(16000, 1);
    await ctx.room.localParticipant.publishTrack(out.track ?? out); // publish our voice

    // an unhurried "thinking" beat before every line; a real person is not instant
    const paceMs = Number(process.env.AGENT_PACE_MS ?? 350);
    // How the AI speaks, best first:
    //  1. "sohbet modu" — the LLM writes each line as a real conversation
    //     (rules still score, decide the move, own the greeting/goodbye + guard).
    //  2. LLM "polish" — the LLM only rewords the vetted line, humanize adds
    //     the hesitation.
    //  3. no key — humanize over the fixed safe lines.
    // VoiceAgent re-runs isSafeLine on whatever comes back.
    const converse = llmConverseFromEnv();
    const llm = converse ? null : llmPolishFromEnv();
    const polish = converse
      ? async (line, ctx) => converse({
          callerText: ctx.callerText || '',
          move: ctx.move || (ctx.band === 'greet' ? 'greet' : 'probe'),
          risk: ctx.risk ?? 0,
          scamType: ctx.reasons?.[0]?.label,
          transcript: ctx.transcript || [],
          fallback: line,
        })
      : llm
        ? async (line, ctx) => humanize(await llm(line, ctx), ctx)
        : humanize;

    const agent = new VoiceAgent({
      callId,
      stt,
      paceMs,
      locale: GUARD_LOCALE,
      overlay: lexiconOverlay,
      tts: {
        speak: async (text) => {
          const { audio, durationMs } = await tts.speak(text);
          await out.captureFrame(audio);
          return { text, durationMs };
        },
      },
      polish,
      onRisk: (r) => {
        if (recorder && (r.band === 'high' || r.band === 'severe' || r.risk >= 60)) recorder.arm();
        pushToPhone(fcmToken, {
          type: 'guard_risk', callId, risk: r.risk, band: r.band,
          reasons: r.reasons.map((x) => x.id),
        }).catch(() => {});
      },
      onEnd: async ({ reason, summary }) => {
        const clip = await recorder?.finish().catch(() => null);
        if (clip) console.log(`[guard] evidence clip: ${clip}`);
        await pushToPhone(fcmToken, { type: 'guard_summary', callId, reason, summary }).catch(() => {});
        await ctx.room.disconnect();
      },
    });

    await agent.start();
  },
});

cli.runApp({ agent: new URL(import.meta.url).pathname });

// ── helpers ──────────────────────────────────────────────────────────────────
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function waitForCaller(ctx) {
  return new Promise((resolve) => {
    for (const p of ctx.room.remoteParticipants.values()) {
      const t = [...p.trackPublications.values()].find((x) => x.kind === 'audio')?.track;
      if (t) return resolve(t);
    }
    ctx.room.on('trackSubscribed', (track) => { if (track.kind === 'audio') resolve(track); });
  });
}

/** Adapt a LiveKit AudioStream to the { on('data'|'end') } shape the STT wants. */
function pcmSourceFrom(audioStream) {
  const handlers = { data: [], end: [] };
  (async () => {
    for await (const frame of audioStream) {
      for (const h of handlers.data) h(Buffer.from(frame.data.buffer));
    }
    for (const h of handlers.end) h();
  })();
  return { on: (e, cb) => handlers[e].push(cb) };
}

