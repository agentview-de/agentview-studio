import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';
import { iconSvg, ICON_IDS } from '../data/icons.js';

export default register({
  type: 'icon',
  label: 'Icon / Symbol',
  group: 'basic',
  icon: '➤',
  schemaVersion: 1,
  // Default colour is the project accent (purple) rather than pure white —
  // a white icon on a white/light slide background is invisible until the
  // user touches the colour field. Purple shows up on both the dark themes
  // (high contrast) and any light theme a user might switch to later.
  // Rotation lives on the widget container now (drag the canvas rotate handle or
  // the inspector's R field), it applies to every widget, so the icon no longer
  // carries its own. Legacy content.rotation is lifted onto widget.rotation in
  // applyWidgetMigrations (shared/slide-schema.js) so existing icons keep their angle.
  defaults: () => ({ symbol: 'arrow', color: '#8b5cf6', label: '', scale: 100 }),
  schema: () => ({
    fields: [
      { key: 'symbol', type: 'icon', label: 'Symbol' },
      { key: 'scale', type: 'number', label: 'Symbol size',
        min: 40, max: 160, step: 10, slider: true, suffix: '%',
        help: '100% fills most of the widget with a small margin. Increase to fill it edge-to-edge, decrease for a smaller symbol.' },
      { key: 'color', type: 'color', label: 'Color' },
      { key: 'label', type: 'text', label: 'Caption (optional)' },
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const id = ICON_IDS.includes(c.symbol) ? c.symbol : 'arrow';
    const root = document.createElement('div');
    root.className = 'bb-slide bb-slide-icon';
    // No padding: the glyph is sized in cqmin (the SHORTER widget side) and the
    // 96cqmin cap below already reserves a margin, so a wide/flat widget keeps a
    // big symbol instead of having its height eaten by the .bb-slide padding
    // (whose 3% is width-relative and squeezed flat widgets).
    root.style.cssText = `width:100%;height:100%;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.4em;container-type:size;background:transparent;color:${c.color ?? '#ffffff'};`;

    // scale is a percent (40–160) and the glyph is sized in cqmin (the SHORTER
    // widget side) so the symbol scales with the WIDGET box. A caption needs
    // room beneath the glyph, so a labelled icon uses a smaller base + cap; a
    // bare icon fills more aggressively. The cap stops an over-cranked slider
    // from clipping into the edges (or, with a label, over the caption).
    const sc = Math.max(0.4, Math.min(1.6, (Number(c.scale) || 100) / 100));
    const hasLabel = !!c.label;
    const glyphCqmin = hasLabel ? Math.min(82, 70 * sc) : Math.min(96, 82 * sc);
    const labelCqmin = Math.min(13, 9 * sc);

    const glyph = document.createElement('div');
    glyph.style.cssText = `width:${glyphCqmin}cqmin;height:${glyphCqmin}cqmin;display:flex;`;
    glyph.innerHTML = iconSvg(id, 'width="100%" height="100%"');
    // Give the icon-only widget an accessible name, without it the inline SVG
    // is invisible to screen readers / kiosk overlays. The caption (if any) is
    // already announced, so the glyph is decorative in that case.
    if (c.label) {
      glyph.setAttribute('aria-hidden', 'true');
    } else {
      glyph.setAttribute('role', 'img');
      glyph.setAttribute('aria-label', id);
    }
    root.appendChild(glyph);

    if (c.label) {
      const lab = document.createElement('div');
      lab.textContent = c.label;
      lab.style.cssText = `font:700 ${labelCqmin}cqmin var(--bb-st-font, Inter, sans-serif);text-align:center;line-height:1.1;`;
      root.appendChild(lab);
    }
    container.appendChild(root);
    return composeDispose(() => root.remove());
  },
});
