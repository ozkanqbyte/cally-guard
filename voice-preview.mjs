/**
 * Hear the AI Guard, for real. Three modes:
 *
 *   node voice-preview.mjs                 6 Guard lines, one voice  -> voice-preview/
 *   node voice-preview.mjs voices          same 6 lines across several voices (A/B)
 *   node voice-preview.mjs call [senaryo]  the WHOLE fake scam call, turn by turn
 *                                          (scammer voice + AI voice), numbered
 *
 * Then it sends one clip back through Deepgram Nova-3 to prove the speech-to-text
 * hears the Turkish — the full text -> voice -> text loop the live call needs.
 *
 * Keys from the environment, never a file:
 *   $env:ELEVENLABS_API_KEY = "sk_..."
 *   $env:DEEPGRAM_API_KEY   = "..."               # optional (back-transcribe check)
 *   $env:ELEVENLABS_VOICE_ID = "..."              # optional (default: first/premade)
 *   $env:ELEVENLABS_MODEL   = "eleven_multilingual_v2"   # optional
 *
 * Free ElevenLabs plan = the ~20 premade voices only (English names, speak Turkish
 * via the multilingual model). Library voices (Yunus, Orbay…) need a paid plan.
 */
import './src/dotenv.mjs'; // load services/guard/.env (ELEVENLABS_API_KEY, DEEPGRAM_API_KEY…)
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { humanize } from './src/agent/humanize.mjs';
import { llmPolishFromEnv } from './src/agent/providers/llm-polish.mjs';
import { GuardCall } from './src/guard/session.mjs';
import { SCAM_CALLS } from './fixtures/calls.mjs';

const EL_KEY = process.env.ELEVENLABS_API_KEY;
const DG_KEY = process.env.DEEPGRAM_API_KEY;
const EL_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'voice-preview');

// premade voices — always available, no voices_read / paid plan needed
const PREMADE = {
  Sarah: 'EXAVITQu4vr4xnSDxMaL', // olgun, güven veren kadın — iyi "mağdur"
  Brian: 'nPczCjzI2devNBz1zQrb', // derin erkek — iyi "dolandırıcı"
  Bill:  'pqHfZKP75CvOlQylNhV4', // yaşlı, bilge erkek
  Alice: 'Xb7hH8MSUJpSbSDYk0k2', // net, sıcak kadın
};

const SLOW_BANK = [
  'Merhaba, bankanızın müşteri hizmetlerinden arıyorum.',
  'Hesap hareketlerinizle ilgili küçük bir kontrol yapmamız gerekiyor.',
  'Kartınızla ilgili bir doğrulama var, birkaç sorum olacak.',
  'Şimdi telefonunuza gelen doğrulama kodunu bana okur musunuz?',
  'Acele edelim, işlem birazdan zaman aşımına uğrayacak.',
  'Kart numaranızı da alalım, son işlemi teyit edelim.',
];

const STEP = (n) => ({ transcript: new Array(n).fill({ who: 'ai', text: '' }) });
const GUARD_LINES = [
  ['01-karsilama',    'Alo, buyurun, kiminle görüşüyorum?'],
  ['02-probe',        humanize('Hangi kurumdan aradığınızı söyler misiniz?', STEP(3))],
  ['03-elicit-banka', humanize('Hangi bankadan, hangi şubeden arıyorsunuz? Bir de sicil numaranızı alabilir miyim?', STEP(5))],
  ['04-elicit-kod',   humanize('Kodu neden size söylemem gerekiyor, bankalar bunu istemez diye biliyorum?', STEP(7))],
  ['05-stall',        humanize('Bir saniye, not alıyorum… evet, devam edin.', STEP(9))],
  ['06-kapat',        humanize('Anladım. Ben bu konuyu bankamın kendi resmi numarasından arayıp kontrol edeceğim. İyi günler.', STEP(12))],
];

