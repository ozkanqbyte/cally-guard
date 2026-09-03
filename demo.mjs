/**
 * End-to-end proof: a fake-bank scam call is run through Cally AI Guard, turn by
 * turn. Shows the number check, the live risk score climbing, the Guard's safe
 * replies, and the summary the user would see.
 *
 *   node services/guard/demo.mjs
 *   node services/guard/demo.mjs masak | relativeEmergency | cargo | crypto
 */
import './src/dotenv.mjs'; // load services/guard/.env (GEMINI_API_KEY etc.)
import { GuardCall } from './src/guard/session.mjs';
import { ReportStore } from './src/reputation/reputation.mjs';
import { humanize } from './src/agent/humanize.mjs';
import { llmConverseFromEnv } from './src/agent/providers/llm-polish.mjs';
import { SCAM_CALLS } from './fixtures/calls.mjs';

// A slow-burn scam — stays plausible for a few turns so the AI's "elicit"
// (stall + gather details) phase is visible before the hang-up.
const EXTRA = {
  slowBank: [
    'Merhaba, bankanızın müşteri hizmetlerinden arıyorum.',
    'Hesap hareketlerinizle ilgili küçük bir kontrol yapmamız gerekiyor.',
    'Kartınızla ilgili bir doğrulama var, birkaç sorum olacak.',
    'Şimdi telefonunuza gelen doğrulama kodunu bana okur musunuz?',
    'Acele edelim, işlem birazdan zaman aşımına uğrayacak.',
    'Kart numaranızı da alalım, son işlemi teyit edelim.',
  ],
};

const scenario = process.argv[2] || 'fakeBank';
const turns = SCAM_CALLS[scenario] || EXTRA[scenario];
if (!turns) {
  console.error(`bilinmeyen senaryo: ${scenario}`);
  console.error(`seçenekler: ${[...Object.keys(SCAM_CALLS), ...Object.keys(EXTRA)].join(', ')}`);
  process.exit(1);
}

const BANDS = { low: 'DÜŞÜK', elevated: 'ORTA', high: 'YÜKSEK', severe: 'ÇOK YÜKSEK' };
const NUMBER = '+90 850 244 12 90';
const bar = (n) => '█'.repeat(Math.round(n / 5)).padEnd(20, '·');

const reputation = new ReportStore().score(NUMBER);
console.log(`\n📞  Gelen arama   ${NUMBER}`);
console.log(`    İtibar        ${reputation.score}/100 (${reputation.band}) — bu numara ilk kez görülüyor`);
console.log(`    Senaryo       ${scenario}\n`);

// Set GEMINI_API_KEY (or OPENAI/ANTHROPIC) for the natural "sohbet" column.
const converse = llmConverseFromEnv();

const call = new GuardCall(scenario);
console.log('🤖  Cally AI Guard aramayı devraldı.' + (converse ? '  (sohbet modu: kural + Gemini)' : '') + '\n');
console.log(`    AI       ▸ ${call.opening}`);

for (const turn of turns) {
  const r = call.callerSaid(turn);
  const tx = call.summary().transcript;
  console.log(`\n    Arayan   ▸ ${turn}`);
  console.log(`    risk       ${bar(r.risk)} ${String(r.risk).padStart(3)}/100  [${BANDS[r.band]}]`);
  console.log(`    sinyaller  ${r.reasons.map((x) => x.label).join(' · ') || '—'}`);
  console.log(`    AI (kural)  ▸ ${r.reply}`);
  console.log(`    AI (ses)    ▸ ${humanize(r.reply, { transcript: tx })}`);
  if (converse) {
    const said = await converse({
      callerText: turn, move: r.move, risk: r.risk,
      scamType: r.reasons[0]?.label, transcript: tx, fallback: r.reply,
    });
    console.log(`    AI (sohbet) ▸ ${said}`);
  }
  if (r.action === 'end') { console.log('\n    ↪ Arama Cally tarafından sonlandırıldı.'); break; }
}

const s = call.summary();
console.log(`\n${'─'.repeat(58)}`);
console.log('  ÖZET (kullanıcıya gösterilir)');
console.log('─'.repeat(58));
console.log(`  Risk     ${s.risk}/100 — ${BANDS[s.band]} dolandırıcılık şüphesi`);
console.log(`  Tespit   ${s.reasons.map((r) => r.label).join('\n           ')}`);
console.log(`  Öneri    ${s.advice}`);
console.log(`  Görüşme  ${s.turns} tur konuşuldu, gerçek kişi hattı hiç açmadı\n`);
