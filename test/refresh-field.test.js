// Seconds in, milliseconds out — and the floor that protects whoever hosts the
// data.
//
// The rule was prose: "clamp positive values UP via Math.max(5000,
// refreshSec * 1000), data-table.js is the reference". THIRTEEN widgets wrote
// that expression by hand, and all thirteen got it right — which is exactly the
// situation in which the fourteenth will not. A display polling somebody's API
// every second is a small denial-of-service that runs unattended, and nothing
// in the code would have said so.
//
// Pure: arithmetic and a sentinel.

import { test, expect, describe } from './runner.js';
import { refreshIntervalMs, REFRESH_MIN_MS, refreshSecField } from '../shared/refresh-field.js';

describe('refresh interval · the floor is the point', () => {
  test('REGRESSION: a positive value below the floor is raised to it', () => {
    for (const sec of [0.1, 1, 2, 4, 4.999]) {
      expect(refreshIntervalMs(sec)).toBe(REFRESH_MIN_MS);
    }
    expect(REFRESH_MIN_MS).toBe(5000);
  });

  test('a value above the floor is passed through in milliseconds', () => {
    expect(refreshIntervalMs(5)).toBe(5000);
    expect(refreshIntervalMs(30)).toBe(30000);
    expect(refreshIntervalMs(900)).toBe(900000);
    expect(refreshIntervalMs(7.5)).toBe(7500);
  });

  test('zero means "fetch once" — no timer, not a fast one', () => {
    // The sentinel the field documents. Turning it into 5000 would make every
    // one-shot widget start polling.
    for (const v of [0, -1, -900, null, undefined, '', 'bald', NaN, Infinity]) {
      expect(refreshIntervalMs(v)).toBe(0);
    }
  });

  test('a numeric string off a stored playlist is a number', () => {
    expect(refreshIntervalMs('60')).toBe(60000);
    expect(refreshIntervalMs('1')).toBe(REFRESH_MIN_MS);
    expect(refreshIntervalMs('0')).toBe(0);
  });

  test('a caller may raise the floor, and the sentinel still wins', () => {
    expect(refreshIntervalMs(1, { min: 60000 })).toBe(60000);
    expect(refreshIntervalMs(120, { min: 60000 })).toBe(120000);
    expect(refreshIntervalMs(0, { min: 60000 })).toBe(0);
  });

  test('the field and the floor tell the same story', () => {
    // The help text promises the floor; refreshIntervalMs is what keeps it.
    const f = refreshSecField();
    expect(f.key).toBe('refreshSec');
    expect(f.type).toBe('duration');       // seconds convention, never a number
    expect(f.min).toBe(0);                 // the '0 = once' sentinel stays reachable
    expect(f.help).toContain('5');
  });
});
