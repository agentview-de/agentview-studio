import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

export default register({
  type: 'countdown',
  label: 'Countdown',
  group: 'live',
  icon: '⏳',
  schemaVersion: 2,
  defaults: () => ({ ...colorOverrideDefaults(),
    target: { at: Date.now() + 7 * 86_400_000, tz: defaultTz() },
    heading: 'Countdown to',
    theme: 'gradient-purple',
    expiredText: 'Now!',
    units: 'auto',
  }),
  schema: () => ({
    fields: [
      { key: 'heading', type: 'text', label: 'Heading' },
      { key: 'target',  type: 'datetime', label: 'Target date & time' },
      { key: 'expiredText', type: 'text', label: 'Text when reached' },
      { key: 'units', type: 'select', label: 'Show units', options: [
        { value: 'auto',   label: 'Auto (hide finer units when target is far away)' },
        { value: 'dhms',   label: 'Days · hours · minutes · seconds' },
        { value: 'dhm',    label: 'Days · hours · minutes' },
        { value: 'dh',     label: 'Days · hours' },
        { value: 'days',   label: 'Just days' },
        { value: 'hms',    label: 'Hours · minutes · seconds (≤24h)' },
      ], help: 'For long countdowns (≥1 week) "just days" or "days+hours" reads better than burning a seconds digit.' },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const targetAt = (c.target && typeof c.target === 'object') ? c.target.at : null;
    const target = targetAt != null ? new Date(targetAt) : null;
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-countdown bb-theme-${c.theme ?? 'gradient-purple'}`;
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      ${c.heading ? `<div class="bb-cd-heading">${escapeHtml(c.heading)}</div>` : ''}
      <div class="bb-cd-grid"></div>
    `;
    container.appendChild(root);
    const grid = root.querySelector('.bb-cd-grid');
    // Map of unit code → cell HTML; the render function picks the subset
    // matching the requested mode. Auto resolves the mode dynamically based
    // on how far the target is, long ranges prefer fewer units.
    const labels = { d: 'days', h: 'hrs', m: 'min', s: 'sec' };
    const cell = (k, v) => `<div><b class="bb-cd-${k}">${v}</b><span>${labels[k]}</span></div>`;

    const tick = () => {
      if (!target || isNaN(target.getTime())) {
        grid.textContent = 'Set a target date.';
        return;
      }
      const ms = target.getTime() - Date.now();
      if (ms <= 0) {
        // Responsive like the rest of the widget set, a fixed 84px overflowed
        // small tiles and looked lost on a wall-sized TV. .bb-cd-grid is inside
        // the .bb-slide size-container, so cq units track the actual tile.
        grid.innerHTML = `<div style="font:800 min(18cqw,26cqh)/1.05 var(--bb-st-font, Inter, sans-serif);">${escapeHtml(c.expiredText ?? 'Now!')}</div>`;
        return;
      }
      const d = Math.floor(ms / 86_400_000);
      const h = Math.floor(ms / 3_600_000) % 24;
      const m = Math.floor(ms / 60_000) % 60;
      const s = Math.floor(ms / 1000) % 60;
      // Pick which units to show. Auto: ≥30d days only; ≥7d d+h; ≥1d d+h+m;
      // else full d+h+m+s. (≤24h "hms" hides days, useful for openings.)
      let mode = c.units ?? 'auto';
      if (mode === 'auto') {
        if (d >= 30) mode = 'days';
        else if (d >= 7) mode = 'dh';
        else if (d >= 1) mode = 'dhm';
        else mode = 'dhms';
      }
      const pad = n => n.toString().padStart(2, '0');
      const parts = [];
      if (mode === 'days')   parts.push(cell('d', d));
      else if (mode === 'dh') parts.push(cell('d', d), cell('h', pad(h)));
      else if (mode === 'dhm') parts.push(cell('d', d), cell('h', pad(h)), cell('m', pad(m)));
      else if (mode === 'hms') parts.push(cell('h', pad(d * 24 + h)), cell('m', pad(m)), cell('s', pad(s)));
      else parts.push(cell('d', d), cell('h', pad(h)), cell('m', pad(m)), cell('s', pad(s)));
      grid.innerHTML = parts.join('');
    };
    tick();
    // Per-second tick only when seconds are visible; otherwise per-minute is
    // plenty, saves 59 unnecessary repaints per minute on multi-day countdowns.
    const needsSeconds = c.units === 'dhms' || c.units === 'hms' || c.units === 'auto';
    const id = setInterval(tick, needsSeconds ? 1000 : 30000);
    return composeDispose(() => { clearInterval(id); root.remove(); });
  },
});


function defaultTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}
