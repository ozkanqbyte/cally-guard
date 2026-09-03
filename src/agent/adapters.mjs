/**
 * Swappable I/O for the voice agent.
 *
 * The agent orchestration is provider-agnostic. These are the seams where real
 * infrastructure plugs in:
 *
 *   SttAdapter    speech -> text   (Deepgram / self-hosted Whisper)
 *   TtsAdapter    text -> speech   (Cartesia / Deepgram Aura / ElevenLabs)
 *   polish(fn)    safe line -> natural line   (an LLM; optional)
 *
 * Everything here is a fake or a pure default so the whole pipeline runs and is
 * tested with no API key and no network. Real adapters implement the same tiny
 * surface.
 */

/**
 * A scriptable speech-to-text source. Emits `final` for each completed caller
 * utterance and `hangup` when the caller drops. A real STT emits the same two
 * events off a live audio stream.
 */
export class FakeStt {
  constructor() {
    /** @type {Record<string, ((arg?: any) => void)[]>} */
    this._handlers = { final: [], hangup: [] };
  }

  on(event, handler) {
    (this._handlers[event] ??= []).push(handler);
    return this;
  }

  _emit(event, arg) {
    for (const h of this._handlers[event] ?? []) h(arg);
  }

  /** Feed one finished caller utterance. */
  say(text) {
    this._emit('final', text);
  }

  /** Feed a whole script, one utterance per tick. */
  async playScript(lines, { onBeforeEach } = {}) {
    for (const line of lines) {
      if (onBeforeEach) await onBeforeEach(line);
      this._emit('final', line);
    }
  }

  hangup() {
    this._emit('hangup');
  }
}

/**
 * Records every line the agent speaks. A real TTS returns an audio buffer /
 * stream instead; the agent does not care which.
 */
export class FakeTts {
  constructor() {
    /** @type {string[]} */
    this.spoken = [];
  }

  /** @param {string} text @returns {Promise<{text:string, durationMs:number}>} */
  async speak(text) {
    this.spoken.push(text);
    // rough duration estimate a real call loop would use for barge-in timing
    return { text, durationMs: Math.max(600, text.length * 55) };
  }
}

/** Default: speak the safe line verbatim. Deterministic, free, always valid. */
export const identityPolish = (safeLine) => safeLine;

/**
 * LLM polish stub. A real implementation sends `safeLine` + recent transcript to
 * an LLM with a hard instruction to keep the same intent and add nothing
 * sensitive, then returns the rewrite. The agent re-checks the result with
 * `isSafeLine` and falls back to `safeLine` if the model drifts, so a bad
 * rewrite can never reach the caller.
 */
export function llmPolish() {
  throw new Error(
    'llmPolish: configure an LLM provider. Until then the agent runs on the ' +
    'deterministic policy lines (identityPolish).',
  );
}
