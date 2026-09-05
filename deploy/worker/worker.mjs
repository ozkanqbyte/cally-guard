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
import { AudioFrame, AudioSource, AudioStream, LocalAudioTrack, TrackKind, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { writeFile, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

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
    return new DeepgramStt({ apiKey: process.env.DEEPGRAM_API_KEY, endpointingMs: 600 });
  }
  return new WhisperStt({ baseUrl: process.env.WHISPER_URL });
}
// TTS is picked per-call by the caller's plan tier (room.metadata.ttsTier),
// not a single global env var — free/default users get the self-hosted, $0
// Piper voice; 'premium' gets Cartesia (cheap, low-latency); 'top' gets
// ElevenLabs (most natural, most expensive). TTS_PROVIDER env var still wins
// if set, for manual testing / a single-tier deployment.
function makeTts(tier) {
  const forced = process.env.TTS_PROVIDER;
  const pick = forced || (tier === 'top' ? 'elevenlabs' : tier === 'premium' ? 'cartesia' : 'piper');

  if (pick === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) {
    return new ElevenLabsTts({
      apiKey: process.env.ELEVENLABS_API_KEY,
      voiceId: process.env.ELEVENLABS_VOICE_ID,
      model: process.env.ELEVENLABS_MODEL || undefined,
      output: 'pcm_16000', // LiveKit AudioSource below is 16 kHz linear PCM
    });
  }
  if (pick === 'cartesia' && process.env.CARTESIA_API_KEY) {
    return new CartesiaTts({
      apiKey: process.env.CARTESIA_API_KEY,
      voiceId: process.env.CARTESIA_VOICE_ID,
    });
  }
  // free tier, or a paid tier requested without its key configured — fall
  // back to the $0 self-hosted voice rather than fail the call.
  return new PiperTts({ baseUrl: process.env.PIPER_URL });
}

// ── FCM ──────────────────────────────────────────────────────────────────────
if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(readFileSync(process.env.FCM_SERVICE_ACCOUNT_JSON, 'utf8')),
    ),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'callypro-fcc43.firebasestorage.app',
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

// Admin-tunable signal weights + band thresholds — `guard_config/{locale}` in
// Firestore, written from the admin panel. Absent/partial doc = built-in
// defaults (see detector.mjs's own fallbacks); this can only re-tune scoring
// sensitivity, never bypass the safety rules in guard/policy.mjs.
let guardWeights = {};
let guardThresholds = {};
async function refreshGuardConfig() {
  if (!admin.apps.length) return;
  try {
    const snap = await admin.firestore().collection('guard_config').doc(GUARD_LOCALE).get();
    const data = snap.exists ? snap.data() || {} : {};
    guardWeights = (data.weights && typeof data.weights === 'object') ? data.weights : {};
    guardThresholds = (data.thresholds && typeof data.thresholds === 'object') ? data.thresholds : {};
    console.log(`[guard] config: ${Object.keys(guardWeights).length} weight override(s), thresholds=${JSON.stringify(guardThresholds)}`);
  } catch (e) {
    console.warn(`[guard] config load failed (using built-in defaults): ${e.message}`);
  }
}
await refreshGuardConfig();
setInterval(refreshGuardConfig, 60 * 60 * 1000).unref?.();

// ── recording retention — delete anything older than N days ─────────────────
const RECORD_DIR = process.env.GUARD_RECORD_DIR;
const RECORD_RETENTION_DAYS = Number(process.env.GUARD_RECORD_RETENTION_DAYS || 15);
async function cleanupOldRecordings() {
  if (!RECORD_DIR) return;
  try {
    const cutoff = Date.now() - RECORD_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const f of await readdir(RECORD_DIR)) {
      const p = join(RECORD_DIR, f);
      const st = await stat(p).catch(() => null);
      if (st && st.mtimeMs < cutoff) {
        await unlink(p).catch(() => {});
        console.log(`[guard] deleted expired recording: ${f}`);
      }
    }
  } catch (e) {
    console.log('[guard] cleanup failed:', e.message);
  }
}
if (RECORD_DIR) {
  cleanupOldRecordings();
  setInterval(cleanupOldRecordings, 6 * 60 * 60 * 1000).unref?.();
}
// Note: the Storage-side copy uploaded in onEnd below (guard_recordings/{callId}/…)
// is bounded separately by a bucket lifecycle rule — see
// deploy/lifecycle-guard-recordings.json, scoped to the guard_recordings/
// prefix only so it never touches profile photos or other app data.

