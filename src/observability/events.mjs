/**
 * Privacy-safe observability for the Guard.
 *
 * Every scored turn, every decision, every user correction becomes a structured
 * event. Events carry signal ids, scores and outcomes - never raw transcript,
 * never the user's own words. A sink ships them somewhere (Firestore, an
 * analytics pipe); `FakeSink` keeps them in memory for tests.
 *
 * @typedef {'detection_scored'|'ensemble_decided'|'call_ended'|'user_feedback'} EventType
 * @typedef {Object} GuardEvent
 * @property {EventType} type
 * @property {string} callId    hashed upstream - opaque here
 * @property {number} at        epoch ms, injected (never Date.now() in library code)
 * @property {Record<string, any>} data
 */

/** @param {string} callId @param {number} at */
export function detectionScored(callId, at, { score, confidence, band, signals }) {
  return { type: 'detection_scored', callId, at, data: { score, confidence, band, signals } };
}

export function ensembleDecided(callId, at, { score, agreement, action, votes }) {
  return { type: 'ensemble_decided', callId, at, data: { score, agreement, action, votes } };
}

export function callEnded(callId, at, { reason, finalScore, turns }) {
  return { type: 'call_ended', callId, at, data: { reason, finalScore, turns } };
}

/** The user tells us later whether the call really was a scam. Gold labels. */
export function userFeedback(callId, at, { wasScam, actionTaken }) {
  return { type: 'user_feedback', callId, at, data: { wasScam, actionTaken } };
}

/** In-memory sink for tests and local runs. */
export class FakeSink {
  constructor() { /** @type {GuardEvent[]} */ this.events = []; }
  async write(event) { this.events.push(event); }
  ofType(type) { return this.events.filter((e) => e.type === type); }
}

/**
 * Roll a batch of events into the numbers that matter: how often Cally acted,
 * and - where the user later told us the truth - how often it was right.
 * @param {GuardEvent[]} events
 */
export function summarizeMetrics(events) {
  const decisions = events.filter((e) => e.type === 'ensemble_decided');
  const feedback = events.filter((e) => e.type === 'user_feedback');

  const byAction = { auto_hangup: 0, warn_user: 0, ask_user: 0, silent: 0 };
  for (const d of decisions) byAction[d.data.action] = (byAction[d.data.action] ?? 0) + 1;

  let truePos = 0, falsePos = 0, trueNeg = 0, falseNeg = 0;
  for (const f of feedback) {
    const acted = f.data.actionTaken === 'auto_hangup' || f.data.actionTaken === 'warn_user';
    if (f.data.wasScam && acted) truePos += 1;
    else if (!f.data.wasScam && acted) falsePos += 1;
    else if (!f.data.wasScam && !acted) trueNeg += 1;
    else falseNeg += 1;
  }

  const labelled = truePos + falsePos + trueNeg + falseNeg;
  return {
    calls: decisions.length,
    byAction,
    labelled,
    truePos, falsePos, trueNeg, falseNeg,
    precision: truePos + falsePos ? truePos / (truePos + falsePos) : null,
    recall: truePos + falseNeg ? truePos / (truePos + falseNeg) : null,
  };
}
