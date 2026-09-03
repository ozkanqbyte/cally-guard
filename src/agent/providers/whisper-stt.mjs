/**
 * Free speech-to-text adapter: self-hosted Whisper (faster-whisper-server).
 *
 * Same surface as `FakeStt` — `.on('final', text)` / `.on('hangup')`. Costs
 * $0 per minute; the price is latency (a few hundred ms more than Deepgram) and
 * you run the container. Not covered by `npm test` — needs the Whisper service.
 *
 * Strategy: buffer inbound PCM, cut a segment on ~700 ms of silence, POST that
 * segment to the OpenAI-compatible `/v1/audio/transcriptions` endpoint, emit the
 * text as a `final`. Good enough for a scam-baiting bot; swap in a streaming
 * endpoint later if you want it snappier.
 */
import { HOT_WORDS } from '../../detection/lexicon.mjs';

const SAMPLE_RATE = 16000;
const SILENCE_RMS = 0.012;
const SILENCE_MS = 700;
const MIN_SEGMENT_MS = 600;
const MAX_SEGMENT_MS = 12000;

export class WhisperStt {
  constructor({
    baseUrl = 'http://whisper:8000',
    model = 'Systran/faster-whisper-small',
    language = 'tr',
    hotWords = HOT_WORDS,
  } = {}) {
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._model = model;
    this._language = language;
    // Whisper takes a free-text "initial prompt" — priming it with the likely
    // vocabulary measurably cuts errors on those exact words.
    this._prompt = `Dolandırıcılık çağrısı. Geçebilecek terimler: ${hotWords.join(', ')}.`;
    this._handlers = { final: [], hangup: [], partial: [] };
    /** @type {number[]} */ this._buf = [];
    this._silentMs = 0;
    this._voicedMs = 0;
    this._closed = false;
  }

  on(event, handler) {
    (this._handlers[event] ??= []).push(handler);
    return this;
  }

  _emit(event, arg) {
    for (const h of this._handlers[event] ?? []) h(arg);
  }

  /** @param {{on:(e:'data'|'end',cb:Function)=>void}} audioSource  16 kHz mono s16le PCM */
  attach(audioSource) {
    audioSource.on('data', (chunk) => this._onPcm(chunk));
    audioSource.on('end', () => this.close());
  }

  _onPcm(buffer) {
    if (this._closed) return;
    const view = new Int16Array(
      buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 2),
    );
    let sumSq = 0;
    for (let i = 0; i < view.length; i++) {
      const s = view[i] / 32768;
      sumSq += s * s;
      this._buf.push(view[i]);
    }
    const rms = Math.sqrt(sumSq / Math.max(1, view.length));
    const frameMs = (view.length / SAMPLE_RATE) * 1000;

    if (rms < SILENCE_RMS) {
      this._silentMs += frameMs;
    } else {
      this._silentMs = 0;
      this._voicedMs += frameMs;
    }

    const segMs = (this._buf.length / SAMPLE_RATE) * 1000;
    const endOfUtterance = this._silentMs >= SILENCE_MS && this._voicedMs >= MIN_SEGMENT_MS;
    if (endOfUtterance || segMs >= MAX_SEGMENT_MS) this._flush();
  }

  async _flush() {
    if (this._buf.length === 0) return;
    const pcm = Int16Array.from(this._buf);
    this._buf.length = 0;
    this._silentMs = 0;
    this._voicedMs = 0;

    const wav = pcmToWav(pcm, SAMPLE_RATE);
    try {
      const form = new FormData();
      form.append('file', new Blob([wav], { type: 'audio/wav' }), 'seg.wav');
      form.append('model', this._model);
      form.append('language', this._language);
      form.append('prompt', this._prompt);
      form.append('response_format', 'json');
      const res = await fetch(`${this._baseUrl}/v1/audio/transcriptions`, { method: 'POST', body: form });
      if (!res.ok) return;
      const { text } = await res.json();
      const clean = (text ?? '').trim();
      if (clean) this._emit('final', clean);
    } catch {
      /* transient — the next segment tries again */
    }
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    this._flush().finally(() => this._emit('hangup'));
  }
}

/** Minimal 16-bit mono WAV wrapper. */
function pcmToWav(samples, sampleRate) {
  const dataLen = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, dataLen, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i], true);
  return new Uint8Array(buf);
}
