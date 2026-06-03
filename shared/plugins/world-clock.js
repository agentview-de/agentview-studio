import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

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
    hour12: false,
    theme: 'minimal-dark',
  }),
  schema: () => ({
    fields: [
      { key: 'zones', type: 'list', label: 'Timezones',
        itemShape: [
          { key: 'label', type: 'text', label: 'Label' },
          { key: 'tz', type: 'timezone', label: 'Time zone' },
          { key: 'format', type: 'select', label: 'Format', options: [
            { value: '',   label: 'Use widget default' },
            { value: '24', label: '24-hour (HH:MM)' },
            { value: '12', label: '12-hour (h:MM AM/PM)' },
          ] },
        ] },
      { key: 'display', type: 'select', label: 'Show', options: [
        { value: 'time-date', label: 'Time + date' },
        { value: 'time', label: 'Time only' },
        { value: 'time-seconds', label: 'Time with seconds' },
      ] },
      { key: 'hour12', type: 'toggle', label: '12-hour clock' },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-worldclock bb-theme-${c.theme ?? 'minimal-dark'}`;
    const zones = Array.isArray(c.zones) ? c.zones : [];
    if (!zones.length) {
      root.innerHTML = `
        ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
        <div class="bb-wc-empty" style="opacity:.55;align-self:center;">Add a time zone in the inspector.</div>`;
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-wc-grid">
        ${zones.map(z => `
          <div class="bb-wc-card" data-tz="${escapeHtml(z.tz)}" data-format="${escapeHtml(z.format || '')}">
            <div class="bb-wc-city">${escapeHtml(z.label || z.tz)}</div>
            <div class="bb-wc-time">--:--</div>
            <div class="bb-wc-date">—</div>
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(root);
    const display = c.display ?? 'time-date';
    const h12Default = !!c.hour12;
    const showDate = display === 'time-date';
    const baseOpts = display === 'time-seconds'
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' };

    const tick = () => {
      const now = new Date();
      for (const card of root.querySelectorAll('.bb-wc-card')) {
        const tz = card.dataset.tz;
        // Per-zone hour12 override: 'no value' means inherit the widget
        // setting; explicit '12'/'24' lets US-on-NYC and DE-on-Berlin sit
        // on the same wall.
        const f = card.dataset.format;
        const h12 = f === '12' ? true : f === '24' ? false : h12Default;
        const dateEl = card.querySelector('.bb-wc-date');
        try {
          card.querySelector('.bb-wc-time').textContent =
            new Intl.DateTimeFormat(undefined, { timeZone: tz, ...baseOpts, hour12: h12 }).format(now);
          if (showDate) {
            dateEl.textContent = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', day: '2-digit', month: 'short' }).format(now);
          } else { dateEl.style.display = 'none'; }
        } catch { card.querySelector('.bb-wc-time').textContent = '??:??'; }
      }
    };
    tick();
    const id = setInterval(tick, display === 'time-seconds' ? 1000 : 30000);
    return composeDispose(() => { clearInterval(id); root.remove(); });
  },
});

