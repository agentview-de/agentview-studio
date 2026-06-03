// Left column — vertical, drag-sortable list of slides with lightweight
// thumbnails (widget rects as blocks, no live plugin render so a long rail
// stays cheap).

import { state, commit, subscribe } from '../store.js';
import { createSlide } from '../../shared/slide-schema.js';
import { get as getPlugin } from '../../shared/plugins/registry.js';
import { describeSchedule } from '../../shared/scheduler-core.js';
import { makeReorderable } from '../ui/drag-drop.js';
import { openContextMenu } from '../ui/context-menu.js';
import { t, tx } from '../i18n.js';
import { widgetIcon } from '../../shared/data/widget-icons.js';
import { escapeHtml } from '../../shared/utils/escape.js';

export function mountSlideRail(host) {
  host.classList.add('avs-rail');
  host.innerHTML = `
    <div class="avs-rail-head">
      <span class="avs-rail-title">${t('rail.slides')}</span>
      <button class="avs-chip avs-chip-accent" id="avs-add-slide">+ ${t('rail.add')}</button>
    </div>
    <div class="avs-rail-list" id="avs-rail-list"></div>`;

  const list = host.querySelector('#avs-rail-list');
  host.querySelector('#avs-add-slide').addEventListener('click', addSlide);

  makeReorderable(list, {
    dragSelector: '.avs-slide-card',
    onMove: ids => {
      const map = new Map(state.playlist.slides.map(s => [s.id, s]));
      state.playlist.slides = ids.map(id => map.get(id)).filter(Boolean);
      commit('reorder-slides');
    },
  });

  subscribe('playlist', refresh);
  subscribe('ui', p => { if (p === 'ui.activeSlideId') refresh(); });
  refresh();

  function refresh() {
    const slides = state.playlist?.slides ?? [];
    list.replaceChildren();
    slides.forEach((s, i) => list.appendChild(card(s, i)));
  }
}

