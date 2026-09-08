/**
 * The worker's call-handling decisions, pulled out of `deploy/worker/worker.mjs`
 * so they can be unit-tested and driven by the full-call simulation
 * (`sim/full-call.mjs`) without a LiveKit room. The worker imports these; keep
 * the two in lock-step.
 */

/** @typedef {{band:string, risk:number, category?:string}} RiskSnapshot */

/** A threat/harassment call is the user's private matter, not a shared signal. */
export function isAbusive(category) {
  return category === 'threat' || category === 'harassment';
}

/**
 * Start (or keep) recording this call? High/severe scam risk, or any abusive
 * call — an abusive call is armed even at a lower score so the user gets
 * evidence.
 * @param {RiskSnapshot} r
 */
export function shouldArmRecording(r) {
  return r.band === 'high' || r.band === 'severe' || r.risk >= 60 || isAbusive(r.category);
}

/**
 * Put the caller's number in the community scam DB (`spam_numbers`)? Only for
 * scam calls that crossed the recording bar — never for threat/harassment.
 * @param {RiskSnapshot} r
 */
export function shouldFlagCommunity(r) {
  return shouldArmRecording(r) && !isAbusive(r.category);
}

/**
 * Given the voiceprint service's POST /match response, should the worker push a
 * `guard_voice_match` to the phone?
 *   - a personal-block hit ALWAYS pushes (the user flagged this voice themselves)
 *   - otherwise `push` = confident cluster match AND (operator-verified OR seen
 *     in >= N recorded scam calls); `known` is the fallback for older builds.
 * `??` isn't enough here — the service can legitimately return `push:false`
 * alongside a personal-block match, so the personal check must be a hard OR.
 * @param {{push?:boolean, known?:boolean, personalBlock?:{matched?:boolean}}|null|undefined} vp
 */
export function shouldPushVoiceMatch(vp) {
  if (!vp) return false;
  if (vp.personalBlock && vp.personalBlock.matched) return true;
  return Boolean(vp.push ?? vp.known);
}
