import { register } from './registry.js';
import { colorOverrideDefaults, themeColorSection, applyColorOverrides } from '../widget-color.js';
import { textScaleField } from '../text-scale.js';
import { localeField } from '../locale-field.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

// Intl option sets for the date line. 'weekday-short' matches the historic
// hardcoded format ('Mon, 02 Jun'), so existing slides render unchanged.
const DATE_OPTS = {
  'weekday-short': { weekday: 'short', day: '2-digit', month: 'short' },
  'weekday-long':  { weekday: 'long',  day: 'numeric', month: 'long' },
  'date-short':    { day: '2-digit', month: 'short' },
  'date-year':     { day: 'numeric', month: 'long', year: 'numeric' },
  'weekday-only':  { weekday: 'long' },
};

// The timeZoneName part for a zone at an instant ('shortOffset' → 'GMT+9',
// 'longOffset' → 'GMT+05:30'). '' when the engine lacks the style or the tz
// is invalid — callers then simply skip the line instead of breaking the card.
function tzNamePart(tz, style, now) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style })
      .formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch { return ''; }
}

// Offset from UTC in minutes, DST-aware for the given instant; null when it
// cannot be determined (the relative-to-home line is skipped then).
function tzOffsetMinutes(tz, now) {
  const v = tzNamePart(tz, 'longOffset', now);
  if (v === 'GMT' || v === 'UTC') return 0;
  const m = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(v);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : null;
}

// Local hour 0–23 in a zone; null on a bad tz.
function tzHour(tz, now) {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now));
  } catch { return null; }
}

