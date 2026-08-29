// Tests for the reactive store's deep-Proxy: stable object identity (the
// memoisation fix) and synchronous path-prefixed notification on set/delete.
// Snapshot undo/redo is debounced (setTimeout) and therefore exercised in the
// browser suite, not here — these are the framework- and timer-free guarantees.

import { test, expect, describe } from './runner.js';
import { state, subscribe, commit, undo, redo, markBaseline } from '../admin/store.js';

describe('store · deepProxy identity stability', () => {
  test('reading the same nested path twice yields the SAME proxy', () => {
    state.playlist = { slides: [{ id: 's1', widgets: [] }] };
    const a = state.playlist.slides;
    const b = state.playlist.slides;
    expect(a === b).toBe(true);
    const w1 = state.playlist.slides[0];
    const w2 = state.playlist.slides[0];
    expect(w1 === w2).toBe(true);
  });

  test('a cached reference stays === across unrelated reads (no churn)', () => {
    state.playlist = { slides: [{ id: 's1', widgets: [] }] };
    const cached = state.playlist.slides[0];
    // touch other paths
    void state.ui.activeView;
    void state.playlist.slides.length;
    expect(state.playlist.slides[0] === cached).toBe(true);
  });

  test('replacing an object yields a fresh proxy for the new value', () => {
    state.playlist = { slides: [{ id: 'a' }] };
    const first = state.playlist.slides;
    state.playlist.slides = [{ id: 'b' }];
    expect(state.playlist.slides === first).toBe(false);
    expect(state.playlist.slides[0].id).toBe('b');
  });
});

describe('store · reactive notification', () => {
  test('set on a subscribed prefix fires synchronously', () => {
    state.playlist = { slides: [] };
    let hits = 0;
    const off = subscribe('playlist', () => { hits++; });
    state.playlist.slides.push({ id: 'x' });
    expect(hits > 0).toBe(true);
    off();
    const before = hits;
    state.playlist.slides.push({ id: 'y' });
    expect(hits).toBe(before); // unsubscribed → no more hits
  });

  test('delete on a nested path notifies', () => {
    state.playlist = { slides: [{ id: 'z', tmp: 1 }] };
    let fired = false;
    const off = subscribe('playlist', () => { fired = true; });
    delete state.playlist.slides[0].tmp;
    expect(fired).toBe(true);
    off();
  });
});

