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
