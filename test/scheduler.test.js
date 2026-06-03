// Tests for shared/scheduler-core.js — the pure visibility gate shared by the
// admin slide-card badge and the player's skip-invisible-slides loop.
//
// `now` is always injected so the suite is deterministic regardless of the CI
// machine's wall-clock. Two timezone subtleties the module bakes in, mirrored
// here so the tests stay stable on any host:
//   - dateRange uses todayISO() = now.toISOString().slice(0,10) → a UTC date.
//     We build the probe with Date.UTC(...) at midday so it can't slip a day.
//   - daysOfWeek/timeRanges use LOCAL getDay()/toTimeString(). We build those
//     probes with the local `new Date(y, m, d, h, mi)` constructor so the local
//     weekday and HH:MM are exactly what we wrote.
import { describe, test, expect } from './runner.js';
import { isSlideVisible, filterVisible } from '../shared/scheduler-core.js';

// A UTC instant at 12:00 on the given calendar date — used for dateRange checks
// (todayISO is UTC-based) so the date can never roll over a boundary by an hour.
const utcNoon = (y, mo, d) => new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
// A LOCAL instant — used for daysOfWeek / timeRanges (those read local time).
const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0);

describe('scheduler-core · no schedule', () => {
  test('slide without a schedule is always visible', () => {
    expect(isSlideVisible({}, utcNoon(2026, 5, 31))).toBe(true);
    expect(isSlideVisible({ schedule: null }, utcNoon(2026, 5, 31))).toBe(true);
  });

  test('null / undefined slide is treated as visible', () => {
    expect(isSlideVisible(null, utcNoon(2026, 5, 31))).toBe(true);
    expect(isSlideVisible(undefined, utcNoon(2026, 5, 31))).toBe(true);
  });

  test('empty schedule object (no conditions) is visible', () => {
    expect(isSlideVisible({ schedule: {} }, utcNoon(2026, 5, 31))).toBe(true);
  });
});

describe('scheduler-core · dateRange', () => {
  const slide = { schedule: { dateRange: { from: '2026-05-10', to: '2026-05-20' } } };

  test('before the from boundary → hidden', () => {
    expect(isSlideVisible(slide, utcNoon(2026, 5, 9))).toBe(false);
  });

  test('on the from boundary → visible (inclusive)', () => {
    expect(isSlideVisible(slide, utcNoon(2026, 5, 10))).toBe(true);
  });

  test('inside the range → visible', () => {
    expect(isSlideVisible(slide, utcNoon(2026, 5, 15))).toBe(true);
  });

  test('on the to boundary → visible (inclusive)', () => {
    expect(isSlideVisible(slide, utcNoon(2026, 5, 20))).toBe(true);
  });

  test('after the to boundary → hidden', () => {
    expect(isSlideVisible(slide, utcNoon(2026, 5, 21))).toBe(false);
  });

  test('open-ended "from" only — anything on/after is visible', () => {
    const s = { schedule: { dateRange: { from: '2026-05-10' } } };
    expect(isSlideVisible(s, utcNoon(2026, 5, 9))).toBe(false);
    expect(isSlideVisible(s, utcNoon(2026, 12, 31))).toBe(true);
  });

  test('open-ended "to" only — anything on/before is visible', () => {
    const s = { schedule: { dateRange: { to: '2026-05-20' } } };
    expect(isSlideVisible(s, utcNoon(2026, 1, 1))).toBe(true);
    expect(isSlideVisible(s, utcNoon(2026, 5, 21))).toBe(false);
  });
});

describe('scheduler-core · daysOfWeek (ISO Mon=1 … Sun=7)', () => {
  // 2026-06-01 is a Monday. The seven consecutive local dates below therefore
  // map cleanly onto ISO 1..7, which lets us assert the getDay()→ISO mapping.
  const MON = local(2026, 6, 1);   // ISO 1
  const TUE = local(2026, 6, 2);   // ISO 2
  const WED = local(2026, 6, 3);   // ISO 3
  const THU = local(2026, 6, 4);   // ISO 4
  const FRI = local(2026, 6, 5);   // ISO 5
  const SAT = local(2026, 6, 6);   // ISO 6
  const SUN = local(2026, 6, 7);   // ISO 7

  test('Monday maps to 1 and Sunday maps to 7', () => {
    expect(isSlideVisible({ schedule: { daysOfWeek: [1] } }, MON)).toBe(true);
    expect(isSlideVisible({ schedule: { daysOfWeek: [1] } }, SUN)).toBe(false);
    expect(isSlideVisible({ schedule: { daysOfWeek: [7] } }, SUN)).toBe(true);
    expect(isSlideVisible({ schedule: { daysOfWeek: [7] } }, MON)).toBe(false);
  });

  test('a weekday set (Mon..Fri) is visible on weekdays, hidden on the weekend', () => {
    const weekdays = { schedule: { daysOfWeek: [1, 2, 3, 4, 5] } };
    for (const d of [MON, TUE, WED, THU, FRI]) expect(isSlideVisible(weekdays, d)).toBe(true);
    for (const d of [SAT, SUN]) expect(isSlideVisible(weekdays, d)).toBe(false);
  });

  test('empty daysOfWeek array imposes no day restriction (visible any day)', () => {
    const s = { schedule: { daysOfWeek: [] } };
    for (const d of [MON, SAT, SUN]) expect(isSlideVisible(s, d)).toBe(true);
  });
});

