// .pptx importer. PowerPoint files are ZIP archives with an Open XML payload;
// each slide is one ppt/slides/slideN.xml plus its rels/media references. We
// extract paragraph text per slide and stamp a Studio slide with a text widget
// (plus image widgets if the slide has embedded media on a recognisable layout).
//
// Strategy:
//   1. Unzip via JSZip (lazy-loaded from CDN).
//   2. For each slideN.xml (sorted numerically), pull all <a:t> text runs and
//      group them by paragraph. First paragraph → title, rest → body.
//   3. If the slide has embedded media (ppt/media/image*), upload each via the
//      `upload` ctx helper and stamp an image widget alongside the text.
//
// Limitations (v1):
//   - We do NOT preserve PowerPoint positioning. Slides are stamped with the
//     default "single" design (text widget full-bleed).
//   - We do NOT honour themes, fonts, animations, transitions, or notes.
//   - Charts/SmartArt are treated as opaque images if PowerPoint exports them
//     as image fallback; otherwise they're dropped.
// These are by design — for layout-faithful PowerPoint conversion users should
// export to PDF first and drop that on Studio (which renders pages 1:1).

import { createSlide, createWidget } from '../../shared/slide-schema.js';

export const id = 'pptx';
export const label = 'PowerPoint';

export function sniff(file) {
  if (!file) return false;
  if (/\.pptx$/i.test(file.name ?? '')) return true;
  return file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
}

let _jszipPromise = null;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (_jszipPromise) return _jszipPromise;
  _jszipPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    // Self-hosted (vendored under shared/vendor/), no CDN (DSGVO/GDPR).
    s.src = new URL('../../shared/vendor/jszip.min.js', import.meta.url).href;
    s.onload = () => res(window.JSZip);
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return _jszipPromise;
}

// Extract every <a:t>…</a:t> text run, grouped by paragraph. PowerPoint nests
// paragraphs under <a:p>. We don't use DOMParser for the XML because PPTX
// namespaces vary by source and a regex pass is more tolerant.
function parseSlideXml(xml) {
  const paragraphs = [];
  const pRegex = /<a:p[\s>][\s\S]*?<\/a:p>/g;
  const tRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
  for (const m of xml.matchAll(pRegex)) {
    const text = [];
    for (const t of m[0].matchAll(tRegex)) {
      text.push(decodeXmlEntities(t[1]));
    }
    const joined = text.join('').trim();
    if (joined) paragraphs.push(joined);
  }
  return paragraphs;
}

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

// "ppt/slides/slide12.xml" → 12
function slideOrder(name) {
  const m = name.match(/slide(\d+)\.xml$/);
  return m ? +m[1] : 9999;
}

export async function convert(file, ctx) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(file);

  // Collect all slide files in correct order.
  const slideFiles = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideOrder(a) - slideOrder(b));

  // Collect media for later upload — we don't yet attribute media to slides
  // via relationships (would require parsing _rels/slideN.xml.rels), so for
  // v1 we surface them as standalone image slides at the end.
  const mediaFiles = Object.keys(zip.files)
    .filter(n => /^ppt\/media\/image[\w.-]+$/i.test(n));

  const slides = [];
  const assetsToUpload = [];

  for (const name of slideFiles) {
    const xml = await zip.files[name].async('string');
    const paragraphs = parseSlideXml(xml);
    if (!paragraphs.length) continue;
    const title = paragraphs[0];
    const body = paragraphs.slice(1).join('\n\n');
    const md = body ? `# ${title}\n\n${body}` : `# ${title}`;
    slides.push(createSlide({
      duration: 12,
      widgets: [createWidget('markdown', {
        rect: { x: 4, y: 4, w: 92, h: 92 },
        content: { body: md },
      })],
    }));
  }

  // Append each embedded image as its own slide at the end (best-effort).
  for (const m of mediaFiles) {
    try {
      const blob = await zip.files[m].async('blob');
      const ext = (m.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'png').toLowerCase();
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const f = new File([blob], m.split('/').pop(), { type: mime });
      // Use the same upload helper the drop-zone uses, so the image lives on
      // agentView's CDN and survives playlist round-trips.
      let url = '';
      if (typeof ctx?.upload === 'function') {
        url = await ctx.upload(f);
      }
      if (url) {
        slides.push(createSlide({
          duration: 8,
          widgets: [createWidget('image', {
            rect: { x: 0, y: 0, w: 100, h: 100 },
            content: { url, fit: 'contain' },
          })],
        }));
      } else {
        // No uploader → defer to assetsToUpload so the caller can wire it.
        assetsToUpload.push({ file: f, name: f.name });
      }
    } catch (e) {
      console.warn('pptx media import failed', m, e);
    }
  }

  return { slides, assetsToUpload };
}
