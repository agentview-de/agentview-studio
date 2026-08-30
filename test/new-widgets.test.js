// Pure logic of the four widgets added for the template store: the queue board,
// the leaderboard, the opening-hours table and the steps panel.
//
// Only the DOM-free parts live here — the remote-shape normalisers and the
// open/closed clock. Rendering is covered by the browser suite, which mounts
// every registered plugin (plugin-resilience.test.js).
//
// Why the normalisers get their own tests: they exist BECAUSE real queue and
// leaderboard APIs disagree about field names, and "be forgiving" is the kind
// of promise that silently stops being true. Each accepted shape below is a
// shape somebody's endpoint actually returns.

import { test, expect, describe } from './runner.js';
import { normalizeQueue } from '../shared/plugins/queue-call.js';
import { normalizeLeaderboard } from '../shared/plugins/leaderboard.js';
import { parseHm, openState } from '../shared/plugins/opening-hours.js';
import { get as getPlugin } from '../shared/plugins/registry.js';

const MON = 0, WED = 2, SAT = 5, SUN = 6;
const hm = (h, m = 0) => h * 60 + m;

// A shop: 09:00–18:00 weekdays, Wednesday with a lunch break, Saturday short,
// Sunday closed.
const WEEK = [
  { day: 'mon', from: '09:00', to: '18:00' },
  { day: 'tue', from: '09:00', to: '18:00' },
  { day: 'wed', from: '09:00', to: '13:00', from2: '15:00', to2: '18:00' },
  { day: 'thu', from: '09:00', to: '18:00' },
  { day: 'fri', from: '09:00', to: '18:00' },
  { day: 'sat', from: '10:00', to: '14:00' },
  { day: 'sun', closed: true },
];

describe('queue-call · normalizeQueue', () => {
  test('the documented shape', () => {
    const q = normalizeQueue({ current: { number: 'A-42', counter: '3' }, upcoming: [{ number: 'A-43', desk: '1' }] });
    expect(q.current.number).toBe('A-42');
    expect(q.current.counter).toBe('3');
    expect(q.upcoming).toHaveLength(1);
    expect(q.upcoming[0].counter).toBe('1');
  });
  test('now/next with bare strings', () => {
    const q = normalizeQueue({ now: 'A-42', next: ['A-43', 'A-44'] });
    expect(q.current.number).toBe('A-42');
    expect(q.upcoming.map(e => e.number)).toEqual(['A-43', 'A-44']);
  });
  test('a plain array — first entry is the one being called', () => {
    const q = normalizeQueue([{ ticket: '7', room: 'B' }, { ticket: '8' }]);
    expect(q.current.number).toBe('7');
    expect(q.current.counter).toBe('B');
    expect(q.upcoming).toHaveLength(1);
  });
  test('a bare string or number', () => {
    expect(normalizeQueue('A-9').current.number).toBe('A-9');
    expect(normalizeQueue(12).current.number).toBe('12');
  });
  test('entries without a number are dropped, not rendered blank', () => {
    const q = normalizeQueue([{ number: '1' }, { counter: 'orphan' }, { number: '' }, null, { number: '2' }]);
    expect(q.current.number).toBe('1');
    expect(q.upcoming.map(e => e.number)).toEqual(['2']);
  });
  test('nothing usable yields an empty board rather than throwing', () => {
    for (const junk of [null, undefined, {}, [], '', '   ', true]) {
      const q = normalizeQueue(junk);
      expect(q.current).toBe(null);
      expect(q.upcoming).toEqual([]);
    }
  });
  test('a literal 0 IS a number — a queue that resets to zero means it', () => {
    expect(normalizeQueue(0).current.number).toBe('0');
  });
});

