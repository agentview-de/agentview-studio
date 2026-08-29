// The design catalog and its DERIVED icon.
//
// Each design used to carry a hand-picked glyph (▢ ▯▯ ◧ ▤ 田 ▥) alongside the
// rects that already described the same layout exactly — two descriptions of one
// thing, and the glyph was the worse one (田 is a CJK ideograph, so it rendered
// in whatever CJK font the machine had). The icon is now drawn from the rects,
// which is what these tests pin: one box per zone, positioned where the zone is.
// Add a seventh design and its icon exists the moment its rects do.

import { test, expect, describe } from './runner.js';
import { DESIGNS, designIconSvg } from '../shared/designs.js';

const boxCount = svg => (svg.match(/<rect /g) ?? []).length;

describe('designs · catalog', () => {
  test('every design carries rects', () => {
    for (const d of DESIGNS) {
      expect(Array.isArray(d.rects)).toBe(true);
      expect(d.rects.length > 0).toBe(true);
    }
  });
  test('no design carries a hand-picked icon glyph any more', () => {
    for (const d of DESIGNS) expect('icon' in d).toBe(false);
  });
  test('every zone has a slot name and a percent rect', () => {
    for (const d of DESIGNS) {
      for (const r of d.rects) {
        expect(typeof r.slot).toBe('string');
        for (const k of ['x', 'y', 'w', 'h']) expect(typeof r[k]).toBe('number');
      }
    }
  });
});

describe('designs · designIconSvg', () => {
  test('draws exactly one box per zone', () => {
    for (const d of DESIGNS) expect(boxCount(designIconSvg(d))).toBe(d.rects.length);
  });
  test('the 2×2 grid really gets four boxes', () => {
    const grid = DESIGNS.find(d => d.id === 'grid-2x2');
    expect(boxCount(designIconSvg(grid))).toBe(4);
  });
  test('the fullscreen design gets one', () => {
    const single = DESIGNS.find(d => d.id === 'single');
    expect(boxCount(designIconSvg(single))).toBe(1);
  });
  test('boxes sit where the rects say — 70/30 split starts its second zone at 70', () => {
    const svg = designIconSvg(DESIGNS.find(d => d.id === 'split-70-30'));
    // 2px inset on each side, so x:70 becomes x="72".
    expect(svg.includes('x="2"')).toBe(true);
    expect(svg.includes('x="72"')).toBe(true);
  });
  test('a thin zone never collapses to a zero-size box', () => {
    // header-main's header is 8% tall; ticker-bottom's ticker is 12%.
    for (const id of ['header-main', 'ticker-bottom']) {
      const svg = designIconSvg(DESIGNS.find(d => d.id === id));
      expect(svg.includes('height="0"')).toBe(false);
      expect(svg.includes('height="-')).toBe(false);
    }
  });
  test('the requested size reaches the svg', () => {
    expect(designIconSvg(DESIGNS[0], 24).includes('width="24"')).toBe(true);
  });
  test('recolours with its surroundings rather than carrying its own colour', () => {
    expect(designIconSvg(DESIGNS[0]).includes('stroke="currentColor"')).toBe(true);
  });
  test('a missing or rect-less design yields nothing, not a broken tag', () => {
    expect(designIconSvg(null)).toBe('');
    expect(designIconSvg(undefined)).toBe('');
    expect(designIconSvg({ id: 'x', rects: [] })).toBe('');
  });
});
