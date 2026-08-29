// Preview flow — fullscreen preview of the current playlist using the real
// player runtime (display.html). The in-memory playlist is shipped to the
// iframe via a Blob URL, so what you see is what would publish. Start from
// the currently-active slide by rotating the slide array.

import { state, withSavedShape } from './store.js';
import { t } from './i18n.js';
import { resolveCanvas } from '../shared/slide-schema.js';
import { inertBackground } from './ui/inert-background.js';

let openHandle = null;

export function openPreview() {
  if (openHandle) return; // already open

  const slides = state.playlist?.slides ?? [];
  if (!slides.length) return;

  // The SAME bracket the store uses when it saves and the export uses when it
  // writes a backup. Without it this claim — what you see is what would publish
  // — is false in exactly the situation where it matters most: while a language
  // or A/B variant is open for editing, the variant's widgets sit in
  // slide.widgets and the default array is stashed in memory. The preview
  // serialised that stash, so it showed the variant AS the default and left the
  // variant's own slot holding stale content.
  const json = withSavedShape(() => {
    // Rotate playlist so preview starts at the active slide. Inside the bracket:
    // it reads the very arrays the bracket swaps.
    const src = state.playlist.slides;
    const idx = Math.max(0, src.findIndex(s => s.id === state.ui?.activeSlideId));
    const rotated = idx > 0 ? [...src.slice(idx), ...src.slice(0, idx)] : src;
    return JSON.stringify({ ...state.playlist, slides: rotated });
  });

  const blob = new Blob([json], { type: 'application/json' });
  const blobUrl = URL.createObjectURL(blob);

  // Letterbox the iframe to the playlist's aspect ratio so the preview shows
  // exactly what would publish to a display — the runtime itself just fills the
  // viewport, so without this the slide stretches on non-matching screens.
  const cv = resolveCanvas(state.playlist?.canvas);

  const overlay = document.createElement('div');
  overlay.className = 'avs-preview-overlay';
  // It covers the whole editor, so it has to behave like a dialog: announced as
  // one, focus inside it, and the background out of the tab order. Without this
  // the overlay was purely visual — Tab walked through the editor underneath it,
  // and closing left focus wherever it had wandered. (The same treatment
  // ui/modal.js and the display drawer already carry.)
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('preview.title'));
  // Focus goes on the DIALOG, not on its close button — the same choice
  // ui/modal.js makes, and here it is load-bearing: the ✕ is opacity:0 until
  // the overlay is hovered or the button is :focus-visible, so focusing it
  // programmatically would leave a focused control nobody can see. From the
  // dialog, the first Tab lands on the ✕ as a keyboard move, which reveals it.
  overlay.tabIndex = -1;
  overlay.style.setProperty('--avs-preview-aspect', `${cv.w} / ${cv.h}`);
  overlay.innerHTML = `
    <iframe class="avs-preview-frame" tabindex="-1" src="display.html?slot=${encodeURIComponent(blobUrl)}"
            allow="autoplay; fullscreen" title="${t('preview.title')}"></iframe>
    <button class="avs-preview-close" title="${t('common.close')} (Esc)" aria-label="${t('common.close')}">✕</button>
    <div class="avs-preview-hint">${t('preview.hint')}</div>`;

  const opener = document.activeElement;
  const close = () => {
    if (!openHandle) return;
    unInert();
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('avs-preview-closing');
    setTimeout(() => {
      overlay.remove();
      URL.revokeObjectURL(blobUrl);
      // Hand focus back only once the overlay is gone — the browser refuses to
      // move focus out of an element it is still inside.
      try { if (opener?.isConnected) opener.focus?.(); } catch { /* opener went away */ }
    }, 200);
    openHandle = null;
  };
  // One stop: the close button. The player frame is deliberately out of the tab
  // order (tabindex=-1) — tabbing INTO it hands the keyboard to the player's own
  // document, and tabbing off its last element walks straight out into the
  // editor behind the overlay, which is the leak this trap exists to close. The
  // preview is something you watch; the mouse still reaches the frame.
  const ring = () => [...overlay.querySelectorAll('.avs-preview-close')];
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = ring();
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const active = document.activeElement;
    if (!overlay.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };

  overlay.querySelector('.avs-preview-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  const unInert = inertBackground(overlay);
  overlay.focus();

  // Auto-hide the hint after a few seconds so it doesn't linger.
  setTimeout(() => overlay.querySelector('.avs-preview-hint')?.classList.add('avs-preview-hint-fade'), 3500);

  openHandle = { close };
}

export function closePreview() {
  openHandle?.close?.();
}
