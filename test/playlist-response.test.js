// Guards the player's front door.
//
// The bug: fetchPlaylist() parsed the response without checking res.ok and
// without checking the shape, then CACHED it before applying it. The agentView
// API answers in JSON for errors too, so a 404 body like {"detail":"Not Found"}
// parsed fine, overwrote the offline cache, and migrated into a playlist with
// zero slides. A wall display went black — and the last good playlist, the one
// thing that could have kept it running through the outage, had just been
// replaced by the error envelope, so the next reboot showed nothing either.
//
// These cases are the error bodies a real API actually returns.

import { test, expect, describe } from './runner.js';
import { checkPlaylistShape, isPlaylistShaped } from '../shared/playlist-response.js';

describe('playlist-response · what is a playlist', () => {
  test('an object with a slides array is one', () => {
    expect(checkPlaylistShape({ slides: [] }).ok).toBe(true);
    expect(checkPlaylistShape({ schemaVersion: 3, slides: [{ id: 'a' }] }).ok).toBe(true);
  });
  test('a bare array is one too — migratePlaylist wraps v1 payloads', () => {
    expect(checkPlaylistShape([]).ok).toBe(true);
    expect(checkPlaylistShape([{ id: 'a' }]).ok).toBe(true);
  });
  test('an empty slides array is still a playlist — that is a real, publishable state', () => {
    expect(isPlaylistShaped({ slides: [] })).toBe(true);
  });
});

describe('playlist-response · what is not', () => {
  test('REGRESSION: a JSON 404 envelope is refused', () => {
    const r = checkPlaylistShape({ detail: 'Not Found' });
    expect(r.ok).toBe(false);
    expect(r.reason.includes('slides')).toBe(true);
  });
  test('REGRESSION: other common error envelopes are refused', () => {
    expect(isPlaylistShaped({ error: 'unauthorized' })).toBe(false);
    expect(isPlaylistShaped({ message: 'Internal Server Error' })).toBe(false);
    expect(isPlaylistShaped({ error: { code: 500 } })).toBe(false);
    expect(isPlaylistShaped({ statusCode: 403, body: '' })).toBe(false);
  });
  test('slides present but not an array is refused', () => {
    expect(isPlaylistShaped({ slides: null })).toBe(false);
    expect(isPlaylistShaped({ slides: 'none' })).toBe(false);
    expect(isPlaylistShaped({ slides: {} })).toBe(false);
  });
  test('empty and non-object bodies are refused', () => {
    expect(isPlaylistShaped(null)).toBe(false);
    expect(isPlaylistShaped(undefined)).toBe(false);
    expect(isPlaylistShaped('')).toBe(false);
    expect(isPlaylistShaped('Not Found')).toBe(false);
    expect(isPlaylistShaped(0)).toBe(false);
    expect(isPlaylistShaped(true)).toBe(false);
  });
});

describe('playlist-response · the reason is useful', () => {
  test('a refusal names the keys that did arrive, so the log points somewhere', () => {
    const r = checkPlaylistShape({ detail: 'Not Found', status: 404 });
    expect(r.reason.includes('detail')).toBe(true);
    expect(r.reason.includes('status')).toBe(true);
  });
  test('an accepted response carries no reason', () => {
    expect(checkPlaylistShape({ slides: [] }).reason).toBe(null);
  });
  test('an empty object says so rather than listing nothing', () => {
    expect(checkPlaylistShape({}).reason.includes('none')).toBe(true);
  });
});
