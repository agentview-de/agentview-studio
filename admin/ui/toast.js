// Tiny toast system. mount() once; call toast(text, opts).
//
// A toast is DECORATION; the announcement is a live region.
//
// This is how the app tells anybody what just happened — 181 call sites, from
// "Playlist geladen" to "„x.json“ ist keine Playlist-Datei". None of it reached
// a screen reader: the host carried no role and no aria-live, so every message
// in the product appeared and vanished in silence. A blind user pressed
// Publish and was told nothing, either way.
//
// TWO regions, because politeness cannot be changed on a region that is already
// in the document: a success waits its turn, a failure interrupts. They sit
// INSIDE the host so the dialog-inerting pass (ui/inert-background.js), which
// deliberately spares .bb-toast-host, spares them too — and they are absolutely
// positioned, so the host's flex gap does not see them.
//
// The visual toasts themselves are aria-hidden: the text is announced once,
// from the region, not twice.

import { escapeHtml } from '../../shared/utils/escape.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';

let _host = null;
let _polite = null;
let _assertive = null;

function srRegion(role, live) {
  const el = document.createElement('div');
  el.className = 'bb-sr-only';
  el.setAttribute('role', role);
  el.setAttribute('aria-live', live);
  el.setAttribute('aria-atomic', 'true');
  return el;
}

export function mount() {
  if (_host) return;
  _host = document.createElement('div');
  _host.className = 'bb-toast-host';
  _polite = srRegion('status', 'polite');
  _assertive = srRegion('alert', 'assertive');
  _host.append(_polite, _assertive);
  document.body.appendChild(_host);
}

/**
 * Announce `text` in the region that matches how urgent it is. Cleared first:
 * two identical messages in a row are two events, and a region whose text did
 * not change announces nothing.
 *
 * Exported because not every announcement wants a toast behind it. The slide
 * rail moves a slide on alt+arrow and said NOTHING — the card keeps its name
 * and its focus, so a screen reader had no way to tell that anything had
 * happened, let alone where the slide had gone. A visible toast per keypress
 * would be noise for everyone else; this is the half that belongs to the
 * reader who cannot see the thumbnails move.
 *
 * @param {string} text
 * @param {'info'|'success'|'warn'|'error'} [kind] 'warn'/'error' interrupt.
 */
export function announce(text, kind) {
  // mount() first, exactly as toast() does. The regions are created lazily, so
  // an announcement made before the first toast of the session used to return
  // here and say nothing — which is the one failure mode this function exists
  // to prevent.
  mount();
  const region = (kind === 'error' || kind === 'warn') ? _assertive : _polite;
  if (!region) return;
  region.textContent = '';
  setTimeout(() => { region.textContent = String(text ?? ''); }, 20);
}

export function toast(text, opts = {}) {
  mount();
  const el = document.createElement('div');
  el.className = `bb-toast bb-toast-${opts.kind ?? 'info'}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <span class="bb-toast-icon" aria-hidden="true">${opts.icon ?? ICONS[opts.kind ?? 'info']}</span>
    <span class="bb-toast-text">${escapeHtml(text)}</span>
  `;
  announce(text, opts.kind);
  _host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('bb-toast-show'));
  const ttl = opts.ttl ?? 3500;
  setTimeout(() => {
    el.classList.remove('bb-toast-show');
    setTimeout(() => el.remove(), 300);
  }, ttl);
  return el;
}

const ICONS = {
  info: uiIconSvg('info', 15), success: uiIconSvg('check-circle', 15),
  warn: uiIconSvg('alert', 15), error: uiIconSvg('x-circle', 15),
};

