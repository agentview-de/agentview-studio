// The calendar widget's five views.
//
// Three of them placed an event on its START day and nowhere else. A workshop
// that runs Monday to Wednesday appeared once, on Monday; the Today view — the
// one a meeting-room door panel runs — said "Nothing scheduled today 🎉" on
// Tuesday while the room was full. Now & Next had it right all along (start ≤
// now < end), so the same widget contradicted itself between two screens in the
// same building.
//
// The dates here are pinned to a fixed "today" by constructing every event
// relative to the real current date. A calendar test that hardcodes a date
// passes until that date is in the past, which is the one failure mode a
// calendar must not have.
//
// Pure: escapeHtml is DOM-free and Intl is built in.

import { test, expect, describe } from './runner.js';
import { renderCalendarView, CALENDAR_VIEWS, CALENDAR_VIEW_OPTIONS } from '../shared/calendar-views.js';

// Local midnight of today ± n days, plus an optional time of day.
const day = (n, h = 0, m = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  d.setHours(h, m, 0, 0);
  return d;
};
const ev = (o) => ({ summary: 'Termin', location: '', allDay: false, end: null, ...o });

// A three-day workshop: starts yesterday morning, ends tomorrow afternoon.
const WORKSHOP = ev({ summary: 'WORKSHOP', start: day(-1, 9), end: day(1, 17) });
// …and a normal meeting today, so "the list is not empty" cannot pass by luck.
const MEETING = ev({ summary: 'MEETING', start: day(0, 14), end: day(0, 15) });

describe('calendar · an event lasts as long as it lasts', () => {
  test('REGRESSION: Today shows a workshop that started yesterday', () => {
    const html = renderCalendarView('today', [WORKSHOP], {});
    expect(html).toContain('WORKSHOP');
    expect(html).notToContain('Nothing scheduled');
    // Not "09:00": it did not start today, and printing a start time from
    // another day is how a door panel sends somebody to the wrong room.
    expect(html).notToContain('09:00');
    expect(html).toContain('↳');
  });

  test('REGRESSION: the week grid repeats it across every day it runs', () => {
    // Monday-based grid, so a ±1 day event always straddles at least two of
    // the seven columns wherever "today" happens to fall.
    const html = renderCalendarView('week', [WORKSHOP], { weekDays: 'full' });
    const days = (html.match(/WORKSHOP/g) ?? []).length;
    expect(days >= 2).toBeTruthy();
    expect(days <= 3).toBeTruthy();
  });

  test('REGRESSION: the month grid does too', () => {
    const html = renderCalendarView('month', [WORKSHOP], {});
    expect((html.match(/WORKSHOP/g) ?? []).length >= 2).toBeTruthy();
  });

  test('the day it starts still shows the clock time, not a marker', () => {
    const html = renderCalendarView('today', [MEETING], {});
    expect(html).toContain('14:00');
    expect(html).notToContain('↳');
  });

  test('the day it ends shows when it ends', () => {
    const ending = ev({ summary: 'ENDET', start: day(-2, 9), end: day(0, 11, 30) });
    expect(renderCalendarView('today', [ending], {})).toContain('↳ 11:30');
  });

  test('an all-day event does not bleed into the next day', () => {
    // ICS all-day events carry an EXCLUSIVE end: one day off, ending at the
    // next midnight. Half-open comparison keeps it in one cell.
    const holiday = ev({ summary: 'FEIERTAG', start: day(0), end: day(1), allDay: true });
    const html = renderCalendarView('week', [holiday], { weekDays: 'full' });
    expect((html.match(/FEIERTAG/g) ?? []).length).toBe(1);
    // …and a meeting that runs to midnight is not tomorrow's problem either.
    const late = ev({ summary: 'SPAET', start: day(0, 20), end: day(1) });
    expect((renderCalendarView('week', [late], { weekDays: 'full' }).match(/SPAET/g) ?? []).length).toBe(1);
  });

  test('a day with nothing on it still says so', () => {
    const html = renderCalendarView('today', [ev({ summary: 'MORGEN', start: day(3, 9), end: day(3, 10) })], {});
    expect(html).toContain('Nothing scheduled');
    expect(html).notToContain('MORGEN');
  });
});

describe('calendar · the room panel and the grids agree', () => {
  test('REGRESSION: what Now & Next calls busy, Today lists', () => {
    // The contradiction this fix removes: the door panel said Busy, the Today
    // view on the wall next to it said the room was free.
    const running = ev({ summary: 'LAEUFT', start: day(-1, 9), end: day(1, 17) });
    expect(renderCalendarView('now-next', [running], {})).toContain('Busy');
    expect(renderCalendarView('today', [running], {})).toContain('LAEUFT');
  });
});

