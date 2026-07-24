// In-place rich-text editing session — double-click a text widget's body to edit
// it directly on the canvas. Extracted from canvas.js: it is a self-contained
// sub-feature (a contenteditable body + floating toolbars + auto-zoom + a tangle
// of document-level listeners) that never touches the canvas's widget/frame model
// beyond a re-render on exit. The few canvas-internal things it needs — the
// viewport element, zoom snapshot/restore + zoom-to-widget, and select/refresh —
// are INJECTED via `ctl`, so this module carries no back-reference to canvas.js.
//
// This module owns the "one session at a time" lifecycle: enter tears down any
// prior session first, and every exit path (toolbar close, Escape, outside click,
// slide switch) routes through exitInlineTextEdit(). State mutations happen
// in-place while typing, but commit() fires only on exit, so undo lands one entry
// per session (not per keystroke).

import { state, commit, subscribe } from '../store.js';
import { sanitizeHtml } from '../../shared/sanitize-html.js';
import { buildInlineToolbar, buildInlineLinkPopover, buildInlineTableBar } from './inline-editor.js';

// The single active session, or null. Owned here so the self-exit triggers
// (Escape / outside-click / slide-switch) and the caller's dispose() share one
// source of truth.
let _active = null;

export function isInlineEditing() { return !!_active; }

// End the active session (idempotent). Runs the session's full teardown once.
export function exitInlineTextEdit() {
  if (!_active) return;
  const s = _active;
  _active = null;
  try { s.dispose(); } catch (err) { console.warn('exitInlineTextEdit', err); }
}

// Begin editing `widget`'s body inside `frameEl`. `ctl` supplies the canvas hooks:
//   viewport                  scroller element the floating toolbars attach to
//   zoomToWidget(rect)         zoom+pan so the widget fills the viewport
//   snapshotViewport() → snap  capture zoom/pan to restore on exit
//   restoreViewport(snap)      put zoom/pan back
//   selectWidget(id) / refreshWidget(id)
export function enterInlineTextEdit(widget, frameEl, ctl) {
  if (_active) exitInlineTextEdit();
  const bodyEl = frameEl.querySelector('.bb-body');
  if (!bodyEl) return;

  ctl.selectWidget(widget.id);
  frameEl.classList.add('avs-frame-editing');

  // Auto-zoom on the widget so the user types at a comfortable size; the snapshot
  // is taken BEFORE we modify zoom/pan so exit can hand back exactly what they had.
  const zoomSnap = ctl.snapshotViewport();
  ctl.zoomToWidget(widget.rect);

  bodyEl.contentEditable = 'true';
  bodyEl.spellcheck = true;
  bodyEl.focus();

  // Auto-select all so the first keystroke replaces placeholder text; for
  // already-authored content a caret-at-end is friendlier.
  const sel0 = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(bodyEl);
  if (!bodyEl.textContent?.trim() || bodyEl.textContent?.includes('Type your announcement')) {
    sel0.removeAllRanges(); sel0.addRange(range);
  } else {
    range.collapse(false);
    sel0.removeAllRanges(); sel0.addRange(range);
  }

  // During typing: mutate widget.content.body directly so the inspector field
  // (re-)renders cleanly on exit. NO commit() here — that would flood undo.
  const writeBody = () => { widget.content.body = sanitizeHtml(bodyEl.innerHTML); };
  bodyEl.addEventListener('input', writeBody);
  // Paste as plain text — matches the inspector editor's behaviour.
  const onPaste = e => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  };
  bodyEl.addEventListener('paste', onPaste);

  // Floating toolbar — appended to the scroller, not the stage, so it stays a
  // constant size regardless of zoom.
  const toolbar = buildInlineToolbar(bodyEl, writeBody, () => exitInlineTextEdit());
  ctl.viewport.appendChild(toolbar);

  // Context floaters: a link popover (caret inside an <a>) and a table mini-bar
  // (caret inside a cell). Both live in the viewport and reposition on
  // selectionchange.
  const linkPop = buildInlineLinkPopover(bodyEl, ctl.viewport, writeBody);
  const tableBar = buildInlineTableBar(bodyEl, ctl.viewport, writeBody);
  const refreshContext = () => { linkPop.refresh(); tableBar.refresh(); };
  document.addEventListener('selectionchange', refreshContext);

  // Escape exits; the inline formatting shortcuts (Ctrl+Shift+7/8/X/…) mirror the
  // inspector editor so muscle memory is consistent across both editing modes.
  const onKeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); exitInlineTextEdit(); return; }
    if (!bodyEl.contains(e.target) && document.activeElement !== bodyEl) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && e.shiftKey && k === 'x') { e.preventDefault(); document.execCommand('strikeThrough'); writeBody(); return; }
    if (mod && e.shiftKey && k === '7') { e.preventDefault(); document.execCommand('insertOrderedList');   writeBody(); return; }
    if (mod && e.shiftKey && k === '8') { e.preventDefault(); document.execCommand('insertUnorderedList'); writeBody(); return; }
    if (mod && e.shiftKey && (k === ',' || k === '<')) { e.preventDefault(); try { document.execCommand('styleWithCSS', false, false); } catch {} document.execCommand('subscript');   writeBody(); return; }
    if (mod && e.shiftKey && (k === '.' || k === '>')) { e.preventDefault(); try { document.execCommand('styleWithCSS', false, false); } catch {} document.execCommand('superscript'); writeBody(); return; }
  };
  // Capture phase so this fires before the canvas's own pointerdown (deselect).
  const onPointerDown = e => {
    if (frameEl.contains(e.target)) return;
    if (toolbar.contains(e.target)) return;
    if (linkPop.contains(e.target)) return;
    if (tableBar.contains(e.target)) return;
    exitInlineTextEdit();
  };
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onPointerDown, true);

  // Slide-switch mid-edit would tear down the frame under our feet — bail cleanly.
  const unsubSlide = subscribe('ui', p => { if (p === 'ui.activeSlideId') exitInlineTextEdit(); });

  // Re-zoom on window resize (debounced) so the widget stays centred.
  let resizeTimer = null;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => ctl.zoomToWidget(widget.rect), 80);
  };
  window.addEventListener('resize', onResize);

  _active = {
    widgetId: widget.id,
    dispose() {
      bodyEl.removeEventListener('input', writeBody);
      bodyEl.removeEventListener('paste', onPaste);
      bodyEl.contentEditable = 'false';
      bodyEl.removeAttribute('contenteditable');
      bodyEl.removeAttribute('spellcheck');
      toolbar.remove();
      linkPop.dispose();
      tableBar.dispose();
      document.removeEventListener('selectionchange', refreshContext);
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onResize);
      clearTimeout(resizeTimer);
      try { unsubSlide?.(); } catch {}
      frameEl.classList.remove('avs-frame-editing');
      // Final sanitised commit + canonical re-render via the plugin so the saved
      // file looks exactly like what would load from disk.
      widget.content.body = sanitizeHtml(bodyEl.innerHTML);
      commit('inline-edit-text');
      ctl.refreshWidget(widget.id);
      // refreshWidget rebuilds the frame but doesn't notify the inspector (its
      // subscribe fires only on change) — toggle selectedWidgetId through null in
      // the same synchronous stack so the inspector re-renders without a flicker.
      const sel = state.ui.selectedWidgetId;
      if (sel === widget.id) {
        state.ui.selectedWidgetId = null;
        state.ui.selectedWidgetId = widget.id;
      } else {
        ctl.selectWidget(widget.id);
      }
      // Restore the prior zoom/pan now that the user is done.
      ctl.restoreViewport(zoomSnap);
    },
  };
}
