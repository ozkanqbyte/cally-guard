/**
 * Real text-to-speech adapter: Cartesia (low-latency Turkish).
 *
 * Same surface as `FakeTts` - `.speak(text) -> { audio, durationMs }`. Not
 * covered by the test suite (needs CARTESIA_API_KEY). Deepgram Aura or
 * ElevenLabs slot in the same way; only the request body changes.
 *
 *   const tts = new CartesiaTts({ apiKey: process.env.CARTESIA_API_KEY, voiceId });
 *   agent = new VoiceAgent({ tts, ... });   // agent.speak() -> plays on the call
 */
export class CartesiaTts {
  constructor({ apiKey, voiceId, sampleRate = 16000, model = 'sonic-2' } = {}) {
    if (!apiKey || !voiceId) throw new Error('CartesiaTts: apiKey and voiceId required');
    this._apiKey = apiKey;
    this._voiceId = voiceId;
    this._sampleRate = sampleRate;
    this._model = model;
  }

  /**
   * @param {string} text
   * @returns {Promise<{ audio: ArrayBuffer, durationMs: number }>}
   */
  async speak(text) {
    const res = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Cartesia-Version': '2024-11-13',
        'X-API-Key': this._apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: this._model,
        transcript: text,
        language: 'tr',
        voice: { mode: 'id', id: this._voiceId },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: this._sampleRate,
        },
      }),
    });
    if (!res.ok) throw new Error(`Cartesia TTS ${res.status}: ${await res.text()}`);
    const audio = await res.arrayBuffer();
    const samples = audio.byteLength / 2;
    return { audio, durationMs: Math.round((samples / this._sampleRate) * 1000) };
  }
}
