import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { inlinedVendorUrl } from '../inline-vendor.js';

// pdf.js is loaded as a vendored script in both shells; we read from window.pdfjsLib.

// The worker is self-hosted next to this module (shared/vendor/). In dev (native
// ES modules) `import.meta.url` resolves it same-origin. In a published player the
// content host can't serve that sibling and its CSP only allows `worker-src blob:`,
// so the bundler inlines the worker SOURCE (see shared/inline-vendor.js) and we
// resolve it to a blob: worker URL; pdf.js loads it as a blob worker (CSP-safe).
const PDF_WORKER_URL =
  inlinedVendorUrl('pdf.worker.min.js') ||
  new URL('../vendor/pdf.worker.min.js', import.meta.url).href;
let _workerSrcPromise = null;
function resolveWorkerSrc() {
  if (!_workerSrcPromise) _workerSrcPromise = Promise.resolve(PDF_WORKER_URL);
  return _workerSrcPromise;
}

export default register({
  type: 'pdf',
  label: 'PDF Document',
  group: 'media',
  icon: '📄',
  network: true,
  schemaVersion: 2,
  defaults: () => ({ url: '', startPage: 1, endPage: 0, pageSec: 6, fit: 'page' }),
  schema: () => ({
    fields: [
      { key: 'url', type: 'asset', label: 'PDF URL', accept: 'application/pdf' },
      { key: 'startPage', type: 'number', label: 'Start Page', min: 1 },
      { key: 'endPage', type: 'number', label: 'End Page (0 = all)', min: 0 },
      { key: 'pageSec', type: 'duration', label: 'Time per page', min: 1, default: 6 },
      { key: 'fit', type: 'select', label: 'Fit', options: [
        { value: 'page',  label: 'Fit page (full document visible)' },
        { value: 'width', label: 'Fit width (may scroll vertically)' },
      ], help: 'Portrait PDFs on landscape screens waste pixels with "fit page". Use "fit width" to scale up.' },
    ],
  }),
  render(slide, container, _ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    root.className = 'bb-slide bb-slide-pdf';
    root.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0a0a10;';
    if (!c.url) {
      root.innerHTML = '<div style="color:currentColor;opacity:.5;text-align:center;font-family:var(--bb-font, Inter, sans-serif);"><div style="font-size:48px;opacity:.5;margin-bottom:8px;">📄</div><div>Add a PDF URL or upload one to the library.</div></div>';
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }
    const canvas = document.createElement('canvas');
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
    root.appendChild(canvas);
    const counter = document.createElement('div');
    counter.style.cssText = 'position:absolute;bottom:.6em;right:.8em;padding:.25em .6em;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font:600 clamp(11px, 2cqmin, 28px) var(--bb-font,Inter,sans-serif);';
    root.style.position = 'relative';
    root.appendChild(counter);
    container.appendChild(root);

    let cancelled = false;
    let pageTimer = null;
    let renderTask = null;
    let pdfDoc = null;

    (async () => {
      try {
        if (!window.pdfjsLib) throw new Error('pdf.js not loaded');
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = await resolveWorkerSrc();
          if (cancelled) return;
        }
        pdfDoc = await window.pdfjsLib.getDocument(c.url).promise;
        if (cancelled) return;
        const start = Math.max(1, c.startPage ?? 1);
        const last = c.endPage > 0 ? Math.min(c.endPage, pdfDoc.numPages) : pdfDoc.numPages;
        let p = start;
        const draw = async () => {
          if (cancelled || !pdfDoc) return;
          const page = await pdfDoc.getPage(p);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1 });
          // fit=width scales the rendered page to fill the box horizontally
          // (vertical overflow is fine, landscape-rendering portrait PDFs is
          // the typical reason to choose this). fit=page is the legacy
          // letterbox behaviour that preserves the whole page.
          const fit = (c.fit === 'width')
            ? (canvas.parentElement.clientWidth / viewport.width)
            : Math.min(canvas.parentElement.clientWidth / viewport.width,
                       canvas.parentElement.clientHeight / viewport.height) * 0.95;
          const dpr = window.devicePixelRatio || 1;
          const scaled = page.getViewport({ scale: fit * dpr });
          canvas.width = scaled.width;
          canvas.height = scaled.height;
          canvas.style.width = (scaled.width / dpr) + 'px';
          canvas.style.height = (scaled.height / dpr) + 'px';
          renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled });
          await renderTask.promise;
          if (cancelled) return;
          counter.textContent = `${p} / ${pdfDoc.numPages}`;
          p = p < last ? p + 1 : start;
          pageTimer = setTimeout(draw, (c.pageSec ?? 6) * 1000);
        };
        await draw();
      } catch (e) {
        console.error('PDF render error', e);
        root.innerHTML = `<div style="padding:24px;color:rgba(255,200,200,.85);font:14px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;"><div style="font-size:48px;opacity:.5;margin-bottom:8px;">📄</div><div>⚠️ PDF load failed.</div><div style="opacity:.7;font-size:.85em;margin-top:4px;font-family:var(--bb-mono, ui-monospace, monospace);">${escapeHtml(e.message)}</div></div>`;
      }
    })();

    return composeDispose(() => {
      cancelled = true;
      if (pageTimer) clearTimeout(pageTimer);
      try { renderTask?.cancel?.(); } catch {}
      try { pdfDoc?.destroy?.(); } catch {}
      root.remove();
    });
  },
});

