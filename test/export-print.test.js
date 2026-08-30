// Print / Save-as-PDF export — the page maths.
//
// The rendering is renderSlideThumb, which the rail and the store already
// exercise. What is new here is how the deck is cut into pages and what shape
// those pages are, and the second one is the part that decides whether the PDF
// is usable: a 16:9 signage deck on A4 portrait is a column of postage stamps.

import { test, expect, describe } from './runner.js';
import { paginate, pageRuleFor, layoutById, LAYOUTS } from '../admin/export-print.js';

const slides = n => Array.from({ length: n }, (_, i) => ({ id: 's' + i }));

describe('paginate', () => {
  test('one per page gives one slide per page', () => {
    expect(paginate(slides(3), 1).map(p => p.length)).toEqual([1, 1, 1]);
  });

  test('an exact multiple fills every page', () => {
    expect(paginate(slides(8), 4).map(p => p.length)).toEqual([4, 4]);
  });

  test('the last page is short rather than padded', () => {
    // A padded last page would print blank frames, which look like slides
    // somebody forgot to fill in.
    expect(paginate(slides(7), 4).map(p => p.length)).toEqual([4, 3]);
  });

  test('every slide appears exactly once, in order', () => {
    const flat = paginate(slides(11), 6).flat().map(s => s.id);
    expect(flat).toEqual(slides(11).map(s => s.id));
  });

  test('an empty deck is no pages, not one empty page', () => {
    expect(paginate([], 4)).toEqual([]);
  });

  test('a nonsense page size does not divide by zero or loop forever', () => {
    expect(paginate(slides(3), 0).map(p => p.length)).toEqual([1, 1, 1]);
    expect(paginate(slides(3), -5).map(p => p.length)).toEqual([1, 1, 1]);
    expect(paginate(slides(3), 2.7).map(p => p.length)).toEqual([2, 1]);
  });
});

describe('layoutById', () => {
  test('every declared layout resolves to itself', () => {
    for (const l of LAYOUTS) expect(layoutById(l.id)).toBe(l);
  });
  test('an unknown id falls back to the deck rather than crashing', () => {
    expect(layoutById('nope')).toBe(LAYOUTS[0]);
    expect(layoutById(undefined).id).toBe('deck');
  });
});

describe('pageRuleFor', () => {
  test('one-per-page cuts the page to the CANVAS aspect, with no margin', () => {
    // 16:9 → the long A4 edge (297mm) wide, so 297 / (16/9) ≈ 167.06mm tall.
    const rule = pageRuleFor('deck', { w: 1920, h: 1080 });
    expect(rule).toContain('297mm 167.06mm');
    expect(rule).toContain('margin: 0');
  });

  test('a portrait canvas gets a portrait page, not a rotated landscape one', () => {
    // 9:16 → the SHORT edge (210mm) wide, 210 / (9/16) ≈ 373.33mm tall. Pinning
    // width to the long edge instead would produce a page over half a metre tall.
    const rule = pageRuleFor('deck', { w: 1080, h: 1920 });
    expect(rule).toContain('210mm 373.33mm');
  });

  test('a square canvas gets a square page', () => {
    expect(pageRuleFor('deck', { w: 1080, h: 1080 })).toContain('297mm 297mm');
  });

  test('4:3 too', () => {
    expect(pageRuleFor('deck', { w: 1440, h: 1080 })).toContain('297mm 222.75mm');
  });

  test('a missing or broken canvas falls back to the 16:9 default', () => {
    // resolveCanvas already owns that fallback; this is the assertion that the
    // print path actually goes through it rather than reading w/h raw.
    expect(pageRuleFor('deck', undefined)).toContain('297mm 167.06mm');
    expect(pageRuleFor('deck', { w: 0, h: 0 })).toContain('297mm 167.06mm');
    expect(pageRuleFor('deck', { w: 'x', h: null })).toContain('297mm 167.06mm');
  });

  test('handouts are A4 with a margin, whatever the canvas is', () => {
    for (const id of ['handout2', 'handout4', 'handout6']) {
      const rule = pageRuleFor(id, { w: 1080, h: 1920 });
      expect(rule).toContain('A4 portrait');
      expect(rule).toContain('margin: 12mm');
    }
  });

  test('every rule is a syntactically complete @page block', () => {
    for (const l of LAYOUTS) {
      const rule = pageRuleFor(l.id, { w: 1920, h: 1080 });
      expect(rule.startsWith('@page {')).toBe(true);
      expect(rule.trim().endsWith('}')).toBe(true);
    }
  });
});
