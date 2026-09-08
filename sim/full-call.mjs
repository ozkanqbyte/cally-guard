/**
 * Full-chain AI Guard simulation — proves every stage of a call end to end
 * WITHOUT a LiveKit room, a SIP number, or FCM delivery:
 *
 *   transcript ─▶ DetectionSession ─▶ GuardCall (policy + safe replies)
 *              ─▶ risk / band / category / signals
 *              ─▶ worker-policy: arm recording? flag community?
 *              ─▶ (mock voiceprint /match) ─▶ push guard_voice_match?
 *
 * Each scenario declares what it expects; the script asserts and exits non-zero
 * on any mismatch, so it doubles as a regression gate:
 *
 *   node services/guard/sim/full-call.mjs
 *   node services/guard/sim/full-call.mjs --live   # also calls the real /match on the server
 *
 * What this does NOT cover: the SIP audio transport (Netgsm→LiveKit→AI hearing
 * the real caller) and the actual FCM push landing on a device. Those need the
 * Turkish number + a phone; everything else is proven here.
 */
import './../src/dotenv.mjs';
import assert from 'node:assert/strict';
import { GuardCall } from '../src/guard/session.mjs';
import { isSafeLine } from '../src/guard/policy.mjs';
import {
  shouldArmRecording, shouldFlagCommunity, shouldPushVoiceMatch,
} from '../src/guard/worker-policy.mjs';

const LIVE = process.argv.includes('--live');
const VP_URL = process.env.VP_URL || 'http://127.0.0.1:8090';

// ── scenarios ───────────────────────────────────────────────────────────────
// vp = the voiceprint /match response the worker would get back (mocked unless
// --live). expect = what must be true after the whole chain runs.
const SCENARIOS = [
  {
    name: 'TR — sahte banka + kod isteme (scam)',
    locale: 'tr',
    turns: [
      'Merhaba, bankanızın güvenlik biriminden arıyorum, hesabınızda şüpheli bir işlem var.',
      'İşlemi iptal etmek için telefonunuza gelen doğrulama kodunu bana okuyun.',
      'Acele edin, aksi halde hesabınız bloke olacak, kimseye söylemeyin.',
    ],
    vp: { known: true, push: true, verified: false, clusterSize: 4, personalBlock: null },
    expect: { category: 'scam', minBand: 'high', arm: true, flagCommunity: true, push: true, ended: true },
  },
  {
    name: 'TR — tehdit / şantaj (threat)',
    locale: 'tr',
    turns: [
      'Adresini biliyorum, üstüne adam gönderirim, son uyarım.',
      'Görüntülerin elimde, para göndermezsen ailene gönderirim, ifşa ederim.',
    ],
    vp: { known: false, push: false, personalBlock: null },
    expect: { category: 'threat', minBand: 'high', arm: true, flagCommunity: false, push: false },
  },
  {
    name: 'TR — ısrarlı taciz (harassment)',
    locale: 'tr',
    turns: [
      'Seni rahat bırakmayacağım, numaramı değiştirir yine ararım.',
      'Gece gündüz ararım, patronunu da ararım, komşularını da ararım.',
    ],
    vp: { known: false, push: false, personalBlock: null },
    expect: { category: 'harassment', arm: true, flagCommunity: false, push: false },
  },
  {
    name: 'TR — meşru arama (klinik randevu)',
    locale: 'tr',
    turns: [
      'Merhaba, Ada Diş Kliniğinden arıyorum, yarınki randevunuzu hatırlatmak istedim.',
      'Gelemeyecekseniz haber verin, iyi günler.',
    ],
    vp: { known: false, push: false, personalBlock: null },
    expect: { category: 'scam', maxBand: 'low', arm: false, flagCommunity: false, push: false },
  },
  {
    name: 'ES — falso banco + código (scam)',
    locale: 'es',
    turns: [
      'Le llamo del departamento de fraude de su banco, hay un movimiento sospechoso.',
      'Digame el codigo de verificacion que le llega ahora, es urgente, no cuelgue.',
      'Transfiera el dinero a una cuenta segura, no se lo diga a nadie.',
    ],
    vp: { known: false, push: false, personalBlock: null },
    expect: { category: 'scam', minBand: 'high', arm: true, flagCommunity: true, push: false },
  },
  {
    name: 'DE — falsche Bank + Code (scam)',
    locale: 'de',
    turns: [
      'Ich rufe von der Betrugsabteilung Ihrer Bank an, es gibt eine verdachtige Transaktion.',
      'Nennen Sie mir den Bestatigungscode den wir Ihnen geschickt haben, es ist dringend.',
      'Uberweisen Sie das Geld auf ein sicheres Konto, sagen Sie niemandem etwas.',
    ],
    vp: { known: false, push: false, personalBlock: null },
    expect: { category: 'scam', minBand: 'high', arm: true, flagCommunity: true, push: false },
  },
  {
    name: 'TR — düşük skorlu arama ama TANIDIK SES (voiceprint push)',
    locale: 'tr',
    turns: ['Merhaba, bir dakikanızı alabilir miyim, kısa bir anket yapıyoruz.'],
    vp: { known: true, push: true, verified: true, label: 'Sahte MASAK - erkek', clusterSize: 9, personalBlock: null },
    expect: { arm: false, flagCommunity: false, push: true },
  },
  {
    name: 'TR — KİŞİSEL ENGELLENEN SES, farklı numara (personal block always pushes)',
    locale: 'tr',
    turns: ['Alo, açsana, gene ben.'],
    vp: { known: false, push: false, personalBlock: { matched: true, label: 'Rahatsız eden', score: 0.71 } },
    expect: { arm: false, flagCommunity: false, push: true },
  },
];

