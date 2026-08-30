// Shared background subsystem — ONE model + ONE CSS renderer for every
// background in the app (slide-level and widget-level). Used by the canvas,
// the player, and the background editor.

import { cssUrl } from './safe-url.js';
//
// Background object (all fields optional; omitted ⇒ transparent):
// {
//   type: 'transparent' | 'color' | 'gradient' | 'image',
//   color: '#rrggbb',                                   // type=color
//   gradient: { kind:'linear'|'radial', angle:Number,   // type=gradient
//               stops:[{ color:'#hex', pos:0..100 }] },
//   image: { url, fit:'cover'|'contain'|'fill',          // type=image
//            position:'center'|…, repeat:'no-repeat'|'repeat', color:'#hex' },
//   opacity: 0..1                                        // layer transparency
// }

export function defaultBackground() {
  return { type: 'transparent' };
}

export function normalizeBackground(bg) {
  const b = (bg && typeof bg === 'object') ? { ...bg } : {};
  b.type = ['transparent', 'color', 'gradient', 'image'].includes(b.type) ? b.type : 'transparent';
  b.color = b.color ?? '#1e1e2a';
  b.opacity = (typeof b.opacity === 'number') ? Math.min(1, Math.max(0, b.opacity)) : 1;
  b.gradient = {
    kind: b.gradient?.kind === 'radial' ? 'radial' : 'linear',
    angle: typeof b.gradient?.angle === 'number' ? b.gradient.angle : 135,
    stops: Array.isArray(b.gradient?.stops) && b.gradient.stops.length >= 2
      ? b.gradient.stops.map(s => ({ color: s.color ?? '#8b5cf6', pos: clampPct(s.pos) }))
      : [{ color: '#8b5cf6', pos: 0 }, { color: '#06b6d4', pos: 100 }],
  };
  b.image = {
    url: b.image?.url ?? '',
    fit: ['cover', 'contain', 'fill'].includes(b.image?.fit) ? b.image.fit : 'cover',
    position: b.image?.position ?? 'center',
    repeat: b.image?.repeat === 'repeat' ? 'repeat' : 'no-repeat',
    color: b.image?.color ?? '',
  };
  return b;
}

const clampPct = v => Math.min(100, Math.max(0, Number.isFinite(+v) ? +v : 0));

// Is this background a real (non-transparent) paint?
export function isPainted(bg) {
  if (!bg || bg.type === 'transparent' || !bg.type) return false;
  if (bg.type === 'image') return !!bg.image?.url;
  return true;
}

export function gradientCss(g) {
  const gg = g ?? {};
  const stops = (gg.stops ?? []).map(s => `${s.color} ${clampPct(s.pos)}%`).join(', ');
  return gg.kind === 'radial'
    ? `radial-gradient(circle at 50% 50%, ${stops})`
    : `linear-gradient(${gg.angle ?? 135}deg, ${stops})`;
}

// Paint `bg` onto element `el` (a dedicated layer). Opacity is applied to the
// layer so it never fades the content above it. Resets prior paint first.
export function applyBackground(el, bg) {
  if (!el) return;
  el.style.background = '';
  el.style.backgroundImage = '';
  el.style.backgroundColor = '';
  el.style.opacity = '';
  if (!isPainted(bg)) { el.style.background = 'transparent'; return; }
  if (bg.type === 'color') {
    el.style.backgroundColor = bg.color || '#000';
  } else if (bg.type === 'gradient') {
    el.style.backgroundImage = gradientCss(bg.gradient);
  } else if (bg.type === 'image') {
    if (bg.image.color) el.style.backgroundColor = bg.image.color;
    // Route through cssUrl so user-pasted URLs with `"`/`)` chars can't break
    // out of the CSS url() function into arbitrary rules.
    const u = cssUrl(bg.image.url);
    if (u) {
      el.style.backgroundImage = u;
      el.style.backgroundSize = bg.image.fit === 'contain' ? 'contain'
        : (bg.image.fit === 'fill' ? '100% 100%' : 'cover');
      el.style.backgroundPosition = bg.image.position || 'center';
      el.style.backgroundRepeat = bg.image.repeat || 'no-repeat';
    }
  }
  if (typeof bg.opacity === 'number' && bg.opacity < 1) el.style.opacity = String(bg.opacity);
}

