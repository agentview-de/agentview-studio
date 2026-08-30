// Tiny in-browser test runner. No framework. Tests register synchronously
// via test('name', fn) and run when runAll() is called. Async test fns are
// awaited. expect(...) returns a tiny matcher object.
//
// Usage:
//   import { test, expect, runAll } from './runner.js';
//   test('sanitizer drops <script>', () => {
//     expect(sanitizeHtml('<script>')).toBe('');
//   });
//   await runAll();  // renders results into #test-results

const _suites = [];
let _current = null;

export function describe(name, fn) {
  _current = { name, tests: [] };
  _suites.push(_current);
  fn();
  _current = null;
}

export function test(name, fn) {
  if (!_current) {
    _current = { name: '(root)', tests: [] };
    _suites.push(_current);
  }
  _current.tests.push({ name, fn });
}

export function expect(actual) {
  return {
    toBe(expected) {
      if (!Object.is(actual, expected)) {
        throw new AssertionError(`expected ${fmt(actual)} to be ${fmt(expected)}`);
      }
    },
    toEqual(expected) {
      if (!deepEqual(actual, expected)) {
        throw new AssertionError(`expected ${fmt(actual)} to deeply equal ${fmt(expected)}`);
      }
    },
    toContain(needle) {
      if (typeof actual === 'string') {
        if (!actual.includes(needle)) {
          throw new AssertionError(`expected ${fmt(actual)} to contain ${fmt(needle)}`);
        }
        return;
      }
      if (Array.isArray(actual)) {
        if (!actual.some(x => x === needle)) {
          throw new AssertionError(`expected ${fmt(actual)} to contain ${fmt(needle)}`);
        }
        return;
      }
      throw new AssertionError(`expected ${fmt(actual)} to be a string or array for .toContain()`);
    },
    notToContain(needle) {
      if (typeof actual === 'string' && actual.includes(needle)) {
        throw new AssertionError(`expected ${fmt(actual)} NOT to contain ${fmt(needle)}`);
      }
    },
    // The negatives of toBe/toEqual, spelled the way notToContain already is.
    // "this operation CHANGED something" and "the copy is not the original
    // object" are ordinary things to assert, and without these a test has to
    // reach for a hand-rolled comparison — which is the one place a test can
    // quietly stop testing anything.
    notToBe(expected) {
      if (Object.is(actual, expected)) {
        throw new AssertionError(`expected ${fmt(actual)} NOT to be ${fmt(expected)}`);
      }
    },
    notToEqual(expected) {
      if (deepEqual(actual, expected)) {
        throw new AssertionError(`expected ${fmt(actual)} NOT to deeply equal ${fmt(expected)}`);
      }
    },
    toMatch(re) {
      if (!(re instanceof RegExp)) throw new AssertionError('.toMatch() needs a RegExp');
      if (!re.test(String(actual))) {
        throw new AssertionError(`expected ${fmt(actual)} to match ${re}`);
      }
    },
    toBeTruthy() {
      if (!actual) throw new AssertionError(`expected ${fmt(actual)} to be truthy`);
    },
    toBeFalsy() {
      if (actual) throw new AssertionError(`expected ${fmt(actual)} to be falsy`);
    },
    toHaveLength(n) {
      if (actual?.length !== n) {
        throw new AssertionError(`expected length ${actual?.length} to be ${n}`);
      }
    },
    toThrow(re) {
      if (typeof actual !== 'function') throw new AssertionError('.toThrow() needs a function');
      let threw = false; let msg = '';
      try { actual(); } catch (e) { threw = true; msg = e?.message ?? String(e); }
      if (!threw) throw new AssertionError('expected function to throw');
      if (re && !re.test(msg)) throw new AssertionError(`expected throw message ${fmt(msg)} to match ${re}`);
    },
  };
}

class AssertionError extends Error {
  constructor(msg) { super(msg); this.name = 'AssertionError'; }
}

function fmt(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'function') return v.toString().slice(0, 60) + '…';
  try { return JSON.stringify(v); } catch { return String(v); }
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

export async function runAll(hostSel = '#test-results') {
  const host = document.querySelector(hostSel) ?? document.body;
  host.innerHTML = '';
  const results = [];
  let pass = 0, fail = 0;

  for (const suite of _suites) {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'tr-suite';
    sectionEl.innerHTML = `<h2>${escape(suite.name)}</h2><ul></ul>`;
    const list = sectionEl.querySelector('ul');
    host.appendChild(sectionEl);

    for (const t of suite.tests) {
      const li = document.createElement('li');
      list.appendChild(li);
      // A breadcrumb the harness can read when the page never finishes. A test
      // that hangs used to report as "never produced results" for the WHOLE
      // page — fifteen hundred healthy tests as nothing, with no hint which one
      // stopped. Written before the test runs, so the last value IS the culprit.
      window.__TEST_PROGRESS__ = { suite: suite.name, test: t.name, done: pass + fail };
      let ok = true; let err = null;
      try { await t.fn(); } catch (e) { ok = false; err = e; }
      if (ok) {
        pass++;
        li.className = 'tr-pass';
        li.innerHTML = `<span class="tr-mark">✓</span> ${escape(t.name)}`;
      } else {
        fail++;
        li.className = 'tr-fail';
        li.innerHTML = `<span class="tr-mark">✗</span> ${escape(t.name)}<pre>${escape(err.stack || err.message || String(err))}</pre>`;
        // Eslint-style: also log to console so a CI scraping the page can see it.
        console.error(`[FAIL] ${suite.name} › ${t.name}`, err);
      }
      results.push({ suite: suite.name, name: t.name, ok, err });
    }
  }

  const summary = document.createElement('div');
  summary.className = 'tr-summary ' + (fail === 0 ? 'tr-summary-pass' : 'tr-summary-fail');
  summary.textContent = fail === 0
    ? `✓ All ${pass} tests passed`
    : `✗ ${fail} of ${pass + fail} tests failed`;
  host.insertBefore(summary, host.firstChild);

  // Expose to test driver/CI
  window.__TEST_RESULTS__ = { pass, fail, total: pass + fail, results };
  return { pass, fail, total: pass + fail };
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// DOM-free runner for Node/CI. Runs the same suites registered via
// describe()/test() but prints to a logger instead of rendering to the DOM, so
// the pure-function suites can be exercised headlessly (see test/run-node.mjs).
// The browser path (runAll) is unchanged; this is purely additive.
export async function runAllConsole(log = console.log) {
  let pass = 0, fail = 0;
  const failures = [];
  for (const suite of _suites) {
    for (const t of suite.tests) {
      try {
        await t.fn();
        pass++;
      } catch (e) {
        fail++;
        failures.push({ suite: suite.name, name: t.name, err: e });
      }
    }
  }
  for (const f of failures) {
    const detail = (f.err?.stack || f.err?.message || String(f.err)).split('\n').join('\n    ');
    log(`  ✗ ${f.suite} › ${f.name}\n    ${detail}`);
  }
  log(fail === 0
    ? `\n✓ All ${pass} tests passed`
    : `\n✗ ${fail} of ${pass + fail} tests failed`);
  return { pass, fail, total: pass + fail };
}
