// Brand-Kit → CSS variable injection.
//
// The existing themes (styles/slide-themes.css) already drive every plugin's
// look via `--bb-st-bg`, `--bb-st-fg`, `--bb-st-accent`, `--bb-st-font`.
// Brand-Kit just provides custom values for these vars. The cascade
// (Org → Playlist → Slide) is resolved upstream via resolveBrandKit() in
// shared/slide-schema.js; this module only KNOWS HOW to push the result onto
// a DOM element.

import { resolveBrandKit } from './slide-schema.js';
import { canvasColor } from './css-color.js';

// A brand-kit value is not trusted input.
//
// It arrives from an imported playlist file or from the organisation, and it
// goes straight into a CSS custom property that the themes substitute into
// `background`, `color` and `font`. A custom property accepts almost any token
// sequence, so a "colour" of `url(https://example.org/x.png)` was stored,
// substituted into `background: var(--bb-st-bg)` — and FETCHED. Every display
// showing that playlist would call that URL, on every slide, for as long as it
// ran: a beacon with the screen's IP and user agent, entirely outside the
// editor's privacy gate, which knows about widgets and not about brand kits.
//
// canvasColor() asks the browser's own parser what a colour is; its own doc
// comment already names "brand kit" as a source it is meant for. A value it
// rejects is simply not set, so the theme's own colour stands — which is what
// an unreadable brand colour should look like.
const safeColor = (v) => canvasColor(v, '');

// A font stack is names, commas and quotes. Anything with a bracket in it is
// not a font stack: url(), var() and every other functional notation are how a
// value stops being a value and starts being a request.
const FONT_STACK = /^[\w\s.,'"-]{1,200}$/;
const safeFont = (v) => (typeof v === 'string' && FONT_STACK.test(v.trim()) ? v.trim() : '');

const VAR_MAP = {
  'colors.bg':     '--bb-st-bg',
  'colors.fg':     '--bb-st-fg',
  'colors.accent': '--bb-st-accent',
  'font':          '--bb-st-font',
};

// Apply brand-kit values to a DOM element via inline CSS vars.
// Pass null/empty kit to clear (removes the inline values).
export function applyBrandKit(el, kit) {
  if (!el || !el.style) return;
  // First clear any previous inline var so a removed kit doesn't stick.
  for (const cssVar of Object.values(VAR_MAP)) el.style.removeProperty(cssVar);
  if (!kit) return;

  if (kit.colors) {
    const bg = safeColor(kit.colors.bg);
    const fg = safeColor(kit.colors.fg);
    const accent = safeColor(kit.colors.accent);
    if (bg)     el.style.setProperty('--bb-st-bg', bg);
    if (fg)     el.style.setProperty('--bb-st-fg', fg);
    if (accent) el.style.setProperty('--bb-st-accent', accent);
  }
  const font = safeFont(kit.font);
  if (font) el.style.setProperty('--bb-st-font', font);
}

// Resolve cascade and apply in one shot. Convenience for the editor preview
// and the player runtime where org / playlist / slide are all accessible.
export function applyCascade(el, { org, playlist, slide } = {}) {
  applyBrandKit(el, resolveBrandKit(org, playlist?.brandKit, slide?.brandKit));
}
