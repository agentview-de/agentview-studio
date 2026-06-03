// Animation catalogs + apply helpers — the single source of truth shared by
// the admin (inspector dropdowns + editor preview) and the player (live render).
//
// Three independent animation surfaces:
//   • Slide TRANSITIONS — whole-slide in/out between slides. The CSS lives in
//     player/transitions.js (player-only, self-injected); this module owns the
//     id+label catalog so the inspector dropdown stays in sync.
//   • Widget BUILDS — per-widget entrance animation ("build-in" à la Keynote).
//     One-shot, transition-driven: prime the element into a hidden state, then
//     reveal it. CSS = `.bb-wa-*` classes in styles/slide-themes.css.
//   • Ambient LOOPS — continuous, infinite widget motion (float/pulse/Ken Burns
//     …). CSS = `.bb-loop-*` keyframes in styles/slide-themes.css.
//
// Everything is pure CSS class toggling — zero runtime cost, survives the
// publish bundler unchanged, and `prefers-reduced-motion` is honoured both in
// the CSS guards and here (primeBuild becomes a no-op so content is never
// hidden from reduced-motion viewers).

// ---------- Catalogs ----------

// Slide-to-slide transitions. `fade`/`slide`/`dissolve` are the originals; the
// rest were added in the "more animations" pass. Labels stay short + symbolic
// so they read in any language (the select shows them verbatim).
export const SLIDE_TRANSITIONS = Object.freeze([
  { id: 'fade',      label: 'Fade' },
  { id: 'slide',     label: 'Slide →' },
  { id: 'slide-up',  label: 'Slide ↑' },
  { id: 'dissolve',  label: 'Dissolve' },
  { id: 'zoom',      label: 'Zoom' },
  { id: 'zoom-blur', label: 'Zoom Blur' },
  { id: 'push',      label: 'Push' },
  { id: 'wipe',      label: 'Wipe' },
  { id: 'flip',      label: 'Flip' },
]);
export const TRANSITION_IDS = Object.freeze(SLIDE_TRANSITIONS.map(t => t.id));

// Per-widget entrance builds. `none` is the default (widget appears with the
// slide, no build).
export const WIDGET_BUILDS = Object.freeze([
  { id: 'none',       label: '—' },
  { id: 'fade',       label: 'Fade' },
  { id: 'fade-up',    label: 'Fade ↑' },
  { id: 'fade-down',  label: 'Fade ↓' },
  { id: 'fade-left',  label: 'Fade ←' },
  { id: 'fade-right', label: 'Fade →' },
  { id: 'scale',      label: 'Pop' },
  { id: 'zoom',       label: 'Zoom' },
  { id: 'reveal',     label: 'Reveal' },
  { id: 'blur',       label: 'Blur' },
  { id: 'rise',       label: 'Rise' },
]);
export const BUILD_IDS = Object.freeze(WIDGET_BUILDS.map(b => b.id));

// Continuous ambient loops. `none` = static (default).
export const AMBIENT_EFFECTS = Object.freeze([
  { id: 'none',     label: '—' },
  { id: 'float',    label: 'Float' },
  { id: 'pulse',    label: 'Pulse' },
  { id: 'sway',     label: 'Sway' },
  { id: 'kenburns', label: 'Ken Burns' },
  { id: 'glow',     label: 'Glow' },
  { id: 'spin',     label: 'Spin' },
]);
export const AMBIENT_IDS = Object.freeze(AMBIENT_EFFECTS.map(a => a.id));

// Build timing bounds (ms). Durations stored in JSON as ms; the inspector edits
// them as seconds for friendliness.
export const BUILD_DEFAULT_MS = 600;
const DUR_MIN = 100, DUR_MAX = 5000;
const DELAY_MIN = 0, DELAY_MAX = 10000;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- Reduced motion ----------

export function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

// ---------- Build helpers ----------

// Normalize a stored widget.anim into { type, duration, delay } or null when
// there's no (valid) build. Accepts partials; clamps timing.
export function normalizeBuild(anim) {
  if (!anim || typeof anim !== 'object') return null;
  const type = anim.type;
  if (!type || type === 'none' || !BUILD_IDS.includes(type)) return null;
  const duration = clamp(+anim.duration || BUILD_DEFAULT_MS, DUR_MIN, DUR_MAX);
  const delay = clamp(+anim.delay || 0, DELAY_MIN, DELAY_MAX);
  return { type, duration, delay };
}

export function isBuild(anim) {
  return normalizeBuild(anim) != null;
}

// Strip any build state so an element can be re-primed (used by the editor
// preview, which replays builds in place).
export function resetBuild(el) {
  if (!el) return;
  for (const c of [...el.classList]) {
    if (c === 'bb-wa' || c.startsWith('bb-wa-')) el.classList.remove(c);
  }
  el.style.removeProperty('--bb-wa-dur');
}

// Put an element into its build's INITIAL (hidden) state. Safe to call during
// render, BEFORE the slide transition shows the slide — the widget then stays
// hidden under the transition and reveals afterwards. No-op under reduced
// motion so content is never withheld from those viewers.
export function primeBuild(el, anim) {
  const a = normalizeBuild(anim);
  if (!el || !a || prefersReducedMotion()) return false;
  el.style.setProperty('--bb-wa-dur', a.duration + 'ms');
  el.classList.add('bb-wa', `bb-wa-${a.type}`);
  return true;
}

// Trigger the transition from the primed hidden state to visible.
export function revealBuild(el) {
  if (el) el.classList.add('bb-wa-in');
}

// Convenience for the editor: replay a build once on `el`, honouring its delay,
// then clean up so the element is left untouched (no lingering transition that
// would fight dragging or a subsequent re-render). Returns a cancel function.
export function playBuildOnce(el, anim) {
  const a = normalizeBuild(anim);
  if (!el || !a || prefersReducedMotion()) return () => {};
  resetBuild(el);
  primeBuild(el, anim);
  void el.getBoundingClientRect(); // commit the hidden state before revealing
  let revealTimer = 0, cleanupTimer = 0, raf = 0;
  const reveal = () => { raf = requestAnimationFrame(() => revealBuild(el)); };
  if (a.delay) revealTimer = setTimeout(reveal, a.delay);
  else reveal();
  cleanupTimer = setTimeout(() => resetBuild(el), a.delay + a.duration + 150);
  return () => {
    clearTimeout(revealTimer);
    clearTimeout(cleanupTimer);
    try { cancelAnimationFrame(raf); } catch {}
    resetBuild(el);
  };
}

// ---------- Loop helpers ----------

export function isLoop(loop) {
  return typeof loop === 'string' && loop !== 'none' && AMBIENT_IDS.includes(loop);
}

export function applyLoop(el, loop) {
  if (!el || !isLoop(loop)) return false;
  el.classList.add('bb-loop', `bb-loop-${loop}`);
  return true;
}

export function clearLoop(el) {
  if (!el) return;
  for (const c of [...el.classList]) {
    if (c === 'bb-loop' || c.startsWith('bb-loop-')) el.classList.remove(c);
  }
}
