import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';
import { iconSvg, ICON_IDS } from '../data/icons.js';

// Inject the attention-pulse keyframes once per document. Scoped to the icon
// widget's own class so it can't collide with other widgets, and gated behind
// prefers-reduced-motion so motion-sensitive viewers never see it animate.
const PULSE_STYLE_ID = 'bb-icon-pulse-style';
function ensureIconPulseStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PULSE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PULSE_STYLE_ID;
  style.textContent =
    '@keyframes bb-icon-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.92)}}' +
    '.bb-icon-pulse{animation:bb-icon-pulse 1.6s ease-in-out infinite}' +
    '@media (prefers-reduced-motion: reduce){.bb-icon-pulse{animation:none}}';
  document.head.appendChild(style);
}

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
  defaults: () => ({
    symbol: 'arrow',
    color: '#8b5cf6',
    label: '',
    scale: 100,
    labelScale: 100,
    labelPos: 'below',
    flipH: false,
    flipV: false,
    badge: 'none',
    badgeColor: '',
    pulse: false,
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'sec_content', label: 'Content' },
      { key: 'symbol', type: 'icon', label: 'Symbol' },
      { key: 'label', type: 'text', label: 'Caption (optional)',
        placeholder: 'e.g. Exit, Meeting Room B',
        help: 'Shown beneath (or beside) the glyph. It is also announced to screen readers, and the glyph becomes decorative when a caption is present.' },

      { type: 'section', key: 'sec_appearance', label: 'Appearance' },
      { key: 'scale', type: 'number', label: 'Symbol size', tier: 'advanced',
        min: 40, max: 160, step: 10, slider: true, suffix: '%',
        help: '100% fills most of the widget with a small margin. Increase to fill it edge-to-edge, decrease for a smaller symbol.' },
      { key: 'color', type: 'color', label: 'Color', clearable: true, tier: 'advanced',
        help: 'Leave empty to follow the slide accent colour; click × to reset.' },
      { type: 'row', children: [
        { key: 'flipH', type: 'toggle', label: 'Flip horizontal', tier: 'advanced' },
        { key: 'flipV', type: 'toggle', label: 'Flip vertical', tier: 'advanced' },
      ] },
      { key: 'labelPos', type: 'select', label: 'Caption position', buttons: true, tier: 'advanced',
        showIf: c => !!c.label,
        options: [
          { value: 'below', label: 'Below' },
          { value: 'above', label: 'Above' },
          { value: 'right', label: 'Right' },
        ] },
      { key: 'labelScale', type: 'number', label: 'Caption size', tier: 'advanced',
        min: 50, max: 200, step: 10, slider: true, suffix: '%',
        showIf: c => !!c.label,
        help: 'Sizes the caption independently of the symbol so it stays legible when the glyph is small.' },
      { key: 'badge', type: 'select', label: 'Badge shape', buttons: true, tier: 'advanced',
        help: 'Paints a shape behind the glyph — a status-board / door-sign look without a separate shape widget.',
        options: [
          { value: 'none', label: 'None' },
          { value: 'circle', label: 'Circle' },
          { value: 'rounded', label: 'Rounded' },
        ] },
      { key: 'badgeColor', type: 'color', label: 'Badge color', clearable: true, tier: 'advanced',
        showIf: c => c.badge && c.badge !== 'none',
        help: 'Leave empty for the slide accent colour at low opacity.' },
      { key: 'pulse', type: 'toggle', label: 'Attention pulse', tier: 'advanced',
        help: 'Gently pulses the glyph to draw the eye (alerts, live-status dots). Respects reduced-motion settings.' },
    ],
  }),
  looks: () => [
    { id: 'big', name: 'Big', patch: { scale: 160 } },
    { id: 'badged', name: 'With badge', patch: { badge: 'circle' } },
    { id: 'pulsing', name: 'Pulsing', patch: { pulse: true } },
    { id: 'label-below', name: 'Label below', patch: { labelPos: 'below', scale: 120 } },
  ],
  render(slide, container) {
    const c = slide.content ?? {};
    const id = ICON_IDS.includes(c.symbol) ? c.symbol : 'arrow';
    const root = document.createElement('div');
    root.className = 'bb-slide bb-slide-icon';

    // Cleared colour ('') falls through to the slide accent so the icon joins
    // the brand-kit cascade like the colorOverride widgets. `||` not `??` — an
    // empty string must inherit, not paint an invalid inline colour.
    const fg = c.color || 'var(--bb-st-accent, #8b5cf6)';

    // Caption position drives the root axis: 'right' lays glyph + caption side by
    // side for wide banner widgets; 'above'/'below' keep the vertical stack.
    const pos = ['below', 'above', 'right'].includes(c.labelPos) ? c.labelPos : 'below';
    const hasLabel = !!c.label;
    const isRow = hasLabel && pos === 'right';
    // No padding: the glyph is sized in cqmin (the SHORTER widget side) and the
    // 96cqmin cap below already reserves a margin, so a wide/flat widget keeps a
    // big symbol instead of having its height eaten by the .bb-slide padding
    // (whose 3% is width-relative and squeezed flat widgets).
    root.style.cssText = `width:100%;height:100%;padding:0;display:flex;flex-direction:${isRow ? 'row' : 'column'};align-items:center;justify-content:center;gap:0.4em;container-type:size;background:transparent;color:${fg};`;

    // scale is a percent (40–160) and the glyph is sized in cqmin (the SHORTER
    // widget side) so the symbol scales with the WIDGET box. A caption needs
    // room beneath the glyph, so a labelled icon uses a smaller base + cap; a
    // bare icon fills more aggressively. The cap stops an over-cranked slider
    // from clipping into the edges (or, with a label, over the caption). The
    // side-by-side layout ('right') keeps the bigger bare-style cap because the
    // caption no longer eats vertical room.
    const sc = Math.max(0.4, Math.min(1.6, (Number(c.scale) || 100) / 100));
    const stacked = hasLabel && !isRow;
    const glyphCqmin = stacked ? Math.min(82, 70 * sc) : Math.min(96, 82 * sc);
    // Caption size is decoupled from the symbol scale: a base cqmin times an
    // independent labelScale percent (50–200) so a small glyph can still carry
    // a TV-legible caption.
    const labelSc = Math.max(0.5, Math.min(2, (Number(c.labelScale) || 100) / 100));
    const labelCqmin = Math.min(13, 9) * labelSc;

    // Badge: a shape painted behind the glyph (wraps it, never replaces it, so
    // the SVG keeps filling 100%/100%). Empty badgeColor → accent at low alpha.
    const badge = ['none', 'circle', 'rounded'].includes(c.badge) ? c.badge : 'none';
    const hasBadge = badge !== 'none';
    const badgeFill = c.badgeColor || 'color-mix(in srgb, var(--bb-st-accent, #8b5cf6) 18%, transparent)';

    const glyph = document.createElement('div');
    let glyphCss = `width:${glyphCqmin}cqmin;height:${glyphCqmin}cqmin;display:flex;align-items:center;justify-content:center;`;
    // Mirror / flip via scale transforms — the wayfinding arrow's core use.
    const sx = c.flipH ? -1 : 1;
    const sy = c.flipV ? -1 : 1;
    if (sx === -1 || sy === -1) glyphCss += `transform:scale(${sx},${sy});`;
    if (hasBadge) {
      // The glyph occupies a margin inside the badge so the shape reads as a
      // frame around it; padding is in cqmin to stay responsive.
      glyphCss += `box-sizing:border-box;padding:${(glyphCqmin * 0.18).toFixed(2)}cqmin;background:${badgeFill};border-radius:${badge === 'circle' ? '50%' : '18%'};`;
    }
    glyph.style.cssText = glyphCss;
    glyph.dataset.field = 'symbol color scale flipH flipV badge badgeColor pulse';
    if (c.pulse) {
      ensureIconPulseStyle();
      glyph.classList.add('bb-icon-pulse');
    }
    glyph.innerHTML = iconSvg(id, 'width="100%" height="100%"');
    // Give the icon-only widget an accessible name, without it the inline SVG
    // is invisible to screen readers / kiosk overlays. The caption (if any) is
    // already announced, so the glyph is decorative in that case.
    if (hasLabel) {
      glyph.setAttribute('aria-hidden', 'true');
    } else {
      glyph.setAttribute('role', 'img');
      glyph.setAttribute('aria-label', id);
    }

    let lab = null;
    if (hasLabel) {
      lab = document.createElement('div');
      lab.textContent = c.label;
      lab.dataset.field = 'label labelScale labelPos';
      lab.style.cssText = `font:700 ${labelCqmin.toFixed(2)}cqmin var(--bb-st-font, Inter, sans-serif);text-align:center;line-height:1.1;`;
    }

    // 'above' puts the caption before the glyph in DOM order; everything else
    // (including the row layout) puts the glyph first.
    if (lab && pos === 'above') {
      root.appendChild(lab);
      root.appendChild(glyph);
    } else {
      root.appendChild(glyph);
      if (lab) root.appendChild(lab);
    }

    container.appendChild(root);
    // CSS animations die with the node, so dispose() only needs to remove root.
    return composeDispose(() => root.remove());
  },
});
