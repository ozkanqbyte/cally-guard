import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardMetrics } from '../src/observability/metrics.mjs';
import { createGuardServer } from '../src/api/server.mjs';
import { SCAM_CALLS, LEGIT_CALLS } from '../fixtures/calls.mjs';

const DAY = 86_400_000;

test('aggregates turns, calls, bands and signals', () => {
  const m = new GuardMetrics();
  m.recordTurn({ at: 0, score: 88, band: 'severe', signals: ['otp_request', 'urgency_threat'] });
  m.recordTurn({ at: 0, score: 10, band: 'low', signals: [] });
  m.recordCall({ at: 0, finalScore: 88, action: 'auto_hangup' });
  m.recordCall({ at: DAY, finalScore: 12, action: 'silent' });

  const o = m.overview();
  assert.equal(o.totals.calls, 2);
  assert.equal(o.totals.avgRisk, 50);
  assert.equal(o.bandDistribution.severe, 1);
  assert.equal(o.topSignals[0].id, 'otp_request');
  assert.equal(o.daily.length, 2);
  assert.equal(o.daily[0].autoHangups, 1);
});

test('precision and recall from gold-label feedback', () => {
  const m = new GuardMetrics();
  m.recordFeedback({ wasScam: true, actionTaken: 'auto_hangup' });  // TP
  m.recordFeedback({ wasScam: false, actionTaken: 'warn_user' });   // FP
  m.recordFeedback({ wasScam: false, actionTaken: 'silent' });      // TN
  m.recordFeedback({ wasScam: true, actionTaken: 'silent' });       // FN
  const q = m.overview().quality;
  assert.equal(q.precision, 0.5);
  assert.equal(q.recall, 0.5);
});

test('quality is null before any feedback', () => {
  assert.equal(new GuardMetrics().overview().quality.precision, null);
});

test('retention drops the oldest day', () => {
  const m = new GuardMetrics({ retentionDays: 2 });
  m.recordCall({ at: 0, finalScore: 1, action: 'silent' });
  m.recordCall({ at: DAY, finalScore: 1, action: 'silent' });
  m.recordCall({ at: 2 * DAY, finalScore: 1, action: 'silent' });
  assert.equal(m.overview().daily.length, 2);
});

test('API: /v1/metrics/overview reflects real guard traffic', async (t) => {
  const server = createGuardServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const j = async (m, u, b) => (await fetch(u, {
    method: m, headers: b ? { 'content-type': 'application/json' } : undefined,
    body: b ? JSON.stringify(b) : undefined,
  })).json();

  for (const script of [SCAM_CALLS.fakeBank, LEGIT_CALLS.dentist]) {
    const { callId } = await j('POST', `${base}/v1/guard/calls`);
    for (const text of script) {
      const r = await j('POST', `${base}/v1/guard/calls/${callId}/turns`, { text });
      if (r.action === 'end') break;
    }
    await j('GET', `${base}/v1/guard/calls/${callId}/summary`);
  }

  const o = await j('GET', `${base}/v1/metrics/overview`);
  assert.equal(o.totals.calls, 2);
  assert.ok(o.topSignals.length >= 1);
  assert.ok(o.bandDistribution.severe >= 1);
});
