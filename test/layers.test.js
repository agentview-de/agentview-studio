// Hide / lock / rename / restack — the model behind the Layers panel.
//
// The panel itself is DOM, but the three rules that matter are not, and two of
// them are the kind that fail silently:
//
//   * `hidden` has to be honoured by the PLAYER, not only by the editor. A
//     widget hidden while designing that still played on the wall would be
//     invisible to the person who hid it and visible to everyone else.
//   * the top-first list order has to be REVERSED on its way to z, and a
//     reversal is exactly the kind of thing that looks right until you drag
//     something.

import { test, expect, describe } from './runner.js';
import { createWidget, isWidgetVisible, visibleWidgets } from '../shared/slide-schema.js';
import { zOrderFromTopFirst } from '../admin/canvas/arrange.js';
import { widgetName } from '../admin/widget-name.js';
import { get as getPlugin } from '../shared/plugins/registry.js';
import '../shared/plugins/all.js';

describe('visibility is one rule, shared by the editor and the player', () => {
  test('a widget is visible unless it says otherwise', () => {
    expect(isWidgetVisible({ id: 'a' })).toBe(true);
    expect(isWidgetVisible({ id: 'a', hidden: false })).toBe(true);
    expect(isWidgetVisible({ id: 'a', hidden: true })).toBe(false);
  });

  test('only an explicit `true` hides — not any old truthy leftover', () => {
    // Playlists are hand-edited and machine-generated. `hidden: "false"` and
    // `hidden: 0` are the shapes that turn up, and neither means "hide this".
    expect(isWidgetVisible({ hidden: 'false' })).toBe(true);
    expect(isWidgetVisible({ hidden: 0 })).toBe(true);
    expect(isWidgetVisible({ hidden: null })).toBe(true);
    expect(isWidgetVisible({ hidden: undefined })).toBe(true);
  });

  test('a missing widget is not visible, and does not throw', () => {
    expect(isWidgetVisible(null)).toBe(false);
    expect(isWidgetVisible(undefined)).toBe(false);
  });

  test('visibleWidgets drops the hidden ones and keeps the order', () => {
    const list = [{ id: 'a' }, { id: 'b', hidden: true }, { id: 'c' }];
    expect(visibleWidgets(list).map(w => w.id)).toEqual(['a', 'c']);
    expect(visibleWidgets(null)).toEqual([]);
    expect(visibleWidgets(undefined)).toEqual([]);
  });
});

describe('createWidget · the flags stay out of the JSON until they are set', () => {
  test('an ordinary widget carries neither key', () => {
    const w = createWidget('text', {});
    expect('hidden' in w).toBe(false);
    expect('locked' in w).toBe(false);
    expect('group' in w).toBe(false);
  });

  test('they are persisted when true', () => {
    const w = createWidget('text', { hidden: true, locked: true, group: 'g_1' });
    expect(w.hidden).toBe(true);
    expect(w.locked).toBe(true);
    expect(w.group).toBe('g_1');
  });

  test('false is the same as absent — no `"hidden": false` noise in the file', () => {
    const w = createWidget('text', { hidden: false, locked: false, group: '' });
    expect('hidden' in w).toBe(false);
    expect('locked' in w).toBe(false);
    expect('group' in w).toBe(false);
  });
});

describe('zOrderFromTopFirst', () => {
  // The Layers list reads top-of-stack downward; z counts upward. The LAST row
  // is therefore the bottom of the stack and gets z 0.
  test('the last row is the bottom of the stack', () => {
    const z = zOrderFromTopFirst(['top', 'middle', 'bottom']);
    expect(z.get('bottom')).toBe(0);
    expect(z.get('middle')).toBe(1);
    expect(z.get('top')).toBe(2);
  });

  test('every id is re-stamped, so no two can tie', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const z = zOrderFromTopFirst(ids);
    expect(z.size).toBe(ids.length);
    expect(new Set(z.values()).size).toBe(ids.length);
  });

  test('the numbers stay dense — 0..n-1, no gaps to drift into', () => {
    const z = zOrderFromTopFirst(['a', 'b', 'c']);
    expect([...z.values()].sort()).toEqual([0, 1, 2]);
  });

  test('an empty or missing list is an empty map, not a throw', () => {
    expect(zOrderFromTopFirst([]).size).toBe(0);
    expect(zOrderFromTopFirst(null).size).toBe(0);
    expect(zOrderFromTopFirst(undefined).size).toBe(0);
  });

  test('the input array is not reversed underneath the caller', () => {
    const ids = ['a', 'b', 'c'];
    zOrderFromTopFirst(ids);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});

describe('widgetName', () => {
  test('a title the user typed wins over the plugin label', () => {
    expect(widgetName({ type: 'text', title: 'Opening hours' })).toBe('Opening hours');
  });

  test('an untitled widget falls back to the plugin label, never the raw type', () => {
    // "live-json" is not a name anybody chose.
    expect(widgetName({ type: 'live-json' })).toBe(getPlugin('live-json').label);
    expect(widgetName({ type: 'shape' })).toBe('Shape');
  });

  test('whitespace is not a name', () => {
    expect(widgetName({ type: 'shape', title: '   ' })).toBe('Shape');
    expect(widgetName({ type: 'shape', title: '' })).toBe('Shape');
  });

  test('a title is trimmed, so a stray space cannot shift the whole row', () => {
    expect(widgetName({ type: 'shape', title: '  Badge  ' })).toBe('Badge');
  });

  test('an unknown plugin degrades to the type rather than to nothing', () => {
    expect(widgetName({ type: 'no-such-plugin' })).toBe('no-such-plugin');
    expect(widgetName(null)).toBe('');
  });
});
