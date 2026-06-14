import { register } from './registry.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { liveSource } from '../live-source.js';
import { offlineLiveOpts } from '../offline-data.js';
import { remoteJsonFields } from '../remote-json-fields.js';
import { STATUS_COLORS } from '../status-colors.js';
import { textScaleField } from '../text-scale.js';
import { localeField } from '../locale-field.js';
import { escapeHtml } from '../utils/escape.js';

function fmt(v, unit, opts = {}) {
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
  // 'compact' (default, the historical output) abbreviates with k/M; 'full'
  // shows the exact figure — finance audiences often require it. Grouping
  // follows the audience language ('' falls through to the device default).
  const locale = opts.locale || undefined;
  if (opts.format !== 'full') {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M' + u;
    if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1)     + 'k' + u;
  }
  return n.toLocaleString(locale) + u;
}

function parseHistory(hist) {
  if (Array.isArray(hist)) return hist.map(Number).filter(n => !isNaN(n));
  if (typeof hist === 'string') return hist.split(/[,;\s]+/).map(s => +s).filter(n => !isNaN(n));
  return [];
}

// Inline-table toggles store 1/'' while remote JSON may send true/"true"/1.
// One coercion so both shapes flip the colour mapping.
function isTruthyFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'x';
}

// Fixed 180×48 coordinate space, but the element itself fills the card width
// (viewBox keeps the aspect), so the line scales with the card / a 4K display
// instead of sitting at a fixed 180 px.
function sparkline(values, color) {
  if (!values || values.length < 2) return '';
  const w = 180, h = 48;
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;">
    <polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}" />
  </svg>`;
}

// "94% of 150k€" — the connector word follows the audience language picked in
// the Language field (small map; player has no i18n framework).
const OF_WORDS = { de: 'von', fr: 'sur', it: 'su', es: 'de', nl: 'van', pl: 'z', tr: '/', cs: 'z', da: 'af', sv: 'av', no: 'av', fi: '/', pt: 'de' };
function ofWord(locale) {
  const lang = String(locale ?? '').toLowerCase().split('-')[0];
  return OF_WORDS[lang] ?? 'of';
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
      { label: 'Revenue',  value: 124500, target: 150000, unit: '€', deltaPct: 4.2,  history: '98, 102, 110, 108, 115, 120, 124', goodIsDown: '' },
      { label: 'Visitors', value: 8420,   target: 10000,  unit: '',  deltaPct: -1.3, history: '88, 92, 84, 95, 90, 86, 84',       goodIsDown: '' },
      { label: 'NPS',      value: 64,     target: 70,     unit: '',  deltaPct: 2.0,  history: '58, 60, 62, 61, 63, 63, 64',       goodIsDown: '' },
    ],
    source: 'inline', dataUrl: '', refreshSec: 0,
    columns: '', density: 'comfortable',
    showDelta: true, showSparkline: true, showTarget: true,
    numberFormat: 'compact', locale: '', textScale: 100,
    theme: 'corporate-blue',
  }),
  schema: () => {
    // Shared source/dataUrl/refreshSec trio — destructured so the inline cards
    // table can sit directly under the source switch that reveals it.
    const [sourceField, dataUrlField, refreshField] = remoteJsonFields({
      placeholder: 'https://api.example.com/kpis.json',
      urlHelp: 'Accepts an array of cards or {cards:[…]} — keys: label, value, target, unit, deltaPct, history, goodIsDown. Must be CORS-enabled for whichever side fetches it (display in Live mode, Studio in Offline mode).',
    });
    return { fields: [
      { type: 'section', key: 'data', label: 'Data' },
      sourceField,
      { key: 'cards', type: 'table', label: 'KPI cards',
        showIf: c => (c.source ?? 'inline') === 'inline',
        help: 'History accepts comma-, semicolon- or space-separated numbers. Target is optional and drives the “% of target” bar. “Lower is better” flips green/red for KPIs like error rates or wait times.',
        columns: [
          { key: 'label',      label: 'Label' },
          { key: 'value',      label: 'Value',  type: 'number' },
          { key: 'target',     label: 'Target', type: 'number', placeholder: 'optional' },
          { key: 'unit',       label: 'Unit',   placeholder: '€, %, k…' },
          { key: 'deltaPct',   label: 'Δ %',    type: 'number' },
          { key: 'history',    label: 'History (comma-sep.)', placeholder: '98, 102, 110' },
          { key: 'goodIsDown', label: 'Lower is better', type: 'toggle' },
        ] },
      dataUrlField,
      refreshField,

      { type: 'section', key: 'appearance', label: 'Appearance' },
      { key: 'columns', type: 'select', label: 'Columns', buttons: true, tier: 'advanced',
        options: [
          { value: '',  label: 'Auto' },
          { value: '1', label: '1' },
          { value: '2', label: '2' },
          { value: '3', label: '3' },
          { value: '4', label: '4' },
        ],
        help: 'Auto fits cards by available width; fix a count for a stable board layout.' },
      { key: 'density', type: 'select', label: 'Density', buttons: true, tier: 'advanced',
        options: [
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'compact',     label: 'Compact' },
        ],
        help: 'Compact tightens spacing and hides sparklines — for narrow or side-panel widgets.' },
      { type: 'row', children: [
        { key: 'showDelta',     type: 'toggle', label: 'Show delta', tier: 'advanced' },
        { key: 'showTarget',    type: 'toggle', label: 'Show target bar', tier: 'advanced' },
        { key: 'showSparkline', type: 'toggle', label: 'Show sparkline', tier: 'advanced',
          showIf: c => (c.density ?? 'comfortable') !== 'compact' },
      ] },
      { key: 'numberFormat', type: 'select', label: 'Number format', buttons: true, tier: 'advanced',
        options: [
          { value: 'compact', label: 'Compact (124.5k)' },
          { value: 'full',    label: 'Full (124,500)' },
        ] },
      { ...localeField(), tier: 'advanced' },
      { ...textScaleField(), tier: 'advanced' },

      ...themeColorSection(),
    ] };
  },
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-kpi bb-theme-${c.theme ?? 'corporate-blue'}`;
    // Text-size multiplier — the .bb-kpi-* font clamps in slide-themes.css
    // consume this var (see cssNeeds for the calc(... * var()) wrappers).
    root.style.setProperty('--bb-kpi-text-scale', String((Number(c.textScale) || 100) / 100));
    root.innerHTML = `${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}<div class="bb-kpi-grid" data-field="cards columns density numberFormat textScale showDelta showTarget showSparkline">Loading…</div>`;
    container.appendChild(root);
    const grid = root.querySelector('.bb-kpi-grid');

    const compact = c.density === 'compact';
    if (compact) {
      grid.classList.add('bb-kpi-compact');
      grid.style.gap = '10px';
    }
    // Fixed column count beats the auto-fit rule from the stylesheet; '' keeps
    // the responsive auto layout.
    const cols = parseInt(c.columns, 10);
    if (Number.isFinite(cols) && cols >= 1) grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;

    const showDelta = c.showDelta !== false;
    const showTarget = c.showTarget !== false;
    const showSparkline = c.showSparkline !== false && !compact;
    const fmtOpts = { format: c.numberFormat ?? 'compact', locale: c.locale };
    const cardStyle = compact ? ' style="padding:12px;"' : '';

    const paint = (cards) => {
      cards = Array.isArray(cards) ? cards : (cards?.cards ?? []);
      grid.innerHTML = cards.map(card => {
        // Coerce: url-sourced JSON may send deltaPct as a string, and
        // "4.2".toFixed() throws. Number(...) || 0 also absorbs null/garbage.
        const delta = Number(card.deltaPct) || 0;
        const up = delta >= 0;
        // Traffic-light mapping: rising is good — unless the card is flagged
        // "lower is better" (error rates, wait times), which inverts it.
        const lowerIsBetter = isTruthyFlag(card.goodIsDown);
        const good = lowerIsBetter ? delta <= 0 : delta >= 0;
        const statusColor = good ? STATUS_COLORS.good : STATUS_COLORS.bad;
        // Optional "% of target" bar. Doesn't replace the value/delta, adds
        // a thin progress line + caption so the user sees actual-vs-goal at
        // a glance. Hidden when no target set.
        const target = Number(card.target);
        const hasTarget = showTarget && Number.isFinite(target) && target > 0 && Number.isFinite(+card.value);
        const pct = hasTarget ? Math.max(0, Math.min(100, Math.round((+card.value / target) * 100))) : 0;
        const targetBar = hasTarget
          ? `<div class="bb-kpi-target" data-field="showTarget cards numberFormat">
               <div class="bb-kpi-targetbar"><div class="bb-kpi-targetfill" style="width:${pct}%;background:${statusColor};"></div></div>
               <div class="bb-kpi-targettext">${pct}% ${ofWord(c.locale)} ${fmt(target, card.unit, fmtOpts)}</div>
             </div>`
          : '';
        // The class still carries the arrow DIRECTION (up/down); the inline
        // colour carries the GOODNESS, so lower-is-better cards colour
        // correctly even though the stylesheet pins up=green / down=red.
        const deltaLine = showDelta
          ? `<div class="bb-kpi-delta bb-kpi-${up ? 'up' : 'down'}" data-field="showDelta cards" style="color:${statusColor};">${up ? '▲' : '▼'} ${delta.toFixed(1)}%</div>`
          : '';
        const spark = showSparkline
          ? `<div class="bb-kpi-spark" data-field="showSparkline cards density">${sparkline(parseHistory(card.history), statusColor)}</div>`
          : '';
        return `
          <div class="bb-kpi-card" data-field="cards density textScale"${cardStyle}>
            <div class="bb-kpi-label" data-field="cards">${escapeHtml(card.label ?? '')}</div>
            <div class="bb-kpi-value" data-field="cards numberFormat">${fmt(card.value, card.unit, fmtOpts)}</div>
            ${deltaLine}
            ${targetBar}
            ${spark}
          </div>
        `;
      }).join('');
    };

    // Inline cards paint immediately; a remote source fetches through the
    // shared live-source seam and paints (or shows the load error) on arrival.
    const stored = c.source === 'stored';
    if (stored || c.source === 'url') {
      // Offline with nothing provisioned yet → neutral placeholder.
      if (stored && c._offline?.data === undefined) {
        grid.innerHTML = '<div style="grid-column:1 / -1;color:currentColor;opacity:.6;font-size:14px;padding:16px;text-align:center;">Provided-offline — appears on the display after “Refresh data”.</div>';
        return composeDispose(() => root.remove());
      }
      // URL mode but no URL yet → prompt for one instead of silently falling
      // back to the inline sample cards (confusing fake data).
      if (!stored && !c.dataUrl) {
        grid.innerHTML = '<div style="grid-column:1 / -1;color:currentColor;opacity:.6;font-size:14px;padding:16px;text-align:center;">Add a JSON URL in the inspector.</div>';
        return composeDispose(() => root.remove());
      }
      // 0 = fetch once. Any positive value polls, clamped UP to the 5 s player
      // floor so a stray "2" refreshes every 5 s instead of never. maxErrors:0
      // + backoff:false + stopOnCorsError:false = keep retrying on the fixed
      // interval and recover when the feed returns (same policy as data-table).
      const refreshSec = Math.max(0, Number(c.refreshSec) || 0);
      const stop = liveSource({
        url: c.dataUrl,
        signal: ctx?.signal,
        intervalMs: refreshSec > 0 ? Math.max(5000, refreshSec * 1000) : 0,
        fetchInit: { cache: 'no-store' },
        maxErrors: 0,
        backoff: false,
        stopOnCorsError: false,
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
