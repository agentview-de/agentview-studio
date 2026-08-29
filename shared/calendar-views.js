// Shared calendar view renderers. Operate on normalized event objects:
//   { start: Date, end: Date|null, summary, location, allDay }
// Each returns HTML for the `.bb-cal-view` container; styled by slide-themes.css.
// Used by the calendar widget (manual + .ics import / live URL). No network here.
//
// opts (threaded from the plugin via renderCalendarView) carries the user knobs:
//   { maxItems, locale, daysAhead, weekDays, perDayCap, emptyText,
//     roomName, showClock }
// `locale` is a BCP-47 tag or undefined — passed as the first argument to every
// Intl.* / toLocale*String call so date/weekday formatting follows the AUDIENCE
// language, not the player OS (use `|| undefined`, never `??`).

import { escapeHtml } from './utils/escape.js';
import { safeLocale } from './locale-field.js';

const pad = n => String(n).padStart(2, '0');
const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
// ISO weekday number (1 = Monday … 7 = Sunday). Date.getDay() counts 0 = Sunday,
// which is the one convention Intl's week info does NOT use.
const isoDay = d => ((d.getDay() + 6) % 7) + 1;

// "Now" comes from the caller when the caller has one.
//
// Every view here answers a question about TODAY — which day is highlighted,
// what counts as "tomorrow", where the look-ahead window ends. That made the
// module untestable at exactly the instants where date code goes wrong: the
// two days a year the clocks move, the last minute before midnight, the turn
// of a month. The tests had to build their events relative to the real today
// and hope. An optional `now` costs one line and makes every one of those
// instants reachable; production passes nothing and gets the wall clock.
const nowOf = (c) => (c?.now instanceof Date ? new Date(c.now.getTime()) : new Date());
const startOfWeek = (d, firstDay = 1) => addDays(d, -(((isoDay(d) - firstDay) + 7) % 7));

// Where the week starts and which days are the working week are properties of
// the AUDIENCE, not of the code. The grid was pinned to Monday while every
// weekday NAME inside it already followed the locale — so a US or Japanese
// viewer read a Monday-first week labelled in their own language, and "work
// week" meant Mon–Fri even where the weekend is Friday and Saturday.
function weekRules(lc) {
  try {
    const loc = new Intl.Locale(lc ?? new Intl.DateTimeFormat().resolvedOptions().locale);
    const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
    if (info && Number.isInteger(info.firstDay)) {
      return {
        firstDay: info.firstDay,
        weekend: Array.isArray(info.weekend) && info.weekend.length ? info.weekend : [6, 7],
      };
    }
  } catch { /* an engine without week info, or a tag Intl.Locale refuses */ }
  return { firstDay: 1, weekend: [6, 7] };   // ISO default: Monday, Sat + Sun
}

// Every day an event TOUCHES, not just the one it starts on.
//
// The grids used to place an event with `isSameDay(e.start, day)`, so a
// three-day workshop appeared on Monday and nowhere else — and the Today view,
// the one a meeting-room door panel runs, said "Nothing scheduled today 🎉" on
// Tuesday while the room was full. Now & Next got this right all along
// (start ≤ now < end), so the same widget contradicted itself on two screens.
//
// Half-open on purpose: an all-day event carries an EXCLUSIVE end (a Monday
// all-day event ends Tuesday 00:00), and so does a meeting that runs to
// midnight — neither may bleed into the next cell.
function occupies(ev, day) {
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const to = addDays(day, 1).getTime();   // via addDays, so a DST day is 23h or 25h
  const start = ev.start.getTime();
  const end = Math.max(ev.end ? ev.end.getTime() : start, start + 1);
  return start < to && end > from;
}

// What the time column says on THIS day: the clock time on the day it starts,
// and a continuation marker on the days it runs through — with the end time on
// the day it finishes. Symbolic, because the player has no i18n and "continues"
// would have to be one language for every audience.
function dayTime(ev, day) {
  if (ev.allDay) return '';
  if (isSameDay(ev.start, day)) return fmtTime(ev.start);
  return ev.end && isSameDay(ev.end, day) ? `↳ ${fmtTime(ev.end)}` : '↳';
}
const wd = (d, lc, opt = 'short') => new Intl.DateTimeFormat(lc || undefined, { weekday: opt }).format(d);

