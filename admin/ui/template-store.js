// The Template Store — a gallery of complete, ready-to-run slide sets.
//
// Two entry points, one surface:
//   openTemplateStore()          the store, opened from the ⋯ menu, the command
//                                palette or the library's Templates tab.
//   openStartChooser()           the first-run fork: start blank, or pick a set.
//
// The store shows REAL previews (see ui/slide-thumb.js), because the choice it
// asks the user to make — "is this composition the one I want?" — cannot be
// made from a title and a grey rectangle. Everything renders offline: network
// widgets show a stand-in, so browsing the catalog contacts nobody.

import { state, commit } from '../store.js';
import { openModal, confirmModal } from './modal.js';
import { toast } from './toast.js';
import { t, tx, getLocale } from '../i18n.js';
import { escapeHtml, escapeAttr } from '../../shared/utils/escape.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { widgetIcon } from '../../shared/data/widget-icons.js';
import { get as getPlugin } from '../../shared/plugins/registry.js';
import { lazySlideThumb, renderSlideThumb } from './slide-thumb.js';
import '../../shared/templates/all.js';
import {
  listTemplates, getTemplate, buildPlaylist, buildSlides,
  matchesQuery, usedCategories, templateWidgetTypes, localizeCategory,
} from '../../shared/templates/registry.js';
import { localize } from '../../shared/templates/lib.js';

// Resolve a template's bilingual name/description for the current UI language.
const lang = () => (getLocale() === 'de' ? 'de' : 'en');
const nameOf = tpl => localize(tpl.name, lang());
const descOf = tpl => localize(tpl.description ?? '', lang());

// ---------------------------------------------------------------------------
// Applying a template
// ---------------------------------------------------------------------------

// Has the user built anything worth warning about? A pristine deck is one
// empty slide — replacing that needs no ceremony, and asking anyway is the
// kind of dialog people learn to click through without reading.
export function playlistIsPristine(pl = state.playlist) {
  const slides = pl?.slides ?? [];
  if (!slides.length) return true;
  if (slides.length > 1) return false;
  return (slides[0].widgets ?? []).length === 0;
}

