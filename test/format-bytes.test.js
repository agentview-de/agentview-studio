// Writing a file size so a person can read it.
//
// The app carried three copies of this function and two of them disagreed with
// the third: the same 512-byte file read "512 B" in the cloud picker and
// "512.0 B" in the asset library — a decimal on a count of bytes, which says
// nothing. All three built the number with toFixed, which is locale-blind, so a
// German Studio printed "1.5 MB" while its own menu widget had already been
// taught to write "1,5". Same lesson as the dates next door.
//
// Pure: Intl and the i18n locale switch, no DOM.

import { test, expect, describe } from './runner.js';
import { fmtBytes } from '../admin/format-bytes.js';
import { setLocale, getLocale } from '../admin/i18n.js';

const withLocale = (loc, fn) => {
  const before = getLocale();
  setLocale(loc);
  try { return fn(); } finally { setLocale(before); }
};

describe('sizes · one way to write a file size', () => {
  test('REGRESSION: bytes never carry a decimal', () => {
    expect(withLocale('en', () => fmtBytes(512))).toBe('512 B');
    expect(withLocale('en', () => fmtBytes(1))).toBe('1 B');
    expect(withLocale('en', () => fmtBytes(1023))).toBe('1,023 B');
  });

  test('REGRESSION: the decimal separator is the reader’s', () => {
    // 1.5 MB. The same number, written the way each audience writes it.
    const n = Math.round(1.5 * 1024 * 1024);
    expect(withLocale('en', () => fmtBytes(n))).toBe('1.5 MB');
    expect(withLocale('de', () => fmtBytes(n))).toBe('1,5 MB');
  });

  test('a decimal only while it still says something', () => {
    // Below ten: one place. At ten and above it is noise.
    expect(withLocale('en', () => fmtBytes(1536))).toBe('1.5 KB');
    expect(withLocale('en', () => fmtBytes(12 * 1024))).toBe('12 KB');
    expect(withLocale('en', () => fmtBytes(999 * 1024))).toBe('999 KB');
  });

  test('it climbs the units and stops at the top', () => {
    expect(withLocale('en', () => fmtBytes(1024))).toBe('1 KB');
    expect(withLocale('en', () => fmtBytes(1024 ** 2))).toBe('1 MB');
    expect(withLocale('en', () => fmtBytes(1024 ** 3))).toBe('1 GB');
    expect(withLocale('en', () => fmtBytes(1024 ** 4))).toBe('1 TB');
    // Past terabytes it keeps counting in TB rather than inventing a unit.
    expect(withLocale('en', () => fmtBytes(5 * 1024 ** 5))).toContain('TB');
  });

  test('an empty slot is 0 B; a size nobody reported is a dash', () => {
    // These are different things, and the old copies printed both as '—'.
    expect(withLocale('en', () => fmtBytes(0))).toBe('0 B');
    for (const v of [null, undefined, '', 'viel', NaN, -1]) {
      expect(fmtBytes(v)).toBe('—');
    }
    expect(fmtBytes(null, { fallback: 'unbekannt' })).toBe('unbekannt');
  });

  test('a numeric string off the wire is a number', () => {
    expect(withLocale('en', () => fmtBytes('2048'))).toBe('2 KB');
  });
});
