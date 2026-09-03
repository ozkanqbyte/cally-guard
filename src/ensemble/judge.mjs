/**
 * The third voter: an LLM judge. Given the transcript and what the rules + ML
 * already think, it returns a plain verdict. It is optional - the ensemble
 * works with two voters - and it never sees the user's own data, only the
 * caller's speech.
 *
 * @typedef {Object} Vote
 * @property {string} name
 * @property {'scam'|'legit'|'unsure'} vote
 * @property {number} confidence  0-1
 * @property {string} [rationale]
 */

/**
 * Turn a rules `DetectionResult` into a Vote.
 * @param {{score:number, confidence:number}} detection
 * @returns {Vote}
 */
export function rulesVote(detection) {
  const vote = detection.score >= 50 ? 'scam' : detection.score >= 25 ? 'unsure' : 'legit';
  return { name: 'rules', vote, confidence: detection.confidence / 100 };
}

/**
 * Turn an ML `Prediction` into a Vote.
 * @param {{label:string, scamProb:number, confidence:number}} prediction
 * @returns {Vote}
 */
export function mlVote(prediction) {
  const vote =
    prediction.scamProb >= 0.65 ? 'scam' :
    prediction.scamProb <= 0.35 ? 'legit' : 'unsure';
  return { name: 'ml', vote, confidence: prediction.confidence };
}

/**
 * Deterministic stand-in for the LLM judge, and the fallback when the real one
 * errors or times out.
 *
 * When the two independent voters genuinely disagree (one scam, one legit) it
 * *abstains* - a real disagreement is exactly the "we don't know" case, and the
 * heuristic has nothing extra to add. It only takes a side when the voters are
 * already aligned (or one is unsure).
 * @param {Vote} rules @param {Vote} ml @returns {Vote}
 */
export function heuristicJudge(rules, ml) {
  if ((rules.vote === 'scam' && ml.vote === 'legit') ||
      (rules.vote === 'legit' && ml.vote === 'scam')) {
    return { name: 'judge', vote: 'unsure', confidence: 0.2 };
  }
  const strong = rules.confidence >= ml.confidence ? rules : ml;
  if (strong.vote === 'unsure') return { name: 'judge', vote: 'unsure', confidence: 0.3 };
  return { name: 'judge', vote: strong.vote, confidence: Math.min(0.7, strong.confidence) };
}

/**
 * Contract for a real LLM judge. Implement `judge(transcript, context)` to
 * return a Vote; wrap it with `withFallback` so a slow or failing call degrades
 * to `heuristicJudge` instead of blocking the call.
 *
 * @param {(t:string[], ctx:object)=>Promise<Vote>} judgeFn
 * @param {number} timeoutMs
 */
export function withFallback(judgeFn, { timeoutMs = 1500 } = {}) {
  return async (transcript, context) => {
    try {
      const race = Promise.race([
        judgeFn(transcript, context),
        new Promise((_, rej) => setTimeout(() => rej(new Error('judge timeout')), timeoutMs)),
      ]);
      const v = await race;
      if (v && ['scam', 'legit', 'unsure'].includes(v.vote)) {
        return { name: 'judge', confidence: 0.6, ...v };
      }
      throw new Error('bad judge response');
    } catch {
      return heuristicJudge(context.rulesVote, context.mlVote);
    }
  };
}
