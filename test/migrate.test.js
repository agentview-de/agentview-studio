// applyWidgetMigrations: per-widget content upgrade on load. Each widget
// carries a `contentVersion` stamp; the loader calls plugin.migrate() when
// it lags the plugin's current schemaVersion. Plugins without a migrate()
// hook just get the stamp bumped forward (additive-change assumption).

import { test, expect, describe } from './runner.js';
import {
  createPlaylist, createSlide, createWidget, applyWidgetMigrations,
} from '../shared/slide-schema.js';

// Build a tiny in-memory plugin registry to drive the migrator deterministically.
// Real plugins are tested in schema.test.js / round-trip.test.js; here we want
// to exercise the migrator's branches in isolation.
function fakeRegistry(plugins) {
  const map = new Map(plugins.map(p => [p.type, p]));
  return type => map.get(type);
}

function wrap(widgets) {
  const pl = createPlaylist('t');
  pl.slides.push(createSlide({ widgets }));
  return pl;
}

describe('applyWidgetMigrations — version stamping', () => {
  test('stamps contentVersion on a widget that has none (treated as v1)', () => {
    const get = fakeRegistry([{ type: 'foo', schemaVersion: 1 }]);
    const pl = wrap([{ id: 'w1', type: 'foo', rect: { x: 0, y: 0, w: 50, h: 50 }, content: {} }]);
    applyWidgetMigrations(pl, get);
    expect(pl.slides[0].widgets[0].contentVersion).toBe(1);
  });

  test('bumps stamp forward when content is at v1 but plugin is at v2 (no migrate hook)', () => {
    const get = fakeRegistry([{ type: 'foo', schemaVersion: 2 }]);
    const pl = wrap([createWidget('foo', { content: { x: 1 }, contentVersion: 1 })]);
    applyWidgetMigrations(pl, get);
    expect(pl.slides[0].widgets[0].contentVersion).toBe(2);
    // No migrate hook → content stays as-is (additive change assumption).
    expect(pl.slides[0].widgets[0].content).toEqual({ x: 1 });
  });

  test('does not touch widgets already at the current version', () => {
    const get = fakeRegistry([{ type: 'foo', schemaVersion: 2 }]);
    const w = createWidget('foo', { content: { x: 1 }, contentVersion: 2 });
    const originalContent = w.content;
    const pl = wrap([w]);
    applyWidgetMigrations(pl, get);
    expect(pl.slides[0].widgets[0].contentVersion).toBe(2);
    expect(pl.slides[0].widgets[0].content === originalContent).toBeTruthy(); // same identity
  });

  test('skips widgets whose plugin is not registered (orphan-safe)', () => {
    const get = fakeRegistry([]);
    const pl = wrap([{ id: 'w1', type: 'unknown', rect: { x: 0, y: 0, w: 50, h: 50 }, content: { x: 1 } }]);
    applyWidgetMigrations(pl, get);
    // No contentVersion was added, content untouched, no crash.
    expect('contentVersion' in pl.slides[0].widgets[0]).toBeFalsy();
    expect(pl.slides[0].widgets[0].content).toEqual({ x: 1 });
  });

  test('returns the same playlist instance (mutates in place)', () => {
    const get = fakeRegistry([{ type: 'foo', schemaVersion: 1 }]);
    const pl = wrap([createWidget('foo', { content: {} })]);
    const out = applyWidgetMigrations(pl, get);
    expect(out === pl).toBeTruthy();
  });
});

