// Live "Test" probe for URL-shaped fields. Gives the customer a concrete,
// honest verdict instead of a silently-blank widget at runtime.
//
// probeUrl(url, kind) → { level: 'ok'|'warn'|'error', message }
//   kind: 'url' (generic reachability) | 'json' | 'feed' | 'embed' | 'stream'

import { t } from '../i18n.js';

function withTimeout(ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(id) };
}

export async function probeUrl(url, kind = 'url') {
  if (!url || !String(url).trim()) return { level: 'warn', message: t('probe.empty') };
  let u;
  try { u = new URL(url); } catch { return { level: 'error', message: t('probe.badUrl') }; }
  if (!/^https?:$/.test(u.protocol)) return { level: 'warn', message: t('probe.notHttp') };

  // First attempt: a real CORS request so we can read status / body.
  const a = withTimeout(6000);
  try {
    const r = await fetch(url, { method: (kind === 'json' || kind === 'feed') ? 'GET' : 'HEAD', mode: 'cors', cache: 'no-store', signal: a.signal });
    a.done();
    if (kind === 'json') {
      try {
        const j = JSON.parse(await r.text());
        const n = Array.isArray(j) ? j.length : Object.keys(j).length;
        return { level: 'ok', message: t('probe.jsonOk', { n }) };
      } catch { return { level: 'warn', message: t('probe.notJson') }; }
    }
    if (kind === 'feed') {
      if (!r.ok) return { level: 'warn', message: t('probe.httpStatus', { status: r.status }) };
      await r.text(); // a readable body means the provider allows cross-origin reads
      return { level: 'ok', message: t('probe.feedOk') };
    }
    if (!r.ok) return { level: 'warn', message: t('probe.httpStatus', { status: r.status }) };
    return { level: 'ok', message: t('probe.reachable', { status: r.status }) };
  } catch (e) {
    a.done();
    if (e.name === 'AbortError') return { level: 'error', message: t('probe.timeout') };
  }

  // Second attempt: no-cors. An opaque response means the host is reachable
  // even though it doesn't expose CORS headers (the common case for embeds,
  // camera streams and many feeds).
  const b = withTimeout(5000);
  try {
    await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: b.signal });
    b.done();
    if (kind === 'feed') return { level: 'error', message: t('probe.feedBlocked') };
    if (kind === 'json') return { level: 'warn', message: t('probe.corsBlocked') };
    if (kind === 'embed') return { level: 'warn', message: t('probe.embedMaybe') };
    if (kind === 'stream') return { level: 'warn', message: t('probe.streamMaybe') };
    return { level: 'ok', message: t('probe.reachableNoCors') };
  } catch {
    b.done();
    return { level: 'error', message: t('probe.unreachable') };
  }
}
