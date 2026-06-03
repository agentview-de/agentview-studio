// Shared calendar view renderers. Operate on normalized event objects:
//   { start: Date, end: Date|null, summary, location, allDay }
// Each returns HTML for the `.bb-cal-view` container; styled by slide-themes.css.
// Used by the calendar widget (manual + .ics import). No network here.

const pad = n => String(n).padStart(2, '0');
const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = d => addDays(d, -(((d.getDay() + 6) % 7))); // Monday
const wd = (d, opt = 'short') => new Intl.DateTimeFormat(undefined, { weekday: opt }).format(d);
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));

function relDayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((that - today) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return null;
}
function fmtWhen(ev) {
  const rel = relDayLabel(ev.start);
  if (rel) return ev.allDay ? rel : `${rel}, ${ev.start.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  const opts = ev.allDay
    ? { weekday: 'short', day: '2-digit', month: 'short' }
    : { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
  return ev.start.toLocaleString(undefined, opts);
}

function viewAgenda(events, c = {}) {
  const cutoff = Date.now() - 12 * 3600 * 1000;
  const list = events.filter(e => e.start.getTime() >= cutoff).slice(0, c.maxItems ?? 6);
  if (!list.length) return '<ul class="bb-cal-list"><li class="bb-cal-item"><div class="bb-cal-desc">No upcoming events.</div></li></ul>';
  return `<ul class="bb-cal-list">${list.map(ev => `
    <li class="bb-cal-item">
      <div class="bb-cal-date">${escapeHtml(fmtWhen(ev))}</div>
      <div class="bb-cal-desc">${escapeHtml(ev.summary)}${ev.location ? ` · <span style="opacity:.6">${escapeHtml(ev.location)}</span>` : ''}</div>
    </li>`).join('')}</ul>`;
}

function viewToday(events) {
  const today = new Date();
  const list = events.filter(e => isSameDay(e.start, today));
  if (!list.length) return `<div class="bb-cal-empty-big">Nothing scheduled today 🎉</div>`;
  return `<ul class="bb-cal-list">${list.map(ev => `
    <li class="bb-cal-item">
      <div class="bb-cal-date">${ev.allDay ? 'all day' : escapeHtml(fmtTime(ev.start))}</div>
      <div class="bb-cal-desc">${escapeHtml(ev.summary)}${ev.location ? ` · <span style="opacity:.6">${escapeHtml(ev.location)}</span>` : ''}</div>
    </li>`).join('')}</ul>`;
}

function viewNowNext(events) {
  const now = Date.now();
  const current = events.find(e => e.end && e.start.getTime() <= now && e.end.getTime() > now);
  const next = events.find(e => e.start.getTime() > now);
  const status = current
    ? `<div class="bb-cal-status bb-busy">● Busy</div>`
    : `<div class="bb-cal-status bb-free">● Free</div>`;
  const nowBlock = current
    ? `<div class="bb-cal-now-label">Now</div>
       <div class="bb-cal-now-title">${escapeHtml(current.summary)}</div>
       <div class="bb-cal-now-time">${escapeHtml(fmtTime(current.start))}–${current.end ? escapeHtml(fmtTime(current.end)) : ''}${current.location ? ` · ${escapeHtml(current.location)}` : ''}</div>`
    : `<div class="bb-cal-now-title bb-cal-free-big">Available</div>`;
  const nextBlock = next
    ? `<div class="bb-cal-next"><span class="bb-cal-next-label">Next</span> ${escapeHtml(next.summary)} · ${escapeHtml(isSameDay(next.start, new Date()) ? fmtTime(next.start) : fmtWhen(next))}</div>`
    : `<div class="bb-cal-next bb-cal-next-none">No more events scheduled</div>`;
  return `<div class="bb-cal-nownext">${status}<div class="bb-cal-now">${nowBlock}</div>${nextBlock}</div>`;
}

function viewWeek(events) {
  const ws = startOfWeek(new Date());
  const today = new Date();
  const cols = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(ws, i);
    const evs = events.filter(e => isSameDay(e.start, day)).slice(0, 6);
    cols.push(`<div class="bb-cal-col${isSameDay(day, today) ? ' bb-today' : ''}">
      <div class="bb-cal-colhead"><span>${escapeHtml(wd(day))}</span><b>${day.getDate()}</b></div>
      <div class="bb-cal-colbody">${evs.map(ev => `<div class="bb-cal-ev"><span class="bb-cal-ev-time">${ev.allDay ? '' : escapeHtml(fmtTime(ev.start))}</span>${escapeHtml(ev.summary)}</div>`).join('') || '<div class="bb-cal-ev-none">—</div>'}</div>
    </div>`);
  }
  return `<div class="bb-cal-week">${cols.join('')}</div>`;
}

function viewMonth(events) {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const heads = Array.from({ length: 7 }, (_, i) => `<div class="bb-cal-mhead">${escapeHtml(wd(addDays(gridStart, i), 'narrow'))}</div>`).join('');
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const day = addDays(gridStart, i);
    const inMonth = day.getMonth() === today.getMonth();
    const evs = events.filter(e => isSameDay(e.start, day));
    const dots = evs.slice(0, 3).map(() => '<span class="bb-cal-dot"></span>').join('');
    const firstEv = evs[0] ? `<div class="bb-cal-mev">${escapeHtml(evs[0].summary)}</div>` : '';
    cells.push(`<div class="bb-cal-daycell${inMonth ? '' : ' bb-cal-out'}${isSameDay(day, today) ? ' bb-today' : ''}">
      <div class="bb-cal-daynum">${day.getDate()}</div>${firstEv}<div class="bb-cal-dots">${dots}</div>
    </div>`);
  }
  return `<div class="bb-cal-monthtitle">${escapeHtml(new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(first))}</div>
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
