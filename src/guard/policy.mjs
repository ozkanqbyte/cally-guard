/**
 * What Cally's AI Guard is allowed to say, and the rule for picking the next
 * line.
 *
 * In production an LLM phrases each turn; this policy is the guard-rail. It
 * decides the *intent* of a turn and supplies a safe fallback line. It never
 * reads out a number, confirms a code, or agrees to a transfer.
 *
 * The moves:
 *   greet   - open the call
 *   probe   - "what is this about?" (low risk, still figuring it out)
 *   elicit  - pointed questions that (a) keep the caller talking and (b) pull
 *             out the details a scam report needs: which bank, which branch,
 *             which IBAN, which case number. This is the "stall + gather" phase.
 *   stall   - buy time once it is clearly a scam
 *   wrapup  - end the call
 *
 * @typedef {'greet'|'probe'|'elicit'|'stall'|'wrapup'} Move
 * @typedef {Object} GuardDecision
 * @property {Move} move
 * @property {string} utterance
 * @property {'continue'|'end'} action
 * @property {number} riskAtDecision
 */

const LINES = {
  greet: [
    'Alo, buyurun, kiminle görüşüyorum?',
  ],
  probe: [
    'Ne konuda aramıştınız acaba?',
    'Kusura bakmayın, tam anlayamadım. Biraz açar mısınız?',
    'Hangi kurumdan aradığınızı söyler misiniz?',
  ],
  stall: [
    'Bir saniye, not alıyorum… evet, devam edin.',
    'Ortam biraz gürültülü, tekrar eder misiniz?',
    'Anladım, yani tam olarak ne yapmamı istiyorsunuz?',
    'Elimde kalem yok, bir dakika müsaade edin bulayım.',
  ],
};

/**
 * Pointed questions per detected scam type. Each keeps the caller talking and
 * makes them commit to a detail that goes straight into the report. None of
 * them give anything away.
 */
const ELICIT = {
  bank_impersonation: [
    'Hangi bankadan, hangi şubeden arıyorsunuz? Bir de sicil numaranızı alabilir miyim?',
    'Şu an hangi hesabımdan bahsediyorsunuz, son üç hanesini siz söyleyin.',
  ],
  authority_impersonation: [
    'Hangi savcılık, dosya numarası ne? Ben avukatımı arayıp teyit edeyim.',
    'Adınızı ve unvanınızı yazıyorum, tekrar eder misiniz?',
  ],
  money_transfer: [
    'Hangi hesaba ne kadar göndermem gerekiyormuş, kime ait bu hesap?',
    'Bu parayı neden kendi bankam üzerinden yapamıyorum, onu anlatın.',
  ],
  otp_request: [
    'Bana bir kod gelmedi, siz hangi numaradan gönderdiniz?',
    'Kodu neden size söylemem gerekiyor, bankalar bunu istemez diye biliyorum?',
  ],
  remote_access: [
    'O uygulamanın adı neydi, tam olarak ne işe yarıyor?',
    'Ekranımı neden görmeniz gerekiyor, bunu biraz açar mısınız?',
  ],
  card_details: [
    'Kart bilgimi neden telefonda istiyorsunuz, bu güvenli mi?',
    'Hangi kartımdan bahsediyorsunuz, bankası neresi?',
  ],
  relative_emergency: [
    'Kiminle görüşüyorum, adını söyle bakayım. Hangi hastane, hangi şehir?',
    'Bir saniye, sesini tanıyamadım, kaç yaşındasın sen?',
  ],
  crypto_investment: [
    'Hangi platform bu, şirketin tam adı ne, nerede kayıtlı?',
    'Bu getiriyi nasıl garanti ediyorsunuz, biraz anlatın.',
  ],
  cargo_ransom: [
    'Kargo takip numarası nedir, hangi firma?',
    'Bu ücreti neden kapıda ödeyemiyorum?',
  ],
  secrecy: [
    'Bunu neden kimseye söyleyemiyorum, biraz tuhaf değil mi?',
  ],
  urgency_threat: [
    'Neden bu kadar acele, biraz düşünsem ne olur?',
  ],
};

