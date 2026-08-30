// Floating toolbars for on-canvas inline text editing. Extracted from canvas.js
// — these are self-contained DOM factories (no canvas zoom/pan/state coupling):
// each takes the contenteditable `editor`, a host element, and an `onCommit`
// callback, and returns an element (the toolbar) or a {refresh, contains,
// dispose} controller (the link/table context floaters). The orchestration that
// owns the editing session (enter/exit, zoom-to-widget, commit-on-exit) stays in
// canvas.js; only the widget chrome lives here.

import { t } from '../i18n.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';

// Compact toolbar shown while a text widget is being inline-edited. Holds the
// essentials (B/I/U/S, colour, sizes, alignment, lists, undo, Done). Power
// features (tables, links, emoji, etc.) live in the inspector's full editor.
export function buildInlineToolbar(editor, onCommit, onExit) {
  const tb = document.createElement('div');
  tb.className = 'avs-inline-toolbar';

  // Track + restore the editor's selection so toolbar focus-stealing controls
  // (colour picker, native select) can still apply to the right text run.
  let savedRange = null;
  const onSelChange = () => {
    const sel = document.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
      refreshStates();
    }
  };
  document.addEventListener('selectionchange', onSelChange);
  const restore = () => {
    editor.focus();
    if (!savedRange) return;
    const sel = document.getSelection();
    sel.removeAllRanges(); sel.addRange(savedRange);
  };

  const exec = (cmd, val, useCss = true) => {
    restore();
    try { document.execCommand('styleWithCSS', false, useCss); } catch {}
    document.execCommand(cmd, false, val);
    onCommit();
    refreshStates();
  };
  const btn = (label, title, handler, cmd) => {
    const b = document.createElement('button');
    b.className = 'avs-inline-btn';
    if (cmd) b.dataset.cmd = cmd;
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = label;
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', handler);
    return b;
  };
  const sep = () => { const s = document.createElement('span'); s.className = 'avs-inline-sep'; return s; };

  tb.append(
    btn('B', t('rt.bold'),      () => exec('bold'),      'bold'),
    btn('I', t('rt.italic'),    () => exec('italic'),    'italic'),
    btn('U', t('rt.underline'), () => exec('underline'), 'underline'),
    btn('S', t('rt.strike'),    () => exec('strikeThrough'), 'strikeThrough'),
  );

  // Colour
  tb.append(sep());
  const colorLabel = document.createElement('label');
  colorLabel.className = 'avs-inline-color';
  colorLabel.title = t('rt.color');
  const colorInp = document.createElement('input');
  colorInp.type = 'color';
  colorInp.addEventListener('mousedown', e => e.stopPropagation());
  colorInp.addEventListener('change', () => exec('foreColor', colorInp.value));
  colorLabel.appendChild(colorInp);
  tb.append(colorLabel);

  // Sizes
  tb.append(sep());
  for (const [v, l, title] of [['2', 'S', t('rt.sizeS')], ['3', 'M', t('rt.sizeM')], ['5', 'L', t('rt.sizeL')], ['7', 'XL', t('rt.sizeXL')]]) {
    tb.append(btn(l, title, () => exec('fontSize', v)));
  }

  // Alignment
  tb.append(sep());
  tb.append(
    // The same three icons the inspector's rich-text bar uses. This toolbar
    // still had the typographic arrows ⇤ ↔ ⇥ — including the ↔ for "centre"
    // that ui-icons.js documents as actively misleading, since a left-right
    // arrow reads as "stretch to the full width". Two toolbars, one editor,
    // one vocabulary.
    btn(uiIconSvg('align-left'),   t('rt.alignLeft'),   () => exec('justifyLeft'),   'justifyLeft'),
    btn(uiIconSvg('align-center'), t('rt.alignCenter'), () => exec('justifyCenter'), 'justifyCenter'),
    btn(uiIconSvg('align-right'),  t('rt.alignRight'),  () => exec('justifyRight'),  'justifyRight'),
  );

  // Lists
  tb.append(sep());
  tb.append(
    btn('•',  t('rt.bulletList'),   () => exec('insertUnorderedList'), 'insertUnorderedList'),
    btn('1.', t('rt.numberedList'), () => exec('insertOrderedList'),   'insertOrderedList'),
  );

  // Indent / outdent — the pair that nests a bullet, which is the one thing a
  // list on a slide always needs and the inline bar could not do.
  tb.append(
    btn(uiIconSvg('text-outdent'), t('rt.outdent'), () => exec('outdent')),
    btn(uiIconSvg('text-indent'),  t('rt.indent'),  () => exec('indent')),
  );

  // Clear, exit
  tb.append(sep());
  tb.append(btn(uiIconSvg('clear-format'), t('rt.clearFormat'), () => exec('removeFormat')));
  tb.append(btn(t('rt.inline.done'), t('rt.inline.doneTitle'), onExit));

  const stateButtons = tb.querySelectorAll('[data-cmd]');
  function refreshStates() {
    for (const b of stateButtons) {
      let on = false;
      try { on = document.queryCommandState(b.dataset.cmd); } catch {}
      b.classList.toggle('avs-inline-active', on);
    }
  }

  // Expose cleanup so the caller can drop the selectionchange listener.
  tb._cleanup = () => document.removeEventListener('selectionchange', onSelChange);
  const origRemove = tb.remove.bind(tb);
  tb.remove = () => { try { tb._cleanup(); } catch {} origRemove(); };
  return tb;
}

