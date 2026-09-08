import { GuardCall } from '../guard/session.mjs';
import { isSafeLine } from '../guard/policy.mjs';
import { identityPolish } from './adapters.mjs';

/**
 * The AI Guard voice agent: the loop that sits on a call.
 *
 *   caller speaks -> STT -> GuardCall (score + decide) -> polish -> TTS -> caller
 *                                 |
 *                                 +-> onRisk(...) pushed live to the user's phone
 *
 * The only things not in this repo are the three adapters (STT, TTS, and the
 * telephony/SIP layer that carries the audio). Everything the agent *decides* -
 * what to say, when to hang up, what to report - is here and is tested.
 *
 * @typedef {Object} VoiceAgentOptions
 * @property {string} callId
 * @property {{on:(e:string,h:Function)=>any}} stt
 * @property {{speak:(t:string)=>Promise<any>}} tts
 * @property {(safeLine:string, ctx:{band:string,transcript:object[],callerText?:string,move?:string,risk?:number,category?:string,reasons?:object[]})=>(string|Promise<string>)} [polish]
 *           rephrases the vetted line; ctx carries the move + risk so a
 *           conversational adapter (see `makeLlmConverse`) can be wired in here.
 * @property {(risk:{risk:number,band:string,category?:string,reasons:object[]})=>void} [onRisk]
 * @property {(evt:{who:string,text:string})=>void} [onUtterance]
 * @property {(result:{reason:string,summary:object})=>void} [onEnd]
 * @property {'inbound'|'joinMidCall'} [mode]  'joinMidCall' = conferenced into an
 *           ongoing call (the "AI'a aktar" flow); the AI joins mid-conversation.
 * @property {string} [locale]  detection locale ('tr' default, 'en', …) — picks
 *           the scam lexicon; the conversation lines stay Turkish for now.
 * @property {Record<string,string[][]>} [overlay]  extra scam phrase-groups per
 *           signal id (from the shared `guard_lexicon` Firestore doc) — merged
 *           into the built-in lexicon so an admin-added phrase protects the
 *           voice line too, not just the phone app.
 * @property {number} [paceMs]  pause before speaking each line (default 0). A
 *           real call sets ~250–450 ms so the AI does not answer with robotic,
 *           instant precision — it reads as a person thinking for a beat.
 * @property {number} [silenceMs]  how long to wait after the AI finishes a line
 *           before it assumes the caller went quiet and checks in ("Alo?"),
 *           instead of sitting mute until the caller hangs up (default 7000).
 * @property {number} [maxSilenceNudges]  how many "Alo?" check-ins before the
 *           agent gives up and ends the call itself (default 2).
 */
export class VoiceAgent {
  /** @param {VoiceAgentOptions} opts */
  constructor(opts) {
    this.callId = opts.callId;
    this.stt = opts.stt;
    this.tts = opts.tts;
    this.polish = opts.polish ?? identityPolish;
    this.onRisk = opts.onRisk;
    this.onUtterance = opts.onUtterance;
    this.onEnd = opts.onEnd;
    this._paceMs = Math.max(0, opts.paceMs ?? 0);
    this._silenceMs = Math.max(0, opts.silenceMs ?? 7000);
    this._maxSilenceNudges = Math.max(0, opts.maxSilenceNudges ?? 2);

    this._call = new GuardCall(opts.callId, {
      mode: opts.mode, locale: opts.locale, overlay: opts.overlay,
      weightOverrides: opts.weightOverrides, thresholds: opts.thresholds,
    });
    this.ended = false;
    this._busy = Promise.resolve();
    this._silenceTimer = null;
    this._silenceNudges = 0;
  }

  /** Play the greeting and start listening. */
  async start() {
    this.stt.on('final', (text) => {
      this._clearSilenceTimer();
      this._silenceNudges = 0;
      this._busy = this._busy.then(() => this._onCaller(text)).catch(() => {});
    });
    this.stt.on('hangup', () => {
      this._clearSilenceTimer();
      this._busy = this._busy.then(() => this._finish('caller_hangup')).catch(() => {});
    });
    // Chain the greeting into `_busy` itself (not a bare await) — the STT
    // 'final' listener above is already live while this speaks, and if it
    // fires early (a genuinely fast caller, or the mic picking up the AI's
    // own voice as an echo) `_onCaller` must wait for the greeting's
    // `tts.speak()` to actually finish first. Two concurrent captureFrame()
    // calls on the same AudioSource throw an RtcError (InvalidState) — this
    // is what caused that in a live call before this fix.
    this._busy = this._say(this._call.opening, 'greet');
    await this._busy;
    this._armSilenceTimer();
  }

