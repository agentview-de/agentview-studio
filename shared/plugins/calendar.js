import { register } from './registry.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { renderCalendarView, CALENDAR_VIEW_OPTIONS } from '../calendar-views.js';
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
    events: [
      { start: localInput(new Date(Date.now() + 2 * 3600e3)), summary: 'Team standup' },
      { start: localInput(new Date(Date.now() + 26 * 3600e3)), summary: 'Roadmap review', location: 'Room 2' },
    ],
  }),
  schema: () => ({
    fields: [
      { key: 'view', type: 'select', label: 'View', options: CALENDAR_VIEW_OPTIONS },
      { key: 'heading', type: 'text', label: 'Heading', showIf: c => ['agenda', 'today'].includes(c.view ?? 'agenda') },
      { key: 'maxItems', type: 'number', label: 'Max events', min: 1, max: 20, slider: true,
        showIf: c => (c.view ?? 'agenda') === 'agenda' },
      { key: 'hidePast', type: 'toggle', label: 'Hide past events',
        showIf: c => ['agenda', 'today'].includes(c.view ?? 'agenda'),
        help: 'Keeps the agenda forward-looking, yesterday\'s items drop off automatically.' },
      { key: 'events', type: 'calendar-events', label: 'Events',
        help: 'Add events by hand or import a calendar file: in Google/Outlook/Apple export the calendar as .ics, then use “.ics file”. (No live sync, the events are stored in this slide.)' },
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const view = CALENDAR_VIEW_OPTIONS.some(o => o.value === c.view) ? c.view : 'agenda';
    const showHeading = ['agenda', 'today'].includes(view) && c.heading;
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    // NOTE: do NOT add `bb-cal-${view}` here, the inner wrapper returned by
    // each view renderer already carries it. Putting it on the slide root too
    // turns the slide itself into a grid (collapses content into one column).
    root.className = `bb-slide bb-slide-calendar`;
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      ${showHeading ? `<h2 class="bb-h2">${escapeHtml(c.heading)}</h2>` : ''}
      <div class="bb-cal-view"></div>`;
    container.appendChild(root);
    const viewHost = root.querySelector('.bb-cal-view');
    const allEvents = toEvents(c.events);

    // Every view is clock-relative: now-next flips Busy/Free at event
    // boundaries, agenda/today roll over at midnight, week/month move the
    // "today" highlight. Rendering once would freeze the widget at first
    // paint, a meeting-room screen would keep showing "Busy" for an event
    // that ended an hour ago. Re-paint every 60s; it's a pure string render
    // with no network, so the cost is negligible.
    const paint = () => {
      let events = allEvents;
      // Hide past events for agenda/today views, keeps the list forward-
      // looking on long-running displays. Week/month views naturally show
      // past dates as part of the grid, so we skip filtering there. The
      // cutoff is recomputed each tick so it tracks the wall clock.
      if (c.hidePast !== false && ['agenda', 'today'].includes(view)) {
        const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
        events = allEvents.filter(e => (e.end ?? e.start) >= cutoff);
      }
      viewHost.innerHTML = renderCalendarView(view, events, { maxItems: c.maxItems ?? 6 });
    };
    paint();
    const id = setInterval(paint, 60000);
    return composeDispose(() => { clearInterval(id); root.remove(); });
  },
});

