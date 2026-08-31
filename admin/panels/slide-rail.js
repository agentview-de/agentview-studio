// Left column — vertical, drag-sortable list of slides with lightweight
// thumbnails (widget rects as blocks, no live plugin render so a long rail
// stays cheap).

import { state, commit, subscribe, withSavedShape } from '../store.js';
import { createSlide } from '../../shared/slide-schema.js';
import { get as getPlugin } from '../../shared/plugins/registry.js';
import { describeSchedule } from '../../shared/scheduler-core.js';
import { makeReorderable } from '../ui/drag-drop.js';
import { openContextMenu } from '../ui/context-menu.js';
import { setEditingMaster } from '../canvas/canvas.js';
import { isEditingMaster } from '../active-slide.js';
import { getLocale, t, tx } from '../i18n.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { widgetIcon } from '../../shared/data/widget-icons.js';
import { escapeHtml } from '../../shared/utils/escape.js';
import { walkAllWidgets, masterWidgetsFor, isWidgetVisible } from '../../shared/slide-schema.js';
import { announce } from '../ui/toast.js';

// Below this many slides a search box is clutter; above it, scrolling a flat
// list is the only way to find anything. The rail grows the affordance when it
// starts to need it.
const FILTER_MIN = 12;
let _filter = '';

/** What a slide can be found by: its name, its widgets, its schedule. */
function haystack(slide) {
  const parts = [slide.name ?? ''];
  for (const w of slide.widgets ?? []) parts.push(tx(getPlugin(w.type)?.label ?? w.type), w.type);
  const sched = describeSchedule(slide, getLocale());
  if (sched) parts.push(sched);
  return parts.join(' ').toLowerCase();
}
const slideMatches = slide => !_filter || haystack(slide).includes(_filter);