  /** Wait for all queued turns to drain (tests / graceful shutdown). */
  async idle() {
    await this._busy;
  }

  async _onCaller(text) {
    if (this.ended) return;
    this.onUtterance?.({ who: 'caller', text });

    const turn = this._call.callerSaid(text);
    this.onRisk?.({
      risk: turn.risk, band: turn.band, category: turn.category, reasons: turn.reasons,
    });

    await this._say(turn.reply, turn.band, {
      callerText: text, move: turn.move, risk: turn.risk,
      category: turn.category, reasons: turn.reasons,
    });

    if (turn.action === 'end') {
      await this._finish('guard_decision');
    } else {
      this._armSilenceTimer();
    }
  }

  /**
   * The caller has gone quiet after the AI's last line — a real person on a
   * dead-sounding line checks in rather than just standing there. Try a
   * couple of natural nudges; if nothing comes back, end the call instead of
   * sitting in silence until the caller (or the carrier) hangs up on us.
   */
  async _onSilence() {
    if (this.ended) return;
    this._silenceNudges += 1;
    if (this._silenceNudges > this._maxSilenceNudges) {
      await this._say(SILENCE_GOODBYE, 'wrapup', {}, { verbatim: true });
      await this._finish('silence_timeout');
      return;
    }
    const nudge = SILENCE_NUDGES[(this._silenceNudges - 1) % SILENCE_NUDGES.length];
    await this._say(nudge, 'probe', {}, { verbatim: true });
    this._armSilenceTimer();
  }

  _armSilenceTimer() {
    if (this.ended || this._silenceMs <= 0) return;
    this._clearSilenceTimer();
    this._silenceTimer = setTimeout(() => { this._onSilence(); }, this._silenceMs);
    this._silenceTimer.unref?.();
  }

  _clearSilenceTimer() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  /**
   * Speak a line. The line always originates from the vetted policy templates;
   * `polish` may rephrase it, but the result is re-validated and the raw safe
   * line is used if the rewrite drifts into anything unsafe.
   */
  async _say(safeLine, band, ctx = {}, { verbatim = false } = {}) {
    let line = safeLine;
    // `verbatim` skips the polish/LLM rewrite entirely — used for glue lines
    // like the silence check-in ("Alo? Sizi duyamadım") that must say exactly
    // what they say. Running those through converse() lets the LLM treat them
    // as a fresh conversational turn and rewrite them using recent (often
    // hostile) context, producing nonsense like repeating "Siz kimsiniz ya?"
    // instead of an actual "are you still there" check.
    if (!verbatim) {
      try {
        const polished = await this.polish(safeLine, {
          band,
          transcript: this._call.summary().transcript,
          ...ctx,
        });
        if (typeof polished === 'string' && polished.trim() && isSafeLine(polished)) {
          line = polished.trim();
        }
      } catch {
        line = safeLine; // any polish failure -> deterministic fallback
      }
    }
    this.onUtterance?.({ who: 'ai', text: line });
    if (this._paceMs > 0) await new Promise((r) => setTimeout(r, this._paceMs));
    // a TTS provider outage (bad key, rate limit, network blip) must never take
    // the whole call down with it - the caller just hears a shorter-than-usual
    // pause instead of the line, and the silence-nudge / next turn still runs.
    try {
      await this.tts.speak(line);
    } catch (e) {
      console.warn('[voice-agent] tts.speak failed, continuing:', e.message);
    }
  }

  async _finish(reason) {
    if (this.ended) return;
    this.ended = true;
    this._clearSilenceTimer();
    this.onEnd?.({ reason, summary: this._call.summary() });
  }
}

/** Natural check-ins when the line's gone quiet — rotates, never a number. */
const SILENCE_NUDGES = [
  'Alo? Sizi duyamadım.',
  'Alo, orada mısınız? Bağlantı gitti sandım.',
];

const SILENCE_GOODBYE = 'Sanırım bağlantı koptu, ben kapatıyorum. İyi günler.';
