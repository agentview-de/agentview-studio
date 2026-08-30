// Format painter — pick up how one widget LOOKS and put it on another.
//
// On a slide with eight tiles, matching their look by hand means opening eight
// inspectors and re-picking the same theme, the same text colour and the same
// size in each. This is the one action that removes that work, and it is the
// action PowerPoint has had since 1997 for exactly the same reason.
//
// WHAT IT CARRIES, and why not more. A widget's content is plugin-specific: a
// chart's `series` and a menu's `rows` mean nothing to each other, so copying
// content wholesale between widget types would either fail or produce nonsense.
// What every widget DOES share is the styling vocabulary the shared field
// factories put there:
//
//   theme                     shared/data/themes.js  themeField()        28 plugins
//   textColor, accentColor    shared/widget-color.js colorOverride…()    29 plugins
//   textScale                 shared/text-scale.js   textScaleField()    26 plugins
//   align                     the align field control                    20 plugins
//
// …plus the three widget-level properties that are styling by definition:
// background, entrance build (`anim`) and ambient loop.
//
// Deliberately NOT carried: rect, rotation, z, title, group, hidden, locked.
// Those are identity and position, not appearance — a format painter that moved
// things would be a different, much more surprising tool.

// The content keys that mean the same thing in every plugin that has them.
export const FORMAT_CONTENT_KEYS = Object.freeze([
  'theme', 'textColor', 'accentColor', 'textScale', 'align',
]);

// The widget-level properties that are appearance rather than identity.
export const FORMAT_WIDGET_KEYS = Object.freeze(['background', 'anim', 'loop']);

const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * Read the transferable appearance of a widget. Returns null for a missing
 * widget so the caller can tell "nothing picked up" from "picked up nothing".
 */
export function pickFormat(widget) {
  if (!widget || typeof widget !== 'object') return null;
  const content = {};
  for (const k of FORMAT_CONTENT_KEYS) {
    if (widget.content && k in widget.content) content[k] = clone(widget.content[k]);
  }
  const out = { content };
  for (const k of FORMAT_WIDGET_KEYS) {
    if (k in widget) out[k] = clone(widget[k]);
  }
  return out;
}

/**
 * Put a picked-up format onto `widget`, in place. Returns true when something
 * actually changed, so the caller can skip a no-op undo entry.
 *
 * A key the TARGET does not have is skipped rather than invented: giving a QR
 * code a `textScale` it never reads would put a dead field in the JSON, and the
 * next person to read that file would reasonably wonder what it does.
 */
export function applyFormat(widget, fmt) {
  if (!widget || !fmt) return false;
  let changed = false;

  for (const k of FORMAT_CONTENT_KEYS) {
    if (!(k in (fmt.content ?? {}))) continue;
    if (!widget.content || !(k in widget.content)) continue;
    const next = clone(fmt.content[k]);
    if (JSON.stringify(widget.content[k]) === JSON.stringify(next)) continue;
    widget.content[k] = next;
    changed = true;
  }

  for (const k of FORMAT_WIDGET_KEYS) {
    const has = k in fmt;
    const next = has ? clone(fmt[k]) : undefined;
    const cur = widget[k];
    if (JSON.stringify(cur) === JSON.stringify(next)) continue;
    // An absent source value CLEARS the target's: picking up a plain widget and
    // painting it onto a glowing one has to remove the glow, or the painter can
    // only ever add and the user has no way to say "make it look like that one".
    if (next === undefined) delete widget[k];
    else widget[k] = next;
    changed = true;
  }
  return changed;
}

// ---- the armed brush ----
// Module state rather than store state on purpose: it is a transient gesture,
// not document content, and it must not survive a reload or land in an undo
// snapshot.
let _armed = null;
const _subs = new Set();

export function isArmed() { return _armed !== null; }
export function armedFormat() { return _armed; }

export function arm(widget) {
  const fmt = pickFormat(widget);
  if (!fmt) return false;
  _armed = fmt;
  notify();
  return true;
}

export function disarm() {
  if (_armed === null) return false;
  _armed = null;
  notify();
  return true;
}

export function onArmedChange(fn) { _subs.add(fn); return () => _subs.delete(fn); }
function notify() { for (const fn of _subs) { try { fn(isArmed()); } catch { /* a listener is not our problem */ } } }
