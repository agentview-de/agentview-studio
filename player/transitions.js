// CSS-driven slide transitions. Each transition adds/removes classes on the
// outgoing + incoming slide elements; the CSS is injected on first use.
//
// The id catalog lives in shared/animations.js (so the inspector dropdown stays
// in sync); this file owns the CSS + the per-transition duration map.

import { TRANSITION_IDS } from '../shared/animations.js';

let _styleInjected = false;

// Per-transition wall-clock (ms) — drives the cleanup/advance timer so each
// transition resolves right when it actually finishes instead of a flat 1200ms.
const TRANSITION_MS = {
  fade: 800,
  slide: 700,
  'slide-up': 700,
  dissolve: 1100,
  zoom: 800,
  'zoom-blur': 1000,
  push: 750,
  wipe: 800,
  flip: 800,
};
const CLEANUP_BUFFER = 120;

const CSS = `
.bb-tx { position:absolute; inset:0; will-change: opacity, transform, filter, clip-path; }

.bb-tx-fade-out { transition: opacity 800ms ease; opacity: 0; }
.bb-tx-fade-in  { transition: opacity 800ms ease; opacity: 0; }
.bb-tx-fade-in.bb-tx-show { opacity: 1; }

.bb-tx-slide-out { transition: transform 700ms cubic-bezier(.22,1,.36,1), opacity 700ms ease; transform: translateX(-6%); opacity: 0; }
.bb-tx-slide-in  { transition: transform 700ms cubic-bezier(.22,1,.36,1), opacity 700ms ease; transform: translateX(6%); opacity: 0; }
.bb-tx-slide-in.bb-tx-show { transform: translateX(0); opacity: 1; }

.bb-tx-slide-up-out { transition: transform 700ms cubic-bezier(.22,1,.36,1), opacity 700ms ease; transform: translateY(-6%); opacity: 0; }
.bb-tx-slide-up-in  { transition: transform 700ms cubic-bezier(.22,1,.36,1), opacity 700ms ease; transform: translateY(6%); opacity: 0; }
.bb-tx-slide-up-in.bb-tx-show { transform: translateY(0); opacity: 1; }

.bb-tx-dissolve-out { transition: opacity 1100ms ease, filter 1100ms ease; opacity: 0; filter: blur(8px) saturate(1.4); }
.bb-tx-dissolve-in  { transition: opacity 1100ms ease, filter 1100ms ease; opacity: 0; filter: blur(8px); }
.bb-tx-dissolve-in.bb-tx-show { opacity: 1; filter: blur(0); }

.bb-tx-zoom-out { transition: transform 800ms cubic-bezier(.4,0,.2,1), opacity 800ms ease; transform: scale(1.06); opacity: 0; }
.bb-tx-zoom-in  { transition: transform 800ms cubic-bezier(.22,1,.36,1), opacity 800ms ease; transform: scale(.92); opacity: 0; }
.bb-tx-zoom-in.bb-tx-show { transform: scale(1); opacity: 1; }

.bb-tx-zoom-blur-out { transition: transform 1000ms cubic-bezier(.4,0,.2,1), opacity 1000ms ease, filter 1000ms ease; transform: scale(1.12); opacity: 0; filter: blur(12px); }
.bb-tx-zoom-blur-in  { transition: transform 1000ms cubic-bezier(.22,1,.36,1), opacity 1000ms ease, filter 1000ms ease; transform: scale(1.08); opacity: 0; filter: blur(12px); }
.bb-tx-zoom-blur-in.bb-tx-show { transform: scale(1); opacity: 1; filter: blur(0); }

/* push — both slides translate together, no fade (a hard slide-over) */
.bb-tx-push-out { transition: transform 750ms cubic-bezier(.6,0,.2,1); transform: translateX(-100%); }
.bb-tx-push-in  { transition: transform 750ms cubic-bezier(.6,0,.2,1); transform: translateX(100%); }
.bb-tx-push-in.bb-tx-show { transform: translateX(0); }

/* wipe — the new slide is revealed left→right over the old one */
.bb-tx-wipe-out { transition: opacity 800ms ease; opacity: 1; }
.bb-tx-wipe-in  { transition: clip-path 800ms cubic-bezier(.65,0,.35,1); clip-path: inset(0 100% 0 0); }
.bb-tx-wipe-in.bb-tx-show { clip-path: inset(0 0 0 0); }

/* flip — subtle 3D turn (per-element perspective avoids the backface gap) */
.bb-tx-flip-out { transition: transform 800ms cubic-bezier(.4,0,.2,1), opacity 800ms ease; transform: perspective(1600px) rotateY(-14deg); opacity: 0; }
.bb-tx-flip-in  { transition: transform 800ms cubic-bezier(.22,1,.36,1), opacity 800ms ease; transform: perspective(1600px) rotateY(14deg); opacity: 0; }
.bb-tx-flip-in.bb-tx-show { transform: perspective(1600px) rotateY(0); opacity: 1; }

/* Accessibility: honour reduced-motion on live screens. Neutralise the slide
   animation to an instant cut (the player's advance timer is unchanged, so
   pacing stays the same). Matches the prefers-reduced-motion awareness the
   per-widget builds/loops already have in shared/animations.js. */
@media (prefers-reduced-motion: reduce) {
  .bb-tx, [class*="bb-tx-"] { transition: none !important; filter: none !important; }
}
`;

function inject() {
  if (_styleInjected) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  _styleInjected = true;
}

export function applyTransition(name, oldEl, newEl) {
  inject();
  const tx = TRANSITION_IDS.includes(name) ? name : 'fade';
  newEl.classList.add('bb-tx', `bb-tx-${tx}-in`);
  if (oldEl) {
    oldEl.classList.add('bb-tx', `bb-tx-${tx}-out`);
  }
  // Force layout flush before adding show class
  newEl.getBoundingClientRect();
  requestAnimationFrame(() => newEl.classList.add('bb-tx-show'));
  const ms = (TRANSITION_MS[tx] ?? 1100) + CLEANUP_BUFFER;
  return new Promise(resolve => {
    setTimeout(() => {
      newEl.classList.remove('bb-tx', `bb-tx-${tx}-in`, 'bb-tx-show');
      oldEl?.remove();
      resolve();
    }, ms);
  });
}
