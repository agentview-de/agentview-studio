// Tiny i18n: dictionaries + a t() helper with {param} interpolation.

import { en } from './locales/en.js';
import { de } from './locales/de.js';
import { overlayDe } from './locales/overlay.de.js';

const DICTIONARIES = { en, de };
let _current = 'en';
const _subs = new Set();

export function setLocale(loc) {
  if (!DICTIONARIES[loc]) return;
  _current = loc;
  try { localStorage.setItem('bb_locale', loc); } catch {}
  // Guarded like the bootstrap below: there is no document in the headless test
  // run, and a language switch must not be the one thing that cannot be tested
  // without a browser.
  try { document.documentElement.lang = loc; } catch { /* no DOM */ }
  for (const fn of _subs) fn(loc);
}

export function getLocale() { return _current; }

// tx() — translate a raw ENGLISH source string (gettext-style). Used for bulk
// UI strings that aren't worth a hand-named key (plugin Library names, Inspector
// field/section/option labels, admin chrome). In English it returns the source
// unchanged; in German it looks the source up in the overlay and falls back to
// the source when no translation exists. Keeps shared/plugins free of i18n.
export function tx(source) {
  if (source == null || source === '') return source;
  if (_current === 'de') return overlayDe[source] ?? source;
  return source;
}

export function onLocaleChange(fn) { _subs.add(fn); return () => _subs.delete(fn); }

export function t(key, params) {
  const dict = DICTIONARIES[_current] ?? DICTIONARIES.en;
  let s = dict[key] ?? DICTIONARIES.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

// Bootstrap from storage.
try {
  const saved = localStorage.getItem('bb_locale');
  if (saved && DICTIONARIES[saved]) _current = saved;
} catch {}
// Keep <html lang> in sync with the restored locale (bootstrap assigns _current
// directly, bypassing setLocale's side effects).
try { document.documentElement.lang = _current; } catch {}
