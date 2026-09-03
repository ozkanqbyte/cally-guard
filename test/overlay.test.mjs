import test from 'node:test';
import assert from 'node:assert/strict';
import { LexiconOverlay } from '../src/detection/overlay.mjs';
import { scoreTranscript } from '../src/detection/detector.mjs';
import { createGuardServer } from '../src/api/server.mjs';

test('an overlay phrase makes a previously-missed line fire', () => {
  const line = ['Size özel bir hediye kodu tanımladık, aktive etmek için bana geri okuyun'];
  const before = scoreTranscript(line, { locale: 'tr' });

  const ov = new LexiconOverlay();
  ov.addPhrase('tr', 'otp_request', 'hediye kodu + geri okuyun');
  const after = scoreTranscript(line, { locale: 'tr', overlay: ov.get('tr') });

  assert.ok(after.score > before.score, `${after.score} should beat ${before.score}`);
  assert.ok(after.reasons.some((r) => r.id === 'otp_request'));
});

test('co-occurrence needs both words; remove undoes it; snapshot round-trips', () => {
  const ov = new LexiconOverlay();
  assert.equal(ov.addPhrase('tr', 'money_transfer', 'jeton + yükle'), true);
  assert.equal(ov.addPhrase('tr', 'money_transfer', 'jeton + yükle'), false); // dup
  assert.ok(scoreTranscript(['jeton yükle hemen'], { locale: 'tr', overlay: ov.get('tr') }).reasons
    .some((r) => r.id === 'money_transfer'));
  assert.equal(scoreTranscript(['sadece jeton lazım'], { locale: 'tr', overlay: ov.get('tr') }).score, 0);

  const restored = new LexiconOverlay(ov.snapshot());
  assert.deepEqual(restored.snapshot(), ov.snapshot());

  ov.removePhrase('tr', 'money_transfer', 'jeton + yükle');
  assert.deepEqual(ov.get('tr'), {});
});

test('the API exposes lexicon read / add / test', async () => {
  const server = createGuardServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const j = (res) => res.json();

  const lex = await fetch(`${base}/v1/lexicon?locale=tr`).then(j);
  assert.ok(lex.signals.some((s) => s.id === 'otp_request' && s.base.length));

  await fetch(`${base}/v1/lexicon/phrase`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ locale: 'tr', signalId: 'cargo_ransom', phrase: 'depo ücreti' }),
  });
  const t = await fetch(`${base}/v1/lexicon/test`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ locale: 'tr', turns: ['paketiniz için depo ücreti ödemeniz gerekiyor'] }),
  }).then(j);
  assert.ok(t.reasons.some((r) => r.id === 'cargo_ransom'));

  await new Promise((r) => server.close(r));
});
