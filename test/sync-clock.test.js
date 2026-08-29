// The shared clock behind multi-display sync.
//
// publish-flow stamps a syncAnchor onto EVERY published playlist, so this is
// not a niche feature — it is the path every display takes. It was also the
// only module in shared/ with no test at all.
//
// The interesting assertion is not "which index does the formula return" (that
// part was always right). It is whether two displays booted at different times
// actually show the SAME slide. They did not: the player picked the right index
// at each of its own ticks and then waited a full slide duration from that
// moment, so it stayed permanently out of phase with the anchor. Two screens on
// one wall, seven seconds apart, disagreed 70 % of the time. The fix is
// `remainingMs` — tick at the anchor's boundary, not at now + duration.
//
// Pure: no DOM, no timers, no network. `now` is an argument.

import { test, expect, describe } from './runner.js';
import {
  computeSyncedIndex, syncedSlot, buildSyncAnchor, slideDurationSec, SYNC_MIN_SEC,
} from '../shared/sync-clock.js';

const anchorOf = (sec, epochMs = 0) => ({ epochMs, slideMs: sec.map(s => s * 1000) });

// One display, driven the way player/runtime.js drives it: on every tick read
// the shared clock, render that slide, then wait `tick()` before looking again.
function timeline(sec, bootMs, endMs, tick) {
  const anchor = anchorOf(sec);
  const spans = [];
  let t = bootMs;
  while (t < endMs) {
    const at = syncedSlot(anchor, sec.length, t);
    const wait = tick(at, sec);
    spans.push([t, t + wait, at.index]);
    t += wait;
  }
  return spans;
}
const showing = (spans, t) => spans.find(([a, b]) => t >= a && t < b)?.[2] ?? null;

// How the player scheduled before the fix, and after.
const fullDuration = (at, sec) => sec[at.index] * 1000;
const untilBoundary = (at) => Math.max(250, at.remainingMs);

// Fraction of an hour on which two displays show the same slide.
function agreement(sec, bootMs, tick) {
  const END = 60 * 60 * 1000;
  const a = timeline(sec, 0, END, tick);
  const b = timeline(sec, bootMs, END, tick);
  let same = 0, n = 0;
  // Start counting once BOTH are up — before that the later one is simply off.
  for (let t = bootMs + 60_000; t < END; t += 250) { n++; if (showing(a, t) === showing(b, t)) same++; }
  return same / n;
}

describe('sync clock · the shared timeline', () => {
  test('picks the slide the elapsed time falls into', () => {
    const a = anchorOf([5, 30, 5]);
    expect(computeSyncedIndex(a, 3, 0)).toBe(0);
    expect(computeSyncedIndex(a, 3, 4_999)).toBe(0);
    expect(computeSyncedIndex(a, 3, 5_000)).toBe(1);
    expect(computeSyncedIndex(a, 3, 34_999)).toBe(1);
    expect(computeSyncedIndex(a, 3, 35_000)).toBe(2);
    // …and wraps, which is what makes it a loop.
    expect(computeSyncedIndex(a, 3, 40_000)).toBe(0);
    expect(computeSyncedIndex(a, 3, 40_000 * 137 + 6_000)).toBe(1);
  });

  test('reports how long the current slide still has', () => {
    const a = anchorOf([5, 30, 5]);
    expect(syncedSlot(a, 3, 0).remainingMs).toBe(5_000);
    expect(syncedSlot(a, 3, 4_000).remainingMs).toBe(1_000);
    expect(syncedSlot(a, 3, 5_000).remainingMs).toBe(30_000);
    expect(syncedSlot(a, 3, 34_000).remainingMs).toBe(1_000);
    // A display booting mid-slide gets the REST of it, never a fresh full one.
    expect(syncedSlot(a, 3, 20_000)).toEqual({ index: 1, remainingMs: 15_000, elapsedMs: 20_000, totalMs: 40_000 });
  });

  test('a clock before the anchor still lands inside the loop', () => {
    // Publish stamps epochMs from the publishing browser; a display whose own
    // clock runs behind it must not produce a negative index — it reads the
    // loop from the other end. One second early on a 20 s loop is 19 s in.
    const a = anchorOf([10, 10], 1_000_000);
    expect(computeSyncedIndex(a, 2, 999_000)).toBe(1);
    expect(syncedSlot(a, 2, 999_000).elapsedMs).toBe(19_000);
    expect(computeSyncedIndex(a, 2, 985_000)).toBe(0);
  });

  test('refuses an anchor it cannot trust instead of guessing', () => {
    expect(computeSyncedIndex(null, 2, 0)).toBe(null);
    expect(computeSyncedIndex({ slideMs: [] }, 2, 0)).toBe(null);
    expect(computeSyncedIndex({ epochMs: NaN, slideMs: [1000] }, 1, 0)).toBe(null);
    // Anchor built for a different slide count — the schedule changed under it.
    expect(computeSyncedIndex(anchorOf([10, 10]), 3, 0)).toBe(null);
    expect(computeSyncedIndex(anchorOf([10, 10]), 0, 0)).toBe(null);
    expect(computeSyncedIndex(anchorOf([0, 0]), 2, 0)).toBe(null);
  });

  test('REGRESSION: a non-numeric entry cannot park every display on the last slide', () => {
    // The sum coerced a bad entry to 0, the walk added it raw: one "8000" out
    // of a hand-edited or re-serialised bundle turned the accumulator into a
    // string and `elapsed < acc` stopped being true for anything.
    const a = { epochMs: 0, slideMs: [10_000, '8000', 10_000] };
    expect(computeSyncedIndex(a, 3, 1_000)).toBe(0);
    expect(computeSyncedIndex(a, 3, 12_000)).toBe(1);
    expect(computeSyncedIndex(a, 3, 20_000)).toBe(2);
    const broken = { epochMs: 0, slideMs: [10_000, null, 10_000] };
    expect(computeSyncedIndex(broken, 3, 1_000)).toBe(0);
    expect(computeSyncedIndex(broken, 3, 12_000)).toBe(2);
  });
});

