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

import { state, commit, on, subscribe } from '../store.js';
import { t, getLocale } from '../i18n.js';

function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

// Write the currently-swapped-in variant array back into its slide.langs /
// abVariants slot. Shared by exitVariantEdit (permanent) and the persist hook
// below (temporary) so "capture edits into the variant slot" lives in one place.
function captureVariantIntoSlot(slide, stash) {
  if (stash.kind === 'lang' && slide.langs?.[stash.key]) {
    slide.langs[stash.key].widgets = slide.widgets;
  } else if (stash.kind === 'ab' && Array.isArray(slide.abVariants) && slide.abVariants[stash.key]) {
    slide.abVariants[stash.key].widgets = slide.widgets;
  }
}

export function isEditingVariant() {
  return !!state.ui._variantStash;
}

// The language's name in the READER's language: "Deutsch" in a German studio,
// "German" in an English one. The tag itself ("de") is what a file format
// wants, not what a person reading a banner wants.
const LANG_NAMES = new Map();
function languageName(tag) {
  const key = `${getLocale()}|${tag}`;
  if (!LANG_NAMES.has(key)) {
    let name = String(tag ?? '');
    try {
      name = new Intl.DisplayNames([getLocale() || undefined], { type: 'language' }).of(tag) || name;
    } catch { /* an unparsable tag stays as it is */ }
    LANG_NAMES.set(key, name);
  }
  return LANG_NAMES.get(key);
}

// This banner sat half-translated: the label was hard-coded German
// ("Sprachvariante: de") beside a button that read "Back to default variant".
export function variantBannerLabel() {
  const s = state.ui._variantStash;
  if (!s) return '';
  if (s.kind === 'lang') return t('variant.editingLang', { name: languageName(s.key) });
  if (s.kind === 'ab') {
    return t('variant.editingAb', { label: s.label ?? String.fromCharCode(65 + Number(s.key)) });
  }
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
    captureVariantIntoSlot(slide, stash);
    slide.widgets = stash.originalWidgets;
  }
  state.ui._variantStash = null;
  state.ui.editorPreviewLang = null;
  state.ui.editorPreviewAbIdx = null;
  commit('variant-exit');
}

// The swap lives on ONE slide, so moving to another has to put it back first.
//
// That guard used to sit at a single call site — the keyboard's next/previous
// slide — with a comment explaining exactly why it was needed. Ten places set
// `state.ui.activeSlideId`, six of them in the slide rail alone (a click, focus,
// the arrow keys, add, duplicate, delete), and none of the others had it.
// Clicking a slide in the rail therefore left the first one swapped: its DEFAULT
// array holding the variant's widgets, a banner still offering to leave a
// variant of a slide the user had already left, and the next edits landing in
// the old slide's slot.
//
// A guard belongs to the change it protects, not to one of its callers.
subscribe('ui.activeSlideId', () => {
  const stash = state.ui._variantStash;
  if (stash && state.ui.activeSlideId !== stash.slideId) exitVariantEdit();
});

// The store's persist() serializes state.playlist directly, but while a variant
// is being edited slide.widgets holds the VARIANT array. Rather than teach the
// store about the swap, we hook its persist lifecycle via the store event bus:
// on 'before-persist' flush the edits + restore the default array so the JSON has
// the default where it belongs; on 'after-persist' swap the variant back so
// in-memory editing continues. This keeps ALL variant-swap logic in this module
// (previously persist() in store.js hand-rolled this same dance).
let _resumeAfterPersist = null;
on('before-persist', () => {
  const stash = state.ui._variantStash;
  if (!stash) return;
  const slide = state.playlist?.slides?.find(s => s.id === stash.slideId);
  if (!slide) return;
  captureVariantIntoSlot(slide, stash);
  const variantArr = slide.widgets;
  slide.widgets = stash.originalWidgets;
  _resumeAfterPersist = () => { slide.widgets = variantArr; };
});
on('after-persist', () => {
  if (_resumeAfterPersist) { _resumeAfterPersist(); _resumeAfterPersist = null; }
});
