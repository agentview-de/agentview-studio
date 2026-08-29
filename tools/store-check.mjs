#!/usr/bin/env node
// Does the store declare anything nobody uses?
//
// Two bugs in two rounds had the same shape: a field sitting in the store,
// declared, commented, and never read or written by a single line outside
// store.js. `meta.publishingTo` was meant to stop a second publish going out
// while the first was still uploading, and did not, because nothing ever set
// it. (The chart's `locale` was the same thing one layer down: declared in the
// schema, absent from the options the canvas drew with.)
//
// A dead field is never merely tidy-up. It is one of two things, and both are
// worth knowing:
//   an INTENTION nobody finished — wire it, or
//   RUBBLE from something that was removed — delete it.
//
// It also costs: `state.ui` is persisted on every autosave, so every dead key
// is written to localStorage forever, and a reader has to work out whether the
// field means anything before they can touch the code around it.
//
// The check is deliberately conservative — a bare word match over every source
// file. It under-reports (a name that collides with any other identifier
// passes) and never cries wolf.
//
// Usage: node tools/store-check.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_REL = 'admin/store.js';
const store = fs.readFileSync(path.join(ROOT, STORE_REL), 'utf8');

// The declared shape: `const _state = { … };` — one nesting level, which is
// where the state lives that other modules read by name.
const from = store.indexOf('_state = {');
const to = store.indexOf('\n};', from);
if (from < 0 || to < 0) {
  console.error('✗ store-check: could not find the _state literal in ' + STORE_REL);
  process.exit(1);
}

/** @type {Record<string, string[]>} */
const slices = {};
let slice = null;
for (const raw of store.slice(from, to).split('\n')) {
  const line = raw.replace(/\/\/.*$/, '');
  const inline = /^ {2}(\w+):\s*\{(.+)\},?\s*$/.exec(line);
  if (inline) { slices[inline[1]] = [...inline[2].matchAll(/(\w+)\s*:/g)].map(m => m[1]); continue; }
  const open = /^ {2}(\w+):\s*\{\s*$/.exec(line);
  if (open) { slice = open[1]; slices[slice] = []; continue; }
  if (/^ {2}\},?\s*$/.test(line)) { slice = null; continue; }
  const key = slice && /^ {4}(\w+)\s*:/.exec(line);
  if (key) slices[slice].push(key[1]);
}

// Everything that could read them — the app, the player, the shared layer and
// the tests. store.js itself is excluded: that is where the declaration is.
const sources = [];
for (const dir of ['admin', 'shared', 'player', 'test', 'tools']) {
  const walk = (d) => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(js|mjs|html)$/.test(e.name) && rel !== STORE_REL) sources.push(rel);
    }
  };
  walk(dir);
}
const corpus = sources.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

let dead = 0;
let fields = 0;
for (const [name, keys] of Object.entries(slices)) {
  fields += keys.length;
  const unused = keys.filter(k => !new RegExp(`\\b${k}\\b`).test(corpus));
  for (const k of unused) {
    dead++;
    console.error(`✗ state.${name}.${k} — declared in ${STORE_REL}, read by nobody`);
  }
}

const summary = `${Object.keys(slices).length} slices · ${fields} fields`;
if (dead) {
  console.error(`\n${summary} · ${dead} dead`);
  console.error('Either finish what it was for, or delete it. A field that means');
  console.error('nothing still gets persisted, and still has to be understood.');
  process.exit(1);
}
console.log(`${summary} · every one of them is used`);
