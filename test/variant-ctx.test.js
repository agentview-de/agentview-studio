// Tests for the variant-edit persist seam. While a slide's language/A-B variant
// is being edited, slide.widgets holds the VARIANT array (swap-in-place). The
// store's persist() must serialize the DEFAULT array instead — variant-ctx owns
// that by hooking the store's persist lifecycle over the event bus, so the store
// stays ignorant of the swap. Both modules are DOM-free (variant-ctx imports only
// the store), so the seam is exercised headlessly here. Assertions compare by
// value (toEqual), since the store wraps nested arrays in a proxy on read.
import { describe, test, expect } from './runner.js';
import { state, emit, commit, flushCommit, undo, markBaseline, withSavedShape } from '../admin/store.js';
import { enterVariantEdit, exitVariantEdit, isEditingVariant, variantBannerLabel } from '../admin/canvas/variant-ctx.js';
import { setLocale, getLocale } from '../admin/i18n.js';

// Save/restore the singleton store state we touch so other suites are unaffected.
function withPlaylist(fn) {
  const savedPl = state.playlist;
  const savedStash = state.ui._variantStash;
  const savedActive = state.ui.activeSlideId;
  try { fn(); }
  finally {
    if (isEditingVariant()) exitVariantEdit();
    state.playlist = savedPl;
    state.ui._variantStash = savedStash ?? null;
    state.ui.activeSlideId = savedActive ?? null;
    state.ui.editorPreviewLang = null;
    state.ui.editorPreviewAbIdx = null;
  }
}

// You can only open a variant of the slide you are ON — the inspector that
// calls enterVariantEdit renders for the active slide. Say so out loud in the
// fixture: variant-ctx guards against "the user navigated to another slide"
// by comparing the stash's slideId with ui.activeSlideId, and a fixture that
// leaves activeSlideId at null describes a state the editor cannot produce.
function activate(slide) { state.ui.activeSlideId = slide.id; }

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
      activate(slide);
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
      activate(slide);
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

// The swap lives on ONE slide, and moving to another has to put it back.
//
// main.js guarded exactly one of the ways to do that — the keyboard's
// next/previous — with a comment saying why: "switching slides while a variant
// is being edited must commit the variant edits back to its slot first,
// otherwise the swap-in-place would orphan the variant array on the new slide".
// Ten places set `state.ui.activeSlideId`, six of them in the slide rail alone
// (a click, focus, the arrow keys, add, duplicate, delete). Clicking a slide in
// the rail left the first one swapped: its default array showing the variant's
// widgets, the banner still claiming to edit a variant of a slide the user had
// left, and the edits landing in the old slide's slot.
describe('variant-ctx · leaving the slide leaves the variant', () => {
  const twoSlides = () => ({
    schemaVersion: 3, id: 'p', slides: [
      { id: 'a', widgets: [{ id: 'wa', type: 'text', content: { body: 'default A' } }] },
      { id: 'b', widgets: [{ id: 'wb', type: 'text', content: { body: 'default B' } }] },
    ],
  });

  test('REGRESSION: switching the active slide ends the variant edit', () => {
    withPlaylist(() => {
      state.playlist = twoSlides();
      const a = state.playlist.slides[0];
      state.ui.activeSlideId = 'a';
      enterVariantEdit(a, 'lang', 'de');
      expect(isEditingVariant()).toBe(true);

      // …the user clicks the other slide in the rail.
      state.ui.activeSlideId = 'b';
      expect(isEditingVariant()).toBe(false);
      // And slide A is back to its own widgets, not the variant's.
      expect(state.playlist.slides[0].widgets[0].content.body).toBe('default A');
    });
  });

  test('the edits made in the variant are kept, not thrown away', () => {
    withPlaylist(() => {
      state.playlist = twoSlides();
      const a = state.playlist.slides[0];
      state.ui.activeSlideId = 'a';
      enterVariantEdit(a, 'lang', 'de');
      state.playlist.slides[0].widgets[0].content.body = 'auf Deutsch';

      state.ui.activeSlideId = 'b';
      expect(state.playlist.slides[0].langs.de.widgets[0].content.body).toBe('auf Deutsch');
      expect(state.playlist.slides[0].widgets[0].content.body).toBe('default A');
    });
  });

  test('staying on the same slide does not end it', () => {
    withPlaylist(() => {
      state.playlist = twoSlides();
      const a = state.playlist.slides[0];
      state.ui.activeSlideId = 'a';
      enterVariantEdit(a, 'ab', 0);
      // No abVariants: entering is a no-op, and nothing should have been stashed.
      expect(isEditingVariant()).toBe(false);

      a.abVariants = [{ label: 'A', weight: 1 }, { label: 'B', weight: 1 }];
      enterVariantEdit(state.playlist.slides[0], 'ab', 1);
      expect(isEditingVariant()).toBe(true);
      state.ui.activeSlideId = 'a';          // same slide, set again
      expect(isEditingVariant()).toBe(true);
    });
  });
});

