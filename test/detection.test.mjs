import test from 'node:test';
import assert from 'node:assert/strict';
import { DetectionSession, scoreTranscript } from '../src/detection/detector.mjs';
import { getLocale, allHotWords } from '../src/detection/locales/index.mjs';
import {
  SCAM_CALLS, LEGIT_CALLS, SCAM_CALLS_EN, LEGIT_CALLS_EN,
} from '../fixtures/calls.mjs';

test('every canonical scam script is flagged high or severe', () => {
  for (const [name, turns] of Object.entries(SCAM_CALLS)) {
    const v = scoreTranscript(turns);
    assert.ok(v.score >= 70, `${name}: expected score >= 70, got ${v.score}`);
    assert.ok(['high', 'severe'].includes(v.band), `${name}: band was ${v.band}`);
    assert.ok(v.reasons.length >= 2, `${name}: only ${v.reasons.length} reason(s)`);
  }
});

test('legitimate calls are never flagged as scams', () => {
  for (const [name, turns] of Object.entries(LEGIT_CALLS)) {
    const v = scoreTranscript(turns);
    assert.ok(
      v.score < 15,
      `${name}: expected score < 15, got ${v.score} [${v.signals.join(', ')}]`,
    );
    assert.equal(v.band, 'low', `${name}: band was ${v.band}`);
  }
});

test('a threat call is flagged as category "threat" and armed for recording', () => {
  const v = scoreTranscript([
    'Borcunu bugün ödemezsen adresini biliyorum, üstüne adam gönderirim.',
    'Son uyarım, pişman olacaksın.',
  ]);
  assert.equal(v.category, 'threat');
  assert.ok(v.signals.includes('threat_intimidation'), `signals: ${v.signals}`);
  assert.ok(['high', 'severe'].includes(v.band), `band: ${v.band} (score ${v.score})`);
});

test('sextortion is caught and outranks any scam framing in the category', () => {
  const v = scoreTranscript([
    'Kameranı hackledim, görüntülerin elimde.',
    'Bitcoin göndermezsen hepsini ailene gönderirim, ifşa ederim.',
  ]);
  assert.equal(v.category, 'threat');
  assert.ok(v.signals.includes('sextortion_blackmail'));
});

test('repeated-harassment language is category "harassment", not "scam"', () => {
  const v = scoreTranscript([
    'Beni engelle, numaramı değiştirir yine ararım. Seni rahat bırakmayacağım.',
    'Gece gündüz arayacağım.',
  ]);
  assert.equal(v.category, 'harassment');
  assert.ok(v.signals.includes('harassment_abuse'));
});

test('a normal scam call is still category "scam"', () => {
  const v = scoreTranscript(SCAM_CALLS.masak);
  assert.equal(v.category, 'scam');
});

test('a plain bank reminder does not trip bank impersonation', () => {
  // This is the exact false positive the design avoids: a real bank does call
  // and say "bankadan ariyorum". Only the fraud framing counts.
  const v = scoreTranscript(LEGIT_CALLS.bankReminder);
  assert.ok(!v.signals.includes('bank_impersonation'));
  assert.equal(v.score, 0);
});

test('a fraud-awareness call naming the SMS code is not flagged', () => {
  // "telefonunuza gelen kodu kimseyle paylasmayin" is what a real bank says.
  const v = scoreTranscript(LEGIT_CALLS.fraudWarning);
  assert.ok(!v.signals.includes('otp_request'), `signals: ${v.signals}`);
  assert.ok(!v.signals.includes('card_details'));
  assert.ok(v.score < 15);
});

test('advice language does not shield an explicit "read me the code"', () => {
  const v = scoreTranscript([
    'Kodu kimseyle paylaşmayın derler ama telefonunuza gelen kodu şimdi bana okuyun.',
    'Acele edin, hemen söyleyin yoksa işlem iptal olacak.',
  ]);
  assert.ok(v.signals.includes('otp_request'));
  assert.ok(v.score >= 45);
});

