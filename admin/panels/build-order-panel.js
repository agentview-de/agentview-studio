// Animation order — the slide's entrance builds as one ordered list.
//
// The per-widget build controls have always been in the inspector, one widget at
// a time. What you could not do was SEE the sequence: on a slide with six builds
// that meant reading six delays out of six separate inspectors and doing the
// arithmetic yourself to work out what plays when. This is PowerPoint's
// animation pane, and it exists for the same reason.
//
// It changes nothing about the schema. Order IS `anim.delay`; dragging a row
// re-stamps the delays as a sequence (shared/build-order.js owns that maths).
// So a slide arranged here plays identically on every existing display.

import { commit } from '../store.js';
import { activeSlide } from '../active-slide.js';
import { makeReorderable } from '../ui/drag-drop.js';
import { openModal } from '../ui/modal.js';
import { widgetName } from '../widget-name.js';
import { widgetIcon } from '../../shared/data/widget-icons.js';
import { escapeHtml as esc } from '../../shared/utils/escape.js';
import { WIDGET_BUILDS } from '../../shared/animations.js';
import { buildOrder, restampDelays, sequenceEndMs, hasBuild, BUILD_STEP_MS } from '../../shared/build-order.js';
import { previewWidgetBuild } from '../canvas/canvas.js';
import { t } from '../i18n.js';

// Replay the whole sequence on the canvas, each build at its own delay — the
// only way to answer "does this read well" without publishing.
function playSequence(widgets, timers) {
  for (const w of widgets) {
    if (!hasBuild(w)) continue;
    const at = Math.max(0, Number(w.anim.delay) || 0);
    timers.push(setTimeout(() => previewWidgetBuild(w.id), at));
  }
}

export async function openBuildOrder() {
  const slide = activeSlide();
  if (!slide) return;

  const box = document.createElement('div');
  box.className = 'avs-bo';
  box.innerHTML = `
    <div class="avs-bo-head">
      <label class="avs-bo-step">
        <span>${esc(t('build.step'))}</span>
        <input type="number" id="bo-step" min="0" max="5000" step="50" value="${BUILD_STEP_MS}">
        <span class="avs-bo-unit">ms</span>
      </label>
      <button type="button" class="bb-btn" id="bo-restamp">${esc(t('build.restamp'))}</button>
      <button type="button" class="bb-btn" id="bo-play">${esc(t('build.play'))}</button>
    </div>
    <div class="avs-bo-list" id="bo-list"></div>
    <p class="bb-form-help" id="bo-total"></p>`;

  const list = box.querySelector('#bo-list');
  const total = box.querySelector('#bo-total');
  const stepInput = box.querySelector('#bo-step');
  const timers = [];

  const render = () => {
    const rows = buildOrder(slide.widgets);
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'avs-bo-empty';
      empty.textContent = t('build.empty');
      list.appendChild(empty);
    }
    // Only widgets WITH a build are numbered — the others are listed so you can
    // give them one from here, but they take no place in the sequence.
    let n = 0;
    for (const w of rows) {
      const on = hasBuild(w);
      if (on) n += 1;
      const row = document.createElement('div');
      row.className = 'avs-bo-row' + (on ? '' : ' avs-bo-off');
      row.dataset.id = w.id;
      row.draggable = true;
      row.innerHTML = `
        <span class="avs-bo-num">${on ? n : '·'}</span>
        <span class="avs-bo-ic">${widgetIcon(w.type, '◻', 14)}</span>
        <span class="avs-bo-name" title="${esc(widgetName(w))}">${esc(widgetName(w))}</span>
        <select class="avs-bo-build" aria-label="${esc(t('build.type'))}">
          ${WIDGET_BUILDS.map(b => `<option value="${b.id}"${(w.anim?.type ?? 'none') === b.id ? ' selected' : ''}>${esc(b.label)}</option>`).join('')}
        </select>
        <input class="avs-bo-delay" type="number" min="0" max="20000" step="50"
               aria-label="${esc(t('build.delay'))}"
               value="${on ? Math.max(0, Number(w.anim.delay) || 0) : ''}" ${on ? '' : 'disabled'}>`;

      row.querySelector('.avs-bo-build').addEventListener('change', e => {
        const type = e.target.value;
        if (type === 'none') delete w.anim;
        else w.anim = { ...(w.anim ?? {}), type, delay: Number(w.anim?.delay) || 0 };
        commit('build-type');
        render();
      });
      row.querySelector('.avs-bo-delay').addEventListener('input', e => {
        if (!hasBuild(w)) return;
        w.anim.delay = Math.max(0, Number(e.target.value) || 0);
        commit('build-delay');
        // The ROW is not re-rendered on a delay edit: it holds the focused input
        // and rebuilding it would take the caret away mid-number. Only the
        // summary is refreshed.
        refreshTotal();
      });
      list.appendChild(row);
    }
    refreshTotal();
  };

  const refreshTotal = () => {
    const end = sequenceEndMs(slide.widgets);
    const dur = (slide.duration ?? 10) * 1000;
    total.textContent = end
      ? t(end > dur ? 'build.totalOver' : 'build.total', { s: (end / 1000).toFixed(1), d: (dur / 1000).toFixed(0) })
      : t('build.none');
    total.classList.toggle('avs-bo-warn', end > dur);
  };

  // Dragging a row rewrites the delays as a sequence — the order IS the delays.
  makeReorderable(list, {
    dragSelector: '.avs-bo-row',
    onMove: () => {
      const ids = [...list.querySelectorAll('.avs-bo-row')].map(el => el.dataset.id);
      const byId = new Map(slide.widgets.map(x => [x.id, x]));
      const ordered = ids.map(id => byId.get(id)).filter(Boolean);
      const delays = restampDelays(ordered, stepInput.value);
      for (const w of slide.widgets) {
        if (delays.has(w.id)) w.anim.delay = delays.get(w.id);
      }
      commit('build-order');
      render();
    },
  });

  box.querySelector('#bo-restamp').addEventListener('click', () => {
    const delays = restampDelays(buildOrder(slide.widgets), stepInput.value);
    for (const w of slide.widgets) {
      if (delays.has(w.id)) w.anim.delay = delays.get(w.id);
    }
    commit('build-order');
    render();
  });
  box.querySelector('#bo-play').addEventListener('click', () => {
    for (const id of timers.splice(0)) clearTimeout(id);
    playSequence(buildOrder(slide.widgets), timers);
  });

  render();
  await openModal({
    title: t('build.title'),
    body: box,
    actions: [{ label: t('common.done'), value: 1, kind: 'primary' }],
  });
  // A modal that closes while three previews are still queued would fire them
  // at a canvas nobody is looking at.
  for (const id of timers.splice(0)) clearTimeout(id);
}
