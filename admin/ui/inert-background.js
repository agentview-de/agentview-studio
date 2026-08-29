// Everything except the dialog, out of the way.
//
// This app puts real work into keyboard traps: the modal, the drawer, the
// command palette, the fullscreen preview and the context menu all keep Tab
// inside themselves. modal.js even describes what is behind it as "the (inert)
// background content" — and nothing in the app ever set `inert` on anything.
//
// A Tab trap is not a reader trap. The way most blind users move through a page
// is the virtual cursor, which walks the accessibility tree and does not care
// about tabindex at all: it went straight out of the open dialog and on through
// the editor behind it, with nothing to say where the dialog ended.
// `aria-modal="true"` is meant to imply that, and in practice never reliably
// did — which is why `inert` exists.
//
// One call per dialog. Each call remembers ONLY what it changed, so a confirm
// stacked on an editor restores the editor's overlay when it closes and leaves
// the page inert underneath, exactly as the stack expects.

// Toasts are announcements, not background: a dialog that reports "saved"
// should still be able to say so.
const KEEP_LIVE = '.bb-toast-host';

/**
 * `inert` also blocks POINTER events, so anything the dialog still needs the
 * user to be able to click has to be kept out of it — the drawer's backdrop
 * closes on click and lives beside the drawer rather than inside it.
 *
 * @param {Element|Element[]} keep  the dialog's own top-level element(s)
 * @returns {() => void} undo — restores exactly the elements this call inerted
 */
export function inertBackground(keep) {
  const keeps = (Array.isArray(keep) ? keep : [keep]).filter(Boolean);
  if (typeof document === 'undefined' || !keeps.length) return () => {};
  const changed = [];
  for (const el of [...document.body.children]) {
    if (keeps.some(k => el === k || el.contains(k) || k.contains(el))) continue;
    if (el.matches?.(KEEP_LIVE)) continue;
    if (el.inert) continue;                 // a dialog below already did this
    el.inert = true;
    changed.push(el);
  }
  return () => { for (const el of changed) el.inert = false; };
}
