// Global keyboard shortcuts, and the one question that decides everything:
// whose keystroke is this?
//
// The editor binds `delete` globally, to remove the selected widget. The typing
// guard only stood down for printable keys, so Delete went straight past it —
// and while you edit a widget's text in the inspector, that widget IS the
// selected one. Forward-delete inside the field removed the thing you were
// editing and never reached the input. Backspace happened to be safe only
// because nothing had been bound to it yet, which is not a property worth
// relying on: the rule below is about intent, not about which keys exist today.
//
// Browser-only: real KeyboardEvents against real form controls.

import { test, expect, describe } from './runner.js';
import { bind, install, kbd, fieldOwns, isMac } from '../admin/shortcuts.js';

const MOD = isMac ? 'meta' : 'ctrl';

// A field to type into, and a place to hang the listener.
function withEditor(fn) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-3000px;top:0;width:400px;height:200px;';
  host.innerHTML = '<input id="sc-input" type="text"><textarea id="sc-area"></textarea>'
    + '<div id="sc-rich" contenteditable="true">rich</div><select id="sc-sel"><option>a</option></select>'
    + '<button id="sc-btn">nope</button>';
  document.body.appendChild(host);
  const fired = [];
  const offs = [install(host)];
  const on = (combo) => offs.push(bind(combo, () => fired.push(combo)));
  try {
    return fn({ host, fired, on, el: id => host.querySelector('#' + id) });
  } finally {
    for (const off of offs) off();
    host.remove();
  }
}

// Dispatch a keystroke as if the given element had focus.
function press(el, key, mods = {}) {
  const e = new KeyboardEvent('keydown', {
    key, bubbles: true, cancelable: true,
    metaKey: !!mods.meta, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift,
  });
  el.dispatchEvent(e);
  return e;
}

describe('shortcuts · while typing, the field owns the keyboard', () => {
  test('REGRESSION: Delete inside a text field does not delete the widget', () => {
    withEditor(({ fired, on, el }) => {
      on('delete');
      const e = press(el('sc-input'), 'Delete');
      expect(fired).toEqual([]);
      // …and the keystroke reaches the field: it was preventDefault()ed before,
      // so the character could not even be deleted.
      expect(e.defaultPrevented).toBeFalsy();
    });
  });

  test('REGRESSION: the rule holds for every named key, not just Delete', () => {
    withEditor(({ fired, on, el }) => {
      for (const k of ['Backspace', 'Enter', 'ArrowLeft', 'Home', 'End', 'PageDown', 'Tab', 'F2']) on(k.toLowerCase());
      for (const k of ['Backspace', 'Enter', 'ArrowLeft', 'Home', 'End', 'PageDown', 'Tab', 'F2']) {
        press(el('sc-input'), k);
      }
      expect(fired).toEqual([]);
    });
  });

  test('every kind of text field counts, including a contenteditable', () => {
    withEditor(({ fired, on, el }) => {
      on('delete'); on('d');
      for (const id of ['sc-input', 'sc-area', 'sc-rich', 'sc-sel']) {
        press(el(id), 'Delete');
        press(el(id), 'd');
      }
      expect(fired).toEqual([]);
    });
  });

  test('outside a field the same keys are shortcuts again', () => {
    withEditor(({ fired, on, el }) => {
      on('delete'); on('d');
      press(el('sc-btn'), 'Delete');
      press(el('sc-btn'), 'd');
      expect(fired).toEqual(['delete', 'd']);
    });
  });

  test('an accelerator still works from inside a field — ⌘K opens the palette', () => {
    withEditor(({ fired, on, el }) => {
      on(`${MOD}+k`);
      press(el('sc-input'), 'k', { [MOD]: true });
      expect(fired).toEqual([`${MOD}+k`]);
    });
  });

  test('Escape stays available from inside a field — it types nothing', () => {
    withEditor(({ fired, on, el }) => {
      on('escape');
      press(el('sc-input'), 'Escape');
      expect(fired).toEqual(['escape']);
    });
  });

  test('fieldOwns answers the question on its own', () => {
    const input = document.createElement('input');
    const btn = document.createElement('button');
    expect(fieldOwns({ target: input, key: 'Delete' })).toBeTruthy();
    expect(fieldOwns({ target: input, key: 'Escape' })).toBeFalsy();
    expect(fieldOwns({ target: input, key: 'k', ctrlKey: true })).toBeFalsy();
    expect(fieldOwns({ target: btn, key: 'Delete' })).toBeFalsy();
    expect(fieldOwns({ target: null, key: 'Delete' })).toBeFalsy();
  });
});

describe('shortcuts · a combo means the same thing on both sides', () => {
  test('REGRESSION: bind("mod+z") actually fires — it used to match nothing', () => {
    withEditor(({ fired, on, el }) => {
      on('mod+z');
      press(el('sc-btn'), 'z', { [MOD]: true });
      expect(fired).toEqual(['mod+z']);
    });
  });

  test('the order modifiers are written in does not matter', () => {
    withEditor(({ fired, on, el }) => {
      on('shift+ctrl+z');
      press(el('sc-btn'), 'z', { ctrl: true, shift: true });
      expect(fired).toEqual(['shift+ctrl+z']);
    });
  });

  test('a lone modifier is not a shortcut for a key called "control"', () => {
    withEditor(({ fired, on, el }) => {
      on('ctrl');
      press(el('sc-btn'), 'Control', { ctrl: true });
      // The binding is for the modifier alone, which IS what was pressed…
      expect(fired).toEqual(['ctrl']);
      // …but it must not also count as ctrl+control.
      expect(fired).toHaveLength(1);
    });
  });

  test('a modifier a shortcut did not ask for keeps it from firing', () => {
    withEditor(({ fired, on, el }) => {
      on('d');
      press(el('sc-btn'), 'd', { shift: true });
      press(el('sc-btn'), 'd', { alt: true });
      expect(fired).toEqual([]);
    });
  });

  test('a handler that throws does not take the next keystroke with it', () => {
    withEditor(({ fired, on, el, host }) => {
      const realError = console.error;
      console.error = () => {};
      const off = bind('x', () => { throw new Error('boom'); });
      try {
        press(host.querySelector('#sc-btn'), 'x');
        on('d');
        press(el('sc-btn'), 'd');
      } finally { console.error = realError; off(); }
      expect(fired).toEqual(['d']);
    });
  });

  test('unbind and the teardown really stop', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const fired = [];
    const off = install(host);
    const unbind = bind('q', () => fired.push('q'));
    press(host, 'q');
    unbind();
    press(host, 'q');
    off();
    host.remove();
    expect(fired).toEqual(['q']);
  });
});

describe('shortcuts · what the label says', () => {
  test('kbd renders the accelerator the way the platform writes it', () => {
    const z = kbd('mod+z');
    if (isMac) {
      expect(z).toBe('⌘Z');
      expect(kbd('mod+shift+z')).toBe('⌘⇧Z');
    } else {
      expect(z.endsWith('+Z')).toBeTruthy();
      expect(kbd('mod+shift+z').split('+')).toHaveLength(3);
    }
    // 'meta' spelled out reads as the same key as 'mod'.
    expect(kbd('meta+z')).toBe(z);
  });
});