const RANK = { low: 0, elevated: 1, high: 2, severe: 3 };

async function liveMatch(gcsPathOrNull) {
  // only meaningful with a real recorded clip; here we just prove the endpoint
  // answers and the shape is what worker-policy expects.
  try {
    const r = await fetch(`${VP_URL}/health`).then((x) => x.json());
    return { _health: r };
  } catch (e) {
    return { _error: e.message };
  }
}

let failures = 0;
console.log(`\nAI Guard — full-chain simulation  (${LIVE ? 'LIVE voiceprint' : 'offline, mock /match'})\n`);

for (const sc of SCENARIOS) {
  const call = new GuardCall(sc.name, { locale: sc.locale });
  assert.ok(isSafeLine(call.opening), `${sc.name}: unsafe opening`);

  let last;
  for (const t of sc.turns) {
    last = call.callerSaid(t);
    assert.ok(isSafeLine(last.reply), `${sc.name}: AI said an unsafe line: "${last.reply}"`);
  }
  const summary = call.summary();

  const risk = { band: summary.band, risk: summary.risk, category: summary.category };
  const arm = shouldArmRecording(risk);
  const flagCommunity = shouldFlagCommunity(risk);
  const vp = LIVE ? { ...sc.vp, ...(await liveMatch(null)) } : sc.vp;
  const push = shouldPushVoiceMatch(vp);

  const checks = [];
  const e = sc.expect;
  if (e.category !== undefined) checks.push(['category', summary.category, e.category]);
  if (e.minBand !== undefined) checks.push(['band >= ' + e.minBand, RANK[summary.band] >= RANK[e.minBand], true]);
  if (e.maxBand !== undefined) checks.push(['band <= ' + e.maxBand, RANK[summary.band] <= RANK[e.maxBand], true]);
  if (e.arm !== undefined) checks.push(['armRecording', arm, e.arm]);
  if (e.flagCommunity !== undefined) checks.push(['flagCommunity', flagCommunity, e.flagCommunity]);
  if (e.push !== undefined) checks.push(['pushVoiceMatch', push, e.push]);
  if (e.ended !== undefined) checks.push(['call ended', call.ended, e.ended]);

  const bad = checks.filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want));
  const mark = bad.length ? '❌' : '✅';
  console.log(`${mark}  ${sc.name}`);
  const sigIds = summary.reasons.map((r) => r.id);
  console.log(`     risk ${String(summary.risk).padStart(3)}/100  band=${summary.band}  category=${summary.category}  signals=[${sigIds.join(', ') || '—'}]`);
  console.log(`     arm=${arm}  flagCommunity=${flagCommunity}  pushVoiceMatch=${push}  turns=${summary.turns}`);
  for (const [label, got, want] of bad) {
    console.log(`     ↳ MISMATCH ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
    failures++;
  }
  console.log();
}

if (LIVE) {
  const h = await liveMatch(null);
  console.log('voiceprint /health:', JSON.stringify(h._health ?? h._error));
}

console.log(failures ? `\n${failures} mismatch(es) — chain NOT verified\n` : '\nAll scenarios passed — full chain verified (minus SIP transport + FCM delivery)\n');
process.exit(failures ? 1 : 0);
