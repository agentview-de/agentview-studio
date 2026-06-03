// Tests for shared/module-graph.js — the publish bundler's parser/transform.
// transformModule rewrites every player module into the require()-registry the
// CSP-safe inline bundle runs; a regression here breaks every published display,
// so the supported grammar is pinned here and the unsupported forms are asserted
// to fail LOUDLY at publish time rather than silently.
import { describe, test, expect } from './runner.js';
import { parseImports, rewriteImportSpecifiers, transformModule } from '../shared/module-graph.js';

describe('module-graph · transformModule (supported forms)', () => {
  test('named import → destructured __require', () => {
    const out = transformModule('m', `import { a, b } from "/shared/x.js";`);
    expect(out).toContain('const { a, b } = __require("/shared/x.js");');
    expect(out).notToContain('import');
  });

  test('renamed import (a as c) → key:binding', () => {
    const out = transformModule('m', `import { a as c, d } from "/x.js";`);
    expect(out).toContain('const { a: c, d } = __require("/x.js");');
  });

  test('bare side-effect import → __require call', () => {
    const out = transformModule('m', `import "/shared/side.js";`);
    expect(out).toContain('__require("/shared/side.js");');
    expect(out).notToContain('import "');
  });

  test('export default EXPR → exports.default', () => {
    const out = transformModule('m', `export default makeThing();`);
    expect(out).toContain('exports.default = makeThing();');
  });

  test('export function NAME → bare fn + exports binding', () => {
    const out = transformModule('m', `export function foo(x) { return x; }`);
    expect(out).toContain('function foo(x)');
    expect(out).toContain('exports["foo"] = foo;');
    expect(out).notToContain('export function');
  });

  test('export async function + generator are handled', () => {
    const a = transformModule('m', `export async function load() {}`);
    expect(a).toContain('async function load()');
    expect(a).toContain('exports["load"] = load;');
    const g = transformModule('m', `export function* gen() {}`);
    expect(g).toContain('function* gen()');
    expect(g).toContain('exports["gen"] = gen;');
  });

  test('export const|let|var → bare decl + exports binding', () => {
    const out = transformModule('m', `export const TAU = 6.28;`);
    expect(out).toContain('const TAU = 6.28;');
    expect(out).toContain('exports["TAU"] = TAU;');
  });

  test('bare `export {}` marker is dropped', () => {
    expect(transformModule('m', `export {};`).trim()).toBe('');
  });

  test('non-module code passes through untouched', () => {
    const src = `const x = 1;\nfunction f() { return x; }\n`;
    expect(transformModule('m', src)).toBe(src);
  });

  test('multiple named exports all get bindings', () => {
    const out = transformModule('m', `export const A = 1;\nexport function b() {}\n`);
    expect(out).toContain('exports["A"] = A;');
    expect(out).toContain('exports["b"] = b;');
  });
});

describe('module-graph · transformModule (unsupported forms fail loudly)', () => {
  test('default import throws', () => {
    expect(() => transformModule('p.js', `import x from "/y.js";`)).toThrow(/unsupported module syntax in p\.js/);
  });
  test('namespace import throws', () => {
    expect(() => transformModule('p.js', `import * as ns from "/y.js";`)).toThrow(/unsupported module syntax/);
  });
  test('export class throws', () => {
    expect(() => transformModule('p.js', `export class Foo {}`)).toThrow(/unsupported module syntax/);
  });
  test('re-export (export … from) throws', () => {
    expect(() => transformModule('p.js', `export { y } from "/y.js";`)).toThrow(/unsupported module syntax/);
  });
});

describe('module-graph · parseImports', () => {
  test('finds static, bare, re-export and dynamic specifiers', () => {
    const src = [
      `import { a } from './stat.js';`,
      `import './side.js';`,
      `export { z } from './re.js';`,
      `const m = await import('./dyn.js');`,
    ].join('\n');
    const specs = parseImports(src);
    expect(specs).toContain('./stat.js');
    expect(specs).toContain('./side.js');
    expect(specs).toContain('./re.js');
    expect(specs).toContain('./dyn.js');
  });

  test('dedupes repeated specifiers', () => {
    const specs = parseImports(`import { a } from './x.js';\nimport { b } from './x.js';`);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toBe('./x.js');
  });

  test('ignores import/from substrings that are not at statement start', () => {
    const src = `const note = "use import { x } from 'nope.js' here";\nconsole.log('from ./also-no.js');`;
    expect(parseImports(src)).toHaveLength(0);
  });
});

describe('module-graph · rewriteImportSpecifiers', () => {
  test('absolutises a relative static import, leaves the rest intact', () => {
    const out = rewriteImportSpecifiers(`import { a } from './x.js';`, () => '/shared/x.js');
    expect(out).toBe(`import { a } from '/shared/x.js';`);
  });

  test('rewrites a dynamic import specifier', () => {
    const out = rewriteImportSpecifiers(`const m = import('./d.js');`, () => '/abs/d.js');
    expect(out).toContain(`import('/abs/d.js')`);
  });

  test('a no-op mapper (returns spec unchanged) leaves source byte-identical', () => {
    const src = `import 'https://cdn.example/x.js';\nimport { a } from './keep.js';`;
    expect(rewriteImportSpecifiers(src, s => s)).toBe(src);
  });
});
