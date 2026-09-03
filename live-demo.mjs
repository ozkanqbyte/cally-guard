/**
 * Live AI Guard — talk to it like a scammer would, right now, no phone line.
 *
 * You speak (browser mic, Turkish) or type; the real engine scores the call,
 * decides what to say, an optional LLM rephrases it, ElevenLabs speaks it back.
 * This is the whole decision + voice loop — everything except the telephony.
 *
 *   $env:ELEVENLABS_API_KEY = "sk_..."
 *   $env:GEMINI_API_KEY     = "AIza..."     # optional (hybrid rewrite)
 *   node services/guard/live-demo.mjs
 *   → open  http://localhost:8790  in Chrome
 *
 * Speech-to-text runs in the browser (Web Speech API). No STT key needed.
 * Text input always works.
 */
import './src/dotenv.mjs'; // load services/guard/.env so no keys on the command line
import { createServer } from 'node:http';
import { GuardCall } from './src/guard/session.mjs';
import { humanize } from './src/agent/humanize.mjs';
import { llmConverseFromEnv } from './src/agent/providers/llm-polish.mjs';

const PORT = process.env.PORT || 8790;
const EL_KEY = process.env.ELEVENLABS_API_KEY;
const EL_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';
const EL_VOICE = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // premade "Sarah"

// Conversational LLM (Gemini/OpenAI/Claude — auto from whichever key is set).
// The rules still decide the move + when to hang up + the safety net; the LLM
// writes the actual sentence so it feels like a real conversation.
const converse = llmConverseFromEnv();

/** @type {Map<string, GuardCall>} */
const sessions = new Map();
function session(id) {
  let c = sessions.get(id);
  if (!c) { c = new GuardCall(id, { mode: 'inbound' }); sessions.set(id, c); }
  return c;
}
const BANDS = { low: 'düşük', elevated: 'orta', high: 'yüksek', severe: 'çok yüksek' };

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}

let llmOk = null; // null = untested; true/false after the startup health check

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(PAGE);
  }

  if (url.pathname === '/config') {
    res.writeHead(200, { 'content-type': 'application/json', ...cors });
    return res.end(JSON.stringify({ voice: !!EL_KEY, model: EL_MODEL, llm: !!converse && llmOk !== false }));
  }

  if (url.pathname === '/open' && req.method === 'POST') {
    const { id } = await readBody(req);
    sessions.delete(id);
    const c = session(id);
    res.writeHead(200, { 'content-type': 'application/json', ...cors });
    return res.end(JSON.stringify({ reply: c.opening, risk: 0, band: 'düşük', ended: false }));
  }

  if (url.pathname === '/turn' && req.method === 'POST') {
    const { id, text } = await readBody(req);
    const c = session(id);
    let out;
    try {
      const r = c.callerSaid(String(text || ''));
      const tx = c.summary().transcript;
      let line;
      if (converse) {
        line = await converse({
          callerText: String(text || ''), move: r.move, risk: r.risk,
          scamType: r.reasons[0]?.label, transcript: tx, fallback: r.reply,
        });
      } else {
        line = humanize(r.reply, { transcript: tx });
      }
      out = {
        reply: line, risk: r.risk, band: BANDS[r.band] || r.band,
        reasons: r.reasons.map((x) => x.label), ended: r.action === 'end',
      };
    } catch {
      out = { reply: 'Görüşmeyi burada bitirelim. İyi günler.', risk: 100, band: 'çok yüksek', ended: true };
    }
    res.writeHead(200, { 'content-type': 'application/json', ...cors });
    return res.end(JSON.stringify(out));
  }

  if (url.pathname === '/tts' && req.method === 'POST') {
    const { text } = await readBody(req);
    if (!EL_KEY) { res.writeHead(400, { ...cors, 'content-type': 'text/plain' }); return res.end('ELEVENLABS_API_KEY yok'); }
    try {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': EL_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({
            text: String(text || ''),
            model_id: EL_MODEL,
            ...(EL_MODEL.startsWith('eleven_v3') ? {} : { language_code: 'tr' }),
            voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.2, speed: 0.95 },
          }),
        },
      );
      if (!r.ok) { res.writeHead(502, { ...cors, 'content-type': 'text/plain' }); return res.end(`ElevenLabs ${r.status}: ${await r.text()}`); }
      res.writeHead(200, { 'content-type': 'audio/mpeg', ...cors });
      return res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(502, { ...cors, 'content-type': 'text/plain' }); return res.end(String(e.message));
    }
  }

  res.writeHead(404, cors); res.end('not found');
});

