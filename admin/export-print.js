// Print / Save-as-PDF export.
//
// The gap this fills is not "make a paper copy". It is: somebody has to approve
// a deck who is not going to open the studio, and until now the only way to show
// them was a screenshot per slide. Every browser can already write a PDF; what
// was missing was a document worth writing.
//
// No renderer of its own. The pages are built with renderSlideThumb — the same
// function the slide rail and the template store use — so a slide prints as the
// screen shows it, master included, hidden widgets excluded, without a second
// implementation of "what is on this slide" that could drift from the first.
//
// Two shapes, both of which PowerPoint's print dialog offers:
//
//   deck     one slide per page, on a page cut to the CANVAS's own aspect. A
//            16:9 signage deck exported onto A4 portrait would be a column of
//            postage stamps in a sea of white; the page should be the shape of
//            the thing on it.
//   handout  2 / 4 / 6 to an A4 page, optionally captioned. This is the one you
//            print for a meeting, so it stays A4 — it has to go in a folder.
//
// Network widgets print their offline stand-in rather than live data, because
// renderSlideThumb refuses to fetch (DSGVO — see the note in that file). An
// export that silently phoned six third-party APIs would be a worse surprise
// than a labelled placeholder.

import { state } from './store.js';
import { renderSlideThumb } from './ui/slide-thumb.js';
import { resolveCanvas } from '../shared/slide-schema.js';
import { openModal } from './ui/modal.js';
import { toast } from './ui/toast.js';
import { escapeHtml as esc } from '../shared/utils/escape.js';
import { t } from './i18n.js';

const ROOT_ID = 'avs-print-root';
const STYLE_ID = 'avs-print-style';

// A4 in millimetres. The handout sheet is A4 because a handout's job is to go in
// a folder next to everything else that is A4.
const A4_W = 210, A4_H = 297;
const HANDOUT_MARGIN = 12;

export const LAYOUTS = Object.freeze([
  { id: 'deck', perPage: 1, cols: 1 },
  { id: 'handout2', perPage: 2, cols: 1 },
  { id: 'handout4', perPage: 4, cols: 2 },
  { id: 'handout6', perPage: 6, cols: 2 },
]);

export function layoutById(id) {
  return LAYOUTS.find(l => l.id === id) ?? LAYOUTS[0];
}

// The @page rule for a layout, in millimetres.
//
// For the deck layout the page IS the slide: same aspect, no margin, so the PDF
// a reviewer opens is the deck and nothing else. Width is pinned to A4's long
// edge for a landscape canvas and its short edge for a portrait one, which keeps
// the result a sensible physical size either way.
export function pageRuleFor(layoutId, canvas) {
  if (layoutById(layoutId).perPage !== 1) return `@page { size: A4 portrait; margin: ${HANDOUT_MARGIN}mm; }`;
  const { w, h } = resolveCanvas(canvas);
  const landscape = w >= h;
  const longEdge = A4_H, shortEdge = A4_W;
  const pw = landscape ? longEdge : shortEdge;
  const ph = Math.round((pw * h) / w * 100) / 100;
  return `@page { size: ${pw}mm ${ph}mm; margin: 0; }`;
}

// Chunk the slides into pages.
export function paginate(slides, perPage) {
  const n = Math.max(1, perPage | 0);
  const pages = [];
  for (let i = 0; i < slides.length; i += n) pages.push(slides.slice(i, i + n));
  return pages;
}

function clearPrintRoot() {
  const root = document.getElementById(ROOT_ID);
  if (root) {
    // Every thumb's dispose lives on the node that owns it, so one pass tears
    // down every plugin the export mounted — a 40-slide deck can hold a few
    // hundred, and leaking them would keep their timers running for the session.
    for (const el of root.querySelectorAll('[data-dispose]')) {
      try { el._dispose?.(); } catch { /* a plugin's teardown is not our problem */ }
    }
    root.remove();
  }
  document.getElementById(STYLE_ID)?.remove();
}

