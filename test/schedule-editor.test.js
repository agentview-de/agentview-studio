// The weekday chips in the day-parting editor.
//
// The comment above shortDows() has always said the labels are pulled from Intl
// "so they match the rest of the studio" — and then passed `undefined`, which
// asks the BROWSER, not the app. A German Studio in an English browser offered
// "Mon Tue Wed" under the heading "Wochentage". The chips are the one piece of
// this editor that is generated rather than translated, so nothing else drifted
// with them and nobody noticed.
//
// Browser-only: it renders the real editor into a real document.

import { test, expect, describe } from './runner.js';
import { renderScheduleEditor } from '../admin/ui/schedule-editor.js';
import { setLocale, getLocale } from '../admin/i18n.js';

/** The seven short weekday names a given locale produces, Monday first. */
function expectedDows(locale) {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  // 2024-01-01 is a Monday — the same anchor the editor uses.
  return [...Array(7)].map((_, i) => fmt.format(new Date(2024, 0, 1 + i)));
}

function chipsIn(locale) {
  const before = getLocale();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-3000px;top:0;width:400px;';
  document.body.appendChild(host);
  try {
    setLocale(locale);
    renderScheduleEditor(host, {}, () => {});
    const wanted = new Set(expectedDows(locale));
    return [...host.querySelectorAll('button, label')]
      .map(e => e.textContent.trim())
      .filter(txt => wanted.has(txt));
  } finally {
    host.remove();
    setLocale(before);
  }
}

describe('schedule editor · the weekdays speak the Studio’s language', () => {
  test('REGRESSION: German chips under a German heading', () => {
    const de = expectedDows('de');
    expect(de[0]).toBe('Mo');            // sanity: the locale really is German
    expect(chipsIn('de')).toEqual(de);
  });

  test('and English ones under an English heading', () => {
    const en = expectedDows('en');
    expect(en[0]).toBe('Mon');
    expect(chipsIn('en')).toEqual(en);
  });

  test('the two languages actually differ, so the test can fail', () => {
    // Without this the pair above would pass against any single hard-coded set.
    expect(expectedDows('de')).notToContain('Mon');
    expect(expectedDows('en')).notToContain('Mo');
  });
});

// The schedule editor validated nothing.
//
// scheduler.test.js covers what counts as a broken schedule; this covers
// whether the person making one is told. A day-parting mistake is invisible by
// construction — the slide simply never appears, on a screen nobody is
// standing in front of — so the only place it can be caught is here, at the
// moment it is made.
//
// Browser-only: the editor builds real inputs and listens to real events.

function withEditor(schedule, fn) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-4000px;top:0;width:420px;';
  document.body.appendChild(host);
  const slide = { id: 's', schedule };
  try {
    renderScheduleEditor(host, slide, () => {});
    return fn({
      host, slide,
      problems: () => host.querySelector('#sched-problems').textContent.trim(),
      set: (sel, value) => {
        const el = host.querySelector(sel);
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
    });
  } finally { host.remove(); }
}

describe('schedule editor · saying it where it is made', () => {
  test('a healthy schedule is not nagged at', () => {
    withEditor({ daysOfWeek: [5, 6], timeRanges: [{ start: '20:00', end: '03:00' }] },
      ({ problems }) => expect(problems()).toBe(''));
  });

  test('REGRESSION: an inverted date range is called out as you type it', () => {
    withEditor({}, ({ set, problems }) => {
      set('#dr-from', '2026-09-30');
      set('#dr-to', '2026-09-01');
      expect(problems().length > 0).toBeTruthy();
      // …and it goes away again when the pair makes sense.
      set('#dr-to', '2026-10-30');
      expect(problems()).toBe('');
    });
  });

  test('a window with no length is called out', () => {
    withEditor({ timeRanges: [{ start: '18:00', end: '19:00' }] }, ({ set, problems }) => {
      expect(problems()).toBe('');
      set('[data-idx="0"][data-tr="end"]', '18:00');
      expect(problems().length > 0).toBeTruthy();
    });
  });

  test('an already-open schedule is judged on arrival, not only on edit', () => {
    withEditor({ dateRange: { from: '2026-09-30', to: '2026-09-01' } },
      ({ problems }) => expect(problems().length > 0).toBeTruthy());
  });

  test('REGRESSION: a window that crosses midnight says so', () => {
    // The row read "20:00 → 03:00" and gave no sign which 03:00 that is —
    // exactly the ambiguity the overnight weekday bug hid behind.
    withEditor({ timeRanges: [{ start: '20:00', end: '03:00' }] }, ({ host }) => {
      const mark = host.querySelector('.bb-tr-next');
      expect(!!mark).toBeTruthy();
      expect((mark.getAttribute('title') || '').length > 0).toBeTruthy();
    });
  });

  test('…and an ordinary daytime window does not', () => {
    withEditor({ timeRanges: [{ start: '09:00', end: '18:00' }] },
      ({ host }) => expect(host.querySelector('.bb-tr-next')).toBe(null));
  });

  test('the messages are sentences, not codes', () => {
    withEditor({ dateRange: { from: '2026-09-30', to: '2026-09-01' } }, ({ problems }) => {
      // t() hands back the KEY when a string is missing, which would read as
      // "sched.problem.dateRangeInverted" on screen.
      expect(problems()).notToContain('sched.problem');
    });
  });
});
