// Save/load round-trip stability. For every plugin: build a slide from its
// defaults, serialize the whole playlist as JSON, parse it back, run it
// through the v1→v2 migrator (no-op for v2), and assert the result is
// byte-identical. Catches:
//   • plugins whose defaults() returns un-serialisable values (functions,
//     symbols, Date objects, NaN, undefined fields, etc.)
//   • plugins whose schema implies sub-structures that the createWidget
//     normaliser doesn't preserve
//   • accidental drift in the migrator that mutates already-v2 playlists

import { test, expect, describe } from './runner.js';
import { list as listPlugins } from '../shared/plugins/registry.js';
import {
  SCHEMA_VERSION, createWidget, createSlide, createPlaylist,
  migratePlaylist, validateWidget, validateSlide, normalizeRect,
} from '../shared/slide-schema.js';
import '../shared/plugins/all.js';

const plugins = listPlugins();

function buildPlaylistFromDefaults() {
  const pl = createPlaylist('Round-trip test');
  const slide = createSlide({ duration: 10 });
  for (const p of plugins) {
    slide.widgets.push(createWidget(p.type, {
      rect: { x: 0, y: 0, w: 50, h: 50 },
      content: p.defaults(),
    }));
  }
  pl.slides.push(slide);
  return pl;
}

describe('round-trip — playlist with every plugin survives JSON serialize/parse', () => {
  test('serialize → parse → migrate produces byte-identical JSON', () => {
    const pl = buildPlaylistFromDefaults();
    const json1 = JSON.stringify(pl);
    const parsed = JSON.parse(json1);
    const migrated = migratePlaylist(parsed);
    const json2 = JSON.stringify(migrated);
    if (json1 !== json2) {
      // Diff hint for the failing case.
      throw new Error(`Round-trip drift:\n  before: ${json1.slice(0, 200)}\n  after:  ${json2.slice(0, 200)}`);
    }
  });

  test('schemaVersion is preserved at v2 (no double-migration)', () => {
    const pl = buildPlaylistFromDefaults();
    const migrated = migratePlaylist(JSON.parse(JSON.stringify(pl)));
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  });

  test('widget count is preserved', () => {
    const pl = buildPlaylistFromDefaults();
    const before = pl.slides[0].widgets.length;
    const after = migratePlaylist(JSON.parse(JSON.stringify(pl))).slides[0].widgets.length;
    expect(after).toBe(before);
    expect(before).toBe(plugins.length);
  });
});

describe('round-trip — per-plugin defaults are JSON-safe', () => {
  for (const p of plugins) {
    test(`${p.type}: defaults() round-trip via JSON is structurally equal`, () => {
      const def = p.defaults();
      const json = JSON.stringify(def);
      const parsed = JSON.parse(json);
      // We compare via re-stringify to handle key-order normalisation that
      // JSON.parse imposes — what matters is that no fields disappear and
      // no values change.
      expect(JSON.stringify(parsed)).toBe(json);
    });

    test(`${p.type}: defaults() contains no NaN / Infinity / functions / undefined values`, () => {
      const def = p.defaults();
      function walk(v, path) {
        if (typeof v === 'function') throw new Error(`${p.type}: function at ${path}`);
        if (typeof v === 'undefined') throw new Error(`${p.type}: undefined at ${path}`);
        if (typeof v === 'symbol') throw new Error(`${p.type}: symbol at ${path}`);
        if (typeof v === 'number' && !Number.isFinite(v)) {
          throw new Error(`${p.type}: non-finite number ${v} at ${path}`);
        }
        if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
        else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
      }
      walk(def, p.type);
    });
  }
});

describe('round-trip — through localStorage (string in, string out)', () => {
  // Mirrors how main.js autosaves: stringify → put in localStorage → read
  // back on load → parse → migrate.
  test('localStorage hydration produces identical playlist', () => {
    const pl = buildPlaylistFromDefaults();
    const json1 = JSON.stringify(pl);
    const KEY = '__rt_test__';
    localStorage.setItem(KEY, json1);
    const back = localStorage.getItem(KEY);
    expect(back).toBe(json1);
    const reloaded = migratePlaylist(JSON.parse(back));
    expect(JSON.stringify(reloaded)).toBe(json1);
    localStorage.removeItem(KEY);
  });
});

