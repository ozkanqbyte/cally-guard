/**
 * Voiceprint matcher accuracy eval — the number that tells you the real
 * false-positive vs false-negative tradeoff, which 2 test recordings can't.
 *
 * Feed it a directory of labelled clips:
 *
 *   sim/voices/
 *     ahmet/1.wav  ahmet/2.wav  ahmet/3.wav
 *     ayse/1.wav   ayse/2.wav
 *     mehmet/1.m4a ...
 *
 * (≥5 speakers, ≥2 clips each; short — 5-15s of speech. Real phone recordings
 * beat studio audio: the matcher runs on 8 kHz telephone speech in production.)
 *
 *   node services/guard/sim/voiceprint-eval.mjs sim/voices
 *   node services/guard/sim/voiceprint-eval.mjs sim/voices --no-degrade
 *
 * It telephone-degrades each clip (8 kHz, μ-law round-trip — matches the SIP
 * path) via ffmpeg, embeds every clip through the voiceprint service /embed,
 * then reports:
 *   - same-speaker vs different-speaker cosine distributions
 *   - EER (equal error rate) and the cosine at that point
 *   - the threshold for a target false-accept rate (default 0.1%) and what the
 *     miss rate would be there
 *   - how the CURRENT VP_JOIN (0.55) scores on this set
 */
import { readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = process.argv[2];
const DEGRADE = !process.argv.includes('--no-degrade');
const VP_URL = process.env.VP_URL || 'http://127.0.0.1:8090';
const TARGET_FAR = Number(process.env.TARGET_FAR || 0.001);
const CURRENT_JOIN = Number(process.env.VP_JOIN || 0.55);
const AUDIO_EXT = new Set(['.wav', '.mp3', '.m4a', '.ogg', '.flac', '.aac', '.opus']);

if (!DIR) {
  console.error('usage: node sim/voiceprint-eval.mjs <dir with <speaker>/<clip> audio>');
  process.exit(2);
}

function listSpeakers(root) {
  const out = [];
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    if (!statSync(p).isDirectory()) continue;
    const clips = readdirSync(p)
      .filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()))
      .map((f) => join(p, f));
    if (clips.length) out.push({ speaker: name, clips });
  }
  return out;
}

function telephoneDegrade(src, workdir, i) {
  const dst = join(workdir, `d${i}.wav`);
  // 8 kHz mono, μ-law encode+decode (the SIP codec), back to 16 kHz PCM which is
  // what the service resamples to anyway. A light highpass/lowpass mimics the
  // phone band.
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', src,
    '-ac', '1', '-ar', '8000',
    '-af', 'highpass=f=300,lowpass=f=3400',
    '-c:a', 'pcm_mulaw', '-f', 'wav', join(workdir, `m${i}.wav`),
  ]);
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', join(workdir, `m${i}.wav`),
    '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', dst,
  ]);
  return dst;
}

async function embed(path) {
  const buf = await readFile(path);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'clip.wav');
  const r = await fetch(`${VP_URL}/embed`, { method: 'POST', body: fd }).then((x) => x.json());
  if (!r.vec) throw new Error(`embed failed for ${path}: ${JSON.stringify(r)}`);
  return Float64Array.from(r.vec);
}

const cos = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d; // service returns L2-normalised vectors
};

const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

(async () => {
  try {
    await fetch(`${VP_URL}/health`).then((r) => r.json());
  } catch {
    console.error(`voiceprint service not reachable at ${VP_URL} — start it or set VP_URL`);
    process.exit(1);
  }

  const speakers = listSpeakers(DIR);
  if (speakers.length < 2) {
    console.error(`need >= 2 speaker folders under ${DIR}, found ${speakers.length}`);
    process.exit(2);
  }
  const totalClips = speakers.reduce((n, s) => n + s.clips.length, 0);
  console.log(`\nvoiceprint accuracy eval — ${speakers.length} speakers, ${totalClips} clips, degrade=${DEGRADE}\n`);

  const work = mkdtempSync(join(tmpdir(), 'vpeval-'));
  const vecs = []; // { speaker, vec }
  let idx = 0;
  try {
    for (const s of speakers) {
      for (const clip of s.clips) {
        const path = DEGRADE ? telephoneDegrade(clip, work, idx++) : clip;
        try {
          vecs.push({ speaker: s.speaker, vec: await embed(path) });
          process.stdout.write('.');
        } catch (e) {
          process.stdout.write('x');
          console.error(`\n  ${clip}: ${e.message}`);
        }
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log('\n');

  const same = [];
  const diff = [];
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      const c = cos(vecs[i].vec, vecs[j].vec);
      (vecs[i].speaker === vecs[j].speaker ? same : diff).push(c);
    }
  }
  if (!same.length || !diff.length) {
    console.error('not enough pairs — need >=2 clips for at least one speaker and >=2 speakers');
    process.exit(2);
  }

  // sweep thresholds
  let eer = { t: 0, v: 1 };
  let farTarget = null;
  for (let t = 0.20; t <= 0.95; t += 0.005) {
    const far = diff.filter((c) => c >= t).length / diff.length;   // different speakers wrongly matched
    const frr = same.filter((c) => c < t).length / same.length;    // same speaker missed
    if (Math.abs(far - frr) < eer.v) eer = { t, v: Math.abs(far - frr), far, frr };
    if (farTarget === null && far <= TARGET_FAR) farTarget = { t, far, frr };
  }
  const curFar = diff.filter((c) => c >= CURRENT_JOIN).length / diff.length;
  const curFrr = same.filter((c) => c < CURRENT_JOIN).length / same.length;

  const f = (x) => (x * 100).toFixed(2) + '%';
  console.log(`same-speaker  cosine   mean ${mean(same).toFixed(3)}   p05 ${pct(same, 0.05).toFixed(3)}   min ${Math.min(...same).toFixed(3)}   (n=${same.length})`);
  console.log(`diff-speaker  cosine   mean ${mean(diff).toFixed(3)}   p95 ${pct(diff, 0.95).toFixed(3)}   max ${Math.max(...diff).toFixed(3)}   (n=${diff.length})`);
  console.log();
  console.log(`EER                 ${f(eer.v ? (eer.far + eer.frr) / 2 : 0)}  at cosine ${eer.t.toFixed(3)}   (false-accept ${f(eer.far)}, miss ${f(eer.frr)})`);
  if (farTarget) {
    console.log(`target ${f(TARGET_FAR)} FA   at cosine ${farTarget.t.toFixed(3)}   → miss rate ${f(farTarget.frr)}`);
  } else {
    console.log(`target ${f(TARGET_FAR)} FA   not reachable on this set (need more / harder negatives)`);
  }
  console.log();
  console.log(`CURRENT VP_JOIN ${CURRENT_JOIN.toFixed(2)}   → false-accept ${f(curFar)}   miss ${f(curFrr)}`);
  console.log();
  const rec = farTarget ? farTarget.t : eer.t;
  console.log(`recommendation: ${Math.abs(rec - CURRENT_JOIN) < 0.03 ? 'VP_JOIN is about right' : `set VP_JOIN ≈ ${rec.toFixed(2)}`}`);
  console.log('note: synthetic / studio voices give an optimistic EER — real phone recordings are the real test.\n');
})();
