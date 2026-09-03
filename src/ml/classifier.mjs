import { fold } from '../text.mjs';
import { CORPUS } from './corpus.mjs';

/**
 * A small multinomial Naive Bayes text classifier - the independent "second
 * opinion" next to the rules engine. It learns lexical patterns (word + bigram
 * frequencies) rather than hand-written phrases, so it catches wordings the
 * rules miss and vice-versa. Trained on `CORPUS`; a server-trained model with
 * the same shape drops in later.
 *
 * @typedef {Object} NbModel
 * @property {number} total
 * @property {Record<'scam'|'legit', {docs:number, tokens:number, counts:Record<string,number>}>} classes
 * @property {number} vocabSize
 *
 * @typedef {Object} Prediction
 * @property {'scam'|'legit'} label
 * @property {number} scamProb    0-1, length-normalised
 * @property {number} confidence  0-1, how far from the 0.5 fence
 */

/** word unigrams + adjacent bigrams from already-folded text */
export function tokenize(folded) {
  const words = folded.split(' ').filter(Boolean);
  const grams = words.slice();
  for (let i = 0; i < words.length - 1; i++) grams.push(`${words[i]}_${words[i + 1]}`);
  return grams;
}

/** @param {{text:string,label:'scam'|'legit'}[]} corpus @returns {NbModel} */
export function train(corpus) {
  const classes = {
    scam: { docs: 0, tokens: 0, counts: Object.create(null) },
    legit: { docs: 0, tokens: 0, counts: Object.create(null) },
  };
  const vocab = new Set();
  for (const { text, label } of corpus) {
    const toks = tokenize(fold(text));
    classes[label].docs += 1;
    for (const t of toks) {
      vocab.add(t);
      classes[label].counts[t] = (classes[label].counts[t] ?? 0) + 1;
      classes[label].tokens += 1;
    }
  }
  return { total: corpus.length, classes, vocabSize: vocab.size };
}

/** @param {NbModel} model @param {string} text @returns {Prediction} */
export function predict(model, text) {
  const toks = tokenize(fold(text));
  if (toks.length === 0) return { label: 'legit', scamProb: 0.5, confidence: 0 };

  const logProb = (cls) => {
    const c = model.classes[cls];
    let lp = Math.log(c.docs / model.total);
    for (const t of toks) {
      const count = c.counts[t] ?? 0;
      lp += Math.log((count + 1) / (c.tokens + model.vocabSize));
    }
    return lp;
  };

  // average log-odds per token, squashed - keeps long and short calls comparable.
  // The scale (9) is calibrated so held-out scam scripts land >=0.65 and clearly
  // legit calls <=0.4; borderline cases sit near 0.5 and read as "unsure".
  const perToken = (logProb('scam') - logProb('legit')) / toks.length;
  const scamProb = 1 / (1 + Math.exp(-perToken * 9));
  return {
    label: scamProb >= 0.5 ? 'scam' : 'legit',
    scamProb,
    confidence: Math.min(1, Math.abs(scamProb - 0.5) * 2),
  };
}

/** The model shipped with the app / service, trained on the seed corpus. */
export const SEED_MODEL = train(CORPUS);

/** Serialise a model to JSON (to embed in the Flutter app or cache in Firestore). */
export function serialize(model) {
  return JSON.stringify(model);
}
export function deserialize(json) {
  return typeof json === 'string' ? JSON.parse(json) : json;
}
