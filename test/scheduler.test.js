// Tests for shared/scheduler-core.js — the pure visibility gate shared by the
// admin slide-card badge and the player's skip-invisible-slides loop.
//
// `now` is always injected so the suite is deterministic regardless of the CI
// machine's wall-clock. Every probe is built with the LOCAL date constructor,
// because all three checks read the display's local clock.
//
// That used to be true of two of them. dateRange read `now.toISOString()` — the
// UTC day — while the weekday and time-of-day checks read local time, so the
// same schedule was evaluated in two timezones and the two disagreed for the
// whole of the display's offset. This suite worked around it by probing at
// midday UTC, which is exactly the hour of the day where the discrepancy cannot
// show. The workaround is gone and the boundary cases below take its place.
import { describe, test, expect } from './runner.js';
import { scheduleProblems, isSlideVisible, filterVisible } from '../shared/scheduler-core.js';

// A LOCAL instant. One helper, because the module has one clock.
const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0);
// Midday, where a UTC/local mix-up cannot show — the hour the old suite probed.
const noon = (y, mo, d) => local(y, mo, d, 12, 0);

describe('scheduler-core · no schedule', () => {
  test('slide without a schedule is always visible', () => {
    expect(isSlideVisible({}, noon(2026, 5, 31))).toBe(true);
    expect(isSlideVisible({ schedule: null }, noon(2026, 5, 31))).toBe(true);
  });

  test('null / undefined slide is treated as visible', () => {
    expect(isSlideVisible(null, noon(2026, 5, 31))).toBe(true);
    expect(isSlideVisible(undefined, noon(2026, 5, 31))).toBe(true);
  });

  test('empty schedule object (no conditions) is visible', () => {
    expect(isSlideVisible({ schedule: {} }, noon(2026, 5, 31))).toBe(true);
  });
});

describe('scheduler-core · dateRange', () => {
  const slide = { schedule: { dateRange: { from: '2026-05-10', to: '2026-05-20' } } };

  test('before the from boundary → hidden', () => {
    expect(isSlideVisible(slide, noon(2026, 5, 9))).toBe(false);
  });

  test('on the from boundary → visible (inclusive)', () => {
    expect(isSlideVisible(slide, noon(2026, 5, 10))).toBe(true);
  });

  test('inside the range → visible', () => {
    expect(isSlideVisible(slide, noon(2026, 5, 15))).toBe(true);
  });

  test('on the to boundary → visible (inclusive)', () => {
    expect(isSlideVisible(slide, noon(2026, 5, 20))).toBe(true);
  });

  test('after the to boundary → hidden', () => {
    expect(isSlideVisible(slide, noon(2026, 5, 21))).toBe(false);
  });

  // The two hours that used to belong to the wrong day. Both cases fail
  // wherever the display is not sitting exactly on UTC — which is every
  // display this project was built for.
  test('REGRESSION: the range opens at local midnight, not at UTC midnight', () => {
    // A minute into the from-day. East of Greenwich the UTC clock still says
    // yesterday, and the slide stayed dark for the length of the offset.
    expect(isSlideVisible(slide, local(2026, 5, 10, 0, 1))).toBe(true);
    expect(isSlideVisible(slide, local(2026, 5, 9, 23, 59))).toBe(false);
  });

  test('REGRESSION: the range closes at local midnight too', () => {
    // A minute before the to-day ends, and a minute after. West of Greenwich
    // the UTC clock has already rolled over, and the campaign went dark early;
    // east of it, the campaign kept playing into the small hours.
    expect(isSlideVisible(slide, local(2026, 5, 20, 23, 59))).toBe(true);
    expect(isSlideVisible(slide, local(2026, 5, 21, 0, 1))).toBe(false);
  });

  test('a date range and a time range describe the same day', () => {
    // The pair an operator actually writes: "the 20th, 22:00 to 02:00". The
    // wrap-around window belongs to the 20th; at 23:30 on the 20th both
    // conditions hold, and at 01:00 on the 21st the DATE has run out.
    const s = { schedule: { dateRange: { to: '2026-05-20' }, timeRanges: [{ start: '22:00', end: '02:00' }] } };
    expect(isSlideVisible(s, local(2026, 5, 20, 23, 30))).toBe(true);
    expect(isSlideVisible(s, local(2026, 5, 21, 1, 0))).toBe(false);
  });

  test('open-ended "from" only — anything on/after is visible', () => {
    const s = { schedule: { dateRange: { from: '2026-05-10' } } };
    expect(isSlideVisible(s, noon(2026, 5, 9))).toBe(false);
    expect(isSlideVisible(s, noon(2026, 12, 31))).toBe(true);
  });

  test('open-ended "to" only — anything on/before is visible', () => {
    const s = { schedule: { dateRange: { to: '2026-05-20' } } };
    expect(isSlideVisible(s, noon(2026, 1, 1))).toBe(true);
    expect(isSlideVisible(s, noon(2026, 5, 21))).toBe(false);
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
    const now = noon(2026, 5, 15);
    const visible = filterVisible([always, future, past], now);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('a');
  });

  test('null / undefined slide list yields an empty array', () => {
    expect(filterVisible(null, noon(2026, 5, 15))).toEqual([]);
    expect(filterVisible(undefined, noon(2026, 5, 15))).toEqual([]);
  });

  test('all-visible list is returned intact', () => {
    const list = [{ id: 'x' }, { id: 'y', schedule: {} }];
    expect(filterVisible(list, noon(2026, 5, 15))).toHaveLength(2);
  });
});