const ELICIT_FALLBACK = [
  'Biraz daha detay verir misiniz, tam anlayamadım.',
  'Peki bundan sonra ne olacak, adım adım anlatın.',
];

const WRAPUP = {
  scam: 'Anladım. Ben bu konuyu bankamın ya da kurumun kendi resmi ' +
    'numarasından arayıp kontrol edeceğim. İyi günler.',
  neutral: 'Şu an devam edemeyeceğim, görüşmeyi burada bitirelim. İyi günler.',
};

/**
 * Lines the Guard must never emit — the last gate before anything is spoken.
 * Fixed templates are checked against this at load; every LLM rewrite and every
 * "humanize" pass is checked at runtime. A jailbroken or drifting LLM cannot get
 * past it: on a hit, the raw safe line is spoken instead.
 */
const FORBIDDEN = [
  /\d{3,}/,                                   // any 3+ digit number (code, IBAN tail, card, amount)
  /\btr\s?\d{2}\b/i,                          // IBAN prefix
  /onaylıyorum|onayladım|kabul ediyorum|kabul ettim/i,   // confirming a request
  /kodu?\s+(şu|şudur|\S*d[ıi]r)\b/i,          // reading a code back
  /(gönderdim|gönderiyorum|yatırdım|aktardım|transfer ettim|havale ettim|ödedim)/i, // agreeing to pay
  /(kurdum|kuruyorum|indirdim|indiriyorum|bağlandım|yükledim)/i,  // agreeing to install / connect
  /(şifrem|parolam|pin kodum|kart numaram)\s+\S+/i,       // revealing our own secrets
  /(giriş yaptım|hesabıma girdim|ekranı paylaştım)/i,     // acting on the request
];

/** @param {string} line @returns {boolean} */
export function isSafeLine(line) {
  return typeof line === 'string' && !FORBIDDEN.some((re) => re.test(line));
}

// Fail at load time if any template is ever edited into something unsafe.
const ALL_LINES = [
  ...Object.values(LINES).flat(),
  ...Object.values(ELICIT).flat(),
  ...ELICIT_FALLBACK,
  WRAPUP.scam, WRAPUP.neutral,
];
for (const line of ALL_LINES) {
  if (!isSafeLine(line)) throw new Error(`unsafe guard line: ${line}`);
}

const ORDER = ['greet', 'probe', 'elicit', 'stall', 'wrapup'];
const MAX_TURNS = 14;

/**
 * @param {Object} state
 * @param {number} state.turn         caller turns so far (0 = opening line)
 * @param {number} state.risk         latest detection score
 * @param {Move} [state.lastMove]
 * @param {string} [state.topSignal]  id of the strongest detected signal
 * @returns {GuardDecision}
 */
export function decide({ turn, risk, lastMove, topSignal }) {
  let move;
  if (turn === 0) move = 'greet';
  else if (risk >= 85 && turn >= 3) move = 'wrapup';
  else if (turn >= MAX_TURNS) move = 'wrapup';
  else if (risk >= 65) move = 'stall';
  else if (risk >= 30) move = 'elicit';
  // a call that keeps going with no clear risk still gets more pointed — a real
  // person would not ask "what is this about?" five times in a row.
  else if (turn >= 4) move = 'elicit';
  else move = 'probe';

  // Never walk back to an earlier phase (except to wrap up).
  if (lastMove && move !== 'wrapup' &&
      ORDER.indexOf(move) < ORDER.indexOf(lastMove)) {
    move = lastMove;
  }

  if (move === 'wrapup') {
    return {
      move,
      utterance: risk >= 70 ? WRAPUP.scam : WRAPUP.neutral,
      action: 'end',
      riskAtDecision: risk,
    };
  }

  // rotate through the pool instead of parroting the last line forever
  const pick = (pool) => pool[((turn - 1) % pool.length + pool.length) % pool.length];

  let utterance;
  if (move === 'elicit') {
    utterance = pick((topSignal && ELICIT[topSignal]) || ELICIT_FALLBACK);
  } else if (move === 'greet') {
    utterance = LINES.greet[0];
  } else {
    utterance = pick(LINES[move]);
  }

  return { move, utterance, action: 'continue', riskAtDecision: risk };
}
