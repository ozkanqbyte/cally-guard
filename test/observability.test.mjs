import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectionScored, ensembleDecided, callEnded, userFeedback,
  FakeSink, summarizeMetrics,
} from '../src/observability/events.mjs';

const AT = 1_760_000_000_000;

test('events carry signals and scores but never raw text', () => {
  const e = detectionScored('c1', AT, {
    score: 88, confidence: 90, band: 'severe', signals: ['otp_request', 'urgency_threat'],
  });
  assert.equal(e.type, 'detection_scored');
  assert.deepEqual(Object.keys(e.data).sort(), ['band', 'confidence', 'score', 'signals']);
  assert.ok(!JSON.stringify(e).toLowerCase().includes('merhaba'));
});

test('sink collects and filters by type', async () => {
  const sink = new FakeSink();
  await sink.write(detectionScored('c1', AT, { score: 10, confidence: 30, band: 'low', signals: [] }));
  await sink.write(ensembleDecided('c1', AT, { score: 12, agreement: 'unanimous_legit', action: 'silent', votes: [] }));
  await sink.write(callEnded('c1', AT, { reason: 'caller_hangup', finalScore: 12, turns: 2 }));
  assert.equal(sink.events.length, 3);
  assert.equal(sink.ofType('ensemble_decided').length, 1);
});

test('metrics roll decisions and gold-label feedback into precision/recall', () => {
  const sink = new FakeSink();
  const decide = (id, action) => ensembleDecided(id, AT, { score: 80, agreement: 'unanimous_scam', action, votes: [] });
  sink.events.push(
    decide('a', 'auto_hangup'), decide('b', 'warn_user'),
    decide('c', 'silent'), decide('d', 'ask_user'),
    userFeedback('a', AT, { wasScam: true, actionTaken: 'auto_hangup' }),  // TP
    userFeedback('b', AT, { wasScam: false, actionTaken: 'warn_user' }),   // FP
    userFeedback('c', AT, { wasScam: false, actionTaken: 'silent' }),      // TN
    userFeedback('e', AT, { wasScam: true, actionTaken: 'silent' }),       // FN
  );
  const m = summarizeMetrics(sink.events);
  assert.equal(m.calls, 4);
  assert.equal(m.byAction.auto_hangup, 1);
  assert.equal(m.truePos, 1);
  assert.equal(m.falsePos, 1);
  assert.equal(m.precision, 0.5);
  assert.equal(m.recall, 0.5);
});

test('metrics are well-defined with no feedback yet', () => {
  const m = summarizeMetrics([
    ensembleDecided('x', AT, { score: 5, agreement: 'unanimous_legit', action: 'silent', votes: [] }),
  ]);
  assert.equal(m.calls, 1);
  assert.equal(m.precision, null);
  assert.equal(m.recall, null);
});
