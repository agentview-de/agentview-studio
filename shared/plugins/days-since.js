import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

function localTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export default register({
  type: 'days-since',
  label: 'Days Since',
  group: 'live',
  icon: '🧮',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(), since: { at: Date.now() - 30 * 86400000, tz: localTz() }, heading: 'Days without incident', showDate: true, theme: 'industrial-steel' }),
  schema: () => ({
    fields: [
      { key: 'heading', type: 'text', label: 'Heading' },
      { key: 'since', type: 'datetime', label: 'Counting since' },
      { key: 'showDate', type: 'toggle', label: 'Show the start date' },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const at = (c.since && typeof c.since === 'object') ? c.since.at : null;
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-dayssince bb-theme-${c.theme ?? 'industrial-steel'}`;
    root.style.cssText += 'container-type:size;width:100%;height:100%;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.2em;';

    if (at == null) {
      root.innerHTML = '<div class="bb-ds-empty">Set a start date.</div>';
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }

    root.innerHTML = `
      ${c.heading ? `<div class="bb-ds-heading">${escapeHtml(c.heading)}</div>` : ''}
      <div class="bb-ds-count">—</div>
      <div class="bb-ds-unit">days</div>
      ${c.showDate ? `<div class="bb-ds-date"></div>` : ''}`;

    const tick = () => {
      // Count whole CALENDAR days (local midnight → local midnight), not raw
      // 24h spans: the counter must flip exactly at midnight and stay correct
      // across DST changes (where a "day" is 23h or 25h long). Math.round soaks
      // up the ±1h DST drift between the two midnights.
      const start = new Date(at); start.setHours(0, 0, 0, 0);
      const today = new Date();   today.setHours(0, 0, 0, 0);
      const days = Math.max(0, Math.round((today - start) / 86400000));
      root.querySelector('.bb-ds-count').textContent = days.toLocaleString();
      root.querySelector('.bb-ds-unit').textContent = days === 1 ? 'day' : 'days';
      const dateEl = root.querySelector('.bb-ds-date');
      if (dateEl) dateEl.textContent = 'since ' + new Date(at).toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });
    };
    tick();
    const id = setInterval(tick, 60000);
    container.appendChild(root);
    return composeDispose(() => { clearInterval(id); root.remove(); });
  },
});

