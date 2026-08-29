// Tests for the variant-edit persist seam. While a slide's language/A-B variant
// is being edited, slide.widgets holds the VARIANT array (swap-in-place). The
// store's persist() must serialize the DEFAULT array instead — variant-ctx owns
// that by hooking the store's persist lifecycle over the event bus, so the store
// stays ignorant of the swap. Both modules are DOM-free (variant-ctx imports only
// the store), so the seam is exercised headlessly here. Assertions compare by
// value (toEqual), since the store wraps nested arrays in a proxy on read.
import { describe, test, expect } from './runner.js';
import { state, emit, commit, flushCommit, undo, markBaseline, withSavedShape } from '../admin/store.js';
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

// Undo has to know about the swap too. While a variant is open, the DEFAULT
// widget array lives ONLY in state.ui._variantStash — it is not reachable from
// the playlist. A snapshot that captured just the playlist could not be
// restored: leaving the variant afterwards wrote a stale array over the slide,
// and captureVariantIntoSlot() overwrote the variant with the default.
describe('variant-ctx · undo across a variant edit', () => {
  test('undo inside the variant keeps the stash and the default array', () => {
    withPlaylist(() => {
      const slide = { id: 's1', widgets: [{ id: 'A' }], langs: {} };
      state.playlist = { slides: [slide] };
      markBaseline('load');

      enterVariantEdit(slide, 'lang', 'en');
      flushCommit();
      slide.widgets.push({ id: 'B' });          // edit the English variant
      commit('add-widget'); flushCommit();

      expect(undo()).toBeTruthy();
      const s2 = state.playlist.slides[0];
      expect(s2.widgets.map(w => w.id)).toEqual(['A']);   // B is gone
      expect(isEditingVariant()).toBeTruthy();            // still in the variant

      exitVariantEdit();
      const s3 = state.playlist.slides[0];
      expect(s3.widgets.map(w => w.id)).toEqual(['A']);          // default intact
      expect(s3.langs.en.widgets.map(w => w.id)).toEqual(['A']); // variant as undone
    });
  });

  test('REGRESSION: undoing PAST the variant-enter leaves variant mode', () => {
    withPlaylist(() => {
      const slide = { id: 's1', widgets: [{ id: 'A' }], langs: {} };
      state.playlist = { slides: [slide] };
      markBaseline('load');

      enterVariantEdit(slide, 'lang', 'en');
      flushCommit();
      expect(isEditingVariant()).toBeTruthy();

      expect(undo()).toBeTruthy();               // back to before the variant
      expect(isEditingVariant()).toBeFalsy();    // …and out of variant mode
      expect(state.ui.editorPreviewLang).toBe(null);
      const s2 = state.playlist.slides[0];
      expect(s2.widgets.map(w => w.id)).toEqual(['A']);
      expect(s2.langs.en).toBe(undefined);
    });
  });
});

// Anything that SERIALIZES the playlist has to see the same shape the store
// saves — the default array in slide.widgets, the variant in its slot. persist()
// always did. Export did not, and that was silent data loss: a backup taken
// while the English variant was open came out with the English text as the
// DEFAULT, and the original German content appeared nowhere in the file. The
// publish path guards itself differently (it leaves variant mode outright).
describe('variant-ctx · saving the playlist from inside a variant edit', () => {
  test('REGRESSION: a serialization keeps the default where the default belongs', () => {
    withPlaylist(() => {
      const slide = { id: 's1', name: 'Angebot', duration: 8, langs: {},
        widgets: [{ id: 'w1', type: 'text', content: { text: 'DEUTSCH' } }] };
      state.playlist = { schemaVersion: 3, id: 'p', name: 'T', slides: [slide] };

      enterVariantEdit(state.playlist.slides[0], 'lang', 'en');
      state.playlist.slides[0].widgets[0].content.text = 'ENGLISH';

      const out = JSON.parse(withSavedShape(() => JSON.stringify(state.playlist)));
      expect(out.slides[0].widgets[0].content.text).toBe('DEUTSCH');
      expect(out.slides[0].langs.en.widgets[0].content.text).toBe('ENGLISH');
    });
  });

  test('…and the editor is still editing the variant afterwards', () => {
    withPlaylist(() => {
      const slide = { id: 's1', duration: 8, langs: {},
        widgets: [{ id: 'w1', type: 'text', content: { text: 'DEUTSCH' } }] };
      state.playlist = { schemaVersion: 3, id: 'p', name: 'T', slides: [slide] };
      enterVariantEdit(state.playlist.slides[0], 'lang', 'en');
      state.playlist.slides[0].widgets[0].content.text = 'ENGLISH';

      withSavedShape(() => JSON.stringify(state.playlist));

      expect(isEditingVariant()).toBeTruthy();
      expect(state.playlist.slides[0].widgets[0].content.text).toBe('ENGLISH');
    });
  });

  test('with no variant open the bracket changes nothing', () => {
    withPlaylist(() => {
      const slide = { id: 's1', duration: 8, widgets: [{ id: 'w1', type: 'text', content: { text: 'A' } }] };
      state.playlist = { schemaVersion: 3, id: 'p', name: 'T', slides: [slide] };
      const out = JSON.parse(withSavedShape(() => JSON.stringify(state.playlist)));
      expect(out.slides[0].widgets[0].content.text).toBe('A');
    });
  });

  test('the bracket closes even when what it wraps throws', () => {
    withPlaylist(() => {
      const slide = { id: 's1', duration: 8, langs: {},
        widgets: [{ id: 'w1', type: 'text', content: { text: 'DEUTSCH' } }] };
      state.playlist = { schemaVersion: 3, id: 'p', name: 'T', slides: [slide] };
      enterVariantEdit(state.playlist.slides[0], 'lang', 'en');
      state.playlist.slides[0].widgets[0].content.text = 'ENGLISH';
      let threw = false;
      try { withSavedShape(() => { throw new Error('boom'); }); } catch { threw = true; }
      expect(threw).toBeTruthy();
      // The variant must be swapped back in, or the editor is left showing the
      // default while it believes it is editing English.
      expect(state.playlist.slides[0].widgets[0].content.text).toBe('ENGLISH');
    });
  });
});
