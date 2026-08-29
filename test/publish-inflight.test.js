// One publish at a time.
//
// Building the bundle, the server-side dry-run and the upload take as long as
// they take — seconds on a big playlist, longer over a slow link — and nothing
// said so. The toolbar stayed live, the Publish button stayed clickable, and
// Quick-Republish has no dialog in front of it at all: one stray second click
// sent a SECOND bundle to every targeted screen, wrote a second version
// snapshot, and delivered twice.
//
// The store had carried a `meta.publishingTo` field the whole time. Nothing
// ever read or wrote it.
//
// Browser-only, and it stubs fetch: this suite must never leave the machine,
// and a publish is the one action whose whole job is to leave it.

import { test, expect, describe } from './runner.js';
import { state } from '../admin/store.js';
import { publishLast } from '../admin/publish-flow.js';

/** Run `fn` with fetch replaced; returns how many requests it tried to make. */
async function countingFetch(fn) {
  const real = window.fetch;
  let calls = 0;
  window.fetch = () => { calls++; return Promise.reject(new Error('offline (test)')); };
  try { await fn(); } finally { window.fetch = real; }
  return calls;
}

// async, and it AWAITS: a synchronous try/finally around an async callback
// runs its cleanup immediately and restores the state the body is still using.
// That is what made the first run of this file report the flag as already
// cleared.
async function withPublishState(fn) {
  const before = {
    playlist: state.playlist,
    last: state.meta.lastPublish,
    busy: state.meta.publishingTo,
    status: state.connection.status,
    key: state.connection.apiKey,
  };
  state.playlist = { slides: [{ id: 's1', widgets: [] }] };
  state.meta.lastPublish = { mode: 'single', displayIds: ['d-1'], at: 1 };
  state.connection.status = 'connected';
  state.connection.apiKey = 'test-key';
  try { return await fn(); } finally {
    state.playlist = before.playlist;
    state.meta.lastPublish = before.last;
    state.meta.publishingTo = before.busy;
    state.connection.status = before.status;
    state.connection.apiKey = before.key;
  }
}

describe('publish · one at a time', () => {
  test('REGRESSION: a second publish while one is in flight sends nothing', async () => {
    await withPublishState(async () => {
      state.meta.publishingTo = { mode: 'single', displayIds: ['d-1'], at: Date.now() };
      const calls = await countingFetch(() => publishLast());
      expect(calls).toBe(0);
      // …and it did not disturb the one that is running.
      expect(state.meta.publishingTo?.displayIds).toEqual(['d-1']);
    });
  });

  test('REGRESSION: a FAILED publish releases the button again', async () => {
    // In `finally`, not after the happy path — otherwise one failed publish
    // locks the button for the rest of the session.
    await withPublishState(async () => {
      state.meta.publishingTo = null;
      await countingFetch(() => publishLast());
      expect(state.meta.publishingTo).toBe(null);
    });
  });

  test('a publish that has something to do does try', async () => {
    await withPublishState(async () => {
      state.meta.publishingTo = null;
      const calls = await countingFetch(() => publishLast());
      expect(calls > 0).toBeTruthy();
    });
  });

  test('an empty playlist is still refused before anything else', async () => {
    await withPublishState(async () => {
      state.playlist = { slides: [] };
      state.meta.publishingTo = null;
      const calls = await countingFetch(() => publishLast());
      expect(calls).toBe(0);
      expect(state.meta.publishingTo).toBe(null);
    });
  });
});
