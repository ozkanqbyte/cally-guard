import test from 'node:test';
import assert from 'node:assert/strict';
import { runEnsemble } from '../src/ensemble/ensemble.mjs';
import { rulesVote, mlVote, heuristicJudge } from '../src/ensemble/judge.mjs';
import { SCAM_CALLS, LEGIT_CALLS } from '../fixtures/calls.mjs';

const CLEAN_LEGIT = ['dentist', 'courier', 'friend', 'restaurant', 'bankReminder'];

test('every scam script: rules and ML agree and Cally acts', () => {
  for (const [name, turns] of Object.entries(SCAM_CALLS)) {
    const r = runEnsemble({ callerTurns: turns });
    assert.equal(r.agreement, 'agree_scam', `${name}: ${r.agreement}`);
    assert.ok(['auto_hangup', 'warn_user'].includes(r.action), `${name}: ${r.action}`);
    assert.ok(r.score >= 60, `${name}: score ${r.score}`);
  }
});

test('clean legit calls: the panel agrees and Cally stays silent', () => {
  for (const name of CLEAN_LEGIT) {
    const r = runEnsemble({ callerTurns: LEGIT_CALLS[name] });
    assert.equal(r.agreement, 'agree_legit', `${name}: ${r.agreement} score ${r.score}`);
    assert.equal(r.action, 'silent');
  }
});

test('legit calls never get an alarm', () => {
  for (const [name, turns] of Object.entries(LEGIT_CALLS)) {
    const r = runEnsemble({ callerTurns: turns });
    assert.ok(!['auto_hangup', 'warn_user'].includes(r.action), `${name}: ${r.action}`);
  }
});

test('a fraud-awareness call (rules clear, ML noisy) becomes ask_user, not an alarm', () => {
  const r = runEnsemble({ callerTurns: LEGIT_CALLS.fraudWarning });
  assert.equal(r.agreement, 'conflict');
  assert.equal(r.action, 'ask_user');
  assert.match(r.userSummary, /kararsız|emin değil/);
});

test('a judge is only consulted on a genuine conflict', () => {
  let calls = 0;
  const judge = (rv, mv) => { calls += 1; return heuristicJudge(rv, mv); };
  runEnsemble({ callerTurns: SCAM_CALLS.fakeBank, judge });      // agree -> no judge
  runEnsemble({ callerTurns: LEGIT_CALLS.dentist, judge });      // agree -> no judge
  assert.equal(calls, 0);
  runEnsemble({ callerTurns: LEGIT_CALLS.fraudWarning, judge }); // conflict -> judge
  assert.equal(calls, 1);
});

test('a judge that sides with the rules on a conflict clears the alarm', () => {
  const judge = () => ({ name: 'judge', vote: 'legit', confidence: 0.7 });
  const r = runEnsemble({ callerTurns: LEGIT_CALLS.fraudWarning, judge });
  assert.equal(r.action, 'silent');
});

test('the heuristic judge abstains when the two voters disagree', () => {
  const scam = { name: 'rules', vote: 'scam', confidence: 0.9 };
  const legit = { name: 'ml', vote: 'legit', confidence: 0.8 };
  assert.equal(heuristicJudge(scam, legit).vote, 'unsure');
});

test('no single voter forces a hang-up', () => {
  // rules alone screams scam; ML disagrees -> not agree_scam -> no auto_hangup
  const r = runEnsemble({
    callerTurns: ['Kart numaranızı ve şifrenizi kimseye vermeyin, sadece hatırlatma.'],
  });
  assert.notEqual(r.action, 'auto_hangup');
});

test('rulesVote and mlVote map to votes sanely', () => {
  assert.equal(rulesVote({ score: 90, confidence: 80 }).vote, 'scam');
  assert.equal(rulesVote({ score: 10, confidence: 40 }).vote, 'legit');
  assert.equal(rulesVote({ score: 35, confidence: 40 }).vote, 'unsure');
  assert.equal(mlVote({ scamProb: 0.8, confidence: 0.6 }).vote, 'scam');
  assert.equal(mlVote({ scamProb: 0.2, confidence: 0.6 }).vote, 'legit');
  assert.equal(mlVote({ scamProb: 0.5, confidence: 0 }).vote, 'unsure');
});
