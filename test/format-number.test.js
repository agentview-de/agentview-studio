// The two widgets that exist to show numbers showed them in English.
//
// Both had localised the format nobody selects and left the DEFAULT one
// hard-coded:
//
//   kpi-cards  `toLocaleString(locale)` below a thousand, `(n/1000).toFixed(1)
//              + 'k'` above it — so one German board read "987,4" on one card
//              and "1.2k" on the next. Two number formats in one grid.
//   chart      `compactNum()` (the default tick formatter) and the `percent`
//              format both wrote toFixed, i.e. always a dot. The file's own
//              comment already said why that matters: a chart reading 1,234.5
//              in a German foyer is off by three orders of magnitude to anyone
//              who reads it as 1234,5.
//
// The menu widget fixed this for prices a while ago; this is that fix, shared.

import { test, expect, describe } from './runner.js';
import { formatNumber, formatCompact, formatPercent } from '../shared/format-number.js';

describe('format-number · the reader decides', () => {
  test('REGRESSION: the abbreviated form carries the decimal mark too', () => {
    expect(formatCompact(1234.56, 'de')).toBe('1,2k');
    expect(formatCompact(1234.56, 'en')).toBe('1.2k');
    expect(formatCompact(1_200_000, 'de')).toBe('1,2M');
    expect(formatCompact(1_200_000, 'en')).toBe('1.2M');
  });

  test('REGRESSION: one board, one format — small and large agree', () => {
    // The pair that used to sit side by side reading "987,4" and "1.2k".
    expect(formatCompact(987.4, 'de')).toBe('987,4');
    expect(formatCompact(1234.56, 'de')).toBe('1,2k');
  });

  test('a whole number keeps no empty fraction', () => {
    expect(formatCompact(1000, 'en')).toBe('1k');
    expect(formatCompact(1000, 'de')).toBe('1k');
    expect(formatCompact(42, 'de')).toBe('42');
  });

  test('REGRESSION: a percentage is spaced the way its language spaces it', () => {
    // German puts a non-breaking space before the sign; English does not.
    expect(formatPercent(6.2, 'de').replace(/\u00a0/g, ' ')).toBe('6,2 %');
    expect(formatPercent(6.2, 'en')).toBe('6.2%');
    expect(formatPercent(0.4, 'de').replace(/\u00a0/g, ' ')).toBe('0,4 %');
    expect(formatPercent(75, 'de', { maximumFractionDigits: 0 }).replace(/\u00a0/g, ' ')).toBe('75 %');
  });

  test('the plain form groups the way its language groups', () => {
    expect(formatNumber(1234.56, 'de')).toBe('1.234,56');
    expect(formatNumber(1234.56, 'en')).toBe('1,234.56');
  });

  test('an empty locale means "the device decides", not a crash', () => {
    // The locale-field contract: '' falls through to the device default.
    expect(typeof formatCompact(1234, '')).toBe('string');
    expect(typeof formatNumber(1234, undefined)).toBe('string');
    // …and a locale the browser cannot parse must not take the widget down.
    expect(typeof formatNumber(1234, 'de_DE')).toBe('string');
    expect(typeof formatPercent(5, 'not a locale at all')).toBe('string');
  });
});

describe('format-number · things that are not numbers', () => {
  test('a blank is blank, not a confident zero', () => {
    // Number(null) and Number('') are both 0, which would print "0" where
    // there is no reading at all.
    expect(formatCompact(null, 'de')).toBe('');
    expect(formatCompact(undefined, 'de')).toBe('');
    expect(formatCompact('', 'de')).toBe('');
    expect(formatNumber(null, 'de')).toBe('');
    expect(formatPercent(null, 'de')).toBe('');
  });

  test('a real zero still prints', () => {
    expect(formatNumber(0, 'de')).toBe('0');
    expect(formatCompact(0, 'de')).toBe('0');
  });

  test('text passes through instead of becoming NaN on a wall', () => {
    expect(formatCompact('N/A', 'de')).toBe('N/A');
    expect(formatNumber('market price', 'de')).toBe('market price');
  });

  test('numeric strings are still numbers — url-sourced JSON sends those', () => {
    expect(formatCompact('1234.5', 'de')).toBe('1,2k');
    expect(formatPercent('6.2', 'de').replace(/\u00a0/g, ' ')).toBe('6,2 %');
  });

  test('a negative reading keeps its sign and its abbreviation', () => {
    expect(formatCompact(-1234, 'de')).toBe('-1,2k');
    expect(formatPercent(-3.5, 'en')).toBe('-3.5%');
  });
});

describe('kpi delta · the arrow says it once', () => {
  test('a falling reading is not "▼ -3,5 %"', () => {
    // The arrow already states the direction; repeating it as a minus sign is
    // the same fact twice, and the sign is the half a reader ten metres away
    // cannot make out.
    const shown = (d, loc) => `${d >= 0 ? '▲' : '▼'} ${formatPercent(Math.abs(d), loc)}`;
    expect(shown(-3.5, 'de').replace(/\u00a0/g, ' ')).toBe('▼ 3,5 %');
    expect(shown(6.2, 'de').replace(/\u00a0/g, ' ')).toBe('▲ 6,2 %');
    expect(shown(-3.5, 'en')).toBe('▼ 3.5%');
    expect(shown(0, 'en')).toBe('▲ 0%');
  });
});