export function mountSlideRail(host) {
  host.classList.add('avs-rail');
  host.innerHTML = `
    <div class="avs-rail-head">
      <span class="avs-rail-title">${t('rail.slides')}</span>
      <button class="avs-chip avs-chip-accent" id="avs-add-slide">+ ${t('rail.add')}</button>
    </div>
    <div class="avs-rail-filterbar" id="avs-rail-filterbar" hidden>
      <input type="search" class="avs-rail-filter" id="avs-rail-filter"
             placeholder="${t('rail.filter')}" aria-label="${t('rail.filter')}">
      <span class="avs-rail-filter-count" id="avs-rail-count" role="status" aria-live="polite"></span>
    </div>
    <button class="avs-master-card" id="avs-master-card" type="button" aria-pressed="false">
      <span class="avs-master-ic">${uiIconSvg('layers', 14)}</span>
      <span class="avs-master-label">${t('master.title')}</span>
      <span class="avs-master-count" id="avs-master-count"></span>
    </button>
    <div class="avs-rail-list" id="avs-rail-list"></div>`;

  const list = host.querySelector('#avs-rail-list');
  // A listbox, not a pile of divs: one Tab stop for the whole rail, arrows to
  // move within it. Same pattern the drawer's tab strip already uses.
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', t('rail.slides'));
  host.querySelector('#avs-add-slide').addEventListener('click', addSlide);

  // The master lives ABOVE the slides in the rail because that is where it sits
  // in the document: everything below inherits from it. It is a toggle, not a
  // slide — clicking it swaps what the canvas is editing, and clicking it again
  // (or picking any slide) comes back.
  const masterCard = host.querySelector('#avs-master-card');
  const masterCount = host.querySelector('#avs-master-count');
  masterCard.addEventListener('click', () => setEditingMaster(!isEditingMaster()));
  const reflectMaster = () => {
    const on = isEditingMaster();
    masterCard.classList.toggle('avs-on', on);
    masterCard.setAttribute('aria-pressed', String(on));
    const n = state.playlist?.master?.widgets?.length ?? 0;
    masterCount.textContent = n ? String(n) : '';
    masterCard.title = n ? t('master.hint', { n }) : t('master.empty');
  };
  subscribe('ui', p => { if (p === 'ui.editingMaster') reflectMaster(); });
  subscribe('playlist', reflectMaster);
  reflectMaster();

  const filterBar = host.querySelector('#avs-rail-filterbar');
  const filterInput = host.querySelector('#avs-rail-filter');
  const filterCount = host.querySelector('#avs-rail-count');
  filterInput.addEventListener('input', () => {
    _filter = filterInput.value.trim().toLowerCase();
    applyFilter();
  });
  filterInput.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !filterInput.value) return;
    e.stopPropagation();          // Escape clears the field before it deselects
    filterInput.value = '';
    _filter = '';
    applyFilter();
  });

  makeReorderable(list, {
    dragSelector: '.avs-slide-card',
    onMove: ids => {
      const map = new Map(state.playlist.slides.map(s => [s.id, s]));
      state.playlist.slides = ids.map(id => map.get(id)).filter(Boolean);
      commit('reorder-slides');
    },
  });

  // The rail used to rebuild EVERY card on every notification, and the store
  // notifies for any nested change — so one keystroke in a text field, or
  // clicking another slide, rebuilt the whole list. Measured on a 200-slide
  // playlist: ~50 ms per keystroke and ~54 ms per selection, i.e. typing at 20
  // frames a second. The store hands each subscriber the PATH that changed, so
  // the rail can be exact about what it redraws.
  subscribe('playlist', onPlaylistChange);
  subscribe('ui', p => { if (p === 'ui.activeSlideId') setActive(); });
  refresh();

  function onPlaylistChange(path) {
    // 'playlist.slides.7.name' → only card 7. Anything shorter or broader
    // (the playlist itself, the slides array, a default that every thumbnail
    // reads) still means everything.
    const m = /^playlist\.slides\.(\d+)(?:\.|$)/.exec(path ?? '');
    if (m) refreshCard(Number(m[1]));
    else refresh();
  }

  function refresh() {
    const slides = state.playlist?.slides ?? [];
    // replaceChildren() destroys whatever had focus. Reordering a slide
    // re-renders the whole rail, so without this a keyboard user is thrown out
    // of the list on their first keystroke.
    const hadFocus = list.contains(document.activeElement);
    list.replaceChildren();
    slides.forEach((s, i) => list.appendChild(card(s, i)));
    if (hadFocus) list.querySelector('.avs-slide-card[tabindex="0"]')?.focus();
    // The box appears once a playlist is long enough to get lost in — and stays
    // while a term is active, so it cannot vanish under the cursor.
    filterBar.hidden = slides.length < FILTER_MIN && !_filter;
    applyFilter();
  }

  /**
   * Hide the cards that do not match. Reordering is switched OFF while a filter
   * is active: a drop between two visible cards has no defined meaning when
   * there are hidden ones in between, and neither does alt+arrow.
   */
  function applyFilter() {
    const slides = state.playlist?.slides ?? [];
    let shown = 0;
    list.childNodes.forEach((el, i) => {
      const ok = slideMatches(slides[i] ?? {});
      el.hidden = !ok;
      el.draggable = !_filter;
      if (ok) shown++;
    });
    if (!_filter) filterCount.textContent = '';
    else filterCount.textContent = shown
      ? t('rail.filterCount', { shown, total: slides.length })
      : t('rail.filterEmpty');
    filterCount.classList.toggle('avs-rail-filter-empty', !!_filter && !shown);
  }

  /** Redraw exactly one card, or fall back when the list shape moved under us. */
  function refreshCard(index) {
    const slides = state.playlist?.slides ?? [];
    const slide = slides[index];
    const old = list.children[index];
    // A push/splice notifies per index AND for `length`; the index write can
    // arrive while the DOM is still a card short. Rebuilding then is both
    // correct and rare.
    if (!slide || !old || list.children.length !== slides.length) return refresh();
    const hadFocus = old.contains(document.activeElement);
    const fresh = card(slide, index);
    fresh.hidden = !slideMatches(slide);
    fresh.draggable = !_filter;
    old.replaceWith(fresh);
    if (hadFocus) fresh.focus();
  }

  /**
   * Selection is three attributes on two cards — it was a full rebuild of the
   * list, which is also what threw a dragging or focused card away.
   */
  function setActive() {
    const id = state.ui.activeSlideId;
    // Only when the keyboard is already IN the rail: the arrows move the
    // selection, and the roving tabindex has to follow it or the next keypress
    // is computed from the card the user has visually left. (Before this was a
    // targeted update, the full rebuild moved focus as a side effect — the
    // arrows walked one step and then stuck.) Selection changes from
    // elsewhere — deleting a slide, loading a playlist — must not steal focus.
    const moveFocus = list.contains(document.activeElement);
    let target = null;
    for (const el of list.children) {
      const on = el.dataset.id === id;
      if (on) target = el;
      if (el.classList.contains('avs-on') === on && (el.tabIndex === 0) === on) continue;
      el.classList.toggle('avs-on', on);
      el.setAttribute('aria-selected', String(on));
      el.tabIndex = on ? 0 : -1;
    }
    if (moveFocus && target && target !== document.activeElement) target.focus();
  }
}

