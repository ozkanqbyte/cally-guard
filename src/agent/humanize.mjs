/**
 * "Confused person" layer for the AI Guard's voice.
 *
 * The policy in `guard/policy.mjs` decides *what* the AI says and keeps every
 * line safe (no numbers, no confirmations). This layer only changes *how* it
 * sounds: it prepends a short, natural hesitation so the caller hears a
 * slightly distracted real person instead of a bot that answers instantly and
 * perfectly. That is exactly the persona that keeps a scammer on the line.
 *
 * It is a drop-in `polish` for `VoiceAgent`:
 *
 *   const agent = new VoiceAgent({ ..., polish: humanize });
 *
 * or, layered under an LLM:
 *
 *   polish: (line, ctx) => humanize(llmPolish(line, ctx), ctx)
 *
 * Deterministic (no RNG — it rotates fillers by how far into the call we are),
 * so the test suite stays reproducible. Never introduces a digit or a
 * confirmation; the result is still run through `isSafeLine` by the agent, and
 * this module double-checks it too and falls back to the raw line on any doubt.
 */
import { isSafeLine } from '../guard/policy.mjs';

/** Openers that buy a beat without conceding anything. */
const FILLERS = [
  'Şey, ',
  'Bir saniye, ',
  'Pardon, ',
  'Ya, şöyle, ',
  'Hmm, ',
  'Affedersiniz, ',
  'Dur bir dakika, ',
  'Eee, ',
];

/** Occasional trailing softeners, used sparingly (every 3rd turn). */
const TAILERS = [
  ' Kusura bakmayın.',
  ' Yaşlıyım, kafam biraz karışıyor.',
  ' Bir de yavaş konuşur musunuz?',
];

const CAP = /^[A-ZÇĞİÖŞÜ]/;

/** The line already opens with a hesitation — don't stack another filler on it. */
const ALREADY_SOFT = /^(bir saniye|bir dakika|pardon|affedersiniz|kusura bak|şey[,\s]|ya[,\s]|eee|hmm|dur bir|hı)/i;

/**
 * @param {string} safeLine  a line that already passed the policy guard-rail
 * @param {{ transcript?: {who:string,text:string}[], band?: string }} [ctx]
 * @returns {string}
 */
export function humanize(safeLine, ctx = {}) {
  const line = typeof safeLine === 'string' ? safeLine.trim() : '';
  if (!line) return safeLine;

  // how many turns in — drives which filler, deterministically
  const step = Array.isArray(ctx.transcript) ? ctx.transcript.length : 0;

  // don't touch the very first thing the AI says (the greeting / re-open):
  // it is already written to sound human, and a filler in front reads odd.
  if (step <= 1) return line;

  // line already opens with a hesitation ("Bir saniye, …") — stacking "Bir
  // saniye, " in front just stutters. Only maybe add a trailing softener.
  if (ALREADY_SOFT.test(line)) {
    if (step % 3 === 0) {
      const withTail = line + TAILERS[(step / 3) % TAILERS.length];
      if (isSafeLine(withTail)) return withTail;
    }
    return line;
  }

  const filler = FILLERS[step % FILLERS.length];
  let body = line;
  // lower-case the first letter so "Hangi bankadan…" -> "şey, hangi bankadan…"
  if (CAP.test(body) && !/^[A-ZÇĞİÖŞÜ]{2,}/.test(body)) {
    body = body[0].toLocaleLowerCase('tr') + body.slice(1);
  }

  let out = filler + body;
  if (step % 3 === 0) out += TAILERS[(step / 3) % TAILERS.length];

  // belt and braces: a filler must never turn a safe line unsafe
  return isSafeLine(out) ? out : line;
}

/**
 * Factory when you want to tune it — e.g. only humanize once the call has
 * warmed up, or disable the trailing softeners.
 *
 * @param {{ fromTurn?: number, tails?: boolean }} [opts]
 */
export function makeHumanize({ fromTurn = 1, tails = true } = {}) {
  return (safeLine, ctx = {}) => {
    const step = Array.isArray(ctx.transcript) ? ctx.transcript.length : 0;
    if (step < fromTurn * 2) return safeLine;
    const base = humanize(safeLine, ctx);
    if (tails) return base;
    return base.replace(/(\s+(?:Kusura bakmayın|Yaşlıyım[^.]*|Bir de yavaş[^.]*)\.)$/u, '');
  };
}
