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

// Inline LOCAL `<link rel="stylesheet">` files as `<style>` blocks. The
// published player is ONE standalone HTML on content.agentview.de, so a relative
// href like "styles/slide-themes.css" 404s there and the browser refuses it
// ("MIME type ('') is not a supported stylesheet"). Inlining is CSP-safe — the
// content host allows 'unsafe-inline' and display.html already ships an inline
// <style>. Absolute (CDN / Google Fonts) hrefs are left as live <link>s.
async function inlineLocalStyles(html, baseHtmlUrl) {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href || /^https?:/i.test(href)) continue; // leave CDN/font links live
    const css = await fetchText(resolveImport(baseHtmlUrl, href));
    const styleBlock = `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
    // Inject via a replace *function* so `$` sequences in the CSS are inserted
    // literally — a string replacement treats `$&`, `$'`, `` $` ``, `$$` as
    // special patterns (see the bundle-injection note below).
    html = html.replace(tag, () => styleBlock);
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

export async function bundlePlayer({ baseUrl = '', readUrl = '', windowGlobals = {} } = {}) {
  const displayHtmlUrl = baseUrl + 'display.html';
  let html = await fetchText(displayHtmlUrl);
  html = await inlineLocalStyles(html, displayHtmlUrl);
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

  // Build the globals preamble (BB_READ_URL + BB_STUDIO_VERSION first, for
  // backward compatibility with sample players that read them directly).
  const globalLines = buildGlobalLines(readUrl, windowGlobals);

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
