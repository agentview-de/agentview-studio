// The right column when SEVERAL widgets are selected.
//
// The inspector shows one widget's settings; the library shows what you can add.
// Neither is the answer to "I have five things selected" — the answer is the
// arrange tools, and burying them in a right-click menu means the feature only
// exists for people who already know it exists. This panel is the third state of
// the right column, and it appears exactly when it has something to do.
//
// It is buttons over a shared implementation, not a second implementation: every
// action calls the same exported canvas function the context menu and the
// keyboard call, so the three routes cannot drift.

import { state } from '../store.js';
import {
  alignSelection, distributeSelection, matchSelectionSize,
  bringToFront, sendToBack, deleteSelected, duplicateSelected, selectionCount,
  groupSelection, ungroupSelection, selectionGroupState,
} from '../canvas/canvas.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { escapeHtml } from '../../shared/utils/escape.js';
import { t } from '../i18n.js';

// [icon, i18n key, handler factory, minimum selection size]
const ALIGN = [
  ['arr-left',    'arrange.alignLeft',    () => alignSelection('left')],
  ['arr-hcenter', 'arrange.alignHCenter', () => alignSelection('hcenter')],
  ['arr-right',   'arrange.alignRight',   () => alignSelection('right')],
  ['arr-top',     'arrange.alignTop',     () => alignSelection('top')],
  ['arr-vmiddle', 'arrange.alignVMiddle', () => alignSelection('vmiddle')],
  ['arr-bottom',  'arrange.alignBottom',  () => alignSelection('bottom')],
];
const DISTRIBUTE = [
  ['arr-dist-h', 'arrange.distributeH', () => distributeSelection('h'), 3],
  ['arr-dist-v', 'arrange.distributeV', () => distributeSelection('v'), 3],
];
const MATCH = [
  ['arr-match-w', 'arrange.matchWidth',  () => matchSelectionSize('w')],
  ['arr-match-h', 'arrange.matchHeight', () => matchSelectionSize('h')],
];

function buttonRow(host, specs, count) {
  const row = document.createElement('div');
  row.className = 'avs-arrange-row';
  for (const [icon, key, run, min = 2] of specs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avs-arrange-btn';
    btn.innerHTML = uiIconSvg(icon, 18);
    btn.title = t(key);
    btn.setAttribute('aria-label', t(key));
    // Distribute needs three objects to have a gap to equalise. Disabled with
    // the reason in the tooltip beats hidden: the button reappearing when you
    // add a third widget is otherwise unexplained.
    if (count < min) {
      btn.disabled = true;
      btn.title = `${t(key)} — ${t('arrange.needsThree')}`;
    }
    btn.addEventListener('click', run);
    row.appendChild(btn);
  }
  host.appendChild(row);
}

function section(host, labelKey) {
  const h = document.createElement('div');
  h.className = 'avs-arrange-label';
  h.textContent = t(labelKey);
  host.appendChild(h);
}

export function renderArrangePanel(host) {
  host.classList.add('avs-inspector', 'avs-arrange-panel');
  const count = selectionCount();

  const head = document.createElement('div');
  head.className = 'avs-arrange-head';
  head.innerHTML = `<strong>${escapeHtml(t('arrange.title', { n: count }))}</strong>`
    + `<span>${escapeHtml(t('arrange.hint'))}</span>`;
  host.appendChild(head);

  // Group first: it is the action that changes what the OTHER buttons will act
  // on next time, so it belongs above them rather than buried under "Order".
  section(host, 'arrange.grouping');
  const grouped = selectionGroupState() === 'grouped';
  const grow = document.createElement('div');
  grow.className = 'avs-arrange-row avs-arrange-wide';
  for (const [icon, key, run, on] of [
    ['arr-group', 'arrange.group', groupSelection, !grouped],
    ['arr-ungroup', 'arrange.ungroup', ungroupSelection, grouped],
  ]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avs-arrange-btn avs-arrange-btn-wide';
    btn.innerHTML = `${uiIconSvg(icon, 16)}<span>${escapeHtml(t(key))}</span>`;
    btn.disabled = !on;
    btn.addEventListener('click', run);
    grow.appendChild(btn);
  }
  host.appendChild(grow);
  if (grouped) {
    const note = document.createElement('div');
    note.className = 'avs-arrange-note';
    note.textContent = t('arrange.groupedNote');
    host.appendChild(note);
  }

  section(host, 'arrange.align');
  buttonRow(host, ALIGN, count);

  section(host, 'arrange.distribute');
  buttonRow(host, DISTRIBUTE, count);

  section(host, 'arrange.matchSize');
  buttonRow(host, MATCH, count);

  section(host, 'arrange.order');
  const order = document.createElement('div');
  order.className = 'avs-arrange-row avs-arrange-wide';
  for (const [icon, key, run] of [
    ['arrow-up', 'ctx.toFront', bringToFront],
    ['arrow-down', 'ctx.toBack', sendToBack],
    ['copy', 'ctx.duplicate', duplicateSelected],
    ['trash', 'ctx.delete', deleteSelected],
  ]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avs-arrange-btn avs-arrange-btn-wide';
    btn.innerHTML = `${uiIconSvg(icon, 16)}<span>${escapeHtml(t(key))}</span>`;
    btn.addEventListener('click', run);
    order.appendChild(btn);
  }
  host.appendChild(order);

  const foot = document.createElement('button');
  foot.type = 'button';
  foot.className = 'avs-arrange-clear';
  foot.textContent = t('arrange.clear');
  // Writing the primary is enough — the canvas's normaliser empties the set.
  foot.addEventListener('click', () => { state.ui.selectedWidgetId = null; });
  host.appendChild(foot);
}
