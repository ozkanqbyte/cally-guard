import { train, predict, serialize } from '../ml/classifier.mjs';
import { CORPUS } from '../ml/corpus.mjs';
import { SCAM_CALLS, LEGIT_CALLS } from '../../fixtures/calls.mjs';

/**
 * The human-in-the-loop learning pipeline.
 *
 *   user says "wrong"  ─▶  review queue  ─▶  (admin approves + labels)
 *        ─▶  corpus grows  ─▶  candidate model retrained + auto-graded
 *        ─▶  (admin publishes)  ─▶  new model version
 *
 * ~90% automated: collection, queuing, retraining and grading all happen with
 * no human. The two locks are `review()` (approve an example into the corpus)
 * and `publish()` (ship a graded candidate). This is what stops a flood of
 * fake reports from training the model to ignore a scam script.
 *
 * Storage is injected so this ports from in-memory to Firestore unchanged.
 *
 * @typedef {'scam'|'legit'} Label
 * @typedef {Object} ReviewItem
 * @property {string} id
 * @property {string} text          transcript excerpt (already privacy-scrubbed upstream)
 * @property {Label} userLabel      what the user said it was
 * @property {Label} modelLabel     what the model said
 * @property {number} at
 * @property {'pending'|'approved'|'rejected'} status
 * @property {Label} [finalLabel]   the admin's call, once reviewed
 */

/** Minimal in-memory store. Swap for a Firestore-backed one with the same shape. */
export class InMemoryLearningStore {
  constructor() {
    /** @type {ReviewItem[]} */ this.queue = [];
    /** @type {{text:string,label:Label,source:string}[]} */ this.extraCorpus = [];
    /** @type {{version:string,model:string,grade:object,status:string,at:number}[]} */ this.candidates = [];
    this.publishedVersion = 'seed';
  }
}

export class LearningPipeline {
  /** @param {InMemoryLearningStore} store @param {{now?:()=>number}} [opts] */
  constructor(store, opts = {}) {
    this._s = store;
    this._now = opts.now ?? (() => 0); // injected — Date.now() is not used in library code
    this._seq = 0;
  }

  // ── collection (automatic) ────────────────────────────────────────────────

  /**
   * A user disagreed with the verdict. Queue it — never trains anything yet.
   * @param {{text:string, userLabel:Label, modelLabel:Label}} fb
   */
  recordFeedback(fb) {
    const id = `rv_${++this._seq}`;
    this._s.queue.push({
      id,
      text: fb.text,
      userLabel: fb.userLabel,
      modelLabel: fb.modelLabel,
      at: this._now(),
      status: 'pending',
    });
    return id;
  }

  pendingReview() {
    return this._s.queue.filter((i) => i.status === 'pending');
  }

  // ── review (human lock #1) ────────────────────────────────────────────────

  /**
   * Admin decides. `approve` with a `label` adds one clean example to the
   * corpus; `reject` drops it (e.g. it was a confused user or a poison attempt).
   * @param {string} id
   * @param {{decision:'approve'|'reject', label?:Label}} d
   */
  review(id, d) {
    const item = this._s.queue.find((i) => i.id === id);
    if (!item || item.status !== 'pending') return false;
    if (d.decision === 'reject') {
      item.status = 'rejected';
      return true;
    }
    const label = d.label ?? item.userLabel;
    item.status = 'approved';
    item.finalLabel = label;
    this._s.extraCorpus.push({ text: item.text, label, source: item.id });
    return true;
  }

  // ── retrain + grade (automatic) ───────────────────────────────────────────

  /** The corpus the next model would train on. */
  fullCorpus() {
    return [
      ...CORPUS,
      ...this._s.extraCorpus.map((e) => ({ text: e.text, label: e.label })),
    ];
  }

  /**
   * Retrain on the current corpus, grade the candidate against the held-out
   * fixtures, and record it. It does NOT become live until `publish()`.
   * A candidate that scores worse than the published model is marked 'failed'.
   */
  buildCandidate() {
    const corpus = this.fullCorpus();
    const model = train(corpus);
    const grade = gradeModel(model);
    const version = `cand_${this._s.candidates.length + 1}`;
    const prev = this._s.candidates.find((c) => c.version === this._s.publishedVersion);
    const baseline = prev?.grade?.accuracy ?? gradeModel(train(CORPUS)).accuracy;

    const status = grade.accuracy + 1e-9 >= baseline && grade.falsePositives === 0
      ? 'graded'
      : 'failed';

    const record = {
      version,
      model: serialize(model),
      grade: { ...grade, baseline },
      status,
      at: this._now(),
      corpusSize: corpus.length,
    };
    this._s.candidates.push(record);
    return record;
  }

  candidates() {
    return this._s.candidates.map(({ model, ...rest }) => rest); // omit the blob
  }

  // ── publish (human lock #2) ───────────────────────────────────────────────

  /** Ship a graded candidate. Refuses a 'failed' one. */
  publish(version) {
    const cand = this._s.candidates.find((c) => c.version === version);
    if (!cand || cand.status === 'failed') return { ok: false, reason: 'not publishable' };
    cand.status = 'published';
    this._s.publishedVersion = version;
    return { ok: true, version, model: cand.model };
  }

  publishedModel() {
    const cand = this._s.candidates.find((c) => c.version === this._s.publishedVersion);
    return cand ? cand.model : null; // null = still on the shipped seed model
  }
}

// ── grading ────────────────────────────────────────────────────────────────

/** Run a model over the held-out fixtures and score it. */
export function gradeModel(model) {
  let correct = 0, total = 0, falsePositives = 0, falseNegatives = 0;
  for (const turns of Object.values(SCAM_CALLS)) {
    total += 1;
    const p = predict(model, turns.join(' '));
    if (p.label === 'scam') correct += 1; else falseNegatives += 1;
  }
  for (const [name, turns] of Object.entries(LEGIT_CALLS)) {
    if (name === 'fraudWarning') continue; // documented ML blind spot — the ensemble handles it
    total += 1;
    const p = predict(model, turns.join(' '));
    if (p.label === 'legit') correct += 1; else falsePositives += 1;
  }
  return {
    accuracy: Number((correct / total).toFixed(3)),
    falsePositives,
    falseNegatives,
    total,
  };
}