describe('leaderboard · normalizeLeaderboard', () => {
  test('an array of rows', () => {
    const rows = normalizeLeaderboard([{ name: 'A', value: 10, note: 'x', deltaPct: 2 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ name: 'A', value: 10, note: 'x', avatar: '', deltaPct: 2 });
  });
  test('a wrapper object under any of the usual keys', () => {
    for (const key of ['rows', 'items', 'entries', 'data', 'results', 'leaderboard']) {
      const rows = normalizeLeaderboard({ [key]: [{ label: 'A', score: 5 }] });
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('A');
      expect(rows[0].value).toBe(5);
    }
  });
  test('a flat name → value map', () => {
    const rows = normalizeLeaderboard({ Alice: 42, Bob: 37 });
    expect(rows.map(r => r.name)).toEqual(['Alice', 'Bob']);
    expect(rows.map(r => r.value)).toEqual([42, 37]);
  });
  test('a missing delta stays null so no arrow is drawn', () => {
    expect(normalizeLeaderboard([{ name: 'A', value: 1 }])[0].deltaPct).toBe(null);
    expect(normalizeLeaderboard([{ name: 'A', value: 1, delta: '' }])[0].deltaPct).toBe(null);
    expect(normalizeLeaderboard([{ name: 'A', value: 1, change: -3 }])[0].deltaPct).toBe(-3);
  });
  test('nameless rows are dropped and a non-numeric value becomes 0', () => {
    const rows = normalizeLeaderboard([{ value: 9 }, { name: 'A', value: 'lots' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(0);
  });
  test('junk yields an empty board', () => {
    for (const junk of [null, undefined, 'x', 5]) expect(normalizeLeaderboard(junk)).toEqual([]);
  });
});

describe('opening-hours · parseHm', () => {
  test('the forms a user actually types', () => {
    expect(parseHm('09:00')).toBe(540);
    expect(parseHm('9:00')).toBe(540);
    expect(parseHm('9.30')).toBe(570);
    expect(parseHm('930')).toBe(570);
    expect(parseHm('9')).toBe(540);
  });
  test('empty and nonsense are null, not zero — a blank day is CLOSED, not midnight', () => {
    for (const junk of ['', '   ', null, undefined, 'nope', '25:00', '9:75']) {
      expect(parseHm(junk)).toBe(null);
    }
  });
});

describe('opening-hours · openState', () => {
  test('open inside a window, and it says when it closes', () => {
    const st = openState(WEEK, MON, hm(11));
    expect(st.open).toBe(true);
    expect(st.changeDay).toBe(0);
    expect(st.changeAt).toBe(hm(18));
  });
  test('before opening on the same day', () => {
    const st = openState(WEEK, MON, hm(7));
    expect(st.open).toBe(false);
    expect(st.changeDay).toBe(0);
    expect(st.changeAt).toBe(hm(9));
  });
  test('the Wednesday lunch break is closed, and reopening is the next event', () => {
    const st = openState(WEEK, WED, hm(14));
    expect(st.open).toBe(false);
    expect(st.changeDay).toBe(0);
    expect(st.changeAt).toBe(hm(15));
    expect(openState(WEEK, WED, hm(12)).open).toBe(true);
    expect(openState(WEEK, WED, hm(16)).open).toBe(true);
  });
  test('after closing, the walk skips every closed day to find the next opening', () => {
    // Saturday 20:00: shut. Sunday is closed entirely, so the next opening is
    // Monday — two days out, not one. Reporting "tomorrow 09:00" here would be
    // a lie printed on a door.
    const st = openState(WEEK, SAT, hm(20));
    expect(st.open).toBe(false);
    expect(st.changeDay).toBe(2);
    expect(st.changeAt).toBe(hm(9));
  });
  test('a closed day looks forward past every other closed day', () => {
    const st = openState(WEEK, SUN, hm(12));
    expect(st.open).toBe(false);
    expect(st.changeDay).toBe(1);
    expect(st.changeAt).toBe(hm(9));
  });
  test('a week with no hours at all reports closed with nothing to promise', () => {
    const st = openState(Array(7).fill({ closed: true }), MON, hm(12));
    expect(st.open).toBe(false);
    expect(st.changeDay).toBe(null);
    expect(st.changeAt).toBe(null);
  });
  test('an inverted window (to before from) is ignored rather than open forever', () => {
    const week = Array(7).fill({ from: '18:00', to: '09:00' });
    expect(openState(week, MON, hm(12)).open).toBe(false);
    expect(openState(week, MON, hm(20)).open).toBe(false);
  });
});

describe('new widgets · registered and contract-shaped', () => {
  const NEW = ['queue-call', 'leaderboard', 'opening-hours', 'steps'];
  test('all four are in the registry', () => {
    for (const type of NEW) expect(!!getPlugin(type)).toBe(true);
  });
  test('each defaults() returns a FRESH object — two slides never share content', () => {
    for (const type of NEW) {
      const p = getPlugin(type);
      const a = p.defaults();
      const b = p.defaults();
      expect(a === b).toBe(false);
      // The array-valued keys are the ones that bite: a shared array means
      // editing one widget's rows edits every other widget of that type.
      for (const k of Object.keys(a)) {
        if (Array.isArray(a[k])) expect(a[k] === b[k]).toBe(false);
      }
    }
  });
  test('each ships design ideas the Widget Designer can offer', () => {
    for (const type of NEW) {
      const looks = getPlugin(type).looks?.() ?? [];
      expect(looks.length >= 3).toBe(true);
      for (const l of looks) {
        expect(typeof l.id).toBe('string');
        expect(typeof l.name).toBe('string');
        expect(typeof l.patch).toBe('object');
      }
    }
  });
  test('every looks() patch key is a real content key', () => {
    for (const type of NEW) {
      const defaults = getPlugin(type).defaults();
      for (const l of getPlugin(type).looks?.() ?? []) {
        for (const k of Object.keys(l.patch)) {
          if (!(k in defaults)) throw new Error(`${type} look "${l.id}" patches unknown key "${k}"`);
        }
      }
    }
  });
});
