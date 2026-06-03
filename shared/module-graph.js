// ES-module graph primitives — the single home for "what does this module
// import?" and "rewrite this module into a require()-registry factory body".
//
// Two callers share this seam so their fragile regex parsers can't drift:
//   • admin/publish.js (browser, publish-time) — bundles the PLAYER graph into
//     one CSP-safe inline <script>. Uses parseImports() to walk the graph,
//     rewriteImportSpecifiers() to absolutise paths, transformModule() to emit
//     the factory body.
//   • tools/import-graph.mjs (Node, dev/CI) — walks the WHOLE app graph to
//     report reachable/orphan/broken modules. Uses parseImports() only.
//
// Pure string/regex logic only — no DOM, no node:fs — so it imports unchanged in
// the browser AND under Node. All I/O (fetch vs readFileSync) stays in the
// callers.
//
// SUPPORTED MODULE SYNTAX (the explicit interface for transformModule).
// The player graph — and therefore everything transformModule must rewrite —
// uses only these forms. Anything else is rejected LOUDLY at publish time
// (see the guard at the end of transformModule) rather than shipped as a player
// that can't boot:
//   import { a, b as c } from '…'      named import          → const { a, b: c } = __require('…')
//   import x from '…'                   default import        → const x = __require('…').default
//   import '…'                          side-effect import    → __require('…')
//   export default EXPR                 default export        → exports.default = EXPR
//   export [async] function NAME        named fn export       → fn + exports.NAME = NAME
//   export function* NAME               generator export      → "
//   export const|let|var NAME           named binding export  → decl + exports.NAME = NAME
//   export {}                           bare module marker     → dropped
// NOT supported (guard throws): namespace imports (`import * as`), combined
// default+named (`import x, { … }`), `export class`, and re-exports
// (`export … from`).
// parseImports() additionally recognises re-exports and dynamic import() for
// GRAPH purposes — finding an edge is always safe; only transformModule is
// restricted.