test('a caller who keeps demanding the password escalates past the hang-up line', () => {
  const s = new DetectionSession();
  const first = s.ingest('Ben bankadan arıyorum, banka şifrenizi istiyorum.').score;
  s.ingest('Şifrenizi söyleyin hemen.');
  const third = s.ingest('Banka şifrenizi vermeyecek misiniz?').score;
  assert.ok(first >= 25 && first < 65, `first ask should be elevated not severe, got ${first}`);
  assert.ok(third >= 85, `repeated demands should be severe, got ${third}`);
});

test('a legit caller who mentions a code once does not escalate', () => {
  // no repeat, protective framing -> stays low
  const v = scoreTranscript(LEGIT_CALLS.fraudWarning);
  assert.ok(v.score < 15, `got ${v.score}`);
});

test('confidence is low on a single weak signal, high on a full scam', () => {
  const weak = scoreTranscript(['Merhaba, bir çekiliş kazandınız.']);
  const full = scoreTranscript(SCAM_CALLS.cargo);
  assert.ok(weak.confidence < 45, `weak confidence ${weak.confidence}`);
  assert.ok(full.confidence >= 70, `full confidence ${full.confidence}`);
});

test('risk only ever rises as a scam call proceeds', () => {
  const session = new DetectionSession();
  const scores = SCAM_CALLS.fakeBank.map((t) => session.ingest(t).score);
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i] >= scores[i - 1], `dropped at turn ${i}: ${scores}`);
  }
  assert.ok(scores.at(-1) > scores[0], `no escalation: ${scores}`);
});

test('AI Guard is recommended before the scam call ends', () => {
  const session = new DetectionSession();
  let recommendedAt = -1;
  SCAM_CALLS.masak.forEach((turn, i) => {
    if (session.ingest(turn).recommendGuard && recommendedAt < 0) recommendedAt = i;
  });
  assert.ok(recommendedAt >= 0 && recommendedAt <= 2, `recommended at ${recommendedAt}`);
});

test('an empty session is inert', () => {
  const v = new DetectionSession().result();
  assert.deepEqual(
    { score: v.score, band: v.band, reasons: v.reasons.length },
    { score: 0, band: 'low', reasons: 0 },
  );
});

// ── multi-locale ────────────────────────────────────────────────────────────

test('the default locale is Turkish and is byte-identical to before', () => {
  const v = scoreTranscript(SCAM_CALLS.masak);
  assert.ok(v.score >= 90);
  // an unknown locale falls back to Turkish, not to nothing
  assert.equal(getLocale('zz').code, 'tr');
  assert.equal(getLocale('en-GB').code, 'en');
});

test('English scam scripts are flagged, English legit calls are not', () => {
  for (const [name, turns] of Object.entries(SCAM_CALLS_EN)) {
    const v = scoreTranscript(turns, { locale: 'en' });
    assert.ok(v.score >= 70, `${name}: score ${v.score}`);
    assert.ok(['high', 'severe'].includes(v.band), `${name}: band ${v.band}`);
  }
  for (const [name, turns] of Object.entries(LEGIT_CALLS_EN)) {
    const v = scoreTranscript(turns, { locale: 'en' });
    assert.ok(v.score < 25, `${name}: score ${v.score}`);
  }
});

test('signal ids are shared across locales so the policy stays language-free', () => {
  const tr = new Set(getLocale('tr').signals.map((s) => s.id));
  const en = new Set(getLocale('en').signals.map((s) => s.id));
  assert.deepEqual([...en].sort(), [...tr].sort());
});

test('every locale pack uses only shared signal ids and a valid category', () => {
  const known = new Set(getLocale('tr').signals.map((s) => s.id));
  const cats = new Set(['scam', 'threat', 'harassment', undefined]);
  for (const code of ['es', 'de', 'fr', 'pt', 'it']) {
    for (const s of getLocale(code).signals) {
      assert.ok(known.has(s.id), `${code}: unknown signal id ${s.id}`);
      assert.ok(cats.has(s.category), `${code}: bad category on ${s.id}`);
      assert.ok(Array.isArray(s.anyOf) && s.anyOf.length, `${code}: ${s.id} has no phrases`);
    }
    assert.ok(Array.isArray(getLocale(code).hotWords), `${code}: no hotWords`);
  }
});

