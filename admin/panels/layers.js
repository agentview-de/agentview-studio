// Layers — every widget on the active slide, top of the stack first.
//
// The canvas is a pile of overlapping boxes. Once a slide has a photo behind a
// tint behind a headline, the thing at the back cannot be clicked at all: the
// only way to reach it was to move everything in front of it out of the way and
// then move it all back. This is the list that makes it reachable — and the
// place where the three properties that have no home on the canvas live:
//
//   name        a widget's own label, so "Text" and "Text" and "Text" stop
//               being three identical rows
//   visibility  hide it without deleting it — honoured by the PLAYER too
//               (shared/slide-schema.js visibleWidgets), so what you hide here
//               does not appear on the wall
//   lock        stop picking it up by accident, which is what happens to a
//               full-bleed background image every single time you click the
//               slide
//
// Stacking order is edited by dragging a row. The list reads top-of-stack first
// (highest z at the top), which is how every layers list works and the opposite
// of the widget array's own order — see rowsForSlide.

import { commit, subscribe } from '../store.js';
import { get as getPlugin } from '../../shared/plugins/registry.js';
import { makeReorderable } from '../ui/drag-drop.js';
import { zOrderFromTopFirst } from '../canvas/arrange.js';
import { renderSlide as canvasRender, selectedIds, setSelectionFromLayers } from '../canvas/canvas.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { widgetIcon } from '../../shared/data/widget-icons.js';
import { escapeHtml } from '../../shared/utils/escape.js';
import { widgetName } from '../widget-name.js';
import { activeSlide } from '../active-slide.js';
import { t } from '../i18n.js';

const LS_OPEN = 'bb_layers_open';


// Top of the stack FIRST. A layers list that ran bottom-first would put the
// slide background at the top and the headline at the bottom, which is upside
// down from what the canvas shows.
function rowsForSlide(slide) {
  return [...(slide?.widgets ?? [])].sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
}

export function mountLayers(host) {
  host.classList.add('avs-layers');
  let open = true;
  try { open = localStorage.getItem(LS_OPEN) !== '0'; } catch { /* private mode */ }

  host.innerHTML = `
    <button class="avs-layers-head" type="button" aria-expanded="${open}" aria-controls="avs-layers-list">
      <span class="avs-layers-caret">${open ? '▾' : '▸'}</span>
      <span class="avs-rail-title">${t('layers.title')}</span>
      <span class="avs-layers-count"></span>
    </button>
    <div class="avs-layers-list" id="avs-layers-list"></div>`;

  const headBtn = host.querySelector('.avs-layers-head');
  const caret = host.querySelector('.avs-layers-caret');
  const countEl = host.querySelector('.avs-layers-count');
  const list = host.querySelector('#avs-layers-list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-multiselectable', 'true');
  list.setAttribute('aria-label', t('layers.title'));

  const reflectOpen = () => {
    host.classList.toggle('avs-layers-closed', !open);
    caret.textContent = open ? '▾' : '▸';
    headBtn.setAttribute('aria-expanded', String(open));
  };
  headBtn.addEventListener('click', () => {
    open = !open;
    try { localStorage.setItem(LS_OPEN, open ? '1' : '0'); } catch { /* private mode */ }
    reflectOpen();
  });
  reflectOpen();

  // Dragging a row rewrites z. The list is top-first, so the row order has to be
  // reversed before it becomes z — see rowsForSlide.
  makeReorderable(list, {
    dragSelector: '.avs-layer',
    onMove: () => {
      const slide = activeSlide();
      if (!slide) return;
      const order = [...list.querySelectorAll('.avs-layer')].map(el => el.dataset.id);
      // The top-first → z mapping is pure and lives in arrange.js, where a
      // headless test can check the reversal that is so easy to get backwards.
      const zs = zOrderFromTopFirst(order);
      for (const w of slide.widgets) {
        if (zs.has(w.id)) w.z = zs.get(w.id);
      }
      commit('reorder-layers');
      canvasRender();
      render();
    },
  });

  // What the LIST is made of. Deliberately excludes rects: dragging a widget on
  // the canvas writes its rect on every pointermove, and a list that rebuilt
  // itself on each of those would be both a stutter and — worse — a list whose
  // rows are destroyed under the pointer that is interacting with them.
  const listSignature = (rows) => rows
    .map(w => `${w.id}:${w.z ?? 0}:${w.title ?? ''}:${w.hidden ? 1 : 0}${w.locked ? 1 : 0}:${w.group ?? ''}`)
    .join('|');
  let lastSignature = null;

  function render(force = false) {
    const slide = activeSlide();
    const rows = rowsForSlide(slide);
    const sig = slide?.id + '#' + listSignature(rows);
    if (!force && sig === lastSignature) { reflectSel(); return; }
    lastSignature = sig;
    countEl.textContent = rows.length ? String(rows.length) : '';
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'avs-layers-empty';
      empty.textContent = t('layers.empty');
      list.appendChild(empty);
      return;
    }
    for (const w of rows) list.appendChild(rowFor(w, () => render(true)));
    reflectSel();
  }

  // Selection is a CLASS change, never a rebuild. Rebuilding here was a real
  // bug, not an inefficiency: clicking a row selects the widget, which notified
  // the store, which rebuilt the list — so the row you had just clicked was a
  // detached node, and the double-click that was meant to rename it landed on
  // nothing at all.
  function reflectSel() {
    const sel = new Set(selectedIds());
    for (const row of list.querySelectorAll('.avs-layer')) {
      const on = sel.has(row.dataset.id);
      row.classList.toggle('avs-on', on);
      row.setAttribute('aria-selected', String(on));
    }
  }

  subscribe('playlist', () => render());
  subscribe('ui', p => {
    // Entering master mode swaps the whole widget list, exactly like switching
    // slides does — so it forces a rebuild rather than a class repaint.
    if (p === 'ui.activeSlideId' || p === 'ui.editingMaster') render(true);
    else if (p === 'ui.selectedWidgetId' || p === 'ui.selectedWidgetIds') reflectSel();
  });
  render();
  return { render };
}

