// Brand-Kit → CSS variable injection.
//
// The existing themes (styles/slide-themes.css) already drive every plugin's
// look via `--bb-st-bg`, `--bb-st-fg`, `--bb-st-accent`, `--bb-st-font`.
// Brand-Kit just provides custom values for these vars. The cascade
// (Org → Playlist → Slide) is resolved upstream via resolveBrandKit() in
// shared/slide-schema.js; this module only KNOWS HOW to push the result onto
// a DOM element.

import { resolveBrandKit } from './slide-schema.js';

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
    if (kit.colors.bg)     el.style.setProperty('--bb-st-bg', kit.colors.bg);
    if (kit.colors.fg)     el.style.setProperty('--bb-st-fg', kit.colors.fg);
    if (kit.colors.accent) el.style.setProperty('--bb-st-accent', kit.colors.accent);
  }
  if (kit.font) {
    el.style.setProperty('--bb-st-font', kit.font);
  }
}

// Resolve cascade and apply in one shot. Convenience for the editor preview
// and the player runtime where org / playlist / slide are all accessible.
export function applyCascade(el, { org, playlist, slide } = {}) {
  applyBrandKit(el, resolveBrandKit(org, playlist?.brandKit, slide?.brandKit));
}