// Find every module specifier a source file depends on: static imports, bare
// side-effect imports, re-exports (`export … from`), and dynamic import().
// Used to walk the graph; deliberately a SUPERSET of what transformModule can
// rewrite (over-finding an edge never hurts; missing one drops a module).
//
// Fresh regexes per call — never share a /g RegExp instance (its lastIndex is
// stateful and would corrupt re-entrant/parallel calls). Line-anchored (`^`
// multiline) so `import`/`from` substrings inside string or regex literals are
// ignored; binding clauses use `[^'"]*?` (not `[\s\S]*?`) so a match can span a
// multi-line `import {\n a \n} from 'x'` but can never bridge across a string
// delimiter into a different statement.
export function parseImports(code) {
  const res = [
    /^[ \t]*import\s+(?:[^'"]*?\s+)?from\s+["']([^"']+)["']/gm, // import … from '…'
    /^[ \t]*import\s+["']([^"']+)["']/gm,                       // bare import '…'
    /^[ \t]*export\s+(?:[^'"]*?\s+)?from\s+["']([^"']+)["']/gm, // export … from '…'
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,                   // dynamic import('…')
  ];
  const out = new Set();
  for (const re of res) {
    let m;
    while ((m = re.exec(code)) !== null) out.add(m[1]);
  }
  return [...out];
}

// Rewrite each static/bare/dynamic import specifier in `code` via mapSpec(spec).
// Used by the bundler to turn relative specifiers into the absolute paths its
// __require() registry is keyed by. mapSpec returning the spec unchanged is a
// no-op (e.g. http(s) CDN specifiers are left live). The line-anchored static
// regex keeps the `from` clause on ONE line (`[^\n]`, not `[\s\S]`) so a bare
// side-effect `import '…';` can't greedily swallow lines down to the next
// `from` — which would drop a module from the graph and leave it un-rewritten.
// Specifier forms here mirror exactly what transformModule rewrites, so the two
// stay consistent.
export function rewriteImportSpecifiers(code, mapSpec) {
  const importRe = /^\s*import\s+(?:[^\n]+?\s+from\s+)?["']([^"']+)["'];?\s*$/gm;
  const dyImportRe = /import\(\s*["']([^"']+)["']\s*\)/g;
  const sub = (mAll, spec) => {
    const next = mapSpec(spec);
    if (next === spec) return mAll;
    return mAll.replace(`"${spec}"`, `"${next}"`).replace(`'${spec}'`, `'${next}'`);
  };
  return code.replace(importRe, sub).replace(dyImportRe, sub);
}

// Rewrite one ES module's source into a CommonJS-style factory body: imports
// become synchronous __require() calls, exports become assignments onto the
// module's `exports` object. The source is concatenated VERBATIM (no eval, no
// blob) into the inline bundle, so the published player boots under a CSP that
// allows only 'unsafe-inline'. `path` is used solely for the error message.
// See SUPPORTED MODULE SYNTAX above; the guard throws on anything else.
export function transformModule(path, code) {
  const named = [];
  let out = code
    // `export {};` (bare module marker) → drop entirely
    .replace(/^[ \t]*export[ \t]*\{[ \t]*\}[ \t]*;?[ \t]*$/gm, '')
    // `export default EXPR` → `exports.default = EXPR` (EXPR may span lines)
    .replace(/^([ \t]*)export[ \t]+default[ \t]+/gm, '$1exports.default = ')
    // `export [async] function NAME` / `export function* NAME`
    .replace(/^([ \t]*)export[ \t]+(async[ \t]+function\*?|function\*?)[ \t]+([A-Za-z0-9_$]+)/gm,
      (_m, ws, kw, name) => { named.push(name); return `${ws}${kw} ${name}`; })
    // `export const|let|var NAME`
    .replace(/^([ \t]*)export[ \t]+(const|let|var)[ \t]+([A-Za-z0-9_$]+)/gm,
      (_m, ws, kw, name) => { named.push(name); return `${ws}${kw} ${name}`; })
    // `import { a, b as c } from "abs"` → `const { a, b: c } = __require("abs")`
    .replace(/^([ \t]*)import[ \t]*\{([^}]*)\}[ \t]*from[ \t]*["']([^"']+)["'][ \t]*;?/gm,
      (_m, ws, names, spec) => {
        const binds = names.split(',').map(s => s.trim()).filter(Boolean).map(s => {
          const parts = s.split(/[ \t]+as[ \t]+/);
          return parts.length === 2 ? `${parts[0]}: ${parts[1]}` : parts[0];
        }).join(', ');
        return `${ws}const { ${binds} } = __require(${JSON.stringify(spec)});`;
      })
    // `import NAME from "abs"` (default) → `const NAME = __require("abs").default`
    // Disjoint from the named/bare rules above: the identifier after `import`
    // can't be `{`, `*` or a quote, so namespace/combined forms still fall
    // through to the guard. Mirrors `export default EXPR → exports.default`.
    .replace(/^([ \t]*)import[ \t]+([A-Za-z0-9_$]+)[ \t]+from[ \t]*["']([^"']+)["'][ \t]*;?/gm,
      (_m, ws, name, spec) => `${ws}const ${name} = __require(${JSON.stringify(spec)}).default;`)
    // bare `import "abs"` (side-effect) → `__require("abs")`
    .replace(/^([ \t]*)import[ \t]*["']([^"']+)["'][ \t]*;?/gm,
      (_m, ws, spec) => `${ws}__require(${JSON.stringify(spec)});`);

  // Any import/export statement still standing is a form transformModule doesn't
  // handle (a default/namespace import, `export class`, or a re-export). Fail
  // here — at publish time — rather than ship a player that can't boot.
  const leftover = out.match(/^[ \t]*(import[ \t]*[{"'*]|import[ \t]+[A-Za-z_$]|export[ \t]+(default|function|class|const|let|var|async)\b|export[ \t]*\{)/m);
  if (leftover) throw new Error(`publish bundler: unsupported module syntax in ${path}: "${leftover[0].trim()}…" — extend transformModule()`);

  if (named.length) out += '\n' + named.map(n => `exports[${JSON.stringify(n)}] = ${n};`).join('\n');
  return out;
}
