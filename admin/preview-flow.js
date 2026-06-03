// Preview flow — fullscreen preview of the current playlist using the real
// player runtime (display.html). The in-memory playlist is shipped to the
// iframe via a Blob URL, so what you see is what would publish. Start from
// the currently-active slide by rotating the slide array.

import { state } from './store.js';
import { t } from './i18n.js';
import { resolveCanvas } from '../shared/slide-schema.js';

let openHandle = null;

export function openPreview() {
  if (openHandle) return; // already open

  const slides = state.playlist?.slides ?? [];
  if (!slides.length) return;

  // Rotate playlist so preview starts at the active slide.
  const idx = Math.max(0, slides.findIndex(s => s.id === state.ui?.activeSlideId));
  const rotated = idx > 0 ? [...slides.slice(idx), ...slides.slice(0, idx)] : slides;
  const previewPlaylist = { ...state.playlist, slides: rotated };

  const blob = new Blob([JSON.stringify(previewPlaylist)], { type: 'application/json' });
  const blobUrl = URL.createObjectURL(blob);

  // Letterbox the iframe to the playlist's aspect ratio so the preview shows
  // exactly what would publish to a display — the runtime itself just fills the
  // viewport, so without this the slide stretches on non-matching screens.
  const cv = resolveCanvas(state.playlist?.canvas);

  const overlay = document.createElement('div');
  overlay.className = 'avs-preview-overlay';
  overlay.style.setProperty('--avs-preview-aspect', `${cv.w} / ${cv.h}`);
  overlay.innerHTML = `
    <iframe class="avs-preview-frame" src="display.html?slot=${encodeURIComponent(blobUrl)}"
            allow="autoplay; fullscreen" title="${t('preview.title')}"></iframe>
    <button class="avs-preview-close" title="${t('common.close')} (Esc)" aria-label="${t('common.close')}">✕</button>
    <div class="avs-preview-hint">${t('preview.hint')}</div>`;

  const close = () => {
    if (!openHandle) return;
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('avs-preview-closing');
    setTimeout(() => {
      overlay.remove();
      URL.revokeObjectURL(blobUrl);
    }, 200);
    openHandle = null;
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };

  overlay.querySelector('.avs-preview-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);

  // Auto-hide the hint after a few seconds so it doesn't linger.
  setTimeout(() => overlay.querySelector('.avs-preview-hint')?.classList.add('avs-preview-hint-fade'), 3500);

  openHandle = { close };
}

export function closePreview() {
  openHandle?.close?.();
}
