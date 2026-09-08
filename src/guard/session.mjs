import { DetectionSession } from '../detection/detector.mjs';
import { decide, isSafeLine } from './policy.mjs';
import { pickHighlights } from './highlights.mjs';

/**
 * One AI Guard call. The telephony layer feeds each caller utterance in via
 * `callerSaid`; Cally replies with the returned line and pushes the live risk
 * to the user's phone. When `ended` is true, hang up.
 *
 * @typedef {Object} TurnResult
 * @property {string} reply
 * @property {'continue'|'end'} action
 * @property {number} risk
 * @property {string} band
 * @property {{id:string,label:string,severity:string}[]} reasons
 */

/**
 * Lines to open with when the AI is *conferenced into* a call the user was
 * already on (the "AI'a aktar" flow) — it cannot say "Alo, buyurun", the caller
 * is mid-sentence. These re-open the line as a slightly confused person.
 */
const JOIN_MID_CALL = [
  'Pardon, bir saniye hattımız kesildi galiba. Neredeydik?',
  'Kusura bakmayın, sizi bir an kaybettim. Devam eder misiniz?',
];
for (const line of JOIN_MID_CALL) {
  if (!isSafeLine(line)) throw new Error(`unsafe join line: ${line}`);
}

export class GuardCall {
  /**
   * @param {string} id
   * @param {{mode?: 'inbound'|'joinMidCall', locale?: string, overlay?: object,
   *          weightOverrides?: Record<string,number>,
   *          thresholds?: {severe?:number, high?:number, elevated?:number}}} [opts]
   */
  constructor(id, opts = {}) {
    this.id = id;
    this.mode = opts.mode ?? 'inbound';
    this.ended = false;
    this._detector = new DetectionSession({
      locale: opts.locale, overlay: opts.overlay,
      weightOverrides: opts.weightOverrides, thresholds: opts.thresholds,
    });
    this._turn = 0;
    /** @type {import('./policy.mjs').Move} */
    this._lastMove = this.mode === 'joinMidCall' ? 'probe' : 'greet';
    /** @type {{who:'ai'|'caller', text:string}[]} */
    this._transcript = [];

    this.opening = this.mode === 'joinMidCall'
      ? JOIN_MID_CALL[0]
      : decide({ turn: 0, risk: 0 }).utterance;
    this._transcript.push({ who: 'ai', text: this.opening });
  }

  /**
   * @param {string} text what the caller just said
   * @returns {TurnResult}
   */
  callerSaid(text) {
    if (this.ended) throw new Error('call already ended');

    this._transcript.push({ who: 'caller', text });
    const verdict = this._detector.ingest(text);
    this._turn += 1;

    const decision = decide({
      turn: this._turn,
      risk: verdict.score,
      lastMove: this._lastMove,
      topSignal: verdict.reasons[0]?.id,
    });
    this._lastMove = decision.move;
    this._transcript.push({ who: 'ai', text: decision.utterance });
    if (decision.action === 'end') this.ended = true;

    return {
      reply: decision.utterance,
      move: decision.move,
      action: decision.action,
      risk: verdict.score,
      band: verdict.band,
      category: verdict.category,
      reasons: verdict.reasons,
    };
  }

  /** Human-readable wrap-up shown to the user after the call. */
  summary() {
    const verdict = this._detector.result();
    return {
      callId: this.id,
      risk: verdict.score,
      band: verdict.band,
      category: verdict.category,
      reasons: verdict.reasons,
      advice: adviceFor(verdict.band, verdict.category),
      turns: this._turn,
      transcript: this._transcript,
      // 2–3 sanitised lines for the shareable "caught a scammer" card
      highlights: pickHighlights(this._transcript),
    };
  }
}

/**
 * @param {string} band
 * @param {'scam'|'threat'|'harassment'} [category]
 */
function adviceFor(band, category = 'scam') {
  if (category === 'threat') {
    return 'Bu aramada tehdit / şantaj ifadeleri var. Bu numarayı engelle, ' +
      'görüşmeyi kaydını sakla ve tehdit ciddiyse kolluğa (155) başvur. ' +
      'Şantaja asla ödeme yapma.';
  }
  if (category === 'harassment') {
    return 'Bu arama taciz / ısrarlı rahatsız etme niteliğinde. Numarayı engelle. ' +
      'Devam ederse kayıtlarını biriktir; ısrarlı takip için savcılığa şikâyet ' +
      'edebilirsin.';
  }
  if (band === 'severe' || band === 'high') {
    return 'Yüksek dolandırıcılık şüphesi. Bu numarayı engelle. Bankan veya ' +
      'ilgili kurumla yalnızca resmi numaradan iletişime geç. Kimseye kod, ' +
      'şifre ya da para gönderme.';
  }
  if (band === 'elevated') {
    return 'Bazı şüpheli ifadeler var. Emin değilsen görüşmeyi bitir ve kurumu ' +
      'resmi hattından ara.';
  }
  return 'Belirgin bir dolandırıcılık işareti görülmedi. Yine de dikkatli ol.';
}
