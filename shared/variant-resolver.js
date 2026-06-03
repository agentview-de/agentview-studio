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
    if (Number.isInteger(abIdx) && abIdx >= 0 && abIdx < slide.abVariants.length) {
      const chosen = slide.abVariants[abIdx];
      if (chosen && Array.isArray(chosen.widgets) && chosen.widgets.length) return chosen.widgets;
    } else {
      // Weighted random pick. Variants with no/invalid weight default to 1.
      const total = slide.abVariants.reduce((s, v) => s + (Number.isFinite(+v.weight) ? +v.weight : 1), 0);
      if (total > 0) {
        let r = rng() * total;
        for (const v of slide.abVariants) {
          r -= Number.isFinite(+v.weight) ? +v.weight : 1;
          if (r <= 0 && Array.isArray(v.widgets) && v.widgets.length) return v.widgets;
        }
      }
    }
  }

  return widgets;
}

// Helper: produce a stable label for an A/B variant. Used in the inspector.
export function abVariantLabel(variant, idx) {
  if (variant?.label) return variant.label;
  return String.fromCharCode(65 + idx); // A, B, C…
}
