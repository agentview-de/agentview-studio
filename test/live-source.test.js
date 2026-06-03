// Tests for shared/live-source.js — the fetch/poll/abort/backoff spine shared by
// the live-data widgets. Fully deterministic: fetch and the timer are injected,
// so polling, backoff and abort are exercised with a fake clock and no network.
import { describe, test, expect } from './runner.js';
import { liveSource } from '../shared/live-source.js';

// A fake clock: liveSource schedules its poll via _setTimer; the test runs the
// next pending timer by hand, so "poll" is deterministic.
function fakeClock() {
  let nextId = 1;
  const timers = new Map();
  return {
    set: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clear: (id) => timers.delete(id),
    size: () => timers.size,
    async runNext() {
      const first = [...timers.entries()][0];
      if (!first) return false;
      timers.delete(first[0]);
      await first[1].fn();
      return true;
    },
  };
}

// A scripted fetch: each entry is { ok?, status?, body? }, an Error to throw, or
// { abort: true } to throw an AbortError. The last entry repeats.
function fakeFetch(script) {
  let i = 0;
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = script[Math.min(i, script.length - 1)];
    i++;
    if (r instanceof Error) throw r;
    if (r?.abort) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    return { ok: r?.ok ?? true, status: r?.status ?? 200, json: async () => r?.body, text: async () => r?.body };
  };
  fn.calls = calls;
  return fn;
}

// Drain microtasks (and let injected async fetches settle) without advancing the
// fake clock — uses a real macrotask, which never fires liveSource's faked timer.
const settle = () => new Promise(r => setTimeout(r));

describe('live-source · one-shot (intervalMs 0)', () => {
  test('success calls onData once and schedules no poll', async () => {
    const clock = fakeClock();
    const _fetch = fakeFetch([{ body: { hello: 'world' } }]);
    const data = [];
    liveSource({ url: '/x', _fetch, _setTimer: clock.set, _clearTimer: clock.clear, onData: d => data.push(d) });
    await settle();
    expect(data).toHaveLength(1);
    expect(data[0]).toEqual({ hello: 'world' });
    expect(_fetch.calls).toHaveLength(1);
    expect(clock.size()).toBe(0);
  });

  test('a non-ok status fails with gaveUp=true and no onData', async () => {
    const clock = fakeClock();
    let onData = false; const errs = [];
    liveSource({ url: '/x', intervalMs: 0, _fetch: fakeFetch([{ ok: false, status: 503 }]),
      _setTimer: clock.set, _clearTimer: clock.clear,
      onData: () => { onData = true; }, onError: (e, i) => errs.push(i) });
    await settle();
    expect(onData).toBe(false);
    expect(errs).toHaveLength(1);
    expect(errs[0].gaveUp).toBe(true);
  });

  test('onData throwing is routed to onError as an app-level failure', async () => {
    const clock = fakeClock();
    const errs = [];
    liveSource({ url: '/x', _fetch: fakeFetch([{ body: { result: 'error' } }]),
      _setTimer: clock.set, _clearTimer: clock.clear,
      onData: (j) => { if (j.result === 'error') throw new Error('bad body'); },
      onError: (e, i) => errs.push({ msg: e.message, ...i }) });
    await settle();
    expect(errs).toHaveLength(1);
    expect(errs[0].msg).toBe('bad body');
    expect(errs[0].gaveUp).toBe(true);
  });

  test("parse:'text' hands the raw body to onData", async () => {
    const clock = fakeClock();
    let got = null;
    liveSource({ url: '/x', parse: 'text', _fetch: fakeFetch([{ body: '<rss/>' }]),
      _setTimer: clock.set, _clearTimer: clock.clear, onData: d => { got = d; } });
    await settle();
    expect(got).toBe('<rss/>');
  });
});

