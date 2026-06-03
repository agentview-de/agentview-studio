// Static ES-module import-graph checker for this zero-build app.
//
// The app ships as plain ES modules (no bundler), so dead modules and broken
// relative imports can creep in across redesigns. This tool walks the import
// graph from the HTML entry points
// and reports:
//   1. reachable modules        — everything the app actually loads
//   2. broken imports           — a reachable file importing a path not on disk
//   3. orphan .js/.mjs files     — present in the folder but unreachable
//
// It needs nothing but Node (no deps) so it never compromises the apps'
// zero-build, framework-free guarantee. Run it by hand or in CI.
//
// Usage:
//   node tools/import-graph.mjs <app-dir>         # report
//   node tools/import-graph.mjs <app-dir> --strict # also exit 1 if orphans exist
//
// Examples:
//   node tools/import-graph.mjs .                  # this repo (defaults to .)
//   node tools/import-graph.mjs . --strict
//
// Exit codes: 0 = clean · 1 = broken imports (or orphans with --strict).

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, join, extname } from 'node:path';
import { parseImports } from '../shared/module-graph.js';

const root = resolve(process.argv[2] ?? '.');
const strict = process.argv.includes('--strict');

if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`Not a directory: ${root}`);
  process.exit(2);
}

// Module-specifier detection is shared/module-graph.js → parseImports(): the
// SAME parser the publish bundler walks the player graph with, so this tool's
// reachability report can't drift from what actually gets bundled.

// ---- filesystem helpers ----------------------------------------------------
const SCRIPT_EXT = new Set(['.js', '.mjs']);
// 'test' and 'tools' hold suites and tooling that are run on their own (or by
// hand) and are never reached from the app's HTML entry points — excluding them
// keeps the orphan report focused on genuinely-dead app modules.
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', 'test', 'tools', '.chrome-profile']);

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkFiles(join(dir, entry.name), out);
    } else {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // bare/CDN → skip
  const target = resolve(dirname(fromFile), spec);
  for (const c of [target, target + '.js', target + '.mjs', join(target, 'index.js')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return target; // unresolved — reported as broken
}

// ---- entry-point discovery -------------------------------------------------
// Every <script type="module" src="./..."> in any *.html under the app root.
const moduleScriptRe = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;

function discoverEntries(allFiles) {
  const entries = [];
  for (const f of allFiles.filter(p => extname(p).toLowerCase() === '.html')) {
    const html = readFileSync(f, 'utf8');
    let m;
    moduleScriptRe.lastIndex = 0;
    while ((m = moduleScriptRe.exec(html)) !== null) {
      const src = m[1];
      if (src.startsWith('http')) continue;
      const resolved = resolveSpec(f, src.startsWith('.') ? src : './' + src);
      if (resolved) entries.push({ html: f, src, resolved });
    }
  }
  return entries;
}

// ---- reachability walk -----------------------------------------------------
const reachable = new Set();
const broken = [];

function walk(file) {
  if (reachable.has(file)) return;
  reachable.add(file);
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { return; }
  for (const spec of parseImports(src)) {
    const resolved = resolveSpec(file, spec);
    if (resolved === null) continue; // bare specifier
    if (!existsSync(resolved)) { broken.push({ from: file, spec, resolved }); continue; }
    walk(resolved);
  }
}

// ---- run -------------------------------------------------------------------
const allFiles = walkFiles(root);
const entries = discoverEntries(allFiles);

if (!entries.length) {
  console.error(`No <script type="module" src="..."> entry points found under ${root}`);
  process.exit(2);
}
for (const e of entries) walk(e.resolved);

const rel = f => relative(root, f).split('\\').join('/');
const reachableJs = [...reachable].map(rel).sort();
const allJs = allFiles.filter(p => SCRIPT_EXT.has(extname(p).toLowerCase()));
const orphans = allJs.map(rel).filter(p => !reachable.has(resolve(root, p))).sort();

console.log(`agentView import-graph check — ${relative(process.cwd(), root).split('\\').join('/') || '.'}`);
console.log(`\nEntry points (${entries.length}):`);
for (const e of entries) console.log(`  ${rel(e.html)} → ${rel(e.resolved)}`);

console.log(`\nReachable modules (${reachableJs.length}):`);
for (const f of reachableJs) console.log('  ' + f);

console.log(`\nOrphan .js/.mjs files (${orphans.length}) — present but unreachable:`);
if (orphans.length) for (const f of orphans) console.log('  ' + f);
else console.log('  (none)');

if (broken.length) {
  console.log(`\nBROKEN IMPORTS (${broken.length}):`);
  for (const b of broken) console.log(`  ${rel(b.from)} -> ${b.spec}  (resolved: ${rel(b.resolved)})`);
} else {
  console.log('\nNo broken imports. Every imported specifier resolves to a file on disk.');
}

const fail = broken.length > 0 || (strict && orphans.length > 0);
console.log(`\n${fail ? 'FAIL' : 'OK'} — ${broken.length} broken, ${orphans.length} orphan${strict ? ' (strict)' : ''}.`);
process.exit(fail ? 1 : 0);
