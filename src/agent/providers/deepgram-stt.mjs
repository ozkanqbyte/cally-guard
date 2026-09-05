/**
 * Real speech-to-text adapter: Deepgram streaming (Turkish).
 *
 * Presents the SAME surface as `FakeStt` - `.on('final', text)` and
 * `.on('hangup')` - so `VoiceAgent` does not change. Not covered by the test
 * suite (needs DEEPGRAM_API_KEY and a live audio stream); this is the reference
 * you drop in when the media layer exists.
 *
 *   const stt = new DeepgramStt({ apiKey: process.env.DEEPGRAM_API_KEY });
 *   stt.attach(mediaTrack);            // 16 kHz mono PCM from LiveKit / SIP
 *   agent = new VoiceAgent({ stt, ... });
 */
import { HOT_WORDS } from '../../detection/lexicon.mjs';
import { getLocale, allHotWords } from '../../detection/locales/index.mjs';

export class DeepgramStt {
  constructor({
    apiKey,
    language = 'tr',
    // hot words default to this language's list; pass hotWords: allHotWords()
    // for a socket that serves more than one locale.
    // nova-3 has the best Turkish and takes `keyterm` prompting (below). Older
    // stacks can pass model: 'nova-2-phonecall'.
    model = 'nova-3',
    endpointingMs = 900,
    hotWords,
  } = {}) {
    if (!apiKey) throw new Error('DeepgramStt: apiKey required');
    this._apiKey = apiKey;
    this._language = language;
    this._hotWords = hotWords
      ?? (language === 'multi' ? allHotWords() : (getLocale(language).hotWords ?? HOT_WORDS));
    this._model = model;
    this._endpointingMs = endpointingMs;
    this._handlers = { final: [], hangup: [], partial: [] };
    this._ws = null;
  }

  on(event, handler) {
    (this._handlers[event] ??= []).push(handler);
    return this;
  }

  _emit(event, arg) {
    for (const h of this._handlers[event] ?? []) h(arg);
  }

  /**
   * Open the Deepgram socket and pipe an audio source into it.
   * @param {{on:(e:'data'|'end',cb:Function)=>void}} audioSource  raw PCM frames
   */
  async attach(audioSource) {
    const url = new URL('wss://api.deepgram.com/v1/listen');
    url.searchParams.set('model', this._model);
    url.searchParams.set('language', this._language);
    url.searchParams.set('encoding', 'linear16');
    url.searchParams.set('sample_rate', '16000');      // matches our AudioStream(caller, 16000, 1)
    url.searchParams.set('channels', '1');
    url.searchParams.set('interim_results', 'true');
    url.searchParams.set('endpointing', String(this._endpointingMs));
    url.searchParams.set('smart_format', 'true');
    // boost the vocabulary the score depends on
    for (const w of this._hotWords) url.searchParams.append('keyterm', w);

    // Node 22+ has global WebSocket; older runtimes: import 'ws'.
    this._ws = new WebSocket(url, { headers: { Authorization: `Token ${this._apiKey}` } });

    this._ws.addEventListener('open', () => console.log('[deepgram] socket open'));
    this._ws.addEventListener('close', (evt) => console.log('[deepgram] socket closed', evt.code, evt.reason));
    this._ws.addEventListener('error', (evt) => console.log('[deepgram] socket error', evt.message || evt));

    this._ws.addEventListener('message', (evt) => {
      console.log('[deepgram] msg:', typeof evt.data === 'string' ? evt.data.slice(0, 200) : '<binary>');
      const msg = JSON.parse(evt.data);
      if (msg.type !== 'Results') return;
      const alt = msg.channel?.alternatives?.[0];
      const text = (alt?.transcript ?? '').trim();
      if (!text) return;
      if (msg.is_final && msg.speech_final) this._emit('final', text);
      else this._emit('partial', text);
    });
    this._ws.addEventListener('close', () => this._emit('hangup'));
    this._ws.addEventListener('error', () => this._emit('hangup'));

    audioSource.on('data', (pcm) => {
      if (this._ws?.readyState === 1) this._ws.send(pcm);
    });
    audioSource.on('end', () => this._ws?.close());
  }

  close() {
    try { this._ws?.close(); } catch { /* already closed */ }
  }
}