describe('applyWidgetMigrations — calling plugin.migrate()', () => {
  test('calls migrate when contentVersion < schemaVersion', () => {
    let called = false;
    const migrate = (content, fromVersion) => {
      called = true;
      expect(fromVersion).toBe(1);
      expect(content).toEqual({ legacy: 'value' });
      return { modern: content.legacy };
    };
    const get = fakeRegistry([{ type: 'foo', schemaVersion: 2, migrate }]);
    const pl = wrap([createWidget('foo', { content: { legacy: 'value' }, contentVersion: 1 })]);
    applyWidgetMigrations(pl, get);
    expect(called).toBeTruthy();
    expect(pl.slides[0].widgets[0].content).toEqual({ modern: 'value' });
    expect(pl.slides[0].widgets[0].contentVersion).toBe(2);
  });

  test('treats missing contentVersion as v1 when invoking migrate', () => {
    let received = null;
    const migrate = (_content, fromVersion) => { received = fromVersion; return { ok: true }; };
    const get = fakeRegistry([{ type: 'foo', schemaVersion: 3, migrate }]);
    const pl = wrap([{ id: 'w1', type: 'foo', rect: { x: 0, y: 0, w: 50, h: 50 }, content: {} }]);
    applyWidgetMigrations(pl, get);
    expect(received).toBe(1);
    expect(pl.slides[0].widgets[0].contentVersion).toBe(3);
  });

  test('does NOT call migrate when contentVersion is already current', () => {
    let called = false;
    const migrate = () => { called = true; return {}; };
    const get = fakeRegistry([{ type: 'foo', schemaVersion: 2, migrate }]);
    const pl = wrap([createWidget('foo', { content: { x: 1 }, contentVersion: 2 })]);
    applyWidgetMigrations(pl, get);
    expect(called).toBeFalsy();
  });

  test('does NOT call migrate when contentVersion is newer than plugin (downgrade is a no-op)', () => {
    let called = false;
    const migrate = () => { called = true; return {}; };
    const get = fakeRegistry([{ type: 'foo', schemaVersion: 2, migrate }]);
    const pl = wrap([createWidget('foo', { content: { x: 1 }, contentVersion: 5 })]);
    applyWidgetMigrations(pl, get);
    expect(called).toBeFalsy();
    // We keep the higher version stamp — downgrading would lose information.
    expect(pl.slides[0].widgets[0].contentVersion).toBe(5);
  });

  test('a throwing migrate() does not break the playlist load', () => {
    const migrate = () => { throw new Error('boom'); };
    const get = fakeRegistry([{ type: 'foo', schemaVersion: 2, migrate }]);
    const w = createWidget('foo', { content: { kept: true }, contentVersion: 1 });
    const pl = wrap([w]);
    // Silence the expected console.error noise for this assertion.
    const origErr = console.error; console.error = () => {};
    try { applyWidgetMigrations(pl, get); }
    finally { console.error = origErr; }
    // Content was NOT overwritten (we didn't get a clean new value),
    // and stamp was NOT bumped (so next load retries).
    expect(pl.slides[0].widgets[0].content).toEqual({ kept: true });
    expect(pl.slides[0].widgets[0].contentVersion).toBe(1);
  });

  test('a migrate() returning a non-object value is ignored (content preserved)', () => {
    const get = fakeRegistry([{ type: 'foo', schemaVersion: 2, migrate: () => null }]);
    const w = createWidget('foo', { content: { kept: true }, contentVersion: 1 });
    const pl = wrap([w]);
    applyWidgetMigrations(pl, get);
    // Even on a bad return value, stamp gets bumped so we don't loop.
    expect(pl.slides[0].widgets[0].content).toEqual({ kept: true });
    expect(pl.slides[0].widgets[0].contentVersion).toBe(2);
  });
});

describe('applyWidgetMigrations — defensive against malformed input', () => {
  test('null / non-playlist input returns same value, no throw', () => {
    expect(applyWidgetMigrations(null, () => null)).toBe(null);
    expect(applyWidgetMigrations({}, () => null)).toEqual({});
    expect(applyWidgetMigrations({ slides: 'not an array' }, () => null)).toEqual({ slides: 'not an array' });
  });

  test('slide without widgets array is skipped, not crashed on', () => {
    const get = fakeRegistry([{ type: 'foo', schemaVersion: 1 }]);
    const pl = createPlaylist('t');
    pl.slides.push({ id: 's1', duration: 10 }); // no widgets array
    pl.slides.push(createSlide({ widgets: [createWidget('foo', { content: {} })] }));
    applyWidgetMigrations(pl, get);
    expect(pl.slides[1].widgets[0].contentVersion).toBe(1);
  });

  test('handles multiple slides + mixed plugin versions across widgets', () => {
    const get = fakeRegistry([
      { type: 'a', schemaVersion: 1 },
      { type: 'b', schemaVersion: 3, migrate: (c, v) => ({ ...c, upgraded: 'from-' + v }) },
    ]);
    const pl = createPlaylist('t');
    pl.slides.push(createSlide({
      widgets: [
        createWidget('a', { content: { x: 1 } }),
        createWidget('b', { content: { y: 2 }, contentVersion: 1 }),
      ],
    }));
    pl.slides.push(createSlide({
      widgets: [
        createWidget('b', { content: { y: 3 }, contentVersion: 2 }),
        createWidget('a', { content: { x: 4 }, contentVersion: 1 }),
      ],
    }));
    applyWidgetMigrations(pl, get);

    expect(pl.slides[0].widgets[0].contentVersion).toBe(1);
    expect(pl.slides[0].widgets[1].contentVersion).toBe(3);
    expect(pl.slides[0].widgets[1].content).toEqual({ y: 2, upgraded: 'from-1' });
    expect(pl.slides[1].widgets[0].contentVersion).toBe(3);
    expect(pl.slides[1].widgets[0].content).toEqual({ y: 3, upgraded: 'from-2' });
    expect(pl.slides[1].widgets[1].contentVersion).toBe(1);
  });
});

