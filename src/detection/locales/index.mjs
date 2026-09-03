/**
 * Locale registry. `getLocale('en')` → the English pack, `getLocale()` → Turkish.
 * Add a country: write `xx.mjs` next to this file, import + register it here.
 */
import * as tr from './tr.mjs';
import * as en from './en.mjs';

export const LOCALES = { tr, en };
export const DEFAULT_LOCALE = 'tr';

/** @param {string} [code]  BCP-47-ish; only the first 2 letters matter */
export function getLocale(code) {
  const key = String(code || DEFAULT_LOCALE).toLowerCase().slice(0, 2);
  return LOCALES[key] || LOCALES[DEFAULT_LOCALE];
}

/** Every hot-word list, for an STT that serves more than one locale. */
export function allHotWords() {
  return [...new Set(Object.values(LOCALES).flatMap((l) => l.hotWords))];
}
