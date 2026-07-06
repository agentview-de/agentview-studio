import { register } from './registry.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { liveSource } from '../live-source.js';
import { offlineLiveOpts } from '../offline-data.js';
import { remoteJsonFields } from '../remote-json-fields.js';
import { textScaleField } from '../text-scale.js';
import { STATUS_COLORS } from '../status-colors.js';
import { escapeHtml } from '../utils/escape.js';

// Normalises remote JSON into { headers:[], rows:[[...]] }. Accepts an array of
// objects (keys → columns) or an array of arrays (first row = header).
function fromJson(data) {
  const arr = Array.isArray(data) ? data : (data?.rows ?? data?.data ?? data?.items ?? []);
  if (!Array.isArray(arr) || !arr.length) return { headers: [], rows: [] };
  if (Array.isArray(arr[0])) return { headers: arr[0].map(String), rows: arr.slice(1).map(r => r.map(String)) };
  const headers = Object.keys(arr[0]);
  return { headers, rows: arr.map(o => headers.map(k => String(o[k] ?? ''))) };
}

// A cell counts as numeric when — ignoring inner separators and one trailing
// percent/currency sign — it is signed digits. Covers "1.234,56", "42 %",
// "12.5", "999 €"; deliberately NOT "$5" (leading symbols are rare in
// European signage data and a false negative just keeps the default align).
const NUMERIC_RE = /^[-+]?[\d.,\s]*\d\s*[%€$£]?$/;
const isNumericCell = (v) => { const s = String(v ?? '').trim(); return s !== '' && NUMERIC_RE.test(s); };