export default register({
  type: 'world-clock',
  label: 'World Clock',
  group: 'live',
  icon: '🌍',
  schemaVersion: 2,
  defaults: () => ({ ...colorOverrideDefaults(),
    zones: [
      { label: 'Berlin', tz: 'Europe/Berlin' },
      { label: 'New York', tz: 'America/New_York' },
      { label: 'Tokyo', tz: 'Asia/Tokyo' },
    ],
    display: 'time-date',
    dateFormat: 'weekday-short',
    hour12: false,
    locale: '',
    showOffset: false,
    showRelative: false,
    showDayNight: false,
    layout: 'auto',
    highlightFirst: false,
    textScale: 100,
    theme: 'minimal-dark',
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'timezones', label: 'Time zones',
        summary: c => {
          const names = (Array.isArray(c.zones) ? c.zones : []).map(z => z?.label || z?.tz).filter(Boolean);
          return names.slice(0, 3).join(' · ') + (names.length > 3 ? ` +${names.length - 3}` : '');
        } },
      { key: 'zones', type: 'list', label: 'Zones',
        help: 'Drag to reorder — the first zone counts as home. An empty label falls back to the zone id.',
        validate: v => (Array.isArray(v) && v.some(z => !(z && typeof z.tz === 'string' && z.tz.trim())))
          ? { level: 'warn', message: 'A zone is missing its time zone — it will show "??:??" on the display.' }
          : null,
        itemShape: [
          { key: 'label', type: 'text', label: 'Label' },
          { key: 'tz', type: 'timezone', label: 'Time zone',
            help: 'Pick the city — the label is free text.' },
          // Per-zone hour12 override: 'no value' inherits the widget setting;
          // explicit 12/24 lets US-on-NYC and DE-on-Berlin share one wall.
          { key: 'format', type: 'select', label: 'Format', options: [
            { value: '',   label: 'Use widget default' },
            { value: '24', label: '24-hour (HH:MM)' },
            { value: '12', label: '12-hour (h:MM AM/PM)' },
          ] },
        ] },

      { type: 'section', key: 'displayopts', label: 'Display',
        summary: c => ((c.display ?? 'time-date') === 'date' ? '' : (c.hour12 ? '12h' : '24h')) },
      { key: 'display', type: 'select', label: 'Show', buttons: true, tier: 'advanced', options: [
        { value: 'time-date', label: 'Time + date' },
        { value: 'time', label: 'Time only' },
        { value: 'time-seconds', label: 'Time + seconds' },
        { value: 'date', label: 'Date only' },
      ] },
      { key: 'dateFormat', type: 'select', label: 'Date style', tier: 'advanced',
        showIf: c => ['time-date', 'date'].includes(c.display ?? 'time-date'),
        options: [
          { value: 'weekday-short', label: 'Weekday + date (Mon, 02 Jun)' },
          { value: 'weekday-long',  label: 'Long weekday + date (Monday, 2 June)' },
          { value: 'date-short',    label: 'Compact date (02 Jun)' },
          { value: 'date-year',     label: 'Date with year (2 June 2026)' },
          { value: 'weekday-only',  label: 'Weekday only (Monday)' },
        ] },
      { key: 'hour12', type: 'toggle', label: '12-hour clock', tier: 'advanced',
        showIf: c => (c.display ?? 'time-date') !== 'date',
        help: 'Default for zones whose Format is set to “Use widget default”.' },
      { ...localeField(), tier: 'advanced' },
      { key: 'showOffset', type: 'toggle', label: 'Show UTC offset', tier: 'advanced',
        help: 'Adds “UTC+9” under each city — disambiguates sites across the world at a glance.' },
      { key: 'showRelative', type: 'toggle', label: 'Show difference to home', tier: 'advanced',
        help: 'Shows the offset to the first zone, e.g. “+6h” — handy for planning calls.' },
      { key: 'showDayNight', type: 'toggle', label: 'Day/night indicator', tier: 'advanced',
        help: 'Shows a sun or moon per city and gently dims cards at night (22:00–06:00).' },

      { type: 'section', key: 'layoutopts', label: 'Layout',
        summary: c => `${c.textScale ?? 100}%` },
      { key: 'layout', type: 'select', label: 'Arrangement', buttons: true, options: [
        { value: 'auto', label: 'Auto grid' },
        { value: 'row', label: 'Single row' },
        { value: 'list', label: 'Vertical list' },
        { value: 'two-cols', label: 'Two columns' },
      ] },
      { key: 'highlightFirst', type: 'toggle', label: 'Highlight home zone', tier: 'advanced',
        help: 'Accent border on the first zone so the local site stands out.' },
      { ...textScaleField(), tier: 'advanced' },

      ...themeColorSection(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-worldclock bb-theme-${c.theme ?? 'minimal-dark'}`;
    // Text-size multiplier consumed by the .bb-wc-* stylesheet clamps and the
    // inline sub-line below. Floor guards against a stored 0/NaN.
    root.style.setProperty('--bb-wc-text-scale', String(Math.max(0.2, (Number(c.textScale) || 100) / 100)));
    const zones = Array.isArray(c.zones) ? c.zones : [];
    if (!zones.length) {
      root.innerHTML = `
        ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
        <div class="bb-wc-empty" style="opacity:.55;align-self:center;">Add a time zone in the inspector.</div>`;
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }

    const locale = c.locale || undefined;
    const display = c.display ?? 'time-date';
    const dateOnly = display === 'date';
    const showDate = display === 'time-date';
    const showSub = !!(c.showOffset || c.showRelative);
    // .bb-wc-sub has no stylesheet rule (widget-internal) — sized inline like
    // .bb-wc-date, including the text-scale multiplier.
    const subStyle = 'font-size:calc(clamp(12px,1.6cqmin,22px) * var(--bb-wc-text-scale,1));opacity:.6;margin-top:4px;font-variant-numeric:tabular-nums;';

    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-wc-grid">
        ${zones.map(z => `
          <div class="bb-wc-card" data-field="zones layout highlightFirst showDayNight" data-tz="${escapeHtml(z.tz)}" data-format="${escapeHtml(z.format || '')}">
            <div class="bb-wc-city" data-field="zones showDayNight">${c.showDayNight ? '<span class="bb-wc-dn" data-field="showDayNight zones" style="margin-right:.45em;"></span>' : ''}${escapeHtml(z.label || z.tz)}</div>
            <div class="bb-wc-time" data-field="zones display hour12 locale textScale">--:--</div>
            ${showDate ? '<div class="bb-wc-date" data-field="dateFormat display zones locale textScale">—</div>' : ''}
            ${showSub ? `<div class="bb-wc-sub" data-field="showOffset showRelative zones locale textScale" style="${subStyle}"></div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(root);

    // Arrangement — inline overrides on top of the stylesheet's auto-fit grid,
    // so a thin header bar can force one row and a sidebar a vertical list.
    const grid = root.querySelector('.bb-wc-grid');
    const layout = c.layout ?? 'auto';
    if (layout === 'row') grid.style.cssText += 'grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:1fr;';
    else if (layout === 'list') grid.style.gridTemplateColumns = '1fr';
    else if (layout === 'two-cols') grid.style.gridTemplateColumns = 'repeat(2, 1fr)';

    const cards = [...root.querySelectorAll('.bb-wc-card')];
    if (c.highlightFirst && cards[0]) {
      // Inset shadow instead of border so the card's box size never shifts.
      cards[0].style.boxShadow = 'inset 0 0 0 2px var(--bb-st-accent, #8b5cf6)';
    }

    const h12Default = !!c.hour12;
    const baseOpts = display === 'time-seconds'
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' };
    const dateOpts = DATE_OPTS[c.dateFormat] ?? DATE_OPTS['weekday-short'];
    const homeTz = typeof zones[0]?.tz === 'string' ? zones[0].tz : '';

    // The slow parts (date line, offsets, day/night) change on minute
    // boundaries at most — skip them between minutes so the 1-second tick of
    // the seconds mode stays cheap.
    let lastSlowKey = '';
    const tick = () => {
      const now = new Date();
      const slowKey = `${now.getHours()}:${now.getMinutes()}`;
      const slow = slowKey !== lastSlowKey;
      lastSlowKey = slowKey;
      const homeOffset = (slow && c.showRelative && homeTz) ? tzOffsetMinutes(homeTz, now) : null;
      for (const card of cards) {
        const tz = card.dataset.tz;
        // Per-zone hour12 override: 'no value' means inherit the widget
        // setting; explicit '12'/'24' wins per card.
        const f = card.dataset.format;
        const h12 = f === '12' ? true : f === '24' ? false : h12Default;
        const timeEl = card.querySelector('.bb-wc-time');
        try {
          timeEl.textContent = dateOnly
            ? new Intl.DateTimeFormat(locale, { timeZone: tz, ...dateOpts }).format(now)
            : new Intl.DateTimeFormat(locale, { timeZone: tz, ...baseOpts, hour12: h12 }).format(now);
          if (slow && showDate) {
            card.querySelector('.bb-wc-date').textContent =
              new Intl.DateTimeFormat(locale, { timeZone: tz, ...dateOpts }).format(now);
          }
        } catch { timeEl.textContent = '??:??'; }
        if (!slow) continue;
        if (showSub) {
          const bits = [];
          if (c.showOffset) {
            const off = tzNamePart(tz, 'shortOffset', now).replace('GMT', 'UTC');
            if (off) bits.push(off === 'UTC' ? 'UTC±0' : off);
          }
          if (c.showRelative && homeOffset != null) {
            const mins = tzOffsetMinutes(tz, now);
            if (mins != null) {
              const rel = mins - homeOffset;
              const sign = rel < 0 ? '−' : '+';
              const abs = Math.abs(rel);
              const hh = Math.floor(abs / 60), mm = abs % 60;
              bits.push(rel === 0 ? '±0h' : mm ? `${sign}${hh}:${String(mm).padStart(2, '0')}` : `${sign}${hh}h`);
            }
          }
          card.querySelector('.bb-wc-sub').textContent = bits.join(' · ');
        }
        if (c.showDayNight) {
          const h = tzHour(tz, now);
          const dn = card.querySelector('.bb-wc-dn');
          if (dn) dn.textContent = h == null ? '' : (h >= 6 && h < 18 ? '☀️' : '🌙');
          // Gentle night dim (22:00–06:00) — 'is Tokyo asleep' at a glance.
          card.style.opacity = (h != null && (h >= 22 || h < 6)) ? '.65' : '';
        }
      }
    };
    tick();
    const id = setInterval(tick, display === 'time-seconds' ? 1000 : 30000);
    return composeDispose(() => { clearInterval(id); root.remove(); });
  },
});
