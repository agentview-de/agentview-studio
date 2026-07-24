import { createSlideWithWidget } from '../../shared/slide-schema.js';
import { stripExt } from './_helpers.js';

export const id = 'docx';
export const label = 'Word Document';

export function sniff(file) {
  if (!file) return false;
  return file.type?.includes('wordprocessingml') ||
    /\.docx$/i.test(file.name ?? '');
}

// Lazy-load mammoth — self-hosted (vendored under shared/vendor/), no CDN (DSGVO/GDPR).
let _mammothPromise = null;
function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  if (_mammothPromise) return _mammothPromise;
  _mammothPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('../../shared/vendor/mammoth.browser.min.js', import.meta.url).href;
    s.onload = () => res(window.mammoth);
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return _mammothPromise;
}

export async function convert(file) {
  const m = await loadMammoth();
  const buf = await file.arrayBuffer();
  const result = await m.convertToMarkdown({ arrayBuffer: buf });
  const body = result.value ?? '';
  // Split at top-level headings → one slide per section.
  const sections = body.split(/^(?=# )/m).filter(Boolean);
  const slides = (sections.length > 1 ? sections : [body]).map((sec, i) => {
    const m1 = sec.match(/^#\s+(.+)/);
    const title = m1?.[1] ?? `${stripExt(file.name)} ${i + 1}`;
    return createSlideWithWidget('markdown',
      { body: sec.replace(/^#\s+.+\n*/, ''), theme: 'editorial-mono' },
      { title, duration: 14 });
  });
  return { slides };
}
