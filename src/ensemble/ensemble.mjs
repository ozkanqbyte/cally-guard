import { DetectionSession } from '../detection/detector.mjs';
import { SEED_MODEL, predict } from '../ml/classifier.mjs';
import { rulesVote, mlVote } from './judge.mjs';

/**
 * Combine the two independent voters - the rules engine and the ML classifier -
 * into one decision, and decide whether Cally may act on its own or must ask
 * the user.
 *
 * Design, honestly stated:
 *   - The rules engine is the primary. It has the advice-guard and is the most
 *     reliable single signal.
 *   - The ML classifier is corroboration. Strong agreement lets Cally be more
 *     decisive; strong disagreement pulls the decision down to "ask the user".
 *   - An LLM judge is optional and is only invoked to break a genuine tie, so
 *     the costly call happens on maybe 1-in-20 calls, not every call.
 *
 * No single voter can trigger an automatic hang-up.
 *
 * @typedef {Object} EnsembleResult
 * @property {number} score
 * @property {'agree_scam'|'agree_legit'|'conflict'} agreement
 * @property {'auto_hangup'|'warn_user'|'ask_user'|'silent'} action
 * @property {import('./judge.mjs').Vote[]} voters
 * @property {{id:string,label:string,severity:string}[]} reasons
 * @property {string} userSummary
 */

/**
 * @param {Object} input
 * @param {string[]} input.callerTurns
 * @param {(rules:import('./judge.mjs').Vote, ml:import('./judge.mjs').Vote)=>import('./judge.mjs').Vote} [input.judge]
 *        called ONLY on a rules/ML conflict; omit to fall through to "ask_user"
 * @param {object} [input.model]  NB model (defaults to the seed model)
 * @returns {EnsembleResult}
 */
export function runEnsemble({ callerTurns, judge = null, model = SEED_MODEL }) {
  const session = new DetectionSession();
  let detection = session.result();
  for (const t of callerTurns) detection = session.ingest(t);

  const prediction = predict(model, callerTurns.join(' '));
  const rv = rulesVote(detection);
  const mv = mlVote(prediction);

  const conflict =
    (rv.vote === 'scam' && mv.vote === 'legit') ||
    (rv.vote === 'legit' && mv.vote === 'scam');
  const jv = conflict && judge ? judge(rv, mv) : null;
  const voters = jv ? [rv, mv, jv] : [rv, mv];

  const mlScore = Math.round(prediction.scamProb * 100);
  const score = Math.round(detection.score * 0.65 + mlScore * 0.35);

  let agreement;
  let action;
  if (rv.vote === 'scam' && mv.vote === 'scam') {
    agreement = 'agree_scam';
    action = score >= 75 ? 'auto_hangup' : 'warn_user';
  } else if (rv.vote === 'legit' && mv.vote !== 'scam') {
    agreement = 'agree_legit';
    action = 'silent';
  } else if (rv.vote === 'scam') {
    // rules say scam, ML is unsure or disagrees
    agreement = mv.vote === 'legit' ? 'conflict' : 'agree_scam';
    action = jv?.vote === 'legit' ? 'ask_user' : 'warn_user';
  } else {
    // rules unsure/legit, ML says scam, or rules unsure
    agreement = 'conflict';
    action = jv?.vote === 'scam' ? 'warn_user'
      : jv?.vote === 'legit' ? 'silent'
        : 'ask_user';
  }

  return {
    score,
    agreement,
    action,
    voters,
    reasons: detection.reasons,
    userSummary: summarise(action, detection),
  };
}

function summarise(action, detection) {
  const list = detection.reasons.map((r) => r.label).join(', ') || 'belirgin bir kalıp yok';
  switch (action) {
    case 'auto_hangup':
      return `Güçlü dolandırıcılık işareti (${list}). Cally aramayı devraldı. ` +
        'Kimseye kod, şifre veya para verme; kurumu resmi hattından ara.';
    case 'warn_user':
      return `Dolandırıcılık olabilir (${list}). Emin değilsen görüşmeyi bitir ve ` +
        'kurumu kendi resmi numarasından ara.';
    case 'ask_user':
      return 'İşaretler kararsız — Cally emin değil. Sen değerlendir; şüphen varsa ' +
        'kapat ve kurumu resmi hattından geri ara.';
    default:
      return 'Belirgin bir dolandırıcılık işareti görülmedi.';
  }
}