// ── The agent ────────────────────────────────────────────────────────────────
export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();
    console.log('[diag] connected');
    const callStartedAt = Date.now();
    const callId = ctx.room.name.replace(/^guard-/, '');
    // the app puts the user's FCM token in room metadata when it starts the call
    const meta = safeJson(ctx.room.metadata) || {};
    const fcmToken = meta.fcmToken;
    const ttsTier = meta.ttsTier || 'free'; // 'free' | 'premium' | 'top' — set by the app when it starts the call

    console.log('[diag] waiting for caller');
    const caller = await waitForCaller(ctx);
    console.log('[diag] got caller track');
    const pcmIn = pcmSourceFrom(new AudioStream(caller, 16000, 1));

    const stt = makeStt();
    console.log('[diag] stt made');
    stt.attach(pcmIn);
    console.log('[diag] stt attached');

    // call recording — off unless GUARD_RECORD_DIR is set. When on, every call
    // through this line is kept (not just ones the engine flags) — a full
    // written transcript is saved alongside the audio in onEnd below.
    // *** Only turn GUARD_RECORD_DIR on after legal sign-off (KVKK / consent). ***
    const recorder = CallRecorder.fromEnv(callId);
    if (recorder) pcmIn.on('data', (buf) => recorder.write(buf));
    const transcript = [];

    // Community protection: once this call is clearly a scam, flag the
    // caller's own number in the SAME Firestore doc (`spam_numbers/{number}`)
    // the phone app's on-device spam checker already reads — merged in, same
    // schema the app's own community-report flow writes (see spam_service.dart
    // reportNumber()). One write per call, guarded by callerFlagged below.
    const callerNumberMatch = ctx.room.name.match(/^guard-_(\d+)_/);
    const callerNumber = callerNumberMatch ? callerNumberMatch[1] : null;
    let callerFlagged = false;
    async function flagCallerAsScam(signalIds = []) {
      if (callerFlagged || !callerNumber || !admin.apps.length) return;
      callerFlagged = true;
      try {
        const doc = {
          reportCount: admin.firestore.FieldValue.increment(1),
          lastReported: admin.firestore.FieldValue.serverTimestamp(),
          categories: admin.firestore.FieldValue.arrayUnion('scam'),
          number: callerNumber,
        };
        // sub-type detail — which scam method(s) this caller used, so the
        // admin panel can show "this number mostly does bank impersonation"
        // instead of just a generic scam flag.
        if (signalIds.length) {
          doc.guardSignals = admin.firestore.FieldValue.arrayUnion(...signalIds);
        }
        await admin.firestore().collection('spam_numbers').doc(callerNumber).set(doc, { merge: true });
      } catch (e) {
        console.warn('[guard] spam_numbers flag failed:', e.message);
      }
    }

    console.log('[diag] making tts');
    const tts = makeTts(ttsTier);
    console.log('[diag] tts made');
    const out = new AudioSource(tts.sampleRate ?? 16000, 1);
    const outTrack = LocalAudioTrack.createAudioTrack('agent-voice', out);
    console.log('[diag] publishing track');
    await ctx.room.localParticipant.publishTrack(outTrack, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE })); // publish our voice
    console.log('[diag] published track');

    // an unhurried "thinking" beat before every line; a real person is not instant
    const paceMs = Number(process.env.AGENT_PACE_MS ?? 350);
    // How the AI speaks, best first:
    //  1. "sohbet modu" — the LLM writes each line as a real conversation
    //     (rules still score, decide the move, own the greeting/goodbye + guard).
    //  2. LLM "polish" — the LLM only rewords the vetted line, humanize adds
    //     the hesitation.
    //  3. no key — humanize over the fixed safe lines.
    // VoiceAgent re-runs isSafeLine on whatever comes back.
    // Shadow-mode risk scoring: the LLM already writes every conversational
    // reply — piggyback one extra field on that SAME request asking it to
    // also rate how risky the caller's last line sounded (0-100). This never
    // touches what the call actually does (see llm-polish.mjs's converse()
    // — the hint fires only after the real reply is already decided); it's
    // purely logged so we can compare it against the keyword-based score in
    // the admin panel before ever trusting it to influence a real call.
    const converse = llmConverseFromEnv(process.env, {
      onRiskHint: ({ llmRisk, llmReason, callerText, move, keywordRisk }) => {
        if (!admin.apps.length) return;
        admin.firestore().collection('llm_risk_hints').add({
          callId, at: Date.now(), llmRisk, llmReason, callerText, move, keywordRisk,
        }).catch((e) => console.warn('[guard] llm_risk_hints write failed:', e.message));
      },
    });
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

    // legal: when recording is on, the caller must be told at the top of the
    // call — a written safe line, so it goes through the same isSafeLine gate
    // as everything else the AI says.
    const CONSENT_NOTICE = 'Bu görüşme kalite ve güvenlik amacıyla kaydedilmektedir. ';
    const basePolish = polish;
    const polishWithConsent = recorder
      ? async (line, ctx) => {
          const said = await basePolish(line, ctx);
          return ctx.band === 'greet' ? CONSENT_NOTICE + said : said;
        }
      : basePolish;

    const agent = new VoiceAgent({
      callId,
      stt,
      paceMs,
      locale: GUARD_LOCALE,
      overlay: lexiconOverlay,
      weightOverrides: guardWeights,
      thresholds: guardThresholds,
      tts: {
        speak: async (text) => {
          console.log('[diag] tts.speak start:', JSON.stringify(text).slice(0, 60));
          const t0 = Date.now();
          try {
            const { audio, durationMs } = await tts.speak(text);
            console.log('[diag] tts.speak got audio bytes:', audio.length, 'ms:', Date.now() - t0);
            const int16 = new Int16Array(audio.buffer, audio.byteOffset, audio.byteLength / 2);
            await out.captureFrame(new AudioFrame(int16, tts.sampleRate ?? 16000, 1, int16.length));
            console.log('[diag] captureFrame done, total ms:', Date.now() - t0);
            return { text, durationMs };
          } catch (e) {
            console.log('[diag] tts.speak FAILED:', e.message, e.stack);
            throw e;
          }
        },
      },
      polish: polishWithConsent,
      onUtterance: (u) => {
        transcript.push({ who: u.who, text: u.text, ts: Date.now() });
      },
      onRisk: (r) => {
        if (r.band === 'high' || r.band === 'severe' || r.risk >= 60) {
          if (recorder) recorder.arm();
          flagCallerAsScam(r.reasons.map((x) => x.id)).catch(() => {});
        }
        pushToPhone(fcmToken, {
          type: 'guard_risk', callId, risk: r.risk, band: r.band,
          reasons: r.reasons.map((x) => x.id),
        }).catch(() => {});
      },
      onEnd: async ({ reason, summary }) => {
        // real-usage record for the admin cost/analytics page — every call
        // through this line, not just the ones the engine flags. Firestore
        // stays best-effort: a write failure must never block call teardown.
        if (admin.apps.length) {
          const ttsProviderUsed = process.env.TTS_PROVIDER
            || (ttsTier === 'top' ? 'elevenlabs' : ttsTier === 'premium' ? 'cartesia' : 'piper');
          const sttProviderUsed = process.env.STT_PROVIDER === 'deepgram' ? 'deepgram' : 'whisper';
          admin.firestore().collection('guard_calls').doc(callId).set({
            callId,
            at: callStartedAt,
            durationMs: Date.now() - callStartedAt,
            ttsTier,
            ttsProvider: ttsProviderUsed,
            sttProvider: sttProviderUsed,
            reason,
            risk: summary.risk,
            band: summary.band,
            turns: summary.turns,
            // which scam pattern(s) fired — lets the admin panel show a real
            // "most common scam types" breakdown instead of a placeholder.
            reasons: summary.reasons.map((r) => r.id),
          }).catch((e) => console.warn('[guard] firestore call-log failed:', e.message));
        }
        const clip = await recorder?.finish().catch(() => null);
        if (clip) {
          console.log(`[guard] evidence clip: ${clip}`);
          const transcriptPath = clip.replace(/\.wav$/, '.transcript.json');
          try {
            await writeFile(transcriptPath, JSON.stringify({ callId, reason, transcript }, null, 2));
            console.log(`[guard] transcript: ${transcriptPath}`);
          } catch (e) {
            console.log('[guard] transcript write failed:', e.message);
          }

          // Best-effort upload to Cloud Storage so the admin panel can play it
          // back (see storage.rules: admin-only read on guard_recordings/**).
          // Never blocks call teardown — a failed upload just leaves the clip
          // on local disk, same as before this existed.
          if (admin.apps.length) {
            try {
              const bucket = admin.storage().bucket();
              const audioDest = `guard_recordings/${callId}/audio.wav`;
              const transcriptDest = `guard_recordings/${callId}/transcript.json`;
              await bucket.upload(clip, { destination: audioDest, contentType: 'audio/wav' });
              await bucket.upload(transcriptPath, { destination: transcriptDest, contentType: 'application/json' }).catch(() => {});
              await admin.firestore().collection('guard_recordings').doc(callId).set({
                callId,
                at: callStartedAt,
                reason,
                risk: summary.risk,
                band: summary.band,
                audioPath: audioDest,
                transcriptPath: transcriptDest,
              });
              console.log(`[guard] uploaded evidence to gs://${bucket.name}/${audioDest}`);
            } catch (e) {
              console.warn('[guard] evidence upload failed:', e.message);
            }
          }
        }
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
      const t = [...p.trackPublications.values()].find((x) => x.kind === TrackKind.KIND_AUDIO)?.track;
      if (t) return resolve(t);
    }
    ctx.room.on('trackSubscribed', (track) => { if (track.kind === TrackKind.KIND_AUDIO) resolve(track); });
  });
}

/** Adapt a LiveKit AudioStream to the { on('data'|'end') } shape the STT wants. */
function pcmSourceFrom(audioStream) {
  const handlers = { data: [], end: [] };
  (async () => {
    for await (const frame of audioStream) {
      for (const h of handlers.data) h(Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength));
    }
    for (const h of handlers.end) h();
  })();
  return { on: (e, cb) => handlers[e].push(cb) };
}

