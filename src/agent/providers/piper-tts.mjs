/**
 * Free text-to-speech adapter: self-hosted Piper (Turkish voice).
 *
 * Same surface as `FakeTts` — `.speak(text) -> { audio, durationMs }`. Costs $0,
 * runs on CPU faster than real-time, sounds "clearly synthetic but natural
 * enough" — which is fine, even helpful, for a bot that is pretending to be a
 * slightly distracted person. Not covered by `npm test` — needs the Piper HTTP
 * service (e.g. the `rhasspy/wyoming-piper` container behind a tiny HTTP shim,
 * or `piper` compiled with `--http`).
 */
const SAMPLE_RATE = 22050; // native rate of tr_TR-dfki-medium (see piper-voice/*.onnx.json)

export class PiperTts {
  constructor({ baseUrl = 'http://piper:5000', voice = 'tr_TR-fahrettin-medium' } = {}) {
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._voice = voice;
    this.sampleRate = SAMPLE_RATE;
  }

  /**
   * @param {string} text
   * @returns {Promise<{ audio: Uint8Array, durationMs: number }>}  raw s16le PCM @16kHz
   */
  async speak(text) {
    const res = await fetch(`${this._baseUrl}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: this._voice, sample_rate: SAMPLE_RATE }),
    });
    if (!res.ok) throw new Error(`Piper TTS ${res.status}: ${await res.text()}`);

    const raw = new Uint8Array(await res.arrayBuffer());
    // Piper returns a WAV; strip the 44-byte header to get playable PCM.
    const audio = raw.length > 44 && String.fromCharCode(...raw.slice(0, 4)) === 'RIFF'
      ? raw.slice(44)
      : raw;
    const durationMs = Math.round((audio.length / 2 / SAMPLE_RATE) * 1000);
    return { audio, durationMs };
  }
}
