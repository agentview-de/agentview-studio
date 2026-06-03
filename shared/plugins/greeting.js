import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

// Time-of-day aware welcome message. Common in hotel lobbies, office
// reception walls, restaurant entrances, the greeting rotates by hour
// ("Good morning" → "Good afternoon" → "Good evening" → "Good night")
// and optionally prefixes a venue / guest / event name.

const GREETINGS_DEFAULT = {
  morning:   'Good morning',
  afternoon: 'Good afternoon',
  evening:   'Good evening',
  night:     'Good night',
};

// Hour ranges default to hospitality conventions (5/12/17/22) but each
// boundary is configurable via the widget schema, a 24h diner might want
// "Good morning" until 14:00, a nightclub might want "Good evening"
// starting at 19:00.
function partOfDay(date, tz, hours) {
  let h;
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' });
    h = +fmt.format(date);
  } catch { h = date.getHours(); }
  const m = hours.morning, a = hours.afternoon, e = hours.evening, n = hours.night;
  if (h < m)  return 'night';
  if (h < a)  return 'morning';
  if (h < e)  return 'afternoon';
  if (h < n)  return 'evening';
  return 'night';
}

const DEFAULT_HOURS = { morning: 5, afternoon: 12, evening: 17, night: 22 };
function resolveHours(c) {
  const clamp = v => (Number.isInteger(+v) && +v >= 0 && +v <= 24) ? +v : null;
  return {
    morning:   clamp(c.hourMorning)   ?? DEFAULT_HOURS.morning,
    afternoon: clamp(c.hourAfternoon) ?? DEFAULT_HOURS.afternoon,
    evening:   clamp(c.hourEvening)   ?? DEFAULT_HOURS.evening,
    night:     clamp(c.hourNight)     ?? DEFAULT_HOURS.night,
  };
}

function defaultTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

export default register({
  type: 'greeting',
  label: 'Greeting',
  group: 'basic',
  icon: '👋',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    venue: 'the Grand Hotel',
    welcomeTo: 'welcome to',
    subtitle: 'Today\'s WiFi: lobby · password 1234',
    greetMorning:   GREETINGS_DEFAULT.morning,
    greetAfternoon: GREETINGS_DEFAULT.afternoon,
    greetEvening:   GREETINGS_DEFAULT.evening,
    greetNight:     GREETINGS_DEFAULT.night,
    hourMorning:    DEFAULT_HOURS.morning,
    hourAfternoon:  DEFAULT_HOURS.afternoon,
    hourEvening:    DEFAULT_HOURS.evening,
    hourNight:      DEFAULT_HOURS.night,
    timezone: defaultTz(),
    showDate: true,
    theme: 'gradient-purple',
  }),
  schema: () => ({
    fields: [
      { type: 'section', label: 'Content' },
      { key: 'venue', type: 'text', label: 'Venue / suffix',
        placeholder: 'the Grand Hotel',
        help: 'Appended after the greeting and the connector text. Leave blank for just the greeting.' },
      { key: 'welcomeTo', type: 'text', label: 'Connector text',
        placeholder: 'welcome to',
        showIf: c => !!c.venue,
        help: 'Text between greeting and venue name. e.g. "willkommen im" (DE), "bienvenue au" (FR).' },
      { key: 'subtitle', type: 'text', label: 'Subtitle (optional)',
        placeholder: 'Today\'s WiFi: lobby · password 1234' },
      { key: 'timezone', type: 'timezone', label: 'Time zone',
        help: 'Drives which greeting fires, set to the venue\'s local TZ even if the player is somewhere else.' },

      { type: 'section', label: 'Greetings by time of day', collapsed: true },
      { key: 'greetMorning',   type: 'text', label: 'Morning greeting' },
      { key: 'greetAfternoon', type: 'text', label: 'Afternoon greeting' },
      { key: 'greetEvening',   type: 'text', label: 'Evening greeting' },
      { key: 'greetNight',     type: 'text', label: 'Night greeting' },

      { type: 'section', label: 'Hour boundaries (0–24)', collapsed: true },
      { type: 'row', children: [
        { key: 'hourMorning',   type: 'number', label: 'Morning starts', min: 0, max: 24 },
        { key: 'hourAfternoon', type: 'number', label: 'Afternoon starts', min: 0, max: 24 },
      ] },
      { type: 'row', children: [
        { key: 'hourEvening', type: 'number', label: 'Evening starts', min: 0, max: 24 },
        { key: 'hourNight',   type: 'number', label: 'Night starts', min: 0, max: 24 },
      ] },

      { type: 'section', label: 'Appearance' },
      { key: 'showDate', type: 'toggle', label: 'Show today\'s date below' },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const tz = c.timezone || defaultTz();
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-greeting bb-theme-${c.theme ?? 'gradient-purple'}`;
    root.style.cssText += 'container-type:size;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.3em;text-align:center;padding:6cqmin;';
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-greet-line" style="font:700 clamp(28px, 8cqmin, 80px)/1.1 var(--bb-st-font, Inter, sans-serif);">—</div>
      ${c.subtitle ? `<div class="bb-greet-sub" style="font:500 clamp(14px, 2.6cqmin, 22px)/1.4 var(--bb-st-font, Inter, sans-serif);opacity:.75;margin-top:.4em;">${escapeHtml(c.subtitle)}</div>` : ''}
      <div class="bb-greet-date" style="font:600 clamp(13px, 2.2cqmin, 20px)/1.3 var(--bb-st-font, Inter, sans-serif);opacity:.6;margin-top:1.2em;${c.showDate === false ? 'display:none;' : ''}">—</div>
    `;
    container.appendChild(root);
    const lineEl = root.querySelector('.bb-greet-line');
    const dateEl = root.querySelector('.bb-greet-date');

    const greetingFor = (part) => {
      const map = {
        morning:   c.greetMorning   ?? GREETINGS_DEFAULT.morning,
        afternoon: c.greetAfternoon ?? GREETINGS_DEFAULT.afternoon,
        evening:   c.greetEvening   ?? GREETINGS_DEFAULT.evening,
        night:     c.greetNight     ?? GREETINGS_DEFAULT.night,
      };
      return map[part] || GREETINGS_DEFAULT.morning;
    };
    const hours = resolveHours(c);
    const tick = () => {
      const now = new Date();
      const part = partOfDay(now, tz, hours);
      const greet = greetingFor(part);
      // "Good morning, welcome to the Grand Hotel" when venue is set; just
      // the greeting when it isn't.
      lineEl.textContent = c.venue ? `${greet}, ${c.welcomeTo ?? 'welcome to'} ${c.venue}` : greet;
      if (c.showDate !== false) {
        dateEl.textContent = new Intl.DateTimeFormat(undefined, {
          timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        }).format(now);
      }
    };
    tick();
    // 5-minute tick: greeting only changes at part-of-day boundaries, but
    // the date will flip at local midnight without needing per-second logic.
    const id = setInterval(tick, 5 * 60 * 1000);
    return composeDispose(() => { clearInterval(id); root.remove(); });
  },
});

