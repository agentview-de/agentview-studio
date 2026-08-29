// The right-click menu, from the keyboard.
//
// Every surface that opens one of these is keyboard-reachable — a widget frame
// has tabindex=0, a slide card has arrow-key navigation — and browsers fire
// `contextmenu` for Shift+F10 and the menu key. So the menu opened, in the
// right place, with the right entries, and there was no way to reach a single
// one of them: focus stayed where it was, and the buttons sat at the very end
// of <body>, past everything else on the page.
//
// Escape already worked. Nothing else did.
//
// Browser-only: it opens the real menu and drives it with real key events.

import { test, expect, describe } from './runner.js';
import { openContextMenu, closeContextMenu } from '../admin/ui/context-menu.js';

const menu = () => document.querySelector('.avs-context-menu');
const labels = () => [...document.querySelectorAll('.avs-menu-item')].map(b => b.textContent.trim());
const focusedLabel = () => document.activeElement?.closest?.('.avs-menu-item')?.textContent.trim() ?? null;

// Keys reach the menu through a document-level capture listener.
const key = (k, opts = {}) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));

const ITEMS = (ran) => [
  { label: 'Duplizieren', run: () => ran.push('dup') },
  { label: 'Nach vorn', run: () => ran.push('front') },
  { separator: true },
  { label: 'Gesperrt', disabled: true, run: () => ran.push('nope') },
  { label: 'Löschen', run: () => ran.push('del') },
];

// The menu arms its document-level key listener one tick after opening, so the
// right-click that opened it cannot immediately close it again. Tests have to
// wait that tick out — a human cannot press a key inside it.
const settle = () => new Promise(r => setTimeout(r, 0));

async function withOpener(fn) {
  const opener = document.createElement('button');
  opener.textContent = 'Widget';
  document.body.appendChild(opener);
  opener.focus();
  const ran = [];
  const show = async (items) => { openContextMenu(20, 20, items ?? ITEMS(ran)); await settle(); };
  try { return await fn({ opener, ran, show }); } finally { closeContextMenu(); opener.remove(); }
}

describe('context menu · openable from the keyboard, usable from it', () => {
  test('REGRESSION: it takes focus, so the arrows and Enter have something to act on', () => {
    return withOpener(async ({ show }) => {
      await show();
      expect(labels()).toEqual(['Duplizieren', 'Nach vorn', 'Gesperrt', 'Löschen']);
      // Focus is on the first entry — not still on the element behind it.
      expect(focusedLabel()).toBe('Duplizieren');
      expect(menu().contains(document.activeElement)).toBeTruthy();
    });
  });

  test('the arrows walk the entries and skip the disabled one', () => {
    return withOpener(async ({ show }) => {
      await show();
      key('ArrowDown');
      expect(focusedLabel()).toBe('Nach vorn');
      key('ArrowDown');
      expect(focusedLabel()).toBe('Löschen');   // 'Gesperrt' is disabled
      key('ArrowDown');
      expect(focusedLabel()).toBe('Duplizieren');   // wraps
      key('ArrowUp');
      expect(focusedLabel()).toBe('Löschen');
      key('Home');
      expect(focusedLabel()).toBe('Duplizieren');
      key('End');
      expect(focusedLabel()).toBe('Löschen');
    });
  });

  test('Tab cycles inside the menu instead of walking off into the editor', () => {
    return withOpener(async ({ show }) => {
      await show();
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      document.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBeTruthy();
      expect(focusedLabel()).toBe('Nach vorn');
      key('Tab', { shiftKey: true });
      expect(focusedLabel()).toBe('Duplizieren');
      key('Tab', { shiftKey: true });
      expect(focusedLabel()).toBe('Löschen');   // wraps backwards, stays inside
    });
  });

  test('Enter on the focused entry runs it — and only it', () => {
    return withOpener(async ({ ran, show }) => {
      await show();
      key('ArrowDown');
      document.activeElement.click();          // what Enter does to a button
      expect(ran).toEqual(['front']);
      expect(menu()).toBe(null);               // …and the menu is gone
    });
  });

  test('REGRESSION: closing hands the keyboard back to whatever opened it', () => {
    return withOpener(async ({ opener, show }) => {
      await show();
      expect(document.activeElement === opener).toBeFalsy();
      key('Escape');
      expect(menu()).toBe(null);
      expect(document.activeElement).toBe(opener);
    });
  });

  test('…but dismissing it by clicking elsewhere does not yank focus back', () => {
    return withOpener(async ({ opener, show }) => {
      const elsewhere = document.createElement('button');
      document.body.appendChild(elsewhere);
      try {
        await show();
        // The click has already moved focus; taking it back would undo that.
        elsewhere.focus();
        closeContextMenu();
        expect(document.activeElement).toBe(elsewhere);
        expect(document.activeElement === opener).toBeFalsy();
      } finally { elsewhere.remove(); }
    });
  });

  test('it is announced as a menu, and a disabled entry says so', () => {
    return withOpener(async ({ show }) => {
      await show();
      expect(menu().getAttribute('role')).toBe('menu');
      const buttons = [...document.querySelectorAll('.avs-menu-item')];
      expect(buttons.every(b => b.getAttribute('role') === 'menuitem')).toBeTruthy();
      expect(buttons.every(b => b.type === 'button')).toBeTruthy();
      const locked = buttons.find(b => b.textContent.trim() === 'Gesperrt');
      expect(locked.getAttribute('aria-disabled')).toBe('true');
      expect(document.querySelector('.avs-menu-sep').getAttribute('role')).toBe('separator');
    });
  });

  test('a second open replaces the first — one menu at a time', () => {
    return withOpener(async ({ ran, show }) => {
      await show();
      await show([{ label: 'Nur eins', run: () => ran.push('one') }]);
      expect(document.querySelectorAll('.avs-context-menu')).toHaveLength(1);
      expect(labels()).toEqual(['Nur eins']);
      expect(focusedLabel()).toBe('Nur eins');
    });
  });
});
