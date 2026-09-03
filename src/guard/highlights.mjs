/**
 * Pick the 2–3 lines that tell a caught-scam story at a glance — the payload of
 * the shareable "Cally caught a scammer" card. Everything that could identify a
 * person or leak a secret is stripped here.
 *
 * Mirrors `lib/features/guard/scam_catch.dart` on the app side; the server runs
 * this so the FCM summary it pushes to the phone is already safe to render.
 */

const ASK_WORDS = [
  'kod', 'sifre', 'şifre', 'kart', 'hesap', 'acele', 'iban', 'aktar', 'gonder',
  'gönder', 'anydesk', 'indir', 'gizli', 'soyleme', 'söyleme',
  // en
  'code', 'card', 'account', 'transfer', 'gift card', 'wire', 'urgent', 'do not tell',
];

/** Remove long digit runs, collapse whitespace, cap length. */
export function sanitizeLine(raw) {
  let s = String(raw ?? '').trim().replace(/\d{3,}/g, '•••').replace(/\s+/g, ' ');
  if (s.length > 96) s = `${s.slice(0, 93).trimEnd()}…`;
  return s;
}

/**
 * @param {{who:'ai'|'caller', text:string}[]} transcript
 * @returns {{fromScammer:boolean, text:string}[]}  0–3 sanitised lines
 */
export function pickHighlights(transcript = []) {
  const clean = transcript
    .map((t) => ({ fromScammer: t.who === 'caller', text: sanitizeLine(t.text) }))
    .filter((t) => t.text);
  if (clean.length <= 3) return clean;

  const askIdx = clean.findIndex(
    (t) => t.fromScammer && ASK_WORDS.some((k) => t.text.toLowerCase().includes(k)),
  );

  const picks = [];
  if (askIdx >= 0) {
    picks.push(clean[askIdx]);
    const reply = clean.slice(askIdx + 1).find((t) => !t.fromScammer);
    if (reply) picks.push(reply);
  } else {
    picks.push(...clean.slice(0, 2));
  }
  const lastAi = [...clean].reverse().find((t) => !t.fromScammer) ?? clean[clean.length - 1];
  if (picks.length < 3 && !picks.includes(lastAi)) picks.push(lastAi);
  return picks.slice(0, 3);
}