// Audience-language micro-strings. The player has no i18n, so a tiny per-locale
// map keyed off the locale's base language keeps the few relative-day words in
// the audience tongue; anything not mapped falls back to English.
const REL_WORDS = {
  de: { today: 'Heute', tomorrow: 'Morgen' },
  fr: { today: "Aujourd'hui", tomorrow: 'Demain' },
  it: { today: 'Oggi', tomorrow: 'Domani' },
  es: { today: 'Hoy', tomorrow: 'Mañana' },
  nl: { today: 'Vandaag', tomorrow: 'Morgen' },
  pl: { today: 'Dziś', tomorrow: 'Jutro' },
  pt: { today: 'Hoje', tomorrow: 'Amanhã' },
  tr: { today: 'Bugün', tomorrow: 'Yarın' },
  cs: { today: 'Dnes', tomorrow: 'Zítra' },
  da: { today: 'I dag', tomorrow: 'I morgen' },
  sv: { today: 'Idag', tomorrow: 'Imorgon' },
  no: { today: 'I dag', tomorrow: 'I morgen' },
  fi: { today: 'Tänään', tomorrow: 'Huomenna' },
};
const relWords = lc => REL_WORDS[String(lc || '').slice(0, 2).toLowerCase()] || { today: 'Today', tomorrow: 'Tomorrow' };

