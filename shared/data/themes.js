// Visual swatch data for the theme picker — mirrors --bb-st-bg / --bb-st-accent
// from styles/slide-themes.css. Used by the admin `theme` field control.

export const THEME_SWATCHES = {
  'minimal-dark':     { bg: '#0a0a10', accent: '#06b6d4' },
  'dark-minimal':     { bg: '#09090b', accent: '#8b5cf6' },
  'gradient-purple':  { bg: 'radial-gradient(circle at 30% 20%, #4c1d95 0%, #1e0c4d 60%, #0a0220 100%)', accent: '#c4b5fd' },
  'gradient-blue':    { bg: 'radial-gradient(circle at 20% 30%, #1e3a8a 0%, #0c1b48 60%, #02061c 100%)', accent: '#93c5fd' },
  'gradient-orange':  { bg: 'radial-gradient(circle at 25% 25%, #7c2d12 0%, #261004 60%, #0d0500 100%)', accent: '#fdba74' },
  'bistro-warm':      { bg: 'linear-gradient(135deg, #2d1810, #4a1f0e 50%, #1c0d08 100%)', accent: '#f59e0b' },
  'corporate-blue':   { bg: 'linear-gradient(135deg, #0c1b48, #142b6e 50%, #0a173f 100%)', accent: '#38bdf8' },
  'medical-calm':     { bg: 'linear-gradient(135deg, #0f2a2a, #14373a 50%, #07191c 100%)', accent: '#5eead4' },
  'industrial-steel': { bg: 'linear-gradient(135deg, #1b1b22, #2c2c36 50%, #11111a 100%)', accent: '#fbbf24' },
  'neon-cyber':       { bg: 'radial-gradient(circle at 30% 20%, #2a005f 0%, #1a0040 35%, #02041a 100%)', accent: '#f0abfc' },
  'editorial-mono':   { bg: '#f4f3ef', accent: '#b91c1c' },
  // Audience themes rather than venue themes — see slide-themes.css.
  'playful-bright':   { bg: 'linear-gradient(150deg, #d3ecfd 0%, #e9f7d6 48%, #ffe7b3 100%)', accent: '#9a3412' },
  'clarity-light':    { bg: '#f6f5f1', accent: '#0b4f86' },
};

// All theme ids in display order.
export const ALL_THEMES = Object.keys(THEME_SWATCHES);

// "gradient-purple" → "Gradient Purple"
export function themeLabel(id) {
  return String(id ?? '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Schema-field factory for the theme picker — spread into a plugin's
// schema().fields. EVERY theme-capable widget uses this one definition so the
// picker offers the SAME full set of themes everywhere: a user who picks a
// theme on one widget always finds it on every other widget. Deliberately omits
// `options` — the theme field control (admin/ui/field-controls/theme.js) falls
// back to ALL_THEMES, keeping the single source of truth for "which themes
// exist" right here. A widget's own default still comes from its defaults().theme.
// Pass a custom label where a widget wants more than the bare "Theme".
export function themeField(label = 'Theme') {
  return { key: 'theme', type: 'theme', label };
}