function rowFor(w, rerender) {
  const row = document.createElement('div');
  row.className = 'avs-layer' + (w.hidden ? ' avs-layer-hidden' : '');
  row.dataset.id = w.id;
  row.draggable = true;
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', 'false');   // reflectSel() owns this
  row.tabIndex = 0;

  const plugin = getPlugin(w.type);
  row.innerHTML = `
    <span class="avs-layer-ic">${widgetIcon(w.type, escapeHtml(plugin?.icon ?? '◻'), 14)}</span>
    <span class="avs-layer-name" title="${escapeHtml(widgetName(w))}">${escapeHtml(widgetName(w))}</span>
    <span class="avs-layer-tools">
      <button class="avs-layer-btn" data-act="lock" type="button"></button>
      <button class="avs-layer-btn" data-act="hide" type="button"></button>
    </span>`;

  // Grouped widgets get a tick of colour so a group reads as a run of rows
  // rather than as neighbours that happen to be adjacent.
  if (w.group) row.classList.add('avs-layer-grouped');

  const lockBtn = row.querySelector('[data-act="lock"]');
  const hideBtn = row.querySelector('[data-act="hide"]');
  lockBtn.innerHTML = uiIconSvg(w.locked ? 'lock' : 'unlock', 13);
  lockBtn.title = t(w.locked ? 'layers.unlock' : 'layers.lock');
  lockBtn.setAttribute('aria-label', lockBtn.title);
  lockBtn.setAttribute('aria-pressed', String(!!w.locked));
  hideBtn.innerHTML = uiIconSvg(w.hidden ? 'eye-off' : 'eye', 13);
  hideBtn.title = t(w.hidden ? 'layers.show' : 'layers.hide');
  hideBtn.setAttribute('aria-label', hideBtn.title);
  hideBtn.setAttribute('aria-pressed', String(!!w.hidden));
  // A locked or hidden row keeps its buttons visible without a hover — they are
  // the only way back, and a control you have to guess is hovering over is not a
  // way back.
  if (w.locked || w.hidden) row.classList.add('avs-layer-marked');

  lockBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (w.locked) delete w.locked; else w.locked = true;
    commit('lock-widget');
    canvasRender();
    rerender();
  });
  hideBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (w.hidden) delete w.hidden; else w.hidden = true;
    commit('hide-widget');
    canvasRender();
    rerender();
  });

  row.addEventListener('click', e => {
    // Same modifier rules as the canvas, so the two selection surfaces behave
    // identically — a shift-click means the same thing wherever you do it.
    setSelectionFromLayers(w.id, { additive: !!(e.shiftKey || e.metaKey || e.ctrlKey) });
  });
  row.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
  });

  // Double-click the name to rename. An inline input rather than a prompt():
  // renaming five layers through five modal dialogs is a worse experience than
  // not naming them at all, which is what people do instead.
  const nameEl = row.querySelector('.avs-layer-name');
  nameEl.addEventListener('dblclick', e => {
    e.stopPropagation();
    // Without this the browser also runs its default double-click action —
    // selecting the word under the pointer, and with it a swathe of the page.
    e.preventDefault();
    const input = document.createElement('input');
    input.className = 'avs-layer-rename';
    input.value = typeof w.title === 'string' ? w.title : '';
    input.placeholder = widgetName(w);
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    const finish = (save) => {
      if (save) {
        const v = input.value.trim();
        // An empty name is not a name: clearing it restores the plugin label
        // rather than leaving a blank row.
        if (v) w.title = v; else delete w.title;
        commit('rename-widget');
      }
      rerender();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
  });

  return row;
}
