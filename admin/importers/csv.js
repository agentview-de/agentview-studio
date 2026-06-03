import { createSlide } from '../../shared/slide-schema.js';

export const id = 'csv';
export const label = 'CSV';

export function sniff(file) {
  if (!file) return false;
  return file.type === 'text/csv' || /\.csv$/i.test(file.name ?? '');
}

// Pure: detect the separator (tab/semicolon/comma) and pull a label column +
// numeric value column out of a CSV string. Exported for unit testing.
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { labels: [], values: [] };
  const sep = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
  const rows = lines.map(l => l.split(sep).map(s => s.trim()));
  // Heuristic: first row are headers, first col is label, second col is numeric value
  const headers = rows[0];
  const out = { labels: [], values: [] };
  for (let i = 1; i < rows.length; i++) {
    out.labels.push(rows[i][0]);
    const v = parseFloat(rows[i][1]);
    if (Number.isFinite(v)) out.values.push(v);
  }
  return { headers, ...out };
}

export async function convert(file) {
  const text = await file.text();
  const data = parseCsv(text);
  const slide = createSlide('chart', {
    title: file.name?.replace(/\.csv$/i, '') ?? 'Chart',
    duration: 12,
    content: { kind: 'bar', source: 'inline', data: data.labels.map((l, i) => ({ label: l, value: data.values[i] ?? 0 })), theme: 'corporate-blue' },
  });
  return { slides: [slide] };
}