describe('scheduler-core · timeRanges', () => {
  const day = (h, mi = 0) => local(2026, 6, 1, h, mi);  // any fixed local date

  test('inside a same-day window → visible; outside → hidden', () => {
    const s = { schedule: { timeRanges: [{ start: '09:00', end: '17:00' }] } };
    expect(isSlideVisible(s, day(12, 30))).toBe(true);
    expect(isSlideVisible(s, day(8, 59))).toBe(false);
    expect(isSlideVisible(s, day(17, 30))).toBe(false);
  });

  test('window boundaries are inclusive at both ends', () => {
    const s = { schedule: { timeRanges: [{ start: '09:00', end: '17:00' }] } };
    expect(isSlideVisible(s, day(9, 0))).toBe(true);
    expect(isSlideVisible(s, day(17, 0))).toBe(true);
  });

  test('OVERNIGHT wrap-around 22:00–06:00: 23:30 and 05:00 visible, 12:00 hidden', () => {
    const s = { schedule: { timeRanges: [{ start: '22:00', end: '06:00' }] } };
    expect(isSlideVisible(s, day(23, 30))).toBe(true);   // late evening, before midnight
    expect(isSlideVisible(s, day(5, 0))).toBe(true);     // early morning, after midnight
    expect(isSlideVisible(s, day(12, 0))).toBe(false);   // midday → outside the wrap
    expect(isSlideVisible(s, day(22, 0))).toBe(true);    // inclusive start
    expect(isSlideVisible(s, day(6, 0))).toBe(true);     // inclusive end
  });

  test('multiple timeRanges match if ANY range contains now', () => {
    const s = { schedule: { timeRanges: [
      { start: '09:00', end: '11:00' },
      { start: '14:00', end: '16:00' },
    ] } };
    expect(isSlideVisible(s, day(10, 0))).toBe(true);    // in first range
    expect(isSlideVisible(s, day(15, 0))).toBe(true);    // in second range
    expect(isSlideVisible(s, day(12, 30))).toBe(false);  // gap between ranges
  });

  test('empty timeRanges array imposes no time restriction', () => {
    expect(isSlideVisible({ schedule: { timeRanges: [] } }, day(3, 0))).toBe(true);
  });
});

describe('scheduler-core · combined conditions (AND)', () => {
  // dateRange + daysOfWeek + timeRanges must ALL pass. Built on local Mondays so
  // the local weekday/time and the UTC date line up for our chosen instants.
  // 2026-06-01 12:00 local is well inside the 2026-06 UTC day for any sane tz.
  const slide = { schedule: {
    dateRange: { from: '2026-06-01', to: '2026-06-30' },
    daysOfWeek: [1, 2, 3, 4, 5],            // weekdays
    timeRanges: [{ start: '09:00', end: '17:00' }],
  } };

  test('all three satisfied → visible', () => {
    // Mon 2026-06-01, 12:00 local.
    expect(isSlideVisible(slide, local(2026, 6, 1, 12, 0))).toBe(true);
  });

  test('date in range + weekday ok but time outside → hidden', () => {
    expect(isSlideVisible(slide, local(2026, 6, 1, 20, 0))).toBe(false);
  });

  test('date in range + time ok but wrong weekday (Saturday) → hidden', () => {
    // 2026-06-06 is a Saturday.
    expect(isSlideVisible(slide, local(2026, 6, 6, 12, 0))).toBe(false);
  });

  test('weekday + time ok but date out of range → hidden', () => {
    // 2026-07-06 is a Monday at 12:00 — fails only the dateRange.
    expect(isSlideVisible(slide, local(2026, 7, 6, 12, 0))).toBe(false);
  });
});

describe('scheduler-core · filterVisible', () => {
  test('keeps only the visible slides from a mixed list', () => {
    const always = { id: 'a' };
    const future = { id: 'b', schedule: { dateRange: { from: '2026-06-01' } } };
    const past = { id: 'c', schedule: { dateRange: { to: '2026-04-30' } } };
    const now = utcNoon(2026, 5, 15);
    const visible = filterVisible([always, future, past], now);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('a');
  });

  test('null / undefined slide list yields an empty array', () => {
    expect(filterVisible(null, utcNoon(2026, 5, 15))).toEqual([]);
    expect(filterVisible(undefined, utcNoon(2026, 5, 15))).toEqual([]);
  });

  test('all-visible list is returned intact', () => {
    const list = [{ id: 'x' }, { id: 'y', schedule: {} }];
    expect(filterVisible(list, utcNoon(2026, 5, 15))).toHaveLength(2);
  });
});
