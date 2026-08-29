// Running a slide's disposers is not the same as letting go of it.
//
// The player kept the teardown in one `disposeCurrent` closure over the
// disposer array and never replaced it after use, plus a `currentSlideEl`
// pointing at the detached slide host. On a running playlist that costs one
// slide's memory — the next render overwrites both. But a display OUTSIDE its
// schedule takes the empty branch of showNext(), which tears down and re-arms
// itself every 30 seconds and never renders again. A shop window scheduled
// 9–18 held its last slide, bitmaps and all, from six in the evening until nine
// the next morning; a display whose campaign has ended holds it for good. The
// same branch re-ran every plugin's teardown some 1 800 times a night, which
// the documented contract says happens once.

import { test, expect, describe } from './runner.js';
import { createSlideHolder } from '../player/current-slide.js';

const node = (name) => ({ name });   // the holder never touches the element

describe('current slide · letting go', () => {
  test('REGRESSION: a second teardown does not re-run the disposers', () => {
    const h = createSlideHolder();
    let runs = 0;
    h.adopt(node('a'), [() => { runs++; }, () => { runs++; }]);
    h.teardown();
    expect(runs).toBe(2);
    h.teardown();
    h.teardown();
    expect(runs).toBe(2);          // the empty branch calls this every 30 s
  });

  test('REGRESSION: nothing is held after a teardown', () => {
    const h = createSlideHolder();
    h.adopt(node('a'), [() => {}, () => {}, () => {}]);
    expect(h.held()).toBe(3);
    h.teardown();
    expect(h.held()).toBe(0);
    expect(h.el).toBe(null);
  });

  test('the outgoing element comes back, for the transition that still needs it', () => {
    const h = createSlideHolder();
    const a = node('a');
    h.adopt(a, []);
    expect(h.teardown()).toBe(a);
    expect(h.teardown()).toBe(null);   // …and only once
  });

  test('a disposer that throws does not strand the ones after it', () => {
    const h = createSlideHolder();
    const ran = [];
    h.adopt(node('a'), [
      () => ran.push(1),
      () => { throw new Error('plugin teardown blew up'); },
      () => ran.push(3),
    ]);
    h.teardown();
    expect(ran).toEqual([1, 3]);
    expect(h.held()).toBe(0);          // …and the holder still let go
  });

  test('a late disposer joins the slide it belongs to', () => {
    // renderSlide pushes the entrance-build canceller AFTER the transition
    // resolves; the holder must see it, because it holds the same array.
    const h = createSlideHolder();
    const list = [];
    h.adopt(node('a'), list);
    let cancelled = false;
    list.push(() => { cancelled = true; });
    h.teardown();
    expect(cancelled).toBeTruthy();
  });

  test('adopting a new slide replaces the old one entirely', () => {
    const h = createSlideHolder();
    let old = 0;
    h.adopt(node('a'), [() => { old++; }]);
    h.adopt(node('b'), [() => {}]);
    expect(h.el.name).toBe('b');
    h.teardown();
    expect(old).toBe(0);   // the caller tears down before adopting; no surprise runs
  });

  test('a fresh holder tears down without complaint', () => {
    const h = createSlideHolder();
    expect(h.teardown()).toBe(null);
    expect(h.held()).toBe(0);
    h.adopt(null, null);
    expect(h.el).toBe(null);
    expect(h.held()).toBe(0);
  });
});
