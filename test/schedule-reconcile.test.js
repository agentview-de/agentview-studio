// The day-parting re-check, as a decision.
//
// state.currentIdx is a position WITHIN the visible list, not an index into the
// slides. Every bug here comes from forgetting that: when the visible set
// changed length, the same cursor silently pointed at a different slide, so the
// player repeated or skipped one — and a slide whose window had just closed kept
// showing until its duration expired.

import { test, expect, describe } from './runner.js';
import { reconcileVisible } from '../shared/schedule-reconcile.js';

describe('schedule-reconcile · nothing changed', () => {
  test('an identical list is left alone', () => {
    expect(reconcileVisible([0, 1, 2], [0, 1, 2], 1)).toEqual({ action: 'none', cursor: 1 });
  });
  test('two empty lists are also unchanged', () => {
    expect(reconcileVisible([], [], -1).action).toBe('none');
  });
  test('same length but different members is not treated as unchanged', () => {
    // Slide 1 left its window while slide 2 entered — same length, different set.
    // Cursor 0 still shows slide 0, so the cursor only needs re-pointing.
    expect(reconcileVisible([0, 1], [0, 2], 0)).toEqual({ action: 'reindex', cursor: 0 });
  });
});

describe('schedule-reconcile · the slide on screen survives', () => {
  test('REGRESSION: a slide removed BEFORE the current one re-points the cursor', () => {
    // Showing slide 2, at cursor 1. Slide 0 leaves its window.
    // Without re-pointing, cursor 1 would now mean slide 3 — a silent skip.
    expect(reconcileVisible([0, 2, 3], [2, 3], 1)).toEqual({ action: 'reindex', cursor: 0 });
  });
  test('a slide added before the current one shifts the cursor up', () => {
    expect(reconcileVisible([2, 3], [0, 2, 3], 0)).toEqual({ action: 'reindex', cursor: 1 });
  });
  test('a change after the current slide keeps it in place', () => {
    expect(reconcileVisible([0, 1], [0, 1, 5], 0)).toEqual({ action: 'reindex', cursor: 0 });
  });
});

describe('schedule-reconcile · the slide on screen leaves its window', () => {
  test('REGRESSION: the current slide going out of schedule advances at once', () => {
    // Showing slide 1 (the lunch menu). 14:00 passes; it is no longer visible.
    // It must not keep running to the end of its five-minute duration.
    expect(reconcileVisible([0, 1, 2], [0, 2], 1)).toEqual({ action: 'advance', cursor: -1 });
  });
  test('everything going out of schedule advances', () => {
    expect(reconcileVisible([0, 1], [], 0)).toEqual({ action: 'advance', cursor: -1 });
  });
  test('a cursor that pointed nowhere advances rather than guessing', () => {
    expect(reconcileVisible([0, 1], [0, 1, 2], 9).action).toBe('advance');
    expect(reconcileVisible([], [0], -1).action).toBe('advance');
  });
});

describe('schedule-reconcile · robustness', () => {
  test('non-arrays are treated as empty rather than throwing', () => {
    expect(reconcileVisible(null, [0], 0).action).toBe('advance');
    expect(reconcileVisible([0], null, 0).action).toBe('advance');
    expect(reconcileVisible(undefined, undefined, -1).action).toBe('none');
  });
  test('the first slide is not a special case', () => {
    expect(reconcileVisible([4, 5, 6], [5, 6], 0)).toEqual({ action: 'advance', cursor: -1 });
    expect(reconcileVisible([4, 5, 6], [4, 6], 0)).toEqual({ action: 'reindex', cursor: 0 });
  });
});
