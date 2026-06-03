// Tests for shared/binding-resolver.js — getByPath / applyBindings /
// collectUniqueSlots, the slot→content substitution spine shared by the player
// runtime and the editor preview.
//
// The security tests here are deliberately end-to-end: the property that matters
// is that a hostile binding path can NEVER mutate Object.prototype and can never
// surface a planted prototype property as widget content. We assert that global
// invariant directly rather than the internal mechanism.
import { describe, test, expect } from './runner.js';
import { getByPath, applyBindings, applyBindingsToWidgets, collectUniqueSlots } from '../shared/binding-resolver.js';

describe('getByPath · happy paths', () => {
  test('simple single key', () => {
    expect(getByPath({ a: 1 }, 'a')).toBe(1);
  });

  test('nested dotted path', () => {
    expect(getByPath({ a: { b: { c: 7 } } }, 'a.b.c')).toBe(7);
  });

  test('array index via dot and via bracket are equivalent', () => {
    const root = { items: [{}, {}, { name: 'z' }] };
    expect(getByPath(root, 'items.2.name')).toBe('z');
    expect(getByPath(root, 'items[2].name')).toBe('z');
  });

  test('quoted-bracket key form', () => {
    expect(getByPath({ a: { b: 5 } }, "a['b']")).toBe(5);
  });

  test('empty path returns the root itself', () => {
    const root = { a: 1 };
    expect(getByPath(root, '')).toBe(root);
  });
});

describe('getByPath · misses', () => {
  test('null / undefined root → undefined', () => {
    expect(getByPath(null, 'a.b')).toBe(undefined);
    expect(getByPath(undefined, 'a')).toBe(undefined);
  });

  test('missing intermediate key → undefined', () => {
    expect(getByPath({ a: 1 }, 'a.b.c')).toBe(undefined);
  });

  test('descending into a primitive → undefined', () => {
    expect(getByPath({ a: 5 }, 'a.b')).toBe(undefined);
  });
});

describe('getByPath · prototype-pollution defence (read side)', () => {
  // NOTE: these paths must NOT surface anything planted on the prototype chain,
  // and crucially must not let an attacker walk to a writable global object.
  test('a planted __proto__ property is not readable through the path', () => {
    // Even though `__proto__` resolves to the prototype object, reading a
    // property off it that was never set returns undefined.
    expect(getByPath({ a: 1 }, '__proto__.polluted')).toBe(undefined);
    expect(getByPath({ a: { b: 2 } }, 'a.__proto__.polluted')).toBe(undefined);
  });

  test('constructor / prototype chain is cut before anything useful', () => {
    // `constructor` lands on a function; the next hop is neither array nor
    // plain object, so traversal stops with undefined.
    expect(getByPath({ a: 1 }, 'constructor.prototype.polluted')).toBe(undefined);
  });
});

