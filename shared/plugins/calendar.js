import { register } from './registry.js';
import { colorOverrideDefaults, applyColorOverrides, themeColorSection } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { renderCalendarView, CALENDAR_VIEW_OPTIONS } from '../calendar-views.js';
import { textScaleField } from '../text-scale.js';
import { localeField } from '../locale-field.js';
import { refreshSecField } from '../refresh-field.js';
import { allEvents as parseIcsEvents } from '../ics-parse.js';
import { escapeHtml } from '../utils/escape.js';

const pad = n => String(n).padStart(2, '0');
// Local "YYYY-MM-DDTHH:MM" string for a Date.
function localInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// Stored datetime-local / date string → Date (local), or null.
function parseLocal(v) {
  if (!v) return null;
  const d = /T/.test(v) ? new Date(v) : new Date(v + 'T00:00');
  return isNaN(d) ? null : d;
}
// Stored items → normalized event objects the views expect, sorted by start.
function toEvents(items) {
  return (Array.isArray(items) ? items : [])
    .map(e => {
      const start = parseLocal(e.start);
      let end = parseLocal(e.end);
      if (start && !end) end = new Date(start.getTime() + 3600 * 1000);
      return {
        start, end,
        summary: e.summary || '(no title)',
        location: e.location || '',
        allDay: !!e.allDay || !!(e.start && !/T/.test(e.start)),
      };
    })
    .filter(e => e.start)
    .sort((a, b) => a.start - b.start);
}