function relDayLabel(d, lc, now) {
  const today = now instanceof Date ? new Date(now.getTime()) : new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((that - today) / 86400000);
  const w = relWords(lc);
  if (days === 0) return w.today;
  if (days === 1) return w.tomorrow;
  return null;
}
function fmtWhen(ev, lc, now) {
  const rel = relDayLabel(ev.start, lc, now);
  if (rel) return ev.allDay ? rel : `${rel}, ${ev.start.toLocaleString(lc || undefined, { hour: '2-digit', minute: '2-digit' })}`;
  const opts = ev.allDay
    ? { weekday: 'short', day: '2-digit', month: 'short' }
    : { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
  return ev.start.toLocaleString(lc || undefined, opts);
}

function viewAgenda(events, c = {}) {
  const lc = safeLocale(c.locale);
  // The "look-back" floor: events that started more than 12h ago drop off so a
  // long-running display stays forward-looking. When the widget's hidePast
  // toggle is OFF the plugin already skips its own midnight filter, so honour
  // that here too and show the full list (no back-cutoff) — the two filters no
  // longer disagree.
  let list = events;
  if (c.hidePast !== false) {
    const cutoff = nowOf(c).getTime() - 12 * 3600 * 1000;
    list = list.filter(e => e.start.getTime() >= cutoff);
  }
  // Optional look-ahead horizon: only show events within N days from today.
  const ahead = Number(c.daysAhead);
  if (ahead > 0) {
    // The horizon is the local midnight that ENDS the last included day. It
    // used to be built by adding a flat 24 hours to a midnight, and a flat 24
    // hours lands at 23:00 or 01:00 on the two days a year the clocks move —
    // so the window quietly gained or lost an hour. setDate crosses a DST
    // boundary correctly; the arithmetic does not.
    const horizon = nowOf(c); horizon.setHours(0, 0, 0, 0);
    horizon.setDate(horizon.getDate() + ahead + 1);
    list = list.filter(e => e.start.getTime() < horizon.getTime());
  }
  list = list.slice(0, c.maxItems ?? 6);
  const empty = c.emptyText || 'No upcoming events.';
  if (!list.length) return `<ul class="bb-cal-list"><li class="bb-cal-item"><div class="bb-cal-desc">${escapeHtml(empty)}</div></li></ul>`;
  return `<ul class="bb-cal-list">${list.map(ev => `
    <li class="bb-cal-item">
      <div class="bb-cal-date">${escapeHtml(fmtWhen(ev, lc, nowOf(c)))}</div>
      <div class="bb-cal-desc">${escapeHtml(ev.summary)}${ev.location ? ` · <span style="opacity:.6">${escapeHtml(ev.location)}</span>` : ''}</div>
    </li>`).join('')}</ul>`;
}

function viewToday(events, c = {}) {
  const today = nowOf(c);
  const list = events.filter(e => occupies(e, today));
  const empty = c.emptyText || 'Nothing scheduled today 🎉';
  if (!list.length) return `<div class="bb-cal-empty-big">${escapeHtml(empty)}</div>`;
  return `<ul class="bb-cal-list">${list.map(ev => `
    <li class="bb-cal-item">
      <div class="bb-cal-date">${ev.allDay ? 'all day' : escapeHtml(dayTime(ev, today))}</div>
      <div class="bb-cal-desc">${escapeHtml(ev.summary)}${ev.location ? ` · <span style="opacity:.6">${escapeHtml(ev.location)}</span>` : ''}</div>
    </li>`).join('')}</ul>`;
}

function viewNowNext(events, c = {}) {
  const lc = safeLocale(c.locale);
  const now = nowOf(c).getTime();
  const current = events.find(e => e.end && e.start.getTime() <= now && e.end.getTime() > now);
  const next = events.find(e => e.start.getTime() > now);
  const status = current
    ? `<div class="bb-cal-status bb-busy">● Busy</div>`
    : `<div class="bb-cal-status bb-free">● Free</div>`;
  // Optional room-screen header: a room name and/or a live clock turn the
  // Now & Next view into a complete meeting-room door panel. The clock string
  // is rendered fresh on every repaint (the plugin tightens the loop to 15s
  // when showClock is on), so it stays honest without its own timer.
  const clock = c.showClock
    ? `<span class="bb-cal-room-clock">${escapeHtml(nowOf(c).toLocaleTimeString(lc || undefined, { hour: '2-digit', minute: '2-digit' }))}</span>`
    : '';
  const header = (c.roomName || c.showClock)
    ? `<div class="bb-cal-room-head">${c.roomName ? `<span class="bb-cal-room-name">${escapeHtml(c.roomName)}</span>` : ''}${clock}</div>`
    : '';
  const nowBlock = current
    ? `<div class="bb-cal-now-label">Now</div>
       <div class="bb-cal-now-title">${escapeHtml(current.summary)}</div>
       <div class="bb-cal-now-time">${escapeHtml(fmtTime(current.start))}–${current.end ? escapeHtml(fmtTime(current.end)) : ''}${current.location ? ` · ${escapeHtml(current.location)}` : ''}</div>`
    : `<div class="bb-cal-now-title bb-cal-free-big">Available</div>`;
  const nextBlock = next
    ? `<div class="bb-cal-next"><span class="bb-cal-next-label">Next</span> ${escapeHtml(next.summary)} · ${escapeHtml(isSameDay(next.start, nowOf(c)) ? fmtTime(next.start) : fmtWhen(next, lc, nowOf(c)))}</div>`
    : `<div class="bb-cal-next bb-cal-next-none">No more events scheduled</div>`;
  return `<div class="bb-cal-nownext">${header}${status}<div class="bb-cal-now">${nowBlock}</div>${nextBlock}</div>`;
}

function viewWeek(events, c = {}) {
  const lc = safeLocale(c.locale);
  const { firstDay, weekend } = weekRules(lc);
  const today = nowOf(c);
  const ws = startOfWeek(today, firstDay);
  // Work-week toggle: the week without its weekend (five days nearly
  // everywhere) or all seven. Per-day event cap is user-controllable.
  const workWeek = c.weekDays === 'work';
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
    .filter(d => !(workWeek && weekend.includes(isoDay(d))));
  const dayCount = days.length;
  const cap = c.perDayCap > 0 ? c.perDayCap : 6;
  const cols = [];
  for (const day of days) {
    const evs = events.filter(e => occupies(e, day)).slice(0, cap);
    cols.push(`<div class="bb-cal-col${isSameDay(day, today) ? ' bb-today' : ''}">
      <div class="bb-cal-colhead"><span>${escapeHtml(wd(day, lc))}</span><b>${day.getDate()}</b></div>
      <div class="bb-cal-colbody">${evs.map(ev => `<div class="bb-cal-ev"><span class="bb-cal-ev-time">${escapeHtml(dayTime(ev, day))}</span>${escapeHtml(ev.summary)}</div>`).join('') || '<div class="bb-cal-ev-none">—</div>'}</div>
    </div>`);
  }
  return `<div class="bb-cal-week" style="--bb-cal-week-days:${dayCount}">${cols.join('')}</div>`;
}

function viewMonth(events, c = {}) {
  const lc = safeLocale(c.locale);
  const cap = c.perDayCap > 0 ? c.perDayCap : 3;
  const today = nowOf(c);
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const gridStart = startOfWeek(first, weekRules(lc).firstDay);
  const heads = Array.from({ length: 7 }, (_, i) => `<div class="bb-cal-mhead">${escapeHtml(wd(addDays(gridStart, i), lc, 'narrow'))}</div>`).join('');
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const day = addDays(gridStart, i);
    const inMonth = day.getMonth() === today.getMonth();
    const evs = events.filter(e => occupies(e, day));
    const dots = evs.slice(0, cap).map(() => '<span class="bb-cal-dot"></span>').join('');
    const firstEv = evs[0] ? `<div class="bb-cal-mev">${escapeHtml(evs[0].summary)}</div>` : '';
    cells.push(`<div class="bb-cal-daycell${inMonth ? '' : ' bb-cal-out'}${isSameDay(day, today) ? ' bb-today' : ''}">
      <div class="bb-cal-daynum">${day.getDate()}</div>${firstEv}<div class="bb-cal-dots">${dots}</div>
    </div>`);
  }
  return `<div class="bb-cal-monthtitle">${escapeHtml(new Intl.DateTimeFormat(lc || undefined, { month: 'long', year: 'numeric' }).format(first))}</div>
    <div class="bb-cal-month">${heads}${cells.join('')}</div>`;
}

export const CALENDAR_VIEWS = { agenda: viewAgenda, today: viewToday, 'now-next': viewNowNext, week: viewWeek, month: viewMonth };

export const CALENDAR_VIEW_OPTIONS = [
  { value: 'agenda', label: 'Agenda (list)' },
  { value: 'now-next', label: 'Now & Next (room)' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week grid' },
  { value: 'month', label: 'Month grid' },
];

export function renderCalendarView(view, events, opts = {}) {
  return (CALENDAR_VIEWS[view] ?? viewAgenda)(events, opts);
}
