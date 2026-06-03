import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { liveSource } from '../live-source.js';
import { offlineLiveOpts, SOURCE_OPTIONS } from '../offline-data.js';
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
    theme: 'minimal-dark',
  }),
  schema: () => ({
    fields: [
      { key: 'source', type: 'select', label: 'Data source', options: SOURCE_OPTIONS,
        help: 'Offline: the Studio fetches the JSON URL on “Refresh data” and stores it in agentView; the display reads that — no live call, no internet needed on the screen.' },
      { key: 'headers', type: 'text', label: 'Column headers (comma-separated)',
        showIf: c => (c.source ?? 'inline') === 'inline',
        help: 'Names the columns. The number of headers determines the number of columns (1–10).' },
      { key: 'rows', type: 'table', label: 'Rows',
        showIf: c => (c.source ?? 'inline') === 'inline',
        columns: [
          { key: 'c1',  label: '1' }, { key: 'c2',  label: '2' },
          { key: 'c3',  label: '3' }, { key: 'c4',  label: '4' },
          { key: 'c5',  label: '5' }, { key: 'c6',  label: '6' },
          { key: 'c7',  label: '7' }, { key: 'c8',  label: '8' },
          { key: 'c9',  label: '9' }, { key: 'c10', label: '10' },
        ] },
      { key: 'align', type: 'text', label: 'Column alignment',
        placeholder: 'lcrr',
        help: 'One letter per column, l=left, c=centre, r=right. e.g. "lrr" = label + two right-aligned number columns. Leave blank for the default (left-aligned).' },
      { key: 'striped', type: 'toggle', label: 'Striped rows' },
      { key: 'dataUrl', type: 'url', label: 'Remote JSON URL', test: 'json',
        showIf: c => c.source === 'url' || c.source === 'stored',
        placeholder: 'https://api.example.com/rows.json',
        help: 'Accepts an array of objects (keys become column headers) or an array of arrays (first row = headers). Must be CORS-enabled for whichever side fetches it (display in Live mode, Studio in Offline mode).' },
      { key: 'refreshSec', type: 'duration', label: 'Refresh every (0 = once)', min: 0, default: 0,
        showIf: c => c.source === 'url',
        help: 'Polls the JSON URL on a timer so live data stays current.' },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-datatable bb-theme-${c.theme ?? 'minimal-dark'}`;
    root.innerHTML = `${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}<div class="bb-dt-wrap"></div>`;
    container.appendChild(root);
    const wrap = root.querySelector('.bb-dt-wrap');

    // Per-column CSS text-align resolved from the user's "lcrr"-style string.
    // l/c/r → left/center/right; any other character (or absence) → default.
    const alignFor = (i) => {
      const ch = String(c.align ?? '').toLowerCase().replace(/\s+/g, '')[i];
      return ch === 'r' ? 'right' : ch === 'c' ? 'center' : ch === 'l' ? 'left' : '';
    };
    const striped = c.striped !== false;

    const paint = ({ headers, rows }) => {
      if (!headers.length) { wrap.innerHTML = '<div class="bb-dt-empty">No data.</div>'; return; }
      const align = headers.map((_, i) => alignFor(i));
      wrap.innerHTML = `<table class="bb-dt${striped ? ' bb-dt-striped' : ''}">
        <thead><tr>${headers.map((h, i) => `<th${align[i] ? ` style="text-align:${align[i]};"` : ''}>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${headers.map((_, i) => `<td${align[i] ? ` style="text-align:${align[i]};"` : ''}>${escapeHtml(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
    };

    const inline = () => {
      const headers = String(c.headers ?? '').split(',').map(s => s.trim()).filter(Boolean);
      // Support up to 10 columns. Keys must match the `columns` array above.
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
      // miss and recovering when the feed returns.
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
          if (!ctx?.onError?.()) wrap.innerHTML = '<div class="bb-dt-empty">Data unavailable.</div>';
        },
      });
      return composeDispose(() => { stop(); root.remove(); });
    }

    paint(inline());
    return composeDispose(() => root.remove());
  },
});