// ----- Inline mode: link popover -----
// Pinned below the active <a> when the caret is inside one; otherwise hidden.
// URL field commits on change/Enter; ✕ unwraps the link; ↗ opens it.
export function buildInlineLinkPopover(editor, hostEl, onCommit) {
  const el = document.createElement('div');
  el.className = 'avs-inline-linkpop';
  el.hidden = true;
  hostEl.appendChild(el);

  let anchor = null;

  function closestA() {
    const sel = document.getSelection();
    if (!sel?.rangeCount) return null;
    if (!editor.contains(sel.anchorNode)) return null;
    let n = sel.anchorNode;
    if (n && n.nodeType === 3) n = n.parentNode;
    while (n && n !== editor) {
      if (n.tagName === 'A') return n;
      n = n.parentNode;
    }
    return null;
  }

  function refresh() {
    const a = closestA();
    if (!a) { el.hidden = true; anchor = null; return; }
    if (a === anchor && !el.hidden) { reposition(a); return; }
    anchor = a;
    el.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'avs-inline-linkpop-row';
    const inp = document.createElement('input');
    inp.type = 'url';
    inp.value = a.getAttribute('href') || '';
    inp.className = 'avs-inline-linkpop-url';
    inp.addEventListener('mousedown', e => e.stopPropagation());
    inp.addEventListener('change', () => {
      const u = inp.value.trim();
      if (u) { a.setAttribute('href', u); onCommit(); }
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.dispatchEvent(new Event('change')); }
    });
    const open = document.createElement('button');
    open.className = 'avs-inline-btn';
    open.type = 'button';
    open.title = t('rt.link.open');
    open.textContent = '↗';
    open.addEventListener('mousedown', e => e.preventDefault());
    open.addEventListener('click', () => {
      const u = inp.value.trim();
      if (u) window.open(u, '_blank', 'noopener,noreferrer');
    });
    const rm = document.createElement('button');
    rm.className = 'avs-inline-btn';
    rm.type = 'button';
    rm.title = t('rt.link.remove');
    rm.textContent = '✕';
    rm.addEventListener('mousedown', e => e.preventDefault());
    rm.addEventListener('click', () => {
      const parent = a.parentNode;
      while (a.firstChild) parent.insertBefore(a.firstChild, a);
      parent.removeChild(a);
      el.hidden = true; anchor = null;
      onCommit();
    });
    row.append(inp, open, rm);
    el.append(row);
    el.hidden = false;
    reposition(a);
  }

  function reposition(a) {
    const hr = hostEl.getBoundingClientRect();
    const r = a.getBoundingClientRect();
    el.style.top  = (r.bottom - hr.top + 4) + 'px';
    el.style.left = Math.max(8, Math.min(hr.width - 320, r.left - hr.left)) + 'px';
  }

  return {
    refresh,
    contains: n => el.contains(n),
    dispose() { el.remove(); },
  };
}

