import { register } from './registry.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { textScaleField } from '../text-scale.js';
import { localeField } from '../locale-field.js';
import { defaultTz } from '../utils/default-tz.js';

// Time-of-day aware welcome message. Common in hotel lobbies, office
// reception walls, restaurant entrances, the greeting rotates by hour
// ("Good morning" → "Good afternoon" → "Good evening" → "Good night")
// and optionally prefixes a venue / guest / event name. The date line can
// carry the current time too (lobby screens double as clocks) and follows
// the audience language, not the player OS.

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

// Seconds since midnight in the venue's zone — drives the boundary-scheduled
// tick. Same graceful degradation as partOfDay: invalid zone → player time.
function secondsOfDay(date, tz) {
  try {
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    }).formatToParts(date);
    const get = t => +p.find(x => x.type === t).value;
    return (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
  } catch {
    return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  }
}

// Cross-field ordering warning for the hour boundaries — warn, never block:
// out-of-order hours still render (resolveHours clamps), they just produce
// surprising greetings.
const startsAfter = (prevKey, message) => (v, c) => {
  const a = +v, b = +((c ?? {})[prevKey]);
  return Number.isFinite(a) && Number.isFinite(b) && a <= b ? { level: 'warn', message } : null;
};

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
    showTime: false,
    locale: '',
    textScale: 100,
    theme: 'gradient-purple',
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
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

      { type: 'section', key: 'greetings', label: 'Greetings by time of day', collapsed: true,
        help: 'Any language works — e.g. “Guten Morgen”, “Buongiorno”, “Bonsoir”.',
        // The greeting that is live RIGHT NOW — user content, so no overlay needed.
        summary: c => {
          try {
            const part = partOfDay(new Date(), c.timezone || defaultTz(), resolveHours(c));
            return ({ morning: c.greetMorning, afternoon: c.greetAfternoon,
              evening: c.greetEvening, night: c.greetNight })[part] || GREETINGS_DEFAULT[part];
          } catch { return ''; }
        } },
      { key: 'greetMorning',   type: 'text', label: 'Morning greeting' },
      { key: 'greetAfternoon', type: 'text', label: 'Afternoon greeting' },
      { key: 'greetEvening',   type: 'text', label: 'Evening greeting' },
      { key: 'greetNight',     type: 'text', label: 'Night greeting' },

      { type: 'section', key: 'hours', label: 'Hour boundaries', collapsed: true,
        help: 'Each greeting starts at its hour (0–24) in the venue’s time zone and runs until the next one.',
        summary: c => { const h = resolveHours(c); return `${h.morning} · ${h.afternoon} · ${h.evening} · ${h.night} h`; } },
      { type: 'row', children: [
        { key: 'hourMorning',   type: 'number', label: 'Morning starts', min: 0, max: 24, suffix: 'h' },
        { key: 'hourAfternoon', type: 'number', label: 'Afternoon starts', min: 0, max: 24, suffix: 'h',
          validate: startsAfter('hourMorning', 'Afternoon should start after morning.') },
      ] },
      { type: 'row', children: [
        { key: 'hourEvening', type: 'number', label: 'Evening starts', min: 0, max: 24, suffix: 'h',
          validate: startsAfter('hourAfternoon', 'Evening should start after afternoon.') },
        { key: 'hourNight',   type: 'number', label: 'Night starts', min: 0, max: 24, suffix: 'h',
          validate: startsAfter('hourEvening', 'Night should start after evening.') },
      ] },

      { type: 'section', key: 'appearance', label: 'Appearance' },
      { key: 'showDate', type: 'toggle', label: 'Show today\'s date below' },
      { key: 'showTime', type: 'toggle', label: 'Show current time',
        help: 'Appends the current time (HH:mm) next to the date — handy when the lobby screen doubles as a clock.' },
      { ...localeField(), showIf: c => c.showDate !== false || !!c.showTime },
      textScaleField(),

      ...themeColorSection(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const tz = c.timezone || defaultTz();
    // Invalid stored locale tag → device default (same defensive pattern as
    // partOfDay's timezone fallback).
    let loc;
    try { new Intl.DateTimeFormat(c.locale || undefined); loc = c.locale || undefined; }
    catch { loc = undefined; }
    const showDate = c.showDate !== false;
    const showTime = !!c.showTime;
    const metaVisible = showDate || showTime;

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-greeting bb-theme-${c.theme ?? 'gradient-purple'}`;
    root.style.cssText += 'container-type:size;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.3em;text-align:center;padding:6cqmin;';
    root.style.setProperty('--bb-greeting-text-scale', String((Number(c.textScale) || 100) / 100));
    // cqmin clamps stay box-relative; the user's Text size multiplies on top.
    const fs = clamp => `font-size:calc(${clamp} * var(--bb-greeting-text-scale, 1));`;
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-greet-line" data-field="venue welcomeTo greetMorning greetAfternoon greetEvening greetNight hourMorning hourAfternoon hourEvening hourNight timezone textScale" style="font-weight:700;${fs('clamp(28px, 8cqmin, 80px)')}line-height:1.1;font-family:var(--bb-st-font, Inter, sans-serif);">—</div>
      ${c.subtitle ? `<div class="bb-greet-sub" data-field="subtitle textScale" style="font-weight:500;${fs('clamp(14px, 2.6cqmin, 22px)')}line-height:1.4;font-family:var(--bb-st-font, Inter, sans-serif);opacity:.75;margin-top:.4em;">${escapeHtml(c.subtitle)}</div>` : ''}
      <div class="bb-greet-date" data-field="showDate showTime locale timezone textScale" style="font-weight:600;${fs('clamp(13px, 2.2cqmin, 20px)')}line-height:1.3;font-family:var(--bb-st-font, Inter, sans-serif);opacity:.6;margin-top:1.2em;${metaVisible ? '' : 'display:none;'}">—</div>
    `;
    container.appendChild(root);
    const lineEl = root.querySelector('.bb-greet-line');
    const dateEl = root.querySelector('.bb-greet-date');

    // An invalid IANA zone must not kill the tick — drop the timeZone and
    // render player-local instead (partOfDay degrades the same way).
    const makeFmt = opts => {
      try { return new Intl.DateTimeFormat(loc, { timeZone: tz, ...opts }); }
      catch { return new Intl.DateTimeFormat(loc, opts); }
    };
    const dateFmt = showDate ? makeFmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : null;
    // No explicit hour12: the audience locale decides 12h vs 24h notation.
    const timeFmt = showTime ? makeFmt({ hour: '2-digit', minute: '2-digit' }) : null;

    // An emptied text falls back to the default OF ITS OWN part of day
    // (an empty evening greeting must not show "Good morning").
    const greetingFor = part => ({
      morning: c.greetMorning, afternoon: c.greetAfternoon,
      evening: c.greetEvening, night: c.greetNight,
    })[part] || GREETINGS_DEFAULT[part];

    const hours = resolveHours(c);
    const tick = () => {
      const now = new Date();
      const greet = greetingFor(partOfDay(now, tz, hours));
      // "Good morning, welcome to the Grand Hotel" when venue is set; just
      // the greeting when it isn't.
      lineEl.textContent = c.venue ? `${greet}, ${c.welcomeTo ?? 'welcome to'} ${c.venue}` : greet;
      if (metaVisible) {
        dateEl.textContent = [dateFmt && dateFmt.format(now), timeFmt && timeFmt.format(now)]
          .filter(Boolean).join(' · ');
      }
    };
    tick();

    let timer = 0;
    if (showTime) {
      // Minute-precision clock on screen — 30 s keeps HH:mm at most half a
      // minute stale (and covers part-of-day flips and the midnight date roll).
      timer = setInterval(tick, 30 * 1000);
    } else {
      // Sleep until the NEXT part-of-day boundary (midnight included, for the
      // date line) instead of polling every 5 minutes — the greeting flips on
      // the exact hour with far fewer wakeups. Capped at 60 min so DST shifts
      // and timer drift on suspended devices self-correct within the hour.
      const boundaries = [hours.morning, hours.afternoon, hours.evening, hours.night, 24].map(h => h * 3600);
      const schedule = () => {
        const sec = secondsOfDay(new Date(), tz);
        const next = Math.min(...boundaries.filter(b => b > sec));
        const wait = Math.max(1000, Math.min((next - sec) * 1000 + 500, 60 * 60 * 1000));
        timer = setTimeout(() => { tick(); schedule(); }, wait);
      };
      schedule();
    }
    return composeDispose(() => { clearInterval(timer); clearTimeout(timer); root.remove(); });
  },
});
