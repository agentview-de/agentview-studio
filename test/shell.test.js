// Tests for the admin Tab-Shell's pure response helper. openFormModal /
// revealSecretModal are DOM + modal bound and exercised in the browser suite;
// unwrapList is pure and covered here — it owns the list-envelope unwrapping that
// five Verwaltung Tabs used to hand-roll with drifting alias lists.
import { describe, test, expect } from './runner.js';
import { unwrapList } from '../admin/views/admin/shell.js';

describe('admin shell · unwrapList', () => {
  test('a bare array passes straight through', () => {
    expect(unwrapList([1, 2, 3], 'items')).toEqual([1, 2, 3]);
  });

  test('unwraps the first alias key that holds an array', () => {
    expect(unwrapList({ webhooks: [1], items: [2] }, 'webhooks', 'items')).toEqual([1]);
    expect(unwrapList({ items: [2] }, 'webhooks', 'items')).toEqual([2]);
    expect(unwrapList({ keys: ['k'] }, 'keys', 'apiKeys', 'items')).toEqual(['k']);
  });

  test('skips alias keys present but not arrays', () => {
    expect(unwrapList({ rows: null, entries: [7] }, 'rows', 'entries')).toEqual([7]);
  });

  test('no match → empty array (never null/undefined)', () => {
    expect(unwrapList({ nope: 1 }, 'a', 'b')).toEqual([]);
    expect(unwrapList(null, 'x')).toEqual([]);
    expect(unwrapList(undefined)).toEqual([]);
  });
});