describe('v1 → v2 migration', () => {
  test('v1 single slide: layout missing, type at top level → wrapped in widgets[]', () => {
    const v1 = {
      id: 'pl1', name: 'old',
      slides: [{ id: 's1', type: 'text', title: 'Hi', duration: 12, content: { body: 'x' } }],
    };
    const v2 = migratePlaylist(v1);
    expect(v2.schemaVersion).toBe(SCHEMA_VERSION);
    expect(v2.slides).toHaveLength(1);
    expect(v2.slides[0].widgets).toHaveLength(1);
    expect(v2.slides[0].widgets[0].type).toBe('text');
    expect(v2.slides[0].widgets[0].content.body).toBe('x');
    expect(v2.slides[0].duration).toBe(12);
  });

  test('v1 layout slide with zone children: zones become positioned widgets', () => {
    const child = { id: 'sc', type: 'clock', content: { timezone: 'UTC' } };
    const v1 = {
      id: 'pl', name: 'n',
      slides: [
        { id: 'sl', layout: 'split-50-50', zones: [{ slot: 'a', slide: child }, { slot: 'b', slide: child }] },
      ],
    };
    const v2 = migratePlaylist(v1);
    expect(v2.slides[0].widgets).toHaveLength(2);
    expect(v2.slides[0].widgets[0].type).toBe('clock');
    expect(v2.slides[0].design).toBe('split-50-50');
  });

  test('v1 layout slide with slideId references: referenced children are removed from top-level', () => {
    const v1 = {
      id: 'pl', name: 'n',
      slides: [
        { id: 'child1', type: 'text', content: { body: 'a' } },
        { id: 'layout1', layout: 'split-50-50', zones: [{ slot: 'a', slideId: 'child1' }] },
      ],
    };
    const v2 = migratePlaylist(v1);
    // 'child1' is referenced → moved into a widget, not kept at top level.
    expect(v2.slides).toHaveLength(1);
    expect(v2.slides[0].widgets[0].type).toBe('text');
    expect(v2.slides[0].widgets[0].content.body).toBe('a');
  });

  test('v2 input is returned unchanged (no double-migration)', () => {
    const v2In = createPlaylist('x');
    v2In.slides.push(createSlide({ widgets: [createWidget('text', { content: { body: 'hi' } })] }));
    const out = migratePlaylist(v2In);
    expect(JSON.stringify(out)).toBe(JSON.stringify(v2In));
  });

  test('null / garbage input returns a valid empty playlist (no crash)', () => {
    const a = migratePlaylist(null);
    const b = migratePlaylist('not an object');
    const c = migratePlaylist(42);
    for (const out of [a, b, c]) {
      expect(out.schemaVersion).toBe(SCHEMA_VERSION);
      expect(Array.isArray(out.slides)).toBeTruthy();
    }
  });

  test('bare array of v1 slides is accepted', () => {
    const arr = [{ id: 's1', type: 'text', content: { body: 'x' } }];
    const out = migratePlaylist(arr);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.slides).toHaveLength(1);
    expect(out.slides[0].widgets[0].type).toBe('text');
  });
});

describe('createWidget / createSlide / createPlaylist', () => {
  test('createWidget assigns a generated id when none provided', () => {
    const w = createWidget('text');
    expect(typeof w.id).toBe('string');
    expect(w.id.startsWith('w_')).toBeTruthy();
  });

  test('createWidget normalises a missing rect to full-canvas', () => {
    const w = createWidget('text');
    expect(w.rect).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  test('createWidget passes through z, title, background, content', () => {
    const w = createWidget('text', {
      z: 5, title: 'T', background: { kind: 'solid', color: '#000' }, content: { body: 'b' },
    });
    expect(w.z).toBe(5);
    expect(w.title).toBe('T');
    expect(w.background.kind).toBe('solid');
    expect(w.content.body).toBe('b');
  });

  test('createWidget omits empty optional fields (no { title: undefined })', () => {
    const w = createWidget('text');
    expect('title' in w).toBeFalsy();
    expect('background' in w).toBeFalsy();
  });

  test('createSlide defaults: id, duration:10, widgets:[]', () => {
    const s = createSlide();
    expect(typeof s.id).toBe('string');
    expect(s.duration).toBe(10);
    expect(s.widgets).toEqual([]);
  });

  test('createPlaylist shape', () => {
    const pl = createPlaylist('My');
    expect(pl.schemaVersion).toBe(SCHEMA_VERSION);
    expect(pl.name).toBe('My');
    expect(pl.canvas.w).toBe(1920);
    expect(pl.canvas.h).toBe(1080);
    expect(pl.canvas.fit).toBe('fill');
    expect(pl.defaults.transition).toBe('fade');
    expect(pl.defaults.theme).toBe('minimal-dark');
    expect(typeof pl.metadata.createdAt).toBe('string');
  });
});

describe('normalizeRect', () => {
  test('clamps x/y/w/h into [0,100]', () => {
    expect(normalizeRect({ x: -50, y: -50, w: 200, h: 200 })).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(normalizeRect({ x: 150, y: 150, w: 10, h: 10 })).toEqual({ x: 100, y: 100, w: 0, h: 0 });
  });

  test('shrinks w/h so x+w and y+h stay within 100', () => {
    const r = normalizeRect({ x: 80, y: 80, w: 50, h: 50 });
    expect(r.x + r.w <= 100).toBeTruthy();
    expect(r.y + r.h <= 100).toBeTruthy();
  });

  test('NaN/string values fall back to 0', () => {
    const r = normalizeRect({ x: 'abc', y: NaN, w: undefined, h: null });
    // x/y collapse to 0; w/h fell to 0 then clamped to 1 min (per code).
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.w >= 1).toBeTruthy();
    expect(r.h >= 1).toBeTruthy();
  });
});

describe('validateWidget / validateSlide', () => {
  test('validateWidget accepts a freshly-built widget', () => {
    expect(validateWidget(createWidget('text', { content: { body: 'x' } }))).toBeTruthy();
  });

  test('validateWidget rejects malformed widgets', () => {
    expect(validateWidget(null)).toBeFalsy();
    expect(validateWidget({ type: 'text' })).toBeFalsy();             // no content
    expect(validateWidget({ content: {} })).toBeFalsy();              // no type
    expect(validateWidget({ type: 42, content: {} })).toBeFalsy();
  });

  test('validateSlide accepts a freshly-built slide', () => {
    expect(validateSlide(createSlide())).toBeTruthy();
  });

  test('validateSlide rejects slides with duration < 1 or no widgets array', () => {
    expect(validateSlide({ id: 's', duration: 0, widgets: [] })).toBeFalsy();
    expect(validateSlide({ id: 's', duration: 10 })).toBeFalsy();
    expect(validateSlide({ duration: 10, widgets: [] })).toBeFalsy();  // no id
  });
});
