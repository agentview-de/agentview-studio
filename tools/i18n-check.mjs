// Static translation checker for this zero-build app.
//
// The Studio ships two translation mechanisms and both fail SILENTLY:
//
//   t('some.key')  looks the key up in admin/locales/{en,de}.js and — when it
//                  is missing — returns THE KEY ITSELF. So a forgotten entry
//                  does not throw and does not log; it puts "pub.noLastTarget"
//                  in a toast where a sentence belongs. Two call sites had even
//                  written `t('x') ?? 'fallback'` and `t('x') || 'fallback'`,
//                  which can never fire for exactly that reason.
//   tx('English')  looks the English source up in overlay.de.js and falls back
//                  to the source. A missing entry leaves an English string in a
//                  German UI — invisible to anyone testing in English.
//
// This walks the source, collects every literal key and source string, and
// checks them against the dictionaries. It needs nothing but Node, so it never
// compromises the app's zero-build, framework-free guarantee.
//
// Usage:
//   node tools/i18n-check.mjs            # report; exit 1 on hard errors
//   node tools/i18n-check.mjs --strict   # also fail on unused keys / missing tx
//   node tools/i18n-check.mjs --quiet    # only the summary and the errors
//
// Hard errors (always exit 1):
//   · a t() key in NEITHER dictionary            → the key renders on screen
//   · a key in one dictionary but not the other  → one locale renders the key
//   · {placeholders} that differ between en/de   → a literal {x} on screen
//   · a call that does not fill every {placeholder} of its string
//
// Soft findings (report; --strict to fail):
//   · dictionary entries nothing references
//   · tx() sources with no German translation

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { en } from '../admin/locales/en.js';
import { de } from '../admin/locales/de.js';
import { overlayDe } from '../admin/locales/overlay.de.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const strict = process.argv.includes('--strict');
const quiet = process.argv.includes('--quiet');

// ---------- collect ----------

const files = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_measure') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js') && !p.includes(`locales${sep}`)) files.push(p);
  }
}
for (const d of ['admin', 'shared', 'player']) walk(join(ROOT, d));

/**
 * Read the balanced `{ … }` that follows `, ` at `i`, and return the property
 * names at its top level. A regex cannot do this: every params object in this
 * codebase interpolates (`{ email: `<b>${esc(x)}</b>` }`), and a lazy `[^}]*`
 * stops at the FIRST closing brace — inside the template, not at the end.
 */
function paramNamesAt(src, i) {
  let depth = 0, out = new Set(), start = -1;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { depth++; if (depth === 1) start = j; }
    else if (c === '}') { depth--; if (depth === 0) break; }
    else if (depth === 1 && /[A-Za-z_$]/.test(c)) {
      const m = /^([\w$]+)\s*[:,}]/.exec(src.slice(j));
      if (m) { out.add(m[1]); j += m[1].length - 1; }
    }
  }
  return start === -1 ? new Set() : out;
}

const used = new Map();        // key -> Set("file:line")
const callParams = new Map();  // key -> Set(param names seen at any call site)
const dynamic = new Map();     // literal prefix of a computed key -> Set(site)
const txUsed = new Map();      // English source -> Set(site)

// Only files that IMPORT the helper are scanned for it. `t` is the shortest
// identifier there is: the minified vendor bundles are full of `t("./utils")`,
// and a plugin may bind its own `t` from ctx (shared/ deliberately never
// imports admin i18n — that is what the tx() overlay exists for). Following the
// import makes both disappear without an exclusion list to maintain.
function importsHelper(src, name) {
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*i18n\.js['"]/g)) {
    if (m[1].split(',').some(part => part.trim().split(/\s+as\s+/)[0].trim() === name)) return true;
  }
  return false;
}

