/**
 * Locale-aware text normalisation shared by the lexicon and the detector.
 *
 * The caller speaks on a noisy line and the speech-to-text layer spells things
 * inconsistently (accents dropped, capitalised or not). Every match in this
 * service runs against folded text, so a locale pack can be written in plain
 * script and still match whatever the transcriber produces.
 *
 * Turkish gets an explicit map (its dotless-i is not a plain diacritic); every
 * other script is handled by the generic Unicode decomposition strip, so
 * German ü, French é, Spanish ñ, etc. all fold cleanly too.
 */

const TR_MAP = { 'ı': 'i', 'ş': 's', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ç': 'c' };

/**
 * Fold a string to a lower-case, accent-stripped, punctuation-free form.
 * @param {unknown} input
 * @returns {string}
 */
export function fold(input) {
  return String(input ?? '')
    .replace(/İ/g, 'i') // İ -> i  (before toLowerCase, which would give "i̇")
    .replace(/I/g, 'i') // dotless capital I -> i
    .toLowerCase()
    .replace(/[ışğüöç]/g, (ch) => TR_MAP[ch])
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // é→e, ñ→n, ä→a …
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when every phrase in `group` (each already folded) is present in the
 * folded `haystack`. A group of two phrases models "these words co-occur".
 * @param {string} haystack folded
 * @param {string[]} group folded phrases
 */
export function groupMatches(haystack, group) {
  return group.every((phrase) => haystack.includes(phrase));
}
