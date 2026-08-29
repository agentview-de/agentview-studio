// Is this HTTP response actually a playlist?
//
// The player used to answer that question by not asking it:
//
//     const res = await fetch(READ_URL, { cache: 'no-store' });
//     const data = await res.json();      // no res.ok check
//     cachePlaylist(data);                // …cached before anything validated it
//     applyPlaylist(data);
//
// The agentView API answers in JSON, errors included. So a 404 or a 500 carrying
// `{"detail":"Not Found"}` parses cleanly, gets written over the offline cache,
// and is then migrated into a playlist with zero slides. The screen goes black —
// and the last good playlist, the one thing that could have kept it running, has
// just been overwritten by the error envelope. A reboot then shows nothing
// either. For a display on a wall with nobody in front of it, a transient server
// error became a permanent blank.
//
// The sibling fetch in the same file (fetchSlotData) already checked `res.ok`.
// This one did not.
//
// Everything below is pure so it can be tested without a network
// (test/playlist-response.test.js). The rule is deliberately narrow: only the
// shapes migratePlaylist() can actually turn into slides count as a playlist.

/**
 * @param {unknown} data  Parsed response body.
 * @returns {{ ok: boolean, code: string|null, reason: string|null, keys?: string, got?: string }}
 *   `ok` false → do not apply it, and above all do not cache it.
 *
 * `reason` is the English sentence the player writes into its own diagnostic
 * overlay, which is English throughout. `code` is the same verdict for callers
 * that have a language: the editor's import shows this to a person, and half a
 * German sentence with an English tail is exactly the seam this app spends its
 * effort not having. The parts a message needs come along as `keys` / `got`.
 */
export function checkPlaylistShape(data) {
  if (data === null || data === undefined) return { ok: false, code: 'empty', reason: 'empty response' };
  // A bare array of slides is a legitimate v1 payload — migratePlaylist wraps it.
  if (Array.isArray(data)) return { ok: true, code: null, reason: null };
  if (typeof data !== 'object') return { ok: false, code: 'not-object', reason: `expected an object, got ${typeof data}`, got: typeof data };
  // Every branch of migratePlaylist needs slides to be an array; without it the
  // result is a playlist with nothing in it, which is indistinguishable on screen
  // from a crash.
  if (!Array.isArray(data.slides)) {
    // Name the likely culprit rather than the symptom — an error envelope is by
    // far the most common thing to arrive here.
    const keys = Object.keys(data).slice(0, 4).join(', ');
    return { ok: false, code: 'no-slides', reason: `no slides array (keys: ${keys || 'none'})`, keys };
  }
  return { ok: true, code: null, reason: null };
}

/** Convenience for call sites that only care about the verdict. */
export function isPlaylistShaped(data) {
  return checkPlaylistShape(data).ok;
}