export default register({
  type: 'data-table',
  label: 'Data Table',
  group: 'data',
  icon: '▦',
  network: true,
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    source: 'inline',
    headers: 'Name, Department, Room',
    align: '',
    rows: [
      { c1: 'A. Lovelace', c2: 'Engineering', c3: '2.14' },
      { c1: 'G. Hopper', c2: 'Operations', c3: '1.07' },
    ],
    dataUrl: '',
    refreshSec: 0,
    striped: true,
    autoAlignNumbers: false,
    density: 'comfortable',
    headerStyle: 'normal',
    textScale: 100,
    pageRows: 0,
    pageSec: 8,
    highlightRules: [],
    theme: 'minimal-dark',
  }),
  schema: () => {
    // Shared source/dataUrl/refreshSec trio — destructured so the inline
    // headers/rows editors can sit between the source select and the URL
    // fields (the inline story reads top-to-bottom, then the remote story).
    const [sourceField, dataUrlField, refreshField] = remoteJsonFields({
      placeholder: 'https://api.example.com/rows.json',
      urlHelp: 'Accepts an array of objects (keys become column headers) or an array of arrays (first row = headers). Must be CORS-enabled for whichever side fetches it (display in Live mode, Studio in Offline mode).',
    });
    return {
      fields: [
        { type: 'section', key: 'data', label: 'Data' },
        sourceField,
        { key: 'headers', type: 'text', label: 'Column headers (comma-separated)',
          showIf: c => (c.source ?? 'inline') === 'inline',
          help: 'Names the columns. The number of headers determines the number of columns (1–10).' },
        { key: 'rows', type: 'table', label: 'Rows',
          showIf: c => (c.source ?? 'inline') === 'inline',
          columns: [
            { key: 'c1',  label: 'Col 1' }, { key: 'c2',  label: 'Col 2' },
            { key: 'c3',  label: 'Col 3' }, { key: 'c4',  label: 'Col 4' },
            { key: 'c5',  label: 'Col 5' }, { key: 'c6',  label: 'Col 6' },
            { key: 'c7',  label: 'Col 7' }, { key: 'c8',  label: 'Col 8' },
            { key: 'c9',  label: 'Col 9' }, { key: 'c10', label: 'Col 10' },
          ] },
        dataUrlField,
        refreshField,

        { type: 'section', key: 'layout', label: 'Layout' },
        { key: 'align', type: 'text', label: 'Column alignment', tier: 'advanced',
          placeholder: 'lcrr',
          help: 'One letter per column, l=left, c=centre, r=right. e.g. "lrr" = label + two right-aligned number columns. Also applies to remote JSON columns (in key order). Leave blank for the default (left-aligned).',
          validate: (v, c) => {
            const s = String(v ?? '').replace(/\s+/g, '').toLowerCase();
            if (!s) return null;
            if (/[^lcr]/.test(s)) return { level: 'warn', message: 'Only the letters l, c and r are recognised — other characters fall back to the default alignment.' };
            if ((c?.source ?? 'inline') === 'inline') {
              const n = String(c?.headers ?? '').split(',').map(x => x.trim()).filter(Boolean).length;
              if (n && s.length > n) return { level: 'info', message: 'More letters than named columns — the extra letters are ignored.' };
            }
            return null;
          } },
        { type: 'row', children: [
          { key: 'striped', type: 'toggle', label: 'Striped rows', tier: 'advanced' },
          { key: 'autoAlignNumbers', type: 'toggle', label: 'Auto-align numbers', tier: 'advanced',
            help: 'Columns where every cell is a number are right-aligned automatically. An explicit letter in the alignment string still wins.' },
        ] },
        { key: 'density', type: 'select', buttons: true, label: 'Density',
          options: [
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ],
          help: 'Compact uses tighter padding so more rows fit on screen.' },
        { key: 'headerStyle', type: 'select', buttons: true, label: 'Header style', tier: 'advanced',
          options: [
            { value: 'normal', label: 'Normal' },
            { value: 'accent', label: 'Accent' },
            { value: 'hidden', label: 'Hidden' },
          ],
          help: 'Accent tints the header row with the accent colour; hidden suits single-column lists.' },
        { ...textScaleField(), tier: 'advanced' },

        { type: 'section', key: 'behavior', label: 'Behavior',
          help: 'Long tables can rotate page by page so rows stay readable on a TV.' },
        { type: 'row', children: [
          { key: 'pageRows', type: 'number', label: 'Rows per page (0 = all)', min: 0, max: 99, tier: 'advanced' },
          { key: 'pageSec', type: 'duration', label: 'Page every', min: 1, tier: 'advanced',
            showIf: c => (Number(c.pageRows) || 0) > 0,
            help: 'How long each page stays on screen.' },
        ] },

        { type: 'section', key: 'highlight', label: 'Highlight rules', collapsed: true,
          help: 'Tint rows by keyword — turns the table into a status board.',
          summary: (c) => {
            const kws = (Array.isArray(c.highlightRules) ? c.highlightRules : [])
              .map(r => String(r?.keyword ?? '').trim()).filter(Boolean);
            if (!kws.length) return '–';
            const shown = kws.slice(0, 3).join(', ');
            return kws.length > 3 ? `${shown} +${kws.length - 3}` : shown;
          } },
        { key: 'highlightRules', type: 'table', label: 'Rules', tier: 'advanced',
          help: 'When any cell in a row contains the keyword (case-insensitive), the row is tinted with the chosen colour. The first matching rule wins.',
          columns: [
            { key: 'keyword', label: 'Keyword', placeholder: 'e.g. DOWN' },
            { key: 'color', label: 'Colour', type: 'select', options: [
              { value: 'good', label: 'Green (good)' },
              { value: 'warn', label: 'Amber (warning)' },
              { value: 'bad', label: 'Red (bad)' },
              { value: 'accent', label: 'Accent colour' },
            ] },
          ] },

        ...themeColorSection(),
      ],
    };
  },
  looks: () => [
    { id: 'compact', name: 'Compact',
      patch: { density: 'compact', striped: false, headerStyle: 'normal' } },
    { id: 'striped', name: 'Striped',
      patch: { striped: true, density: 'comfortable', headerStyle: 'normal' } },
    { id: 'bold-header', name: 'Bold header',
      patch: { headerStyle: 'accent', striped: true, density: 'comfortable' } },
    { id: 'numbers-right', name: 'Numbers right',
      patch: { autoAlignNumbers: true, striped: true, density: 'compact' } },
  ],
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-datatable bb-theme-${c.theme ?? 'minimal-dark'}`;
    // Text-size multiplier — consumed by the .bb-dt font-size clamp in
    // styles/slide-themes.css (calc(clamp(…) * var(--bb-dt-text-scale, 1))).
    root.style.setProperty('--bb-dt-text-scale', String((Number(c.textScale) || 100) / 100));
    root.innerHTML = `${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}<div class="bb-dt-wrap"></div>`;
    container.appendChild(root);
    const wrap = root.querySelector('.bb-dt-wrap');

    const striped = c.striped !== false;
    const headerStyle = c.headerStyle ?? 'normal';
    // Density: padding is em-relative so it tracks the text-scale multiplier.
    const cellPad = c.density === 'compact' ? 'padding:.3em .7em;' : '';
    const thTint = headerStyle === 'accent'
      ? 'background:color-mix(in srgb, var(--bb-st-accent) 16%, transparent);' : '';

    // Per-column CSS text-align resolved from the user's "lcrr"-style string.
    // l/c/r → left/center/right; any other character (or absence) → default.
    const explicitAlign = (i) => {
      const ch = String(c.align ?? '').toLowerCase().replace(/\s+/g, '')[i];
      return ch === 'r' ? 'right' : ch === 'c' ? 'center' : ch === 'l' ? 'left' : '';
    };

    // Highlight rules — keyword match is case-insensitive containment, colour
    // comes from the shared traffic-light palette (or the theme accent).
    const rules = (Array.isArray(c.highlightRules) ? c.highlightRules : [])
      .map(r => ({ kw: String(r?.keyword ?? '').trim().toLowerCase(),
        color: STATUS_COLORS[r?.color] ?? 'var(--bb-st-accent)' }))
      .filter(r => r.kw);
    const rowTint = (cells) => {
      for (const r of rules) {
        if (cells.some(v => String(v ?? '').toLowerCase().includes(r.kw))) {
          return `background:color-mix(in srgb, ${r.color} 22%, transparent);`;
        }
      }
      return '';
    };

    // Auto-paging timer — cleared on every repaint (onData repaints wholesale)
    // and on dispose, so poll updates never stack intervals.
    let pageTimer = null;
    const clearPage = () => { if (pageTimer) { clearInterval(pageTimer); pageTimer = null; } };
    ctx?.signal?.addEventListener?.('abort', clearPage);

    const paint = ({ headers, rows }) => {
      clearPage();
      if (!headers.length) { wrap.innerHTML = '<div class="bb-dt-empty">No data.</div>'; return; }
      // Alignment is computed over ALL rows (not the current page) so a column
      // doesn't flip-flop between pages.
      const align = headers.map((_, i) => {
        const ex = explicitAlign(i);
        if (ex) return ex;
        if (c.autoAlignNumbers && rows.length
            && rows.every(r => (r[i] ?? '') === '' || isNumericCell(r[i]))
            && rows.some(r => isNumericCell(r[i]))) return 'right';
        return '';
      });
      const attr = (s) => (s ? ` style="${s}"` : '');
      const head = headerStyle === 'hidden' ? ''
        : `<thead><tr data-field="headers headerStyle align">${headers.map((h, i) => `<th${attr((align[i] ? `text-align:${align[i]};` : '') + cellPad + thTint)}>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
      const bodyRow = (r) => `<tr${attr(rowTint(r))}>${headers.map((_, i) => `<td${attr((align[i] ? `text-align:${align[i]};` : '') + cellPad)}>${escapeHtml(r[i] ?? '')}</td>`).join('')}</tr>`;
      const per = Math.max(0, Math.floor(Number(c.pageRows) || 0));
      const pages = per > 0 ? Math.max(1, Math.ceil(rows.length / per)) : 1;
      let page = 0;
      const draw = () => {
        const slice = per > 0 ? rows.slice(page * per, page * per + per) : rows;
        wrap.innerHTML = `<table class="bb-dt${striped ? ' bb-dt-striped' : ''}" data-field="rows headers source dataUrl align striped autoAlignNumbers density headerStyle textScale pageRows pageSec highlightRules">${head}<tbody>${slice.map(bodyRow).join('')}</tbody></table>`
          // Numbers-only page indicator: language-neutral, so the player needs
          // no i18n for it.
          + (pages > 1 ? `<div class="bb-dt-page" style="text-align:right;opacity:.55;font-variant-numeric:tabular-nums;padding:.4em 16px 0;font-size:calc(clamp(11px, 1.8cqmin, 26px) * var(--bb-dt-text-scale, 1));">${page + 1} / ${pages}</div>` : '');
      };
      draw();
      if (pages > 1) {
        pageTimer = setInterval(() => { page = (page + 1) % pages; draw(); },
          Math.max(2, Number(c.pageSec) || 8) * 1000);
      }
    };

    const inline = () => {
      const headers = String(c.headers ?? '').split(',').map(s => s.trim()).filter(Boolean);
      // Support up to 10 columns. Keys must match the `columns` array above.
      // Slicing to the header count means extra hidden-column data is
      // preserved in storage but unrendered when headers shrink (no data loss).
      const allKeys = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];
      const keys = allKeys.slice(0, headers.length);
      const rows = (Array.isArray(c.rows) ? c.rows : []).map(r => keys.map(k => r[k] ?? ''));
      return { headers, rows };
    };

    const stored = c.source === 'stored';
    if (c.source === 'url' || stored) {
      // Offline mode but nothing provisioned yet (editor before the first
      // "Refresh data") → neutral placeholder, not an error.
      if (stored && c._offline?.data === undefined) {
        wrap.innerHTML = '<div class="bb-dt-empty">Provided-offline — appears on the display after “Refresh data”.</div>';
        return composeDispose(() => root.remove());
      }
      // URL mode but no URL yet → prompt for one. Previously this fell through
      // to the inline sample, so picking "url" showed fake placeholder rows
      // (A. Lovelace…) until a URL was entered, confusing.
      if (!stored && !c.dataUrl) {
        wrap.innerHTML = '<div class="bb-dt-empty">Add a JSON URL in the inspector.</div>';
        return composeDispose(() => root.remove());
      }
      wrap.innerHTML = '<div class="bb-dt-empty">Loading…</div>';
      // 0 = fetch once. Any positive value polls, clamped UP to a 5s floor so a
      // stray "2" refreshes every 5s instead of (as before) silently never
      // refreshing because it fell under the old ≥5s gate. maxErrors:0 +
      // backoff:false + stopOnCorsError:false keeps the previous semantics: a
      // poll keeps retrying on the fixed interval, showing "unavailable" on each
      // miss and recovering when the feed returns (paint rewrites innerHTML
      // wholesale and wrap persists across errors).
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
        onData: (data) => paint(fromJson(data)),
        onError: () => {
          clearPage();
          if (!ctx?.onError?.()) wrap.innerHTML = '<div class="bb-dt-empty">Data unavailable.</div>';
        },
      });
      return composeDispose(() => { clearPage(); stop(); root.remove(); });
    }

    paint(inline());
    return composeDispose(() => { clearPage(); root.remove(); });
  },
});
