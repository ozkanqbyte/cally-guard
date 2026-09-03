import test from 'node:test';
import assert from 'node:assert/strict';
import { train, predict, tokenize, SEED_MODEL, serialize, deserialize } from '../src/ml/classifier.mjs';
import { CORPUS } from '../src/ml/corpus.mjs';
import { SCAM_CALLS, LEGIT_CALLS } from '../fixtures/calls.mjs';

test('tokenize produces unigrams and bigrams', () => {
  assert.deepEqual(tokenize('kodu bana ver'), ['kodu', 'bana', 'ver', 'kodu_bana', 'bana_ver']);
});

const CLEAN_LEGIT = ['dentist', 'courier', 'friend', 'restaurant', 'bankReminder'];

test('the seed model separates held-out scam scripts from clean legit ones', () => {
  // fixtures are NOT in the corpus - this measures generalisation
  for (const [name, turns] of Object.entries(SCAM_CALLS)) {
    const p = predict(SEED_MODEL, turns.join(' '));
    assert.equal(p.label, 'scam', `${name}: scamProb ${p.scamProb.toFixed(2)}`);
    assert.ok(p.scamProb >= 0.6, `${name}: only ${p.scamProb.toFixed(2)}`);
  }
  for (const name of CLEAN_LEGIT) {
    const p = predict(SEED_MODEL, LEGIT_CALLS[name].join(' '));
    assert.equal(p.label, 'legit', `${name}: scamProb ${p.scamProb.toFixed(2)}`);
    assert.ok(p.scamProb <= 0.4, `${name}: ${p.scamProb.toFixed(2)}`);
  }
});

test('a fraud-awareness call is the classifier\'s known blind spot', () => {
  // It shares vocabulary with a scam ("gelen kodu ... paylasmayin"). The ML
  // leans scam here on purpose - the rules advice-guard and the ensemble
  // conflict path are what make the final verdict safe.
  const p = predict(SEED_MODEL, LEGIT_CALLS.fraudWarning.join(' '));
  assert.ok(p.scamProb > 0.5);
});

test('empty text is a no-opinion 0.5', () => {
  const p = predict(SEED_MODEL, '');
  assert.equal(p.scamProb, 0.5);
  assert.equal(p.confidence, 0);
});

test('training is deterministic and serialises round-trip', () => {
  const a = train(CORPUS);
  const b = deserialize(serialize(a));
  assert.equal(a.vocabSize, b.vocabSize);
  assert.equal(
    predict(a, SCAM_CALLS.crypto.join(' ')).scamProb,
    predict(b, SCAM_CALLS.crypto.join(' ')).scamProb,
  );
});

test('a novel scam phrasing not in rules still reads as scam', () => {
  // no rule phrase matches this exactly; the classifier should still lean scam
  const p = predict(SEED_MODEL,
    'beyefendi hattınız suistimal edilmiş onay numarasını bana geçin de iptal edeyim');
  assert.ok(p.scamProb > 0.5, `scamProb ${p.scamProb.toFixed(2)}`);
});
