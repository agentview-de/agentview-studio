import { createSlideWithWidget } from '../../shared/slide-schema.js';
import { barChartContent, labelValuePairs, looksLikeHeader, parseNumberColumn, sniffCsvSep, splitCsvLine, stripExt } from './_helpers.js';
import { tx } from '../i18n.js';

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
  const sep = sniffCsvSep(lines);
  const rows = lines.map(l => splitCsvLine(l, sep));
  // First col is the label, second col the value. Whether row 0 NAMES those
  // columns or already holds data is a question, not an assumption — see
  // looksLikeHeader in _helpers.js for what it cost to assume.
  const hasHeader = looksLikeHeader(rows);
  const headers = hasHeader ? rows[0] : null;
  const body = rows.slice(hasHeader ? 1 : 0);
  // One value per label, ALWAYS. A non-numeric cell used to push a label and
  // no value, so from the first "n/a" on every remaining label was zipped with
  // the NEXT row's number: right names, wrong figures, no warning. 0 is what
  // labelValuePairs and the JSON importer already use for a bad cell.
  //
  // The whole value column is read at once so the decimal convention is
  // decided once — see parseNumberColumn. A ';' file is ';'-separated because
  // the comma was already spoken for, which is the hint when a column is
  // genuinely ambiguous.
  const labels = body.map(r => r[0]);
  const values = parseNumberColumn(body.map(r => r[1]), { commaDecimal: sep === ';' })
    .map(v => (Number.isFinite(v) ? v : 0));
  return { headers, labels, values };
}

export async function convert(file) {
  const text = await file.text();
  const data = parseCsv(text);
  return {
    slides: [createSlideWithWidget('chart',
      barChartContent(labelValuePairs(data.labels, data.values)),
      { title: stripExt(file.name, tx('Chart')), duration: 12 })],
  };
}
