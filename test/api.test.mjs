import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuardServer } from '../src/api/server.mjs';
import { SCAM_CALLS, LEGIT_CALLS } from '../fixtures/calls.mjs';

/** Start a server on an ephemeral port and return its base URL. */
function start(t) {
  const server = createGuardServer();
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      t.after(() => new Promise((r) => server.close(r)));
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

test('reputation: report then score', async (t) => {
  const base = await start(t);
  const number = '+905550001122';
  const q = `${base}/v1/score?number=${encodeURIComponent(number)}`;

  assert.equal((await call('GET', q)).body.band, 'unknown');

  for (let i = 0; i < 5; i++) {
    const r = await call('POST', `${base}/v1/reports`, {
      number, category: 'scam', reporterTrust: 0.6,
    });
    assert.equal(r.status, 201);
  }

  const scored = await call('GET', q);
  assert.ok(scored.body.score >= 55, `score ${scored.body.score}`);
  assert.equal(scored.body.band, 'high');
});

test('reputation: missing fields are rejected', async (t) => {
  const base = await start(t);
  assert.equal((await call('POST', `${base}/v1/reports`, { number: 'x' })).status, 400);
  assert.equal((await call('GET', `${base}/v1/score`)).status, 400);
});

test('guard: a scam call runs to a hang-up with a summary', async (t) => {
  const base = await start(t);

  const started = await call('POST', `${base}/v1/guard/calls`);
  assert.equal(started.status, 201);
  const { callId, opening } = started.body;
  assert.ok(opening.length > 0);

  let last;
  for (const turn of SCAM_CALLS.fakeBank) {
    last = await call('POST', `${base}/v1/guard/calls/${callId}/turns`, { text: turn });
    assert.equal(last.status, 200);
  }
  assert.equal(last.body.action, 'end');
  assert.ok(last.body.risk >= 80);

  const summary = await call('GET', `${base}/v1/guard/calls/${callId}/summary`);
  assert.equal(summary.status, 200);
  assert.ok(summary.body.risk >= 80);
  assert.ok(summary.body.reasons.length >= 2);

  // a turn after the hang-up is refused
  const afterEnd = await call('POST', `${base}/v1/guard/calls/${callId}/turns`, { text: 'hala orada mısın' });
  assert.equal(afterEnd.status, 409);
});

test('guard: a legitimate call never gets a hang-up', async (t) => {
  const base = await start(t);
  const { body: { callId } } = await call('POST', `${base}/v1/guard/calls`);
  for (const turn of LEGIT_CALLS.restaurant) {
    const r = await call('POST', `${base}/v1/guard/calls/${callId}/turns`, { text: turn });
    assert.equal(r.body.action, 'continue');
  }
});

test('guard: unknown call id is 404', async (t) => {
  const base = await start(t);
  assert.equal((await call('GET', `${base}/v1/guard/calls/nope/summary`)).status, 404);
});
