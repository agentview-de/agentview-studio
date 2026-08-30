// Docs consistency check — the numbers the README and the welcome screen quote
// against the numbers the code actually has.
//
//   node tools/docs-check.mjs [--quiet]
//
// Why this exists: the README claimed "37 widget types" while the registry held
// 38, and adding a 39th made it claim 38. A count in prose is a fact that nobody
// re-derives, so it goes stale the first time somebody adds a plugin and stays
// stale until a reader notices — which, for the first paragraph of a public
// README, is the worst place to be wrong.
//
// Exit code: 0 consistent, 1 drifted.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const quiet = process.argv.includes('--quiet');

// pathToFileURL, not the bare path: on Windows an absolute path starts with a
// drive letter, and the ESM loader reads "D:" as a URL scheme it does not know.
const mod = (rel) => import(pathToFileURL(join(root, rel)).href);

await mod('shared/plugins/all.js');
const registry = await mod('shared/plugins/registry.js');
const { SHAPE_IDS } = await mod('shared/data/shapes.js');

const widgetCount = registry.listTypes().length;
const shapeCount = SHAPE_IDS.length;

const problems = [];

// Every "<n> widget types" / "<n> Widget-Typen" in prose has to be the real one.
// The pattern is deliberately narrow: it matches the claim, not any number that
// happens to sit near the word "widget".
function checkCounts(file, patterns) {
  const text = readFileSync(join(root, file), 'utf8');
  for (const [re, expected, what] of patterns) {
    for (const m of text.matchAll(re)) {
      const found = Number(m[1]);
      if (found !== expected) {
        problems.push(`${file}: says ${found} ${what}, registry has ${expected} — "${m[0]}"`);
      }
    }
  }
}

const WIDGETS_EN = [/(\d+)\s+widget types/g, widgetCount, 'widget types'];
const WIDGETS_DE = [/(\d+)\s+Widget-Typen/g, widgetCount, 'widget types'];
const SHAPES_EN = [/(\d+)\s+of them — rectangles/g, shapeCount, 'shapes'];

checkCounts('README.md', [WIDGETS_EN, SHAPES_EN]);
checkCounts('admin/locales/en.js', [WIDGETS_EN]);
checkCounts('admin/locales/de.js', [WIDGETS_DE]);

// The README's widget catalog lists every widget by its LABEL — the name the
// library shows — so that is what to look for. A plugin added without a catalog
// row is invisible to anyone reading the docs, which is how "Custom Widget" sat
// unlisted through several releases.
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const tableStart = readme.indexOf('| Group | Widgets |');
if (tableStart < 0) {
  problems.push('README.md: the widget catalog table is gone');
} else {
  // The table runs to the first blank line after it.
  const rest = readme.slice(tableStart);
  const table = rest.slice(0, rest.search(/\r?\n\r?\n/));
  const missing = registry.list().filter(p => !table.includes(p.label));
  if (missing.length) {
    problems.push(`README.md: widget catalog is missing ${missing.map(p => p.label).join(', ')}`);
  }
}

if (problems.length) {
  console.error('docs drift:\n' + problems.map(p => '  ' + p).join('\n'));
  process.exit(1);
}
if (!quiet) {
  console.log(`docs ok · ${widgetCount} widget types · ${shapeCount} shapes · catalog complete`);
}
