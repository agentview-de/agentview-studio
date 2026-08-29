// The reconnect schedule for the event stream. The old one was `setTimeout(…,
// 5000)` — flat, unbounded, and identical in every open editor, so a server
// that came back found every Studio knocking in lockstep.

import { test, expect, describe } from './runner.js';
import { backoffDelay } from '../shared/reconnect-backoff.js';

const noJitter = { jitter: 0 };

describe('reconnect-backoff', () => {
  test('doubles from the base', () => {
    expect(backoffDelay(1, noJitter)).toBe(1000);
    expect(backoffDelay(2, noJitter)).toBe(2000);
    expect(backoffDelay(3, noJitter)).toBe(4000);
    expect(backoffDelay(4, noJitter)).toBe(8000);
  });

  test('stops at the cap instead of growing without bound', () => {
    expect(backoffDelay(7, noJitter)).toBe(60_000);
    expect(backoffDelay(50, noJitter)).toBe(60_000);
    expect(backoffDelay(5000, noJitter)).toBe(60_000);   // 2 ** 4999 is Infinity
  });

  test('a custom base and cap are honoured', () => {
    expect(backoffDelay(1, { base: 250, cap: 4000, jitter: 0 })).toBe(250);
    expect(backoffDelay(3, { base: 250, cap: 4000, jitter: 0 })).toBe(1000);
    expect(backoffDelay(9, { base: 250, cap: 4000, jitter: 0 })).toBe(4000);
  });

  test('jitter spreads clients that dropped together', () => {
    const at = r => backoffDelay(3, { rand: () => r });   // raw 4000, ±25%
    expect(at(0)).toBe(3000);
    expect(at(0.5)).toBe(4000);
    expect(at(1)).toBe(5000);
  });

  test('jitter never pushes a delay past the cap', () => {
    expect(backoffDelay(20, { rand: () => 1 })).toBe(60_000);
  });

  test('a nonsense attempt number is treated as the first', () => {
    expect(backoffDelay(0, noJitter)).toBe(1000);
    expect(backoffDelay(-3, noJitter)).toBe(1000);
    expect(backoffDelay(NaN, noJitter)).toBe(1000);
    expect(backoffDelay(undefined, noJitter)).toBe(1000);
  });

  test('the delay is never negative', () => {
    expect(backoffDelay(1, { jitter: 3, rand: () => 0 })).toBe(0);
  });
});
