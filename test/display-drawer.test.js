// The display drawer's tab strip, as a screen reader and a keyboard meet it.
//
// The drawer already had the hard parts right — role="dialog", aria-modal,
// Escape, focus in on open and back to the opener on close, arrow keys between
// the tabs. What it did not have was any way to tell WHICH tab is current: the
// active one was marked with a CSS class alone, so six buttons were announced
// as six equal tabs. And every one of them carried tabindex="0", making the
// strip six Tab stops in a dialog that has perhaps a dozen — the tabs pattern
// asks for exactly one, with the arrows moving inside it (the shape the slide
// rail already uses).
//
// Browser-only: it opens the real drawer in a real document.

import { test, expect, describe } from './runner.js';
import { state } from '../admin/store.js';
import { open, close } from '../admin/ui/display-drawer.js';

const DISPLAY = { id: 'drw-d1', profileId: 'drw-d1', name: 'Schaufenster links', status: 'online', online: true, categoryIds: [] };

/**
 * Open the drawer over a stub fleet, offline, and clean up afterwards.
 *
 * ASYNC on purpose. The stub used to be torn down the instant `fn` returned —
 * but the drawer's content tab starts a store-template search of its own, and
 * that request landed after the real fetch was back: the suite quietly reached
 * the live agentView API through the dev proxy on every run, twice, and the
 * page's console carried the 404s to prove it. "Nothing may leave the machine"
 * is the point of the stub; it has to outlive the work it is stubbing.
 */
async function withDrawer(fn) {
  const savedFleet = state.fleet.displays;
  const savedStatus = state.connection.status;
  const savedTab = state.ui.displayDrawerTab;
  const realFetch = window.fetch;
  const realWarn = console.warn;
  const realError = console.error;
  // The tabs fetch on activation; nothing may leave the machine and the
  // failures are not what this file is about.
  window.fetch = async () => { throw new TypeError('Failed to fetch'); };
  console.warn = () => {};
  console.error = () => {};
  const opener = document.createElement('button');
  opener.textContent = 'opener';
  document.body.appendChild(opener);
  opener.focus();
  try {
    state.fleet.displays = [DISPLAY];
    state.connection.status = 'connected';
    state.ui.displayDrawerTab = 'overview';
    open(DISPLAY.id);
    await fn({
      opener,
      aside: () => document.querySelector('aside.avs-drawer'),
      tabs: () => [...document.querySelectorAll('.avs-drawer-tab')],
      panel: () => document.getElementById('drw-body'),
      key: (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })),
    });
  } finally {
    close();
    // Let whatever the drawer started resolve INSIDE the stub.
    await new Promise(r => setTimeout(r, 120));
    opener.remove();
    window.fetch = realFetch;
    console.warn = realWarn;
    console.error = realError;
    state.fleet.displays = savedFleet;
    state.connection.status = savedStatus;
    state.ui.displayDrawerTab = savedTab;
  }
}

describe('display drawer · the dialog', () => {
  test('it is a modal dialog named after the display', () => {
    return withDrawer(({ aside }) => {
      const el = aside();
      expect(el.getAttribute('role')).toBe('dialog');
      expect(el.getAttribute('aria-modal')).toBe('true');
      const labelledBy = el.getAttribute('aria-labelledby');
      expect(labelledBy).toBe('drw-title');
      expect(document.getElementById(labelledBy).textContent).toBe('Schaufenster links');
    });
  });

  test('the tabs live in a tablist', () => {
    return withDrawer(({ tabs }) => {
      expect(document.getElementById('drw-tabs').getAttribute('role')).toBe('tablist');
      expect(tabs().length >= 5).toBeTruthy();
      for (const t of tabs()) expect(t.getAttribute('role')).toBe('tab');
    });
  });

  test('Escape closes it and hands focus back to whatever opened it', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    const savedFleet = state.fleet.displays;
    const savedStatus = state.connection.status;
    const realFetch = window.fetch;
    window.fetch = async () => { throw new TypeError('offline'); };
    try {
      state.fleet.displays = [DISPLAY];
      state.connection.status = 'connected';
      opener.focus();
      open(DISPLAY.id);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(document.querySelector('aside.avs-drawer').classList.contains('avs-on')).toBeFalsy();
      expect(document.activeElement === opener).toBeTruthy();
    } finally {
      close();
      opener.remove();
      window.fetch = realFetch;
      state.fleet.displays = savedFleet;
      state.connection.status = savedStatus;
    }
  });
});

describe('display drawer · which tab is current', () => {
  test('REGRESSION: exactly one tab is aria-selected', () => {
    return withDrawer(({ tabs }) => {
      const sel = tabs().map(t => t.getAttribute('aria-selected'));
      expect(sel.filter(v => v === 'true')).toHaveLength(1);
      expect(sel.filter(v => v === null)).toEqual([]);   // never simply absent
      expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    });
  });

  test('REGRESSION: the strip is ONE tab stop, not six', () => {
    return withDrawer(({ tabs }) => {
      expect(tabs().filter(t => t.tabIndex === 0)).toHaveLength(1);
      expect(tabs()[0].tabIndex).toBe(0);
      for (const t of tabs().slice(1)) expect(t.tabIndex).toBe(-1);
    });
  });

  test('the arrows move the selection, the tab stop and the focus together', () => {
    return withDrawer(({ tabs, key }) => {
      key(tabs()[0], 'ArrowRight');
      expect(document.activeElement.dataset.tab).toBe(tabs()[1].dataset.tab);
      expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
      expect(tabs()[0].getAttribute('aria-selected')).toBe('false');
      expect(tabs().filter(t => t.tabIndex === 0)).toHaveLength(1);
      expect(tabs()[1].tabIndex).toBe(0);
    });
  });

  test('Home and End reach the ends, and left wraps around', () => {
    return withDrawer(({ tabs, key }) => {
      key(tabs()[0], 'End');
      const last = tabs()[tabs().length - 1];
      expect(last.getAttribute('aria-selected')).toBe('true');
      key(document.activeElement, 'Home');
      expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
      key(document.activeElement, 'ArrowLeft');
      expect(tabs()[tabs().length - 1].getAttribute('aria-selected')).toBe('true');
    });
  });

  test('the panel is a tabpanel that names its tab', () => {
    return withDrawer(({ tabs, panel, key }) => {
      expect(panel().getAttribute('role')).toBe('tabpanel');
      expect(panel().getAttribute('aria-labelledby')).toBe(tabs()[0].id);
      key(tabs()[0], 'ArrowRight');
      expect(panel().getAttribute('aria-labelledby')).toBe(tabs()[1].id);
      // …and the tab points back at the panel.
      expect(tabs()[1].getAttribute('aria-controls')).toBe('drw-body');
    });
  });
});
