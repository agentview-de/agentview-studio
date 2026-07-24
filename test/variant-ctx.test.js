// Tests for the variant-edit persist seam. While a slide's language/A-B variant
// is being edited, slide.widgets holds the VARIANT array (swap-in-place). The
// store's persist() must serialize the DEFAULT array instead — variant-ctx owns
// that by hooking the store's persist lifecycle over the event bus, so the store
// stays ignorant of the swap. Both modules are DOM-free (variant-ctx imports only
// the store), so the seam is exercised headlessly here. Assertions compare by
// value (toEqual), since the store wraps nested arrays in a proxy on read.
import { describe, test, expect } from './runner.js';
import { state, emit } from '../admin/store.js';
import { enterVariantEdit, exitVariantEdit, isEditingVariant } from '../admin/canvas/variant-ctx.js';

// Save/restore the singleton store state we touch so other suites are unaffected.
function withPlaylist(fn) {
  const savedPl = state.playlist;
  const savedStash = state.ui._variantStash;
  try { fn(); }
  finally {
    if (isEditingVariant()) exitVariantEdit();
    state.playlist = savedPl;
    state.ui._variantStash = savedStash ?? null;
    state.ui.editorPreviewLang = null;
    state.ui.editorPreviewAbIdx = null;
  }
}

describe('variant-ctx · persist seam', () => {
  test('before-persist swaps the DEFAULT array in; after-persist restores the variant', () => {
    withPlaylist(() => {
      const slide = { id: 's1', widgets: [{ id: 'A' }], langs: {} };
      state.playlist = { slides: [slide] };

      enterVariantEdit(slide, 'lang', 'de'); // clones the base → langs.de.widgets, swaps in
      expect(isEditingVariant()).toBe(true);
      slide.widgets.push({ id: 'B' });       // edit the variant

      // The store fires these around JSON.stringify(state.playlist).
      emit('before-persist');
      expect(slide.widgets).toEqual([{ id: 'A' }]);                 // default → serialized
      expect(slide.langs.de.widgets).toEqual([{ id: 'A' }, { id: 'B' }]); // edit captured

      emit('after-persist');
      expect(slide.widgets).toEqual([{ id: 'A' }, { id: 'B' }]);    // editing resumes on the variant
      expect(isEditingVariant()).toBe(true);
    });
  });

  test('before/after-persist are no-ops when no variant edit is active', () => {
    withPlaylist(() => {
      const slide = { id: 's1', widgets: [{ id: 'A' }] };
      state.playlist = { slides: [slide] };
      emit('before-persist');
      emit('after-persist');
      expect(slide.widgets).toEqual([{ id: 'A' }]);
      expect(isEditingVariant()).toBe(false);
    });
  });
});
