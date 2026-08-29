// Opening the player's diagnostic overlay from in front of the screen.
//
// The overlay could only be turned on with `?debug=1`. A published display runs
// one fixed URL in kiosk mode: the person standing in front of it has a remote
// or a touchscreen, no address bar, and no console. So there is a gesture — and
// a gesture on a public screen has to be hard to hit by accident, which is what
// most of these cases check.
//
// Browser-only: it opens a real overlay in a real document.

import { test, expect, describe } from './runner.js';
import { enable, disable, isEnabled, armToggle } from '../player/debug-hud.js';

const STATE = () => ({
  slotUrl: '/probe.json', total: 3, visible: 2, currentIdx: 1, currentType: 'text',
  lastFetch: Date.now(), bootAt: performance.now() - 5000,
  lastError: null, failCount: 0, fromCache: false,
});

function tapAt(x, y, at) {
  const e = new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y });
  if (at !== undefined) Object.defineProperty(e, 'timeStamp', { value: at });
  document.dispatchEvent(e);
}

function withToggle(fn) {
  const off = armToggle(STATE);
  try { fn(); } finally { off(); disable(); }
}

describe('player HUD · reachable without an address bar', () => {
  test('five taps in the top-left corner open it, five more close it', () => {
    withToggle(() => {
      expect(isEnabled()).toBeFalsy();
      for (let i = 0; i < 5; i++) tapAt(20, 20);
      expect(isEnabled()).toBeTruthy();
      for (let i = 0; i < 5; i++) tapAt(20, 20);
      expect(isEnabled()).toBeFalsy();
    });
  });

  test('four taps are not enough — a gesture on a shop window must be deliberate', () => {
    withToggle(() => {
      for (let i = 0; i < 4; i++) tapAt(20, 20);
      expect(isEnabled()).toBeFalsy();
    });
  });

  test('taps outside the corner do not count, and reset the run', () => {
    withToggle(() => {
      tapAt(20, 20); tapAt(20, 20); tapAt(20, 20); tapAt(20, 20);
      tapAt(900, 500);                 // a passer-by touching the middle
      tapAt(20, 20);
      expect(isEnabled()).toBeFalsy();
    });
  });

  test('taps spread over more than three seconds do not add up', () => {
    withToggle(() => {
      const t0 = 1_000_000;
      tapAt(20, 20, t0);
      tapAt(20, 20, t0 + 1000);
      tapAt(20, 20, t0 + 2000);
      tapAt(20, 20, t0 + 3500);        // the first two have aged out
      tapAt(20, 20, t0 + 4000);
      expect(isEnabled()).toBeFalsy();
    });
  });

  test('shift+D toggles, a bare D does not', () => {
    withToggle(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'd' }));
      expect(isEnabled()).toBeFalsy();     // a stray remote keypress changes nothing
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'D', shiftKey: true }));
      expect(isEnabled()).toBeTruthy();
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'D', shiftKey: true }));
      expect(isEnabled()).toBeFalsy();
    });
  });

  test('the teardown really unlistens', () => {
    const off = armToggle(STATE);
    off();
    for (let i = 0; i < 6; i++) tapAt(20, 20);
    expect(isEnabled()).toBeFalsy();
  });
});

describe('player HUD · which clock this screen runs on', () => {
  // A wall out of step looks, screen by screen, exactly like a wall in step.
  // The number a technician can compare between two displays is this one.
  const withAnchor = (extra) => ({
    ...STATE(), slides: [{}, {}, {}], syncActive: true,
    playlist: { syncAnchor: { epochMs: Date.now() - 12_000, slideMs: [10_000, 10_000, 10_000] } },
    ...extra,
  });

  test('REGRESSION: it names the slot, the time left and the loop length', async () => {
    enable(() => withAnchor());
    await new Promise(r => requestAnimationFrame(r));
    const txt = document.getElementById('bb-debug-hud').innerText;
    expect(txt).toContain('Sync:');
    expect(txt).toContain('slot 2/3');
    expect(txt).toContain('loop 30s');
    expect(txt).toContain('8.0s left');
    disable();
  });

  test('a display with no anchor says so instead of implying a wall', async () => {
    enable(() => ({ ...STATE(), slides: [{}, {}], playlist: {}, syncActive: false }));
    await new Promise(r => requestAnimationFrame(r));
    expect(document.getElementById('bb-debug-hud').innerText).toContain('each display advances on its own');
    disable();
  });

  test('an anchor that is not being followed is not reported as sync', async () => {
    // Day-parting took the shared slide out of THIS display's rotation: the
    // anchor is there, the display is not on it, and saying "slot 2/3" would
    // send a technician looking in the wrong place.
    enable(() => withAnchor({ syncActive: false }));
    await new Promise(r => requestAnimationFrame(r));
    expect(document.getElementById('bb-debug-hud').innerText).toContain('anchor not followed');
    disable();
  });
});

describe('player HUD · what it says when something is wrong', () => {
  test('a healthy player gets no warning lines', async () => {
    enable(STATE);
    await new Promise(r => requestAnimationFrame(r));
    const text = document.getElementById('bb-debug-hud').innerText;
    disable();
    expect(text).toContain('agentView Studio Player');
    expect(text).notToContain('CACHED');
    expect(text).notToContain('failed fetch');
  });

  test('REGRESSION: the cache, the failure count and the error are all on screen', async () => {
    // Everything a technician needs in front of a screen showing the wrong
    // thing — the overlay used to report only the happy path.
    enable(() => ({ ...STATE(), fromCache: true, failCount: 3, lastError: 'playlist HTTP 404' }));
    await new Promise(r => requestAnimationFrame(r));
    const text = document.getElementById('bb-debug-hud').innerText;
    disable();
    expect(text).toContain('CACHED');
    expect(text).toContain('3 failed fetches in a row');
    expect(text).toContain('playlist HTTP 404');
  });

  test('an error message cannot inject markup into the overlay', async () => {
    enable(() => ({ ...STATE(), lastError: '<img src=x onerror="window.__hudXss=1">' }));
    await new Promise(r => requestAnimationFrame(r));
    const hud = document.getElementById('bb-debug-hud');
    const injected = hud.querySelectorAll('img, script').length;
    disable();
    expect(injected).toBe(0);
    expect(window.__hudXss).toBe(undefined);
  });

  test('the gesture opens it with an auto-close, ?debug=1 does not', async () => {
    // A shop window is a touchscreen a stranger can reach: an accidentally
    // opened overlay must not stay up until the next reboot. An explicit
    // ?debug=1 is a developer's choice and stays.
    const off = armToggle(STATE, { autoHideMs: 60 });
    for (let i = 0; i < 5; i++) tapAt(20, 20);
    expect(isEnabled()).toBeTruthy();
    await new Promise(r => setTimeout(r, 140));
    expect(isEnabled()).toBeFalsy();
    off();

    enable(STATE);                       // the ?debug=1 path: no auto-close
    await new Promise(r => setTimeout(r, 140));
    expect(isEnabled()).toBeTruthy();
    disable();
  });

  test('disable() takes the overlay away and is safe to call twice', () => {
    enable(STATE);
    expect(isEnabled()).toBeTruthy();
    disable();
    disable();
    expect(isEnabled()).toBeFalsy();
    expect(document.getElementById('bb-debug-hud')).toBe(null);
  });
});
