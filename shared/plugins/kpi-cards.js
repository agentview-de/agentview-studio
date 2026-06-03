import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { liveSource } from '../live-source.js';
import { offlineLiveOpts, SOURCE_OPTIONS } from '../offline-data.js';
import { escapeHtml } from '../utils/escape.js';

function fmt(v, unit) {
  // The return value lands in innerHTML, so escape every untrusted piece. The
  // unit comes straight from card.* (inline table OR remote JSON) and the
  // non-numeric fallback returns the raw value verbatim, both must be escaped
  // here or they inject markup.
  const u = escapeHtml(unit ?? '');
  // Remote JSON commonly delivers numbers as strings ("124500"). Coerce those
  // so they still get k/M formatting; genuinely non-numeric values (e.g. "N/A")
  // fall through and render as-is rather than "—".
  const n = typeof v === 'number' ? v
    : (v != null && v !== '' && !isNaN(+v)) ? +v : null;
  if (n === null) return escapeHtml(String(v ?? '—'));
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M' + u;
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1)     + 'k' + u;
  return n.toLocaleString() + u;
}

function parseHistory(hist) {
  if (Array.isArray(hist)) return hist.map(Number).filter(n => !isNaN(n));
  if (typeof hist === 'string') return hist.split(/[,;\s]+/).map(s => +s).filter(n => !isNaN(n));
  return [];
}

function sparkline(values, w, h, color = '#8b5cf6') {
  if (!values || values.length < 2) return '';
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}" />
  </svg>`;
}

export default register({
  type: 'kpi-cards',
  label: 'KPI Cards',
  group: 'data',
  icon: '📈',
  network: true,
  schemaVersion: 2,
  defaults: () => ({ ...colorOverrideDefaults(),
    cards: [
      { label: 'Revenue',  value: 124500, target: 150000, unit: '€', deltaPct: 4.2, history: '98, 102, 110, 108, 115, 120, 124' },
      { label: 'Visitors', value: 8420,   target: 10000,  unit: '',  deltaPct: -1.3, history: '88, 92, 84, 95, 90, 86, 84' },
      { label: 'NPS',      value: 64,     target: 70,     unit: '',  deltaPct: 2.0,  history: '58, 60, 62, 61, 63, 63, 64' },
    ],
    source: 'inline', dataUrl: '', theme: 'corporate-blue',
  }),
  schema: () => ({
    fields: [
      { key: 'source', type: 'select', label: 'Data source', options: SOURCE_OPTIONS,
        help: 'Offline: the Studio fetches the JSON URL on “Refresh data” and stores it; the display reads that — no live call on screen.' },
      { key: 'dataUrl', type: 'url', label: 'Remote JSON URL', test: 'json',
        showIf: c => c.source === 'url' || c.source === 'stored' },
      { key: 'cards', type: 'table', label: 'KPI cards',
        showIf: c => (c.source ?? 'inline') === 'inline',
        columns: [
          { key: 'label',    label: 'Label' },
          { key: 'value',    label: 'Value',  type: 'number' },
          { key: 'target',   label: 'Target', type: 'number', placeholder: 'optional' },
          { key: 'unit',     label: 'Unit',   placeholder: '€, %, k…' },
          { key: 'deltaPct', label: 'Δ %',    type: 'number' },
          { key: 'history',  label: 'History (comma-sep.)', placeholder: '98, 102, 110' },
        ] },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-kpi bb-theme-${c.theme ?? 'corporate-blue'}`;
    root.innerHTML = `${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}<div class="bb-kpi-grid">Loading…</div>`;
    container.appendChild(root);
    const grid = root.querySelector('.bb-kpi-grid');
    const paint = (cards) => {
      cards = Array.isArray(cards) ? cards : (cards?.cards ?? []);
      grid.innerHTML = cards.map(card => {
        // Coerce: url-sourced JSON may send deltaPct as a string, and
        // "4.2".toFixed() throws. Number(...) || 0 also absorbs null/garbage.
        const delta = Number(card.deltaPct) || 0;
        const up = delta >= 0;
        // Optional "% of target" bar. Doesn't replace the value/delta, adds
        // a thin progress line + caption so the user sees actual-vs-goal at
        // a glance. Hidden when no target set.
        const target = Number(card.target);
        const hasTarget = Number.isFinite(target) && target > 0 && Number.isFinite(+card.value);
        const pct = hasTarget ? Math.max(0, Math.min(100, Math.round((+card.value / target) * 100))) : 0;
        const targetBar = hasTarget
          ? `<div class="bb-kpi-target">
               <div class="bb-kpi-targetbar"><div class="bb-kpi-targetfill" style="width:${pct}%;background:${up ? '#10b981' : '#ef4444'};"></div></div>
               <div class="bb-kpi-targettext">${pct}% of ${fmt(target, card.unit)}</div>
             </div>`
          : '';
        return `
          <div class="bb-kpi-card">
            <div class="bb-kpi-label">${escapeHtml(card.label ?? '')}</div>
            <div class="bb-kpi-value">${fmt(card.value, card.unit)}</div>
            <div class="bb-kpi-delta bb-kpi-${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${delta.toFixed(1)}%</div>
            ${targetBar}
            <div class="bb-kpi-spark">${sparkline(parseHistory(card.history), 180, 48, up ? '#10b981' : '#ef4444')}</div>
          </div>
        `;
      }).join('');
    };

    // Inline cards paint immediately; a remote source fetches once through the
    // shared live-source seam and paints (or shows the load error) on arrival.
    const stored = c.source === 'stored';
    if (stored || (c.source === 'url' && c.dataUrl)) {
      // Offline with nothing provisioned yet → neutral placeholder.
      if (stored && c._offline?.data === undefined) {
        grid.innerHTML = '<div style="grid-column:1 / -1;color:currentColor;opacity:.6;font-size:14px;padding:16px;text-align:center;">Provided-offline — appears on the display after “Refresh data”.</div>';
        return composeDispose(() => root.remove());
      }
      const stop = liveSource({
        url: c.dataUrl,
        signal: ctx?.signal,
        ...offlineLiveOpts(c),
        onData: (data) => paint(data),
        onError: (e) => {
          if (ctx?.onError?.()) return;
          grid.innerHTML =
            `<div style="grid-column: 1 / -1; color: currentColor; opacity:.6; font-size: 14px; padding: 16px; text-align: center;">⚠️ ${escapeHtml(e.message || 'Could not load KPI data')}</div>`;
        },
      });
      return composeDispose(() => { stop(); root.remove(); });
    }
    paint(c.cards);
    return composeDispose(() => root.remove());
  },
});

