import test from 'node:test';
import assert from 'node:assert/strict';
import { callerTextOf, engineLabel } from '../jobs/ingest-reports.mjs';

test('callerTextOf keeps only caller lines, in order', () => {
  const turns = callerTextOf({
    transcript: [
      { c: true, t: 'bankadan arıyorum' },
      { c: false, t: 'buyurun' },
      { c: true, t: 'kodu okuyun' },
      { c: true, t: '' },
      null,
    ],
  });
  assert.deepEqual(turns, ['bankadan arıyorum', 'kodu okuyun']);
});

test('callerTextOf tolerates a missing / malformed transcript', () => {
  assert.deepEqual(callerTextOf({}), []);
  assert.deepEqual(callerTextOf(null), []);
  assert.deepEqual(callerTextOf({ transcript: 'nope' }), []);
});

test('engineLabel scores a scam transcript as scam and a benign one as legit', () => {
  const scam = engineLabel(
    ['bankanızın güvenlik biriminden arıyorum', 'telefonunuza gelen kodu okuyun', 'acele edin hesabınız kapanacak'],
    'tr',
  );
  assert.equal(scam, 'scam');

  const legit = engineLabel(['merhaba yarınki diş randevunuzu hatırlatmak için aradık'], 'tr');
  assert.equal(legit, 'legit');

  assert.equal(engineLabel([], 'tr'), null);
});