// Merge manual + live .ics events, de-duped by start+summary, sorted by start.
function mergeEvents(manual, live) {
  const seen = new Set();
  const out = [];
  for (const e of [...manual, ...live]) {
    const key = `${e.start.getTime()}|${e.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.sort((a, b) => a.start - b.start);
}

export default register({
  type: 'calendar',
  label: 'Calendar',
  group: 'data',
  icon: '📅',
  schemaVersion: 3,
  defaults: () => ({ ...colorOverrideDefaults(),
    heading: 'Upcoming',
    view: 'agenda',
    maxItems: 6,
    hidePast: true,
    daysAhead: 0,
    weekDays: 'full',
    perDayCap: 0,
    emptyText: '',
    roomName: '',
    showClock: false,
    icsUrl: '',
    refreshSec: 900,
    locale: '',
    theme: 'minimal-dark',
    textScale: 100,
    events: [
      { start: localInput(new Date(Date.now() + 2 * 3600e3)), summary: 'Team standup' },
      { start: localInput(new Date(Date.now() + 26 * 3600e3)), summary: 'Roadmap review', location: 'Room 2' },
    ],
  }),
  schema: () => ({
    fields: [
      // ---- Events (primary content first) ----
      { type: 'section', key: 'sec-events', label: 'Content', icon: '📅' },
      { key: 'events', type: 'calendar-events', label: 'Events',
        help: 'Add events by hand or import a calendar file: in Google/Outlook/Apple export the calendar as .ics, then use “.ics file”. For automatic updates use a live .ics URL under Data.' },

      // ---- Data (live .ics source) ----
      { type: 'section', key: 'sec-data', label: 'Data', collapsed: true,
        summary: c => (c.icsUrl ? 'Live .ics' : 'Manual events') },
      { key: 'icsUrl', type: 'url', label: 'Live .ics URL', test: true,
        placeholder: 'https://calendar.google.com/…/basic.ics',
        help: 'Outlook/Google/Apple “secret address in iCal format”. The display fetches and re-parses it on a timer, merging with the manual events above. Leave empty to use only the events above.' },
      refreshSecField({ showIf: c => !!c.icsUrl }),

      // ---- View / layout (mode select first, then mode-specific knobs) ----
      { type: 'section', key: 'sec-view', label: 'Layout', icon: '🗂️' },
      { key: 'view', type: 'select', label: 'View', options: CALENDAR_VIEW_OPTIONS, search: true },
      { key: 'heading', type: 'text', label: 'Heading', placeholder: 'Upcoming',
        help: 'Title shown above the list. Leave empty for no heading.',
        showIf: c => ['agenda', 'today'].includes(c.view ?? 'agenda') },
      { key: 'maxItems', type: 'number', label: 'Max events', min: 1, max: 20, slider: true,
        showIf: c => (c.view ?? 'agenda') === 'agenda' },
      { key: 'daysAhead', type: 'select', label: 'Look-ahead window', buttons: true,
        options: [
          { value: 0, label: 'All' },
          { value: 7, label: '7 days' },
          { value: 14, label: '14 days' },
          { value: 30, label: '30 days' },
        ],
        help: 'Only show events within this horizon from today.',
        showIf: c => (c.view ?? 'agenda') === 'agenda' },
      { key: 'hidePast', type: 'toggle', label: 'Hide past events',
        showIf: c => ['agenda', 'today'].includes(c.view ?? 'agenda'),
        help: 'Keeps the agenda forward-looking, yesterday’s items drop off automatically. Turn off to show events that have already started.' },
      { key: 'weekDays', type: 'select', label: 'Days shown', buttons: true,
        options: [
          { value: 'full', label: 'Full week' },
          { value: 'work', label: 'Mon–Fri' },
        ],
        showIf: c => c.view === 'week' },
      { key: 'perDayCap', type: 'number', label: 'Events per day', min: 0, max: 12, slider: true, suffix: '',
        help: '0 keeps the default (6 in week grid, 3 dots in month grid).',
        showIf: c => ['week', 'month'].includes(c.view) },
      { key: 'emptyText', type: 'text', label: 'Empty-state text',
        placeholder: 'No upcoming events.',
        help: 'Shown when there is nothing to display, e.g. “Room free — book at the front desk”.',
        showIf: c => ['agenda', 'today'].includes(c.view ?? 'agenda') },

      // ---- Room screen (Now & Next door panel) ----
      { type: 'section', key: 'sec-room', label: 'Room screen', icon: '🚪',
        showIf: c => c.view === 'now-next',
        help: 'Turns Now & Next into a meeting-room door panel.' },
      { key: 'roomName', type: 'text', label: 'Room name', placeholder: 'Room 2 · 2nd floor',
        showIf: c => c.view === 'now-next' },
      { key: 'showClock', type: 'toggle', label: 'Show live clock',
        help: 'A live HH:MM clock in the header (repaints every 15 seconds while shown).',
        showIf: c => c.view === 'now-next' },

      // ---- Appearance ----
      { type: 'section', key: 'sec-appearance', label: 'Appearance' },
      localeField(),
      textScaleField(),

      // ---- Theme & colours (terminal) ----
      ...themeColorSection(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const view = CALENDAR_VIEW_OPTIONS.some(o => o.value === c.view) ? c.view : 'agenda';
    const showHeading = ['agenda', 'today'].includes(view) && c.heading;
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    // NOTE: do NOT add `bb-cal-${view}` here, the inner wrapper returned by
    // each view renderer already carries it. Putting it on the slide root too
    // turns the slide itself into a grid (collapses content into one column).
    root.className = `bb-slide bb-slide-calendar bb-theme-${c.theme || 'minimal-dark'}`;
    // textScale → multiplier consumed by the cqmin clamps in slide-themes.css.
    root.style.setProperty('--bb-cal-text-scale', (c.textScale ?? 100) / 100);
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      ${showHeading ? `<h2 class="bb-h2" data-field="heading">${escapeHtml(c.heading)}</h2>` : ''}
      <div class="bb-cal-view"></div>`;
    container.appendChild(root);
    const viewHost = root.querySelector('.bb-cal-view');
    viewHost.dataset.field = 'events view icsUrl maxItems hidePast daysAhead weekDays perDayCap emptyText roomName showClock locale textScale';
    const manualEvents = toEvents(c.events);
    // Live .ics events fetched from the URL (if any) are merged in. Starts empty
    // and is refreshed by the fetch loop below.
    let liveEvents = [];

    const opts = () => ({
      maxItems: c.maxItems ?? 6,
      locale: c.locale || undefined,
      hidePast: c.hidePast,
      daysAhead: Number(c.daysAhead) || 0,
      weekDays: c.weekDays || 'full',
      perDayCap: Number(c.perDayCap) || 0,
      emptyText: c.emptyText || '',
      roomName: c.roomName || '',
      showClock: !!c.showClock,
    });

    // Every view is clock-relative: now-next flips Busy/Free at event
    // boundaries, agenda/today roll over at midnight, week/month move the
    // "today" highlight. Rendering once would freeze the widget at first
    // paint. Re-paint on a timer; it's a pure string render with no network.
    const paint = () => {
      const events = liveEvents.length ? mergeEvents(manualEvents, liveEvents) : manualEvents;
      viewHost.innerHTML = renderCalendarView(view, events, opts());
    };
    paint();

    // Repaint cadence: 15s when the Now & Next clock is shown (so the minute
    // ticks), otherwise the cheap 60s clock-relative refresh.
    const cadence = (view === 'now-next' && c.showClock) ? 15000 : 60000;
    const paintId = setInterval(paint, cadence);

    // Live .ics fetch loop. Mirrors the rss live path: fetch on render, then on
    // the refresh interval (5 s floor, 0 = once). A failed fetch keeps the last
    // good events; manual events always render regardless.
    let fetchId = null;
    if (c.icsUrl) {
      const refreshMs = c.refreshSec > 0 ? Math.max(5000, c.refreshSec * 1000) : 0;
      const pull = async () => {
        try {
          const res = await fetch(c.icsUrl, ctx?.signal ? { signal: ctx.signal } : {});
          if (!res.ok) return;
          const text = await res.text();
          liveEvents = parseIcsEvents(text);
          paint();
        } catch { /* keep last good events; manual events still render */ }
      };
      pull();
      if (refreshMs) fetchId = setInterval(pull, refreshMs);
    }

    return composeDispose(() => {
      clearInterval(paintId);
      if (fetchId) clearInterval(fetchId);
      root.remove();
    });
  },
});
