// Publish bundler — turns the dev `display.html` (which loads ES modules) into a
// single self-contained HTML string that can be POSTed to /displays/{id}/content.
//
// Strategy:
//   1. fetch display.html
//   2. find every <script type="module" src="./..."></script>
//   3. recursively follow `import` statements, inlining all reachable files
//   4. concatenate them into ONE inline classic <script>, rewriting import/export
//      into a tiny synchronous require() registry (see transformModule).
//
// Why a require() registry in a CLASSIC inline script (not blob: modules)? The
// published player runs on content.agentview.de under a CSP of roughly
// `script-src 'self' 'unsafe-inline'` — no blob:, no data:, no 'unsafe-eval'. So
// blob-URL `import()`, data: URLs and `new Function` are all refused; only inline
// source the parser sees directly is allowed. One inline registry script has no
// cross-module URLs to resolve, so it boots under that CSP. The registry (rather
// than naïve concatenation) preserves per-module scope and import order/dedupe.
//
// The graph parsing + factory rewrite live in shared/module-graph.js — the same
// seam tools/import-graph.mjs walks — so the two can't drift, and the fragile
// transformModule grammar is unit-tested (test/module-graph.test.js).

import { parseImports, rewriteImportSpecifiers, transformModule } from '../shared/module-graph.js';

const STUDIO_VERSION = '1.0.0';

// Fetch + cache a text resource at base+path.
async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return await res.text();
}

// Fetch a binary resource as a base64 data: URL (browser FileReader). Used to
// inline small vendored images (Leaflet markers) so they need no sibling file.
async function fetchDataUrl(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

// Resolve `./x.js` and `../x.js` relative to a base path.
function resolveImport(from, spec) {
  if (spec.startsWith('http://') || spec.startsWith('https://')) return spec;
  const url = new URL(spec, new URL(from, location.href));
  return url.pathname + url.search;
}

// Walk the file tree starting at entry, collect modules, dedupe. Specifier
// detection + absolutising are shared/module-graph.js (parseImports /
// rewriteImportSpecifiers); collect() only owns the fetch + recursion.
async function collect(entry, modules) {
  if (modules.has(entry)) return;
  const code = await fetchText(entry);
  const mapSpec = (spec) => (spec.startsWith('http') ? spec : resolveImport(entry, spec));
  const rewritten = rewriteImportSpecifiers(code, mapSpec);
  const deps = parseImports(code).map(mapSpec);
  modules.set(entry, { code: rewritten, deps });
  for (const d of deps) {
    if (!d.startsWith('http')) await collect(d, modules);
  }
}

// Produce the bundle as ONE inline classic <script> body (CSP-safe — needs only
// 'unsafe-inline'). Each module becomes a factory in a path-keyed registry; a
// synchronous, cached __require() evaluates the graph from the entry, mirroring
// ES import order + dedupe without any blob: URLs or eval.
function buildBundleScript(entry, modules) {
  const factories = [...modules.entries()].map(([path, m]) =>
    `${JSON.stringify(path)}: function (module, exports, __require) {\n'use strict';\n${transformModule(path, m.code)}\n}`
  ).join(',\n');
  return `(function () {
  var __mods = {
${factories}
  };
  var __cache = Object.create(null);
  function __require(p) {
    if (p in __cache) return __cache[p].exports;
    var module = __cache[p] = { exports: {} };
    var factory = __mods[p];
    if (!factory) throw new Error('Module not in bundle: ' + p);
    factory(module, module.exports, __require);
    return module.exports;
  }
  try {
    __require(${JSON.stringify(entry)});
  } catch (e) {
    console.error('Bundle boot failed', e);
    document.body.insertAdjacentHTML('beforeend',
      '<pre style="position:fixed;inset:0;background:#000;color:#f55;padding:24px;font-family:monospace;white-space:pre-wrap;z-index:99999;">' +
      'agentView Studio failed to start: ' + (e && e.message || e) + '</pre>');
  }
})();`;
}

// Rewrite LOCAL `url(...)` references inside an inlined stylesheet to uploaded-
// asset URLs via resolveAsset(absoluteUrl). The classic case is @font-face in
// styles/fonts.css: `url("/fonts/inter-400.woff2")` resolves against the content
// host (content.agentview.de/fonts/…) where the file doesn't exist → 404 → system-
// font fallback. We resolve each local ref to an asset URL agentView serves.
// http(s) and data: refs are left as-is. `cssUrl` is the stylesheet's own
// absolute URL, so relative AND root-absolute url()s resolve correctly. A failing
// resolve leaves the ref untouched (no worse than today's 404). Exported for tests.
export async function rewriteCssAssetUrls(css, cssUrl, resolveAsset) {
  if (!resolveAsset) return css;
  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  const refs = new Set();
  let m;
  while ((m = urlRe.exec(css)) !== null) {
    const ref = m[2].trim();
    if (ref && !/^(https?:|data:)/i.test(ref)) refs.add(ref);
  }
  if (!refs.size) return css;
  const map = new Map();
  for (const ref of refs) {
    try {
      const assetUrl = await resolveAsset(new URL(ref, cssUrl).href);
      if (assetUrl) map.set(ref, assetUrl);
    } catch { /* leave this ref relative — degrades to today's behaviour */ }
  }
  if (!map.size) return css;
  // String.replace with a /g regex starts fresh from lastIndex 0, so reusing
  // urlRe after the exec loop is safe. Function replacement → `$` in URLs is
  // inserted literally.
  return css.replace(urlRe, (whole, q, ref) => {
    const next = map.get(ref.trim());
    return next ? `url(${q}${next}${q})` : whole;
  });
}

// Inline LOCAL `<link rel="stylesheet">` files as `<style>` blocks. The
// published player is ONE standalone HTML on content.agentview.de, so a relative
// href like "styles/slide-themes.css" 404s there and the browser refuses it
// ("MIME type ('') is not a supported stylesheet"). Inlining is CSP-safe — the
// content host allows 'unsafe-inline' and display.html already ships an inline
// <style>. Absolute (CDN / Google Fonts) hrefs are left as live <link>s. Local
// url(...) refs inside the inlined CSS (fonts!) are pointed at uploaded assets.
async function inlineLocalStyles(html, baseHtmlUrl, resolveAsset) {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href || /^https?:/i.test(href)) continue; // leave CDN/font links live
    let css = await fetchText(resolveImport(baseHtmlUrl, href));
    css = await rewriteCssAssetUrls(css, new URL(href, baseHtmlUrl).href, resolveAsset);
    const styleBlock = `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
    // Inject via a replace *function* so `$` sequences in the CSS are inserted
    // literally — a string replacement treats `$&`, `$'`, `` $` ``, `$$` as
    // special patterns (see the bundle-injection note below).
    html = html.replace(tag, () => styleBlock);
  }
  return html;
}