// The banner sat half-translated.
//
// `variantBannerLabel()` returned hard-coded German — "Sprachvariante: de" —
// right beside a button that read "Back to default variant". And it printed the
// raw language TAG, which is what a file format wants, not what a person
// reading a banner does.
describe('variant-ctx · the banner speaks the studio’s language', () => {
  const slideWithAb = () => ({
    schemaVersion: 3, id: 'p', slides: [{
      id: 'a', widgets: [{ id: 'w', type: 'text', content: { body: 'x' } }],
      abVariants: [{ label: 'A', weight: 1 }, { label: 'B', weight: 1 }],
    }],
  });

  const inLocale = (loc, fn) => {
    const before = getLocale();
    try { setLocale(loc); return fn(); } finally { setLocale(before); }
  };

  test('REGRESSION: a language variant is named in the UI language', () => {
    withPlaylist(() => {
      state.playlist = slideWithAb();
      state.ui.activeSlideId = 'a';
      enterVariantEdit(state.playlist.slides[0], 'lang', 'de');
      const de = inLocale('de', variantBannerLabel);
      const en = inLocale('en', variantBannerLabel);
      expect(de === en).toBe(false);                 // it is translated at all
      expect(de).toContain('Sprachvariante');
      expect(en).toContain('Language variant');
    });
  });

  test('REGRESSION: the language TAG is shown as a name', () => {
    withPlaylist(() => {
      state.playlist = slideWithAb();
      state.ui.activeSlideId = 'a';
      enterVariantEdit(state.playlist.slides[0], 'lang', 'de');
      expect(inLocale('de', variantBannerLabel)).toContain('Deutsch');
      expect(inLocale('en', variantBannerLabel)).toContain('German');
    });
  });

  test('an A/B variant is named too, and keeps its own label', () => {
    withPlaylist(() => {
      state.playlist = slideWithAb();
      state.ui.activeSlideId = 'a';
      enterVariantEdit(state.playlist.slides[0], 'ab', 1);
      expect(inLocale('de', variantBannerLabel)).toContain('A/B-Variante');
      expect(inLocale('en', variantBannerLabel)).toContain('A/B variant');
      expect(inLocale('en', variantBannerLabel)).toContain('B');
    });
  });

  test('a tag nobody can resolve is shown as it stands, not as a crash', () => {
    withPlaylist(() => {
      state.playlist = slideWithAb();
      state.ui.activeSlideId = 'a';
      enterVariantEdit(state.playlist.slides[0], 'lang', 'zz-nonsense');
      expect(typeof variantBannerLabel()).toBe('string');
      expect(variantBannerLabel().length > 0).toBeTruthy();
    });
  });

  test('no variant, no label', () => {
    withPlaylist(() => {
      state.playlist = slideWithAb();
      expect(variantBannerLabel()).toBe('');
    });
  });
});
