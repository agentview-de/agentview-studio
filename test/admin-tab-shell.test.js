// Tests for the Verwaltung Tab-Shell's pure cores (admin/views/admin/
// lifecycle.js) — the load state machine and the guarded-action flow. This is
// the first automated coverage the 9 owner-console tabs have had: the
// control-flow the architecture review flagged (silent catch, missed loading
// state, error-vs-data routing) is now pinned.
import { describe, test, expect } from './runner.js';
import { runTabLifecycle, runAction } from '../admin/views/admin/lifecycle.js';

describe('tab-shell · runTabLifecycle', () => {
  test('happy path: loading then data, in that order', async () => {
    const seq = [];
    const res = await runTabLifecycle({
      load: async () => ({ rows: [1, 2] }),
      isEmpty: (d) => !d.rows.length,
      onLoading: () => seq.push('loading'),
      onError: () => seq.push('error'),
      onEmpty: () => seq.push('empty'),
      onData: (d) => seq.push('data:' + d.rows.length),
    });
    expect(seq).toEqual(['loading', 'data:2']);
    expect(res.phase).toBe('data');
  });

  test('a throwing load routes to onError, never onData', async () => {
    const seq = [];
    const res = await runTabLifecycle({
      load: async () => { throw new Error('owner-api down'); },
      onLoading: () => seq.push('loading'),
      onError: (e) => seq.push('error:' + e.message),
      onData: () => seq.push('data'),
    });
    expect(seq).toEqual(['loading', 'error:owner-api down']);
    expect(res.phase).toBe('error');
    expect(res.error.message).toBe('owner-api down');
  });

  test('empty data routes to onEmpty, not onData', async () => {
    const seq = [];
    const res = await runTabLifecycle({
      load: async () => [],
      isEmpty: (d) => d.length === 0,
      onLoading: () => seq.push('loading'),
      onEmpty: () => seq.push('empty'),
      onData: () => seq.push('data'),
    });
    expect(seq).toEqual(['loading', 'empty']);
    expect(res.phase).toBe('empty');
  });

  test('no isEmpty → always treated as data (Tab renders its own empties)', async () => {
    const seq = [];
    await runTabLifecycle({
      load: async () => [],
      onLoading: () => seq.push('loading'),
      onData: () => seq.push('data'),
    });
    expect(seq).toEqual(['loading', 'data']);
  });
});

describe('tab-shell · runAction', () => {
  test('success reloads and does not toast', async () => {
    let reloaded = 0, errored = 0;
    await runAction(async () => {}, {}, {
      onSuccess: () => reloaded++,
      onError: () => errored++,
    });
    expect(reloaded).toBe(1);
    expect(errored).toBe(0);
  });

  test('failure toasts and does NOT reload (no stale half-render)', async () => {
    let reloaded = 0; let msg = null;
    await runAction(async () => { throw new Error('forbidden'); }, {}, {
      onSuccess: () => reloaded++,
      onError: (e) => { msg = e.message; },
    });
    expect(reloaded).toBe(0);
    expect(msg).toBe('forbidden');
  });

  test('the clicked element is passed to the handler', async () => {
    let seen = null;
    const el = { dataset: { del: 'wh_42' } };
    await runAction(async (b) => { seen = b.dataset.del; }, el, { onSuccess() {}, onError() {} });
    expect(seen).toBe('wh_42');
  });
});