// INLINE local classic `<script src="…">` tags. display.html loads marked / pdf /
// prism as classic scripts (the player boots against the window.marked /
// window.pdfjsLib / window.Prism globals they define); their relative src 404s on
// the content host. The agentView asset store REJECTS .js uploads (verified: woff2
// 201, every .js 400 — type policy, not size), so unlike fonts these can't become
// assets. Inlining is the reliable path: the content-host CSP allows
// `script-src * 'unsafe-inline'`, so an inline `<script>` boots. type="module"
// scripts are left for the module bundler; http(s)/data: srcs are left live.
// `fetchFn` is injectable so the tag-matching is unit-testable without a network.
// A failed fetch leaves the tag untouched (no worse than today's 404).
export async function inlineLocalScripts(html, baseHtmlUrl, fetchFn = fetchText) {
  const tagRe = /<script\b(?![^>]*\btype\s*=\s*["']?module)[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*><\/script>/gi;
  for (const tag of html.match(tagRe) ?? []) {
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src || /^(https?:|data:)/i.test(src)) continue;
    let js;
    try { js = await fetchFn(new URL(src, baseHtmlUrl).href); }
    catch { continue; /* leave this tag relative — degrades to today's behaviour */ }
    const inline = `<script>${escapeScriptBody(js)}</script>`;
    html = html.replace(tag, () => inline);
  }
  return html;
}

// Public entry: produce a stand-alone HTML string for the player.
// windowGlobals — extra { [name]: jsonifiableValue } pairs assigned to window
// before the bundle boots. Used for v3 features (slot URLs, org brand-kit,
// display language). Names must start with `BB_` by convention.
// Neutralise any literal `</script` so an inline script body can't break out of
// its tag — `\/` inside a JS string is just `/`, so JSON payloads stay valid.
// An owner-set value (e.g. a brand font name `</script><script>…`) would
// otherwise inject into the HTML shipped to the displays. Exported for tests.
export function escapeScriptBody(s) {
  return String(s).replace(/<\/script/gi, '<\\/script');
}

// Build the `window.BB_*` globals preamble lines. Only well-named BB_ keys with a
// defined value pass through; everything is JSON-encoded. Pure + exported so the
// name guard and the script-breakout escaping (via escapeScriptBody) are unit-
// testable without a network round-trip. Returns an array of `window.X = …;`.
export function buildGlobalLines(readUrl = '', windowGlobals = {}) {
  const lines = [
    `window.BB_READ_URL = ${JSON.stringify(readUrl)};`,
    `window.BB_STUDIO_VERSION = ${JSON.stringify(STUDIO_VERSION)};`,
  ];
  for (const [name, value] of Object.entries(windowGlobals)) {
    if (!/^BB_[A-Z0-9_]+$/.test(name)) continue; // ignore badly-named injections
    if (value === undefined) continue;
    lines.push(`window.${name} = ${JSON.stringify(value)};`);
  }
  return lines;
}

// Vendored runtime libs that player widgets lazy-load by resolving a path against
// import.meta.url (→ document.baseURI → content host, where the sibling 404s; and
// the asset store rejects .js). For each widget TYPE present in the playlist we
// inline the libs it needs into `window.BB_VENDOR`; the loaders turn that source
// into blob:/data: URLs at runtime (see shared/inline-vendor.js). Keyed by widget
// type so a text-only player ships none of this (the libs are large). Each spec:
//   kind 'js'  → inline source, loaded as a blob: <script>
//   kind 'css' → inline source, injected as an inline <style> (image url()s →data:)
//   kind 'img' → inline as a base64 data: URL
const VENDOR_MANIFEST = {
  pdf: [{ key: 'pdf.worker.min.js', path: 'shared/vendor/pdf.worker.min.js', kind: 'js' }],
  'stream-cam': [{ key: 'hls.min.js', path: 'shared/vendor/hls.min.js', kind: 'js' }],
  map: [
    { key: 'leaflet/leaflet.js', path: 'shared/vendor/leaflet/leaflet.js', kind: 'js' },
    { key: 'leaflet/leaflet.css', path: 'shared/vendor/leaflet/leaflet.css', kind: 'css' },
    { key: 'leaflet/images/marker-icon.png', path: 'shared/vendor/leaflet/images/marker-icon.png', kind: 'img' },
    { key: 'leaflet/images/marker-icon-2x.png', path: 'shared/vendor/leaflet/images/marker-icon-2x.png', kind: 'img' },
    { key: 'leaflet/images/marker-shadow.png', path: 'shared/vendor/leaflet/images/marker-shadow.png', kind: 'img' },
  ],
};

// The widget types that carry lazy-loaded vendor libs — the SINGLE source of
// truth is VENDOR_MANIFEST above. publish-flow imports this to decide which libs
// to inline for a given playlist, instead of re-hard-coding the same key list
// (which silently went stale when a vendored widget was added here).
export const VENDOR_TYPES = Object.freeze(Object.keys(VENDOR_MANIFEST));

// Build the BB_VENDOR map for the given widget types (deduped). CSS has its local
// image url()s rewritten to data: (reusing rewriteCssAssetUrls with a data:-URL
// resolver) so an inline <style> is self-contained. A per-file failure is skipped
// (that widget degrades) rather than aborting the whole publish.
async function buildVendorGlobals(vendorTypes, baseHtmlUrl) {
  const out = {};
  const seen = new Set();
  for (const t of vendorTypes) {
    for (const spec of VENDOR_MANIFEST[t] ?? []) {
      if (seen.has(spec.key)) continue;
      seen.add(spec.key);
      const url = new URL(spec.path, baseHtmlUrl).href;
      try {
        if (spec.kind === 'js') {
          out[spec.key] = { kind: 'js', body: await fetchText(url) };
        } else if (spec.kind === 'img') {
          out[spec.key] = { kind: 'dataurl', body: await fetchDataUrl(url) };
        } else if (spec.kind === 'css') {
          const css = await rewriteCssAssetUrls(await fetchText(url), url, fetchDataUrl);
          out[spec.key] = { kind: 'css', body: css };
        }
      } catch { /* skip — the widget falls back / degrades, publish continues */ }
    }
  }
  return out;
}

// resolveAsset — optional async (absoluteUrl) => assetUrl hook. When provided,
// local font url()s are uploaded (by the caller, e.g. admin/publish-flow.js) and
// repointed at agentView asset URLs the content host can reach (woff2 uploads are
// accepted). When omitted (unit tests), font rewriting is skipped. Vendor scripts
// in display.html are always INLINED (the asset store rejects .js).
// vendorTypes — widget types present in the playlist; the libs they lazy-load at
// render time (pdf worker, hls, leaflet) are inlined into window.BB_VENDOR.
export async function bundlePlayer({ baseUrl = '', readUrl = '', windowGlobals = {}, resolveAsset = null, vendorTypes = [] } = {}) {
  const displayHtmlUrl = baseUrl + 'display.html';
  let html = await fetchText(displayHtmlUrl);
  html = await inlineLocalStyles(html, displayHtmlUrl, resolveAsset);
  html = await inlineLocalScripts(html, displayHtmlUrl);
  const moduleScriptRe = /<script\s+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g;
  const entries = [];
  let mm;
  while ((mm = moduleScriptRe.exec(html)) !== null) entries.push(mm[1]);

  // Build one combined registry that spans all entry points.
  const modules = new Map();
  for (const e of entries) {
    const abs = e.startsWith('http') ? e : resolveImport(displayHtmlUrl, e);
    await collect(abs, modules);
  }
  // Use the first entry as the boot file.
  const firstEntry = entries[0] ? resolveImport(displayHtmlUrl, entries[0]) : null;
  if (!firstEntry) throw new Error('No <script type="module" src="..."> entry found in display.html');

  const bundleScript = buildBundleScript(firstEntry, modules);

  // Inline the vendored runtime libs the used widgets lazy-load (pdf worker, hls,
  // leaflet) into window.BB_VENDOR — the content host can't serve shared/vendor/*
  // and rejects .js uploads, so the loaders turn this source into blob:/data: URLs
  // (see shared/inline-vendor.js). Scoped to widget types actually in the playlist
  // (these libs are large; a text-only player ships none of them).
  let vendorGlobals = windowGlobals;
  if (vendorTypes.length) {
    const bbVendor = await buildVendorGlobals(vendorTypes, displayHtmlUrl);
    if (Object.keys(bbVendor).length) vendorGlobals = { ...windowGlobals, BB_VENDOR: bbVendor };
  }

  // Build the globals preamble (BB_READ_URL + BB_STUDIO_VERSION first, for
  // backward compatibility with sample players that read them directly).
  const globalLines = buildGlobalLines(readUrl, vendorGlobals);

  // Remove the original module scripts; inject the bundle as a CLASSIC inline
  // script (NOT type="module") so it boots under the content host's CSP.
  html = html.replace(moduleScriptRe, '');
  const tail =
    `<script>${escapeScriptBody(globalLines.join(''))}</script>` +
    `<script>${escapeScriptBody(bundleScript)}</script>` +
    '</body>';
  // Inject via a replace *function*, NOT a replacement string. The bundle and
  // the JSON globals contain `$` (currency symbols like `$`, `CA$`, `US$`, and
  // any `$` in user data). In a replacement STRING, `$'`/`$&`/`` $` ``/`$$` are
  // special patterns — e.g. `$'` (the USD symbol followed by its closing quote)
  // expands to the text *after* `</body>` (i.e. `</html>`), producing an
  // unterminated string and a runtime SyntaxError in the player. A function's
  // return value is inserted verbatim, so `$` is safe.
  html = html.replace('</body>', () => tail);
  return html;
}
