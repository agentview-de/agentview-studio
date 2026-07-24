// The brand-kit colour grid (background / foreground / accent + font) — one
// markup + one reader shared by the three editors that had near-identical
// hand-rolled copies: the slide-level override (panels/inspector.js), the
// playlist-level override (main.js) and the org-level kit (views/admin/brandkit).
//
// Each caller keeps its OWN element ids via `prefix` (so several forms can live on
// one page without colliding) and its OWN behaviour — live preview, save/reset —
// while this owns only the grid and the value read-back. `hexLabels` adds the
// small <code> reflectors the playlist editor shows next to each swatch;
// `fontDefault` differs per scope (org seeds "Inter, sans-serif", the others "").

import { t } from '../i18n.js';
import { escapeHtml as esc } from '../../shared/utils/escape.js';

const SWATCHES = [
  ['bg', 'brandkit.bg', '#0f1218'],
  ['fg', 'brandkit.fg', '#f1f1f4'],
  ['accent', 'brandkit.accent', '#8b5cf6'],
];

export function brandKitGrid(kit = {}, { prefix = 'bk', fontDefault = '', hexLabels = false } = {}) {
  const c = kit.colors ?? {};
  const swatch = ([key, labelKey, def]) => {
    const val = c[key] ?? def;
    const input = `<input type="color" id="${prefix}-${key}" data-bk="${key}" value="${esc(val)}">`;
    // Only the hex-reflector variant wraps the input in .avs-bk-row, so the
    // plain callers stay byte-identical to their previous markup.
    return hexLabels
      ? `<label>${t(labelKey)} <span class="avs-bk-row">${input}<code id="${prefix}-${key}-hex">${esc(val)}</code></span></label>`
      : `<label>${t(labelKey)} ${input}</label>`;
  };
  return `<div class="avs-brandkit-grid">
    ${SWATCHES.map(swatch).join('\n    ')}
    <label>${t('brandkit.font')} <input type="text" id="${prefix}-font" data-bk="font" value="${esc(kit.font ?? fontDefault)}" placeholder="Inter, sans-serif" style="grid-column:span 2;"></label>
  </div>`;
}

// Read the grid's current values back into a { colors, font } brand-kit object.
// Finds inputs by `<prefix>-<key>` id, falling back to the [data-bk] attribute.
export function readBrandKitGrid(box, prefix = 'bk') {
  const q = key => box.querySelector(`#${prefix}-${key}`) ?? box.querySelector(`[data-bk="${key}"]`);
  return {
    colors: { bg: q('bg').value, fg: q('fg').value, accent: q('accent').value },
    font: q('font').value.trim(),
  };
}
