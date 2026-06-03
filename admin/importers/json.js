import { createSlide } from '../../shared/slide-schema.js';

export const id = 'json';
export const label = 'JSON';

export function sniff(file) {
  if (!file) return false;
  return file.type === 'application/json' || /\.json$/i.test(file.name ?? '');
}

// Pure: if the parsed JSON looks like chart data — an array of {label,value}
// (or {name,value}) objects, or a { labels, values } pair — normalise it to the
// chart widget's [{label,value}] shape. Returns null when it doesn't look like
// chart data (caller then falls back to a live-json viewer). Exported for tests.
export function chartDataFromJson(parsed) {
  if (!parsed) return null;
  if (Array.isArray(parsed)) return parsed.map(p => ({ label: p.label ?? p.name ?? '', value: +p.value || 0 }));
  if (parsed.labels && parsed.values) return (parsed.labels ?? []).map((l, i) => ({ label: l, value: +(parsed.values?.[i]) || 0 }));
  return null;
}

export async function convert(file) {
  const text = await file.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not JSON → live-json fallback */ }
  // If parsed looks like { labels, values } or [{label,value}], make a chart.
  // Otherwise, make a live-json viewer pointing at the file URL (caller uploads).
  const data = chartDataFromJson(parsed);
  if (data) {
    const slide = createSlide('chart', {
      title: file.name?.replace(/\.json$/i, '') ?? 'JSON Chart',
      duration: 12,
      content: { kind: 'bar', source: 'inline', data, theme: 'corporate-blue' },
    });
    return { slides: [slide] };
  }
  const slide = createSlide('live-json', {
    title: file.name?.replace(/\.json$/i, '') ?? 'JSON',
    duration: 12,
    content: { url: '', refreshSec: 60, theme: 'dark-minimal' },
  });
  return { slides: [slide] };
}
