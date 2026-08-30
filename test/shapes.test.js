// The shape catalog and the `shape` plugin's pure parts.
//
// A shape catalog is data that renders. The two ways it silently breaks are a
// coordinate typo (a vertex outside the 100×100 authoring box, which crops or
// shifts the shape) and a schema control that offers a knob the renderer
// ignores (a corner-radius slider on a triangle, an arrow toggle on a shape
// that cannot draw one). Both are invisible in review and obvious on screen, so
// they get asserted here. The DRAWN result is reviewed in /tools/shape-sheet.html.

import { test, expect, describe } from './runner.js';
import {
  SHAPES, SHAPE_IDS, SHAPE_GROUPS, resolveShape, shapeDef, isLineShape, shapePreviewSvg,
} from '../shared/data/shapes.js';
import { fillPaint } from '../shared/plugins/shape.js';
import { get as getPlugin } from '../shared/plugins/registry.js';

const plugin = getPlugin('shape');
const field = (key) => plugin.schema().fields.find(f => f.key === key)
  ?? plugin.schema().fields.flatMap(f => f.children ?? []).find(f => f.key === key);
const withDefaults = (patch) => ({ ...plugin.defaults(), ...patch });

describe('shape catalog · structure', () => {
  test('every entry has a known kind and a group that exists', () => {
    const groups = new Set(SHAPE_GROUPS.map(g => g.id));
    for (const id of SHAPE_IDS) {
      const def = SHAPES[id];
      expect(['css', 'path', 'line']).toContain(def.kind);
      expect(groups.has(def.group)).toBe(true);
      expect(typeof def.label).toBe('string');
      expect(def.label.length > 0).toBe(true);
    }
  });

  test('every path/line shape carries a `d`, every css shape does not', () => {
    for (const id of SHAPE_IDS) {
      const def = SHAPES[id];
      if (def.kind === 'css') expect(def.d).toBe(undefined);
      else expect(typeof def.d).toBe('string');
    }
  });

  test('every group in the picker has at least one shape', () => {
    for (const g of SHAPE_GROUPS) {
      expect(SHAPE_IDS.filter(id => SHAPES[id].group === g.id).length > 0).toBe(true);
    }
  });

  test('labels are unique — the picker shows nothing but the label', () => {
    const labels = SHAPE_IDS.map(id => SHAPES[id].label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('shape catalog · geometry stays inside the 100×100 box', () => {
  // Every number in a `d` is either a coordinate, an arc radius or an arc flag.
  // All three are legitimately 0..100 in this catalog, so one blanket range
  // check catches the typo that matters (a stray 120 or -5) without needing a
  // full path parser.
  test('no coordinate escapes 0..100', () => {
    for (const id of SHAPE_IDS) {
      const d = SHAPES[id].d;
      if (!d) continue;
      const nums = d.match(/-?\d+(\.\d+)?/g) ?? [];
      expect(nums.length > 0).toBe(true);
      for (const n of nums) {
        const v = Number(n);
        if (v < 0 || v > 100) {
          throw new Error(`shape "${id}" has out-of-box coordinate ${n} in "${d}"`);
        }
      }
    }
  });

  test('a closed shape actually closes', () => {
    for (const id of SHAPE_IDS) {
      const def = SHAPES[id];
      if (def.kind !== 'path') continue;
      // An unclosed fill path renders with a straight edge the author never
      // drew — the classic "why is my star missing a side" bug.
      expect(def.d.trim().toUpperCase().endsWith('Z')).toBe(true);
    }
  });

  test('a textBox stays inside the box it labels', () => {
    for (const id of SHAPE_IDS) {
      const b = SHAPES[id].textBox;
      if (!b) continue;
      expect(b.x >= 0 && b.y >= 0).toBe(true);
      expect(b.x + b.w <= 100).toBe(true);
      expect(b.y + b.h <= 100).toBe(true);
    }
  });
});

describe('shape catalog · lookups', () => {
  test('an unknown id falls back to the rectangle, never to nothing', () => {
    expect(resolveShape('no-such-shape')).toBe('rect');
    expect(resolveShape(undefined)).toBe('rect');
    expect(resolveShape(null)).toBe('rect');
    expect(resolveShape(42)).toBe('rect');
    expect(shapeDef('nonsense').kind).toBe('css');
  });

  test('a known id resolves to itself', () => {
    expect(resolveShape('star-5')).toBe('star-5');
    expect(resolveShape('line-h')).toBe('line-h');
  });

  test('isLineShape is true for exactly the line group', () => {
    for (const id of SHAPE_IDS) {
      expect(isLineShape(id)).toBe(SHAPES[id].group === 'line');
    }
  });

  test('every id previews as an <svg>', () => {
    for (const id of SHAPE_IDS) {
      const svg = shapePreviewSvg(id, 24);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.includes('currentColor')).toBe(true);
    }
  });
});

describe('shape plugin · fill', () => {
  test('an empty fill inherits the slide accent', () => {
    expect(fillPaint({ fill: '' })).toBe('var(--bb-st-accent, #8b5cf6)');
    // `??` instead of `||` here would paint an empty string as a colour.
    expect(fillPaint({})).toBe('var(--bb-st-accent, #8b5cf6)');
  });

  test('a set fill wins', () => {
    expect(fillPaint({ fill: '#ff0000' })).toBe('#ff0000');
  });

  test('gradient returns the pair plus a clamped angle', () => {
    expect(fillPaint({ fill: '#a', gradient: true, fill2: '#b', gradientAngle: 90 }))
      .toEqual({ base: '#a', end: '#b', angle: 90 });
    // An empty second stop fades out rather than painting an invalid colour.
    expect(fillPaint({ fill: '#a', gradient: true, fill2: '' }).end).toBe('transparent');
    // Junk / out-of-range angles fall back or clamp instead of reaching CSS.
    expect(fillPaint({ gradient: true, gradientAngle: 'x' }).angle).toBe(135);
    expect(fillPaint({ gradient: true, gradientAngle: 999 }).angle).toBe(360);
    expect(fillPaint({ gradient: true, gradientAngle: -20 }).angle).toBe(0);
  });
});

describe('shape plugin · schema', () => {
  test('no widget theme — a shape floats over the slide, it is not a card', () => {
    // A `theme` in content makes applyWidgetBg paint an opaque box behind the
    // widget (shared/background.js). For a decorative primitive that is wrong,
    // so the shape follows icon / image / video and carries none.
    expect('theme' in plugin.defaults()).toBe(false);
  });

  test('the default shape is a real one', () => {
    expect(SHAPE_IDS).toContain(plugin.defaults().shape);
  });

  test('the corner-radius slider only appears where it does something', () => {
    const f = field('radius');
    for (const id of SHAPE_IDS) {
      expect(f.showIf(withDefaults({ shape: id }))).toBe(id === 'rounded');
    }
  });

  test('the arrow toggles only appear on the lines that can draw one', () => {
    // Diagonals are excluded on purpose: an arrow head has to point along the
    // line as drawn, and a diagonal's on-screen angle depends on the widget's
    // aspect ratio. See the note above LINE_ARROWS in shared/plugins/shape.js.
    const shown = SHAPE_IDS.filter(id => field('arrowEnd').showIf(withDefaults({ shape: id })));
    expect(shown).toEqual(['line-h', 'line-v']);
    expect(SHAPE_IDS.filter(id => field('arrowStart').showIf(withDefaults({ shape: id }))))
      .toEqual(shown);
  });

  test('fill controls are hidden for lines, where there is nothing to fill', () => {
    for (const id of SHAPE_IDS) {
      const c = withDefaults({ shape: id });
      expect(field('fill').showIf(c)).toBe(!isLineShape(id));
      expect(field('fillOpacity').showIf(c)).toBe(!isLineShape(id));
    }
  });

  test('the outline style picker waits until there is an outline', () => {
    expect(field('strokeStyle').showIf(withDefaults({ strokeWidth: 0 }))).toBe(false);
    expect(field('strokeStyle').showIf(withDefaults({ strokeWidth: 1 }))).toBe(true);
  });

  test('every showIf survives a content object that is missing everything', () => {
    // Content reaches the inspector straight from stored JSON, which may predate
    // any field here — a showIf that assumes its own key exists throws and takes
    // the whole inspector down with it.
    const fields = plugin.schema().fields.flatMap(f => [f, ...(f.children ?? [])]);
    for (const f of fields) f.showIf?.({});
  });

  test('every design idea patches a shape that exists', () => {
    for (const look of plugin.looks()) {
      if (look.patch.shape) expect(SHAPE_IDS).toContain(look.patch.shape);
    }
  });
});

describe('shape plugin · it paints something (browser only)', () => {
  // The app-wide "a widget with nothing to show must say so" sweep
  // (test/empty-state.test.js) exempts `shape`, because its two most-used
  // shapes are drawn with CSS rather than SVG and that sweep looks for an
  // svg/canvas/img. This is the assertion that pays for the exemption: an
  // EMPTY content object still has to put a visible, sized, painted box on the
  // slide — not an invisible one, and not a hole in the layout.
  test('empty content still paints a sized box', () => {
    if (typeof document === 'undefined') return;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-4000px;top:0;width:400px;height:200px;';
    document.body.appendChild(host);
    try {
      const dispose = plugin.render({ content: {} }, host);
      const root = host.firstElementChild;
      expect(root).toBeTruthy();
      const box = root.getBoundingClientRect();
      expect(box.width > 0 && box.height > 0).toBe(true);
      // Something inside carries a background — the shape itself.
      const painted = [...root.querySelectorAll('*')].some(el => {
        const bg = getComputedStyle(el).backgroundImage + getComputedStyle(el).backgroundColor;
        return bg && !/^none *rgba\(0, 0, 0, 0\)$/.test(bg);
      });
      expect(painted).toBe(true);
      dispose();
      expect(host.childElementCount).toBe(0);
    } finally { host.remove(); }
  });

  test('every shape in the catalog mounts and disposes cleanly', () => {
    if (typeof document === 'undefined') return;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-4000px;top:0;width:400px;height:200px;';
    document.body.appendChild(host);
    try {
      for (const id of SHAPE_IDS) {
        const dispose = plugin.render({ content: withDefaults({ shape: id, text: 'x' }) }, host);
        expect(host.childElementCount).toBe(1);
        dispose();
        expect(host.childElementCount).toBe(0);
      }
    } finally { host.remove(); }
  });
});
