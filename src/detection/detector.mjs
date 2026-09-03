import { fold } from '../text.mjs';
import { getLocale } from './locales/index.mjs';

/**
 * Real-time scam scoring for one call.
 *
 * @typedef {'low'|'elevated'|'high'|'severe'} Band
 * @typedef {Object} Reason
 * @property {string} id
 * @property {string} label
 * @property {'high'|'medium'|'low'} severity
 * @typedef {Object} DetectionResult
 * @property {number} score          0-100 scam likelihood
 * @property {number} confidence     0-100 how sure we are of that score
 * @property {Band} band
 * @property {string[]} signals      signal ids seen so far
 * @property {Reason[]} reasons      ordered most-severe first
 * @property {boolean} recommendGuard true once handing to AI Guard is worth offering
 */

const SEVERITY_RANK = { high: 2, medium: 1, low: 0 };
const GUARD_SCORE = 45;
const GUARD_CONFIDENCE = 45;

// signals where the caller is *asking for* something sensitive — used to detect
// a caller who keeps pushing after we say no
const ASK_IDS = ['otp_request', 'card_details', 'money_transfer', 'remote_access'];

/** Fold a locale pack once into the shape the scoring loop needs. */
function compileLocale(pack) {
  const signals = pack.signals.map((s) => ({
    ...s,
    anyOf: s.anyOf.map((group) => group.map(fold)),
  }));
  return {
    code: pack.code,
    signals,
    byId: new Map(signals.map((s) => [s.id, s])),
    benign: (pack.benignMarkers ?? []).map(fold),
    // Protective-advice language: a real bank says "never share the code we
    // sent" — the exact words a scammer's request contains. A sensitive signal
    // wrapped only in this is advice, not a request, unless an explicit
    // "tell it to me" also shows up (that always wins).
    advice: (pack.adviceMarkers ?? []).map(fold),
    explicit: (pack.explicitRequest ?? []).map(fold),
  };
}

const _cache = new Map();
function localeFor(locale) {
  if (locale && typeof locale === 'object' && Array.isArray(locale.signals)) {
    return compileLocale(locale); // an inline pack (tests)
  }
  const pack = getLocale(locale);
  let compiled = _cache.get(pack.code);
  if (!compiled) { compiled = compileLocale(pack); _cache.set(pack.code, compiled); }
  return compiled;
}

/**
 * Merge a runtime overlay ({ [signalId]: string[][] }, already folded) onto a
 * compiled locale — extra phrases added from the admin panel.
 */
function withOverlay(compiled, overlay) {
  if (!overlay || !Object.keys(overlay).length) return compiled;
  const signals = compiled.signals.map((s) => {
    const extra = overlay[s.id];
    return extra && extra.length ? { ...s, anyOf: [...s.anyOf, ...extra] } : s;
  });
  return { ...compiled, signals, byId: new Map(signals.map((s) => [s.id, s])) };
}

/** @param {number} score @returns {Band} */
export function bandFor(score) {
  if (score >= 80) return 'severe';
  if (score >= 50) return 'high';
  if (score >= 25) return 'elevated';
  return 'low';
}

/**
 * Feed the caller's turns in as they arrive. Only the *caller's* speech should
 * be ingested - never the AI's replies.
 */
export class DetectionSession {
  /**
   * @param {{ locale?: string | object, overlay?: Record<string,string[][]> }} [opts]
   *   locale code ('tr' default) or an inline pack; `overlay` = extra folded
   *   phrase-groups per signal id (from `LexiconOverlay.get(locale)`).
   */
  constructor(opts = {}) {
    this._lex = withOverlay(localeFor(opts.locale), opts.overlay);
    /** @type {Set<string>} */
    this._seen = new Set();
    this._text = '';
    this._score = 0;
    // how many times the caller pushed for a sensitive thing (code / card /
    // transfer / remote access) AFTER we already flagged one such ask — a
    // scammer who won't take no for an answer. Escalates the score.
    this._askRepeats = 0;
  }