describe('live-source · polling', () => {
  test('reschedules after each success until disposed', async () => {
    const clock = fakeClock();
    const _fetch = fakeFetch([{ body: 1 }, { body: 2 }, { body: 3 }]);
    const data = [];
    const dispose = liveSource({ url: '/p', intervalMs: 1000, _fetch,
      _setTimer: clock.set, _clearTimer: clock.clear, onData: d => data.push(d) });
    await settle();
    expect(data).toEqual([1]);
    expect(clock.size()).toBe(1);     // one poll queued
    await clock.runNext(); await settle();
    expect(data).toEqual([1, 2]);
    dispose();
    expect(clock.size()).toBe(0);     // dispose cleared the queued poll
  });

  test('dispose before the first response prevents onData', async () => {
    const clock = fakeClock();
    let onData = false;
    const dispose = liveSource({ url: '/p', intervalMs: 1000, _fetch: fakeFetch([{ body: 1 }]),
      _setTimer: clock.set, _clearTimer: clock.clear, onData: () => { onData = true; } });
    dispose();              // before the in-flight fetch settles
    await settle();
    expect(onData).toBe(false);
  });

  test('aborting the parent signal stops the source', async () => {
    const clock = fakeClock();
    const parent = new AbortController();
    let onData = false;
    liveSource({ url: '/p', intervalMs: 1000, signal: parent.signal, _fetch: fakeFetch([{ body: 1 }]),
      _setTimer: clock.set, _clearTimer: clock.clear, onData: () => { onData = true; } });
    parent.abort();
    await settle();
    expect(onData).toBe(false);
    expect(clock.size()).toBe(0);
  });
});

describe('live-source · error policy', () => {
  test('transient errors retry up to maxErrors, then give up', async () => {
    const clock = fakeClock();
    const errs = [];
    liveSource({ url: '/p', intervalMs: 1000, maxErrors: 3,
      _fetch: fakeFetch([new Error('boom'), new Error('boom'), new Error('boom')]),
      _setTimer: clock.set, _clearTimer: clock.clear, onError: (e, i) => errs.push(i) });
    await settle();
    expect(errs).toHaveLength(1);
    expect(errs[0].gaveUp).toBe(false);   // 1st failure → will retry
    await clock.runNext(); await settle();
    expect(errs).toHaveLength(2);
    expect(errs[1].gaveUp).toBe(false);   // 2nd failure → will retry
    await clock.runNext(); await settle();
    expect(errs).toHaveLength(3);
    expect(errs[2].gaveUp).toBe(true);    // 3rd failure → stop
    expect(clock.size()).toBe(0);
  });

  test('a CORS-shaped TypeError gives up immediately, even when polling', async () => {
    const clock = fakeClock();
    const errs = [];
    liveSource({ url: '/p', intervalMs: 1000, stopOnCorsError: true,
      _fetch: fakeFetch([new TypeError('Failed to fetch')]),
      _setTimer: clock.set, _clearTimer: clock.clear, onError: (e, i) => errs.push(i) });
    await settle();
    expect(errs).toHaveLength(1);
    expect(errs[0].cors).toBe(true);
    expect(errs[0].gaveUp).toBe(true);
    expect(clock.size()).toBe(0);
  });

  test('a recovered poll resets the consecutive-error count', async () => {
    const clock = fakeClock();
    const data = []; const errs = [];
    liveSource({ url: '/p', intervalMs: 1000, maxErrors: 2,
      _fetch: fakeFetch([new Error('boom'), { body: 'ok' }, new Error('boom')]),
      _setTimer: clock.set, _clearTimer: clock.clear,
      onData: d => data.push(d), onError: (e, i) => errs.push(i) });
    await settle();                       // err #1 (consecutive 1, retry)
    await clock.runNext(); await settle(); // success → resets, schedules poll
    await clock.runNext(); await settle(); // err again (consecutive back to 1, retry — NOT gaveUp)
    expect(data).toEqual(['ok']);
    expect(errs[errs.length - 1].gaveUp).toBe(false);
  });
});
