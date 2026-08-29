// One way to write a server timestamp.
//
// Six places in the Studio print a date that came off the wire, and they did it
// six different ways — four of which were not formatting at all:
//
//   cloud-load.js        toLocaleString(getLocale(), …)      correct
//   field-controls/table toLocaleString(getLocale(), …)      correct
//   versions.js          esc(v.at)              2026-08-29T05:20:11.123Z
//   audit.js             r.timestamp            2026-08-29T05:20:11.123Z
//   webhooks.js          (…).slice(0, 19)       2026-08-29T05:20:11
//   apikeys.js           (…).slice(0, 10)       2026-08-29
//   display-drawer.js    lastSeen               2026-08-29T05:20:11.123Z
//
// A German Verwaltung printed ISO strings next to German labels. And the two
// that WERE right had had to learn the same lesson separately: the locale is
// the STUDIO's (getLocale()), never the browser's — a German Studio in an
// English browser must not write "Aug 29, 2026" under a German heading.
//
// Non-dates pass through as the fallback rather than as "Invalid Date": the
// drawer already hands this function a literal em dash when a display has never
// been seen.

import { getLocale } from './i18n.js';

function parse(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date + time, e.g. "29. Aug. 2026, 05:20" / "Aug 29, 2026, 05:20 AM". */
export function fmtDateTime(value, { fallback = '—' } = {}) {
  const d = parse(value);
  if (!d) return fallback;
  return d.toLocaleString(getLocale(), {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Date only — for columns where the time of day carries no information. */
export function fmtDate(value, { fallback = '—' } = {}) {
  const d = parse(value);
  if (!d) return fallback;
  return d.toLocaleDateString(getLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
}
