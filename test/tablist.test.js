// A row of buttons that switches what fills the page is a tablist.
//
// The app has two — the three views in the header and the nine tabs of the
// Verwaltung console — and both marked the active one with nothing but a CSS
// class. A screen reader heard nine identically-shaped buttons with no way to
// tell which section it was already in: the answer was on screen, in a
// background colour.
//
// And the keyboard shape was wrong in the other direction: nine separate tab
// stops sat in front of every panel. A tablist is ONE stop — you arrive on the
// current tab, walk the rest with the arrows, and Tab moves on into the panel.
//
// Browser-only: roles, roving tabindex and key events on real elements.

import { test, expect, describe } from './runner.js';
import { wireTablist } from '../admin/ui/tablist.js';

function fixture(n = 3) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-3000px;top:0;width:400px;';
  host.innerHTML = `
    <div id="tl-row">${Array.from({ length: n }, (_, i) =>
    `<button data-id="v${i}">Ansicht ${i}</button>`).join('')}</div>
    ${Array.from({ length: n }, (_, i) => `<div class="tl-panel" data-id="v${i}">Inhalt ${i}</div>`).join('')}`;
  document.body.appendChild(host);
  const picked = [];
  const api = wireTablist(host.querySelector('#tl-row'), {
    itemSelector: 'button',
    idOf: b => b.dataset.id,
    onPick: id => { picked.push(id); api.setActive(id); },
    panelOf: id => host.querySelector(`.tl-panel[data-id="${id}"]`),
    label: 'Hauptansichten',
  });
  api.setActive('v0');
  return {
    host, api, picked,
    row: () => host.querySelector('#tl-row'),
    tabs: () => [...host.querySelectorAll('#tl-row button')],
    panel: (id) => host.querySelector(`.tl-panel[data-id="${id}"]`),
    key: (k) => host.querySelector('#tl-row').dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })),
    done: () => host.remove(),
  };
}

describe('tablist · which one am I in', () => {
  test('REGRESSION: the active tab says so, not just in a colour', () => {
    const f = fixture();
    try {
      expect(f.row().getAttribute('role')).toBe('tablist');
      expect(f.row().getAttribute('aria-label')).toBe('Hauptansichten');
      expect(f.tabs().every(b => b.getAttribute('role') === 'tab')).toBeTruthy();
      expect(f.tabs().map(b => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
      f.api.setActive('v2');
      expect(f.tabs().map(b => b.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
    } finally { f.done(); }
  });

  test('REGRESSION: the row is one tab stop, on the current tab', () => {
    const f = fixture();
    try {
      expect(f.tabs().map(b => b.tabIndex)).toEqual([0, -1, -1]);
      f.api.setActive('v1');
      expect(f.tabs().map(b => b.tabIndex)).toEqual([-1, 0, -1]);
    } finally { f.done(); }
  });

  test('the arrows walk the row and pick as they go', () => {
    const f = fixture();
    try {
      f.tabs()[0].focus();
      f.key('ArrowRight');
      expect(document.activeElement).toBe(f.tabs()[1]);
      expect(f.picked).toEqual(['v1']);
      f.key('ArrowRight');
      f.key('ArrowRight');
      expect(document.activeElement).toBe(f.tabs()[0]);   // wraps
      f.key('ArrowLeft');
      expect(document.activeElement).toBe(f.tabs()[2]);
      f.key('Home');
      expect(document.activeElement).toBe(f.tabs()[0]);
      f.key('End');
      expect(document.activeElement).toBe(f.tabs()[2]);
      expect(f.picked).toEqual(['v1', 'v2', 'v0', 'v2', 'v0', 'v2']);
    } finally { f.done(); }
  });

  test('a panel knows which tab named it', () => {
    const f = fixture();
    try {
      const tab0 = f.tabs()[0];
      expect(f.panel('v0').getAttribute('role')).toBe('tabpanel');
      expect(tab0.getAttribute('aria-controls')).toBe(f.panel('v0').id);
      expect(f.panel('v0').getAttribute('aria-labelledby')).toBe(tab0.id);
      f.api.setActive('v1');
      expect(f.panel('v1').getAttribute('aria-labelledby')).toBe(f.tabs()[1].id);
    } finally { f.done(); }
  });

  test('a row that is not there is not an error', () => {
    const api = wireTablist(null, { itemSelector: 'button', idOf: () => '', onPick: () => {} });
    api.setActive('x');   // must not throw
    expect(typeof api.setActive).toBe('function');
  });
});
