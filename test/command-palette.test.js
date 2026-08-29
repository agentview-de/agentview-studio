// The ⌘K command palette.
//
// It is the keyboard-first way into everything the editor can do — and it had
// three problems that only show up once there are enough commands to fill it,
// which the real app passed long ago (~70 registered):
//
//   • It rendered fifty matches and navigated over ALL of them. Arrowing past
//     the fiftieth highlighted nothing, and Enter ran a command the user had
//     never seen.
//   • The highlight was never scrolled into view. The list is 55vh with its own
//     scrollbar, so arrowing down walked out of sight after a dozen steps.
//   • The ranker's comment promised a "token order bonus". The code made order
//     mandatory: each token was searched from just after the previous match, so
//     "slide add" matched nothing that "add slide" matches.
//
// And the overlay itself was a plain <div> — no role, no trap, and closing it
// dropped focus on <body>.
//
// Browser-only: it opens the real palette and drives it with real key events.

import { test, expect, describe } from './runner.js';
import { open, close, isOpen, registerCommand, rank } from '../admin/ui/command-palette.js';

const root = () => document.querySelector('.bb-pal-overlay');
const items = () => [...document.querySelectorAll('.bb-pal-item')];
const activeLabel = () => document.querySelector('.bb-pal-active .bb-pal-label')?.textContent ?? null;
const input = () => document.querySelector('.bb-pal-input');

const key = (k, opts = {}) =>
  input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));

const type = (v) => { input().value = v; input().dispatchEvent(new Event('input', { bubbles: true })); };

// The suite registers its own commands into the module-level list; they are
// named so the assertions can find them among whatever else is registered.
const ran = [];
const MANY = 60;
for (let i = 0; i < MANY; i++) {
  registerCommand({ label: `ZZTEST Befehl ${String(i).padStart(2, '0')}`, keywords: 'zztest', run: () => ran.push(i) });
}

describe('palette · you can only run what you can see', () => {
  test('REGRESSION: arrowing past the rendered list does not reach hidden commands', () => {
    ran.length = 0;
    open();
    try {
      type('zztest');
      const rendered = items().length;
      // More matches than the palette renders — the situation the real app is in.
      expect(rendered).toBe(50);
      expect(MANY > rendered).toBeTruthy();
      // Walk one full lap plus one and land back where we started.
      for (let i = 0; i < rendered; i++) key('ArrowDown');
      expect(activeLabel()).toBe('ZZTEST Befehl 00');
      // Every step of the way something was highlighted.
      for (let i = 0; i < rendered; i++) {
        key('ArrowDown');
        expect(activeLabel() === null).toBeFalsy();
      }
      key('Enter');
      // …and what ran is one of the fifty that were on screen.
      expect(ran).toHaveLength(1);
      expect(ran[0] < rendered).toBeTruthy();
    } finally { close(); }
  });

  test('Home and End go to the ends of the list that is shown', () => {
    open();
    try {
      type('zztest');
      key('End');
      expect(activeLabel()).toBe('ZZTEST Befehl 49');
      key('Home');
      expect(activeLabel()).toBe('ZZTEST Befehl 00');
      // Wrapping backwards from the first lands on the last SHOWN one.
      key('ArrowUp');
      expect(activeLabel()).toBe('ZZTEST Befehl 49');
    } finally { close(); }
  });

  test('an empty result set survives the arrow keys', () => {
    open();
    try {
      type('gibtesnichtgarantiert');
      expect(items()).toHaveLength(0);
      key('ArrowDown');
      key('ArrowUp');
      key('Enter');
      expect(isOpen()).toBeTruthy();   // nothing ran, nothing threw
      expect(document.querySelector('.bb-pal-empty') === null).toBeFalsy();
      expect(input().hasAttribute('aria-activedescendant')).toBeFalsy();
    } finally { close(); }
  });
});

describe('palette · it is a dialog, and it says which option is current', () => {
  test('REGRESSION: role, listbox wiring, and focus handed back on close', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    try {
      open();
      const r = root();
      expect(r.getAttribute('role')).toBe('dialog');
      expect(r.getAttribute('aria-modal')).toBe('true');
      expect(document.querySelector('.bb-pal-list').getAttribute('role')).toBe('listbox');
      expect(items()[0].getAttribute('role')).toBe('option');
      expect(items()[0].getAttribute('aria-selected')).toBe('true');
      // The input keeps focus; the highlight is announced through it.
      await new Promise(r2 => setTimeout(r2, 60));
      expect(document.activeElement).toBe(input());
      expect(input().getAttribute('aria-activedescendant')).toBe('bb-pal-opt-0');
      key('ArrowDown');
      expect(input().getAttribute('aria-activedescendant')).toBe('bb-pal-opt-1');
      expect(items()[1].getAttribute('aria-selected')).toBe('true');
      expect(items()[0].getAttribute('aria-selected')).toBe('false');
      // Tab does not walk into the editor behind it.
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      input().dispatchEvent(tab);
      expect(tab.defaultPrevented).toBeTruthy();

      close();
      expect(document.activeElement).toBe(opener);
    } finally { close(); opener.remove(); }
  });
});

describe('palette · the ranker', () => {
  const CMDS = [
    { label: 'Folie hinzufügen' },
    { label: 'Widget hinzufügen', keywords: 'element' },
    { label: 'Playlist exportieren' },
  ];

  test('REGRESSION: words typed out of order still find the command', () => {
    // The comment always called this a bonus; the code made it a requirement.
    expect(rank('folie hinzufügen', CMDS).map(c => c.label)).toEqual(['Folie hinzufügen']);
    expect(rank('hinzufügen folie', CMDS).map(c => c.label)).toEqual(['Folie hinzufügen']);
  });

  test('…but the order it was typed in still ranks first', () => {
    const both = [{ label: 'Alpha Beta' }, { label: 'Beta Alpha' }];
    expect(rank('alpha beta', both)[0].label).toBe('Alpha Beta');
    expect(rank('beta alpha', both)[0].label).toBe('Beta Alpha');
  });

  test('a token that appears nowhere still rules the command out', () => {
    expect(rank('folie exportieren', CMDS)).toEqual([]);
    expect(rank('hinzufügen element', CMDS).map(c => c.label)).toEqual(['Widget hinzufügen']);
  });

  test('an empty or blank query returns everything, in registration order', () => {
    expect(rank('', CMDS).map(c => c.label)).toEqual(CMDS.map(c => c.label));
    expect(rank('   ', CMDS).map(c => c.label)).toEqual(CMDS.map(c => c.label));
  });
});