function card(slide, index) {
  const el = document.createElement('div');
  el.className = 'avs-slide-card';
  el.draggable = true;
  el.title = t('field.dragReorder');
  el.dataset.id = slide.id;
  if (slide.id === state.ui.activeSlideId) el.classList.add('avs-on');

  const sched = describeSchedule(slide);
  el.innerHTML = `
    <div class="avs-slide-index">${index + 1}</div>
    <div class="avs-rail-thumb bb-theme-${slide.theme ?? state.playlist?.defaults?.theme ?? 'minimal-dark'}">
      ${(slide.widgets ?? []).map(w => {
        const p = getPlugin(w.type);
        const r = w.rect ?? { x: 0, y: 0, w: 100, h: 100 };
        return `<span class="avs-thumb-block" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;${w.rotation ? `transform:rotate(${w.rotation}deg);` : ''}">${widgetIcon(w.type, p?.icon ?? '◻', 14)}</span>`;
      }).join('')}
    </div>
    <div class="avs-slide-meta">
      <span class="avs-slide-name">${escapeHtml(slide.name || t('rail.untitled'))}</span>
      ${sched ? `<span class="avs-slide-sched" title="${escapeHtml(sched)}">⏰</span>` : ''}
      ${slide.langs && Object.keys(slide.langs).length ? `<span class="avs-slide-badge" title="${escapeHtml(Object.keys(slide.langs).join(', '))}">🌐</span>` : ''}
      ${Array.isArray(slide.abVariants) && slide.abVariants.length ? `<span class="avs-slide-badge" title="${slide.abVariants.length} ${tx('A/B variants')}">🎲</span>` : ''}
      ${slide.brandKit ? `<span class="avs-slide-badge" title="${tx('Brand Kit override')}">🎨</span>` : ''}
      ${anyBindings(slide) ? `<span class="avs-slide-badge" title="${tx('Slot bindings')}">🔗</span>` : ''}
    </div>
    <div class="avs-slide-actions">
      <button class="avs-iconbtn" data-act="dup" title="${t('rail.duplicate')}">⧉</button>
      <button class="avs-iconbtn" data-act="del" title="${t('rail.delete')}">🗑</button>
    </div>`;

  el.addEventListener('click', e => {
    if (e.target.closest('[data-act]')) return;
    state.ui.activeSlideId = slide.id;
    state.ui.selectedWidgetId = null;
  });
  el.querySelector('[data-act="dup"]').addEventListener('click', () => duplicate(slide.id));
  el.querySelector('[data-act="del"]').addEventListener('click', () => remove(slide.id));
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, slideMenuItems(slide.id));
  });
  return el;
}

// True iff any widget in any variant of this slide (default, langs, abVariants)
// has a non-empty bindings map. Renders the 🔗 rail badge.
function anyBindings(slide) {
  const hasIn = arr => Array.isArray(arr) && arr.some(w => w?.bindings && Object.keys(w.bindings).length);
  if (hasIn(slide.widgets)) return true;
  if (slide.langs) for (const v of Object.values(slide.langs)) if (hasIn(v?.widgets)) return true;
  if (Array.isArray(slide.abVariants)) for (const v of slide.abVariants) if (hasIn(v?.widgets)) return true;
  return false;
}

function slideMenuItems(id) {
  const arr = state.playlist?.slides ?? [];
  const ix = arr.findIndex(s => s.id === id);
  return [
    { label: t('ctx.newAfter'), icon: '➕', run: () => insertAfter(id) },
    { label: t('ctx.duplicate'), icon: '⧉', run: () => duplicate(id) },
    { label: t('ctx.delete'), icon: '🗑', run: () => remove(id) },
    { separator: true },
    { label: t('ctx.moveUp'), icon: '⬆️', disabled: ix <= 0, run: () => move(id, -1) },
    { label: t('ctx.moveDown'), icon: '⬇️', disabled: ix < 0 || ix >= arr.length - 1, run: () => move(id, 1) },
    { separator: true },
    { label: t('ctx.rename'), icon: '✏️', run: () => rename(id) },
  ];
}

function insertAfter(id) {
  const ix = state.playlist.slides.findIndex(s => s.id === id);
  if (ix === -1) return;
  const s = createSlide({ duration: state.playlist?.defaults?.duration ?? 10 });
  state.playlist.slides.splice(ix + 1, 0, s);
  state.ui.activeSlideId = s.id;
  state.ui.selectedWidgetId = null;
  commit('add-slide');
}

function move(id, delta) {
  const arr = state.playlist.slides;
  const ix = arr.findIndex(s => s.id === id);
  const j = ix + delta;
  if (ix === -1 || j < 0 || j >= arr.length) return;
  const [s] = arr.splice(ix, 1);
  arr.splice(j, 0, s);
  commit('reorder-slides');
}

function rename(id) {
  state.ui.activeSlideId = id;
  state.ui.selectedWidgetId = null;
  setTimeout(() => { const inp = document.getElementById('ss-name'); inp?.focus(); inp?.select?.(); }, 60);
}

function addSlide() {
  const dur = state.playlist?.defaults?.duration ?? 10;
  const s = createSlide({ duration: dur });
  state.playlist.slides.push(s);
  state.ui.activeSlideId = s.id;
  state.ui.selectedWidgetId = null;
  commit('add-slide');
}

function duplicate(id) {
  const ix = state.playlist.slides.findIndex(s => s.id === id);
  if (ix === -1) return;
  // JSON-clone, not structuredClone — slide data is a reactive Proxy.
  const copy = JSON.parse(JSON.stringify(state.playlist.slides[ix]));
  copy.id = createSlide().id;
  copy.widgets = (copy.widgets ?? []).map(w => ({ ...w, id: 'w_' + Math.random().toString(36).slice(2, 10) }));
  state.playlist.slides.splice(ix + 1, 0, copy);
  state.ui.activeSlideId = copy.id;
  commit('duplicate-slide');
}

function remove(id) {
  state.playlist.slides = state.playlist.slides.filter(s => s.id !== id);
  if (state.ui.activeSlideId === id) {
    state.ui.activeSlideId = state.playlist.slides[0]?.id ?? null;
    state.ui.selectedWidgetId = null;
  }
  commit('delete-slide');
}

