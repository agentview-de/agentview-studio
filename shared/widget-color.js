// Per-widget colour overrides — the "flexible escape hatch" on top of the
// theme + brand-kit cascade. One Text-colour knob + one Accent-colour knob,
// both optional, shared by every text widget so the control is identical
// everywhere instead of a bespoke scheme per plugin.
//
// The colour model has four layers (least → most specific):
//   1. Theme preset  — the `bb-theme-<id>` class sets a coherent (bg, fg, accent)
//                      TRIPLE, so a widget is readable on its own background out of
//                      the box (see the note in styles/slide-themes.css for why fg
//                      is pinned per theme rather than inherited from slide-contrast).
//   2. Brand-Kit     — Org → Playlist → Slide, sets --bb-st-fg/-accent/-bg on the
//                      slide root (shared/brand-kit-apply.js). Inherits into any
//                      widget that doesn't pin its own value.
//   3. Widget theme  — a widget may carry its own `bb-theme-<id>` for bg/accent.
//   4. Widget override (THIS module) — an INLINE --bb-st-fg / --bb-st-accent on
//                      the widget root. Inline beats every class and the inherited
//                      brand-kit value, so it recolours THIS widget only.
//
// Empty value = inherit (the comfortable default: pick a theme and you're done).
// A set value = a free colour for this one widget (the flexible exception).
//
// Deliberately NOT provided: per-element colour pickers (heading vs label vs
// value vs caption). That is "flexible but not comfortable" — a picker flood.
// Element-level colour stays in the rich-text widgets (text / quote) where the
// WYSIWYG already colours individual spans inline.

import { themeField } from './data/themes.js';

const FG = '--bb-st-fg';
const ACCENT = '--bb-st-accent';

// Spread into a plugin's defaults() so the stored content shape is explicit.
// Returns a fresh object each call (no shared mutable state across slides).
export function colorOverrideDefaults() {
  return { textColor: '', accentColor: '' };
}

// The two clearable colour controls themselves — shared by both section
// factories below so label/help wording can never drift between them.
function colorFields() {
  return [
    { key: 'textColor', type: 'color', label: 'Text colour', clearable: true,
      help: 'Overrides the theme’s text colour for this widget only. Leave empty to follow the theme / brand kit; click × to reset.' },
    { key: 'accentColor', type: 'color', label: 'Accent colour', clearable: true,
      help: 'Overrides the theme’s accent (headings, highlights, dividers) for this widget only.' },
  ];
}

// Spread into a plugin's schema().fields — emits a "Colours" section header and
// two clearable colour controls. Place it LAST (after the theme field) so the
// styling controls sit together at the bottom of the inspector. The section
// starts collapsed: it sits at the end of every inspector and is rarely
// touched, so folding it by default cuts noise across all widgets (the user's
// own collapse state still persists per widget type). For THEMED widgets
// prefer themeColorSection() below, which folds the theme picker in too.
export function colorOverrideFields() {
  return [
    { type: 'section', key: 'colours', label: 'Colours', collapsed: true },
    ...colorFields(),
  ];
}

// Spread into a THEMED plugin's schema().fields — ONE collapsed
// 'Theme & colours' section containing the theme picker plus the two colour
// overrides. Replaces the bare `themeField(), ...colorOverrideFields()` pair:
// that combo either left the theme picker stranded inside whatever section
// came before it, or produced two separate end-of-form folds. Place it LAST;
// like colorOverrideFields() it is terminal — any field emitted after it
// would be swallowed into the fold. Pass a custom theme label where a widget
// wants more than the bare 'Theme'.
export function themeColorSection(themeLabel) {
  return [
    { type: 'section', key: 'themecolors', label: 'Theme & colours', collapsed: true },
    themeField(themeLabel),
    ...colorFields(),
  ];
}

// Apply (or clear) the overrides on a freshly-created widget root. Call right
// after `const root = document.createElement('div')`. Idempotent: an empty value
// REMOVES the inline var so a cleared override falls back to the theme again.
export function applyColorOverrides(el, content) {
  if (!el || !el.style) return;
  const c = content ?? {};
  const fg = typeof c.textColor === 'string' ? c.textColor.trim() : '';
  const ac = typeof c.accentColor === 'string' ? c.accentColor.trim() : '';
  if (fg) el.style.setProperty(FG, fg); else el.style.removeProperty(FG);
  if (ac) el.style.setProperty(ACCENT, ac); else el.style.removeProperty(ACCENT);
}
