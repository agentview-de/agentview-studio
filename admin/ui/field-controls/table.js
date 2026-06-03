// Generic row/column table editor — column editor + paste-from-spreadsheet
// + expand-to-modal for wide tables.
//
// Two inline layouts depending on column count:
//   ≤ STACK_THRESHOLD cols → CSS-grid table (spreadsheet feel, compact rows)
//   >  STACK_THRESHOLD cols → per-row cards with label-above-input fields,
//      because cramming 6+ columns into a ~280px inspector makes every input
//      one character wide. The user can still hit the ⛶ expand button to get
//      a wide modal with the spreadsheet layout for paste workflows.
//
// f.columns: [{ key, label, type?: 'text'|'number'|'date'|'toggle'|'select', placeholder?, options? }]

import { t, tx } from '../../i18n.js';
import { openModal } from '../modal.js';
import { h, esc } from './_shared.js';

const STACK_THRESHOLD = 4;

function parseTabular(text, cols) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const delim = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',');
  let cells = lines.map(l => l.split(delim).map(c => c.trim()));
  const numCols = cols.map((c, i) => (c.type === 'number' ? i : -1)).filter(i => i >= 0);
  const isHeader = numCols.length > 0 && numCols.every(i => cells[0][i] != null && cells[0][i] !== '' && isNaN(+String(cells[0][i]).replace(',', '.')));
  if (isHeader) cells = cells.slice(1);
  return cells.map(cs => {
    const row = {};
    cols.forEach((col, i) => {
      const raw = cs[i] ?? '';
      if (col.type === 'number') row[col.key] = raw === '' ? null : +String(raw).replace(',', '.');
      else if (col.type === 'toggle') row[col.key] = /^(1|true|y|yes|x|✓|✔)$/i.test(String(raw).trim()) ? 1 : '';
      else row[col.key] = raw;
    });
    return row;
  });
}

// Create the right <input>/<select>/<checkbox> for a single column. Returned
// element is parent-agnostic — grid mode wraps it in .bb-table-cell, card mode
// pairs it with a label above. Centralising this keeps both layouts in sync
// when we tweak input behaviour.
//
// `opts.assetPicker(accept)` is forwarded by the inspector so 'asset' columns
// can open the same picker modal as standalone asset fields.
function makeCellInput(col, row, commit, opts = {}) {
  if (col.type === 'date') {
    const dc = h('div', 'bb-date-cell');
    const inp = h('input');
    inp.type = 'text';
    if (col.placeholder) inp.placeholder = col.placeholder;
    inp.value = row[col.key] ?? '';
    inp.addEventListener('input', () => { row[col.key] = inp.value; commit(); });
    const dtp = h('input');
    dtp.type = 'datetime-local';
    dtp.className = 'bb-date-hidden';
    dtp.addEventListener('change', () => {
      if (!dtp.value) return;
      const d = new Date(dtp.value);
      const txt = d.toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      inp.value = txt; row[col.key] = txt; commit();
    });
    const btn = h('button', 'bb-btn bb-btn-ghost bb-date-btn', '📅');
    btn.type = 'button';
    btn.title = t('field.pickDate');
    btn.setAttribute('aria-label', t('field.pickDate'));
    btn.addEventListener('click', () => { try { dtp.showPicker(); } catch { dtp.focus(); } });
    dc.append(inp, dtp, btn);
    return dc;
  }
  if (col.type === 'toggle') {
    // Boolean column — store as 1/'' (truthy-empty) so the JSON stays small
    // and the rest of the codebase can keep `!!val` semantics.
    const inp = h('input');
    inp.type = 'checkbox';
    inp.className = 'bb-table-toggle';
    inp.checked = !!row[col.key];
    inp.addEventListener('change', () => { row[col.key] = inp.checked ? 1 : ''; commit(); });
    return inp;
  }
  if (col.type === 'asset') {
    // Per-cell asset picker — text input for free-form URL pasting, plus a
    // 📁 button that opens the same modal picker used by standalone asset
    // fields. The MIME filter comes from `col.accept` (e.g. 'image/*').
    const cell = h('div', 'bb-asset-cell');
    const inp = h('input');
    inp.type = 'text';
    if (col.placeholder) inp.placeholder = col.placeholder;
    inp.value = row[col.key] ?? '';
    inp.addEventListener('input', () => { row[col.key] = inp.value; commit(); });
    const btn = h('button', 'bb-btn bb-btn-ghost bb-asset-cell-btn', '📁');
    btn.type = 'button';
    btn.title = t('field.pickAsset');
    btn.setAttribute('aria-label', t('field.pickAsset'));
    btn.addEventListener('click', async () => {
      const url = await opts.assetPicker?.(col.accept);
      if (url) { inp.value = url; row[col.key] = url; commit(); }
    });
    cell.append(inp, btn);
    return cell;
  }
  if (col.type === 'select' && Array.isArray(col.options)) {
    const sel = h('select');
    sel.className = 'bb-table-select';
    col.options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = typeof o === 'string' ? o : o.value;
      opt.textContent = typeof o === 'string' ? o : (o.label ?? o.value);
      sel.appendChild(opt);
    });
    sel.value = row[col.key] ?? (typeof col.options[0] === 'string' ? col.options[0] : col.options[0].value);
    sel.addEventListener('change', () => { row[col.key] = sel.value; commit(); });
    return sel;
  }
  const inp = h('input');
  inp.type = col.type === 'number' ? 'number' : 'text';
  if (col.placeholder) inp.placeholder = col.placeholder;
  inp.value = row[col.key] ?? '';
  inp.addEventListener('input', () => {
    row[col.key] = col.type === 'number' ? (inp.value === '' ? null : +inp.value) : inp.value;
    commit();
  });
  return inp;
}

