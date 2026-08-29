// Which displays belong to which group.
//
// The dashboard buckets displays two ways — a group can list its members, or a
// display can list its groups — and both sides have to agree on what a group's
// id IS. They did not: the group sections were keyed by `id ?? categoryId`
// while the endpoints, and the code that reads membership, use `categoryId`.
//
// With a payload that carries only one of the names nothing looks wrong, which
// is why this survived. Give a group both — a row id and the category id, as
// REST payloads do — and a display that refers to its group by the plain
// category id falls out of the group: "Filiale Nord 1" where it should say 2,
// and "An Group veröffentlichen" addressing a category that does not exist.
//
// Browser-only: displays.js pulls in the editor's DOM modules at import time.

import { test, expect, describe } from './runner.js';
import { membership } from '../admin/views/displays.js';

const D = (id, cats) => ({ id, name: id, status: 'online', online: true, categoryIds: cats });

describe('fleet membership · a group and a display must mean the same id', () => {
  test('a group that lists its members', () => {
    const groups = [{ categoryId: 'cat-5', name: 'Filiale Nord', displayIds: ['d1', 'd2'] }];
    const { byGroup, ungrouped } = membership([D('d1'), D('d2'), D('d3')], groups);
    expect(byGroup.get('cat-5').map(d => d.id)).toEqual(['d1', 'd2']);
    expect(ungrouped.map(d => d.id)).toEqual(['d3']);
  });

  test('a display that lists its groups', () => {
    const groups = [{ categoryId: 'cat-5', name: 'Filiale Nord' }];
    const { byGroup, ungrouped } = membership([D('d1', ['cat-5']), D('d2', [])], groups);
    expect(byGroup.get('cat-5').map(d => d.id)).toEqual(['d1']);
    expect(ungrouped.map(d => d.id)).toEqual(['d2']);
  });

  test('REGRESSION: a group carrying BOTH a row id and a category id', () => {
    // The shape that broke it. One display refers to the group as an object
    // (both names), the other by the bare category id — the identity the API
    // itself uses. Both belong to the group.
    const groups = [{ id: 'row-77', categoryId: 'cat-5', name: 'Filiale Nord' }];
    const displays = [
      D('d1', [{ id: 'row-77', categoryId: 'cat-5' }]),
      D('d2', ['cat-5']),
      D('d3', []),
    ];
    const { byGroup, ungrouped } = membership(displays, groups);
    expect(byGroup.get('cat-5').map(d => d.id)).toEqual(['d1', 'd2']);
    expect(ungrouped.map(d => d.id)).toEqual(['d3']);
  });

  test('a display in no group at all is ungrouped, not lost', () => {
    const { byGroup, ungrouped } = membership([D('d1', [])], [{ categoryId: 'cat-5' }]);
    expect(byGroup.get('cat-5')).toEqual([]);
    expect(ungrouped.map(d => d.id)).toEqual(['d1']);
  });

  test('a reference to a group that is gone does not swallow the display', () => {
    const { byGroup, ungrouped } = membership([D('d1', ['cat-DELETED'])], [{ categoryId: 'cat-5' }]);
    expect(byGroup.get('cat-5')).toEqual([]);
    expect(ungrouped.map(d => d.id)).toEqual(['d1']);
  });
});

// NOT tested here: the filter bar's aria-labels. Mounting the dashboard starts
// refreshFleet() and refreshRunning(), refreshFleet is coalesced, and a queued
// trailing run outlives any fetch stub a test can hold — one request escapes to
// the test server per run and shows up as a console error, which would blind
// the runner's console check for everything else on this page. The labels were
// verified in the browser instead, in both locales, with zero unnamed controls;
// a test for them would have to live on a page of its own.
