/**
 * LiveKit Agents worker — the process that runs on the server, one instance per
 * AI Guard call.
 *
 * It is thin on purpose: LiveKit hands it a room with the caller's audio track,
 * it wires Deepgram + Cartesia to the already-tested `VoiceAgent`, and pushes
 * the live risk to the user's phone via FCM. Not exercised by `npm test` -
 * needs LiveKit + provider keys + a real call.
 *
 * Run:  node --env-file=.env src/agent/providers/livekit-worker.mjs
 */
import { VoiceAgent } from '../voice-agent.mjs';
import { DeepgramStt } from './deepgram-stt.mjs';
import { CartesiaTts } from './cartesia-tts.mjs';

/**
 * @param {Object} ctx  the LiveKit JobContext (room, participant, etc.)
 * @param {(payload:object)=>Promise<void>} pushToPhone  FCM sender for this user
 */
export async function runGuardJob(ctx, pushToPhone) {
  const callId = ctx.room.name.replace(/^guard-/, '');

  const stt = new DeepgramStt({
    apiKey: process.env.DEEPGRAM_API_KEY,
    language: 'tr',
  });
  const tts = new CartesiaTts({
    apiKey: process.env.CARTESIA_API_KEY,
    voiceId: process.env.CARTESIA_VOICE_ID,
  });

  // caller audio track -> STT
  const audioSource = ctx.subscribeAudio(); // returns a { on('data'), on('end') }
  await stt.attach(audioSource);

  const agent = new VoiceAgent({
    callId,
    stt,
    tts: {
      // agent.speak() -> synthesize -> publish onto the room's outbound track
      speak: async (text) => {
        const { audio } = await tts.speak(text);
        await ctx.publishAudio(audio);
        return { text };
      },
    },

    // optional LLM polish — omit to run on the deterministic policy lines
    polish: process.env.ANTHROPIC_API_KEY ? makeLlmPolish() : undefined,

    onRisk: (r) => pushToPhone({
      type: 'guard_risk',
      callId,
      risk: r.risk,
      band: r.band,
      reasons: r.reasons.map((x) => x.id),
    }).catch(() => {}),

    onEnd: async ({ reason, summary }) => {
      await pushToPhone({ type: 'guard_summary', callId, reason, summary }).catch(() => {});
      await ctx.disconnect();
    },
  });

  await agent.start();
}

/** Placeholder — a real LLM polish wraps Claude with a hard "keep intent, add
 *  nothing sensitive" system prompt. The agent re-checks its output with
 *  isSafeLine, so a bad rewrite still cannot reach the caller. */
function makeLlmPolish() {
  return async (safeLine) => safeLine;
}
