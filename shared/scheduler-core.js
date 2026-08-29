// Pure functions deciding whether a slide is currently visible.
// Shared by admin (badge on slide card) and player (skip invisible slides).
//
// ALL THREE CHECKS READ THE DISPLAY'S LOCAL CLOCK. That is the promise this
// file makes and the only one an operator can reason about: "from the 30th" and
// "09:00–18:00" have to mean the same day.
//
// todayISO used to be `d.toISOString().slice(0, 10)` — the UTC day, while the
// weekday and time-of-day checks below read local time. The two disagreed for
// the whole of the display's UTC offset, every day. Measured in Berlin
// (UTC+2): a slide scheduled "from 30 August" stayed dark until 02:01 local on
// the 30th, and a campaign scheduled "to 29 August" kept playing until 02:00 on
// the 30th. West of Greenwich it goes the other way — a slide dated tomorrow
// appears this evening.

function todayISO(d = new Date()) {
  // YYYY-MM-DD, from LOCAL parts.
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isoDow(d = new Date()) {
  // 1..7 Mon..Sun (ISO)
  return ((d.getDay() + 6) % 7) + 1;
}

function hhmm(d = new Date()) {
  return d.toTimeString().slice(0, 5);
}

function hhmmInRange(now, start, end) {
  // strings like "09:00" — supports wrap-around (e.g. 22:00 → 06:00)
  if (start <= end) return now >= start && now <= end;
  return now >= start || now <= end;
}

// The date range is judged on the INSTANT, the weekday on the window's own day.
//
// They are deliberately different, and the difference is what the two fields
// mean to an operator. A date range is a hard calendar boundary — "this ad runs
// until the 20th" is a contract, and a campaign that plays on into the 21st is
// wrong even if its window started on the 20th; test/scheduler.test.js decided
// that and it stands. `daysOfWeek` has no such reading: it describes recurring
// opening hours, and "Fri+Sat, 20:00–03:00" is one Saturday night, not two
// halves of which the second is unscheduled.
function dateAllowed(s, now) {
  if (!s.dateRange) return true;
  const iso = todayISO(now);
  if (s.dateRange.from && iso < s.dateRange.from) return false;
  if (s.dateRange.to && iso > s.dateRange.to) return false;
  return true;
}

function dowAllowed(s, day) {
  if (!Array.isArray(s.daysOfWeek) || s.daysOfWeek.length === 0) return true;
  return s.daysOfWeek.includes(isoDow(day));
}

// Which calendar day does this window belong to?
//
// For a range that ends after midnight, 01:00 belongs to the evening BEFORE.
// The weekday check used to run against the instant instead, and a bar with a
// perfectly ordinary "Fri+Sat, 20:00–03:00" board got it wrong twice over:
// Sunday 01:00 — the end of the Saturday night it was scheduled for — went
// DARK, and Friday 01:00 — the Thursday night nobody asked for — came on.
//
// setDate(), not `now - 86_400_000`: subtracting a fixed day lands an hour off
// across a DST change, and the calendar day is exactly what is being asked.
function windowDay(now, r, t) {
  if (!r || r.start <= r.end || t >= r.start) return now;
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return d;
}

export function isSlideVisible(slide, now = new Date()) {
  const s = slide?.schedule;
  if (!s) return true;
  if (!dateAllowed(s, now)) return false;
  const ranges = Array.isArray(s.timeRanges) && s.timeRanges.length > 0 ? s.timeRanges : null;
  // No time window: the weekday is simply today's.
  if (!ranges) return dowAllowed(s, now);
  const t = hhmm(now);
  // Each window is judged on ITS OWN day, and any one of them is enough.
  return ranges.some(r => hhmmInRange(t, r.start, r.end) && dowAllowed(s, windowDay(now, r, t)));
}

export function filterVisible(slides, now = new Date()) {
  return (slides ?? []).filter(s => isSlideVisible(s, now));
}

// Short weekday names in the reader's language. They were hard-coded English
// — "Mo·Tu·We" on a German slide card, in an app whose first language is
// German. A fixed Monday (2024-01-01 was one) anchors the sequence.
const DOW_CACHE = new Map();
function shortDays(locale) {
  const key = locale || '';
  let names = DOW_CACHE.get(key);
  if (!names) {
    try {
      const f = new Intl.DateTimeFormat(locale || undefined, { weekday: 'short' });
      names = Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)));
    } catch {
      names = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    }
    DOW_CACHE.set(key, names);
  }
  return names;
}

/**
 * Human-readable schedule summary (for admin slide cards).
 *
 * @param {object} slide
 * @param {string} [locale]  '' → the device decides
 */
export function describeSchedule(slide, locale) {
  const s = slide?.schedule;
  if (!s) return null;
  const parts = [];
  if (s.dateRange?.from || s.dateRange?.to) {
    parts.push(`${s.dateRange.from ?? '…'} → ${s.dateRange.to ?? '…'}`);
  }
  if (s.daysOfWeek?.length) {
    const names = shortDays(locale);
    parts.push(s.daysOfWeek.map(d => names[d - 1] ?? '?').join('·'));
  }
  if (s.timeRanges?.length) {
    // "20:00–03:00" says nothing about WHICH 03:00, and that ambiguity is what
    // let the overnight bug hide. The timetable convention marks it: ⁺¹.
    parts.push(s.timeRanges
      .map(r => `${r.start}–${r.end}${r.start > r.end ? '⁺¹' : ''}`)
      .join(', '));
  }
  return parts.join(' · ');
}

/**
 * What is wrong with this schedule?
 *
 * The editor validated nothing, and a day-parting schedule has failure modes
 * that are invisible by construction: the slide simply never appears, on a
 * screen nobody is standing in front of, and the playlist looks fine.
 *
 *   dateRangeInverted   "from 30 September to 1 September" — every day fails
 *                       both ends of the test. The two date inputs happily
 *                       accept it.
 *   timeRangeEmpty      start == end. `18:00 → 18:00` is visible for exactly
 *                       one minute a day, which nobody means on purpose; it is
 *                       what a half-finished edit looks like.
 *   timeRangeIncomplete one side of a window left blank.
 *   expired             a `to` date already in the past. Not a mistake — a
 *                       campaign ends — but worth saying out loud, because the
 *                       slide is in the playlist and will never play again.
 *
 * Returns codes, not sentences: the caller owns the wording and the language.
 *
 * @param {object} schedule  slide.schedule
 * @param {Date} [now]
 * @returns {string[]} problem codes, most structural first
 */
export function scheduleProblems(schedule, now = new Date()) {
  const s = schedule ?? {};
  const out = [];
  const from = s.dateRange?.from;
  const to = s.dateRange?.to;
  if (from && to && from > to) out.push('dateRangeInverted');
  for (const r of s.timeRanges ?? []) {
    if (!r?.start || !r?.end) out.push('timeRangeIncomplete');
    else if (r.start === r.end) out.push('timeRangeEmpty');
  }
  if (to && !out.includes('dateRangeInverted') && todayISO(now) > to) out.push('expired');
  return [...new Set(out)];
}
