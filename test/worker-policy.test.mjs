import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAbusive, shouldArmRecording, shouldFlagCommunity, shouldPushVoiceMatch,
} from '../src/guard/worker-policy.mjs';

test('isAbusive is true only for threat / harassment', () => {
  assert.equal(isAbusive('threat'), true);
  assert.equal(isAbusive('harassment'), true);
  assert.equal(isAbusive('scam'), false);
  assert.equal(isAbusive(undefined), false);
});

test('recording arms on high scam risk OR any abusive call', () => {
  assert.equal(shouldArmRecording({ band: 'severe', risk: 90, category: 'scam' }), true);
  assert.equal(shouldArmRecording({ band: 'high', risk: 55, category: 'scam' }), true);
  assert.equal(shouldArmRecording({ band: 'elevated', risk: 65, category: 'scam' }), true); // risk>=60
  assert.equal(shouldArmRecording({ band: 'low', risk: 10, category: 'scam' }), false);
  // an abusive call arms even at a low score — the user needs evidence
  assert.equal(shouldArmRecording({ band: 'elevated', risk: 28, category: 'harassment' }), true);
  assert.equal(shouldArmRecording({ band: 'low', risk: 5, category: 'threat' }), true);
});

test('community scam DB gets scam calls only, never threat / harassment', () => {
  assert.equal(shouldFlagCommunity({ band: 'severe', risk: 95, category: 'scam' }), true);
  assert.equal(shouldFlagCommunity({ band: 'severe', risk: 95, category: 'threat' }), false);
  assert.equal(shouldFlagCommunity({ band: 'high', risk: 70, category: 'harassment' }), false);
  assert.equal(shouldFlagCommunity({ band: 'low', risk: 8, category: 'scam' }), false);
});

test('voice-match push: personal block always wins, even when push/known are false', () => {
  assert.equal(shouldPushVoiceMatch(null), false);
  assert.equal(shouldPushVoiceMatch({}), false);
  assert.equal(shouldPushVoiceMatch({ known: false, push: false }), false);
  // new build: an explicit push:false is respected even if known:true
  assert.equal(shouldPushVoiceMatch({ known: true, push: false }), false);
  // old build: no push field at all → fall back to known
  assert.equal(shouldPushVoiceMatch({ known: true }), true);
  assert.equal(shouldPushVoiceMatch({ push: true }), true);
  // the bug the sim caught: service returns push:false next to a personal hit
  assert.equal(
    shouldPushVoiceMatch({ push: false, known: false, personalBlock: { matched: true } }),
    true,
  );
  assert.equal(
    shouldPushVoiceMatch({ push: false, personalBlock: { matched: false } }),
    false,
  );
});
