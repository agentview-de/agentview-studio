// The debug HUD is the one thing a technician standing in front of a wrong
// screen can reach: five taps in the top-left corner, or shift+D.
//
// So it has to answer "why is this screen wrong?" — and for data slots it did
// not. `fetchSlotData` swallowed every failure (`if (!res.ok) return;` and an
// empty catch), so a slot that had been 404-ing for hours left the last good
// value on screen, which looks exactly like fresh data. The HUD, standing right
// next to it, said nothing.
//
// Browser-only: the HUD builds real DOM and runs on requestAnimationFrame.

import { test, expect, describe } from './runner.js';
import { enable, disable, isEnabled } from '../player/debug-hud.js';

const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

const healthy = () => ({
  failCount: 0, slotFails: {}, lastError: null, fromCache: false,
  total: 3, visible: 3, currentIdx: 0, currentType: 'text',
  lastFetch: 1_800_000_000_000, bootAt: 0, slotUrl: null,
});

async function withHud(state, fn) {
  disable();
  enable(state);
  try {
    await frame();
    await fn(document.getElementById('bb-debug-hud'));
  } finally { disable(); }
}

describe('debug HUD · what a technician can see', () => {
  test('a healthy display shows a quiet box', async () => {
    await withHud(healthy, hud => {
      expect(hud.textContent).toContain('Slides: 3');
      expect(hud.textContent).notToContain('⚑');
    });
  });

  test('REGRESSION: a stale data slot is named, not silently shown', async () => {
    const s = { ...healthy(), slotFails: { 'lunch-menu': 4, 'room-status': 0 } };
    await withHud(() => s, hud => {
      expect(hud.textContent).toContain('slot data stale');
      expect(hud.textContent).toContain('lunch-menu (4×)');
      // A slot that is fine is not listed — the box stays short.
      expect(hud.textContent).notToContain('room-status');
    });
  });

  test('every failing slot is listed, so one bad feed is not hidden by another', async () => {
    const s = { ...healthy(), slotFails: { a: 1, b: 2 } };
    await withHud(() => s, hud => {
      expect(hud.textContent).toContain('a (1×)');
      expect(hud.textContent).toContain('b (2×)');
    });
  });

  test('a slug from the server cannot inject markup', async () => {
    const s = { ...healthy(), slotFails: { '<img src=x onerror=alert(1)>': 2 } };
    await withHud(() => s, hud => {
      expect(hud.querySelector('img')).toBe(null);
      expect(hud.textContent).toContain('<img src=x');
    });
  });

  test('an older player state without the field still renders', async () => {
    const s = { ...healthy() };
    delete s.slotFails;
    await withHud(() => s, hud => {
      expect(hud.textContent).toContain('Slides: 3');
      expect(hud.textContent).notToContain('slot data stale');
    });
  });

  test('playlist trouble still shows, and the box closes again', async () => {
    await withHud(() => ({ ...healthy(), failCount: 3, lastError: 'playlist HTTP 401' }), hud => {
      expect(hud.textContent).toContain('3 failed fetches in a row');
      expect(hud.textContent).toContain('playlist HTTP 401');
    });
    expect(isEnabled()).toBeFalsy();
    expect(document.getElementById('bb-debug-hud')).toBe(null);
  });
});
