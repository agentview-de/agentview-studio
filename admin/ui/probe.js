// Live "Test" probe for URL-shaped fields. Gives the customer a concrete,
// honest verdict instead of a silently-blank widget at runtime.
//
// probeUrl(url, kind) → { level: 'ok'|'warn'|'error', message }
//   kind: 'url' (generic reachability) | 'json' | 'feed' | 'embed' | 'stream'

import { t } from '../i18n.js';
import { corsVerdict, opaqueVerdict } from '../../shared/probe-verdict.js';

// The verdict lives in shared/probe-verdict.js as pure logic; this file owns the
// two fetch attempts and the timeouts. Splitting them is what let the json
// branch's missing status check become a test instead of a comment.
const say = v => ({ level: v.level, message: t(v.key, v.params) });

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
    const needsBody = kind === 'json' || kind === 'feed';
    const r = await fetch(url, { method: needsBody ? 'GET' : 'HEAD', mode: 'cors', cache: 'no-store', signal: a.signal });
    a.done();
    // Reading the body at all is what proves the provider allows cross-origin
    // reads — so do it for the two kinds that asked for GET, then judge.
    const bodyText = needsBody && r.ok ? await r.text() : '';
    return say(corsVerdict({ kind, ok: r.ok, status: r.status, bodyText }));
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
    return say(opaqueVerdict(kind));
  } catch {
    b.done();
    return { level: 'error', message: t('probe.unreachable') };
  }
}