// A night that runs past midnight belongs to the evening it started in.
//
// `hhmmInRange` has always supported the wrap ("22:00 → 06:00"). The weekday
// check did not: it tested the INSTANT's weekday, so a bar with a perfectly
// ordinary "Fri + Sat, 20:00–03:00" board got it wrong twice in the same
// configuration — Sunday 01:00, the end of the Saturday night it was scheduled
// for, went DARK, and Friday 01:00, the Thursday night nobody asked for, came
// on. Both errors, one setup, no warning.
//
// The date range is deliberately NOT treated this way — see the comment on
// dateAllowed, and the "date range and a time range describe the same day"
// test above, whose decision this leaves standing.
describe('scheduler-core · a night belongs to the evening it started in', () => {
  const bar = { schedule: { daysOfWeek: [5, 6], timeRanges: [{ start: '20:00', end: '03:00' }] } };
  // 2026-08-28 is a Friday.
  const fri = (h, m = 0) => local(2026, 8, 28, h, m);
  const sat = (h, m = 0) => local(2026, 8, 29, h, m);
  const sun = (h, m = 0) => local(2026, 8, 30, h, m);

  test('REGRESSION: Saturday night does not end at midnight', () => {
    expect(isSlideVisible(bar, sat(21))).toBe(true);
    expect(isSlideVisible(bar, sun(1))).toBe(true);      // still Saturday night
    expect(isSlideVisible(bar, sun(2, 59))).toBe(true);
    expect(isSlideVisible(bar, sun(3, 1))).toBe(false);  // …and then it closes
  });

  test('REGRESSION: Thursday night is not scheduled and does not show', () => {
    expect(isSlideVisible(bar, fri(1))).toBe(false);
    expect(isSlideVisible(bar, fri(19, 59))).toBe(false);
    expect(isSlideVisible(bar, fri(20, 1))).toBe(true);  // …the Friday one opens
  });

  test('the Friday night still spills into Saturday', () => {
    expect(isSlideVisible(bar, sat(1))).toBe(true);
    expect(isSlideVisible(bar, sat(4))).toBe(false);
  });

  test('an ordinary daytime window is untouched', () => {
    const office = { schedule: { daysOfWeek: [1, 2, 3, 4, 5], timeRanges: [{ start: '09:00', end: '18:00' }] } };
    expect(isSlideVisible(office, local(2026, 8, 31, 10))).toBe(true);   // Monday
    expect(isSlideVisible(office, local(2026, 8, 31, 20))).toBe(false);
    expect(isSlideVisible(office, sat(10))).toBe(false);
  });

  test('two windows on one slide are judged one at a time', () => {
    // Morning show every weekday, night show only at the weekend.
    const s = { schedule: { daysOfWeek: [6], timeRanges: [{ start: '07:00', end: '09:00' }, { start: '22:00', end: '02:00' }] } };
    expect(isSlideVisible(s, sat(8))).toBe(true);        // Saturday morning
    expect(isSlideVisible(s, sat(23))).toBe(true);       // Saturday night
    expect(isSlideVisible(s, sun(1))).toBe(true);        // …running on
    expect(isSlideVisible(s, sun(8))).toBe(false);       // Sunday morning is not
    expect(isSlideVisible(s, fri(23))).toBe(false);
  });

  test('the day it belongs to survives a clock change', () => {
    // 2026-10-25 is the Sunday the clocks go back in Europe; the window that
    // started on Saturday must not lose its day to a 25-hour night. `setDate`
    // rather than "minus 86 400 000 ms" is what makes this hold.
    const sat24 = { schedule: { daysOfWeek: [6], timeRanges: [{ start: '22:00', end: '05:00' }] } };
    expect(isSlideVisible(sat24, local(2026, 10, 24, 23))).toBe(true);
    expect(isSlideVisible(sat24, local(2026, 10, 25, 2, 30))).toBe(true);
    expect(isSlideVisible(sat24, local(2026, 10, 25, 4, 30))).toBe(true);
    expect(isSlideVisible(sat24, local(2026, 10, 25, 22))).toBe(false); // Sunday
  });
});

