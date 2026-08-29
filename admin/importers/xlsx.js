import { createSlideWithWidget } from '../../shared/slide-schema.js';
import { barChartContent, looksLikeHeader, labelValuePairs, parseNumberColumn } from './_helpers.js';

export const id = 'xlsx';
export const label = 'Excel Spreadsheet';

export function sniff(file) {
  if (!file) return false;
  return file.type?.includes('spreadsheetml') ||
    /\.(xlsx|xls)$/i.test(file.name ?? '');
}

let _sjsPromise = null;
function loadSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_sjsPromise) return _sjsPromise;
  _sjsPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    // Self-hosted (vendored under shared/vendor/), no CDN (DSGVO/GDPR). We pin
    // SheetJS 0.18.5 — the newest build published to npm/jsDelivr (0.20.x ships
    // only from SheetJS's own CDN).
    s.src = new URL('../../shared/vendor/xlsx.full.min.js', import.meta.url).href;
    s.onload = () => res(window.XLSX);
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return _sjsPromise;
}

export async function convert(file) {
  const XLSX = await loadSheetJS();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const slides = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (!data.length) continue;
    // Column A is the label, column B the value. Whether row 1 names them or
    // already holds data is decided, not assumed — see looksLikeHeader.
    const body = data.slice(looksLikeHeader(data) ? 1 : 0).filter(r => r && r.length);
    // One value per label — see csv.js. A single text cell used to leave the two
    // arrays at different lengths, which the guard below then turned into a
    // markdown table: one "n/a" cost the whole sheet its chart. Numeric cells
    // arrive as numbers, but a sheet that stores them as TEXT hands over
    // "1.234,56" — read as a column so the convention is decided once.
    const labels = body.map(r => String(r[0] ?? ''));
    const values = parseNumberColumn(body.map(r => r[1]))
      .map(v => (Number.isFinite(v) ? v : 0));
    if (values.length === labels.length && values.length > 0) {
      slides.push(createSlideWithWidget('chart',
        barChartContent(labelValuePairs(labels, values)),
        { title: name, duration: 12 }));
    } else {
      // Fall back to a markdown rendering of the table
      const md = data.map(r => '| ' + (r ?? []).map(String).join(' | ') + ' |').join('\n');
      slides.push(createSlideWithWidget('markdown',
        { body: md, theme: 'editorial-mono' },
        { title: name, duration: 14 }));
    }
  }
  return { slides };
}
