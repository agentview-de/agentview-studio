// Robust Server-Sent Events consumer for /api/v1/agent/events.
// Uses ReadableStream (the endpoint streams newline-delimited JSON, not strict SSE).
//
// "Robust" was aspirational. Two holes, both silent:
//
//   1. A stream that ENDS is not an error. When the server closes it — a proxy
//      idle timeout, a deploy, a restart — reader.read() simply reports done,
//      the loop breaks, and the old code fell through to a `finally` that only
//      cleared the controller if the stream had been ABORTED. So `_ctrl` stayed
//      set, isOpen() kept answering true, and every later start() returned
//      immediately. The Studio stopped hearing about displays going on- and
//      offline for the rest of the session, with nothing on screen to say so.
//      Proxies drop idle streams after 30–60 seconds, so this was the normal
//      case, not the edge one.
//   2. The error path retried every 5 s forever, in every open editor, at the
//      same moment — a flat schedule with no cap and no jitter, and no way out
//      for a credential the server had rejected.

import { state } from './store.js';
import { backoffDelay } from '../shared/reconnect-backoff.js';

let _ctrl = null;
let _retryTimer = null;
let _attempt = 0;
// Bumped by stop() and by every start(): a reconnect scheduled by a run that
// has since been superseded must not open a second stream.
let _generation = 0;

const _listeners = new Set();

export function onEvent(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function isOpen() { return _ctrl !== null && !_ctrl.signal.aborted; }
/** Retries since the last stream that worked — 0 while connected. */
export function retryCount() { return _attempt; }

function scheduleReconnect(gen, why) {
  if (gen !== _generation) return;                       // superseded
  if (state.connection.status !== 'connected') return;   // user disconnected meanwhile
  const delay = backoffDelay(++_attempt);
  console.warn(`SSE ${why} — reconnecting in ${Math.round(delay / 1000)}s (attempt ${_attempt})`);
  clearTimeout(_retryTimer);
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    if (gen !== _generation) return;
    _ctrl = null;
    start();
  }, delay);
}

export async function start() {
  if (isOpen()) return;
  clearTimeout(_retryTimer);
  _retryTimer = null;
  const gen = ++_generation;
  _ctrl = new AbortController();
  const url = (location.host && location.host !== 'agentview.de'
    ? '' : state.connection.baseUrl) + '/api/v1/agent/events';
  // One auth scheme matched to the credential (see api.js baseHeaders):
  // `avk_…` API keys go via X-API-Key, session JWTs via Bearer.
  const headers = { 'Accept': 'text/event-stream' };
  if (/^avk_/.test(state.connection.apiKey)) headers['X-API-Key'] = state.connection.apiKey;
  else headers['Authorization'] = `Bearer ${state.connection.apiKey}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: _ctrl.signal,
    });
    // A rejected credential will be rejected again in a minute and in an hour.
    // Retrying it is noise on the server and a lie in the console.
    if (res.status === 401 || res.status === 403) {
      console.warn(`SSE refused the credential (HTTP ${res.status}) — not retrying until you reconnect`);
      return;
    }
    if (!res.ok || !res.body) throw new Error(`open failed (HTTP ${res.status})`);
    _attempt = 0;                    // the stream is up; the next drop starts a fresh schedule
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        // Accept either bare JSON or "data: { … }"
        const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
        try {
          const evt = JSON.parse(payload);
          state.meta.eventsSeen = (state.meta.eventsSeen ?? 0) + 1;
          for (const fn of _listeners) { try { fn(evt); } catch (e) { console.warn('sse listener err', e); } }
        } catch {}
      }
    }
    // Fell out of the read loop: the SERVER ended the stream. Reconnect — this
    // is the path that used to go quiet for the rest of the session.
    scheduleReconnect(gen, 'stream ended');
  } catch (e) {
    if (e.name === 'AbortError') return;
    scheduleReconnect(gen, e.message);
  } finally {
    if (_generation === gen) _ctrl = null;
  }
}

export function stop() {
  _generation++;
  clearTimeout(_retryTimer);
  _retryTimer = null;
  _attempt = 0;
  _ctrl?.abort();
  _ctrl = null;
}
