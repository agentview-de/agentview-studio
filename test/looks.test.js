// Validates the optional looks() "design ideas" every widget may expose for the
// Widget Designer's Looks gallery. The critical check: every patch key must be a
// real field key (in defaults() or the schema) — a typo'd/invented key would
// silently do nothing at runtime, so we catch it here across all widgets.
import { test, expect, describe } from './runner.js';
import { list as listPlugins } from '../shared/plugins/registry.js';
import '../shared/plugins/all.js';

const withLooks = listPlugins().filter(p => typeof p.looks === 'function');

// Build the set of valid content keys for a plugin: defaults() keys ∪ schema
// field keys (incl. row children). schema(def) so content-driven schemas (custom)
// resolve; built-in plugins ignore the argument.
function knownKeys(p) {
  const def = p.defaults();
  const keys = new Set(Object.keys(def));
  const s = p.schema(def);
  for (const f of (s.fields ?? [])) {
    if (f.key) keys.add(f.key);
    if (Array.isArray(f.children)) for (const c of f.children) if (c.key) keys.add(c.key);
  }
  return keys;
}

describe('looks() — design-idea galleries', () => {
  test('at least one widget ships looks() (catches an accidental drop)', () => {
    expect(withLooks.length >= 1).toBeTruthy();
  });

  for (const p of withLooks) {
    test(`${p.type}.looks() returns a non-empty array of well-formed { id, name, patch }`, () => {
      const looks = p.looks();
      expect(Array.isArray(looks)).toBeTruthy();
      expect(looks.length >= 1).toBeTruthy();
      for (const l of looks) {
        if (!l || typeof l.id !== 'string' || !l.id) throw new Error(`${p.type}: a look is missing a string id`);
        if (typeof l.name !== 'string' || !l.name) throw new Error(`${p.type}: look "${l.id}" is missing a name`);
        if (!l.patch || typeof l.patch !== 'object' || Array.isArray(l.patch)) {
          throw new Error(`${p.type}: look "${l.id}" patch must be a plain object`);
        }
      }
    });

    test(`${p.type}.looks() ids are unique`, () => {
      const seen = new Set();
      for (const l of p.looks()) {
        if (seen.has(l.id)) throw new Error(`${p.type}: duplicate look id "${l.id}"`);
        seen.add(l.id);
      }
    });

    test(`${p.type}.looks() patches only real field keys`, () => {
      const known = knownKeys(p);
      for (const l of p.looks()) {
        for (const k of Object.keys(l.patch)) {
          if (!known.has(k)) {
            throw new Error(`${p.type}: look "${l.id}" patches unknown key "${k}" (not in defaults()/schema())`);
          }
        }
      }
    });
  }
});
