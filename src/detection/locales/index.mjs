/**
 * Locale registry. `getLocale('en')` → the English pack, `getLocale()` → Turkish.
 * Add a country: write `xx.mjs` next to this file, import + register it here.
 *
 * en covers US / UK / CA / AU / IE / NZ / IN(en) / ZA; es covers ES / MX / AR /
 * CO / CL / PE …; pt covers BR / PT; fr covers FR / BE / CH-fr / CA-fr; de covers
 * DE / AT / CH; it covers IT. Together with tr that's 30+ countries — the rest
 * follow the same one-file pattern.
 */
import * as tr from './tr.mjs';
import * as en from './en.mjs';
import * as es from './es.mjs';
import * as de from './de.mjs';
import * as fr from './fr.mjs';
import * as pt from './pt.mjs';
import * as it from './it.mjs';

export const LOCALES = { tr, en, es, de, fr, pt, it };
export const DEFAULT_LOCALE = 'tr';

/** @param {string} [code]  BCP-47-ish; only the first 2 letters matter */
export function getLocale(code) {
  const key = String(code || DEFAULT_LOCALE).toLowerCase().slice(0, 2);
  return LOCALES[key] || LOCALES[DEFAULT_LOCALE];
}

/** Every hot-word list, for an STT that serves more than one locale. */
export function allHotWords() {
  return [...new Set(Object.values(LOCALES).flatMap((l) => l.hotWords ?? []))];
}
