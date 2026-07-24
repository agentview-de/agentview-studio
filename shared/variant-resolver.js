// Slide-variant resolver — picks the effective widgets[] given language + A/B
// state. Used by both the player runtime and the editor preview so the same
// content surfaces in both.
//
// Order of operations: language filtering FIRST (deterministic), then A/B
// (weighted random). lang === null OR no slide.langs match → use slide.widgets.
// abVariants === null OR empty → use the already-resolved widgets.

// Pick the effective widgets for a slide.
//   slide       — schema-v3 slide
//   opts.lang   — 'de' | 'en' | … (the display's preferred language; null = default)
//   opts.abIdx  — force a specific A/B variant index (used by the editor); pass
//                 null to let the picker choose by weight.
//   opts.rng    — () → [0,1) random source (allows deterministic testing).
export function resolveSlideWidgets(slide, opts = {}) {
  if (!slide || !Array.isArray(slide.widgets)) return [];
  const { lang = null, abIdx = null, rng = Math.random } = opts;

  let widgets = slide.widgets;
  if (lang && slide.langs && typeof slide.langs === 'object') {
    const variant = slide.langs[lang];
    if (variant && Array.isArray(variant.widgets) && variant.widgets.length) {
      widgets = variant.widgets;
    }
  }

  if (Array.isArray(slide.abVariants) && slide.abVariants.length) {
    // A forced, in-range index (editor preview) wins; otherwise pick by weight.
    const idx = (Number.isInteger(abIdx) && abIdx >= 0 && abIdx < slide.abVariants.length)
      ? abIdx
      : pickAbVariant(slide, rng);
    if (idx != null) {
      const chosen = slide.abVariants[idx];
      if (chosen && Array.isArray(chosen.widgets) && chosen.widgets.length) return chosen.widgets;
    }
  }

  return widgets;
}

// Choose an A/B variant index by weight. Returns the chosen index, or null when
// the slide has no usable abVariants (missing/empty array, or all weights ≤ 0).
// Variants with a missing/invalid weight count as 1.
//
// Split out from resolveSlideWidgets so the PLAYER can make the pick, memoize
// the index per slide.id (so re-renders don't reroll and flicker), and then feed
// that index back through resolveSlideWidgets as a forced choice — instead of
// re-deriving the same weighted-random loop itself. `rng` is injected for
// deterministic tests.
export function pickAbVariant(slide, rng = Math.random) {
  const variants = slide?.abVariants;
  if (!Array.isArray(variants) || !variants.length) return null;
  const weightOf = v => (Number.isFinite(+v?.weight) ? +v.weight : 1);
  const total = variants.reduce((s, v) => s + weightOf(v), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < variants.length; i++) {
    r -= weightOf(variants[i]);
    if (r <= 0) return i;
  }
  return variants.length - 1; // float-rounding safety: last variant
}

// Helper: produce a stable label for an A/B variant. Used in the inspector.
export function abVariantLabel(variant, idx) {
  if (variant?.label) return variant.label;
  return String.fromCharCode(65 + idx); // A, B, C…
}