describe('calendar · the look-ahead window ends at midnight', () => {
  // "Only show events within N days" draws its line at a local midnight. The
  // line used to be built by adding a flat 24 hours to a midnight — which lands
  // at 23:00 or 01:00 on the two days a year the clocks move, so the window
  // quietly gained or lost an hour and an event just inside it fell out.
  const withDays = (n, evs) => renderCalendarView('agenda', evs, { daysAhead: n, maxItems: 50, hidePast: false });

  test('REGRESSION: the last minute of the last day is still inside', () => {
    // "3 days ahead" includes the whole of day 3 — the behaviour that was
    // there before and is deliberately unchanged. What moved is only where
    // that day ENDS: a real local midnight instead of 24 hours after one.
    const spaet = ev({ summary: 'KURZ-VOR-MITTERNACHT', start: day(3, 23, 59), end: day(4, 0, 30) });
    expect(withDays(3, [spaet])).toContain('KURZ-VOR-MITTERNACHT');
  });

  test('…and the first minute of the day after that is not', () => {
    const drueber = ev({ summary: 'ZU-SPAET', start: day(4, 0, 1), end: day(4, 1, 0) });
    expect(withDays(3, [drueber])).notToContain('ZU-SPAET');
  });

  test('REGRESSION: the window keeps its shape across a clock change', () => {
    // The two days a year a flat 24 hours is not a day. Injected `now` so the
    // instant is the point of the test rather than whatever today happens to
    // be: 27 March 2026, the day before Europe's clocks jump forward.
    //
    // Only meaningful where a clock actually changes — a display running on
    // UTC has no such day, and there the two arithmetics agree.
    const vorTag = new Date(2026, 2, 27, 12, 0);          // 27.03. local noon
    const wechselt = new Date(2026, 2, 29, 3, 0).getTimezoneOffset()
      !== new Date(2026, 2, 27, 3, 0).getTimezoneOffset();
    if (!wechselt) return;
    const at = (d, h, mi) => new Date(2026, 2, d, h, mi);
    const spaet = ev({ summary: 'LETZTE-MINUTE', start: at(29, 23, 59), end: at(30, 0, 30) });
    const drueber = ev({ summary: 'DANACH', start: at(30, 0, 1), end: at(30, 1, 0) });
    const html = renderCalendarView('agenda', [spaet, drueber], { daysAhead: 2, maxItems: 50, hidePast: false, now: vorTag });
    expect(html).toContain('LETZTE-MINUTE');
    expect(html).notToContain('DANACH');
  });

  test('0 means no horizon at all', () => {
    const weit = ev({ summary: 'IN-EINEM-MONAT', start: day(30, 12), end: day(30, 13) });
    expect(withDays(0, [weit])).toContain('IN-EINEM-MONAT');
  });
});

describe('calendar · the week belongs to the audience', () => {
  // The grid column order is readable without a DOM: the first weekday name in
  // the markup is the day the week starts on for that audience.
  const firstColumn = (locale, opts = {}) => {
    const html = renderCalendarView('week', [], { locale, weekDays: 'full', ...opts });
    return html.match(/<span>([^<]+)<\/span>/)?.[1] ?? null;
  };
  const columns = (locale, opts = {}) =>
    [...renderCalendarView('week', [], { locale, ...opts }).matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1]);

  test('REGRESSION: a US week starts on Sunday, a German one on Monday', () => {
    // Both grids were pinned to Monday while the weekday names above them
    // already followed the locale.
    expect(firstColumn('en-US')).toBe('Sun');
    expect(firstColumn('en-GB')).toBe('Mon');
    expect(firstColumn('de-DE')).toBe('Mo');
    expect(firstColumn('ja-JP')).toBe('日');
  });

  test('REGRESSION: the work week drops that locale’s weekend, not always Sat+Sun', () => {
    // Hebrew: the weekend is Friday and Saturday, so the working week runs
    // Sunday to Thursday — five days, but not the five this used to show.
    const he = columns('he-IL', { weekDays: 'work' });
    expect(he).toHaveLength(5);
    expect(he).notToContain('שבת');
    expect(columns('de-DE', { weekDays: 'work' })).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr']);
    expect(columns('en-US', { weekDays: 'work' })).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(columns('de-DE', { weekDays: 'full' })).toHaveLength(7);
  });

  test('the grid still says how many columns it has', () => {
    expect(renderCalendarView('week', [], { locale: 'he-IL', weekDays: 'work' })).toContain('--bb-cal-week-days:5');
    expect(renderCalendarView('week', [], { locale: 'he-IL', weekDays: 'full' })).toContain('--bb-cal-week-days:7');
  });

  test('the month grid starts its rows on the same day the week does', () => {
    const heads = (lc) => [...renderCalendarView('month', [], { locale: lc }).matchAll(/class="bb-cal-mhead">([^<]+)</g)].map(m => m[1]);
    expect(heads('de-DE')[0]).toBe('M');
    expect(heads('en-US')[0]).toBe('S');
    expect(heads('en-US')).toHaveLength(7);
  });

  test('a locale nobody set, or one Intl refuses, still renders a week', () => {
    expect(renderCalendarView('week', [], {}).match(/<span>/g)).toHaveLength(7);
    expect(renderCalendarView('week', [], { locale: 'not a tag' }).match(/<span>/g)).toHaveLength(7);
  });
});

describe('calendar · the views themselves', () => {
  test('every advertised view is a real renderer and every renderer is offered', () => {
    const offered = CALENDAR_VIEW_OPTIONS.map(o => o.value).sort();
    expect(Object.keys(CALENDAR_VIEWS).sort()).toEqual(offered);
    for (const v of offered) expect(typeof CALENDAR_VIEWS[v]).toBe('function');
    // An unknown view falls back to the agenda rather than rendering nothing.
    expect(renderCalendarView('does-not-exist', [MEETING], {})).toContain('MEETING');
  });

  test('summaries and locations are escaped in every view', () => {
    const nasty = ev({ summary: '<img src=x onerror=alert(1)>', location: '"><script>alert(2)</script>', start: day(0, 10), end: day(0, 11) });
    for (const view of CALENDAR_VIEW_OPTIONS.map(o => o.value)) {
      const html = renderCalendarView(view, [nasty], { roomName: '<b>Raum</b>' });
      expect(html).notToContain('<img src=x');
      expect(html).notToContain('<script>alert(2)');
      expect(html).notToContain('<b>Raum</b>');
    }
  });

  test('the audience locale reaches the weekday and month names', () => {
    const html = renderCalendarView('month', [MEETING], { locale: 'de-DE' });
    const german = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    expect(german.some(m => html.includes(m))).toBeTruthy();
  });
});
