// Global keyboard shortcuts.
//
// Two rules this file exists to get right, both of which it used to get wrong:
//
//   1. WHILE SOMEBODY IS TYPING, THE FIELD OWNS THE KEYBOARD. The old guard
//      only stood down for printable keys (`e.key.length === 1`), so every
//      named key still reached the global bindings — and one of those bindings
//      is `delete`. Editing a headline in the inspector and pressing forward-
//      delete removed the widget being edited (it is selected, that is why its
//      fields are open) and swallowed the keystroke on the way. The rule is now
//      about intent, not about string length: a bare key belongs to the field,
//      an accelerator (⌘/Ctrl) belongs to the app, and Escape — which edits no
//      text — belongs to the app too.
//
//   2. A COMBO MEANS THE SAME THING ON BOTH SIDES. `kbd()` renders 'mod+z' for
//      display, but the matcher had no idea what 'mod' was: bind('mod+z') built
//      a combo string no keystroke could ever produce, and the shortcut simply
//      never fired. Both sides now canonicalise through the same table, so a
//      spec means one thing whichever order it is written in.

import { t } from './i18n.js';

const _bindings = [];

// Platform-aware shortcut display. macOS users read glyphs (⌘⇧Z); Windows/Linux
// users have no ⌘ key, so they get worded keys joined with + (Strg+Shift+Z).
export const isMac = /mac|iphone|ipad/i.test(
  navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '',
);

// Canonical modifier order — the order they are written, matched and displayed.
const MODS = ['meta', 'ctrl', 'alt', 'shift'];
// What people write in a spec → what this file calls it. 'mod' is the primary
// accelerator: ⌘ on macOS, Ctrl everywhere else.
const ALIAS = {
  mod: isMac ? 'meta' : 'ctrl',
  cmd: 'meta', command: 'meta', super: 'meta', win: 'meta',
  control: 'ctrl',
  option: 'alt',
  esc: 'escape', del: 'delete', return: 'enter', space: ' ',
};
// KeyboardEvent.key values that ARE a modifier — pressing Ctrl alone is not a
// shortcut for the key "control".
const MOD_KEYS = new Set(['meta', 'control', 'alt', 'altgraph', 'shift', 'os']);

// Format a logical combo (e.g. 'mod+shift+z', 'shift+p') for display. 'mod' is
// the primary accelerator: ⌘ on macOS, Strg/Ctrl elsewhere (localised).
export function kbd(spec) {
  const map = isMac
    ? { mod: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' }
    : { mod: t('kbd.ctrl'), ctrl: t('kbd.ctrl'), alt: t('kbd.alt'), shift: t('kbd.shift'), meta: t('kbd.ctrl') };
  const sep = isMac ? '' : '+';
  return String(spec).split('+').map(part => {
    const p = part.trim().toLowerCase();
    return map[p] ?? (p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1));
  }).join(sep);
}

/**
 * Register a shortcut. Returns a function that removes it again — a panel that
 * binds while it is open has to be able to stop.
 */
export function bind(combo, fn, opts = {}) {
  const entry = { combo: normalize(combo), fn, opts };
  _bindings.push(entry);
  return () => {
    const i = _bindings.indexOf(entry);
    if (i >= 0) _bindings.splice(i, 1);
  };
}

/** Start listening. Returns a teardown, so a second install cannot double-fire. */
export function install(target = window) {
  const onKey = e => {
    if (fieldOwns(e)) return;
    const k = comboFor(e);
    for (const b of _bindings) {
      if (b.combo === k) {
        if (b.opts.preventDefault !== false) e.preventDefault();
        try { b.fn(e); } catch (err) { console.error('shortcut handler error', err); }
        return;
      }
    }
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}

// Is this keystroke the text field's, rather than the app's?
export function fieldOwns(e) {
  if (!isTyping(e.target)) return false;
  // An accelerator is never text — ⌘K opens the palette from inside a field.
  if (e.metaKey || e.ctrlKey) return false;
  // …and Escape types nothing, so it stays available to close things.
  return String(e.key ?? '').toLowerCase() !== 'escape';
}

function isTyping(el) {
  if (!el) return false;
  const tag = (el.tagName ?? '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

function canonical(mods, key) {
  const set = new Set(mods);
  const parts = MODS.filter(m => set.has(m));
  if (key) parts.push(key);
  return parts.join('+');
}

function normalize(combo) {
  const mods = [];
  let key = '';
  for (const raw of String(combo).toLowerCase().split('+')) {
    const p = raw.trim();
    if (!p && raw !== ' ') continue;
    const named = ALIAS[p] ?? p;
    if (MODS.includes(named)) mods.push(named);
    else key = named;
  }
  return canonical(mods, key);
}

function comboFor(e) {
  const mods = [];
  if (e.metaKey) mods.push('meta');
  if (e.ctrlKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');
  const k = String(e.key ?? '').toLowerCase();
  return canonical(mods, MOD_KEYS.has(k) ? '' : k);
}