async function checkKeys() {
  if (converse) {
    try {
      const probe = await converse({
        callerText: 'Merhaba, bankadan arıyorum.', move: 'probe', risk: 0,
        transcript: [], fallback: 'Buyurun?',
      });
      llmOk = typeof probe === 'string' && probe.length > 0 && probe !== 'Buyurun?';
    } catch { llmOk = false; }
  }
  if (EL_KEY) {
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}?output_format=mp3_44100_128`, {
        method: 'POST', headers: { 'xi-api-key': EL_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'test', model_id: EL_MODEL, language_code: 'tr' }),
      });
      if (!r.ok) console.log(`  ⚠️  ElevenLabs anahtarı çalışmadı (${r.status}) — anahtarı tam kopyaladın mı?`);
    } catch { /* offline */ }
  }
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  ❌ Port ${PORT} meşgul — eski bir "node live-demo.mjs" penceresi hâlâ açık.`);
    console.error(`     Onu kapat, ya da:  $env:PORT="8791"; node live-demo.mjs\n`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, async () => {
  await checkKeys();
  const llmLine = !converse ? 'YOK — GEMINI_API_KEY ver (şimdilik sadece kural cümleleri)'
    : llmOk === false ? '⚠️  anahtar var ama BAĞLANAMADI — GEMINI_API_KEY tam mı? (AIza… ile başlar, ~39 karakter)'
    : 'açık — sohbet modu (kural karar verir, Gemini konuşur)';
  console.log(`\n  Cally AI Guard — canlı demo`);
  console.log(`  →  http://localhost:${PORT}   (Chrome'da aç)`);
  console.log(`  ses:  ${EL_KEY ? 'ElevenLabs ' + EL_MODEL : 'YOK — ELEVENLABS_API_KEY ver (şimdilik sadece yazı)'}`);
  console.log(`  LLM:  ${llmLine}\n`);
});