describe('applyWidgetMigrations — idempotency', () => {
  test('running twice produces the same playlist (no double-migration)', () => {
    let calls = 0;
    const migrate = (c) => { calls++; return { ...c, m: 1 }; };
    const get = fakeRegistry([{ type: 'foo', schemaVersion: 2, migrate }]);
    const pl = wrap([createWidget('foo', { content: { x: 1 }, contentVersion: 1 })]);
    applyWidgetMigrations(pl, get);
    const snapshot1 = JSON.stringify(pl);
    applyWidgetMigrations(pl, get);
    const snapshot2 = JSON.stringify(pl);
    expect(snapshot1).toBe(snapshot2);
    expect(calls).toBe(1);
  });
});

describe('applyWidgetMigrations — legacy icon rotation lift', () => {
  // The icon widget dropped its own content.rotation in favour of the general
  // container rotation; legacy values must be lifted onto widget.rotation. The
  // lift runs regardless of whether the icon plugin is registered.
  const iconW = (content, extra = {}) => ({ id: 'i' + (iconW._n = (iconW._n || 0) + 1), type: 'icon', rect: { x: 10, y: 10, w: 20, h: 20 }, content, ...extra });

  test('lifts content.rotation onto widget.rotation and removes it from content', () => {
    const pl = wrap([iconW({ symbol: 'star', rotation: 45 })]);
    applyWidgetMigrations(pl, fakeRegistry([]));
    const w = pl.slides[0].widgets[0];
    expect(w.rotation).toBe(45);
    expect(w.content).toEqual({ symbol: 'star' });
  });

  test('adds to an existing widget.rotation', () => {
    const pl = wrap([iconW({ symbol: 'star', rotation: 30 }, { rotation: 90 })]);
    applyWidgetMigrations(pl, fakeRegistry([]));
    expect(pl.slides[0].widgets[0].rotation).toBe(120);
  });

  test('a total that is a multiple of 360 leaves no widget.rotation', () => {
    const pl = wrap([iconW({ symbol: 'star', rotation: 360 })]);
    applyWidgetMigrations(pl, fakeRegistry([]));
    const w = pl.slides[0].widgets[0];
    expect('rotation' in w).toBeFalsy();
    expect('rotation' in w.content).toBeFalsy();
  });

  test('only icons are touched — a content.rotation on another type is left alone', () => {
    const pl = wrap([{ id: 't1', type: 'text', rect: { x: 0, y: 0, w: 50, h: 50 }, content: { rotation: 12, body: 'x' } }]);
    applyWidgetMigrations(pl, fakeRegistry([]));
    expect(pl.slides[0].widgets[0].content).toEqual({ rotation: 12, body: 'x' });
    expect('rotation' in pl.slides[0].widgets[0]).toBeFalsy();
  });

  test('lifts inside lang and A/B variant widget arrays too', () => {
    const pl = createPlaylist('t');
    const slide = createSlide({ widgets: [iconW({ symbol: 'a', rotation: 15 })] });
    slide.langs = { de: { widgets: [iconW({ symbol: 'b', rotation: 20 })] } };
    slide.abVariants = [{ weight: 1, widgets: [iconW({ symbol: 'c', rotation: 25 })] }];
    pl.slides.push(slide);
    applyWidgetMigrations(pl, fakeRegistry([]));
    expect(pl.slides[0].widgets[0].rotation).toBe(15);
    expect(pl.slides[0].langs.de.widgets[0].rotation).toBe(20);
    expect(pl.slides[0].abVariants[0].widgets[0].rotation).toBe(25);
    for (const arr of [pl.slides[0].widgets, pl.slides[0].langs.de.widgets, pl.slides[0].abVariants[0].widgets])
      expect('rotation' in arr[0].content).toBeFalsy();
  });

  test('idempotent — running twice changes nothing', () => {
    const pl = wrap([iconW({ symbol: 'star', rotation: 45 })]);
    applyWidgetMigrations(pl, fakeRegistry([]));
    const snap1 = JSON.stringify(pl);
    applyWidgetMigrations(pl, fakeRegistry([]));
    expect(JSON.stringify(pl)).toBe(snap1);
  });
});

describe('createWidget contentVersion', () => {
  test('omits contentVersion when not provided (back-compat with old test fixtures)', () => {
    const w = createWidget('foo', { content: {} });
    expect('contentVersion' in w).toBeFalsy();
  });

  test('stores contentVersion when provided', () => {
    const w = createWidget('foo', { content: {}, contentVersion: 3 });
    expect(w.contentVersion).toBe(3);
  });

  test('ignores nullish contentVersion (defaults still omit it)', () => {
    expect('contentVersion' in createWidget('foo', { contentVersion: null })).toBeFalsy();
    expect('contentVersion' in createWidget('foo', { contentVersion: undefined })).toBeFalsy();
  });
});