  /**
   * @param {string} callerUtterance
   * @returns {DetectionResult}
   */
  ingest(callerUtterance) {
    const folded = fold(callerUtterance);
    this._text = this._text ? `${this._text} ${folded}` : folded;

    const askBefore = ASK_IDS.some((id) => this._seen.has(id));

    for (const signal of this._lex.signals) {
      if (this._seen.has(signal.id)) continue;
      const fires = signal.anyOf.some((group) => group.every((p) => this._text.includes(p)));
      if (fires && !this._isAdviceOnly(signal)) this._seen.add(signal.id);
    }

    // this turn, on its own, is another push for a sensitive thing
    const askNow = this._lex.signals.some((s) =>
      ASK_IDS.includes(s.id) &&
      s.anyOf.some((group) => group.every((p) => folded.includes(p))) &&
      !this._isAdviceOnly(s));
    if (askBefore && askNow) this._askRepeats += 1;

    this._score = this._compute();
    return this.result();
  }

  /** True when a sensitive signal only shows up as protective advice. */
  _isAdviceOnly(signal) {
    if (!signal.guardAgainstAdvice) return false;
    const hasAdvice = this._lex.advice.some((m) => this._text.includes(m));
    if (!hasAdvice) return false;
    const explicit = this._lex.explicit.some((m) => this._text.includes(m));
    return !explicit;
  }

  _compute() {
    const seen = [...this._seen].map((id) => this._lex.byId.get(id));
    let score = seen.reduce((sum, s) => sum + s.weight, 0);

    const highs = seen.filter((s) => s.severity === 'high').length;
    if (highs >= 3) score += 35;
    else if (highs >= 2) score += 20;

    const ids = this._seen;
    const pressure = ids.has('urgency_threat') || ids.has('secrecy');
    const ask = ASK_IDS.some((id) => ids.has(id));
    if (pressure && ask) score += 15;

    // the caller keeps demanding the code / card / transfer after we deflected —
    // a legit caller drops it; a scammer pushes. Each repeat ratchets the score
    // so ~3 demands for a password takes the call past the hang-up line.
    if (this._askRepeats > 0) score += Math.min(this._askRepeats * 20, 60);

    if (highs === 0 && this._lex.benign.some((m) => this._text.includes(m))) {
      score *= 0.5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /** How sure we are of the score: more independent signals + more transcript. */
  _confidence() {
    const n = this._seen.size;
    if (n === 0) return 0;
    const words = this._text ? this._text.split(' ').length : 0;
    const highs = [...this._seen]
      .filter((id) => this._lex.byId.get(id).severity === 'high').length;
    const c = (n >= 2 ? 55 : 28) + Math.min(words / 3, 25) + (highs >= 1 ? 20 : 0);
    return Math.round(Math.max(0, Math.min(100, c)));
  }

  /** @returns {DetectionResult} */
  result() {
    const reasons = [...this._seen]
      .map((id) => this._lex.byId.get(id))
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
      .map((s) => ({ id: s.id, label: s.label, severity: s.severity }));
    const confidence = this._confidence();
    return {
      score: this._score,
      confidence,
      band: bandFor(this._score),
      signals: reasons.map((r) => r.id),
      reasons,
      recommendGuard: this._score >= GUARD_SCORE && confidence >= GUARD_CONFIDENCE,
    };
  }
}

/**
 * Score a full transcript at once.
 * @param {string[]} callerTurns
 * @param {{ locale?: string | object }} [opts]
 * @returns {DetectionResult}
 */
export function scoreTranscript(callerTurns, opts = {}) {
  const session = new DetectionSession(opts);
  let result = session.result();
  for (const turn of callerTurns) result = session.ingest(turn);
  return result;
}

/** The built-in signals for a locale (id, label, severity, base phrase-groups) — for the admin editor. */
export function lexiconFor(locale) {
  return localeFor(locale).signals.map((s) => ({
    id: s.id, label: s.label, severity: s.severity, base: s.anyOf,
  }));
}
