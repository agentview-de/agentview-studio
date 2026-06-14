import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';
import { inlinedVendorUrl } from '../inline-vendor.js';
import { mediaPlaceholder } from '../media-placeholder.js';
import { refreshSecField } from '../refresh-field.js';

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

// Inset CSS per counter-pill corner; whitelisted map so a stale stored value
// can never inject CSS — unknown values fall back to the classic bottom-right.
const COUNTER_POS = {
  'bottom-right': 'bottom:.6em;right:.8em;',
  'bottom-left': 'bottom:.6em;left:.8em;',
  'top-right': 'top:.6em;right:.8em;',
  'top-left': 'top:.6em;left:.8em;',
};

export default register({
  type: 'pdf',
  label: 'PDF Document',
  group: 'media',
  icon: '📄',
  network: true,
  schemaVersion: 2,
  defaults: () => ({
    url: '', startPage: 1, endPage: 0, refreshSec: 0,
    pageSec: 6, showCounter: true, counterPosition: 'bottom-right',
    fit: 'page', background: '',
  }),
  schema: () => ({
    fields: [
      { type: 'section', label: 'Document', key: 'document' },
      { key: 'url', type: 'asset', label: 'PDF URL', accept: 'application/pdf', test: true,
        placeholder: 'https://… or pick a PDF from the library',
        help: 'Upload to the library or paste a direct PDF link.' },
      { type: 'row', children: [
        { key: 'startPage', type: 'number', label: 'Start page', min: 1 },
        { key: 'endPage', type: 'number', label: 'End page', min: 0,
          help: '0 = through the last page of the document.',
          // Render shows only the start page when the range is inverted —
          // surface that instead of silently looping a single page forever.
          validate: (val, c) => {
            const end = Number(val) || 0;
            const start = Number(c.startPage) || 1;
            return end > 0 && end < start
              ? { level: 'warn', message: 'End page is before the start page — only the start page will show.' }
              : null;
          } },
      ] },
      { ...refreshSecField({
        help: 'Re-downloads the PDF on a timer, so a menu or shift plan re-uploaded under the same URL updates on screen without re-publishing. 0 = load once.',
      }),
      validate: val => {
        const v = Number(val) || 0;
        return v > 0 && v < 60
          ? { level: 'warn', message: 'Documents rarely change that fast — 60 seconds or more keeps traffic low.' }
          : null;
      } },

      { type: 'section', label: 'Playback', key: 'playback' },
      { key: 'pageSec', type: 'duration', label: 'Time per page', min: 1,
        help: 'Set start page = end page to hold a single page statically.' },
      { type: 'row', children: [
        { key: 'showCounter', type: 'toggle', label: 'Page counter' },
        { key: 'counterPosition', type: 'select', label: 'Position', options: [
          { value: 'bottom-right', label: 'Bottom right' },
          { value: 'bottom-left', label: 'Bottom left' },
          { value: 'top-right', label: 'Top right' },
          { value: 'top-left', label: 'Top left' },
        ], showIf: c => c.showCounter !== false },
      ] },

      { type: 'section', label: 'Layout', key: 'layout' },
      // NOT mediaFitField(): pdf's fit (page / width) is document layout, not
      // box-fill — see the note in shared/media-fit.js. Deliberately local.
      { key: 'fit', type: 'select', label: 'Fit', options: [
        { value: 'page', label: 'Fit page (full document visible)' },
        { value: 'width', label: 'Fit width (may scroll vertically)' },
      ], help: 'Portrait PDFs on landscape screens waste pixels with "fit page". Use "fit width" to scale up.' },
      { key: 'background', type: 'color', clearable: true, label: 'Background',
        help: 'Fills the area around the page. Empty = dark default.' },
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    if (!c.url) {
      const empty = mediaPlaceholder({ icon: '📄', message: 'Add a PDF URL or upload one to the library.' });
      container.appendChild(empty);
      return composeDispose(() => empty.remove());
    }
    const root = document.createElement('div');
    root.className = 'bb-slide bb-slide-pdf';
    root.style.cssText = 'position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
    // Background override ('' falls through to the classic dark backdrop, so
    // white-paper PDFs can sit on white like a printed sheet). Assigned via
    // .style so a stored value can never break out of the declaration.
    root.style.background = c.background || '#0a0a10';
    const canvas = document.createElement('canvas');
    canvas.dataset.field = 'url startPage endPage fit';
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
    root.appendChild(canvas);
    if (slide.title) {
      const t = document.createElement('div');
      t.className = 'bb-image-title';
      t.textContent = slide.title;
      root.appendChild(t);
    }
    let counter = null;
    if (c.showCounter !== false) {
      counter = document.createElement('div');
      counter.style.cssText = 'position:absolute;'
        + (COUNTER_POS[c.counterPosition] ?? COUNTER_POS['bottom-right'])
        + 'padding:.25em .6em;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font:600 clamp(11px, 2cqmin, 28px) var(--bb-font,Inter,sans-serif);';
      root.appendChild(counter);
    }
    container.appendChild(root);

    let cancelled = false;
    let pageTimer = null;
    let resizeTimer = null;
    let refreshTimer = null;
    let renderTask = null;
    let pdfDoc = null;
    let ro = null;
    let pStart = 1;
    let last = 1;
    let p = 1;

    // Page bounds against the CURRENT document (recomputed after a refresh
    // swap, where numPages may have changed). startPage beyond the document
    // clamps to the last page; an inverted range shows only the start page
    // (the inspector warns about that via validate on endPage).
    const computeBounds = () => {
      const reqStart = Math.max(1, Math.floor(Number(c.startPage) || 1));
      pStart = Math.min(reqStart, pdfDoc.numPages);
      const reqEnd = Math.floor(Number(c.endPage) || 0);
      last = reqEnd > 0 ? Math.min(reqEnd, pdfDoc.numPages) : pdfDoc.numPages;
      if (last < pStart) last = pStart;
    };

    const stop = () => {
      cancelled = true;
      if (pageTimer) clearTimeout(pageTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      if (refreshTimer) clearInterval(refreshTimer);
      try { ro?.disconnect(); } catch {}
      try { renderTask?.cancel?.(); } catch {}
      try { pdfDoc?.destroy?.(); } catch {}
      pdfDoc = null;
    };

    const fail = e => {
      if (cancelled) return;
      console.error('PDF render error', e);
      if (pageTimer) clearTimeout(pageTimer);
      if (refreshTimer) clearInterval(refreshTimer);
      try { ro?.disconnect(); } catch {}
      const err = mediaPlaceholder({ icon: '📄', message: 'PDF could not be loaded.' });
      const detail = document.createElement('div');
      detail.style.cssText = 'opacity:.7;font-size:.85em;margin-top:4px;font-family:var(--bb-mono, ui-monospace, monospace);';
      detail.textContent = e?.message ?? String(e);
      err.firstElementChild.appendChild(detail);
      root.replaceChildren(err);
    };

    // Draws ONE page at the current container size without advancing — shared
    // by the rotation loop, the ResizeObserver re-fit and the refresh swap.
    // Cancels any in-flight pdf.js render first (two renders on one canvas
    // throw); the cancelled predecessor rejects with
    // RenderingCancelledException, which we swallow.
    const renderPage = async num => {
      if (cancelled || !pdfDoc) return;
      const page = await pdfDoc.getPage(num);
      if (cancelled) return;
      const box = canvas.parentElement;
      if (!box || !box.clientWidth || !box.clientHeight) return;
      const viewport = page.getViewport({ scale: 1 });
      // fit=width scales the rendered page to fill the box horizontally
      // (vertical overflow is fine, landscape-rendering portrait PDFs is
      // the typical reason to choose this). fit=page is the legacy
      // letterbox behaviour that preserves the whole page.
      const fit = (c.fit === 'width')
        ? (box.clientWidth / viewport.width)
        : Math.min(box.clientWidth / viewport.width,
                   box.clientHeight / viewport.height) * 0.95;
      const dpr = window.devicePixelRatio || 1;
      const scaled = page.getViewport({ scale: fit * dpr });
      try { renderTask?.cancel?.(); } catch {}
      canvas.width = scaled.width;
      canvas.height = scaled.height;
      canvas.style.width = (scaled.width / dpr) + 'px';
      canvas.style.height = (scaled.height / dpr) + 'px';
      renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled });
      try {
        await renderTask.promise;
      } catch (err) {
        if (err?.name === 'RenderingCancelledException') return;
        throw err;
      }
      if (cancelled) return;
      if (counter) counter.textContent = `${num} / ${pdfDoc.numPages}`;
    };

    // Rotation loop. A single-page setup (start = end, or a one-page document)
    // schedules NO timer — the page holds statically and the ResizeObserver
    // below keeps it fitted, instead of the old re-render-every-pageSec churn.
    const tick = async () => {
      if (cancelled) return;
      await renderPage(p);
      if (cancelled || last <= pStart) return;
      pageTimer = setTimeout(() => {
        p = p < last ? p + 1 : pStart;
        tick().catch(fail);
      }, Math.max(1, Number(c.pageSec) || 6) * 1000);
    };

    (async () => {
      try {
        if (!window.pdfjsLib) throw new Error('pdf.js not loaded');
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = await resolveWorkerSrc();
          if (cancelled) return;
        }
        const doc = await window.pdfjsLib.getDocument(c.url).promise;
        if (cancelled) { try { doc.destroy(); } catch {} return; }
        pdfDoc = doc;
        computeBounds();
        p = pStart;
        await tick();
        if (cancelled) return;

        // Re-fit on container resize (debounced): the old code only picked up
        // a new box size on the next page flip, and a static single page
        // never re-fitted at all.
        ro = new ResizeObserver(() => {
          if (cancelled || !pdfDoc) return;
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => { renderPage(p).catch(() => {}); }, 150);
        });
        ro.observe(root);

        // Auto-refresh: re-fetch the document with cache-busting so a PDF
        // re-uploaded under the same URL updates on screen. The old document
        // is destroyed only AFTER the fresh one loaded; a failed fetch keeps
        // the current document and retries on the next interval. 5 s player
        // floor per the refreshSecField contract.
        const refreshSec = Math.max(0, Number(c.refreshSec) || 0);
        if (refreshSec > 0) {
          refreshTimer = setInterval(async () => {
            if (cancelled) return;
            try {
              const bust = /^https?:/i.test(c.url)
                ? c.url + (c.url.includes('?') ? '&' : '?') + '_bb=' + Date.now()
                : c.url;
              const fresh = await window.pdfjsLib.getDocument(bust).promise;
              if (cancelled) { try { fresh.destroy(); } catch {} return; }
              const old = pdfDoc;
              pdfDoc = fresh;
              try { old?.destroy?.(); } catch {}
              computeBounds();
              p = Math.min(Math.max(p, pStart), last);
              await renderPage(p);
            } catch (e) {
              console.warn('PDF refresh failed — keeping the current document', e);
            }
          }, Math.max(5000, refreshSec * 1000));
        }
      } catch (e) {
        fail(e);
      }
    })();

    ctx?.signal?.addEventListener?.('abort', stop, { once: true });
    return composeDispose(() => {
      stop();
      root.remove();
    });
  },
});
