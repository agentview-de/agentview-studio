// Variant-edit context — swap-in-place pattern.
//
// The canvas operates on `slide.widgets[]`. To edit a `slide.langs[lang]` or
// `slide.abVariants[i]` variant via the same canvas without refactoring every
// canvas call-site, we temporarily swap the variant's widgets array INTO
// `slide.widgets`. Editing happens against the variant array; on exit we put
// the original back and the variant retains the edits.
//
// `state.ui._variantStash` holds the bookkeeping (slideId + original array
// reference). It is intentionally not persisted to disk (the publish-flow
// calls exitVariantEdit() before serializing).

import { state, commit } from '../store.js';

function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

export function isEditingVariant() {
  return !!state.ui._variantStash;
}

export function variantBannerLabel() {
  const s = state.ui._variantStash;
  if (!s) return '';
  if (s.kind === 'lang') return `Sprachvariante: ${s.key}`;
  if (s.kind === 'ab') return `A/B-Variante: ${s.label ?? String.fromCharCode(65 + Number(s.key))}`;
  return '';
}

export function enterVariantEdit(slide, kind, key) {
  // Defensive: if a different variant is already active, exit first so we
  // don't double-stash and lose the original reference.
  if (state.ui._variantStash) exitVariantEdit();

  if (kind === 'lang') {
    if (!slide.langs) slide.langs = {};
    if (!slide.langs[key]?.widgets) {
      slide.langs[key] = { widgets: deepClone(slide.widgets ?? []) };
    }
    const variantArr = slide.langs[key].widgets;
    state.ui._variantStash = { slideId: slide.id, originalWidgets: slide.widgets, kind, key };
    slide.widgets = variantArr;
    state.ui.editorPreviewLang = key;
  } else if (kind === 'ab') {
    const idx = Number(key);
    if (!Array.isArray(slide.abVariants) || !slide.abVariants[idx]) return;
    if (!Array.isArray(slide.abVariants[idx].widgets)) {
      slide.abVariants[idx].widgets = deepClone(slide.widgets ?? []);
    }
    const variantArr = slide.abVariants[idx].widgets;
    state.ui._variantStash = {
      slideId: slide.id, originalWidgets: slide.widgets, kind, key: idx,
      label: slide.abVariants[idx].label ?? String.fromCharCode(65 + idx),
    };
    slide.widgets = variantArr;
    state.ui.editorPreviewAbIdx = idx;
  }
  // Single commit so the canvas re-renders against the variant array.
  commit('variant-enter');
}

export function exitVariantEdit() {
  const stash = state.ui._variantStash;
  if (!stash) return;
  const slide = state.playlist?.slides?.find(s => s.id === stash.slideId);
  if (slide) {
    // Write the (possibly edited) variant array back into its slot, then
    // restore the original widgets array.
    if (stash.kind === 'lang' && slide.langs?.[stash.key]) {
      slide.langs[stash.key].widgets = slide.widgets;
    } else if (stash.kind === 'ab' && Array.isArray(slide.abVariants) && slide.abVariants[stash.key]) {
      slide.abVariants[stash.key].widgets = slide.widgets;
    }
    slide.widgets = stash.originalWidgets;
  }
  state.ui._variantStash = null;
  state.ui.editorPreviewLang = null;
  state.ui.editorPreviewAbIdx = null;
  commit('variant-exit');
}