async function applyTemplate(id, mode) {
  const tpl = getTemplate(id);
  if (!tpl) return false;

  if (mode === 'append') {
    const slides = buildSlides(tpl, { lang: lang() });
    state.playlist.slides.push(...slides);
    state.ui.activeSlideId = slides[0]?.id ?? state.ui.activeSlideId;
    state.ui.selectedWidgetId = null;
    commit('template-append');
    toast(t('tplStore.appended', { n: slides.length, name: nameOf(tpl) }), { kind: 'success' });
    return true;
  }

  if (!playlistIsPristine()) {
    const ok = await confirmModal({
      title: t('tplStore.replaceTitle'),
      message: t('tplStore.replaceBody', { name: nameOf(tpl) }),
      confirmLabel: t('tplStore.replaceConfirm'),
      danger: true,
    });
    if (!ok) return false;
  }
  const pl = buildPlaylist(id, { lang: lang() });
  state.playlist = pl;
  state.ui.activeSlideId = pl.slides[0]?.id ?? null;
  state.ui.selectedWidgetId = null;
  commit('template-apply');
  toast(t('tplStore.applied', { name: nameOf(tpl) }), { kind: 'success' });
  return true;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * @param {object} [opts]
 * @param {boolean} [opts.start]  first-run mode: shows the "start blank" card
 *                                first and titles the dialog as a fork rather
 *                                than a browser.
 * @returns {Promise<boolean>}    whether a template was applied
 */
export function openTemplateStore(opts = {}) {
  const start = !!opts.start;
  let applied = false;
  let close = () => {};
  const disposers = new Set();
  const dropThumbs = () => { for (const d of disposers) { try { d(); } catch {} } disposers.clear(); };

  const box = document.createElement('div');
  box.className = 'avs-tplstore';
  box.innerHTML = `
    <div class="avs-tplstore-bar">
      <input type="search" class="avs-tplstore-search" id="tpl-q"
             placeholder="${escapeAttr(t('tplStore.search'))}" aria-label="${escapeAttr(t('tplStore.search'))}" />
      <span class="avs-tplstore-count" id="tpl-count" role="status" aria-live="polite"></span>
    </div>
    <div class="avs-tplstore-cats" id="tpl-cats" role="tablist" aria-label="${escapeAttr(t('tplStore.categories'))}"></div>
    <div class="avs-tplstore-body" id="tpl-body"></div>`;

  const search = box.querySelector('#tpl-q');
  const catsEl = box.querySelector('#tpl-cats');
  const bodyEl = box.querySelector('#tpl-body');
  const countEl = box.querySelector('#tpl-count');

  let activeCat = 'all';
  let query = '';

  const cats = [{ id: 'all', label: t('tplStore.all') },
    ...usedCategories().map(c => ({ id: c.id, label: localizeCategory(c, lang()), icon: c.icon }))];

  catsEl.innerHTML = cats.map(c =>
    `<button type="button" role="tab" class="avs-tplstore-cat" data-cat="${escapeAttr(c.id)}">`
    + `${c.icon ? `<span class="avs-tplstore-cat-icon" aria-hidden="true">${escapeHtml(c.icon)}</span>` : ''}`
    + `<span>${escapeHtml(c.label)}</span></button>`).join('');
  catsEl.querySelectorAll('.avs-tplstore-cat').forEach(b => b.addEventListener('click', () => {
    activeCat = b.dataset.cat;
    renderGrid();
  }));

  search.addEventListener('input', () => { query = search.value; renderGrid(); });

  function visibleTemplates() {
    return listTemplates().filter(tpl => {
      if (activeCat !== 'all' && tpl.category !== activeCat) return false;
      // The blank card is the escape hatch, not a search result: it stays out
      // of the way unless the user is on "all" (or explicitly on its category),
      // and never competes with a real match for a typed query.
      if (tpl.category === 'blank' && (query.trim() || (activeCat !== 'all' && activeCat !== 'blank'))) return false;
      return matchesQuery(tpl, query);
    });
  }

  function renderGrid() {
    dropThumbs();
    catsEl.querySelectorAll('.avs-tplstore-cat').forEach(b => {
      const on = b.dataset.cat === activeCat;
      b.classList.toggle('avs-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    const list = visibleTemplates();
    countEl.textContent = t('tplStore.count', { n: list.length });
    bodyEl.replaceChildren();

    if (!list.length) {
      // A dead end needs a way out of itself. The old empty state was one grey
      // sentence, which also let the dialog collapse from full height to a
      // sliver — the box jumping around is what makes a no-match feel like a
      // fault rather than an answer. This keeps the height and hands back the
      // one action that fixes it.
      const empty = document.createElement('div');
      empty.className = 'avs-tplstore-empty';
      empty.innerHTML = `
        <span class="avs-tplstore-empty-icon" aria-hidden="true">${uiIconSvg('search', 30)}</span>
        <p class="avs-tplstore-empty-title">${escapeHtml(t('tplStore.none'))}</p>
        <p class="avs-tplstore-empty-hint">${escapeHtml(t('tplStore.noneHint'))}</p>`;
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'bb-btn bb-btn-secondary';
      reset.textContent = t('tplStore.noneReset');
      reset.addEventListener('click', () => {
        query = '';
        search.value = '';
        activeCat = 'all';
        renderGrid();
        search.focus();
      });
      empty.appendChild(reset);
      bodyEl.appendChild(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'avs-tplstore-grid';
    bodyEl.appendChild(grid);

    for (const tpl of list) grid.appendChild(buildCard(tpl));
  }

  function buildCard(tpl) {
    const isBlank = tpl.category === 'blank';
    const card = document.createElement('article');
    card.className = 'avs-tplcard' + (isBlank ? ' avs-tplcard-blank' : '');
    if (tpl.accent) card.style.setProperty('--avs-tpl-accent', tpl.accent);

    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'avs-tplcard-preview';
    preview.setAttribute('aria-label', t('tplStore.previewOf', { name: nameOf(tpl) }));
    card.appendChild(preview);

    if (isBlank) {
      preview.innerHTML = `<span class="avs-tplcard-blankmark" aria-hidden="true">${uiIconSvg('file-plus', 34)}</span>`;
    } else {
      // Build ONCE per card: build() is pure but not free, and the detail view
      // reuses the same slides rather than rebuilding with different ids.
      const slides = buildSlides(tpl, { lang: lang() });
      card._slides = slides;
      const pl = { canvas: tpl.canvas, defaults: tpl.defaults };
      // 'contain': the card box is a grid cell and must not take the slide's
      // shape. Portrait sets letterbox into it, which also reads as “this one
      // is portrait” at a glance.
      if (slides[0]) disposers.add(lazySlideThumb(preview, slides[0], pl, { fit: 'contain' }));
    }

    const types = templateWidgetTypes(tpl).slice(0, 6);
    const meta = isBlank
      ? t('tplStore.blankMeta')
      : t('tplStore.slides', { n: (card._slides ?? []).length });

    const info = document.createElement('div');
    info.className = 'avs-tplcard-info';
    info.innerHTML = `
      <h6 class="avs-tplcard-title">${escapeHtml(nameOf(tpl))}</h6>
      <p class="avs-tplcard-desc">${escapeHtml(descOf(tpl))}</p>
      <div class="avs-tplcard-foot">
        <span class="avs-tplcard-meta">${escapeHtml(meta)}</span>
        <span class="avs-tplcard-types" aria-hidden="true">${types.map(ty =>
          `<span title="${escapeAttr(tx(getPlugin(ty)?.label ?? ty))}">${widgetIcon(ty, getPlugin(ty)?.icon ?? '◻', 14)}</span>`).join('')}</span>
      </div>
      <div class="avs-tplcard-actions">
        <button type="button" class="bb-btn bb-btn-primary avs-tplcard-use">${escapeHtml(isBlank ? t('tplStore.useBlank') : t('tplStore.use'))}</button>
        ${isBlank ? '' : `<button type="button" class="bb-btn bb-btn-secondary avs-tplcard-open">${escapeHtml(t('tplStore.details'))}</button>`}
      </div>`;
    card.appendChild(info);

    const use = async () => { if (await applyTemplate(tpl.id, 'replace')) { applied = true; close(); } };
    info.querySelector('.avs-tplcard-use').addEventListener('click', use);
    info.querySelector('.avs-tplcard-open')?.addEventListener('click', () => openDetail(tpl, card._slides));
    preview.addEventListener('click', () => (isBlank ? use() : openDetail(tpl, card._slides)));
    return card;
  }

  // ---- Detail: every slide of the set, large ----
  function openDetail(tpl, prebuilt) {
    dropThumbs();
    const slides = prebuilt ?? buildSlides(tpl, { lang: lang() });
    const pl = { canvas: tpl.canvas, defaults: tpl.defaults };

    bodyEl.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'avs-tpldetail';
    wrap.innerHTML = `
      <div class="avs-tpldetail-head">
        <button type="button" class="bb-btn bb-btn-secondary avs-tpldetail-back">${uiIconSvg('chevron-left', 14)} ${escapeHtml(t('tplStore.back'))}</button>
        <div class="avs-tpldetail-titles">
          <h5>${escapeHtml(nameOf(tpl))}</h5>
          <p class="avs-muted">${escapeHtml(descOf(tpl))}</p>
        </div>
        <div class="avs-tpldetail-cta">
          <button type="button" class="bb-btn bb-btn-secondary avs-tpldetail-append">${escapeHtml(t('tplStore.append'))}</button>
          <button type="button" class="bb-btn bb-btn-primary avs-tpldetail-use">${escapeHtml(t('tplStore.use'))}</button>
        </div>
      </div>
      <div class="avs-tpldetail-stage" id="tpl-stage"></div>
      <div class="avs-tpldetail-rail" id="tpl-rail" role="listbox" aria-label="${escapeAttr(t('tplStore.slides', { n: slides.length }))}"></div>`;
    bodyEl.appendChild(wrap);

    const stage = wrap.querySelector('#tpl-stage');
    const rail = wrap.querySelector('#tpl-rail');
    let stageDispose = null;

    const showSlide = (i) => {
      stageDispose?.();
      const holder = document.createElement('div');
      holder.className = 'avs-tpldetail-slide';
      stage.replaceChildren(holder);
      // Measured after insertion: the stage is flex-sized, so clientWidth is
      // only meaningful once it is in the document. `contain` fits the slide
      // into that box whatever its aspect — a portrait set otherwise scaled to
      // the modal's width and ran off the bottom of the screen.
      stageDispose = renderSlideThumb(holder, slides[i], pl, {
        width: holder.clientWidth || stage.clientWidth,
        fit: 'contain',
        maxHeight: holder.clientHeight || stage.clientHeight,
      });
      rail.querySelectorAll('.avs-tplrail-item').forEach((el, j) => {
        el.classList.toggle('avs-on', j === i);
        el.setAttribute('aria-selected', j === i ? 'true' : 'false');
      });
    };

    slides.forEach((s, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'avs-tplrail-item';
      item.setAttribute('role', 'option');
      const label = s.name || t('tplStore.slideN', { n: i + 1 });
      item.innerHTML = `<span class="avs-tplrail-n">${i + 1}</span><span class="avs-tplrail-label">${escapeHtml(label)}</span>`;
      item.addEventListener('click', () => showSlide(i));
      rail.appendChild(item);
    });

    wrap.querySelector('.avs-tpldetail-back').addEventListener('click', () => { stageDispose?.(); renderGrid(); });
    wrap.querySelector('.avs-tpldetail-use').addEventListener('click', async () => {
      if (await applyTemplate(tpl.id, 'replace')) { applied = true; stageDispose?.(); close(); }
    });
    wrap.querySelector('.avs-tpldetail-append').addEventListener('click', async () => {
      if (await applyTemplate(tpl.id, 'append')) { applied = true; stageDispose?.(); close(); }
    });

    disposers.add(() => stageDispose?.());
    showSlide(0);
  }

  renderGrid();

  const p = openModal({
    title: start ? t('tplStore.startTitle') : t('tplStore.title'),
    body: box,
    actions: [{ label: start ? t('tplStore.startLater') : t('common.close') }],
    onMount: card => {
      card.classList.add('bb-modal-wide', 'bb-modal-tplstore');
      close = () => card.querySelector('.bb-modal-x')?.click?.();
      // Focus the search field, not the dialog: the store is a find-then-pick
      // surface and 27 cards is more than a glance.
      setTimeout(() => search.focus(), 0);
    },
  });
  return p.then(() => { dropThumbs(); return applied; });
}

// ---------------------------------------------------------------------------
// First-run fork
// ---------------------------------------------------------------------------

// Shown once, right after the welcome dialog, and only while the deck is still
// pristine. Deliberately a two-button fork rather than the full store: the
// question at that moment is "do I want help starting?", and a 27-card grid is
// an answer to a question the user has not asked yet.
export async function openStartChooser() {
  const box = document.createElement('div');
  box.className = 'avs-startfork';
  box.innerHTML = `
    <p class="avs-startfork-lead">${escapeHtml(t('start.lead'))}</p>
    <div class="avs-startfork-opts">
      <button type="button" class="avs-startfork-opt" data-pick="blank">
        <span class="avs-startfork-icon" aria-hidden="true">${uiIconSvg('file-plus', 26)}</span>
        <span class="avs-startfork-title">${escapeHtml(t('start.blankTitle'))}</span>
        <span class="avs-startfork-desc">${escapeHtml(t('start.blankDesc'))}</span>
      </button>
      <button type="button" class="avs-startfork-opt avs-startfork-primary" data-pick="template">
        <span class="avs-startfork-icon" aria-hidden="true">${uiIconSvg('grid', 26)}</span>
        <span class="avs-startfork-title">${escapeHtml(t('start.templateTitle'))}</span>
        <span class="avs-startfork-desc">${escapeHtml(t('start.templateDesc', { n: listTemplates().length - 1 }))}</span>
      </button>
    </div>`;

  let picked = null;
  const p = openModal({
    title: t('start.title'),
    body: box,
    actions: [{ label: t('start.later') }],
    onMount: card => {
      card.classList.add('bb-modal-startfork');
      box.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
        picked = b.dataset.pick;
        card.querySelector('.bb-modal-x')?.click?.();
      }));
    },
  });
  await p;
  if (picked === 'template') return openTemplateStore({ start: true });
  return false;
}
