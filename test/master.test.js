// The slide master — widgets drawn on every slide that has not opted out.
//
// The whole feature rests on one resolver, and on the one property that makes it
// safe to use: master content goes BEHIND the slide's own. A master element that
// could land on top would turn every master into something you have to check
// each slide against, which is the opposite of what a master is for.

import { test, expect, describe } from './runner.js';
import {
  createSlide, createWidget, masterWidgetsFor, ensureMaster, hasMaster,
  MASTER_Z_FLOOR, MASTER_Z_BASE, MASTER_Z_ROOM, visibleWidgets,
} from '../shared/slide-schema.js';

const w = (id, z) => createWidget('text', { id, z, rect: { x: 0, y: 0, w: 10, h: 10 } });
const playlistWith = (masterWidgets) => ({
  slides: [],
  master: createSlide({ id: 'master', widgets: masterWidgets }),
});

describe('masterWidgetsFor', () => {
  test('a playlist with no master contributes nothing', () => {
    expect(masterWidgetsFor({ slides: [] }, createSlide())).toEqual([]);
    expect(masterWidgetsFor(null, createSlide())).toEqual([]);
    expect(masterWidgetsFor(undefined, undefined)).toEqual([]);
  });

  test('an EMPTY master contributes nothing', () => {
    expect(masterWidgetsFor(playlistWith([]), createSlide())).toEqual([]);
  });

  test('its widgets reach a slide that has not opted out', () => {
    const out = masterWidgetsFor(playlistWith([w('a', 0), w('b', 1)]), createSlide());
    expect(out.map(x => x.id)).toEqual(['a', 'b']);
  });

  test('a slide can opt out', () => {
    const slide = createSlide({ noMaster: true });
    expect(masterWidgetsFor(playlistWith([w('a', 0)]), slide)).toEqual([]);
  });

  test('only an explicit `true` opts out', () => {
    // `noMaster` reaches this from stored JSON, where "false" and 0 turn up and
    // neither means "hide the master".
    for (const v of [false, 0, '', null, undefined, 'false']) {
      const slide = createSlide();
      slide.noMaster = v;
      expect(masterWidgetsFor(playlistWith([w('a', 0)]), slide)).toHaveLength(1);
    }
  });
});

describe('master content sits in the band between the background and the slide', () => {
  test('the band starts at MASTER_Z_BASE and steps up by one', () => {
    const out = masterWidgetsFor(playlistWith([w('a', 0), w('b', 7)]), createSlide());
    expect(out[0].z).toBe(MASTER_Z_BASE);
    expect(out[1].z).toBe(MASTER_Z_BASE + 1);
  });

  test('the master keeps its own internal order', () => {
    const out = masterWidgetsFor(playlistWith([w('front', 5), w('back', 0)]), createSlide());
    expect(out.map(x => x.id)).toEqual(['back', 'front']);
    expect(out[1].z > out[0].z).toBe(true);
  });

  test('REGRESSION: the master never sinks below the slide BACKGROUND', () => {
    // The bug this replaced: a large negative offset put the master behind
    // `.avs-slide-bg` (z-index -9999), which paints over it — so the master was
    // invisible on the canvas AND on the wall, which is the worse half.
    const out = masterWidgetsFor(playlistWith([w('a', -99999), w('b', 0)]), createSlide());
    for (const x of out) expect(x.z > MASTER_Z_FLOOR).toBe(true);
  });

  test('REGRESSION: no hand-authored z escapes the band, in either direction', () => {
    // Whatever somebody typed into the inspector's Z field, a master widget
    // lands in the band — so it can neither hide behind the wallpaper nor climb
    // on top of the slide it is supposed to sit under.
    const out = masterWidgetsFor(playlistWith([w('lo', -99999), w('hi', 99999)]), createSlide());
    for (const x of out) {
      expect(x.z > MASTER_Z_FLOOR).toBe(true);
      expect(x.z < 0).toBe(true);
    }
  });

  test('a master far bigger than the band still stays inside it', () => {
    const many = Array.from({ length: MASTER_Z_ROOM + 50 }, (_, i) => w('w' + i, i));
    const out = masterWidgetsFor(playlistWith(many), createSlide());
    for (const x of out) {
      expect(x.z > MASTER_Z_FLOOR).toBe(true);
      expect(x.z < 0).toBe(true);
    }
  });

  test('the master widgets are COPIES — the stored z is not rewritten', () => {
    const pl = playlistWith([w('a', 3)]);
    masterWidgetsFor(pl, createSlide());
    // The editor edits the master as an ordinary slide, where 3 means 3.
    expect(pl.master.widgets[0].z).toBe(3);
  });
});

describe('the master obeys the same visibility rule as everything else', () => {
  test('a hidden master widget reaches no slide', () => {
    const hidden = createWidget('text', { id: 'h', hidden: true });
    const out = visibleWidgets(masterWidgetsFor(playlistWith([w('a', 0), hidden]), createSlide()));
    expect(out.map(x => x.id)).toEqual(['a']);
  });
});

describe('ensureMaster / hasMaster', () => {
  test('a playlist that never touches the feature carries no master key', () => {
    // An empty master in every exported file would be noise in a format people
    // read and hand-edit.
    const pl = { slides: [] };
    expect(hasMaster(pl)).toBe(false);
    expect('master' in pl).toBe(false);
  });

  test('ensureMaster creates one, and is idempotent', () => {
    const pl = { slides: [] };
    const m1 = ensureMaster(pl);
    expect(Array.isArray(m1.widgets)).toBe(true);
    expect(ensureMaster(pl)).toBe(m1);
  });

  test('it repairs a master whose widgets went missing', () => {
    const pl = { slides: [], master: { id: 'master' } };
    expect(Array.isArray(ensureMaster(pl).widgets)).toBe(true);
  });

  test('hasMaster is about CONTENT, not about the key existing', () => {
    const pl = { slides: [] };
    ensureMaster(pl);
    expect(hasMaster(pl)).toBe(false);
    pl.master.widgets.push(w('a', 0));
    expect(hasMaster(pl)).toBe(true);
  });

  test('a null playlist is not a crash', () => {
    expect(ensureMaster(null)).toBe(null);
    expect(hasMaster(null)).toBe(false);
  });
});

describe('createSlide · noMaster stays out of the JSON until it is set', () => {
  test('an ordinary slide carries no key', () => {
    expect('noMaster' in createSlide()).toBe(false);
    expect('noMaster' in createSlide({ noMaster: false })).toBe(false);
  });
  test('opting out is persisted', () => {
    expect(createSlide({ noMaster: true }).noMaster).toBe(true);
  });
});
