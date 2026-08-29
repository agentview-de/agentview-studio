// One way to write a file size.
//
// Three copies of this function lived in the app, and two of them disagreed
// with the third:
//
//   cloud-load.js          toFixed(b >= 10 || i === 0 ? 0 : 1)   "512 B"
//   asset-library.js       toFixed(1)                            "512.0 B"
//   data-slot-inspector.js toFixed(1)                            "512.0 B"
//
// So the same file read one way in the cloud picker and another in the asset
// library — and "512.0 B" is a decimal on a count of bytes, which means
// nothing. All three also wrote the number with `toFixed`, which is
// locale-blind: a German Studio printed "1.5 MB" where its own menu widget had
// already been taught to write "1,5". Same lesson as the dates next door — the
// language is the STUDIO's, and there is one place that knows it.

import { getLocale } from './i18n.js';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * @param {unknown} bytes
 * @param {{fallback?: string}} opts  what to print when there is no number at
 *        all. A real zero is "0 B" — a data slot that exists and is empty is
 *        not the same as one whose size nobody reported.
 */
export function fmtBytes(bytes, { fallback = '—' } = {}) {
  // '' is "nobody said", not zero — Number('') is 0 and would have printed a
  // confident "0 B" for a field the server simply left out.
  if (bytes == null || (typeof bytes === 'string' && !bytes.trim())) return fallback;
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return fallback;
  let v = n;
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) { v /= 1024; i++; }
  // Whole bytes never take a decimal; larger units take one only while the
  // number is small enough for it to say something.
  const digits = i === 0 ? 0 : (v < 10 ? 1 : 0);
  // maximum only, no minimum: an exact megabyte is "1 MB", not "1.0 MB".
  const num = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: digits }).format(v);
  return `${num} ${UNITS[i]}`;
}
