import test from 'node:test';
import assert from 'node:assert/strict';
import { LearningPipeline, InMemoryLearningStore, gradeModel } from '../src/learning/pipeline.mjs';
import { train } from '../src/ml/classifier.mjs';
import { CORPUS } from '../src/ml/corpus.mjs';

const make = () => new LearningPipeline(new InMemoryLearningStore(), { now: () => 1 });

test('feedback is queued, never trains anything on its own', () => {
  const p = make();
  const id = p.recordFeedback({ text: 'bankadan aradim kod ver', userLabel: 'scam', modelLabel: 'legit' });
  assert.equal(p.pendingReview().length, 1);
  assert.equal(p.fullCorpus().length, CORPUS.length); // corpus unchanged until reviewed
  assert.ok(id.startsWith('rv_'));
});

test('approving a review adds one clean example; rejecting drops it', () => {
  const p = make();
  const a = p.recordFeedback({ text: 'MASAK incelemesi paranizi guvenli hesaba yollayin', userLabel: 'scam', modelLabel: 'legit' });
  const b = p.recordFeedback({ text: 'yarinki randevunuzu hatirlatmak istedim', userLabel: 'scam', modelLabel: 'legit' });

  assert.ok(p.review(a, { decision: 'approve', label: 'scam' }));
  assert.ok(p.review(b, { decision: 'reject' })); // confused user / poison attempt

  assert.equal(p.fullCorpus().length, CORPUS.length + 1);
  assert.equal(p.pendingReview().length, 0);
});

test('a second review of the same item is a no-op', () => {
  const p = make();
  const id = p.recordFeedback({ text: 'x', userLabel: 'scam', modelLabel: 'legit' });
  p.review(id, { decision: 'approve', label: 'scam' });
  assert.equal(p.review(id, { decision: 'approve', label: 'scam' }), false);
});

test('a candidate is retrained and graded automatically, not published', () => {
  const p = make();
  const c = p.buildCandidate();
  assert.match(c.version, /^cand_/);
  assert.ok(c.grade.accuracy >= 0.8);
  assert.equal(c.grade.falsePositives, 0);
  assert.equal(c.status, 'graded');
  assert.equal(p.publishedModel(), null); // still on the seed model
});

test('publish is the human lock — it ships a graded candidate', () => {
  const p = make();
  const c = p.buildCandidate();
  const res = p.publish(c.version);
  assert.ok(res.ok);
  assert.ok(p.publishedModel()); // now a trained model blob
});

test('a candidate that regresses or adds a false positive cannot be published', () => {
  const p = make();
  // poison the corpus: label obvious scams as legit
  for (let i = 0; i < 6; i++) {
    const id = p.recordFeedback({
      text: 'telefonunuza gelen dogrulama kodunu bana okuyun acele edin',
      userLabel: 'legit', modelLabel: 'scam',
    });
    p.review(id, { decision: 'approve', label: 'legit' });
  }
  const c = p.buildCandidate();
  assert.equal(c.status, 'failed');
  assert.equal(p.publish(c.version).ok, false);
});

test('gradeModel scores the shipped seed model highly', () => {
  const g = gradeModel(train(CORPUS));
  assert.ok(g.accuracy >= 0.9, `accuracy ${g.accuracy}`);
  assert.equal(g.falsePositives, 0);
});
