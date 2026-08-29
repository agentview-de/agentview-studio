// The editor told people their work was saved when it was not.
//
// persist() swallowed every failure into a console.warn, and the auto-save
// subscriber stamped `meta.autoSaveAt` afterwards WHETHER OR NOT the write had
// worked — so the chip in the header went on counting "3s … 12s … 1m" since
// the last save while nothing at all was reaching localStorage.
//
// localStorage holds about 5 MB. An image-batch import, or a handful of
// embedded data-URI pictures, goes straight through that. From the first
// QuotaExceededError on, an hour of work existed only in the open tab; the
// reload that followed restored the last GOOD save, which reads as "the app
// threw my work away" rather than "the app never had it".
//
// Browser-only: needs a real localStorage to break on purpose.

import { test, expect, describe } from './runner.js';
import { state, persist, on } from '../admin/store.js';

// Break setItem on the prototype — `localStorage` itself is a read-only
// accessor, and this is what a full quota actually looks like from JS.
function withBrokenStorage(makeError, fn) {
  const real = Storage.prototype.setItem;
  Storage.prototype.setItem = function () { throw makeError(); };
  try { return fn(); } finally { Storage.prototype.setItem = real; }
}

const quota = () => {
  const e = new Error('exceeded');
  e.name = 'QuotaExceededError';
  return e;
};

function clean(fn) {
  const pl = state.playlist;
  const before = state.meta.saveError;
  state.meta.saveError = null;
  state.playlist = { slides: [{ id: 's1', widgets: [] }] };
  try { return fn(); } finally {
    state.meta.saveError = before;
    state.playlist = pl;
    persist();
  }
}

describe('persist · when the browser says no', () => {
  test('REGRESSION: a failed write is reported, not swallowed', () => {
    clean(() => {
      expect(persist()).toBe(true);
      expect(state.meta.saveError).toBe(null);
      withBrokenStorage(quota, () => {
        expect(persist()).toBe(false);
        expect(state.meta.saveError).toBe('quota');
      });
    });
  });

  test('REGRESSION: the save clock is not stamped when nothing was saved', () => {
    clean(() => {
      // What the auto-save subscriber does: `if (persist()) stamp()`.
      let stampedAt = 0;
      const autosave = () => { if (persist()) stampedAt = 1234; };
      withBrokenStorage(quota, autosave);
      expect(stampedAt).toBe(0);
      autosave();
      expect(stampedAt).toBe(1234);
    });
  });

  test('a full store and a broken one read differently', () => {
    clean(() => {
      withBrokenStorage(() => new Error('disabled by policy'), () => {
        persist();
        expect(state.meta.saveError).toBe('other');
      });
    });
  });

  test('every dialect of "the quota is full" is understood', () => {
    const dialects = [
      () => Object.assign(new Error('x'), { name: 'QuotaExceededError' }),
      () => Object.assign(new Error('x'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' }),  // Firefox
      () => Object.assign(new Error('x'), { name: 'Whatever', code: 22 }),          // legacy
      () => Object.assign(new Error('x'), { name: 'Whatever', code: 1014 }),
    ];
    for (const make of dialects) {
      clean(() => {
        withBrokenStorage(make, () => {
          persist();
          expect(state.meta.saveError).toBe('quota');
        });
      });
    }
  });

  test('REGRESSION: it announces once per episode, not once per keystroke', () => {
    clean(() => {
      const seen = [];
      const off = on('save-state', k => seen.push(k));
      try {
        withBrokenStorage(quota, () => { persist(); persist(); persist(); });
        expect(seen).toEqual(['quota']);      // …not ['quota','quota','quota']
        persist();
        expect(seen).toEqual(['quota', null]); // and the recovery is announced
      } finally { off?.(); }
    });
  });

  test('the document already on disk survives a failed write', () => {
    clean(() => {
      state.playlist = { slides: [{ id: 'good', widgets: [] }] };
      persist();
      const saved = localStorage.getItem('bb_studio_playlist');
      expect(saved).toContain('good');
      state.playlist = { slides: [{ id: 'newer', widgets: [] }] };
      withBrokenStorage(quota, () => persist());
      // Older than the screen, but intact — never half-written.
      expect(localStorage.getItem('bb_studio_playlist')).toBe(saved);
    });
  });
});
