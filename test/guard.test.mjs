import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardCall } from '../src/guard/session.mjs';
import { isSafeLine, decide } from '../src/guard/policy.mjs';
import { SCAM_CALLS, LEGIT_CALLS } from '../fixtures/calls.mjs';

test('a call opens with a greeting and does not end', () => {
  const call = new GuardCall('t1');
  assert.ok(call.opening.length > 0);
  assert.equal(call.ended, false);
});

test('the Guard never says a multi-digit number or confirms a request', () => {
  for (const [name, turns] of Object.entries({ ...SCAM_CALLS, ...LEGIT_CALLS })) {
    const call = new GuardCall(name);
    const said = [call.opening];
    for (const turn of turns) {
      if (call.ended) break;
      said.push(call.callerSaid(turn).reply);
    }
    for (const line of said) {
      assert.ok(isSafeLine(line), `${name}: unsafe line -> "${line}"`);
    }
  }
});

test('the Guard hangs up once a call is clearly a scam', () => {
  const call = new GuardCall('t2');
  let ended = false;
  for (const turn of SCAM_CALLS.fakeBank) {
    if (call.callerSaid(turn).action === 'end') { ended = true; break; }
  }
  assert.ok(ended, 'call should have ended');
  const summary = call.summary();
  assert.ok(summary.risk >= 80, `final risk ${summary.risk}`);
  assert.match(summary.advice, /dolandırıcılık/);
});

test('the Guard stays polite and open on a legitimate call', () => {
  const call = new GuardCall('t3');
  for (const turn of LEGIT_CALLS.dentist) {
    assert.equal(call.callerSaid(turn).action, 'continue');
  }
  assert.equal(call.ended, false);
  assert.match(call.summary().advice, /dikkatli ol/);
});

test('policy never regresses to an earlier phase', () => {
  // risk fell back to elicit range mid-call, but we stay at stall
  const held = decide({ turn: 5, risk: 40, lastMove: 'stall' });
  assert.equal(held.move, 'stall');
  // probe -> elicit is forward, allowed
  const forward = decide({ turn: 2, risk: 40, lastMove: 'probe' });
  assert.equal(forward.move, 'elicit');
  // elicit -> stall is forward, allowed
  const escalate = decide({ turn: 3, risk: 70, lastMove: 'elicit' });
  assert.equal(escalate.move, 'stall');
});

test('policy wraps up a call that runs too long even with no risk', () => {
  const d = decide({ turn: 14, risk: 0, lastMove: 'probe' });
  assert.equal(d.action, 'end');
});

test('mid-risk elicits scam-specific detail questions', () => {
  const bank = decide({ turn: 2, risk: 40, topSignal: 'bank_impersonation' });
  assert.equal(bank.move, 'elicit');
  assert.match(bank.utterance, /şube|sicil|hesab/i);

  const authority = decide({ turn: 2, risk: 45, topSignal: 'authority_impersonation' });
  assert.match(authority.utterance, /savcılık|dosya|unvan/i);

  const unknown = decide({ turn: 2, risk: 40, topSignal: 'something_new' });
  assert.equal(unknown.move, 'elicit'); // falls back to a generic probe question
});

test('elicitation questions are still safe lines', () => {
  for (const sig of ['bank_impersonation', 'authority_impersonation', 'money_transfer',
    'otp_request', 'remote_access', 'relative_emergency', 'crypto_investment']) {
    const d = decide({ turn: 2, risk: 40, topSignal: sig });
    assert.ok(isSafeLine(d.utterance), `${sig}: ${d.utterance}`);
  }
});

test('joinMidCall mode opens as a confused person, not a greeting', () => {
  const call = new GuardCall('t-mid', { mode: 'joinMidCall' });
  assert.doesNotMatch(call.opening, /alo|buyurun/i);
  assert.ok(isSafeLine(call.opening));
  // and it still detects and hangs up on a scam
  let ended = false;
  for (const t of SCAM_CALLS.fakeBank) {
    if (call.callerSaid(t).action === 'end') { ended = true; break; }
  }
  assert.ok(ended);
  assert.ok(call.summary().risk >= 80);
});

test('a slow-burn scam gets stalled and questioned before hang-up', () => {
  const call = new GuardCall('slow');
  const moves = [];
  const script = [
    'Merhaba, bankanızın güvenlik biriminden arıyorum.',        // ~elevated
    'Hesabınızda bir hareket gördük, kontrol etmemiz lazım.',   // still ~elevated
    'Şimdi telefonunuza gelen kodu bana okur musunuz?',         // jumps high
    'Acele edin lütfen, işlem birazdan iptal olacak.',
  ];
  for (const line of script) {
    if (call.ended) break;
    const r = call.callerSaid(line);
    moves.push(r.reply);
  }
  const summary = call.summary();
  assert.ok(call.ended);
  assert.ok(summary.risk >= 70);
  // the scammer's own words are captured for the report
  assert.ok(summary.transcript.some((m) => m.who === 'caller' && /kod/i.test(m.text)));
});

test('the full transcript is available for the user summary', () => {
  const call = new GuardCall('t4');
  for (const turn of SCAM_CALLS.crypto) {
    if (call.callerSaid(turn).action === 'end') break;
  }
  const { transcript } = call.summary();
  assert.ok(transcript.length >= 4);
  assert.equal(transcript[0].who, 'ai');
  assert.ok(transcript.some((m) => m.who === 'caller'));
});

// ── share-card highlights ───────────────────────────────────────────────────
import { pickHighlights, sanitizeLine } from '../src/guard/highlights.mjs';

test('pickHighlights strips long numbers and keeps the story to 3 lines', () => {
  const call = new GuardCall('hl');
  for (const t of [
    'Garanti güvenlik biriminden arıyorum, hesabınızda 4250 TL şüpheli işlem var.',
    'Telefonunuza gelen 6 haneli kodu bana okuyun.',
    'Acele edin, 890123 kodunu söyleyin.',
  ]) { if (!call.ended) call.callerSaid(t); }
  const h = call.summary().highlights;
  assert.ok(h.length >= 1 && h.length <= 3);
  for (const line of h) assert.ok(!/\d{3,}/.test(line.text), `leaked: ${line.text}`);
  assert.ok(h.some((l) => l.fromScammer === true));
});

test('sanitizeLine caps very long lines', () => {
  const long = 'a'.repeat(200);
  assert.ok(sanitizeLine(long).length <= 96);
  assert.equal(sanitizeLine('kod 123456 dogru'), 'kod ••• dogru');
});
