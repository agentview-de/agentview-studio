// Format painter — what "make this one look like that one" carries, and what it
// deliberately leaves behind.
//
// The interesting decisions are all about the boundary: content is
// plugin-specific, so copying it wholesale between widget types produces
// nonsense, while position and identity must never travel at all — a format
// painter that moved things would be a different and much more surprising tool.

import { test, expect, describe } from './runner.js';
import {
  pickFormat, applyFormat, arm, disarm, isArmed, armedFormat,
  FORMAT_CONTENT_KEYS, FORMAT_WIDGET_KEYS,
} from '../admin/format-painter.js';

const source = () => ({
  id: 'src', type: 'text', z: 3,
  rect: { x: 10, y: 10, w: 30, h: 20 },
  rotation: 15, title: 'Source', group: 'g1',
  background: { kind: 'solid', color: '#123456' },
  anim: { type: 'fade-up', delay: 200 },
  loop: 'float',
  content: { theme: 'bistro-warm', textColor: '#fff', accentColor: '#f90', textScale: 140, align: 'center', body: '<p>hello</p>' },
});

const target = () => ({
  id: 'tgt', type: 'quote', z: 1,
  rect: { x: 60, y: 60, w: 20, h: 20 },
  title: 'Target',
  content: { theme: 'minimal-dark', textColor: '', accentColor: '', textScale: 100, align: 'left', quote: 'other' },
});

describe('pickFormat', () => {
  test('it carries the shared styling vocabulary', () => {
    const f = pickFormat(source());
    for (const k of FORMAT_CONTENT_KEYS) expect(k in f.content).toBe(true);
    for (const k of FORMAT_WIDGET_KEYS) expect(k in f).toBe(true);
  });

  test('it does NOT carry position or identity', () => {
    const f = pickFormat(source());
    for (const k of ['rect', 'rotation', 'z', 'title', 'group', 'id', 'type']) {
      expect(k in f).toBe(false);
    }
  });

  test('it does not carry plugin-specific content', () => {
    // `body` means something to text and nothing to a chart.
    expect('body' in pickFormat(source()).content).toBe(false);
  });

  test('the picked format is a deep COPY — later edits to the source do not leak', () => {
    const src = source();
    const f = pickFormat(src);
    src.background.color = '#000000';
    src.content.theme = 'changed';
    expect(f.background.color).toBe('#123456');
    expect(f.content.theme).toBe('bistro-warm');
  });

  test('a widget without the optional properties yields a format without them', () => {
    const plain = { id: 'p', content: { theme: 'x' } };
    const f = pickFormat(plain);
    expect('background' in f).toBe(false);
    expect('anim' in f).toBe(false);
    expect(f.content.theme).toBe('x');
  });

  test('nothing picked up is null, not an empty format', () => {
    expect(pickFormat(null)).toBe(null);
    expect(pickFormat(undefined)).toBe(null);
    expect(pickFormat('not a widget')).toBe(null);
  });
});

describe('applyFormat', () => {
  test('the target takes the look', () => {
    const t = target();
    expect(applyFormat(t, pickFormat(source()))).toBe(true);
    expect(t.content.theme).toBe('bistro-warm');
    expect(t.content.textScale).toBe(140);
    expect(t.content.align).toBe('center');
    expect(t.background.color).toBe('#123456');
    expect(t.loop).toBe('float');
  });

  test('the target keeps its own content, position and identity', () => {
    const t = target();
    applyFormat(t, pickFormat(source()));
    expect(t.content.quote).toBe('other');
    expect(t.rect).toEqual({ x: 60, y: 60, w: 20, h: 20 });
    expect(t.title).toBe('Target');
    expect(t.id).toBe('tgt');
    expect(t.z).toBe(1);
  });

  test('a key the target does not have is skipped, not invented', () => {
    // Giving a QR code a textScale it never reads would put a dead field in the
    // JSON that the next reader has to wonder about.
    const t = { id: 'qr', content: { theme: 'minimal-dark' } };
    applyFormat(t, pickFormat(source()));
    expect(t.content.theme).toBe('bistro-warm');
    expect('textScale' in t.content).toBe(false);
    expect('align' in t.content).toBe(false);
  });

  test('an ABSENT source property clears the target\'s', () => {
    // Otherwise the painter can only ever add, and "make it look like that
    // plain one" is a thing it cannot express.
    const t = target();
    t.loop = 'pulse';
    t.anim = { type: 'pop' };
    t.background = { kind: 'solid', color: '#abcdef' };
    const plain = { id: 'p', content: { theme: 'minimal-dark' } };
    expect(applyFormat(t, pickFormat(plain))).toBe(true);
    expect('loop' in t).toBe(false);
    expect('anim' in t).toBe(false);
    expect('background' in t).toBe(false);
  });

  test('painting the same look twice reports no change the second time', () => {
    // A no-op must not push an undo entry — the same rule align and drag follow.
    const t = target();
    const f = pickFormat(source());
    expect(applyFormat(t, f)).toBe(true);
    expect(applyFormat(t, f)).toBe(false);
  });

  test('the format is not aliased into the target', () => {
    const f = pickFormat(source());
    const a = target(), b = target();
    applyFormat(a, f);
    applyFormat(b, f);
    a.background.color = '#ff0000';
    expect(b.background.color).toBe('#123456');
    expect(f.background.color).toBe('#123456');
  });

  test('a missing widget or format is a no-op, not a crash', () => {
    expect(applyFormat(null, pickFormat(source()))).toBe(false);
    expect(applyFormat(target(), null)).toBe(false);
    expect(applyFormat(undefined, undefined)).toBe(false);
  });

  test('a target with no content object survives', () => {
    // The content loop must not assume `widget.content` exists — an imported or
    // hand-edited widget may not have one, and the widget-level half of the
    // format still has to land.
    const t = { id: 't' };
    applyFormat(t, pickFormat(source()));
    expect(t.background.color).toBe('#123456');
    expect(t.loop).toBe('float');
  });
});

describe('the armed brush', () => {
  test('it starts disarmed', () => {
    disarm();
    expect(isArmed()).toBe(false);
    expect(armedFormat()).toBe(null);
  });

  test('arming picks up the format; disarming drops it', () => {
    expect(arm(source())).toBe(true);
    expect(isArmed()).toBe(true);
    expect(armedFormat().content.theme).toBe('bistro-warm');
    expect(disarm()).toBe(true);
    expect(isArmed()).toBe(false);
  });

  test('arming from nothing leaves it disarmed', () => {
    disarm();
    expect(arm(null)).toBe(false);
    expect(isArmed()).toBe(false);
  });

  test('disarming twice reports the second one as a no-op', () => {
    arm(source());
    expect(disarm()).toBe(true);
    expect(disarm()).toBe(false);
  });
});
