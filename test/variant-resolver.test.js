// Tests for shared/variant-resolver.js — resolveSlideWidgets() picks the
// effective widgets[] from language + A/B state. Language filtering runs first
// (deterministic), then the weighted A/B pick. The rng is injected so the
// weighted branch is fully deterministic (no real randomness in the suite).
import { describe, test, expect } from './runner.js';
import { resolveSlideWidgets, abVariantLabel } from '../shared/variant-resolver.js';

// A widget is just an opaque object here; identity (===) is what we assert on.
const base = [{ id: 'base' }];
const deW = [{ id: 'de' }];

describe('resolveSlideWidgets · guards', () => {
  test('null / undefined slide → empty array', () => {
    expect(resolveSlideWidgets(null)).toEqual([]);
    expect(resolveSlideWidgets(undefined)).toEqual([]);
  });

  test('slide with non-array widgets → empty array', () => {
    expect(resolveSlideWidgets({ widgets: 'nope' })).toEqual([]);
    expect(resolveSlideWidgets({})).toEqual([]);
  });
});

describe('resolveSlideWidgets · no variants', () => {
  test('no langs and no abVariants → slide.widgets verbatim', () => {
    const slide = { widgets: base };
    expect(resolveSlideWidgets(slide)).toBe(base);
  });

  test('lang requested but slide has no langs map → base widgets', () => {
    const slide = { widgets: base };
    expect(resolveSlideWidgets(slide, { lang: 'de' })).toBe(base);
  });

  test('lang null → base widgets even when a langs map exists', () => {
    const slide = { widgets: base, langs: { de: { widgets: deW } } };
    expect(resolveSlideWidgets(slide, { lang: null })).toBe(base);
  });
});

describe('resolveSlideWidgets · language filtering', () => {
  test('matching lang returns that language\'s widgets', () => {
    const slide = { widgets: base, langs: { de: { widgets: deW } } };
    expect(resolveSlideWidgets(slide, { lang: 'de' })).toBe(deW);
  });

  test('missing lang key falls back to base widgets', () => {
    const slide = { widgets: base, langs: { de: { widgets: deW } } };
    expect(resolveSlideWidgets(slide, { lang: 'fr' })).toBe(base);
  });

  test('lang present but its widgets[] is empty → fallback to base', () => {
    const slide = { widgets: base, langs: { de: { widgets: [] } } };
    expect(resolveSlideWidgets(slide, { lang: 'de' })).toBe(base);
  });

  test('lang present but widgets is not an array → fallback to base', () => {
    const slide = { widgets: base, langs: { de: { widgets: null } } };
    expect(resolveSlideWidgets(slide, { lang: 'de' })).toBe(base);
  });
});

describe('resolveSlideWidgets · A/B forced index (editor)', () => {
  const slide = () => ({
    widgets: base,
    abVariants: [{ widgets: [{ id: 'A' }] }, { widgets: [{ id: 'B' }] }],
  });

  test('valid abIdx selects that variant deterministically', () => {
    expect(resolveSlideWidgets(slide(), { abIdx: 0 })[0].id).toBe('A');
    expect(resolveSlideWidgets(slide(), { abIdx: 1 })[0].id).toBe('B');
  });

  test('out-of-bounds abIdx falls through to the weighted pick', () => {
    // abIdx 5 is invalid → ignored; with a default rng we just assert it does
    // NOT throw and returns one of the variant widget lists.
    const out = resolveSlideWidgets(slide(), { abIdx: 5, rng: () => 0 });
    expect(out[0].id).toBe('A');   // rng 0 → r=0 → first variant after subtract
  });

  test('forced variant with empty widgets falls through (does not return [])', () => {
    const s = { widgets: base, abVariants: [{ widgets: [] }] };
    // abIdx 0 points at an empty variant → skip it, weighted branch also finds
    // nothing usable → final return is the base widgets.
    expect(resolveSlideWidgets(s, { abIdx: 0 })).toBe(base);
  });
});

describe('resolveSlideWidgets · A/B weighted pick (injected rng)', () => {
  // weights [1, 3] → total 4. Algorithm: r = rng()*4, subtract each weight,
  // return when r <= 0. Crossover is at rng = 0.25 (r = 1.0).
  const slide = () => ({
    widgets: base,
    abVariants: [
      { widgets: [{ id: 'A' }], weight: 1 },
      { widgets: [{ id: 'B' }], weight: 3 },
    ],
  });

  test('rng 0.24 (< crossover) picks the first variant', () => {
    expect(resolveSlideWidgets(slide(), { rng: () => 0.24 })[0].id).toBe('A');
  });

  test('rng 0.26 (> crossover) picks the second (heavier) variant', () => {
    expect(resolveSlideWidgets(slide(), { rng: () => 0.26 })[0].id).toBe('B');
  });

  test('rng 0.0 lands on the first variant (lower edge)', () => {
    expect(resolveSlideWidgets(slide(), { rng: () => 0 })[0].id).toBe('A');
  });

  test('rng ~1.0 lands on the last variant (upper edge)', () => {
    expect(resolveSlideWidgets(slide(), { rng: () => 0.999999 })[0].id).toBe('B');
  });

  test('a missing/invalid weight defaults to 1', () => {
    // weights [undefined→1, "x"→1] → total 2, crossover at rng 0.5.
    const s = {
      widgets: base,
      abVariants: [{ widgets: [{ id: 'A' }] }, { widgets: [{ id: 'B' }], weight: 'x' }],
    };
    expect(resolveSlideWidgets(s, { rng: () => 0.4 })[0].id).toBe('A');
    expect(resolveSlideWidgets(s, { rng: () => 0.6 })[0].id).toBe('B');
  });

  test('language filtering happens BEFORE A/B — but a matching A/B variant wins', () => {
    // lang resolves base→deW first; then the (single, full-weight) A/B variant
    // overrides it, proving A/B runs on top of the language result.
    const s = {
      widgets: base,
      langs: { de: { widgets: deW } },
      abVariants: [{ widgets: [{ id: 'ab' }], weight: 1 }],
    };
    expect(resolveSlideWidgets(s, { lang: 'de', rng: () => 0.5 })[0].id).toBe('ab');
  });

  test('empty abVariants array leaves the language/base result untouched', () => {
    const s = { widgets: base, abVariants: [] };
    expect(resolveSlideWidgets(s)).toBe(base);
  });
});

describe('abVariantLabel', () => {
  test('uses an explicit label when present', () => {
    expect(abVariantLabel({ label: 'Promo' }, 0)).toBe('Promo');
  });

  test('falls back to A, B, C… by index', () => {
    expect(abVariantLabel({}, 0)).toBe('A');
    expect(abVariantLabel(null, 1)).toBe('B');
    expect(abVariantLabel(undefined, 2)).toBe('C');
  });
});
