// What to do when the day-parting schedule changes under a running player.
//
// The player re-evaluates which slides are currently in their time window with
// rebuildVisible(). That produced three problems, all from one line:
//
//     setTimeout(rebuildVisible, 60_000);   // ← at the end of showNext()
//
//   1. It ran per SLIDE CHANGE, not per minute. With 10-second slides the check
//      fired roughly six times a minute; with one long slide it might not fire
//      for the length of that slide. The 60_000 read like "every minute" and was
//      neither.
//   2. Nothing ever cleared those timers, so a playlist change left stale ones
//      pending that still mutated state.
//   3. state.currentIdx is an index INTO the visible list, not into slides. When
//      the list changed length, the same number silently pointed at a different
//      slide — so the player could repeat or skip one — and a slide whose window
//      had just closed kept showing until its duration ran out. A lunch menu with
//      a five-minute duration stayed up five minutes past its schedule.
//
// The decision below is pure so it can be tested without timers or a DOM
// (test/schedule-reconcile.test.js); the runtime owns the interval and the DOM.

/**
 * @param {number[]} prev     visible slide indices before the re-check
 * @param {number[]} next     visible slide indices after it
 * @param {number}   cursor   current position WITHIN `prev`
 * @returns {{ action: 'none'|'reindex'|'advance', cursor: number }}
 *   'none'    — nothing changed, keep playing.
 *   'reindex' — the set changed but the slide on screen is still scheduled;
 *               move the cursor so it keeps pointing at that same slide.
 *   'advance' — the slide on screen has left its window (or there is nothing
 *               left to show); hand over to the normal advance path.
 */
export function reconcileVisible(prev, next, cursor) {
  const before = Array.isArray(prev) ? prev : [];
  const after = Array.isArray(next) ? next : [];

  if (before.length === after.length && before.every((v, i) => v === after[i])) {
    return { action: 'none', cursor };
  }
  if (!after.length) return { action: 'advance', cursor: -1 };

  // Which slide is actually on screen? cursor indexes the OLD list.
  const shown = before[cursor];
  if (shown === undefined) return { action: 'advance', cursor: -1 };

  const moved = after.indexOf(shown);
  if (moved === -1) return { action: 'advance', cursor: -1 };
  return { action: 'reindex', cursor: moved };
}
