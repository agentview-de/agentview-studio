// Vector geometry catalog for the `shape` widget — the primitive every slide
// editor is expected to have (rectangle, ellipse, arrow, star, callout, line).
//
// Coordinate system: every entry is authored in a 100×100 box and rendered with
// `preserveAspectRatio="none"`, so the geometry STRETCHES with the widget rect
// the way PowerPoint stretches an autoshape. Strokes are drawn with
// `vector-effect="non-scaling-stroke"` so the outline keeps an even width even
// when the box is squashed — the one thing a naive stretch gets visibly wrong.
//
// Two families:
//   kind: 'css'    — rectangle / ellipse. Rendered as a plain div with
//                    border-radius + border. A CSS border never distorts and a
//                    percentage border-radius stays a true rounded corner at any
//                    aspect ratio, which an SVG `rx` does not. These are the two
//                    most-used shapes, so they get the exact path.
//   kind: 'path'   — everything else: an SVG `d` string in the 100×100 box.
//   kind: 'line'   — an open stroke; fill is meaningless, arrow heads apply.
//
// `radius: true` marks a shape whose corner-radius control is meaningful.
// `stretch: false` (stars/heart/cloud) keeps the geometry UNIFORM: those read as
// broken when squashed, so they scale with `xMidYMid meet` instead. Everything
// else stretches.