async function synth(voiceId, text, model = EL_MODEL) {
  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`);
  url.searchParams.set('output_format', 'mp3_44100_128'); // playable; live call uses ulaw_8000
  const body = {
    text,
    model_id: model,
    voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.2, speed: 0.95 },
  };
  if (!model.startsWith('eleven_v3')) body.language_code = 'tr'; // v3 auto-detects
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) {
      throw new Error('ElevenLabs 401 — anahtarda "Text to Speech" izni yok. Yeni, kısıtlamasız anahtar üret.');
    }
    if (res.status === 402) {
      throw new Error(`ElevenLabs 402 — bu ses ücretli plan istiyor. Premade bir ses kullan.\n  ${body}`);
    }
    throw new Error(`ElevenLabs ${res.status}: ${body}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function firstAccountVoice() {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': EL_KEY } });
    if (res.ok) {
      const { voices = [] } = await res.json();
      if (voices.length) {
        console.log('  Sesler:', voices.map((v) => `${v.name} (${v.voice_id})`).join(' · '));
        return voices[0].voice_id;
      }
    }
  } catch { /* fall through */ }
  console.log(`  Varsayılan: Sarah (${PREMADE.Sarah})`);
  return PREMADE.Sarah;
}

async function transcribe(mp3) {
  const url = new URL('https://api.deepgram.com/v1/listen');
  url.searchParams.set('model', 'nova-3');
  url.searchParams.set('language', 'tr');
  url.searchParams.set('smart_format', 'true');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Token ${DG_KEY}`, 'Content-Type': 'audio/mpeg' },
    body: mp3,
  });
  if (!res.ok) throw new Error(`Deepgram ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
}

async function backCheck(mp3, said) {
  if (!DG_KEY) { console.log('ℹ️  DEEPGRAM_API_KEY yok — geri-dinleme atlandı.\n'); return; }
  console.log('🔁  Deepgram Nova-3 (ses → yazı):');
  const heard = await transcribe(mp3);
  console.log(`  Söylenen : ${said}`);
  console.log(`  Duyulan  : ${heard}`);
  console.log(`  ${heard.trim().length > 8 ? '✅ STT çalışıyor' : '⚠️  boş/kısa çıktı'}\n`);
}

// ── modes ────────────────────────────────────────────────────────────────────
async function modeModels() {
  const voiceId = process.env.ELEVENLABS_VOICE_ID || PREMADE.Sarah;
  const line = 'Bir saniye, ee, niye vereyim ki o kodu size? Bankalar öyle şey istemez ki? Kusura bakmayın.';
  const models = ['eleven_turbo_v2_5', 'eleven_flash_v2_5', 'eleven_v3_conversational', 'eleven_multilingual_v2', 'eleven_v3'];
  const dir = join(ROOT, 'models');
  await mkdir(dir, { recursive: true });
  console.log(`\n🎛️  Model karşılaştırması — ses ${voiceId}\n`);
  for (const m of models) {
    const t0 = Date.now();
    try {
      await writeFile(join(dir, `${m}.mp3`), await synth(voiceId, line, m));
      console.log(`  ✔ ${m.padEnd(26)} ${Date.now() - t0}ms`);
    } catch (e) {
      console.log(`  ✖ ${m.padEnd(26)} ${e.message.slice(0, 80)}`);
    }
  }
  console.log(`\n📂  ${dir}  — sırayla dinle. Canlı arama için turbo/flash; en insan = v3_conversational (biraz yavaş).\n`);
}

async function modeLines() {
  const dir = ROOT;
  await mkdir(dir, { recursive: true });
  console.log(`\n🎙️  ElevenLabs (${EL_MODEL}) — Türkçe\n`);
  const voiceId = await firstAccountVoice();
  console.log(`  Ses: ${voiceId}\n`);
  let first;
  for (const [name, text] of GUARD_LINES) {
    const mp3 = await synth(voiceId, text);
    await writeFile(join(dir, `${name}.mp3`), mp3);
    console.log(`  ✔ ${name}.mp3  ·  "${text}"`);
    first ??= { mp3, text };
  }
  console.log(`\n📂  ${dir}\n`);
  await backCheck(first.mp3, first.text);
}

