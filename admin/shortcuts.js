// Global keyboard shortcuts. Skips when typing in inputs.

import { t } from './i18n.js';

const _bindings = [];

// Platform-aware shortcut display. macOS users read glyphs (⌘⇧Z); Windows/Linux
// users have no ⌘ key, so they get worded keys joined with + (Strg+Shift+Z).
export const isMac = /mac|iphone|ipad/i.test(
  navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '',
);

// Format a logical combo (e.g. 'mod+shift+z', 'shift+p') for display. 'mod' is
// the primary accelerator: ⌘ on macOS, Strg/Ctrl elsewhere (localised).
export function kbd(spec) {
  const map = isMac
    ? { mod: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' }
    : { mod: t('kbd.ctrl'), ctrl: t('kbd.ctrl'), alt: t('kbd.alt'), shift: t('kbd.shift') };
  const sep = isMac ? '' : '+';
  return String(spec).split('+').map(part => {
    const p = part.trim().toLowerCase();
    return map[p] ?? (p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1));
  }).join(sep);
}

export function bind(combo, fn, opts = {}) {
  _bindings.push({ combo: normalize(combo), fn, opts });
}

export function install() {
  window.addEventListener('keydown', e => {
    if (isTyping(e.target) && !e.metaKey && !e.ctrlKey && e.key.length === 1) return;
    const k = comboFor(e);
    for (const b of _bindings) {
      if (b.combo === k) {
        if (b.opts.preventDefault !== false) e.preventDefault();
        try { b.fn(e); } catch (err) { console.error('shortcut handler error', err); }
        return;
      }
    }
  });
}

function isTyping(el) {
  if (!el) return false;
  const tag = (el.tagName ?? '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

function normalize(combo) {
  return combo.toLowerCase()
    .split('+').map(s => s.trim())
    .sort((a, b) => order(a) - order(b))
    .join('+');
}

function order(k) {
  return ['meta', 'ctrl', 'alt', 'shift'].indexOf(k);
}

function comboFor(e) {
  const parts = [];
  if (e.metaKey) parts.push('meta');
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey)  parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (!['meta','ctrl','alt','shift'].includes(k)) parts.push(k);
  return parts.sort((a, b) => order(a) - order(b)).join('+');
}