// Best-effort one-line summary of a row used as the card header. Picks the
// first non-empty text-ish column value; falls back to "Row N". Helps users
// scan a long list without expanding every card.
function rowTitle(row, cols, idx) {
  for (const c of cols) {
    if (c.type === 'toggle' || c.type === 'number' || c.type === 'date') continue;
    const v = String(row[c.key] ?? '').trim();
    if (v) return v.length > 40 ? v.slice(0, 40) + '…' : v;
  }
  // Fall through: any non-empty cell at all (numbers, dates)
  for (const c of cols) {
    const v = String(row[c.key] ?? '').trim();
    if (v) return v.length > 40 ? v.slice(0, 40) + '…' : v;
  }
  return t('field.row', { n: idx + 1 });
}

export function renderTable(f, v, set, opts = {}) {
  const cols = f.columns ?? [{ key: 'value', label: tx('Value'), type: 'text' }];
  const rows = Array.isArray(v) ? v.map(r => ({ ...r })) : [];
  const wrap = h('div', 'bb-table-field');
  const grid = h('div');
  const commit = () => set(rows.map(r => ({ ...r })));
  const stacked = cols.length > STACK_THRESHOLD;

  // Drag-to-reorder — shared by both layouts. Per-row drag targets carry the
  // `data-row` attribute; the container resolves which row was dropped on.
  let dragFrom = null;
  grid.addEventListener('dragover', e => { if (dragFrom != null) e.preventDefault(); });
  grid.addEventListener('drop', e => {
    const el = e.target.closest('[data-row]');
    if (!el || dragFrom == null) return;
    const to = +el.dataset.row;
    if (to === dragFrom) { dragFrom = null; return; }
    const [moved] = rows.splice(dragFrom, 1);
    rows.splice(to, 0, moved);
    dragFrom = null; draw(); commit();
  });

  const makeHandle = (idx) => {
    const handle = h('div', 'bb-table-handle', '⠿');
    handle.draggable = true;
    handle.dataset.row = idx;
    handle.title = t('field.dragReorder');
    handle.setAttribute('aria-label', t('field.dragReorder'));
    handle.setAttribute('role', 'button');
    handle.addEventListener('dragstart', e => { dragFrom = idx; e.dataTransfer.effectAllowed = 'move'; });
    return handle;
  };
  const makeRemoveBtn = (idx) => {
    const rm = h('button', 'bb-btn bb-btn-ghost', '✕');
    rm.type = 'button';
    rm.dataset.row = idx;
    rm.setAttribute('aria-label', t('common.delete') + ' ' + tx('row') + ' ' + (idx + 1));
    rm.addEventListener('click', () => { rows.splice(idx, 1); draw(); commit(); });
    return rm;
  };

  const drawGrid = () => {
    grid.className = 'bb-table';
    grid.style.gridTemplateColumns = `auto ${cols.map(() => 'minmax(0,1fr)').join(' ')} auto`;
    grid.innerHTML = '';
    // Header row
    grid.append(h('div', 'bb-table-head', ''));
    cols.forEach(col => grid.append(h('div', 'bb-table-head', esc(col.label ?? col.key))));
    grid.append(h('div', 'bb-table-head', ''));
    // Data rows
    rows.forEach((row, idx) => {
      grid.append(makeHandle(idx));
      cols.forEach(col => {
        const cell = h('div', 'bb-table-cell');
        cell.dataset.row = idx;
        cell.append(makeCellInput(col, row, commit, opts));
        grid.append(cell);
      });
      grid.append(makeRemoveBtn(idx));
    });
    if (!rows.length) {
      const empty = h('div', 'bb-table-empty', t('field.tableEmpty'));
      empty.style.gridColumn = `1 / ${cols.length + 3}`;
      grid.append(empty);
    }
  };

  const drawCards = () => {
    grid.className = 'bb-table-cards';
    grid.style.gridTemplateColumns = '';
    grid.innerHTML = '';
    rows.forEach((row, idx) => {
      const card = h('div', 'bb-table-card');
      card.dataset.row = idx;
      const head = h('div', 'bb-table-card-head');
      const title = h('span', 'bb-table-card-title');
      title.textContent = rowTitle(row, cols, idx);
      const num = h('span', 'bb-table-card-num');
      num.textContent = `${idx + 1}`;
      head.append(makeHandle(idx), num, title, makeRemoveBtn(idx));
      const body = h('div', 'bb-table-card-body');
      cols.forEach(col => {
        const field = h('div', 'bb-table-card-field' + (col.type === 'toggle' ? ' bb-table-card-field-toggle' : ''));
        const label = h('label', 'bb-table-card-label');
        label.textContent = col.label ?? col.key;
        field.append(label, makeCellInput(col, row, commit, opts));
        body.append(field);
      });
      card.append(head, body);
      grid.append(card);
    });
    if (!rows.length) {
      grid.append(h('div', 'bb-table-empty', t('field.tableEmpty')));
    }
  };

  const draw = () => stacked ? drawCards() : drawGrid();

  // Toolbar — Add row · Paste · Expand-to-modal. Layout-agnostic.
  const toolbar = h('div', 'bb-table-toolbar');
  const addBtn = h('button', 'bb-btn bb-btn-secondary bb-btn-sm', '+ ' + t('field.addRow'));
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    rows.push(Object.fromEntries(cols.map(c => [c.key, c.type === 'number' ? null : ''])));
    draw(); commit();
  });
  const pasteBtn = h('button', 'bb-btn bb-btn-secondary bb-btn-sm', '📋 ' + t('field.pasteSheet'));
  pasteBtn.type = 'button';
  // Expand button — for tables with many columns the inspector inputs become
  // tiny even in card mode (long descriptions, image URLs). The modal renders
  // the same table in a wide layout where each column has real working width.
  const expandBtn = h('button', 'bb-btn bb-btn-secondary bb-btn-sm', '⛶');
  expandBtn.type = 'button';
  expandBtn.title = t('rt.expand');
  expandBtn.setAttribute('aria-label', t('rt.expand'));
  expandBtn.addEventListener('click', () => {
    const modalBody = h('div', 'bb-table-modal-body');
    let latest = rows.map(r => ({ ...r }));
    // Inside the modal the panel is plenty wide → force grid layout regardless
    // of column count by passing a clone of f with stack disabled. The fastest
    // way: build a new field-spec with the same columns but the modal-inst's
    // own threshold check (the modal panel is wide enough for any sane count).
    const inst = renderTable(f, latest, v => { latest = v; set(v); }, opts);
    modalBody.appendChild(inst.el);
    openModal({
      title: f.label || t('field.tableTitle'),
      body: modalBody,
      actions: [{ label: t('rt.done'), kind: 'primary', value: true }],
      onMount: card => { card.classList.add('bb-modal-tablemodal'); },
    }).then(() => {
      rows.splice(0, rows.length, ...latest.map(r => ({ ...r })));
      draw();
    });
  });
  toolbar.append(addBtn, pasteBtn, expandBtn);

  const pastePanel = h('div', 'bb-table-paste');
  pastePanel.hidden = true;
  const ta = h('textarea');
  ta.placeholder = t('field.pasteHint');
  ta.rows = 4;
  const parseBtn = h('button', 'bb-btn bb-btn-primary bb-btn-sm', t('field.pasteParse'));
  parseBtn.type = 'button';
  const cancelBtn = h('button', 'bb-btn bb-btn-ghost bb-btn-sm', t('common.cancel'));
  cancelBtn.type = 'button';
  const pasteActions = h('div', 'bb-table-paste-actions');
  pasteActions.append(parseBtn, cancelBtn);
  pastePanel.append(ta, pasteActions);
  pasteBtn.addEventListener('click', () => { pastePanel.hidden = !pastePanel.hidden; if (!pastePanel.hidden) ta.focus(); });
  cancelBtn.addEventListener('click', () => { pastePanel.hidden = true; ta.value = ''; });
  parseBtn.addEventListener('click', () => {
    const parsed = parseTabular(ta.value, cols);
    if (parsed.length) { rows.splice(0, rows.length, ...parsed); draw(); commit(); }
    pastePanel.hidden = true; ta.value = '';
  });

  wrap.append(grid, toolbar, pastePanel);
  draw();
  return { el: wrap };
}
