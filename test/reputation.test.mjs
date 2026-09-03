import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreNumber, ReportStore } from '../src/reputation/reputation.mjs';

const DAY = 86_400_000;
const NOW = 1_760_000_000_000; // fixed epoch so decay maths is deterministic

const report = (over = {}) => ({
  number: '+905550000000',
  category: 'scam',
  reporterTrust: 0.6,
  at: NOW,
  ...over,
});

test('an unknown number scores zero', () => {
  const r = scoreNumber({ reports: [], now: NOW });
  assert.equal(r.score, 0);
  assert.equal(r.band, 'unknown');
});

test('one low-trust report barely moves the needle', () => {
  const r = scoreNumber({
    reports: [report({ category: 'nuisance', reporterTrust: 0.2 })],
    now: NOW,
  });
  assert.ok(r.score > 0 && r.score < 20, `got ${r.score}`);
  assert.equal(r.band, 'low');
});

test('several independent scam reports push it high', () => {
  const reports = Array.from({ length: 5 }, () => report());
  const r = scoreNumber({ reports, now: NOW });
  assert.ok(r.score >= 60, `got ${r.score}`);
  assert.equal(r.band, 'high');
  assert.equal(r.topCategories[0], 'scam');
});

test('old reports decay toward nothing', () => {
  const fresh = scoreNumber({ reports: Array.from({ length: 5 }, () => report()), now: NOW });
  const aged = scoreNumber({
    reports: Array.from({ length: 5 }, () => report({ at: NOW - 270 * DAY })),
    now: NOW,
  });
  assert.ok(aged.score < 30, `aged score ${aged.score}`);
  assert.ok(fresh.score > aged.score * 3, `fresh ${fresh.score} vs aged ${aged.score}`);
});

test('safe-listed numbers are never flagged', () => {
  const reports = Array.from({ length: 10 }, () => report());
  const r = scoreNumber({ reports, now: NOW, safeListed: true });
  assert.equal(r.score, 0);
  assert.equal(r.band, 'safe');
});

test('reporter trust outweighs raw report count', () => {
  const trusted = scoreNumber({ reports: [report({ reporterTrust: 1.0 })], now: NOW });
  const crowdOfDoubtful = scoreNumber({
    reports: Array.from({ length: 3 }, () => report({ reporterTrust: 0.15 })),
    now: NOW,
  });
  assert.ok(
    trusted.score > crowdOfDoubtful.score,
    `trusted ${trusted.score} should beat ${crowdOfDoubtful.score}`,
  );
});

test('ReportStore aggregates and scores by number', () => {
  const store = new ReportStore();
  for (let i = 0; i < 4; i++) {
    store.add({ number: '+905551112233', category: 'phishing', reporterTrust: 0.7 });
  }
  const r = store.score('+905551112233');
  assert.equal(r.reportCount, 4);
  assert.ok(r.score >= 50, `got ${r.score}`);
  assert.equal(store.score('+900000000000').band, 'unknown');
});
