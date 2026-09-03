/**
 * Backward-compatible view of the DEFAULT (Turkish) locale pack.
 *
 * The lexicon now lives in `locales/` — one data file per country. This module
 * keeps the original `SIGNALS` / `BENIGN_MARKERS` / `HOT_WORDS` exports working
 * for the Turkish default. For any other locale, `DetectionSession({ locale })`
 * compiles the right pack itself; for a multi-locale STT, `allHotWords()` in
 * `locales/index.mjs` returns every list.
 */
import { fold } from '../text.mjs';
import * as tr from './locales/tr.mjs';

/** Signals with every phrase pre-folded, so scoring stays a substring check. */
export const SIGNALS = tr.signals.map((s) => ({
  ...s,
  anyOf: s.anyOf.map((group) => group.map(fold)),
}));

/** @type {Map<string, object>} */
export const SIGNAL_BY_ID = new Map(SIGNALS.map((s) => [s.id, s]));

export const BENIGN_MARKERS = tr.benignMarkers.map(fold);

export const HOT_WORDS = tr.hotWords;
