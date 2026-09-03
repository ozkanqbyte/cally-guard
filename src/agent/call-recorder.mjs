import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Optional evidence recorder for the AI Guard.
 *
 * Off unless `GUARD_RECORD_DIR` is set. Even then it only keeps audio for calls
 * that the engine flags as a scam (`arm()` is called when risk crosses the bar),
 * caps the clip, and writes one mono 16-bit WAV. In production point
 * `GUARD_RECORD_DIR` at a mounted bucket (R2/S3) and run a lifecycle rule that
 * deletes objects after ~15 days — the clip is for a police report or a short
 * "caught a scammer" cut, nothing else. Caller-side audio only; no user audio,
 * no transcription here (that is the STT's job).
 *
 *   const rec = CallRecorder.fromEnv(callId);        // null when disabled
 *   pcmSource.on('data', (buf) => rec?.write(buf));
 *   // when risk is high:
 *   rec?.arm();
 *   // on hang-up:
 *   await rec?.finish();
 */
export class CallRecorder {
  /**
   * @param {Object} o
   * @param {string} o.dir            directory / mount to write into
   * @param {string} o.callId
   * @param {number} [o.sampleRate]   default 16000 (the worker's PCM rate)
   * @param {number} [o.maxSeconds]   hard cap, default 240
   */
  constructor({ dir, callId, sampleRate = 16000, maxSeconds = 240 }) {
    this._dir = dir;
    this._callId = String(callId || 'call').replace(/[^\w.-]+/g, '_');
    this._rate = sampleRate;
    this._maxBytes = maxSeconds * sampleRate * 2; // 16-bit mono
    /** @type {Buffer[]} */ this._chunks = [];
    this._bytes = 0;
    this._armed = false;
    this._done = false;
  }

  static fromEnv(callId, env = process.env) {
    if (!env.GUARD_RECORD_DIR) return null;
    return new CallRecorder({
      dir: env.GUARD_RECORD_DIR,
      callId,
      sampleRate: Number(env.GUARD_RECORD_RATE || 16000),
      maxSeconds: Number(env.GUARD_RECORD_MAX_SECONDS || 240),
    });
  }

  /** Buffer PCM. Cheap no-op after the cap or after finish(). */
  write(buf) {
    if (this._done || this._bytes >= this._maxBytes || !buf?.length) return;
    this._chunks.push(Buffer.from(buf));
    this._bytes += buf.length;
  }

  /** Keep this recording — the call turned out to be a scam. */
  arm() {
    this._armed = true;
  }

  /**
   * Write the WAV if armed, otherwise drop everything. Returns the file path or
   * null. Safe to call more than once.
   */
  async finish() {
    if (this._done) return null;
    this._done = true;
    const chunks = this._chunks;
    this._chunks = [];
    if (!this._armed || !this._bytes) return null;

    const pcm = Buffer.concat(chunks, this._bytes);
    const wav = wrapWav(pcm, this._rate);
    const path = join(this._dir, `guard-${this._callId}-${this._bytes}.wav`);
    try {
      await mkdir(this._dir, { recursive: true });
      await writeFile(path, wav);
      return path;
    } catch {
      return null; // storage not mounted / permission — never break the call
    }
  }
}

/** Minimal RIFF/WAVE header + PCM body. Mono, 16-bit. */
function wrapWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // channels
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