describe('applyBindings · resolution modes', () => {
  test('direct slot value (no jsonPath)', () => {
    const w = { type: 't', bindings: { title: { slot: 's' } }, content: { title: 'orig' } };
    expect(applyBindings(w, { s: 'DIRECT' }).content).toEqual({ title: 'DIRECT' });
  });

  test('jsonPath drills into the slot value', () => {
    const w = { type: 't', bindings: { title: { slot: 's', jsonPath: 'data.title' } }, content: { title: 'orig' } };
    expect(applyBindings(w, { s: { data: { title: 'HELLO' } } }).content).toEqual({ title: 'HELLO' });
  });

  test('fallback used when the slot is missing', () => {
    const w = { type: 't', bindings: { title: { slot: 's', fallback: 'FB' } }, content: { title: 'orig' } };
    expect(applyBindings(w, {}).content).toEqual({ title: 'FB' });
  });

  test('fallback used when jsonPath misses', () => {
    const w = { type: 't', bindings: { title: { slot: 's', jsonPath: 'data.title', fallback: 'FB' } }, content: { title: 'orig' } };
    expect(applyBindings(w, { s: { data: {} } }).content).toEqual({ title: 'FB' });
  });

  test('omitted: no slot data and no fallback leaves content untouched', () => {
    const w = { type: 't', bindings: { title: { slot: 's' } }, content: { title: 'orig' } };
    expect(applyBindings(w, {}).content).toEqual({ title: 'orig' });
  });

  test('binding with no slot is skipped', () => {
    const w = { type: 't', bindings: { title: { jsonPath: 'x' } }, content: { title: 'orig' } };
    expect(applyBindings(w, { s: 'X' }).content).toEqual({ title: 'orig' });
  });

  test('widget without bindings is returned by identity (no clone)', () => {
    const w = { type: 't', content: { a: 1 } };
    expect(applyBindings(w, {})).toBe(w);
    const w2 = { type: 't', bindings: {}, content: { a: 1 } };
    expect(applyBindings(w2, {})).toBe(w2);
  });

  test('does not mutate the original widget content', () => {
    const w = { type: 't', bindings: { title: { slot: 's' } }, content: { title: 'orig' } };
    applyBindings(w, { s: 'NEW' });
    expect(w.content.title).toBe('orig');   // original untouched
  });

  test('nested field path writes into a cloned structure', () => {
    const w = { type: 't', bindings: { 'items.0.label': { slot: 's' } }, content: { items: [{ label: 'old' }] } };
    const out = applyBindings(w, { s: 'NEW' });
    expect(out.content.items[0].label).toBe('NEW');
    expect(w.content.items[0].label).toBe('old');  // source list not mutated
  });
});

describe('applyBindings · prototype-pollution defence (write side)', () => {
  test('a __proto__ field path cannot pollute Object.prototype', () => {
    const w = { type: 't', bindings: { '__proto__.polluted': { slot: 's' } }, content: {} };
    applyBindings(w, { s: 'PWNED' });
    // The global invariant: nothing leaked onto every object in the realm.
    expect(({}).polluted).toBe(undefined);
    expect(Object.prototype.polluted).toBe(undefined);
  });

  test('a constructor.prototype field path cannot pollute Object.prototype', () => {
    const w = { type: 't', bindings: { 'constructor.prototype.pwn': { slot: 's' } }, content: {} };
    applyBindings(w, { s: 'X' });
    expect(({}).pwn).toBe(undefined);
    expect(Object.prototype.pwn).toBe(undefined);
  });
});

describe('applyBindingsToWidgets', () => {
  test('maps over the list applying bindings to each widget', () => {
    const widgets = [
      { type: 't', bindings: { title: { slot: 's' } }, content: { title: 'a' } },
      { type: 't', content: { title: 'b' } },   // no bindings → untouched
    ];
    const out = applyBindingsToWidgets(widgets, { s: 'X' });
    expect(out[0].content.title).toBe('X');
    expect(out[1]).toBe(widgets[1]);
  });

  test('empty / non-array input is returned as-is', () => {
    expect(applyBindingsToWidgets([], {})).toEqual([]);
    expect(applyBindingsToWidgets(null, {})).toBe(null);
  });
});

describe('collectUniqueSlots', () => {
  test('dedups slot slugs across widgets, abVariants and langs', () => {
    const playlist = { slides: [
      {
        widgets: [{ bindings: { t: { slot: 'weather' } } }, { bindings: { x: { slot: 'news' } } }],
        abVariants: [
          { widgets: [{ bindings: { y: { slot: 'weather' } } }] },   // dup weather
          { widgets: [{ bindings: { z: { slot: 'stocks' } } }] },
        ],
        langs: { de: { widgets: [{ bindings: { q: { slot: 'news' } } }, { bindings: { r: { slot: 'calendar' } } }] } },
      },
      { widgets: [{ bindings: { a: { slot: 'stocks' } } }] },        // dup stocks
    ] };
    expect(collectUniqueSlots(playlist).sort()).toEqual(['calendar', 'news', 'stocks', 'weather']);
  });

  test('null playlist / no slides → empty array', () => {
    expect(collectUniqueSlots(null)).toEqual([]);
    expect(collectUniqueSlots({})).toEqual([]);
  });

  test('widgets without bindings (and null widgets) are ignored', () => {
    expect(collectUniqueSlots({ slides: [{ widgets: [{ type: 'text' }, null] }] })).toEqual([]);
  });
});