function card(slide, index) {
  const el = document.createElement('div');
  el.className = 'avs-slide-card';
  el.draggable = true;
  el.title = t('field.dragReorder');
  el.dataset.id = slide.id;
  const isActive = slide.id === state.ui.activeSlideId;
  if (isActive) el.classList.add('avs-on');
  // Roving tabindex: the rail is ONE Tab stop and the arrows move inside it,
  // rather than Tab walking through every slide and its two action buttons.
  el.setAttribute('role', 'option');
  el.setAttribute('aria-selected', String(isActive));
  el.tabIndex = isActive ? 0 : -1;
  // Just the position and the name — the listbox itself is already named
  // 'Slides', so repeating the plural heading per option read as 'Slides 2'.
  el.setAttribute('aria-label', `${index + 1}: ${slide.name || t('rail.untitled')}`);
  el.addEventListener('focus', () => { state.ui.activeSlideId = slide.id; });
  el.addEventListener('keydown', e => onCardKey(e, slide.id));

  const sched = describeSchedule(slide, getLocale());
  el.innerHTML = `
    <div class="avs-slide-index">${index + 1}</div>
    <div class="avs-rail-thumb bb-theme-${slide.theme ?? state.playlist?.defaults?.theme ?? 'minimal-dark'}">
      ${[
        // Master blocks first and dimmed: the rail should show that the slide
        // is not as empty as its own widget list, without pretending the
        // master's content belongs to it.
        ...masterWidgetsFor(state.playlist, slide).map(w => [w, ' avs-thumb-master']),
        ...(slide.widgets ?? []).map(w => [w, '']),
      ].filter(([w]) => isWidgetVisible(w)).map(([w, cls]) => {
        const p = getPlugin(w.type);
        const r = w.rect ?? { x: 0, y: 0, w: 100, h: 100 };
        return `<span class="avs-thumb-block${cls}" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;${w.rotation ? `transform:rotate(${w.rotation}deg);` : ''}">${widgetIcon(w.type, p?.icon ?? '◻', 14)}</span>`;
      }).join('')}
    </div>
    <div class="avs-slide-meta">
      <span class="avs-slide-name">${escapeHtml(slide.name || t('rail.untitled'))}</span>
      ${sched ? `<span class="avs-slide-sched" title="${escapeHtml(sched)}">${uiIconSvg('clock', 11)}</span>` : ''}
      ${slide.langs && Object.keys(slide.langs).length ? `<span class="avs-slide-badge" title="${escapeHtml(Object.keys(slide.langs).join(', '))}">${uiIconSvg('connectivity', 11)}</span>` : ''}
      ${Array.isArray(slide.abVariants) && slide.abVariants.length ? `<span class="avs-slide-badge" title="${slide.abVariants.length} ${tx('A/B variants')}">${uiIconSvg('dice', 11)}</span>` : ''}
      ${slide.brandKit ? `<span class="avs-slide-badge" title="${tx('Brand Kit override')}">${uiIconSvg('brandkit', 11)}</span>` : ''}
      ${anyBindings(slide) ? `<span class="avs-slide-badge" title="${tx('Slot bindings')}">${uiIconSvg('link', 11)}</span>` : ''}
    </div>
    <div class="avs-slide-actions">
      <!-- Touch-only (CSS decides): the finger's replacement for dragging the
           card. Kept out of the way on a mouse, where dragging already works
           and two more buttons per card would be clutter. -->
      <button class="avs-iconbtn avs-slide-move" data-act="up" title="${t('rail.moveUp')}" aria-label="${t('rail.moveUp')}">▲</button>
      <button class="avs-iconbtn avs-slide-move" data-act="down" title="${t('rail.moveDown')}" aria-label="${t('rail.moveDown')}">▼</button>
      <button class="avs-iconbtn" data-act="dup" title="${t('rail.duplicate')}">${uiIconSvg('copy', 14)}</button>
      <button class="avs-iconbtn" data-act="del" title="${t('rail.delete')}">${uiIconSvg('trash', 14)}</button>
    </div>`;

  el.addEventListener('click', e => {
    if (e.target.closest('[data-act]')) return;
    state.ui.activeSlideId = slide.id;
    state.ui.selectedWidgetId = null;
  // Choosing a slide means you are no longer editing the master.
  if (state.ui.editingMaster) setEditingMaster(false);
  });
  el.querySelector('[data-act="up"]').addEventListener('click', () => moveSlideBy(slide.id, -1));
  el.querySelector('[data-act="down"]').addEventListener('click', () => moveSlideBy(slide.id, 1));
  el.querySelector('[data-act="dup"]').addEventListener('click', () => duplicate(slide.id));
  el.querySelector('[data-act="del"]').addEventListener('click', () => remove(slide.id));
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, slideMenuItems(slide.id));
  });
  return el;
}

// Move one slide by `delta` positions. Two callers with nothing else in common
// share it: Alt+arrow on the keyboard, and the up/down buttons a touch device
// gets instead of dragging. Reordering the rail is HTML5 drag-and-drop, and
// that fires no events at all for a finger — on a phone the order of a deck was
// simply not changeable, which is not a rough edge but a missing feature.
// Returns whether anything moved.
export function moveSlideBy(id, delta) {
  const all = state.playlist?.slides ?? [];
  // Reordering a filtered list has no defined meaning: "one down" from a
  // visible card lands on a slide that is not on screen. Refusing silently
  // is its own bug — the action does nothing and nothing says why.
  if (_filter) { announce(t('rail.moveFiltered'), 'warn'); return false; }
  const ix = all.findIndex(s => s.id === id);
  if (ix < 0) return false;
  const to = ix + delta;
  if (to < 0 || to >= all.length) { announce(t('rail.moveEdge'), 'warn'); return false; }
  const next = [...all];
  next.splice(to, 0, next.splice(ix, 1)[0]);
  state.playlist.slides = next;
  commit('reorder-slides');
  // The card keeps its name and its focus, so nothing about the move reaches
  // a screen reader on its own. Say where it landed.
  announce(t('rail.moved', {
    name: all[ix].name || t('rail.untitled'),
    pos: to + 1,
    total: all.length,
  }));
  return true;
}

// Arrow keys move BETWEEN slides; Alt+arrow moves the slide itself. Reordering
// was drag-and-drop only — makeReorderable() has no keyboard path at all — so a
// pointer-less user could select a slide but never change its position.
function onCardKey(e, id) {
  const all = state.playlist?.slides ?? [];
  // While a filter is active the arrows walk what is VISIBLE — stepping into a
  // hidden slide would move the selection somewhere the user cannot see.
  const slides = _filter ? all.filter(slideMatches) : all;
  const ix = slides.findIndex(s => s.id === id);
  if (ix < 0) return;

  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    moveSlideBy(id, e.key === 'ArrowDown' ? 1 : -1);
    return;
  }

  let to = null;
  if (e.key === 'ArrowDown') to = Math.min(ix + 1, slides.length - 1);
  else if (e.key === 'ArrowUp') to = Math.max(ix - 1, 0);
  else if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = slides.length - 1;
  else return;
  e.preventDefault();
  // Setting the active slide moves the roving tabindex AND the focus (see
  // setActive) so the next arrow keypress starts from the card that is now
  // selected.
  state.ui.activeSlideId = slides[to].id;
}

// True iff any widget in any variant of this slide (default, langs, abVariants)
// has a non-empty bindings map. Renders the link badge in the rail.
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
    { label: t('ctx.newAfter'), icon: uiIconSvg('plus', 14), run: () => insertAfter(id) },
    { label: t('ctx.duplicate'), icon: uiIconSvg('copy', 14), run: () => duplicate(id) },
    { label: t('ctx.delete'), icon: uiIconSvg('trash', 14), run: () => remove(id) },
    { separator: true },
    { label: t('ctx.moveUp'), icon: uiIconSvg('arrow-up', 14), disabled: ix <= 0, run: () => move(id, -1) },
    { label: t('ctx.moveDown'), icon: uiIconSvg('arrow-down', 14), disabled: ix < 0 || ix >= arr.length - 1, run: () => move(id, 1) },
    { separator: true },
    { label: t('ctx.rename'), icon: uiIconSvg('pencil', 14), run: () => rename(id) },
  ];
}

function insertAfter(id) {
  const ix = state.playlist.slides.findIndex(s => s.id === id);
  if (ix === -1) return;
  const s = createSlide({ duration: state.playlist?.defaults?.duration ?? 10 });
  state.playlist.slides.splice(ix + 1, 0, s);
  state.ui.activeSlideId = s.id;
  state.ui.selectedWidgetId = null;
  // Choosing a slide means you are no longer editing the master.
  if (state.ui.editingMaster) setEditingMaster(false);
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
  // Choosing a slide means you are no longer editing the master.
  if (state.ui.editingMaster) setEditingMaster(false);
  setTimeout(() => { const inp = document.getElementById('ss-name'); inp?.focus(); inp?.select?.(); }, 60);
}

function addSlide() {
  const dur = state.playlist?.defaults?.duration ?? 10;
  const s = createSlide({ duration: dur });
  state.playlist.slides.push(s);
  state.ui.activeSlideId = s.id;
  state.ui.selectedWidgetId = null;
  // Choosing a slide means you are no longer editing the master.
  if (state.ui.editingMaster) setEditingMaster(false);
  commit('add-slide');
}

function duplicate(id) {
  const ix = state.playlist.slides.findIndex(s => s.id === id);
  if (ix === -1) return;
  // JSON-clone, not structuredClone — slide data is a reactive Proxy.
  // Duplicating the slide you are currently variant-editing would otherwise
  // copy the VARIANT as the new slide's default — same bracket as saving.
  const copy = withSavedShape(() => JSON.parse(JSON.stringify(state.playlist.slides[ix])));
  copy.id = createSlide().id;
  // Fresh ids for EVERY widget the slide carries — the default array AND the
  // language / A/B variants. Only the default array used to be renumbered, so
  // a duplicated slide's variant widgets kept the originals' ids, and the
  // offline-data slot is keyed on exactly that id (offlineSlugFor →
  // `avs-d-<widget id>`): both slides then wrote to and read from ONE slot.
  // Change the URL in one, hit "Refresh data", and the other slide silently
  // shows the first one's numbers. walkAllWidgets is the module that already
  // owns "every widget of a playlist, variants included".
  walkAllWidgets({ slides: [copy] }, w => { w.id = 'w_' + Math.random().toString(36).slice(2, 10); });
  state.playlist.slides.splice(ix + 1, 0, copy);
  state.ui.activeSlideId = copy.id;
  commit('duplicate-slide');
}

function remove(id) {
  state.playlist.slides = state.playlist.slides.filter(s => s.id !== id);
  if (state.ui.activeSlideId === id) {
    state.ui.activeSlideId = state.playlist.slides[0]?.id ?? null;
    state.ui.selectedWidgetId = null;
  // Choosing a slide means you are no longer editing the master.
  if (state.ui.editingMaster) setEditingMaster(false);
  }
  commit('delete-slide');
}