async function modeVoices() {
  const ids = process.argv.slice(3);
  const dir = join(ROOT, 'sesler');
  await mkdir(dir, { recursive: true });

  // one short, natural "rattled older person" line — enough to judge the tone
  const SAMPLE =
    'Bir dakika, ee, ben pek anlamadım. Siz hangi bankadan arıyordunuz, bir daha söyler misiniz?';

  /** @type {Array<[string,string]>} name, id */
  let set;
  if (ids.length) {
    set = ids.map((id) => [id.slice(0, 10), id]);
  } else {
    // every voice on the account (works with an unrestricted key)
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': EL_KEY } });
      if (!res.ok) throw new Error(String(res.status));
      const { voices = [] } = await res.json();
      set = voices.map((v) => [v.name, v.voice_id]);
    } catch {
      console.log('  (hesap ses listesi alınamadı — hazır 4 sesi deniyorum)');
      set = Object.entries(PREMADE);
    }
  }

  console.log(`\n🎙️  ${set.length} ses — "${EL_MODEL}", Türkçe örnek cümle\n`);
  const rows = [];
  for (const [name, voiceId] of set) {
    const safe = name.replace(/[^\w.-]+/g, '_');
    try {
      await writeFile(join(dir, `${safe}__${voiceId}.mp3`), await synth(voiceId, SAMPLE));
      console.log(`  ✔ ${name.padEnd(18)} ${voiceId}`);
      rows.push([name, voiceId]);
    } catch (e) {
      console.log(`  ✖ ${name.padEnd(18)} ${e.message.slice(0, 60)}`);
    }
  }
  console.log(`\n📂  ${dir}`);
  console.log('    Hepsini dinle. Beğendiğinin dosya adındaki "__" sonrası ID\'dir.');
  console.log('    O ID\'yi baslat.ps1 içindeki ELEVENLABS_VOICE_ID satırına yapıştır.\n');
}

async function modeCall() {
  const scenario = process.argv[3] || 'slowBank';
  const turns = scenario === 'slowBank' ? SLOW_BANK : SCAM_CALLS[scenario];
  if (!turns) {
    console.error(`bilinmeyen senaryo: ${scenario}  (slowBank, ${Object.keys(SCAM_CALLS).join(', ')})`);
    process.exit(1);
  }
  const aiVoice = process.env.ELEVENLABS_VOICE_ID || PREMADE.Sarah;
  const callerVoice = process.env.ELEVENLABS_CALLER_VOICE_ID || PREMADE.Brian;
  const llm = llmPolishFromEnv(); // set LLM_PROVIDER + key for the hybrid version
  const dir = join(ROOT, `call-${scenario}${llm ? '-hibrit' : ''}`);
  await mkdir(dir, { recursive: true });

  console.log(`\n📞  Tüm arama: "${scenario}"${llm ? '  (hibrit: kural + LLM)' : ''}\n`);
  const call = new GuardCall(scenario);
  let n = 1;
  const pad = (i) => String(i).padStart(2, '0');

  await writeFile(join(dir, `${pad(n)}-ai.mp3`), await synth(aiVoice, call.opening));
  console.log(`  ${pad(n++)}  AI     ▸ ${call.opening}`);

  for (const turn of turns) {
    const r = call.callerSaid(turn);
    await writeFile(join(dir, `${pad(n)}-arayan.mp3`), await synth(callerVoice, turn));
    console.log(`  ${pad(n++)}  Arayan ▸ ${turn}`);

    const tx = call.summary().transcript;
    const line = humanize(llm ? await llm(r.reply, { transcript: tx }) : r.reply, { transcript: tx });
    await writeFile(join(dir, `${pad(n)}-ai.mp3`), await synth(aiVoice, line));
    console.log(`  ${pad(n++)}  AI     ▸ ${line}   [risk ${r.risk}]`);
    if (r.action === 'end') break;
  }
  console.log(`\n📂  ${dir}\n    Dosyaları sırayla çal — dolandırıcı ile AI'ın tüm konuşması.\n`);
}

// ── run ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!EL_KEY) throw new Error('ELEVENLABS_API_KEY yok — ortam değişkeni olarak ver.');
  const mode = process.argv[2];
  if (mode === 'voices') return modeVoices();
  if (mode === 'models') return modeModels();
  if (mode === 'call') return modeCall();
  return modeLines();
}

main().catch((err) => { console.error(`\n❌ ${err.message}\n`); process.exit(1); });
