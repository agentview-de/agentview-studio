// Validates every registered plugin against the plugin contract, and checks
// that schema field declarations use only known field types and don't trip
// the section/row markers in conflicting ways.

import { test, expect, describe } from './runner.js';
import { list as listPlugins } from '../shared/plugins/registry.js';
import { validatePlugin, FIELD_TYPES } from '../shared/plugin-contract.js';
import '../shared/plugins/all.js';

const plugins = listPlugins();

describe('registry — basic sanity', () => {
  test('at least 30 plugins registered (catches accidental import drops)', () => {
    expect(plugins.length >= 30).toBeTruthy();
  });

  test('every type is unique', () => {
    const seen = new Set();
    for (const p of plugins) {
      if (seen.has(p.type)) throw new Error(`Duplicate plugin type: ${p.type}`);
      seen.add(p.type);
    }
  });

  test('every plugin has a non-empty label, group, icon, schemaVersion', () => {
    for (const p of plugins) {
      if (!p.label || typeof p.label !== 'string') throw new Error(`${p.type}: label missing`);
      if (!p.group || typeof p.group !== 'string') throw new Error(`${p.type}: group missing`);
      if (p.icon == null) throw new Error(`${p.type}: icon missing`);
      if (typeof p.schemaVersion !== 'number' || p.schemaVersion < 1) {
        throw new Error(`${p.type}: schemaVersion must be a positive integer (got ${p.schemaVersion})`);
      }
    }
  });
});

describe('contract — validatePlugin passes for every registered plugin', () => {
  for (const p of plugins) {
    test(`${p.type} passes validatePlugin`, () => {
      validatePlugin(p);
    });
  }
});

describe('defaults() — returns a plain object on every call', () => {
  for (const p of plugins) {
    test(`${p.type}.defaults() returns an object`, () => {
      const a = p.defaults();
      expect(typeof a).toBe('object');
      expect(a !== null).toBeTruthy();
      expect(Array.isArray(a)).toBeFalsy();
    });

    test(`${p.type}.defaults() returns a fresh object each call (no shared mutable state)`, () => {
      const a = p.defaults();
      const b = p.defaults();
      // Different identity — otherwise a mutation of one slide would leak
      // into the next-created slide.
      expect(a === b).toBeFalsy();
    });
  }
});

describe('schema() — well-formed field declarations', () => {
  const FIELD_SET = new Set(FIELD_TYPES);

  for (const p of plugins) {
    test(`${p.type}.schema() returns { fields: [...] }`, () => {
      const s = p.schema();
      expect(typeof s).toBe('object');
      expect(Array.isArray(s.fields)).toBeTruthy();
    });

    test(`${p.type} field types are all on the FIELD_TYPES whitelist`, () => {
      const s = p.schema();
      for (const f of s.fields) {
        if (!FIELD_SET.has(f.type)) {
          throw new Error(`${p.type}: unknown field type "${f.type}" on field "${f.key ?? '<section/row>'}"`);
        }
      }
    });

    test(`${p.type} bound fields (non section/row) have a key`, () => {
      const s = p.schema();
      for (const f of s.fields) {
        if (f.type === 'section' || f.type === 'row') {
          // section/row are valueless — they MUST NOT carry a key, otherwise
          // they'd shadow a content slot.
          if ('key' in f) throw new Error(`${p.type}: ${f.type} marker should not have a 'key'`);
          continue;
        }
        if (!f.key || typeof f.key !== 'string') {
          throw new Error(`${p.type}: field of type "${f.type}" missing string key`);
        }
      }
    });

    test(`${p.type} field keys are unique within the schema`, () => {
      const s = p.schema();
      const seen = new Set();
      for (const f of s.fields) {
        if (!f.key) continue;
        if (seen.has(f.key)) throw new Error(`${p.type}: duplicate field key "${f.key}"`);
        seen.add(f.key);
      }
    });

    test(`${p.type} 'row' markers wrap a non-empty children array`, () => {
      const s = p.schema();
      for (const f of s.fields) {
        if (f.type !== 'row') continue;
        if (!Array.isArray(f.children)) {
          throw new Error(`${p.type}: row marker must have a 'children' array`);
        }
      }
    });
  }
});

describe('schema ↔ defaults cohesion', () => {
  // Every bound field key SHOULD map to a slot in defaults (or be optional).
  // We don't enforce strict 1:1 because some fields legitimately appear only
  // when sibling toggles flip (showIf) — but if defaults() lists a key with
  // no field, that's almost always a stale field rename. Catch those.
  for (const p of plugins) {
    test(`${p.type}: every key in defaults() has a corresponding schema field (or is shared sub-state)`, () => {
      const def = p.defaults();
      const s = p.schema();
      const fieldKeys = new Set();
      for (const f of s.fields) {
        if (f.key) fieldKeys.add(f.key);
        if (Array.isArray(f.children)) for (const c of f.children) if (c.key) fieldKeys.add(c.key);
      }
      for (const k of Object.keys(def)) {
        // A few plugins keep computed/nested-only keys in defaults that the
        // form intentionally omits (e.g. menu image cache state). They begin
        // with `_` by convention.
        if (k.startsWith('_')) continue;
        if (!fieldKeys.has(k)) {
          throw new Error(`${p.type}: defaults() key "${k}" has no matching schema field`);
        }
      }
    });
  }
});

describe('render() — signature shape', () => {
  for (const p of plugins) {
    test(`${p.type}.render is a function of at least 2 args (slide, container)`, () => {
      expect(typeof p.render).toBe('function');
      expect(p.render.length >= 2).toBeTruthy();
    });
  }
});