// ---------------------------------------------------------------------------
// Notification travels BOTH ways — the direction that was missing.
//
// `notify` only ever walked downward: a subscriber on `playlist.brandKit` heard
// every colour edit, and missed the moment the whole playlist was replaced. But
// replacing the slice wholesale is exactly what opening a playlist from the
// cloud, importing a file, restoring a version and every undo/redo do — they
// assign `state.playlist = …` and notify the coarse path `'playlist'`.
//
// Measured in the running editor before the fix: set a brand-kit colour, press
// undo — the store said `null`, the canvas still carried `--bb-st-bg:#ff0000`.
// Open a second playlist — the canvas kept the FIRST one's brand colours, and a
// playlist with no kit at all did not clear them. You designed on someone
// else's brand and nothing on screen said so.
//
// Two places in main.js had already tried to paper over this with a second
// subscription — `subscribe('ui', p => { if (p === 'ui._variantStash') … })` —
// whose own guard rejects the coarse notification it was added to catch. They
// were removed with this fix; there was nothing for them to do.
describe('store · subscribe travels UP as well as down', () => {
  test('REGRESSION: replacing a slice notifies subscribers BELOW it', () => {
    state.playlist = { name: 'A', brandKit: { colors: { bg: '#111111' } } };
    let hits = 0;
    const off = subscribe('playlist.brandKit', () => { hits++; });
    // What cloud-load.js, playlist-io.js and versions.js all do.
    state.playlist = { name: 'B', brandKit: { colors: { bg: '#222222' } } };
    expect(hits).toBe(1);
    off();
  });

  test('REGRESSION: …including a replacement that REMOVES the field', () => {
    // The dangerous half: a playlist with no kit must clear the old colours,
    // not leave the previous customer's brand standing on the canvas.
    state.playlist = { name: 'A', brandKit: { colors: { bg: '#111111' } } };
    let hits = 0;
    const off = subscribe('playlist.brandKit', () => { hits++; });
    state.playlist = { name: 'B' };
    expect(hits).toBe(1);
    off();
  });

  test('REGRESSION: undo reaches a deep subscriber', () => {
    state.playlist = { name: 'A' };
    markBaseline('test');
    state.playlist.brandKit = { colors: { bg: '#333333' } };
    commit('brandkit');
    let hits = 0;
    const off = subscribe('playlist.brandKit', () => { hits++; });
    expect(undo()).toBe(true);
    expect(state.playlist.brandKit ?? null).toBe(null);
    expect(hits).toBe(1);      // …and the canvas is told, so it can repaint
    expect(redo()).toBe(true);
    expect(hits).toBe(2);
    off();
  });

  test('REGRESSION: undo reaches the ui slice too, not only the playlist', () => {
    // restore() notifies 'playlist' and 'ui' separately. The variant banner
    // hangs off `ui._variantStash`, and it stayed on screen reading "Language
    // variant: French" after an undo had already cleared the stash — the app
    // said you were editing French while every keystroke went to the default.
    state.playlist = { slides: [{ id: 's1', widgets: [] }] };
    state.ui.activeSlideId = 's1';
    state.ui._variantStash = null;
    markBaseline('test');
    state.ui._variantStash = { slideId: 's1', kind: 'lang', key: 'fr' };
    commit('enter-variant');
    let hits = 0;
    const off = subscribe('ui._variantStash', () => { hits++; });
    expect(undo()).toBe(true);
    expect(state.ui._variantStash).toBe(null);
    expect(hits).toBe(1);
    off();
    state.ui.activeSlideId = null;
  });

  test('a subscriber on the exact path still hears its own change', () => {
    state.playlist = { name: 'A' };
    let hits = 0;
    const off = subscribe('playlist.brandKit', () => { hits++; });
    state.playlist.brandKit = { colors: { bg: '#444444' } };
    expect(hits).toBe(1);
    off();
  });

  test('downward notification is unchanged — a coarse subscriber hears detail', () => {
    state.playlist = { slides: [{ id: 's1', widgets: [] }] };
    let hits = 0;
    const off = subscribe('playlist', () => { hits++; });
    state.playlist.slides[0].widgets.push({ id: 'w1' });
    expect(hits > 0).toBe(true);
    off();
  });
});

describe('store · a path segment is not a prefix of a word', () => {
  test('ui.display does not hear ui.displayFilter', () => {
    // Two unrelated fields that merely share a spelling. Matching on the raw
    // string would have coupled them the moment anyone subscribed to both.
    let narrow = 0;
    let wide = 0;
    const a = subscribe('ui.display', () => { narrow++; });
    const b = subscribe('ui', () => { wide++; });
    state.ui.displayFilter = { q: 'x' };
    expect(narrow).toBe(0);
    expect(wide > 0).toBe(true);
    a(); b();
  });

  test('…but it does hear ui.display and everything inside it', () => {
    state.ui.display = { a: 1 };
    let hits = 0;
    const off = subscribe('ui.display', () => { hits++; });
    state.ui.display.a = 2;
    expect(hits).toBe(1);
    state.ui.display = { a: 3 };
    expect(hits).toBe(2);
    off();
    delete state.ui.display;
  });

  test('a wildcard subscriber still hears everything', () => {
    let hits = 0;
    const off = subscribe('*', () => { hits++; });
    state.ui.activeView = state.ui.activeView === 'editor' ? 'displays' : 'editor';
    expect(hits > 0).toBe(true);
    off();
  });
});
