// What the player is still holding while one slide is on screen.
//
// Running a slide's disposers is not the same as letting go of it. The player
// kept the teardown in a single `disposeCurrent` closure over the disposer
// array, and never replaced it after use — so every widget's dispose closure
// stayed reachable, and through it the widget's DOM subtree, its canvas backing
// store, its ResizeObserver and whatever it had fetched. `currentSlideEl` held
// the detached slide host on top of that.
//
// For a running playlist that costs one slide's worth of memory: the next
// render overwrites both. But a display OUTSIDE its schedule takes the empty
// branch of showNext(), which tears down and then re-arms itself every 30
// seconds without ever rendering again. A shop window scheduled 9–18 therefore
// held its last slide — DOM, bitmaps and all — from six in the evening until
// nine the next morning, and a display whose campaign has ended holds it for
// good. The same branch also re-ran every plugin's teardown 1 800 times a
// night, which the documented contract says happens once.
//
// Hence: teardown() runs each disposer exactly once, drops the array and the
// element, and HANDS BACK the element it released — renderSlide needs it for
// the outgoing half of the transition, and taking it as a return value is what
// makes "we no longer hold this" and "the transition still needs it" both true.

/**
 * @returns {{
 *   el: Element|null,
 *   adopt(node: Element, disposers: Array<() => void>): void,
 *   teardown(): Element|null,
 *   held(): number,
 * }}
 */
export function createSlideHolder() {
  let el = null;
  /** @type {Array<() => void>} */
  let disposers = [];

  return {
    get el() { return el; },

    /** Take ownership of a freshly rendered slide. */
    adopt(node, list) {
      el = node ?? null;
      disposers = Array.isArray(list) ? list : [];
    },

    /**
     * Run every disposer once, then let go of all of them.
     * @returns {Element|null} the element that was on screen, for the caller's
     *   transition — the holder no longer references it.
     */
    teardown() {
      const old = el;
      const list = disposers;
      el = null;
      disposers = [];
      // Cleared BEFORE the disposers run: a teardown that throws must not leave
      // the holder pointing at a half-torn-down slide it would run again.
      for (const d of list) {
        try { d(); } catch (e) { console.warn('slide dispose failed', e); }
      }
      return old;
    },

    /** How many disposers are still held — for tests and for the debug HUD. */
    held() { return disposers.length; },
  };
}