let scanned = 0;
for (const f of files) {
  const rel = relative(ROOT, f).split(sep).join('/');
  const src = readFileSync(f, 'utf8');
  const hasT = importsHelper(src, 't');
  const hasTx = importsHelper(src, 'tx');
  if (!hasT && !hasTx) continue;
  scanned++;
  const lineOf = idx => src.slice(0, idx).split('\n').length;

  for (const m of hasT ? src.matchAll(/(?<![.\w$])t\(\s*(['"])((?:(?!\1).)*)\1/g) : []) {
    const key = m[2];
    const after = src.slice(m.index + m[0].length);
    const site = `${rel}:${lineOf(m.index)}`;
    if (/^\s*\+/.test(after)) {                      // t('group.' + name)
      if (!dynamic.has(key)) dynamic.set(key, new Set());
      dynamic.get(key).add(site);
      continue;
    }
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(site);
    const comma = /^\s*,\s*\{/.exec(after);
    if (comma) {
      if (!callParams.has(key)) callParams.set(key, new Set());
      for (const p of paramNamesAt(after, comma[0].length - 1)) callParams.get(key).add(p);
    }
  }

  for (const m of hasTx ? src.matchAll(/(?<![.\w$])tx\(\s*(['"])((?:(?!\1).)*)\1\s*\)/g) : []) {
    if (!m[2]) continue;
    if (!txUsed.has(m[2])) txUsed.set(m[2], new Set());
    txUsed.get(m[2]).add(`${rel}:${lineOf(m.index)}`);
  }
}

// ---------- check ----------

const holes = s => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]));
const errors = [];
const notes = [];

// A dynamic prefix is fine as long as SOMETHING in the dictionaries starts with
// it — otherwise the whole family is missing and the guard silently falls back.
for (const [prefix, sites] of dynamic) {
  const any = Object.keys(en).some(k => k.startsWith(prefix));
  if (!any) notes.push(`computed key "${prefix}…" matches no entry — ${[...sites][0]}`);
}

for (const [key, sites] of used) {
  const inEn = key in en, inDe = key in de;
  if (!inEn && !inDe) errors.push(`missing everywhere: ${key}   ${[...sites].slice(0, 2).join(', ')}`);
  else if (!inEn) errors.push(`missing from en: ${key}   ${[...sites][0]}`);
  else if (!inDe) errors.push(`missing from de: ${key}   ${[...sites][0]}`);
}

for (const key of Object.keys(en)) {
  if (!(key in de)) { errors.push(`in en but not de: ${key}`); continue; }
  const a = holes(en[key]), b = holes(de[key]);
  const diff = [...new Set([...a, ...b])].filter(p => a.has(p) !== b.has(p));
  if (diff.length) errors.push(`placeholders differ: ${key}   en{${[...a]}} de{${[...b]}}`);
}
for (const key of Object.keys(de)) if (!(key in en)) errors.push(`in de but not en: ${key}`);

for (const [key, given] of callParams) {
  const need = holes(en[key] ?? de[key] ?? '');
  const missing = [...need].filter(p => !given.has(p));
  if (missing.length) {
    errors.push(`call leaves {${missing}} unfilled: ${key}   ${[...used.get(key)][0]}`);
  }
}

// "Unused" needs more than "no t('literal') call": a key can be chosen far from
// the call site and handed over in a variable — shared/probe-verdict.js returns
// `{ key: 'probe.httpStatus' }` for admin/ui/probe.js to translate, and the
// inspector picks `insp.preset.*` from a table. Those are references too. Any
// key that appears as a bare string literal ANYWHERE in the source counts as
// referenced; what is left is genuinely unreachable.
const mentioned = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(['"])([a-z][\w.]*\.[\w.]+)\1/gi)) mentioned.add(m[2]);
}
const unused = Object.keys(en).filter(k =>
  !used.has(k) && !mentioned.has(k) && ![...dynamic.keys()].some(p => k.startsWith(p)));
const txMissing = [...txUsed.keys()].filter(s => !(s in overlayDe));

// ---------- report ----------

const list = (title, rows) => {
  if (!rows.length) return;
  console.log(`\n${title} (${rows.length}):`);
  for (const r of rows) console.log('  ' + r);
};

list('ERRORS', errors);
if (!quiet) {
  list('notes', notes);
  list('dictionary entries nothing references', unused);
  list('tx() sources with no German', txMissing.map(s => `"${s}"   ${[...txUsed.get(s)][0]}`));
}

console.log(`\n${scanned} files use t()/tx() · ${used.size} keys used · en ${Object.keys(en).length} · de ${Object.keys(de).length} ` +
  `· overlay ${Object.keys(overlayDe).length} · ${txUsed.size} tx() sources`);
console.log(errors.length ? `${errors.length} error(s)` : 'no errors');

const softFail = strict && (unused.length || txMissing.length);
process.exit(errors.length || softFail ? 1 : 0);
