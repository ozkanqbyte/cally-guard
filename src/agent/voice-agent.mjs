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
 * @property {(safeLine:string, ctx:{band:string,transcript:object[],callerText?:string,move?:string,risk?:number,reasons?:object[]})=>(string|Promise<string>)} [polish]
 *           rephrases the vetted line; ctx carries the move + risk so a
 *           conversational adapter (see `makeLlmConverse`) can be wired in here.
 * @property {(risk:{risk:number,band:string,reasons:object[]})=>void} [onRisk]
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

    this._call = new GuardCall(opts.callId, {
      mode: opts.mode, locale: opts.locale, overlay: opts.overlay,
    });
    this.ended = false;
    this._busy = Promise.resolve();
  }

  /** Play the greeting and start listening. */
  async start() {
    this.stt.on('final', (text) => {
      this._busy = this._busy.then(() => this._onCaller(text)).catch(() => {});
    });
    this.stt.on('hangup', () => {
      this._busy = this._busy.then(() => this._finish('caller_hangup')).catch(() => {});
    });
    await this._say(this._call.opening, 'greet');
  }

  /** Wait for all queued turns to drain (tests / graceful shutdown). */
  async idle() {
    await this._busy;
  }

  async _onCaller(text) {
    if (this.ended) return;
    this.onUtterance?.({ who: 'caller', text });

    const turn = this._call.callerSaid(text);
    this.onRisk?.({ risk: turn.risk, band: turn.band, reasons: turn.reasons });

    await this._say(turn.reply, turn.band, {
      callerText: text, move: turn.move, risk: turn.risk, reasons: turn.reasons,
    });

    if (turn.action === 'end') await this._finish('guard_decision');
  }

  /**
   * Speak a line. The line always originates from the vetted policy templates;
   * `polish` may rephrase it, but the result is re-validated and the raw safe
   * line is used if the rewrite drifts into anything unsafe.
   */
  async _say(safeLine, band, ctx = {}) {
    let line = safeLine;
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
    this.onUtterance?.({ who: 'ai', text: line });
    if (this._paceMs > 0) await new Promise((r) => setTimeout(r, this._paceMs));
    await this.tts.speak(line);
  }

  async _finish(reason) {
    if (this.ended) return;
    this.ended = true;
    this.onEnd?.({ reason, summary: this._call.summary() });
  }
}
