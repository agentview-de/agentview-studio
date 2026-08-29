// Small shared importer helpers — the pieces every importer would otherwise
// hand-repeat (filename→title stripping, the inline bar-chart content block).
// Pure and dependency-free so importers.test.js can exercise them directly.

// Strip a file extension for use as a slide title: "sales.2024.csv" → "sales.2024".
// Returns `fallback` when the name is empty or is nothing but an extension.
export function stripExt(name, fallback = '') {
  const s = String(name ?? '').trim();
  if (!s) return fallback;
  return s.replace(/\.[^./\\]+$/, '') || fallback;
}

/**
 * Split one CSV line on `sep`, honouring double-quoted fields.
 *
 * `line.split(sep)` is fine until a label contains the separator — and every
 * spreadsheet quotes those on export, so `"Berlin, Mitte",120` is the normal
 * case, not the exotic one. Split naively it becomes three fields: the label is
 * cut in half AND the number lands in the wrong column, which is how a chart
 * ends up with the right names beside the wrong figures.
 *
 * Doubled quotes inside a quoted field are one literal quote ("" → "), the way
 * RFC 4180 and every exporter write them.
 */
export function splitCsvLine(line, sep) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c !== '"') { field += c; continue; }
      if (line[i + 1] === '"') { field += '"'; i++; continue; }   // "" → "
      quoted = false;
      continue;
    }
    if (c === '"' && field.trim() === '') { quoted = true; field = ''; continue; }
    if (c === sep) { out.push(field.trim()); field = ''; continue; }
    field += c;
  }
  out.push(field.trim());
  return out;
}

// Zip parallel label/value arrays into the chart widget's [{label,value}] shape,
// coercing missing values to 0. Shared by csv / xlsx (json already has pairs).
export function labelValuePairs(labels, values) {
  return (labels ?? []).map((l, i) => ({ label: String(l ?? ''), value: values?.[i] ?? 0 }));
}

// The inline bar-chart widget content shared by csv / json / xlsx. `pairs` is a
// ready [{label,value}] array (build it with labelValuePairs when you have
// parallel arrays). One place owns the kind/source/theme triple so all three
// importers stay in step.
export function barChartContent(pairs) {
  return { kind: 'bar', source: 'inline', data: pairs ?? [], theme: 'corporate-blue' };
}

/**
 * Does the first row name the columns, or is it already data?
 *
 * Both the CSV and the XLSX importer used to start at row 1, always. A file
 * exported without a header — `cut`/`awk` output, a database dump, a
 * spreadsheet saved with "header row" unticked, a list someone typed — lost its
 * first line without a word: three numbers went in and a two-bar chart came
 * out. A single-line headerless file produced an EMPTY chart. Both silent, and
 * both look plausible on a wall.
 *
 * The tell is the value column: a header names it ("Sales", "Umsatz"), a data
 * row holds a number. One row can only be data — nothing would be left.
 *
 * A file whose header happens to be numeric ("2024","2025") is genuinely
 * ambiguous, and this reads it as data. That is deliberate: a spurious extra
 * bar labelled "2024" is a mistake you can SEE, and a missing row is not.
 *
 * @param {Array<Array<any>>} rows
 * @returns {boolean} whether rows[0] should be skipped as a header
 */
export function looksLikeHeader(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  return !Number.isFinite(parseFloat(rows[0]?.[1]));
}

/**
 * Which character separates the columns?
 *
 * This used to be `line0.includes('\t') ? '\t' : line0.includes(';') ? ';' : ','`
 * — a raw substring search on the first line, blind to quoting. Every
 * spreadsheet quotes a field that contains a separator, so a perfectly ordinary
 * comma file whose first label reads `"Berlin; Mitte"` was read as
 * semicolon-separated: one column, the number swallowed into the label, and a
 * chart of zeroes. Silent, and plausible on a wall.
 *
 * Splitting is already quote-aware, so ask IT: try each candidate and keep the
 * one that actually produces columns, preferring the split that stays the same
 * width down the file. A separator that only appears inside quotes yields one
 * column and is discarded on the spot.
 *
 * Order is the tie-break, tab → semicolon → comma, which is the precedence the
 * substring version had.
 *
 * @param {string[]} lines  non-empty lines
 * @returns {string} the separator; ',' when nothing splits
 */
export function sniffCsvSep(lines, candidates = ['\t', ';', ',']) {
  const sample = (lines ?? []).slice(0, 20);
  if (!sample.length) return ',';
  let best = ',';
  let bestScore = -1;
  for (const sep of candidates) {
    const widths = sample.map(l => splitCsvLine(l, sep).length);
    const cols = widths[0];
    if (cols < 2) continue;
    // Consistency first, width second: a file where every row splits the same
    // way is far more likely to be using that separator than one where the
    // count wanders.
    const score = widths.filter(n => n === cols).length * 100 + cols;
    if (score > bestScore) { bestScore = score; best = sep; }
  }
  return best;
}

/**
 * Turn a column of number-ish cells into numbers, deciding the decimal
 * convention ONCE for the whole column.
 *
 * `parseFloat` speaks only English. Fed the standard German Excel export it
 * reads `1.234,56` as **1.234** and `12.000` as **12** — a revenue chart on a
 * wall, off by a factor of a thousand, with nothing to show for it. `987,40`
 * merely lost its cents. This is the app's first language and its exports are
 * semicolon-separated with decimal commas, so it was the normal case that
 * broke, not an exotic one.
 *
 * Per VALUE the question is often unanswerable — `1,234` is 1234 to an American
 * and 1.234 to a German. Per COLUMN it usually is answerable, so the column
 * votes: a separator with two or four-plus digits behind it is a fraction, one
 * with exactly three is grouping and abstains, and a cell carrying BOTH marks
 * settles it outright (the last one is the decimal point). A column that never
 * makes up its mind falls back to the caller's hint — for CSV, the separator
 * itself, since a semicolon-separated file is semicolon-separated PRECISELY
 * because the comma was already taken.
 *
 * @param {Array<any>} cells
 * @param {{ commaDecimal?: boolean }} [opts]  fallback when the column abstains
 * @returns {number[]} NaN for cells that hold no number at all
 */
export function parseNumberColumn(cells, { commaDecimal = false } = {}) {
  const strs = (cells ?? []).map(c => String(c ?? '').trim());
  const useComma = voteOnDecimalMark(strs, commaDecimal);
  return strs.map(s => parseOneNumber(s, useComma));
}

function voteOnDecimalMark(strs, fallback) {
  let votes = 0;   // >0: the comma is the decimal mark, <0: the dot is
  for (const s of strs) {
    const comma = s.lastIndexOf(',');
    const dot = s.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) { votes += comma > dot ? 1 : -1; continue; }
    const tail = /[.,](\d+)$/.exec(s);
    // Exactly three digits behind the mark is what grouping looks like, and it
    // is exactly the case that cannot decide anything on its own.
    if (!tail || tail[1].length === 3) continue;
    votes += s.includes(',') ? 1 : -1;
  }
  return votes === 0 ? fallback : votes > 0;
}

function parseOneNumber(s, commaDecimal) {
  // Currency marks, percent signs and the spaces some locales group with are
  // not part of the number; dropping them also turns "1 234,56" into a value.
  const bare = s.replace(/[^\d.,+-]/g, '');
  const normalised = commaDecimal
    ? bare.replace(/\./g, '').replace(/,/g, '.')
    : bare.replace(/,/g, '');
  return parseFloat(normalised);
}
