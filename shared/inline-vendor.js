// Runtime resolver for vendored runtime libs the publish bundler may INLINE.
//
// Why this exists: widgets lazy-load vendored libs at render time by resolving a
// path against `import.meta.url` (pdf.js worker, hls.js, Leaflet). In a published
// player that runs on the content host, those `shared/vendor/*` siblings don't
// exist (the player is one standalone HTML) AND the agentView asset store rejects
// .js uploads — so the relative URL 404s. The bundler therefore inlines the needed
// libs' SOURCE into a `window.BB_VENDOR` map (only for widget types the playlist
// actually uses — these libs are large), and the loaders resolve through here:
//
//   window.BB_VENDOR = {
//     'hls.min.js':        { kind: 'js',      body: '<source>' },
//     'leaflet/leaflet.css': { kind: 'css',   body: '<source>' },
//     'leaflet/images/marker-icon.png': { kind: 'dataurl', body: 'data:image/png;base64,…' },
//   }
//
// The content-host CSP allows `script-src blob:` and `style-src 'unsafe-inline'`,
// so a blob: <script src> and an inline <style> both run. When BB_VENDOR has no
// entry (the dev shell, or a lib the bundler didn't inline) the loaders fall back
// to their `import.meta.url` resolution, so dev is unaffected.

const _urlCache = new Map();

function entry(key) {
  return (typeof window !== 'undefined' && window.BB_VENDOR) ? window.BB_VENDOR[key] : null;
}

// A URL usable as a script `src` / image `src` for the inlined lib, or null if not
// inlined (caller falls back). JS → a cached blob: URL; images → the data: URL as-is.
// CSS returns null on purpose — inject it as an inline <style> via inlinedVendorSrc()
// (a blob:/data: stylesheet href is NOT covered by `style-src 'unsafe-inline'`).
export function inlinedVendorUrl(key) {
  const e = entry(key);
  if (!e) return null;
  if (e.kind === 'dataurl') return e.body;
  if (e.kind !== 'js') return null;
  if (_urlCache.has(key)) return _urlCache.get(key);
  const url = URL.createObjectURL(new Blob([e.body], { type: 'text/javascript' }));
  _urlCache.set(key, url);
  return url;
}

// The raw inlined source for a key (used for CSS → inline <style>), or null.
export function inlinedVendorSrc(key) {
  return entry(key)?.body ?? null;
}
