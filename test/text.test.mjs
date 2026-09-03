import test from 'node:test';
import assert from 'node:assert/strict';
import { fold, groupMatches } from '../src/text.mjs';

test('fold lowercases, strips Turkish accents and punctuation', () => {
  assert.equal(fold('İŞLEM Doğrulama KODU!'), 'islem dogrulama kodu');
  assert.equal(fold('  çok   GÜRÜLTÜLÜ … '), 'cok gurultulu');
  assert.equal(fold('Şüpheli-İşlem, 4.250 TL'), 'supheli islem 4 250 tl');
});

test('fold is idempotent', () => {
  const once = fold('MASAK incelemesi başlatıldı.');
  assert.equal(fold(once), once);
});

test('fold tolerates null and numbers', () => {
  assert.equal(fold(null), '');
  assert.equal(fold(undefined), '');
  assert.equal(fold(42), '42');
});

test('groupMatches needs every phrase present', () => {
  const hay = fold('iban numarasını hemen gönder');
  assert.ok(groupMatches(hay, ['iban', 'gonder']));
  assert.ok(!groupMatches(hay, ['iban', 'aktar']));
});
