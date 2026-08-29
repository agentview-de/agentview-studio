// The fullscreen preview — "what you see is what would publish".
//
// That sentence is the module's whole promise, and it was not true. While a
// language or A/B variant is open for editing, the canvas works by swapping the
// VARIANT's widgets into `slide.widgets` and stashing the default array in
// memory (see admin/canvas/variant-ctx.js). Saving and exporting bracket that
// swap with before-persist/after-persist so the JSON carries the default where
// it belongs. The preview did not: it serialised the editing stash, so it
// showed the variant as if it were the default — the one moment where a
// what-you-see-is-what-publishes claim actually has to hold.
//
// The second half is the overlay itself. It covers the entire editor, but it
// was a plain <div>: no role, no focus, no trap, no hand-back. Tab walked
// through the editor underneath a screen that was showing something else.
//
// Browser-only: it opens the real overlay, which mounts a real player iframe.

import { test, expect, describe } from './runner.js';
import { state } from '../admin/store.js';
import { openPreview, closePreview } from '../admin/preview-flow.js';
import { enterVariantEdit, exitVariantEdit, isEditingVariant } from '../admin/canvas/variant-ctx.js';
import { createPlaylist, createSlide, createWidget } from '../shared/slide-schema.js';

const overlay = () => document.querySelector('.avs-preview-overlay');

// The playlist the preview shipped, read back out of the blob it handed the
// player — the only honest way to ask what the iframe would render.
async function shippedPlaylist() {
  const src = overlay()?.querySelector('.avs-preview-frame')?.getAttribute('src') ?? '';
  const blobUrl = decodeURIComponent(src.replace(/^display\.html\?slot=/, ''));
  expect(blobUrl.startsWith('blob:')).toBeTruthy();
  return (await fetch(blobUrl)).json();
}

function textOf(playlist, slideIdx = 0) {
  return (playlist.slides[slideIdx].widgets ?? []).map(w => w.content?.body ?? '').join('|');
}

// A playlist with one slide that carries a German language variant.
function withVariant() {
  const pl = createPlaylist('vorschau');
  const slide = createSlide({ duration: 10 });
  slide.name = 'EINS';
  slide.widgets = [createWidget('text', { z: 1, rect: { x: 10, y: 10, w: 50, h: 30 }, content: { body: 'STANDARD' } })];
  slide.langs = { de: { widgets: [createWidget('text', { z: 1, rect: { x: 10, y: 10, w: 50, h: 30 }, content: { body: 'VARIANTE' } })] } };
  pl.slides = [slide];
  return pl;
}

describe('preview · it ships what would publish', () => {
  test('REGRESSION: an open language variant does not leak in as the default', async () => {
    const saved = { pl: state.playlist, active: state.ui.activeSlideId, stash: state.ui._variantStash };
    try {
      state.playlist = withVariant();
      state.ui.activeSlideId = state.playlist.slides[0].id;
      const slide = state.playlist.slides[0];

      // Editing the German variant: the canvas has swapped it into slide.widgets.
      enterVariantEdit(slide, 'lang', 'de');
      expect(isEditingVariant()).toBeTruthy();
      expect(textOf(state.playlist)).toBe('VARIANTE');

      openPreview();
      const shipped = await shippedPlaylist();
      // The default slide is the DEFAULT, and the variant is where it belongs.
      expect(textOf(shipped)).toBe('STANDARD');
      expect((shipped.slides[0].langs?.de?.widgets ?? []).map(w => w.content?.body).join('')).toBe('VARIANTE');
      closePreview();

      // …and the editor is still editing the variant afterwards.
      expect(isEditingVariant()).toBeTruthy();
      expect(textOf(state.playlist)).toBe('VARIANTE');
    } finally {
      if (isEditingVariant()) exitVariantEdit();
      closePreview();
      state.playlist = saved.pl;
      state.ui.activeSlideId = saved.active;
      state.ui._variantStash = saved.stash;
      await new Promise(r => setTimeout(r, 260));
    }
  });

  test('it starts at the slide you were looking at', async () => {
    const saved = { pl: state.playlist, active: state.ui.activeSlideId };
    try {
      const pl = createPlaylist('rotation');
      pl.slides = ['A', 'B', 'C'].map(n => {
        const s = createSlide({ duration: 10 });
        s.name = n;
        return s;
      });
      state.playlist = pl;
      state.ui.activeSlideId = pl.slides[2].id;
      openPreview();
      const shipped = await shippedPlaylist();
      expect(shipped.slides.map(s => s.name)).toEqual(['C', 'A', 'B']);
      closePreview();
    } finally {
      closePreview();
      state.playlist = saved.pl;
      state.ui.activeSlideId = saved.active;
      await new Promise(r => setTimeout(r, 260));
    }
  });
});

describe('preview · the overlay behaves like the dialog it is', () => {
  const setup = () => {
    const pl = createPlaylist('dialog');
    const s = createSlide({ duration: 10 });
    pl.slides = [s];
    state.playlist = pl;
    state.ui.activeSlideId = s.id;
  };

  test('REGRESSION: it is announced as a dialog and takes focus', async () => {
    const saved = { pl: state.playlist, active: state.ui.activeSlideId };
    const opener = document.createElement('button');
    opener.textContent = 'Vorschau';
    document.body.appendChild(opener);
    opener.focus();
    try {
      setup();
      openPreview();
      const o = overlay();
      expect(o === null).toBeFalsy();
      expect(o.getAttribute('role')).toBe('dialog');
      expect(o.getAttribute('aria-modal')).toBe('true');
      expect((o.getAttribute('aria-label') ?? '').length > 0).toBeTruthy();
      // Focus is inside, not still on the button behind it — and it is the
      // DIALOG that holds it. The ✕ is opacity:0 until hover or :focus-visible,
      // so focusing it on open would mean a focused control nobody can see.
      expect(document.activeElement).toBe(o);

      // Tab does not escape to the editor underneath — in either direction.
      const close = o.querySelector('.avs-preview-close');
      const frame = o.querySelector('.avs-preview-frame');
      // The player frame is out of the tab order on purpose: tabbing off its
      // last element would walk out of the overlay entirely.
      expect(frame.getAttribute('tabindex')).toBe('-1');
      close.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(close);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(close);
      // And focus that has wandered outside is pulled back on the next Tab.
      opener.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(close);

      closePreview();
      await new Promise(r => setTimeout(r, 260));
      // …and the button that opened it has the focus back.
      expect(document.activeElement).toBe(opener);
    } finally {
      closePreview();
      opener.remove();
      state.playlist = saved.pl;
      state.ui.activeSlideId = saved.active;
      await new Promise(r => setTimeout(r, 260));
    }
  });

  test('Escape closes it and the blob is let go', async () => {
    const saved = { pl: state.playlist, active: state.ui.activeSlideId };
    try {
      setup();
      openPreview();
      expect(overlay() === null).toBeFalsy();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 260));
      expect(overlay()).toBe(null);
      // A second open works — the handle was released, not left dangling.
      openPreview();
      expect(overlay() === null).toBeFalsy();
      closePreview();
    } finally {
      closePreview();
      state.playlist = saved.pl;
      state.ui.activeSlideId = saved.active;
      await new Promise(r => setTimeout(r, 260));
    }
  });
});
