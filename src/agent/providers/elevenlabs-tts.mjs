/**
 * Real text-to-speech adapter: ElevenLabs (most natural Turkish today).
 *
 * Same surface as `FakeTts` / `CartesiaTts` — `.speak(text) -> { audio,
 * durationMs }` — so `VoiceAgent` does not change. Not covered by `npm test`
 * (needs ELEVENLABS_API_KEY); this is the reference you drop in when the media
 * layer exists.
 *
 *   const tts = new ElevenLabsTts({
 *     apiKey:  process.env.ELEVENLABS_API_KEY,
 *     voiceId: process.env.ELEVENLABS_VOICE_ID,   // a Turkish / multilingual voice
 *   });
 *   const agent = new VoiceAgent({ tts, ... });
 *
 * Model pick (measured, tr, one short line, mp3):
 *   eleven_turbo_v2_5        ~450 ms   high quality + low latency   ← default
 *   eleven_flash_v2_5        ~310 ms   fastest, a touch flatter
 *   eleven_v3_conversational ~1.1 s    most human/expressive, GA 2026 — use when
 *                                      the ~1 s beat is acceptable (our bot is
 *                                      deliberately unhurried, so it usually is)
 *   eleven_multilingual_v2  ~950 ms   very life-like, not built for real time
 *   eleven_v3               ~4 s      studio-grade, NOT for live calls
 * `eleven_v3*` auto-detect language — this adapter drops `language_code` for them.
 *
 * Format default `ulaw_8000` = 8 kHz μ-law, the GSM/SIP narrowband codec, so it
 * sounds like a real phone line and drops straight into a Telnyx/LiveKit-SIP
 * leg. Pass `output: 'pcm_16000'` if your media path wants linear PCM.
 */
const FORMATS = {
  ulaw_8000:  { rate: 8000,  bytesPerSample: 1 },
  pcm_8000:   { rate: 8000,  bytesPerSample: 2 },
  pcm_16000:  { rate: 16000, bytesPerSample: 2 },
  pcm_24000:  { rate: 24000, bytesPerSample: 2 },
};

const V3 = /^eleven_v3/;

export class ElevenLabsTts {
  constructor({
    apiKey,
    voiceId,
    model = 'eleven_turbo_v2_5',
    output = 'ulaw_8000',
    language = 'tr',
    // less stability + some style = natural hesitation; speed just under 1 reads
    // as an unhurried, slightly distracted person
    voiceSettings = { stability: 0.4, similarity_boost: 0.8, style: 0.2, speed: 0.95 },
  } = {}) {
    if (!apiKey || !voiceId) throw new Error('ElevenLabsTts: apiKey and voiceId required');
    if (!FORMATS[output]) throw new Error(`ElevenLabsTts: unsupported output "${output}"`);
    this._apiKey = apiKey;
    this._voiceId = voiceId;
    this._model = model;
    this._output = output;
    this._language = language;
    this._voiceSettings = voiceSettings;
  }

  /**
   * @param {string} text
   * @returns {Promise<{ audio: Uint8Array, durationMs: number }>}
   */
  async speak(text) {
    const url = new URL(
      `https://api.elevenlabs.io/v1/text-to-speech/${this._voiceId}/stream`,
    );
    url.searchParams.set('output_format', this._output);
    // start streaming audio before the whole sentence is synthesised
    url.searchParams.set('optimize_streaming_latency', '3');

    const body = {
      text,
      model_id: this._model,
      voice_settings: this._voiceSettings,
    };
    // v3 models auto-detect the language and reject language_code
    if (!V3.test(this._model)) body.language_code = this._language;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this._apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/*',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`);

    const audio = new Uint8Array(await res.arrayBuffer());
    const { rate, bytesPerSample } = FORMATS[this._output];
    const durationMs = Math.round((audio.byteLength / bytesPerSample / rate) * 1000);
    return { audio, durationMs };
  }
}