describe('sync clock · the anchor a publish stamps', () => {
  test('REGRESSION: the anchor reads the same duration the player will show', () => {
    // The player shows `slide.duration ?? defaults.duration ?? 10`, floored at
    // SYNC_MIN_SEC. The anchor used to read `+duration || 10` and never look at
    // the playlist defaults — so a playlist that set its duration once, at the
    // top, was budgeted 10 s a slide while every display showed 20, and the two
    // timelines drifted apart for good.
    const pl = { defaults: { duration: 20 }, slides: [{ duration: 8 }, {}, { duration: 30 }] };
    expect(buildSyncAnchor(pl, 0).slideMs).toEqual([8_000, 20_000, 30_000]);
    // Both ends floor the same way: the anchor used to allow 1 s, the player 2.
    expect(buildSyncAnchor({ slides: [{ duration: 1 }] }, 0).slideMs).toEqual([SYNC_MIN_SEC * 1000]);
    expect(slideDurationSec({ duration: 0 }, null)).toBe(10);
    expect(slideDurationSec({}, { duration: 45 })).toBe(45);
    expect(slideDurationSec({ duration: 'nonsense' }, null)).toBe(10);
    expect(buildSyncAnchor({ slides: [] }, 0)).toBe(null);
    expect(buildSyncAnchor(null, 0)).toBe(null);
  });
});

describe('sync clock · two displays on one wall', () => {
  test('REGRESSION: neighbours booted apart show the same slide, always', () => {
    // The whole promise of the feature. Ticking at the anchor's boundary makes
    // the boot time irrelevant; ticking a full duration from each display's own
    // tick does not, and that is what shipped.
    for (const sec of [[10, 10, 10], [8, 8, 30, 8], [5, 30, 5]]) {
      for (const bootMs of [3_000, 7_000, 17_000, 121_500]) {
        expect(agreement(sec, bootMs, untilBoundary)).toBe(1);
      }
    }
  });

  test('and the old scheduling really did disagree — this is what was fixed', () => {
    // A control inside the suite: same simulation, the old timer. If this ever
    // starts passing, the simulation stopped measuring anything.
    expect(agreement([10, 10, 10], 7_000, fullDuration) < 0.5).toBeTruthy();
    expect(agreement([8, 8, 30, 8], 7_000, fullDuration) < 0.9).toBeTruthy();
  });

  test('a display flips at the anchor boundary, not a full duration after boot', () => {
    // Booting 4 s into a 10 s slide must hold that slide for 6 s, not 10.
    const at = syncedSlot(anchorOf([10, 10, 10]), 3, 4_000);
    expect(at.index).toBe(0);
    expect(untilBoundary(at)).toBe(6_000);
    // …and the following ticks land exactly on the boundaries from then on.
    const spans = timeline([10, 10, 10], 4_000, 60_000, untilBoundary);
    expect(spans.slice(0, 4)).toEqual([[4_000, 10_000, 0], [10_000, 20_000, 1], [20_000, 30_000, 2], [30_000, 40_000, 0]]);
  });
});