// Slide layer: explicit background, else fall back to the theme's --bb-st-bg.
export function applySlideBackground(el, bg) {
  if (isPainted(bg)) applyBackground(el, bg);
  else { el.style.opacity = ''; el.style.background = 'var(--bb-st-bg, #09090b)'; }
}

// Widget bg layer: a themed widget falls back to its theme's --bb-st-bg (so the
// "Theme background" option paints), a themeless one stays truly transparent.
// The theme class on the LAYER is what resolves --bb-st-bg. Shared by the canvas
// frame builder, the canvas live-background updater, and the player slot so the
// three stay identical — this exact theme/paint branch used to be copy-pasted in
// all three. Adding an already-present theme class is a no-op, so the updater
// path (which reuses an existing layer) can call this safely too.
export function applyWidgetBg(layer, widget) {
  if (!layer) return;
  const theme = widget?.content?.theme;
  if (theme) {
    layer.classList.add(`bb-theme-${theme}`);
    applySlideBackground(layer, widget?.background);
  } else {
    applyBackground(layer, widget?.background);
  }
}

// ---- auto-contrast text colour ---------------------------------------------
// A custom slide background overrides the theme's --bb-st-bg but NOT its text
// colour, which can make text unreadable (e.g. a dark image under a light
// theme). We derive a readable text colour from the background's luminance and
// override --bb-st-fg on the slide's themed wrapper; the theme keeps font +
// accent. Backgrounds whose colour we can't know (a bare image) keep the
// theme's own text colour.

const FG_LIGHT = '#f4f3ef';
const FG_DARK = '#1c1c1c';

// Relative luminance (0..1, WCAG) of a #rgb / #rrggbb colour, or null if unparseable.
function luminance(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const chan = i => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
}

// Average luminance of a painted background, or null when undeterminable.
function bgLuminance(bg) {
  if (!isPainted(bg)) return null;
  if (bg.type === 'color') return luminance(bg.color);
  if (bg.type === 'gradient') {
    const ls = (bg.gradient?.stops ?? []).map(s => luminance(s.color)).filter(v => v != null);
    return ls.length ? ls.reduce((a, b) => a + b, 0) / ls.length : null;
  }
  if (bg.type === 'image') return bg.image?.color ? luminance(bg.image.color) : null;
  return null;
}

// Readable ink for a solid COLOUR — the same luminance rule as
// readableTextColor below, for callers that hold a colour rather than a
// background object. A badge painted with the theme accent has this exact
// problem: the ticker's lead label used `color: var(--bb-st-bg)`, which is a
// gradient string on most themes, so the declaration was dropped and the label
// inherited the theme's own light text — white on a light amber pill. Returns
// null for anything unparseable, so the caller can keep its own colour.
export function readableOn(color) {
  const l = luminance(color);
  if (l == null) return null;
  // Whichever of the two inks has the higher WCAG contrast ratio — NOT a
  // luminance > 0.5 test. The accent palette is full of mid-tone colours where
  // the two disagree: amber #f59e0b sits at luminance 0.44, so a 0.5 threshold
  // picks light ink, and white on amber is 2.1:1 where black is 10:1. Sky blue
  // #38bdf8 and cyan #06b6d4 fail the same way. The crossover is near 0.18, and
  // deriving it from the ratio means it never has to be re-derived by hand.
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return ratio(l, luminance(FG_LIGHT)) >= ratio(l, luminance(FG_DARK)) ? FG_LIGHT : FG_DARK;
}

// Readable text colour for a painted slide background, or null to keep the theme's.
export function readableTextColor(bg) {
  const l = bgLuminance(bg);
  if (l == null) return null;
  return l > 0.5 ? FG_DARK : FG_LIGHT;
}

// Apply (or clear) the auto-contrast text colour on a slide's themed wrapper.
// Call right after setting the theme class / slide background on that wrapper.
export function applySlideContrast(wrapperEl, bg) {
  if (!wrapperEl) return;
  const fg = readableTextColor(bg);
  if (fg) wrapperEl.style.setProperty('--bb-st-fg', fg);
  else wrapperEl.style.removeProperty('--bb-st-fg');
}
