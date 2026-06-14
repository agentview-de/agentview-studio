// Tests for the "My widgets" store. The pure helpers need no I/O; the
// list/save/remove API falls back to an in-memory store when localStorage is
// absent (the node runner), so the round-trip is exercised headlessly too.
import { describe, test, expect } from './runner.js';
import {
  makeEntry, validateEntry, toExportJson, fromImportJson,
  save, list, get, remove, clear, EXPORT_FORMAT,
} from '../shared/custom-widgets.js';

describe('custom-widgets · pure helpers', () => {
  test('makeEntry fills defaults and clones content', () => {
    const content = { a: 1 };
    const e = makeEntry({ name: 'X', baseType: 'custom', content });
    expect(e.kind).toBe('preset');
    expect(typeof e.id).toBe('string');
    expect(e.content).toEqual({ a: 1 });
    content.a = 2;                  // mutate source
    expect(e.content.a).toBe(1);    // entry is insulated
  });

  test('makeEntry defaults an empty name', () => {
    expect(makeEntry({}).name).toBe('Untitled widget');
  });

  test('composite entries carry widgets, not content', () => {
    const e = makeEntry({ kind: 'composite', name: 'L', widgets: [{ type: 'text' }] });
    expect(e.kind).toBe('composite');
    expect(e.widgets).toHaveLength(1);
  });

  test('validateEntry rejects malformed entries', () => {
    expect(validateEntry(makeEntry({ name: 'ok', baseType: 'custom', content: {} }))).toBe(true);
    expect(validateEntry({ kind: 'preset', name: 'no content' })).toBe(false);
    expect(validateEntry({ kind: 'bogus', name: 'x' })).toBe(false);
    expect(validateEntry(null)).toBe(false);
  });

  test('export / import round-trips through the envelope and re-stamps the id', () => {
    const e = makeEntry({ id: 'fixed', name: 'X', baseType: 'custom', content: { a: 1 } });
    const file = toExportJson(e);
    expect(file.format).toBe(EXPORT_FORMAT);
    const back = fromImportJson(file);
    expect(back.name).toBe('X');
    expect(back.content).toEqual({ a: 1 });
    expect(back.id).notToContain('fixed'); // fresh id, not the exported one
  });

  test('fromImportJson accepts a bare entry and rejects junk', () => {
    const back = fromImportJson({ kind: 'preset', name: 'Bare', baseType: 'text', content: {} });
    expect(back.name).toBe('Bare');
    expect(() => fromImportJson({ nope: true })).toThrow(/Invalid|Missing|Not a/);
    expect(() => fromImportJson(null)).toThrow();
  });
});

describe('custom-widgets · storage round-trip', () => {
  test('save / list / get / remove', () => {
    // Only exercise against the in-memory fallback (node). In the browser this
    // shares the real localStorage key, and clear() would wipe the user's
    // actual saved widgets — the pure helpers above already cover the logic.
    if (typeof localStorage !== 'undefined' && localStorage != null) return;
    clear();
    const a = save({ name: 'A', baseType: 'custom', content: { x: 1 } });
    const b = save({ name: 'B', kind: 'composite', widgets: [] });
    expect(list().length).toBe(2);
    expect(get(a.id).name).toBe('A');
    // save with same id updates in place
    save({ id: a.id, name: 'A2', baseType: 'custom', content: { x: 2 } });
    expect(list().length).toBe(2);
    expect(get(a.id).name).toBe('A2');
    expect(remove(b.id)).toBe(true);
    expect(list().length).toBe(1);
    clear();
    expect(list().length).toBe(0);
  });
});
