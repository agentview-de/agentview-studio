// Robust Server-Sent Events consumer for /api/v1/agent/events.
// Uses ReadableStream (the endpoint streams newline-delimited JSON, not strict SSE).

import { state } from './store.js';

let _ctrl = null;
const _listeners = new Set();

export function onEvent(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function isOpen() { return _ctrl !== null && !_ctrl.signal.aborted; }

export async function start() {
  if (isOpen()) return;
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
    if (!res.ok || !res.body) throw new Error('SSE open failed');
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
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.warn('SSE error — reconnecting in 5s', e);
      setTimeout(() => { _ctrl = null; if (state.connection.status === 'connected') start(); }, 5000);
      return;
    }
  } finally {
    if (_ctrl?.signal.aborted) _ctrl = null;
  }
}

export function stop() {
  _ctrl?.abort();
  _ctrl = null;
}
