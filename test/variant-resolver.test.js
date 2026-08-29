// Tests for shared/variant-resolver.js — resolveSlideWidgets() picks the
// effective widgets[] from language + A/B state. Language filtering runs first
// (deterministic), then the weighted A/B pick. The rng is injected so the
// weighted branch is fully deterministic (no real randomness in the suite).
import { describe, test, expect } from './runner.js';
import { resolveSlideWidgets, pickAbVariant, abVariantLabel } from '../shared/variant-resolver.js';

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
    // lang resolves base→deW first; then the A/B pick overrides it, proving A/B
    // runs on top of the language result.
    //
    // TWO arms, deliberately. This case used to make its point with a single
    // full-weight variant — which encoded the behaviour that turned out to be
    // the bug: one arm is not a split, and a slide with one must play what the
    // canvas shows (see "A/B · one arm is not a split" below). The ordering
    // claim this test is named for needs two arms anyway.
    const s = {
      widgets: base,
      langs: { de: { widgets: deW } },
      abVariants: [{ widgets: [{ id: 'ab' }], weight: 1 }, { widgets: [{ id: 'ab2' }], weight: 1 }],
    };
    expect(resolveSlideWidgets(s, { lang: 'de', rng: () => 0.1 })[0].id).toBe('ab');
    expect(resolveSlideWidgets(s, { lang: 'de', rng: () => 0.9 })[0].id).toBe('ab2');
  });

  test('empty abVariants array leaves the language/base result untouched', () => {
    const s = { widgets: base, abVariants: [] };
    expect(resolveSlideWidgets(s)).toBe(base);
  });
});

describe('pickAbVariant · shared A/B index picker', () => {
  const s = (variants) => ({ widgets: base, abVariants: variants });

  test('returns null when there are no usable variants', () => {
    expect(pickAbVariant({ widgets: base })).toBe(null);          // no abVariants
    expect(pickAbVariant(s([]))).toBe(null);                       // empty array
    expect(pickAbVariant(s([{ widgets: [{}], weight: 0 }]))).toBe(null); // total weight 0
  });

  test('picks an index by weight with an injected rng (crossover at 0.25)', () => {
    const v = s([{ widgets: [{}], weight: 1 }, { widgets: [{}], weight: 3 }]);
    expect(pickAbVariant(v, () => 0.24)).toBe(0);
    expect(pickAbVariant(v, () => 0.26)).toBe(1);
    expect(pickAbVariant(v, () => 0)).toBe(0);
    expect(pickAbVariant(v, () => 0.999999)).toBe(1);
  });

  test('missing/invalid weights count as 1', () => {
    const v = s([{ widgets: [{}] }, { widgets: [{}], weight: 'x' }]);
    expect(pickAbVariant(v, () => 0.4)).toBe(0);
    expect(pickAbVariant(v, () => 0.6)).toBe(1);
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

// A split needs two arms.
//
// The editor's "add A/B variant" button copies the current slide.widgets into a
// new arm and labels it A. One click therefore leaves EXACTLY ONE arm — and a
// picker that always answers "arm 0" made the display show that snapshot from
// then on, for good. The canvas kept showing slide.widgets, the user kept
// editing it, and none of those edits ever reached a screen.
//
// Measured on the real player before the fix: the display read
// "STAND-BEIM-KLICK" while the canvas read "SPAETER-BEARBEITET".
describe('A/B · one arm is not a split', () => {
  const w = (body) => [{ id: 'w-' + body, type: 'text', z: 1, rect: { x: 0, y: 0, w: 100, h: 100 }, content: { body } }];
  const oneArm = () => ({
    id: 's', duration: 10,
    widgets: w('BUEHNE'),
    abVariants: [{ label: 'A', weight: 1, widgets: w('SCHNAPPSCHUSS') }],
  });
  const body = (widgets) => widgets.map(x => x.content.body).join('|');

  test('REGRESSION: with a single variant the slide plays what the canvas shows', () => {
    expect(pickAbVariant(oneArm(), () => 0.5)).toBe(null);
    expect(body(resolveSlideWidgets(oneArm(), { rng: () => 0.5 }))).toBe('BUEHNE');
    // …whatever the die says.
    for (const r of [0, 0.001, 0.5, 0.999]) {
      expect(body(resolveSlideWidgets(oneArm(), { rng: () => r }))).toBe('BUEHNE');
    }
  });

  test('the editor can still preview that one arm on purpose', () => {
    // Forcing an index is what the variant preview control does; it must keep
    // working, or you could not look at the arm you just made.
    expect(body(resolveSlideWidgets(oneArm(), { abIdx: 0 }))).toBe('SCHNAPPSCHUSS');
  });

  test('a second arm turns it into a real split again', () => {
    const two = oneArm();
    two.abVariants.push({ label: 'B', weight: 1, widgets: w('ZWEITER-ARM') });
    expect(pickAbVariant(two, () => 0.0)).toBe(0);
    expect(pickAbVariant(two, () => 0.9)).toBe(1);
    expect(body(resolveSlideWidgets(two, { rng: () => 0.0 }))).toBe('SCHNAPPSCHUSS');
    expect(body(resolveSlideWidgets(two, { rng: () => 0.9 }))).toBe('ZWEITER-ARM');
  });

  test('deleting back down to one arm hands the slide back to the canvas', () => {
    const two = oneArm();
    two.abVariants.push({ label: 'B', weight: 1, widgets: w('ZWEITER-ARM') });
    two.abVariants.pop();
    expect(body(resolveSlideWidgets(two, { rng: () => 0.9 }))).toBe('BUEHNE');
  });

  test('language variants are unaffected — they are not a split', () => {
    const s = oneArm();
    s.langs = { de: { widgets: w('DEUTSCH') } };
    expect(body(resolveSlideWidgets(s, { lang: 'de', rng: () => 0.5 }))).toBe('DEUTSCH');
  });
});