test('added locale packs flag a scam script and a threat in their own language', () => {
  const scripts = {
    es: {
      scam: ['Le llamo del departamento de fraude de su banco.',
        'Hay un movimiento sospechoso en su cuenta, transfiera el dinero a una cuenta segura.',
        'Digame el codigo de verificacion que le llega ahora, es urgente, no cuelgue.'],
      threat: ['Se donde vives y tengo tu direccion.', 'Esta es tu ultima advertencia, te vas a arrepentir.'],
    },
    de: {
      scam: ['Ich rufe von der Betrugsabteilung Ihrer Bank an.',
        'Es gibt eine verdachtige Transaktion auf Ihrem Konto, uberweisen Sie das Geld auf ein sicheres Konto.',
        'Nennen Sie mir den Bestatigungscode den wir Ihnen geschickt haben, es ist dringend, legen Sie nicht auf.'],
      threat: ['Ich weiss wo du wohnst und ich habe deine Adresse.', 'Das ist deine letzte Warnung, du wirst es bereuen.'],
    },
    fr: {
      scam: ['Je vous appelle du service des fraudes de votre banque.',
        'Il y a une operation suspecte sur votre compte, transferez l argent sur un compte securise.',
        'Dites moi le code de verification que vous recevez maintenant, c est urgent, ne raccrochez pas.'],
      threat: ['Je sais ou tu habites et j ai ton adresse.', 'C est ton dernier avertissement, tu vas le regretter.'],
    },
    pt: {
      scam: ['Estou ligando do setor de fraude do seu banco.',
        'Ha uma transacao suspeita na sua conta, transfira o dinheiro para uma conta segura.',
        'Me diga o codigo de verificacao que voce recebe agora, e urgente, nao desligue.'],
      threat: ['Eu sei onde voce mora e tenho seu endereco.', 'Este e seu ultimo aviso, voce vai se arrepender.'],
    },
    it: {
      scam: ['La chiamo dall ufficio frodi della sua banca.',
        'C e un operazione sospetta sul suo conto, trasferisca il denaro su un conto sicuro.',
        'Mi dica il codice di verifica che riceve ora, e urgente, non riattacchi.'],
      threat: ['So dove abiti e ho il tuo indirizzo.', 'Questo e il tuo ultimo avvertimento, te ne pentirai.'],
    },
  };
  for (const [code, s] of Object.entries(scripts)) {
    const scam = scoreTranscript(s.scam, { locale: code });
    assert.ok(scam.score >= 50, `${code} scam: score ${scam.score} [${scam.signals}]`);
    assert.equal(scam.category, 'scam', `${code} scam: category ${scam.category}`);
    const threat = scoreTranscript(s.threat, { locale: code });
    assert.equal(threat.category, 'threat', `${code} threat: category ${threat.category} [${threat.signals}]`);
  }
});

test('the advice/request guard works in English too', () => {
  // a real bank fraud-warning names the code only to tell you never to share it
  const warn = scoreTranscript(LEGIT_CALLS_EN.fraudWarning, { locale: 'en' });
  assert.equal(warn.score, 0);
  // but an explicit "read me the code" still fires
  const ask = scoreTranscript(
    ['Never share your verification code with anyone.', 'Now read me the code we just sent.'],
    { locale: 'en' },
  );
  assert.ok(ask.reasons.some((r) => r.id === 'otp_request'));
});

test('an inline locale pack can be passed straight in', () => {
  const pack = {
    code: 'xx',
    signals: [{ id: 'otp_request', label: 'code', severity: 'high', weight: 40, anyOf: [['magic phrase']] }],
    benignMarkers: [], adviceMarkers: [], explicitRequest: [],
  };
  const v = scoreTranscript(['please say the magic phrase now'], { locale: pack });
  assert.ok(v.score >= 40);
});

test('allHotWords merges every locale for a multi-language STT', () => {
  const all = allHotWords();
  assert.ok(all.includes('MASAK'));   // tr
  assert.ok(all.includes('IRS'));     // en
  assert.equal(all.length, new Set(all).size); // deduped
});