// ----- Inline mode: table contextual bar -----
// Shown when the caret is inside a TD/TH. Lighter than the inspector version
// (no merge/split — that's a power feature; power users use the inspector).
export function buildInlineTableBar(editor, hostEl, onCommit) {
  const el = document.createElement('div');
  el.className = 'avs-inline-tablebar';
  el.hidden = true;
  hostEl.appendChild(el);

  function currentCell() {
    const sel = document.getSelection();
    if (!sel?.rangeCount) return null;
    if (!editor.contains(sel.anchorNode)) return null;
    let n = sel.anchorNode;
    if (n && n.nodeType === 3) n = n.parentNode;
    while (n && n !== editor) {
      if (n.tagName === 'TD' || n.tagName === 'TH') return n;
      n = n.parentNode;
    }
    return null;
  }

  const makeCell = (tag = 'td') => { const c = document.createElement(tag); c.appendChild(document.createElement('br')); return c; };

  function act(action) {
    const cell = currentCell();
    if (!cell) return;
    const table = cell.closest('table');
    if (!table) return;
    const row = cell.parentNode;
    const section = row.parentNode;
    const allRows = [...table.querySelectorAll('tr')];
    const colCount = allRows[0]?.children.length ?? 0;
    const colIdx = [...row.children].indexOf(cell);
    const makeRow = (tag = 'td') => {
      const tr = document.createElement('tr');
      for (let i = 0; i < colCount; i++) tr.appendChild(makeCell(tag));
      return tr;
    };
    switch (action) {
      case 'rowAbove':
        section.insertBefore(makeRow(row.children[0]?.tagName === 'TH' ? 'th' : 'td'), row);
        break;
      case 'rowBelow': {
        const target = section.tagName === 'THEAD' ? (table.querySelector('tbody') || section) : section;
        const ref = section === target ? row.nextSibling : target.firstChild;
        target.insertBefore(makeRow('td'), ref);
        break;
      }
      case 'colLeft':
        for (const r of allRows) {
          const tag = r.children[0]?.tagName === 'TH' ? 'th' : 'td';
          r.insertBefore(makeCell(tag), r.children[colIdx]);
        }
        break;
      case 'colRight':
        for (const r of allRows) {
          const tag = r.children[0]?.tagName === 'TH' ? 'th' : 'td';
          r.insertBefore(makeCell(tag), r.children[colIdx + 1] ?? null);
        }
        break;
      case 'delRow':
        row.remove();
        if (!section.children.length) section.remove();
        if (!table.querySelector('tr')) table.remove();
        break;
      case 'delCol':
        for (const r of allRows) r.children[colIdx]?.remove();
        if (!table.querySelector('td, th')) table.remove();
        break;
      case 'delTable':
        table.remove();
        break;
    }
    onCommit();
    refresh();
  }

  const btn = (label, title, action) => {
    const b = document.createElement('button');
    b.className = 'avs-inline-btn';
    b.type = 'button';
    b.title = title;
    // Icon-only, so the title is not enough on its own: a screen reader needs a
    // name, and title is only consulted by sighted hover.
    b.setAttribute('aria-label', title);
    b.innerHTML = label;
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', () => act(action));
    return b;
  };
  const sep = () => { const s = document.createElement('span'); s.className = 'avs-inline-sep'; return s; };

  el.append(
    btn(uiIconSvg('table-row-above'), t('rt.table.rowAbove'), 'rowAbove'),
    btn(uiIconSvg('table-row-below'), t('rt.table.rowBelow'), 'rowBelow'),
    btn(uiIconSvg('table-col-left'),  t('rt.table.colLeft'),  'colLeft'),
    btn(uiIconSvg('table-col-right'), t('rt.table.colRight'), 'colRight'),
    sep(),
    btn(uiIconSvg('table-row-delete'), t('rt.table.delRow'), 'delRow'),
    btn(uiIconSvg('table-col-delete'), t('rt.table.delCol'), 'delCol'),
    btn(uiIconSvg('trash'), t('rt.table.delTable'), 'delTable'),
  );

  function refresh() {
    const cell = currentCell();
    if (!cell) { el.hidden = true; return; }
    el.hidden = false;
    const hr = hostEl.getBoundingClientRect();
    const r = cell.closest('table').getBoundingClientRect();
    el.style.top  = (r.top - hr.top - 36) + 'px';
    el.style.left = Math.max(8, Math.min(hr.width - 280, r.left - hr.left)) + 'px';
  }

  return {
    refresh,
    contains: n => el.contains(n),
    dispose() { el.remove(); },
  };
}