// Build the print document and hand it to the browser.
export function printDeck({ layout = 'deck', captions = true } = {}) {
  const playlist = state.playlist;
  const slides = playlist?.slides ?? [];
  if (!slides.length) { toast(t('print.empty'), { kind: 'info' }); return false; }

  clearPrintRoot();
  const spec = layoutById(layout);

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = pageRuleFor(layout, playlist?.canvas);
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.className = 'avs-print-root avs-print-' + spec.id;
  document.body.appendChild(root);

  const pages = paginate(slides, spec.perPage);
  // Slide numbers are the deck's own, not the page's — a caption reading "3" on
  // the third slide of page two is the number the reviewer will quote back.
  let index = 0;
  for (const pageSlides of pages) {
    const page = document.createElement('div');
    page.className = 'avs-print-page';
    page.style.setProperty('--cols', String(spec.cols));
    for (const slide of pageSlides) {
      index += 1;
      const cell = document.createElement('div');
      cell.className = 'avs-print-cell';
      const frame = document.createElement('div');
      frame.className = 'avs-print-frame';
      cell.appendChild(frame);
      if (captions && spec.perPage > 1) {
        const cap = document.createElement('div');
        cap.className = 'avs-print-caption';
        cap.innerHTML = `<span>${index}</span>${esc(slide.name?.trim() || '')}`;
        cell.appendChild(cap);
      }
      page.appendChild(cell);
    }
    root.appendChild(page);
  }

  // Render AFTER layout so each frame reports the width it actually got — the
  // thumbs scale to their host, and a host measured before it was in the
  // document measures zero.
  const frames = [...root.querySelectorAll('.avs-print-frame')];
  const flat = pages.flat();
  frames.forEach((frame, i) => {
    const slide = flat[i];
    if (!slide) return;
    const dispose = renderSlideThumb(frame, slide, playlist, { width: frame.clientWidth || 800 });
    frame.dataset.dispose = '1';
    frame._dispose = dispose;
  });

  // One-shot cleanup. `afterprint` fires on cancel as well as on save, and the
  // timeout is the belt to that brace: a browser that never fires it must not
  // leave a few hundred mounted plugins in the page for the rest of the session.
  const done = () => { window.removeEventListener('afterprint', done); clearPrintRoot(); };
  window.addEventListener('afterprint', done);
  setTimeout(done, 120000);

  // A frame's own layout has to settle before the print snapshot is taken, so
  // the natural spelling is a double rAF. But rAF does not run in a backgrounded
  // or hidden tab, and "the export button did nothing" is a worse failure than a
  // slightly early snapshot — so a timer races it and whichever arrives first
  // wins. `fired` is what keeps that from opening two print dialogs.
  let fired = false;
  const fire = () => { if (fired) return; fired = true; window.print(); };
  requestAnimationFrame(() => requestAnimationFrame(fire));
  setTimeout(fire, 300);
  return true;
}

export async function openPrintExport() {
  const slides = state.playlist?.slides ?? [];
  if (!slides.length) { toast(t('print.empty'), { kind: 'info' }); return; }

  const box = document.createElement('div');
  box.innerHTML = `
    <div class="bb-form-group">
      <label>${esc(t('print.layout'))}</label>
      <div class="avs-print-opts" id="pr-layout">
        ${LAYOUTS.map((l, i) => `
          <button type="button" class="avs-print-opt${i === 0 ? ' bb-on' : ''}" data-id="${l.id}">
            <span class="avs-print-opt-grid" style="--cols:${l.cols}">${'<i></i>'.repeat(l.perPage)}</span>
            <span>${esc(t('print.layout.' + l.id))}</span>
          </button>`).join('')}
      </div>
      <p class="bb-form-help" id="pr-help">${esc(t('print.layout.deckHelp'))}</p>
    </div>
    <div class="bb-form-group">
      <label class="avs-ss-check">
        <input type="checkbox" id="pr-caps" checked>
        <span>${esc(t('print.captions'))}</span>
      </label>
    </div>
    <p class="bb-form-help">${esc(t('print.help', { n: slides.length }))}</p>`;

  let layout = 'deck';
  const help = box.querySelector('#pr-help');
  const capsRow = box.querySelector('#pr-caps').closest('.bb-form-group');
  const reflect = () => {
    for (const b of box.querySelectorAll('.avs-print-opt')) b.classList.toggle('bb-on', b.dataset.id === layout);
    help.textContent = t(layout === 'deck' ? 'print.layout.deckHelp' : 'print.layout.handoutHelp');
    // Captions belong to a handout. One slide filling a page to its own edges
    // has nowhere to put a caption that is not on top of the slide.
    capsRow.hidden = layout === 'deck';
  };
  box.querySelector('#pr-layout').addEventListener('click', e => {
    const b = e.target.closest('.avs-print-opt');
    if (!b) return;
    layout = b.dataset.id;
    reflect();
  });
  reflect();

  const go = await openModal({
    title: t('print.title'),
    body: box,
    actions: [
      { label: t('common.cancel') },
      { label: t('print.go'), value: 'go', kind: 'primary' },
    ],
  });
  if (go !== 'go') return;
  printDeck({ layout, captions: box.querySelector('#pr-caps').checked });
}
