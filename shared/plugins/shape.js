import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';
import { colorOverrideFields, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { textScaleField } from '../text-scale.js';
import { readableOn } from '../background.js';
import { escapeHtml } from '../utils/escape.js';
import { SHAPES, shapeDef, resolveShape, isLineShape } from '../data/shapes.js';

// Vector shape — rectangle, ellipse, arrow, star, callout, divider line. The
// primitive a slide editor is expected to have and the one this app was missing:
// without it, every box, badge, divider and callout had to be faked with an
// icon badge or an image.
//
// Sizing model: everything that must scale with the widget is expressed in
// container-query units (`cqmin` = 1% of the widget's SHORTER side), so a shape
// looks identical on a 1080p panel and a 4K wall. Never px — see the note in
// shared/text-scale.js for why an em/px size pins a widget to one resolution.
//
// Stroke fidelity: SVG shapes stretch with `preserveAspectRatio="none"` (that is
// what PowerPoint does to an autoshape), but the outline uses
// `vector-effect: non-scaling-stroke` so it keeps an even width instead of
// smearing into a wedge on a squashed box.

// Gradient/filter ids must be unique per mounted instance: two shape widgets on
// one slide would otherwise share a <defs> id and the second would silently
// adopt the first one's gradient.
let uid = 0;

const SHADOWS = {
  none:   null,
  soft:   { css: '0 1.4cqmin 3.4cqmin rgba(0,0,0,.28)', svg: '0 1.4cqmin 3.4cqmin rgba(0,0,0,.28)' },
  strong: { css: '0 3cqmin 7cqmin rgba(0,0,0,.45)',     svg: '0 3cqmin 7cqmin rgba(0,0,0,.45)' },
  glow:   { css: '0 0 5cqmin var(--bb-shape-fill)',      svg: '0 0 5cqmin var(--bb-shape-fill)' },
};

const clampNum = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

// The paint used for the shape body. Empty fill inherits the slide accent so a
// shape joins the theme / brand-kit cascade like every other widget (`||`, not
// `??`: an empty string must fall through, not paint an invalid colour).
export function fillPaint(c) {
  const base = c.fill || 'var(--bb-st-accent, #8b5cf6)';
  if (!c.gradient) return base;
  const end = c.fill2 || 'transparent';
  const angle = clampNum(c.gradientAngle, 0, 360, 135);
  return { base, end, angle };
}

// Dash pattern in cqmin, sized off the outline width so a thin dashed border
// gets short dashes and a heavy one gets long ones (a fixed pattern reads as
// dotted at 4cqmin and as a solid line at 0.3cqmin).
function dashFor(style, w) {
  if (style === 'dashed') return `${(w * 3).toFixed(2)}cqmin ${(w * 2).toFixed(2)}cqmin`;
  if (style === 'dotted') return `${(w * 0.01).toFixed(2)}cqmin ${(w * 2).toFixed(2)}cqmin`;
  return null;
}

// Arrow heads, for the two lines whose ends are AXIS-ALIGNED.
//
// Only those two: an arrow head has to point along the line as DRAWN, and a
// diagonal's on-screen angle depends on the widget's aspect ratio — a 45° head
// on a 3:1 box points somewhere the line does not go, and the true angle is
// unknowable without measuring the laid-out box on every resize. The diagonals
// and the elbow therefore carry no arrow toggles at all (see the `showIf`s in
// the schema) rather than an arrow that is subtly wrong. A diagonal arrow is
// what the filled `arrow-right` shape plus the widget's own rotation is for.
//
// Each end is a CSS anchor + a rotation. The head element is SQUARE and sized in
// cqmin, so rotating it about its own centre cannot move it off the endpoint.
const LINE_ARROWS = {
  'line-h': {
    start: { pos: 'left:0;top:50%;', tf: 'translateY(-50%) rotate(180deg)' },
    end:   { pos: 'right:0;top:50%;', tf: 'translateY(-50%)' },
  },
  'line-v': {
    start: { pos: 'top:0;left:50%;', tf: 'translateX(-50%) rotate(-90deg)' },
    end:   { pos: 'bottom:0;left:50%;', tf: 'translateX(-50%) rotate(90deg)' },
  },
};

// Which shapes offer the arrow toggles at all — see the note above.
const hasArrows = (id) => Object.prototype.hasOwnProperty.call(LINE_ARROWS, resolveShape(id));

function arrowHead(end, sizeCqmin) {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;${end.pos}width:${sizeCqmin}cqmin;height:${sizeCqmin}cqmin;`
    + `transform:${end.tf};pointer-events:none;`;
  el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="100%" height="100%"'
    + ' aria-hidden="true"><path d="M1,1L9,5L1,9Z" fill="currentColor"/></svg>';
  return el;
}

export default register({
  type: 'shape',
  label: 'Shape',
  group: 'basic',
  icon: '◆',
  schemaVersion: 1,
  // Defaults are deliberately quiet: a soft rounded rectangle in the slide
  // accent, no outline, no text. Dropping one gives you a usable card
  // background immediately, and it still reads correctly at quarter-tile size.
  //
  // No `theme` key, deliberately — same as icon / image / video. A widget theme
  // paints an OPAQUE background box behind the widget (shared/background.js
  // applyWidgetBg), which is exactly wrong for a decorative primitive: a shape
  // has to float over the slide, not sit on a card of its own. The colour
  // overrides below still let one shape depart from the slide's accent.
  defaults: () => ({
    ...colorOverrideDefaults(),
    shape: 'rounded',
    fill: '', fillOpacity: 100,
    gradient: false, fill2: '', gradientAngle: 135,
    stroke: '', strokeWidth: 0, strokeStyle: 'solid',
    radius: 12,
    shadow: 'none',
    arrowStart: false, arrowEnd: true,
    text: '', textAlign: 'center', textVAlign: 'middle',
    textScale: 100, textBold: true,
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'sec_content', label: 'Content' },
      { key: 'shape', type: 'shape', label: 'Shape' },
      { key: 'text', type: 'text', label: 'Label (optional)',
        placeholder: 'e.g. 50 % off, Step 1, Exit →',
        help: 'Centred inside the shape. Leave empty for a plain graphic — the shape is then decorative and hidden from screen readers.' },

      { type: 'section', key: 'sec_fill', label: 'Fill & outline' },
      { key: 'fill', type: 'color', label: 'Fill', clearable: true,
        showIf: c => !isLineShape(c.shape),
        help: 'Leave empty to follow the slide accent colour; click × to reset.' },
      { key: 'gradient', type: 'toggle', label: 'Gradient fill',
        showIf: c => !isLineShape(c.shape) },
      { key: 'fill2', type: 'color', label: 'Gradient end', clearable: true,
        showIf: c => !isLineShape(c.shape) && !!c.gradient,
        help: 'Empty fades the fill out to transparent.' },
      { key: 'gradientAngle', type: 'number', label: 'Gradient angle',
        min: 0, max: 360, step: 15, slider: true, suffix: '°',
        showIf: c => !isLineShape(c.shape) && !!c.gradient },
      { key: 'fillOpacity', type: 'number', label: 'Fill opacity',
        min: 0, max: 100, step: 5, slider: true, suffix: '%',
        showIf: c => !isLineShape(c.shape),
        help: 'Below 100 % the slide background shows through — the usual way to lay a tint over a photo.' },
      { key: 'stroke', type: 'color', label: 'Outline colour', clearable: true,
        help: 'Empty follows the slide text colour. An outline only appears once its width is above 0.' },
      { key: 'strokeWidth', type: 'number', label: 'Outline width',
        min: 0, max: 8, step: 0.25, slider: true, suffix: '%',
        help: 'Percent of the shape’s shorter side, so the outline keeps its weight on any screen size.' },
      { key: 'strokeStyle', type: 'select', label: 'Outline style', buttons: true,
        showIf: c => clampNum(c.strokeWidth, 0, 8, 0) > 0,
        options: [
          { value: 'solid', label: 'Solid' },
          { value: 'dashed', label: 'Dashed' },
          { value: 'dotted', label: 'Dotted' },
        ] },
      { key: 'radius', type: 'number', label: 'Corner radius',
        min: 0, max: 50, step: 1, slider: true, suffix: '%',
        showIf: c => !!shapeDef(c.shape).radius },
      { key: 'shadow', type: 'select', label: 'Shadow', buttons: true, tier: 'advanced',
        options: [
          { value: 'none', label: 'None' },
          { value: 'soft', label: 'Soft' },
          { value: 'strong', label: 'Strong' },
          { value: 'glow', label: 'Glow' },
        ] },
      { type: 'row', children: [
        { key: 'arrowStart', type: 'toggle', label: 'Arrow at start', showIf: c => hasArrows(c.shape) },
        { key: 'arrowEnd', type: 'toggle', label: 'Arrow at end', showIf: c => hasArrows(c.shape) },
      ] },

      { type: 'section', key: 'sec_layout', label: 'Layout' },
      { key: 'textAlign', type: 'align', label: 'Label alignment', showIf: c => !!c.text },
      { key: 'textVAlign', type: 'align', vertical: true, label: 'Label position', showIf: c => !!c.text },
      { ...textScaleField('Label size'), showIf: c => !!c.text },
      { key: 'textBold', type: 'toggle', label: 'Bold label', showIf: c => !!c.text },

      ...colorOverrideFields(),
    ],
  }),
  looks: () => [
    { id: 'accent-card', name: 'Accent card', patch: { shape: 'rounded', radius: 8, fillOpacity: 100, shadow: 'soft' } },
    { id: 'tint', name: 'Photo tint', patch: { shape: 'rect', fillOpacity: 45, radius: 0, shadow: 'none' } },
    { id: 'outline', name: 'Outline only', patch: { shape: 'rounded', fillOpacity: 0, strokeWidth: 1, strokeStyle: 'solid' } },
    { id: 'badge', name: 'Number badge', patch: { shape: 'ellipse', text: '1', textBold: true, textScale: 180, shadow: 'soft' } },
    { id: 'divider', name: 'Divider', patch: { shape: 'line-h', strokeWidth: 0.8, strokeStyle: 'solid', arrowEnd: false } },
    { id: 'next', name: 'Next step', patch: { shape: 'arrow-right', gradient: true, shadow: 'soft' } },
    { id: 'sale', name: 'Sale burst', patch: { shape: 'burst-16', text: '-50%', textBold: true, textScale: 130 } },
    { id: 'quote-bubble', name: 'Speech bubble', patch: { shape: 'callout-rect', fillOpacity: 100, text: 'Hello!' } },
  ],
  render(slide, container) {
    const c = slide.content ?? {};
    const id = resolveShape(c.shape);
    const def = SHAPES[id];
    const n = ++uid;

    const root = document.createElement('div');
    root.className = 'bb-slide bb-slide-shape';
    // container-type:size is what makes every cqmin below resolve against THIS
    // widget. padding:0 — a shape fills its rect edge to edge; the .bb-slide
    // default padding would inset it by a few percent for no reason.
    root.style.cssText = 'width:100%;height:100%;padding:0;position:relative;background:transparent;container-type:size;';
    applyColorOverrides(root, c);

    const paint = fillPaint(c);
    const solidFill = typeof paint === 'string' ? paint : paint.base;
    const opacity = clampNum(c.fillOpacity, 0, 100, 100) / 100;
    const sw = clampNum(c.strokeWidth, 0, 8, 0);
    const strokeCol = c.stroke || 'var(--bb-st-fg, #fff)';
    const dash = dashFor(c.strokeStyle, sw);
    const shadow = SHADOWS[c.shadow] ?? null;
    // The glow shadow tints itself with the fill, so the fill has to be readable
    // as a CSS variable rather than only living inside an SVG attribute.
    root.style.setProperty('--bb-shape-fill', solidFill);

    const line = def.kind === 'line';
    const body = document.createElement('div');
    body.dataset.field = 'shape fill fill2 gradient gradientAngle fillOpacity stroke strokeWidth strokeStyle radius shadow arrowStart arrowEnd';
    body.style.cssText = 'position:absolute;inset:0;';

    if (def.kind === 'css') {
      // Rectangle / ellipse / pill get the exact CSS path: a percentage
      // border-radius stays a true rounded corner at any aspect ratio, and a
      // CSS border never distorts — neither is true of an SVG rx/stroke under
      // a non-uniform stretch.
      // The corner is a property of the SHAPE, not of the content, for every
      // entry except `rounded` — see the note in shared/data/shapes.js. Only
      // that one reads the slider, so picking "Rectangle" gives sharp corners
      // even though the content still carries a radius from a previous pick.
      const r = def.pill ? '50cqmin'
        : (def.ellipse ? 50
          : def.radius ? clampNum(c.radius, 0, 50, def.defaultRadius ?? 0)
          : (def.fixedRadius ?? 0)) + '%';
      const bg = typeof paint === 'string'
        ? paint
        : `linear-gradient(${paint.angle}deg, ${paint.base}, ${paint.end})`;
      let css = `position:absolute;inset:0;box-sizing:border-box;border-radius:${r};`;
      // Opacity lives on a dedicated fill layer, not on the element: putting it
      // on the box would fade the outline and the label with it.
      css += `background:${bg};opacity:${opacity};`;
      const fillLayer = document.createElement('div');
      fillLayer.style.cssText = css;
      body.appendChild(fillLayer);
      if (sw > 0) {
        const ring = document.createElement('div');
        ring.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border-radius:${r};`
          + `border:${sw}cqmin ${c.strokeStyle === 'dashed' ? 'dashed' : c.strokeStyle === 'dotted' ? 'dotted' : 'solid'} ${strokeCol};pointer-events:none;`;
        body.appendChild(ring);
      }
      if (shadow) body.style.filter = `drop-shadow(${shadow.css})`;
    } else {
      // Everything else is an SVG path. `stretch:false` shapes (stars, heart,
      // cloud) would read as broken when squashed, so they scale uniformly.
      const par = def.stretch === false ? 'xMidYMid meet' : 'none';
      const gradId = `bb-shape-g${n}`;
      const useGrad = !line && !!c.gradient;
      const fillAttr = line ? 'none' : (useGrad ? `url(#${gradId})` : solidFill);
      const rule = def.fillRule ? ` fill-rule="${def.fillRule}"` : '';

      let defs = '';
      if (useGrad) {
        // objectBoundingBox gradient expressed as an angle: convert to the
        // x1/y1→x2/y2 unit vector SVG wants (CSS 0° points up, SVG y grows down).
        const a = ((clampNum(c.gradientAngle, 0, 360, 135) - 90) * Math.PI) / 180;
        const dx = Math.cos(a) / 2, dy = Math.sin(a) / 2;
        defs = `<defs><linearGradient id="${gradId}" x1="${0.5 - dx}" y1="${0.5 - dy}" x2="${0.5 + dx}" y2="${0.5 + dy}">`
          + `<stop offset="0" stop-color="${escapeHtml(paint.base)}"/>`
          + `<stop offset="1" stop-color="${escapeHtml(paint.end)}"/></linearGradient></defs>`;
      }

      // A line with no explicit width would render invisibly; give it the
      // weight a divider actually needs instead of nothing at all.
      const effW = line && sw === 0 ? 0.6 : sw;
      const strokeCss = effW > 0
        ? `stroke:${strokeCol};stroke-width:${effW}cqmin;stroke-linejoin:round;stroke-linecap:${line ? 'round' : 'butt'};`
          + (dash ? `stroke-dasharray:${dash};stroke-linecap:${c.strokeStyle === 'dotted' ? 'round' : 'butt'};` : '')
        : 'stroke:none;';

      // `color` on the wrapper drives both the stroke's currentColor uses and
      // the arrow heads, which are siblings of the <svg>, not children.
      body.style.color = strokeCol;
      const svg = document.createElement('div');
      svg.style.cssText = 'position:absolute;inset:0;'
        + (shadow ? `filter:drop-shadow(${shadow.svg});` : '');
      svg.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="${par}"`
        + ` width="100%" height="100%" style="display:block;overflow:visible;${strokeCss}vector-effect:non-scaling-stroke;">`
        + defs
        // fill-opacity, NOT opacity on the wrapper: a wrapper opacity fades the
        // OUTLINE with the fill, so the "outline only" look (fill opacity 0 +
        // an outline) rendered as an empty box.
        + `<path d="${def.d}" fill="${escapeHtml(fillAttr)}"${line ? '' : ` fill-opacity="${opacity}"`}${rule} vector-effect="non-scaling-stroke"/>`
        + `</svg>`;
      body.appendChild(svg);

      // Arrow heads sit OUTSIDE the stretched SVG, as square CSS-positioned
      // elements — inside it they would be squashed by the same non-uniform
      // scale that (correctly) stretches the line itself.
      const ends = LINE_ARROWS[id];
      if (line && ends) {
        const size = (6 + effW * 2).toFixed(2);
        if (c.arrowStart) body.appendChild(arrowHead(ends.start, size));
        if (c.arrowEnd) body.appendChild(arrowHead(ends.end, size));
      }
    }

    root.appendChild(body);

    // Optional label. Callout shapes carry a textBox so the caption sits in the
    // bubble rather than straddling the tail.
    let needsAutoInk = false;
    let labelEl = null;
    if (c.text) {
      const box = def.textBox ?? { x: 6, y: 6, w: 88, h: 88 };
      const lab = document.createElement('div');
      lab.dataset.field = 'text textAlign textVAlign textScale textBold';
      const align = ['left', 'center', 'right'].includes(c.textAlign) ? c.textAlign : 'center';
      const valign = ['top', 'middle', 'bottom'].includes(c.textVAlign) ? c.textVAlign : 'middle';
      const justify = valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center';
      const items = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
      const sc = clampNum(c.textScale, 80, 400, 100) / 100;
      lab.style.cssText = `position:absolute;left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}%;`
        + `display:flex;flex-direction:column;justify-content:${justify};align-items:${items};`
        + `text-align:${align};pointer-events:none;`
        + `font-weight:${c.textBold === false ? 400 : 700};`
        + `font-size:${(13 * sc).toFixed(2)}cqmin;`
        + 'font-family:var(--bb-st-font, Inter, sans-serif);'
        + 'line-height:1.15;overflow:hidden;overflow-wrap:anywhere;';
      lab.textContent = c.text;
      // The label colour defaults to whatever is readable ON the fill rather
      // than to a hardcoded white — a dark label on a pale shape is the single
      // most common way a shape widget ends up unreadable. An explicit
      // textColor override (applyColorOverrides, above) still wins, and an
      // empty fill means the paint is the THEME accent, which is only knowable
      // once the node is in the document — hence the deferred read below.
      if (c.textColor) lab.style.color = 'var(--bb-st-fg)';
      else lab.style.color = readableOn(solidFill) ?? 'var(--bb-st-fg, #fff)';
      root.appendChild(lab);
      labelEl = lab;
      needsAutoInk = !c.textColor && !c.fill;
    } else {
      // A shape with no label carries no information; announcing "graphic" on
      // every divider line is noise for a screen reader.
      root.setAttribute('aria-hidden', 'true');
    }

    container.appendChild(root);

    // Empty fill = "paint me in the theme accent", and the accent is a CSS
    // variable: its actual colour is only knowable once the node is in the
    // document and the theme/brand-kit cascade has resolved. Read it here and
    // pick the readable ink, so a label on an accent-filled shape is legible on
    // a pale brand colour as well as a dark one.
    if (needsAutoInk && labelEl) {
      try {
        const accent = getComputedStyle(root).getPropertyValue('--bb-st-accent').trim();
        const ink = readableOn(accent);
        if (ink) labelEl.style.color = ink;
      } catch { /* no layout engine (headless test run) — keep the static ink */ }
    }

    // No timers, no listeners, no network — the node IS the whole widget.
    return composeDispose(() => root.remove());
  },
});