// A day-parting schedule fails invisibly. The slide simply never appears, on a
// screen nobody is standing in front of, and the playlist looks perfectly
// healthy — so the editor has to say it at the moment the mistake is made. It
// validated nothing at all.
describe('scheduler-core · what is wrong with this schedule', () => {
  const at = local(2026, 8, 29, 12);

  test('REGRESSION: an inverted date range can never show anything', () => {
    // Both ends of the test fail on every day of the year, and the two date
    // inputs accept the pair without a murmur.
    const s = { dateRange: { from: '2026-09-30', to: '2026-09-01' } };
    expect(scheduleProblems(s, at)).toEqual(['dateRangeInverted']);
    // …and it really is never visible, which is the point.
    expect(isSlideVisible({ schedule: s }, local(2026, 9, 15, 12))).toBe(false);
  });

  test('a window with no length is one minute a day', () => {
    expect(scheduleProblems({ timeRanges: [{ start: '18:00', end: '18:00' }] }, at))
      .toEqual(['timeRangeEmpty']);
    expect(isSlideVisible({ schedule: { timeRanges: [{ start: '18:00', end: '18:00' }] } }, local(2026, 8, 29, 18, 0))).toBe(true);
    expect(isSlideVisible({ schedule: { timeRanges: [{ start: '18:00', end: '18:00' }] } }, local(2026, 8, 29, 18, 1))).toBe(false);
  });

  test('a half-filled window is reported, not silently ignored', () => {
    expect(scheduleProblems({ timeRanges: [{ start: '18:00', end: '' }] }, at)).toEqual(['timeRangeIncomplete']);
    expect(scheduleProblems({ timeRanges: [{ start: '', end: '06:00' }] }, at)).toEqual(['timeRangeIncomplete']);
  });

  test('an ended campaign is worth saying out loud', () => {
    // Not a mistake — campaigns end — but the slide is still in the playlist
    // and will never play again.
    expect(scheduleProblems({ dateRange: { to: '2026-08-01' } }, at)).toEqual(['expired']);
    expect(scheduleProblems({ dateRange: { to: '2026-12-01' } }, at)).toEqual([]);
    // Today is the last day, not a day too late.
    expect(scheduleProblems({ dateRange: { to: '2026-08-29' } }, at)).toEqual([]);
  });

  test('an inverted range is not ALSO reported as expired', () => {
    // One clear sentence beats two that argue with each other.
    expect(scheduleProblems({ dateRange: { from: '2026-09-30', to: '2026-01-01' } }, at))
      .toEqual(['dateRangeInverted']);
  });

  test('a healthy schedule says nothing at all', () => {
    expect(scheduleProblems({ daysOfWeek: [5, 6], timeRanges: [{ start: '20:00', end: '03:00' }] }, at)).toEqual([]);
    expect(scheduleProblems({}, at)).toEqual([]);
    expect(scheduleProblems(null, at)).toEqual([]);
    expect(scheduleProblems(undefined, at)).toEqual([]);
  });

  test('each problem is named once, however many windows repeat it', () => {
    const s = { timeRanges: [{ start: '9:00', end: '9:00' }, { start: '10:00', end: '10:00' }] };
    expect(scheduleProblems(s, at)).toEqual(['timeRangeEmpty']);
  });
});
