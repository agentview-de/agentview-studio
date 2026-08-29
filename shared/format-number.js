// Numbers, written the way the room reads them.
//
// Two widgets exist to show numbers — the KPI cards and the chart — and both
// localised the format nobody had selected while leaving the DEFAULT one
// hard-coded to English:
//
//   kpi-cards  `n.toLocaleString(locale)` for anything under a thousand, but
//              `(n / 1000).toFixed(1) + 'k'` above it. So one German board
//              showed "987,4" on one card and "1.2k" on the next — two number
//              formats, side by side, in the same grid.
//   chart      `compactNum()` for the ticks (the default) and the `percent`
//              format both wrote `toFixed`, i.e. always a dot. Its own comment
//              already says why that matters: a chart reading 1,234.5 in a
//              German foyer is off by three orders of magnitude to anyone who
//              reads it as 1234,5.
//
// The menu widget fixed this for prices a while ago. This is the same fix, made
// shared, so the next widget that prints a number inherits it instead of
// repeating the bug.
//
// What it deliberately does NOT do is switch to `Intl`'s own compact notation.
// CLDR German would render 1200 as "1,2 Tsd." — correct German, but four
// characters where a dense KPI grid and a chart axis have room for one, and a
// change to the visual language rather than a fix. The k/M suffixes stay; only
// the decimal mark and the grouping follow the reader.

import { safeLocale } from './locale-field.js';

// null, undefined and '' all mean "no number here" — Number() turns two of
// them into 0, which would print a confident zero where there is no reading.
const isBlank = (v) => v === null || v === undefined || v === '';

// Intl.NumberFormat is expensive to construct and these run on every repaint of
// every card and every axis tick.
const CACHE = new Map();
function nf(locale, opts) {
  const key = `${locale}|${opts.style ?? ''}|${opts.minimumFractionDigits ?? ''}|${opts.maximumFractionDigits ?? ''}`;
  let f = CACHE.get(key);
  if (!f) {
    // An empty tag means "the device decides" — the locale-field contract.
    f = new Intl.NumberFormat(locale || undefined, opts);
    CACHE.set(key, f);
  }
  return f;
}

/**
 * Plain number in the reader's locale.
 * @param {*} v
 * @param {string} [locale]  '' → device default
 * @param {Intl.NumberFormatOptions} [opts]
 * @returns {string} the input coerced to a string when it is not a number
 */
export function formatNumber(v, locale, opts = {}) {
  if (isBlank(v)) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  try { return nf(safeLocale(locale), opts).format(n); } catch { return String(n); }
}

/**
 * k/M abbreviation, with the reader's decimal mark and grouping.
 *
 * 1234 → "1.2k" (en) / "1,2k" (de). A whole number keeps no fraction, which is
 * what the chart's own formatter did with `.replace(/\.0$/, '')`.
 */
export function formatCompact(v, locale, { k = 'k', m = 'M' } = {}) {
  if (isBlank(v)) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const a = Math.abs(n);
  const one = { maximumFractionDigits: 1 };
  if (a >= 1e6) return formatNumber(n / 1e6, locale, one) + m;
  if (a >= 1e3) return formatNumber(n / 1e3, locale, one) + k;
  return formatNumber(n, locale, one);
}

/**
 * A percentage that is ALREADY in percent units (6.2, not 0.062).
 *
 * Going through `style: 'percent'` rather than appending '%' is what gets the
 * spacing right: German writes "6,2 %" with a non-breaking space, English
 * "6.2%" without.
 */
export function formatPercent(v, locale, { maximumFractionDigits = 1 } = {}) {
  if (isBlank(v)) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  try {
    return nf(safeLocale(locale), { style: 'percent', maximumFractionDigits }).format(n / 100);
  } catch { return `${n}%`; }
}
