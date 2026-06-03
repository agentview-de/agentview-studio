// Tests for the reactive store's deep-Proxy: stable object identity (the
// memoisation fix) and synchronous path-prefixed notification on set/delete.
// Snapshot undo/redo is debounced (setTimeout) and therefore exercised in the
// browser suite, not here — these are the framework- and timer-free guarantees.

import { test, expect, describe } from './runner.js';
import { state, subscribe } from '../admin/store.js';

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