// Regular polygon inscribed in the 100×100 box, first vertex at 12 o'clock.
function poly(n, rot = -90, r = 50) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((rot + (i * 360) / n) * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

// Star: `n` outer points at radius 50 alternating with `n` inner points.
function star(n, inner) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((-90 + (i * 180) / n) * Math.PI) / 180;
    const r = i % 2 === 0 ? 50 : inner;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const P = (pts) => `M${pts}Z`;

export const SHAPES = Object.freeze({
  // ---- Basic ----
  // Three separate entries rather than one rectangle with a radius slider, for
  // the same reason PowerPoint ships both: the corner is what you PICK. A
  // single entry means `rect` and `rounded` render identically until you go
  // hunting for the slider, and the picker stops telling you what you'll get.
  // Only `rounded` exposes the slider; the other two pin their corner.
  rect:      { group: 'basic', label: 'Rectangle',       kind: 'css', fixedRadius: 0 },
  rounded:   { group: 'basic', label: 'Rounded rectangle', kind: 'css', radius: true, defaultRadius: 12 },
  // A pill is a STADIUM, not an ellipse: the corner radius has to be half the
  // SHORTER side, which a percentage cannot express (50%/50% eats the long side
  // too and rounds the box into an oval). `pill: true` switches the renderer to
  // `50cqmin`, which is exactly that half-of-the-shorter-side.
  pill:      { group: 'basic', label: 'Pill',            kind: 'css', pill: true },
  ellipse:   { group: 'basic', label: 'Ellipse',         kind: 'css', ellipse: true },
  triangle:  { group: 'basic', label: 'Triangle',        kind: 'path', d: P('50,0L100,100L0,100') },
  rtriangle: { group: 'basic', label: 'Right triangle',  kind: 'path', d: P('0,0L0,100L100,100') },
  diamond:   { group: 'basic', label: 'Diamond',         kind: 'path', d: P('50,0L100,50L50,100L0,50') },
  parallelogram: { group: 'basic', label: 'Parallelogram', kind: 'path', d: P('25,0L100,0L75,100L0,100') },
  trapezoid: { group: 'basic', label: 'Trapezoid',       kind: 'path', d: P('25,0L75,0L100,100L0,100') },
  pentagon:  { group: 'basic', label: 'Pentagon',        kind: 'path', d: poly(5) },
  hexagon:   { group: 'basic', label: 'Hexagon',         kind: 'path', d: P('25,0L75,0L100,50L75,100L25,100L0,50') },
  octagon:   { group: 'basic', label: 'Octagon',         kind: 'path', d: P('30,0L70,0L100,30L100,70L70,100L30,100L0,70L0,30') },
  cross:     { group: 'basic', label: 'Cross',           kind: 'path', d: P('35,0L65,0L65,35L100,35L100,65L65,65L65,100L35,100L35,65L0,65L0,35L35,35') },
  frame:     { group: 'basic', label: 'Frame',           kind: 'path',
    // Even-odd hole: an outline band, the "put a border around this area" shape.
    d: 'M0,0H100V100H0Z M12,12V88H88V12Z', fillRule: 'evenodd' },

  // ---- Arrows ----
  'arrow-right': { group: 'arrow', label: 'Arrow right', kind: 'path', d: P('0,30L60,30L60,0L100,50L60,100L60,70L0,70') },
  'arrow-left':  { group: 'arrow', label: 'Arrow left',  kind: 'path', d: P('100,30L40,30L40,0L0,50L40,100L40,70L100,70') },
  'arrow-up':    { group: 'arrow', label: 'Arrow up',    kind: 'path', d: P('30,100L30,40L0,40L50,0L100,40L70,40L70,100') },
  'arrow-down':  { group: 'arrow', label: 'Arrow down',  kind: 'path', d: P('30,0L30,60L0,60L50,100L100,60L70,60L70,0') },
  'arrow-both':  { group: 'arrow', label: 'Double arrow', kind: 'path', d: P('0,50L30,0L30,25L70,25L70,0L100,50L70,100L70,75L30,75L30,100') },
  chevron:       { group: 'arrow', label: 'Chevron',     kind: 'path', d: P('0,0L65,0L100,50L65,100L0,100L35,50') },
  'home-plate':  { group: 'arrow', label: 'Pentagon arrow', kind: 'path', d: P('0,0L65,0L100,50L65,100L0,100') },

  // ---- Stars & symbols ----
  'star-4':  { group: 'star', label: '4-point star',  kind: 'path', stretch: false, d: star(4, 19) },
  'star-5':  { group: 'star', label: '5-point star',  kind: 'path', stretch: false, d: star(5, 20.6) },
  'star-6':  { group: 'star', label: '6-point star',  kind: 'path', stretch: false, d: star(6, 28.87) },
  'burst-8': { group: 'star', label: 'Starburst',     kind: 'path', stretch: false, d: star(8, 30) },
  'burst-16': { group: 'star', label: 'Explosion',    kind: 'path', stretch: false, d: star(16, 36) },
  heart:     { group: 'star', label: 'Heart',         kind: 'path', stretch: false,
    d: 'M50,100C10,72,0,45,0,28C0,10,14,0,28,0C38,0,46,6,50,14C54,6,62,0,72,0C86,0,100,10,100,28C100,45,90,72,50,100Z' },
  shield:    { group: 'star', label: 'Shield',        kind: 'path', stretch: false,
    d: 'M50,0L100,15V55C100,80,78,95,50,100C22,95,0,80,0,55V15Z' },
  cloud:     { group: 'star', label: 'Cloud',         kind: 'path', stretch: false,
    d: 'M25,100C10,100,0,89,0,76C0,64,9,54,21,53C22,36,36,23,53,23C68,23,81,33,85,47C94,49,100,57,100,67C100,85,87,100,71,100Z' },
  bolt:      { group: 'star', label: 'Lightning',     kind: 'path', stretch: false,
    d: 'M60,0L10,58H42L35,100L90,40H55Z' },

  // ---- Callouts & banners ----
  'callout-rect':  { group: 'callout', label: 'Speech bubble', kind: 'path',
    d: 'M8,0H92A8,8,0,0,1,100,8V70A8,8,0,0,1,92,78H46L26,100L31,78H8A8,8,0,0,1,0,70V8A8,8,0,0,1,8,0Z',
    textBox: { x: 6, y: 5, w: 88, h: 66 } },
  'callout-oval':  { group: 'callout', label: 'Thought bubble', kind: 'path', stretch: false,
    d: 'M50,0A50,38,0,1,1,50,76A50,38,0,0,1,50,0Z M24,78A7,7,0,1,1,24,92A7,7,0,0,1,24,78Z M12,90A5,5,0,1,1,12,100A5,5,0,0,1,12,90Z',
    textBox: { x: 12, y: 8, w: 76, h: 60 } },
  ribbon:    { group: 'callout', label: 'Ribbon',      kind: 'path', d: P('0,0L100,0L100,100L50,74L0,100'),
    textBox: { x: 8, y: 6, w: 84, h: 60 } },
  banner:    { group: 'callout', label: 'Banner',      kind: 'path', d: P('0,0L100,0L88,50L100,100L0,100L12,50') },
  // Concave corners — the award/menu-card frame. Each corner curves INWARD, so
  // the quadratic control point sits at the inside corner (80,20), not at the
  // box corner (which is what makes a rounded rectangle).
  plaque:    { group: 'callout', label: 'Plaque',      kind: 'path',
    d: 'M20,0H80Q80,20,100,20V80Q80,80,80,100H20Q20,80,0,80V20Q20,20,20,0Z' },

  // ---- Lines ----
  'line-h':  { group: 'line', label: 'Line',            kind: 'line', d: 'M0,50H100' },
  'line-v':  { group: 'line', label: 'Vertical line',   kind: 'line', d: 'M50,0V100' },
  'line-d':  { group: 'line', label: 'Diagonal ↘',      kind: 'line', d: 'M0,0L100,100' },
  'line-u':  { group: 'line', label: 'Diagonal ↗',      kind: 'line', d: 'M0,100L100,0' },
  'line-elbow': { group: 'line', label: 'Elbow connector', kind: 'line', d: 'M0,0H50V100H100' },
});

export const SHAPE_IDS = Object.freeze(Object.keys(SHAPES));

export const SHAPE_GROUPS = Object.freeze([
  { id: 'basic',   label: 'Basic' },
  { id: 'arrow',   label: 'Arrows' },
  { id: 'star',    label: 'Stars & symbols' },
  { id: 'callout', label: 'Callouts' },
  { id: 'line',    label: 'Lines' },
]);

// A shape id that is always safe to render. Anything unknown (a hand-edited
// JSON, a shape removed in a later version) falls back to the rectangle rather
// than rendering an empty box.
export function resolveShape(id) {
  return SHAPES[id] ? id : 'rect';
}

export function shapeDef(id) {
  return SHAPES[resolveShape(id)];
}

export function isLineShape(id) {
  return shapeDef(id).kind === 'line';
}

// Inline <svg> preview of a shape, used by the picker control and the library
// tile. Filled with currentColor so it inherits the button's text colour.
export function shapePreviewSvg(id, size = 24) {
  const def = shapeDef(id);
  const box = `viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true" focusable="false"`;
  if (def.kind === 'css') {
    // The picker tile is a wide rect, so the radius has to be drawn in the
    // tile's own units: a percentage rx would read as a different corner than
    // the one the shape actually paints.
    const pct = def.ellipse ? 50 : (def.fixedRadius ?? def.defaultRadius ?? 0);
    // A pill's corner is half the SHORTER side, in the tile's units too.
    const ry = def.pill ? 32 : (64 * pct) / 100;
    const rx = def.pill ? 32 : (92 * pct) / 100;
    return `<svg xmlns="http://www.w3.org/2000/svg" ${box}><rect x="4" y="18" width="92" height="64" rx="${rx}" ry="${ry}" fill="currentColor"/></svg>`;
  }
  if (def.kind === 'line') {
    return `<svg xmlns="http://www.w3.org/2000/svg" ${box}><path d="${def.d}" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  const rule = def.fillRule ? ` fill-rule="${def.fillRule}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" ${box}><path d="${def.d}" fill="currentColor"${rule}/></svg>`;
}
