// Writing a server timestamp so a person can read it.
//
// Six places in the Studio print a date that came off the wire. Two formatted
// it for the Studio's language; four printed the raw ISO string or a substring
// of one — a German Verwaltung showing "2026-08-29T05:20:11.123Z" next to
// German labels, and an API-keys column showing "2026-08-29" whichever way its
// reader writes dates.
//
// The two that were right had each had to learn the same lesson on their own:
// the locale is the STUDIO's, never the browser's. A German Studio in an
// English browser must not write "Aug 29, 2026" under a German heading. One
// formatter now, so that lesson cannot be un-learned in the seventh place.
//
// Pure: Intl and the i18n locale switch, no DOM.

import { test, expect, describe } from './runner.js';
import { fmtDateTime, fmtDate } from '../admin/format-date.js';
import { setLocale, getLocale } from '../admin/i18n.js';

const withLocale = (loc, fn) => {
  const before = getLocale();
  setLocale(loc);
  try { return fn(); } finally { setLocale(before); }
};

const ISO = '2026-08-29T05:20:11.123Z';

describe('dates · the Studio language decides, not the browser', () => {
  test('REGRESSION: a wire timestamp is never printed as an ISO string', () => {
    for (const loc of ['de', 'en']) {
      const out = withLocale(loc, () => fmtDateTime(ISO));
      expect(out).notToContain('T05:20');
      expect(out).notToContain('Z');
      expect(out).notToContain('2026-08-29');
      expect(out).toContain('2026');
    }
  });

  test('the same instant reads differently in the two Studio languages', () => {
    const de = withLocale('de', () => fmtDateTime(ISO));
    const en = withLocale('en', () => fmtDateTime(ISO));
    expect(de === en).toBeFalsy();
    // German writes the day first; English writes the month first.
    expect(de.trim().startsWith('29')).toBeTruthy();
    expect(/^[A-Za-z]/.test(en.trim())).toBeTruthy();
  });

  test('date-only leaves the clock out', () => {
    const out = withLocale('de', () => fmtDate(ISO));
    expect(out).toContain('2026');
    expect(out).notToContain(':');
  });

  test('nothing to show is a dash, not "Invalid Date"', () => {
    for (const v of [null, undefined, '', 'nicht wirklich ein datum', '—', NaN]) {
      expect(fmtDateTime(v)).toBe('—');
      expect(fmtDate(v)).toBe('—');
    }
    // A caller that wants its own placeholder gets it.
    expect(fmtDateTime(null, { fallback: 'nie' })).toBe('nie');
  });

  test('a Date object is as good as a string', () => {
    const d = new Date(ISO);
    expect(withLocale('de', () => fmtDateTime(d))).toBe(withLocale('de', () => fmtDateTime(ISO)));
  });

  test('an epoch number is a timestamp too', () => {
    const ms = Date.parse(ISO);
    expect(withLocale('de', () => fmtDateTime(ms))).toBe(withLocale('de', () => fmtDateTime(ISO)));
  });
});
