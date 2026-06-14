// Pure unit tests for the inspector/designer field-tier filter.
import { test, expect, describe } from './runner.js';
import { filterFieldsByTier } from '../admin/ui/tier-filter.js';

describe('filterFieldsByTier', () => {
  test("'all' (or undefined) returns the same fields (backward-compatible)", () => {
    const fields = [{ key: 'a', type: 'text' }, { key: 'b', type: 'text', tier: 'advanced' }];
    expect(filterFieldsByTier(fields, 'all')).toBe(fields);
    expect(filterFieldsByTier(fields, undefined)).toBe(fields);
  });

  test("'basic' drops tier:'advanced' fields and keeps the rest", () => {
    const keys = filterFieldsByTier([
      { key: 'a', type: 'text' },
      { key: 'b', type: 'number', tier: 'advanced' },
      { key: 'c', type: 'toggle', tier: 'basic' },
    ], 'basic').map(f => f.key);
    expect(keys.includes('a')).toBeTruthy();
    expect(keys.includes('c')).toBeTruthy();
    expect(keys.includes('b')).toBeFalsy();
  });

  test("'basic' filters row children and drops a fully-advanced row", () => {
    const out = filterFieldsByTier([
      { type: 'row', children: [{ key: 'x', type: 'text' }, { key: 'y', type: 'text', tier: 'advanced' }] },
      { type: 'row', children: [{ key: 'p', type: 'text', tier: 'advanced' }, { key: 'q', type: 'text', tier: 'advanced' }] },
    ], 'basic');
    expect(out.length).toBe(1);               // second (all-advanced) row dropped
    expect(out[0].children.length).toBe(1);   // first row keeps only the basic child
    expect(out[0].children[0].key).toBe('x');
  });

  test("'basic' does not mutate the caller's row children", () => {
    const row = { type: 'row', children: [{ key: 'x', type: 'text' }, { key: 'y', type: 'text', tier: 'advanced' }] };
    filterFieldsByTier([row], 'basic');
    expect(row.children.length).toBe(2);      // original untouched (filter returns a copy)
  });

  test("'basic' drops a section whose only content is advanced, and trailing empty sections", () => {
    const sectionKeys = filterFieldsByTier([
      { type: 'section', key: 's1', label: 'Keep' },
      { key: 'a', type: 'text' },
      { type: 'section', key: 's2', label: 'Drop' },
      { key: 'b', type: 'text', tier: 'advanced' },
      { type: 'section', key: 's3', label: 'Trailing empty' },
    ], 'basic').filter(f => f.type === 'section').map(f => f.key);
    expect(sectionKeys.includes('s1')).toBeTruthy();
    expect(sectionKeys.includes('s2')).toBeFalsy();
    expect(sectionKeys.includes('s3')).toBeFalsy();
  });

  test('empty / non-array input is safe', () => {
    expect(filterFieldsByTier(undefined, 'basic').length).toBe(0);
    expect(filterFieldsByTier([], 'basic').length).toBe(0);
  });
});
