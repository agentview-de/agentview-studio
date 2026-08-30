// Build order — reading an animation sequence out of the delays, and writing a
// new one back.
//
// The sort's tie-breakers are the part worth pinning: the common case is that
// NOTHING has a delay yet, so every build fires at 0, and an order that came
// back arbitrary would make the animation pane look broken before the user had
// done anything wrong.

import { test, expect, describe } from './runner.js';
import {
  buildOrder, restampDelays, sequenceEndMs, hasBuild,
  BUILD_STEP_MS, BUILD_STEP_MAX,
} from '../shared/build-order.js';

const w = (id, delay, z = 0, type = 'fade') => ({
  id, z, ...(type ? { anim: { type, delay, duration: 600 } } : {}),
});
const plain = (id, z = 0) => ({ id, z });

describe('hasBuild', () => {
  test('only a real build counts', () => {
    expect(hasBuild(w('a', 0))).toBe(true);
    expect(hasBuild({ id: 'x', anim: { type: 'none' } })).toBe(false);
    expect(hasBuild({ id: 'x', anim: {} })).toBe(false);
    expect(hasBuild(plain('x'))).toBe(false);
    expect(hasBuild(null)).toBe(false);
  });
});

describe('buildOrder', () => {
  test('delays decide the order', () => {
    const out = buildOrder([w('c', 400), w('a', 0), w('b', 200)]);
    expect(out.map(x => x.id)).toEqual(['a', 'b', 'c']);
  });

  test('with equal delays, z decides — not the array order', () => {
    // The case that happens before anybody has set a delay: every build is at 0
    // and the list has to open in an order that has a reason.
    const out = buildOrder([w('top', 0, 5), w('bottom', 0, 1), w('mid', 0, 3)]);
    expect(out.map(x => x.id)).toEqual(['bottom', 'mid', 'top']);
  });

  test('with equal delay AND z, the array order is the last word — the sort is stable', () => {
    const out = buildOrder([w('first', 0, 0), w('second', 0, 0), w('third', 0, 0)]);
    expect(out.map(x => x.id)).toEqual(['first', 'second', 'third']);
  });

  test('a missing or invalid delay reads as 0 rather than sorting last', () => {
    const broken = { id: 'broken', z: 0, anim: { type: 'fade', delay: 'soon' } };
    const out = buildOrder([w('late', 500), broken]);
    expect(out[0].id).toBe('broken');
  });

  test('a negative delay is treated as 0, not as "before everything"', () => {
    const neg = { id: 'neg', z: 9, anim: { type: 'fade', delay: -500 } };
    const out = buildOrder([w('zero', 0, 1), neg]);
    expect(out.map(x => x.id)).toEqual(['zero', 'neg']);
  });

  test('widgets without a build are still listed — the pane shows the whole slide', () => {
    const out = buildOrder([w('anim', 300), plain('static', 1)]);
    expect(out.map(x => x.id)).toEqual(['static', 'anim']);
  });

  test('an empty or missing list is an empty list', () => {
    expect(buildOrder([])).toEqual([]);
    expect(buildOrder(null)).toEqual([]);
  });

  test('the input array is not reordered underneath the caller', () => {
    const input = [w('c', 400), w('a', 0)];
    buildOrder(input);
    expect(input.map(x => x.id)).toEqual(['c', 'a']);
  });
});

describe('restampDelays', () => {
  test('the sequence is the index times the step', () => {
    const m = restampDelays([w('a', 999), w('b', 5), w('c', 0)], 200);
    expect(m.get('a')).toBe(0);
    expect(m.get('b')).toBe(200);
    expect(m.get('c')).toBe(400);
  });

  test('widgets WITHOUT a build get no delay, and do not consume a slot', () => {
    // Stamping a delay onto a widget with no animation would write a field that
    // does nothing — and leaving a gap in the sequence would be worse still.
    const m = restampDelays([w('a', 0), plain('static'), w('b', 0)], 200);
    expect(m.has('static')).toBe(false);
    expect(m.get('a')).toBe(0);
    expect(m.get('b')).toBe(200);
  });

  test('a step of zero makes every build fire together', () => {
    const m = restampDelays([w('a', 0), w('b', 0), w('c', 0)], 0);
    expect([...m.values()]).toEqual([0, 0, 0]);
  });

  test('a nonsense step falls back to the default rather than to NaN', () => {
    for (const bad of ['soon', NaN, null, undefined, -50]) {
      const m = restampDelays([w('a', 0), w('b', 0)], bad);
      expect(m.get('b')).toBe(BUILD_STEP_MS);
    }
  });

  test('an absurd step is capped, so one drag cannot push a build past any slide', () => {
    const m = restampDelays([w('a', 0), w('b', 0)], 10_000_000);
    expect(m.get('b')).toBe(BUILD_STEP_MAX);
  });

  test('the delays are whole milliseconds', () => {
    const m = restampDelays([w('a', 0), w('b', 0), w('c', 0)], 33.7);
    for (const v of m.values()) expect(Number.isInteger(v)).toBe(true);
  });

  test('an empty list produces an empty map', () => {
    expect(restampDelays([]).size).toBe(0);
    expect(restampDelays(null).size).toBe(0);
  });
});

describe('sequenceEndMs', () => {
  test('the last build to FINISH decides, not the last to start', () => {
    const slow = { id: 'slow', anim: { type: 'fade', delay: 0, duration: 3000 } };
    const late = { id: 'late', anim: { type: 'fade', delay: 400, duration: 600 } };
    expect(sequenceEndMs([slow, late])).toBe(3000);
  });

  test('a missing duration falls back to the build default', () => {
    expect(sequenceEndMs([{ id: 'a', anim: { type: 'fade', delay: 200 } }])).toBe(800);
  });

  test('widgets without a build contribute nothing', () => {
    expect(sequenceEndMs([plain('a'), plain('b')])).toBe(0);
    expect(sequenceEndMs([])).toBe(0);
    expect(sequenceEndMs(null)).toBe(0);
  });
});