const PAGE = /* html */ `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Cally AI Guard — canlı</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0a0a0f;color:#f7f7fa;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;min-height:100vh}
.wrap{width:100%;max-width:520px;margin:0 auto;padding:24px 18px 48px}
h1{font-size:18px;font-weight:800;letter-spacing:-.02em;margin:.2rem 0 .1rem;display:flex;align-items:center;gap:9px}
.mark{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#4c6bff,#9e4bff);display:grid;place-items:center;font-size:14px}
.sub{color:#86868f;font-size:12.5px;margin:0 0 14px}
.pill{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.06em;padding:3px 9px;border-radius:99px;background:#17171f;border:1px solid #26262e;color:#9a9aa8;margin:0 6px 14px 0}
.pill.on{color:#34d399;border-color:#1c3a2e}
.pill.off{color:#f8b4a0;border-color:#3a1f1c}
.gauge{height:8px;border-radius:99px;background:#1a1a21;overflow:hidden;margin:6px 0 6px}
.fill{height:100%;width:0;background:linear-gradient(90deg,#4c6bff,#9e4bff);transition:width .4s}
.risk{display:flex;justify-content:space-between;font-size:12px;color:#9a9aa8;font-variant-numeric:tabular-nums}
.log{margin:16px 0;display:flex;flex-direction:column;gap:10px;min-height:200px}
.b{max-width:82%;padding:9px 13px;border-radius:14px;font-size:14.5px;line-height:1.4}
.b.ai{align-self:flex-end;background:linear-gradient(120deg,#4c6bff,#9e4bff)}
.b.me{align-self:flex-start;background:#17171f;border:1px solid #26262e}
.b .who{font-size:8px;font-weight:800;letter-spacing:1px;opacity:.75;margin-bottom:3px}
.sig{align-self:flex-start;font-size:11px;color:#f8b4a0}
.err{align-self:center;font-size:11.5px;color:#f8b4a0;background:#1e1214;border:1px solid #3a1f1c;padding:6px 10px;border-radius:10px}
.row{display:flex;gap:8px;margin-top:10px}
input{flex:1;background:#141419;border:1px solid #292930;color:#f7f7fa;border-radius:12px;padding:12px 14px;font:inherit}
input:focus{outline:2px solid #6a4be0}
button{border:0;border-radius:12px;font:inherit;font-weight:700;padding:12px 16px;cursor:pointer;color:#fff}
button:disabled{opacity:.5}
.send{background:linear-gradient(120deg,#4c6bff,#9e4bff)}
.mic{background:#17171f;border:1px solid #292930;min-width:54px}
.mic.on{background:#e0483a;border-color:#e0483a}
.bar{display:flex;gap:8px;margin-top:14px}
.ghost{background:#141419;border:1px solid #292930;color:#b6b6c2;font-weight:600;flex:1}
.hint{font-size:11.5px;color:#54545f;margin-top:14px}
.ended{text-align:center;color:#34d399;font-weight:700;margin-top:12px}
.gate{position:fixed;inset:0;background:#0a0a0f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:30px;text-align:center;z-index:9}
.gate h2{font-size:20px;font-weight:800;margin:0}
.gate p{color:#86868f;font-size:13px;margin:0;max-width:340px}
.gate button{background:linear-gradient(120deg,#4c6bff,#9e4bff);font-size:16px;padding:14px 28px;border-radius:16px;margin-top:8px}
</style></head><body>
<div class="gate" id="gate">
  <div class="mark" style="width:52px;height:52px;font-size:26px">🛡️</div>
  <h2>Cally AI Guard — canlı</h2>
  <p>Dolandırıcı gibi konuş ya da yaz. Yapay zeka seni gerçek motorla oyalayacak, sesle cevap verecek. Telefon hattı yok.</p>
  <button id="start">Aramayı başlat</button>
  <p style="font-size:11px;color:#54545f">Ses için tıklama gerekli (tarayıcı kuralı). Mikrofon = Chrome.</p>
</div>

<div class="wrap">
<h1><span class="mark">🛡️</span> Cally AI Guard — canlı</h1>
<p class="sub">Dolandırıcı gibi konuş. AI seni oyalasın.</p>
<div id="pills"></div>
<div class="gauge"><div class="fill" id="fill"></div></div>
<div class="risk"><span id="band">risk: düşük</span><span id="score">0/100</span></div>
<div class="log" id="log"></div>
<div id="ended" class="ended" style="display:none">Arama Cally tarafından sonlandırıldı.</div>
<div class="row">
  <button class="mic" id="mic" title="Bas konuş">🎙️</button>
  <input id="in" placeholder="Yaz: bankadan arıyorum, kodu okuyun…" autocomplete="off">
  <button class="send" id="send">Gönder</button>
</div>
<div class="bar"><button class="ghost" id="reset">Yeniden başlat</button></div>
<p class="hint" id="hint"></p>
</div>

<script>
const id = 'live-' + Math.random().toString(36).slice(2);
const $ = s => document.querySelector(s);
const log = $('#log');
let ended = false, busy = false, started = false, cfg = { voice:false, llm:false };

function esc(s){ return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function bubble(who, text, cls){
  const d = document.createElement('div'); d.className = 'b ' + cls;
  d.innerHTML = '<div class="who">'+who+'</div>'+esc(text);
  log.appendChild(d); d.scrollIntoView({block:'end'});
}
function note(cls, text){ const d=document.createElement('div'); d.className=cls; d.textContent=text; log.appendChild(d); d.scrollIntoView({block:'end'}); }
function setRisk(score, band){ $('#fill').style.width=Math.max(2,score)+'%'; $('#score').textContent=score+'/100'; $('#band').textContent='risk: '+band; }

async function say(text){
  if(!cfg.voice) return;
  try{
    const r = await fetch('/tts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});
    if(!r.ok){ note('err', 'ses hatası: ' + (await r.text()).slice(0,120)); return; }
    const a = new Audio(URL.createObjectURL(await r.blob()));
    await a.play().catch(e => note('err','ses çalınamadı: '+e.message));
  }catch(e){ note('err','ses hatası: '+e.message); }
}
async function open(){
  log.innerHTML=''; ended=false; $('#ended').style.display='none'; setRisk(0,'düşük'); $('#send').disabled=false;
  const r = await (await fetch('/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})})).json();
  bubble('CALLY AI', r.reply, 'ai'); say(r.reply);
}
async function turn(text){
  if(!text.trim() || ended || busy || !started) return;
  busy=true; $('#send').disabled=true;
  bubble('SEN (dolandırıcı)', text, 'me');
  try{
    const r = await (await fetch('/turn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,text})})).json();
    setRisk(r.risk, r.band);
    if(r.reasons && r.reasons.length) note('sig', '⚑ '+r.reasons.join(' · '));
    bubble('CALLY AI', r.reply, 'ai'); await say(r.reply);
    if(r.ended){ ended=true; $('#ended').style.display='block'; }
  }catch(e){ note('err','bağlantı hatası: '+e.message); }
  busy=false; $('#send').disabled=ended; $('#in').focus();
}

$('#send').onclick = () => { const v=$('#in').value; $('#in').value=''; turn(v); };
$('#in').onkeydown = e => { if(e.key==='Enter'){ const v=$('#in').value; $('#in').value=''; turn(v); } };
$('#reset').onclick = open;

// mic
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if(SR){
  const rec = new SR(); rec.lang='tr-TR'; rec.interimResults=false; rec.maxAlternatives=1;
  let listening=false;
  $('#mic').onclick = () => { if(!started) return; if(listening){ rec.stop(); return; } try{ rec.start(); }catch(e){} };
  rec.onstart = () => { listening=true; $('#mic').classList.add('on'); $('#mic').textContent='●'; };
  rec.onend = () => { listening=false; $('#mic').classList.remove('on'); $('#mic').textContent='🎙️'; };
  rec.onresult = e => { const t=e.results[0][0].transcript; if(t) turn(t); };
  rec.onerror = ev => { listening=false; $('#mic').classList.remove('on'); $('#mic').textContent='🎙️'; if(ev.error==='not-allowed') note('err','mikrofon izni gerekli'); };
} else {
  $('#mic').style.display='none';
}

async function boot(){
  try{ cfg = await (await fetch('/config')).json(); }catch(e){}
  $('#pills').innerHTML =
    (cfg.voice ? '<span class="pill on">SES: '+cfg.model+'</span>' : '<span class="pill off">SES YOK — ELEVENLABS_API_KEY ver</span>') +
    (cfg.llm ? '<span class="pill on">SOHBET: Gemini</span>' : '<span class="pill">SOHBET: kapalı (hazır cümleler)</span>');
  $('#hint').textContent = (SR ? 'Mikrofon butonuna bas, Türkçe konuş. ' : 'Bu tarayıcı mikrofon tanımıyor — yaz. ') + 'Yazı her zaman çalışır.';
}
$('#start').onclick = () => {
  started = true;
  // unlock audio inside the user gesture
  try{ new Audio().play().catch(()=>{}); }catch(e){}
  $('#gate').style.display='none';
  open();
  $('#in').focus();
};
boot();
</script></body></html>`;
