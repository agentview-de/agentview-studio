// Which field is "the id of a display group".
//
// Every display-category endpoint addresses a category by `categoryId`:
// `/display-categories/{categoryId}`, `?categoryId=…`, `{ categoryIds }`. The
// UI resolved that identity in four places and in three different ways, two of
// which preferred a plain `id`:
//
//   membersOf(c.categoryId ?? c.id)          read the members of a group
//   groupId = g => g.id ?? g.categoryId      key the group sections, publish
//   cid = c.id ?? c.categoryId               a display's own category refs
//   <option value="${g.id ?? g.categoryId}"> the publish picker
//
// While a payload carries only ONE of the names they all agree, which is why
// nothing was visibly broken. The moment it carries both — a row id and the
// category id, as REST payloads do — membership is read under one key while
// publishing, patching, deleting and assigning go to the other: a publish to
// "Filiale Nord" reaching nothing at all.

import { test, expect, describe } from './runner.js';
import { categoryIdOf } from '../admin/api.js';

describe('categoryIdOf · one identity for a display group', () => {
  test('REGRESSION: categoryId wins over a row id, because the endpoint takes categoryId', () => {
    expect(categoryIdOf({ id: 'row-77', categoryId: 'cat-5', name: 'Filiale Nord' })).toBe('cat-5');
  });

  test('either name alone still resolves — payloads carry one or the other', () => {
    expect(categoryIdOf({ categoryId: 'cat-5' })).toBe('cat-5');
    expect(categoryIdOf({ id: 'cat-5' })).toBe('cat-5');
  });

  test('a bare string is already an id — a display lists its categories either way', () => {
    expect(categoryIdOf('cat-5')).toBe('cat-5');
    expect(categoryIdOf('')).toBe('');
  });

  test('nothing usable resolves to the empty string, never to undefined', () => {
    // The value goes into an <option value> and into a URL; "undefined" would
    // travel as a real category id and silently address nothing.
    expect(categoryIdOf(null)).toBe('');
    expect(categoryIdOf(undefined)).toBe('');
    expect(categoryIdOf({})).toBe('');
    expect(categoryIdOf({ name: 'Ohne Id' })).toBe('');
  });
});
