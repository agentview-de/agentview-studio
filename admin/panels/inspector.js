// Right panel — two parts:
//   mountSlideSettings(host)     always-visible slide-level controls
//   renderWidgetInspector(host)  the selected widget's properties (swaps with Library)


import { state, commit, subscribe, on } from '../store.js';
import { get as getPlugin } from '../../shared/plugins/registry.js';
import { buildForm } from '../ui/inspector.js';
import { loadCollapsed, saveCollapsed } from '../ui/fold-section.js';
import { brandKitGrid, readBrandKitGrid } from '../ui/brand-kit-form.js';
import { isStored } from '../../shared/offline-data.js';
import { getControl } from '../ui/field-controls/registry.js';
import { widgetIcon } from '../../shared/data/widget-icons.js';
import { THEME_SWATCHES } from '../../shared/data/themes.js';
import { DESIGNS } from '../../shared/designs.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { CANVAS_PRESETS, resolveCanvas } from '../../shared/slide-schema.js';
import { SLIDE_TRANSITIONS, WIDGET_BUILDS, AMBIENT_EFFECTS, BUILD_DEFAULT_MS } from '../../shared/animations.js';
import {
  setWidgetGeometry, setWidgetRotation, refreshWidget, applyTheme, setCanvasSize, fitWidgetToRatio,
  deleteSelected, duplicateSelected, setWidgetBackground, setSlideBackground,
  applyActiveDesign, previewWidgetBuild, applyWidgetLoop,
  isLivePreview, enableLivePreview, disableLivePreview,
} from '../canvas/canvas.js';
import { renderScheduleEditor } from '../ui/schedule-editor.js';
import { mountBackgroundEditor } from './background-editor.js';
import { openModal } from '../ui/modal.js';
import { openDesigner } from './designer.js';
import { saveWidgetAsPreset } from '../ui/custom-widget-actions.js';
import { pickAsset, pickAssets } from '../ui/asset-library.js';
import { toast } from '../ui/toast.js';
import { t, tx } from '../i18n.js';
import { enterVariantEdit } from '../canvas/variant-ctx.js';
import { openTemplateContentEditor } from './template-editor.js';
import { slots as slotsApi } from '../api.js';
import { escapeHtml as esc } from '../../shared/utils/escape.js';
import { alignRect } from '../canvas/widget-frame.js';
import { usesNetwork } from '../../shared/plugin-network.js';

// Lazy slot-slug cache for the binding-inspector datalist. Populated on first
// inspector mount per session; invalidated by SSE data.changed/data.deleted
// events (main.js emits 'slots.changed' on the store bus; see below).
let _slotSlugCache = null;
async function getSlotSlugs() {
  if (_slotSlugCache) return _slotSlugCache;
  try {
    // Every page: a datalist that silently stops at the server's first page
    // suggests nothing for the slots a working account accumulates last.
    const r = await slotsApi.listAll();
    const list = Array.isArray(r) ? r : (r?.slots ?? r?.items ?? r?.data ?? []);
    _slotSlugCache = list.map(s => s.slug ?? s.name ?? s.id).filter(Boolean);
  } catch { _slotSlugCache = []; }
  return _slotSlugCache;
}

// On an SSE slot mutation, clear the cache so the next datalist population
// pulls fresh values from the server.
on('slots.changed', () => { _slotSlugCache = null; });

// The brand-kit colour grid (slide / playlist / org) lives in one shared module
// now — see admin/ui/brand-kit-form.js (brandKitGrid / readBrandKitGrid).

export const THEMES = [
  'minimal-dark', 'dark-minimal', 'gradient-purple', 'gradient-blue', 'gradient-orange',
  'bistro-warm', 'corporate-blue', 'medical-calm', 'industrial-steel', 'neon-cyber', 'editorial-mono',
];

function activeSlide() {
  const pl = state.playlist;
  return pl?.slides.find(s => s.id === state.ui.activeSlideId) ?? pl?.slides[0] ?? null;
}

// ---------- Slide settings (top strip) ----------
// The strip is now a single compact button — the actual controls (name,
// duration, transition, aspect, theme, background, schedule) all live in a
// modal opened from this button. The previous always-visible form ate ~180px
// of right-panel vertical space for settings that users rarely change after
// a slide is set up.
export function mountSlideSettings(host) {
  host.classList.add('avs-slide-settings');
  const render = () => {
    const slide = activeSlide();
    if (!slide) { host.innerHTML = `<div class="avs-inspector-empty">${t('insp.noSlide')}</div>`; return; }
    const name = slide.name?.trim() || t('insp.slideName');
    host.innerHTML = `
      <button class="avs-ss-trigger" id="ss-open" type="button" aria-label="${t('insp.slideSettings')}">
        <span class="avs-ss-trigger-icon" aria-hidden="true">${uiIconSvg('gear', 16)}</span>
        <span class="avs-ss-trigger-label">${t('insp.slideSettings')}</span>
        <span class="avs-ss-trigger-sub">${esc(name)}</span>
      </button>`;
    host.querySelector('#ss-open').addEventListener('click', () => openSlideSettings());
  };
  // Redraw the trigger on any playlist mutation (notify fires on the full path,
  // so this also catches `playlist.slides.<i>.name` edits from the settings
  // modal) and on slide switches.
  subscribe('ui', p => { if (p === 'ui.activeSlideId') render(); });
  subscribe('playlist', () => render());
  render();
}

// Modal body: all slide-level settings the strip used to expose, plus the
// shortcuts to schedule + background editors. Returns the DOM element ready
// to be passed to openModal({ body }).
function buildSlideSettingsBody(slide) {
  const box = document.createElement('div');
  box.className = 'avs-slide-modal';
  const cv = resolveCanvas(state.playlist?.canvas);
  box.innerHTML = `
    <div class="bb-form-group">
      <label>${t('insp.slideName')}</label>
      <input type="text" id="sm-name" value="${esc(slide.name ?? '')}" placeholder="${t('insp.slideName')}">
    </div>
    <div class="avs-ss-grid">
      <label>${t('insp.duration')}
        <input type="number" id="sm-dur" min="2" max="3600" value="${slide.duration ?? 10}">
      </label>
      <label>${t('insp.transition')}
        <select id="sm-tx">
          ${SLIDE_TRANSITIONS.map(x => `<option value="${x.id}" ${(slide.transition ?? 'fade') === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="bb-form-group">
      <label>${t('insp.canvasSize')}</label>
      <div class="avs-size-presets" id="sm-size-presets">
        ${CANVAS_PRESETS.map(p => `<button type="button" class="avs-size-preset${cv.w === p.w && cv.h === p.h ? ' bb-on' : ''}" data-w="${p.w}" data-h="${p.h}">${p.id}</button>`).join('')}
      </div>
      <div class="avs-size-fields">
        <label>${t('insp.width')}<input type="number" id="sm-cw" min="64" max="8192" step="1" value="${cv.w}"></label>
        <span class="avs-size-x" aria-hidden="true">×</span>
        <label>${t('insp.height')}<input type="number" id="sm-ch" min="64" max="8192" step="1" value="${cv.h}"></label>
        <label class="avs-size-fit">${t('insp.fit')}
          <select id="sm-fit">
            <option value="fill"    ${cv.fit === 'fill' ? 'selected' : ''}>${t('insp.fitFill')}</option>
            <option value="cover"   ${cv.fit === 'cover' ? 'selected' : ''}>${t('insp.fitCover')}</option>
            <option value="contain" ${cv.fit === 'contain' ? 'selected' : ''}>${t('insp.fitContain')}</option>
          </select>
        </label>
      </div>
      <p class="bb-form-help">${t('insp.canvasHelp')}</p>
    </div>
    <div class="bb-form-group">
      <label>${t('insp.theme')}</label>
      <div id="sm-theme-host"></div>
    </div>
    <div class="bb-form-group">
      <label>${t('insp.design')}</label>
      <p class="bb-form-help">${t('lib.designsHelp')}</p>
      <div class="avs-design-grid" id="sm-design-grid">
        ${DESIGNS.map(d => `
          <button class="avs-design-card${slide.design === d.id ? ' bb-sel' : ''}"
                  type="button" data-design="${esc(d.id)}"
                  title="${esc(d.label)} · ${d.rects.length} ${d.rects.length === 1 ? tx('zone') : tx('zones')}">
            <div class="avs-design-thumb">
              ${d.rects.map(r => `<span style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;"></span>`).join('')}
            </div>
            <span class="avs-design-label">${esc(d.label)}</span>
          </button>`).join('')}
      </div>
    </div>
    <div class="avs-ss-actions">
      <button class="bb-btn bb-btn-secondary" id="sm-bg" type="button">${uiIconSvg('image', 14)} ${t('bg.slideTitle')}</button>
      <button class="bb-btn bb-btn-secondary" id="sm-schedule" type="button">${uiIconSvg('clock', 14)} ${t('insp.schedule')}</button>
      <button class="bb-btn bb-btn-secondary" id="sm-brandkit" type="button">${uiIconSvg('brandkit', 14)} ${t('admin.brandkit')}</button>
    </div>
    <details class="avs-variants-details">
      <summary>${uiIconSvg('connectivity', 13)} ${t('variants.langs')} <span class="avs-variants-count" id="sm-lang-count">${esc(slide.langs ? Object.keys(slide.langs).length : 0)}</span></summary>
      <div id="sm-langs"></div>
      <div class="avs-flex-row" style="margin-top:6px;">
        <input id="sm-lang-input" placeholder="${t('variants.langPlaceholder')}" style="max-width:120px;">
        <button class="bb-btn" id="sm-lang-add" type="button">${t('variants.addLang')}</button>
      </div>
    </details>
    <details class="avs-variants-details">
      <summary>${uiIconSvg('dice', 13)} ${t('variants.ab')} <span class="avs-variants-count" id="sm-ab-count">${esc(Array.isArray(slide.abVariants) ? slide.abVariants.length : 0)}</span></summary>
      <div id="sm-abs"></div>
      <button class="bb-btn" id="sm-ab-add" type="button" style="margin-top:6px;">${t('variants.addAb')}</button>
    </details>`;

  box.querySelector('#sm-name').addEventListener('input', e => { slide.name = e.target.value; commit('slide-name'); });
  box.querySelector('#sm-dur').addEventListener('input', e => { slide.duration = +e.target.value || 10; commit('slide-duration'); });
  box.querySelector('#sm-tx').addEventListener('change', e => { slide.transition = e.target.value; commit('slide-transition'); });
  // Canvas size: presets set both dims; the number fields allow any custom size;
  // the fit select controls how the player maps the design onto a mismatched
  // container. All three write playlist.canvas = { w, h, fit } and live-resize
  // the editor stage.
  const applyCanvas = (next) => {
    const c = resolveCanvas(next);
    state.playlist.canvas = c;
    setCanvasSize(c.w, c.h);
    const cwEl = box.querySelector('#sm-cw'), chEl = box.querySelector('#sm-ch');
    if (cwEl) cwEl.value = c.w;
    if (chEl) chEl.value = c.h;
    box.querySelectorAll('#sm-size-presets .avs-size-preset').forEach(b =>
      b.classList.toggle('bb-on', +b.dataset.w === c.w && +b.dataset.h === c.h));
    commit('canvas');
  };
  box.querySelector('#sm-size-presets').addEventListener('click', e => {
    const b = e.target.closest('.avs-size-preset');
    if (!b) return;
    applyCanvas({ w: +b.dataset.w, h: +b.dataset.h, fit: resolveCanvas(state.playlist?.canvas).fit });
  });
  const onDim = () => applyCanvas({
    w: +box.querySelector('#sm-cw').value,
    h: +box.querySelector('#sm-ch').value,
    fit: resolveCanvas(state.playlist?.canvas).fit,
  });
  box.querySelector('#sm-cw').addEventListener('change', onDim);
  box.querySelector('#sm-ch').addEventListener('change', onDim);
  box.querySelector('#sm-fit').addEventListener('change', e =>
    applyCanvas({ ...resolveCanvas(state.playlist?.canvas), fit: e.target.value }));

  // Through the same field-control registry the schema forms use, so the theme
  // picker has ONE code path (registered by ui/inspector.js, statically imported
  // above so the registration has run by the time this renders).
  const themeCtrl = getControl('theme')({ options: THEMES }, slide.theme, v => {
    slide.theme = v; applyTheme(); commit('slide-theme');
  });
  box.querySelector('#sm-theme-host').appendChild(themeCtrl.el);

  // Design picker — clicking a swatch applies the layout (rebuilds the slide's
  // widget grid via applyActiveDesign) and reflects the selection in the grid.
  // Selection state lives on slide.design which applyActiveDesign sets.
  box.querySelector('#sm-design-grid').addEventListener('click', e => {
    const btn = e.target.closest('.avs-design-card');
    if (!btn) return;
    const id = btn.dataset.design;
    const d = DESIGNS.find(x => x.id === id);
    if (!d) return;
    applyActiveDesign(id);
    box.querySelectorAll('.avs-design-card').forEach(c => c.classList.toggle('bb-sel', c.dataset.design === id));
    toast(t('lib.designApplied', { label: d.label }), { kind: 'success', ttl: 1500 });
  });

  box.querySelector('#sm-schedule').addEventListener('click', async () => {
    const inner = document.createElement('div');
    renderScheduleEditor(inner, slide, () => commit('schedule'));
    await openModal({ title: `${t('insp.schedule')} · ${slide.name || slide.id}`, body: inner, actions: [{ label: t('common.done'), value: 1 }] });
  });

  // v3: per-slide brand-kit override
  box.querySelector('#sm-brandkit').addEventListener('click', async () => {
    const inner = document.createElement('div');
    inner.innerHTML = brandKitGrid(slide.brandKit ?? {});
    const ok = await openModal({
      title: t('brandkit.slideTitle'), body: inner,
      actions: [
        { label: t('brandkit.remove'), value: 'clear' },
        { label: t('common.cancel') },
        { label: t('common.save'), kind: 'primary', value: 'save' },
      ],
    });
    if (ok === 'clear') { delete slide.brandKit; commit('slide-brandkit'); }
    else if (ok === 'save') {
      slide.brandKit = readBrandKitGrid(inner);
      commit('slide-brandkit');
    }
  });

  // v3: Sprachvarianten — clone widgets on add, edit via "Bearbeiten" toggles
  // canvas into variant-edit mode (swap-in-place pattern, see variant-ctx).
  const renderLangs = () => {
    const host = box.querySelector('#sm-langs');
    const langs = slide.langs ?? {};
    const keys = Object.keys(langs);
    if (!keys.length) { host.innerHTML = `<p class="avs-muted">${t('variants.noLangs')}</p>`; return; }
    host.innerHTML = keys.map(k => `
      <div class="avs-variant-row" data-lang="${esc(k)}">
        <code style="min-width:50px;">${esc(k)}</code>
        <span style="flex:1;opacity:.7;">${esc(langs[k].widgets?.length ?? 0)} ${t('variants.widgets')}</span>
        <button class="bb-btn" data-edit-lang="${esc(k)}">${t('variants.edit')}</button>
        <button class="bb-btn bb-btn-danger" data-del-lang="${esc(k)}">×</button>
      </div>`).join('');
    host.querySelectorAll('[data-edit-lang]').forEach(b => b.addEventListener('click', () => {
      enterVariantEdit(slide, 'lang', b.dataset.editLang);
      document.querySelector('.bb-modal-close')?.click();
    }));
    host.querySelectorAll('[data-del-lang]').forEach(b => b.addEventListener('click', () => {
      delete slide.langs[b.dataset.delLang];
      if (!Object.keys(slide.langs).length) delete slide.langs;
      commit('slide-lang-del');
      renderLangs();
      box.querySelector('#sm-lang-count').textContent = slide.langs ? Object.keys(slide.langs).length : 0;
    }));
  };
  box.querySelector('#sm-lang-add').addEventListener('click', () => {
    const code = box.querySelector('#sm-lang-input').value.trim().toLowerCase();
    if (!/^[a-z]{2}(-[a-z]{2})?$/i.test(code)) { toast(t('variants.langHint'), { kind: 'warn' }); return; }
    if (!slide.langs) slide.langs = {};
    if (slide.langs[code]) { toast(t('variants.exists'), { kind: 'warn' }); return; }
    slide.langs[code] = { widgets: JSON.parse(JSON.stringify(slide.widgets ?? [])) };
    box.querySelector('#sm-lang-input').value = '';
    commit('slide-lang-add');
    renderLangs();
    box.querySelector('#sm-lang-count').textContent = Object.keys(slide.langs).length;
  });
  renderLangs();

  // v3: A/B-Varianten — symmetric, weight is editable inline.
  const renderAbs = () => {
    const host = box.querySelector('#sm-abs');
    const list = Array.isArray(slide.abVariants) ? slide.abVariants : [];
    if (!list.length) { host.innerHTML = `<p class="avs-muted">${t('variants.noAb')}</p>`; return; }
    // One arm is not a split. The player plays what the canvas shows until a
    // second arm joins it — say so here, or the count badge reading "1" looks
    // like a live experiment while the slide is playing something else.
    const lonely = list.length === 1
      ? `<p class="avs-muted avs-variant-hint">${t('variants.abNeedsTwo')}</p>` : '';
    host.innerHTML = lonely + list.map((v, i) => `
      <div class="avs-variant-row" data-ab="${i}">
        <input data-ab-label="${i}" value="${esc(v.label ?? String.fromCharCode(65 + i))}" style="max-width:80px;">
        <label style="font-size:11px;opacity:.7;">${t('variants.weight')}<input type="number" data-ab-weight="${i}" min="0" step="0.5" value="${esc(v.weight ?? 1)}" style="max-width:60px;margin-left:4px;"></label>
        <span style="flex:1;opacity:.7;font-size:11px;">${esc(v.widgets?.length ?? 0)} ${t('variants.widgets')}</span>
        <button class="bb-btn" data-edit-ab="${i}">${t('variants.edit')}</button>
        <button class="bb-btn bb-btn-danger" data-del-ab="${i}">×</button>
      </div>`).join('');
    host.querySelectorAll('[data-ab-label]').forEach(inp => inp.addEventListener('input', () => {
      const i = +inp.dataset.abLabel;
      slide.abVariants[i].label = inp.value;
      commit('slide-ab-label');
    }));
    host.querySelectorAll('[data-ab-weight]').forEach(inp => inp.addEventListener('input', () => {
      const i = +inp.dataset.abWeight;
      slide.abVariants[i].weight = +inp.value || 1;
      commit('slide-ab-weight');
    }));
    host.querySelectorAll('[data-edit-ab]').forEach(b => b.addEventListener('click', () => {
      enterVariantEdit(slide, 'ab', +b.dataset.editAb);
      document.querySelector('.bb-modal-close')?.click();
    }));
    host.querySelectorAll('[data-del-ab]').forEach(b => b.addEventListener('click', () => {
      slide.abVariants.splice(+b.dataset.delAb, 1);
      if (!slide.abVariants.length) delete slide.abVariants;
      commit('slide-ab-del');
      renderAbs();
      box.querySelector('#sm-ab-count').textContent = slide.abVariants?.length ?? 0;
    }));
  };
  box.querySelector('#sm-ab-add').addEventListener('click', () => {
    if (!Array.isArray(slide.abVariants)) slide.abVariants = [];
    slide.abVariants.push({
      label: String.fromCharCode(65 + slide.abVariants.length),
      weight: 1,
      widgets: JSON.parse(JSON.stringify(slide.widgets ?? [])),
    });
    commit('slide-ab-add');
    renderAbs();
    box.querySelector('#sm-ab-count').textContent = slide.abVariants.length;
  });
  renderAbs();
  box.querySelector('#sm-bg').addEventListener('click', async () => {
    const inner = document.createElement('div');
    const themeId = slide.theme ?? state.playlist?.defaults?.theme ?? 'minimal-dark';
    mountBackgroundEditor(inner, {
      get: () => slide.background,
      onChange: bg => { setSlideBackground(bg); commit('slide-bg'); },
      assetPicker: a => pickAsset(a),
      scope: 'slide',
      themeBg: THEME_SWATCHES[themeId]?.bg,
    });
    await openModal({ title: t('bg.slideTitle'), body: inner, actions: [{ label: t('common.done'), value: 1 }] });
  });

  return box;
}

async function openSlideSettings() {
  const slide = activeSlide();
  if (!slide) return;
  await openModal({
    title: `${t('insp.slideSettings')} · ${slide.name || slide.id}`,
    body: buildSlideSettingsBody(slide),
    actions: [{ label: t('common.done'), value: 1 }],
  });
}

// ---------- Widget inspector ----------
let debounceTimer = null;
const debounce = (fn, ms = 200) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(fn, ms); };
// Geometry commits get their own debounce channel so a burst of typed digits
// becomes one undo entry without cancelling a pending content/bindings commit
// on the shared timer above. Canvas updates stay immediate — only commit()
// is deferred, mirroring the content onChange path.
let geoDebounceTimer = null;
const geoDebounce = (fn, ms = 200) => { clearTimeout(geoDebounceTimer); geoDebounceTimer = setTimeout(fn, ms); };

// The previously-built schema form. Disposed before every inspector rebuild so
// controls holding document-level listeners (rich-text selectionchange /
// mousedown) or timers don't leak one instance per re-render. Optional
// chaining keeps this a no-op until buildForm actually returns dispose().
let prevForm = null;

// Local fold helper for the below-form inspector blocks (onError, Background,
// Animation, Bindings). Mirrors the bb-form-section fold the schema form above
// uses — same CSS classes, same `avs_section_<widgetType>_<key>` localStorage
// convention — so the whole panel has ONE consistent fold interaction. All
// blocks default to open; keys are prefixed with `_` so they can never collide
// with a schema section key.
// `title` is TEXT and is escaped as such. An icon goes in `opts.icon` as a
// ui-icon id, never inline in the title: a caller that passed
// `${uiIconSvg('link')} Bind to slot` got its SVG source escaped into the
// header and then uppercased by the label's own CSS, so the Bindings section
// announced itself as `<SVG VIEWBOX="0 0 24 24" WIDTH="13…`.
function foldSection(widgetType, key, title, { defaultCollapsed = false, icon = '' } = {}) {
  const collapsed = loadCollapsed(widgetType, key, defaultCollapsed);
  const section = document.createElement('section');
  section.className = 'avs-inspector-section bb-form-section';
  if (collapsed) section.classList.add('bb-form-section-closed');
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'bb-form-section-head';
  head.innerHTML = `<span class="bb-form-section-chev">▾</span> `
    + (icon ? `<span class="bb-form-section-icon" aria-hidden="true">${uiIconSvg(icon, 13)}</span> ` : '')
    + `<span class="bb-form-section-label">${esc(title ?? '')}</span>`;
  const body = document.createElement('div');
  body.className = 'bb-form-section-body';
  head.addEventListener('click', () => {
    const nowClosed = section.classList.toggle('bb-form-section-closed');
    saveCollapsed(widgetType, key, nowClosed);
  });
  section.append(head, body);
  return { section, body };
}

export function renderWidgetInspector(host) {
  host.classList.add('avs-inspector');
  // Dispose the previous form before wiping the DOM — its controls may hold
  // document-level listeners that would otherwise survive the innerHTML swap.
  prevForm?.dispose?.();
  prevForm = null;
  const slide = activeSlide();
  const id = state.ui.selectedWidgetId;
  const widget = slide?.widgets.find(w => w.id === id);
  if (!widget) { host.innerHTML = `<div class="avs-inspector-empty">${t('insp.noWidget')}</div>`; return; }
  const plugin = getPlugin(widget.type);

  // Geometry inputs — X/Y/W/H are % of the slide, R is degrees, Z is the
  // stacking order. Units live as a tiny muted suffix in the label plus a
  // title tooltip so the single-letter labels stay compact.
  const GEO_FIELDS = [
    { k: 'x',   label: 'X', unit: '%', hint: tx('X — horizontal position (% of slide width)'), attrs: 'min="0" max="100" step="0.5"', val: widget.rect.x },
    { k: 'y',   label: 'Y', unit: '%', hint: tx('Y — vertical position (% of slide height)'),  attrs: 'min="0" max="100" step="0.5"', val: widget.rect.y },
    { k: 'w',   label: 'W', unit: '%', hint: tx('W — width (% of slide width)'),               attrs: 'min="0" max="100" step="0.5"', val: widget.rect.w },
    { k: 'h',   label: 'H', unit: '%', hint: tx('H — height (% of slide height)'),             attrs: 'min="0" max="100" step="0.5"', val: widget.rect.h },
    { k: 'z',   label: 'Z', unit: '',  hint: tx('Z — stacking order (higher = in front)'),     attrs: 'min="0" step="1"',             val: widget.z ?? 0 },
    { k: 'rot', label: 'R', unit: '°', hint: tx('R — rotation in degrees'),                    attrs: 'min="-180" max="180" step="1"', val: widget.rotation ?? 0 },
  ];

  // Layout presets — snap the widget to common slide regions without typing
  // numbers. Percentages of the slide; corner presets use 33% boxes so two
  // corner widgets side-by-side leave room for a third. Each button draws a
  // mini slide with the target region filled, generated from this same
  // geometry — the layout is recognisable at a glance, no cryptic glyphs.
  const PRESETS = {
    full:   { x: 0,  y: 0,  w: 100, h: 100 },
    left:   { x: 0,  y: 0,  w: 50,  h: 100 },
    right:  { x: 50, y: 0,  w: 50,  h: 100 },
    top:    { x: 0,  y: 0,  w: 100, h: 50 },
    bot:    { x: 0,  y: 50, w: 100, h: 50 },
    center: { x: 25, y: 25, w: 50,  h: 50 },
    tl:     { x: 0,  y: 0,  w: 33,  h: 33 },
    tr:     { x: 67, y: 0,  w: 33,  h: 33 },
    bl:     { x: 0,  y: 67, w: 33,  h: 33 },
    br:     { x: 67, y: 67, w: 33,  h: 33 },
  };
  const PRESET_TITLES = {
    full: 'insp.preset.full', left: 'insp.preset.left', right: 'insp.preset.right',
    top: 'insp.preset.top', bot: 'insp.preset.bottom', center: 'insp.preset.center',
    tl: 'insp.preset.tl', tr: 'insp.preset.tr', bl: 'insp.preset.bl', br: 'insp.preset.br',
  };
  // Align: move to an edge or centre WITHOUT resizing — a different job from
  // the presets below, which replace the whole rect. Drawn in the same mini-
  // slide language so the two rows read as one family; the block inside each
  // mini sits where the widget will end up.
  // The mini is 26×16 px, so a 26%×30% block came out 6×4 — a speck. These
  // read as a bar pushed against the edge they name.
  const ALIGN = {
    left:    { x: 0,  y: 18, w: 30, h: 64 },
    hcenter: { x: 35, y: 18, w: 30, h: 64 },
    right:   { x: 70, y: 18, w: 30, h: 64 },
    top:     { x: 20, y: 0,  w: 60, h: 34 },
    vmiddle: { x: 20, y: 33, w: 60, h: 34 },
    bottom:  { x: 20, y: 66, w: 60, h: 34 },
  };
  const alignButtonsHtml = Object.entries(ALIGN).map(([key, m]) => {
    const title = t(`insp.align.${key}`);
    return `<button class="avs-geo-preset" data-align="${key}" title="${esc(title)}" aria-label="${esc(title)}"><span class="avs-geo-mini"><span class="avs-geo-mini-fill" style="left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%"></span></span></button>`;
  }).join('');

  const presetButtonsHtml = Object.keys(PRESETS).map(key => {
    const p = PRESETS[key];
    const title = t(PRESET_TITLES[key]);
    return `<button class="avs-geo-preset" data-preset="${key}" title="${esc(title)}" aria-label="${esc(title)}"><span class="avs-geo-mini"><span class="avs-geo-mini-fill" style="left:${p.x}%;top:${p.y}%;width:${p.w}%;height:${p.h}%"></span></span></button>`;
  }).join('');

  // The numeric grid + presets are rarely needed (most positioning happens by
  // dragging on the canvas), so they live in a fold that's collapsed by
  // default. Remembered globally — it's the same control on every widget — so
  // power users who align by number keep it open.
  const GEO_KEY = 'avs_geo_collapsed';
  let geoCollapsed = true;
  try { const gv = localStorage.getItem(GEO_KEY); if (gv !== null) geoCollapsed = gv === '1'; } catch {}

  host.innerHTML = `
    <div class="avs-inspector-head">
      <button class="avs-inspector-back" id="ins-back" title="${t('insp.backToLibrary')}" aria-label="${t('insp.backToLibrary')}">
        <span class="avs-inspector-back-arrow" aria-hidden="true">←</span>
        <span class="avs-inspector-back-label">${t('insp.backToLibrary')}</span>
      </button>
      <span class="avs-inspector-title">${widgetIcon(widget.type, plugin?.icon ?? '◻', 18)} ${tx(plugin?.label ?? widget.type)}</span>
      <div class="avs-inspector-actions">
        <button class="avs-iconbtn" id="ins-save-widget" title="${esc(tx('Save as widget'))}">${uiIconSvg('star')}</button>
        <button class="avs-iconbtn" id="ins-reset" title="${t('insp.reset')}">↺</button>
        <button class="avs-iconbtn" id="ins-dup" title="${t('rail.duplicate')}">⧉</button>
        <button class="avs-iconbtn" id="ins-del" title="${t('rail.delete')}">${uiIconSvg('trash')}</button>
      </div>
    </div>
    <div class="avs-inspector-body">
      <section class="bb-form-section avs-geo-section${geoCollapsed ? ' bb-form-section-closed' : ''}">
        <button class="bb-form-section-head" type="button" id="geo-toggle">
          <span class="bb-form-section-chev">▾</span>
          <span class="bb-form-section-label">${t('insp.geometry')}</span>
        </button>
        <div class="bb-form-section-body avs-geo-body">
          <div class="avs-geo-grid">
            ${GEO_FIELDS.map(g => `
              <label title="${esc(g.hint)}">
                <span>${g.label}${g.unit ? `<span class="avs-geo-unit">${g.unit}</span>` : ''}</span>
                <input type="number" data-geo="${g.k}" ${g.attrs} value="${g.val}" title="${esc(g.hint)}">
              </label>`).join('')}
          </div>
          <div class="avs-geo-rowlabel">${t('insp.alignOnSlide')}</div>
          <div class="avs-geo-presets" aria-label="${t('insp.alignOnSlide')}">${alignButtonsHtml}</div>
          <div class="avs-geo-rowlabel">${t('insp.layoutPresets')}</div>
          <div class="avs-geo-presets" aria-label="${t('insp.layoutPresets')}">${presetButtonsHtml}</div>
        </div>
      </section>
      <div class="avs-inspector-content" id="ins-content"></div>
    </div>`;

  host.querySelector('#ins-back').addEventListener('click', () => { state.ui.selectedWidgetId = null; });
  // Position & size fold — persisted via the global key above.
  host.querySelector('#geo-toggle').addEventListener('click', () => {
    const sec = host.querySelector('.avs-geo-section');
    const nowClosed = sec.classList.toggle('bb-form-section-closed');
    try { localStorage.setItem(GEO_KEY, nowClosed ? '1' : '0'); } catch {}
  });
  host.querySelector('#ins-save-widget').addEventListener('click', () => saveWidgetAsPreset(widget));
  host.querySelector('#ins-dup').addEventListener('click', duplicateSelected);
  host.querySelector('#ins-del').addEventListener('click', deleteSelected);
  // Reset = reapply plugin.defaults() to widget.content. Confirms first
  // because it's a destructive overwrite of all the user's settings on this
  // widget (geometry is preserved).
  host.querySelector('#ins-reset').addEventListener('click', async () => {
    const ok = await openModal({
      title: t('insp.reset'),
      body: (() => { const d = document.createElement('div'); d.innerHTML = `<p>${esc(t('insp.resetConfirm'))}</p>`; return d; })(),
      actions: [{ label: t('common.cancel') }, { label: t('insp.reset'), kind: 'danger', value: 1 }],
    });
    if (!ok) return;
    widget.content = plugin?.defaults?.() ?? {};
    commit('widget-reset');
    refreshWidget(widget.id);
    // Force inspector to rebuild with the reset content (selectedWidgetId
    // didn't change — toggle through null to trigger the subscribe).
    state.ui.selectedWidgetId = null;
    state.ui.selectedWidgetId = widget.id;
  });
  // Highlight whichever preset matches the widget's current rect, so the active
  // layout reads at a glance. Tolerance covers float drift from drag-resizing.
  function markActivePreset() {
    const r = widget.rect;
    host.querySelectorAll('[data-preset]').forEach(btn => {
      const p = PRESETS[btn.dataset.preset];
      const match = p && ['x', 'y', 'w', 'h'].every(k => Math.abs((r[k] ?? 0) - p[k]) < 0.6);
      btn.classList.toggle('is-active', !!match);
    });
  }
  host.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.dataset.preset];
      if (!p) return;
      setWidgetGeometry(widget.id, p);
      commit('widget-geo');
      // Re-sync the X/Y/W/H inputs with the new values without re-rendering.
      host.querySelectorAll('[data-geo]').forEach(inp => {
        if (inp.dataset.geo in p) inp.value = p[inp.dataset.geo];
      });
      markActivePreset();
    });
  });
  host.querySelectorAll('[data-align]').forEach(btn => {
    btn.addEventListener('click', () => {
      // Size is preserved on purpose — that is the whole difference from a
      // preset. One history entry per click, so a click is one undo.
      const next = alignRect(widget.rect, btn.dataset.align);
      setWidgetGeometry(widget.id, next);
      commit('widget-align');
      // Sync from the rect we just computed, the way the preset row does —
      // reading `widget.rect` back gave the value from BEFORE the write, so
      // the canvas moved and the X field went on claiming the old number.
      host.querySelectorAll('[data-geo]').forEach(inp => {
        if (inp.dataset.geo in next) inp.value = next[inp.dataset.geo];
      });
      markActivePreset();
    });
  });
  markActivePreset();
  // Per-widget title field removed: titles are now their own Text widget
  // (gives full WYSIWYG control over size/colour/font/alignment, can be
  // placed anywhere on the slide). Legacy widgets with widget.title still
  // render their h1 in the plugins for backward compatibility.
  host.querySelectorAll('[data-geo]').forEach(inp => inp.addEventListener('input', () => {
    const k = inp.dataset.geo;
    if (k === 'z') { widget.z = +inp.value || 0; setWidgetGeometry(widget.id, widget.rect); }
    else if (k === 'rot') { setWidgetRotation(widget.id, +inp.value || 0); }
    else setWidgetGeometry(widget.id, { ...widget.rect, [k]: +inp.value });
    // Canvas already moved above; defer only the undo snapshot so typing
    // "120" is one history entry, not three.
    geoDebounce(() => commit('widget-geo'));
    markActivePreset();
  }));

  const form = buildForm({
    // Pass the content so a widget with a CONTENT-DRIVEN schema (the custom
    // widget builds its form from content.fields) can react. Built-in plugins
    // ignore the argument, so this is backward-compatible.
    schema: plugin.schema(widget.content),
    value: widget.content ?? plugin.defaults(),
    // Per-field reset baseline. Consumed once buildForm supports it; an older
    // buildForm simply ignores the extra param, so this is safe either way.
    defaults: plugin.defaults?.(),
    // Used as a storage-key prefix so each widget type remembers its own
    // collapsed-section state. Without it, every inspector re-render would
    // reset the user's folding.
    formKey: widget.type,
    // The inline inspector shows only the essential controls; advanced fields
    // (tier:'advanced') live in the Widget Designer reached via "Open designer".
    // Widgets that tag no field as advanced are unaffected — they show all.
    tierFilter: 'basic',
    onChange: v => {
      // Detect a switch INTO "provided offline" so we can fetch the data right
      // away (below) — the user shouldn't have to go to the header "Daten" action
      // just to see anything.
      const wasStored = isStored(widget.content);
      // If the widget exposes a content-driven ratio (e.g. YouTube 16:9 / 9:16),
      // snap its box to that ratio when the ratio actually changes.
      const oldR = plugin.contentRatio?.(widget.content);
      widget.content = v;
      const newR = plugin.contentRatio?.(v);
      if (newR && (!oldR || oldR[0] * newR[1] !== newR[0] * oldR[1])) {
        fitWidgetToRatio(widget.id, newR);
        host.querySelectorAll('[data-geo]').forEach(inp => {
          const k = inp.dataset.geo;
          inp.value = k === 'z' ? (widget.z ?? 0) : k === 'rot' ? (widget.rotation ?? 0) : Math.round(widget.rect[k] * 10) / 10;
        });
      }
      // Just switched to offline → provision its data now and re-render so it
      // shows immediately. Lazy import keeps the inspector free of the publish
      // flow's module graph. (provisionWidgetOffline is a no-op without a source.)
      if (!wasStored && isStored(v)) {
        import('../publish-flow.js').then(({ provisionWidgetOffline }) =>
          provisionWidgetOffline(widget).then(ok => { if (ok) refreshWidget(widget.id); }));
      }
      debounce(() => { refreshWidget(widget.id); commit('widget-content'); });
    },
    assetPicker: async accept => await pickAsset(accept),
    assetsPicker: async accept => await pickAssets(accept),
  });
  host.querySelector('#ins-content').appendChild(form.root);
  // Remember the live form so the NEXT rebuild can dispose its controls.
  prevForm = form;

  // One launcher for the full-screen Widget Designer (Ebene ②) for EVERY widget.
  // The inline form above is the quick path; this graduates to a large live
  // stage, device-format previews, Looks, and — for custom widgets — a Code tab
  // (template / CSS / fields). Edits there are a transaction (Cancel discards).
  {
    const dz = document.createElement('div');
    dz.className = 'avs-inspector-section';
    dz.style.cssText = 'margin-bottom:12px;';
    const help = widget.type === 'custom'
      ? tx('Large live stage, all settings, and the template / CSS / fields editor.')
      : tx('Open the full-screen designer with a large live preview.');
    dz.innerHTML = `<button class="bb-btn bb-btn-primary" id="ins-open-designer2" style="width:100%;">${uiIconSvg('brandkit', 14)} ${esc(tx('Open designer'))}</button>
      <p class="bb-form-help">${esc(help)}</p>`;
    dz.querySelector('#ins-open-designer2').addEventListener('click', () => {
      const cv = resolveCanvas(state.playlist?.canvas);
      openDesigner(widget, {
        slideRatio: cv.h ? cv.w / cv.h : 16 / 9,
        onApply: () => {
          commit('widget-design');
          refreshWidget(widget.id);
          // Field set may have changed (custom Code tab) → rebuild the inline
          // form (toggle through null so the selectedWidgetId subscriber re-runs).
          state.ui.selectedWidgetId = null;
          state.ui.selectedWidgetId = widget.id;
        },
      });
    });
    host.querySelector('#ins-content').prepend(dz);
  }

  // Usage / licensing note. The library shows a quiet corner glyph BEFORE the
  // widget is picked; here — once it's placed — we repeat the full constraint
  // so the operator doesn't have to remember why the tile was flagged. Only
  // the constraint tiers get a note; business-ok stays silent (no news is good
  // news). Data comes straight off plugin.usage (see shared/plugin-contract.js).
  const usage = plugin?.usage;
  if (usage && (usage.tier === 'byo-key' || usage.tier === 'private-only')) {
    const tok = 'var(--bb-warn)';
    const tierKey = usage.tier === 'byo-key' ? 'usage.byoKey' : 'usage.privateOnly';
    // Compact + collapsible: the constraint headline is always visible; the
    // details (note / attribution / terms) fold away so they don't push the
    // widget's own settings down the panel.
    const note = document.createElement('details');
    note.className = 'avs-inspector-usage avs-note';
    note.style.cssText = `border-left:3px solid ${tok};background:color-mix(in srgb, ${tok} 10%, transparent);`;
    const rows = [];
    if (usage.note) rows.push(`<div>${esc(usage.note)}</div>`);
    if (usage.attribution) rows.push(`<div style="opacity:.8;margin-top:4px;">${esc(usage.attribution)}</div>`);
    if (usage.providerTerms && /^https:\/\//i.test(usage.providerTerms)) {
      rows.push(`<div style="margin-top:6px;"><a href="${esc(usage.providerTerms)}" target="_blank" rel="noopener noreferrer" style="color:${tok};text-decoration:underline;">${esc(t('usage.terms'))} ↗</a></div>`);
    }
    note.innerHTML = `<summary class="avs-note-summary"><span class="avs-note-title" style="color:${tok};">${esc(t(tierKey))}</span></summary>`
      + (rows.length ? `<div class="avs-note-detail">${rows.join('')}</div>` : '');
    // Sits at the very top of the widget's own settings so the constraint is
    // the first thing seen when editing a flagged widget.
    host.querySelector('#ins-content').prepend(note);
  }

  // Data-protection note (DSGVO): any network widget transmits the rendering
  // device's IP to a third party when it loads its live data. Surface it on
  // every network widget — not only the ones carrying a licensing tier.
  // Exception: a widget in "provided offline" mode makes NO network call in the
  // editor (it reads pre-fetched data from its slot), so the IP note and the
  // live-preview toggle don't apply — the Studio, not the display, did the fetch.
  if (usesNetwork(plugin, widget.content) && !isStored(widget.content)) {
    const provider = usage?.attribution || t('privacy.providerGeneric');
    // Compact + collapsible: a one-line summary keeps the live-preview toggle
    // always reachable, while the full IP/DSGVO explanation folds away.
    const ipNote = document.createElement('details');
    ipNote.className = 'avs-inspector-usage avs-inspector-ipnote avs-note';
    ipNote.style.cssText = `border-left:3px solid var(--bb-ink-faint);background:color-mix(in srgb, var(--bb-ink) 6%, transparent);color:var(--bb-ink-muted);`;
    const sum = document.createElement('summary');
    sum.className = 'avs-note-summary';
    const title = document.createElement('span');
    title.className = 'avs-note-title';
    title.innerHTML = uiIconSvg('info', 13) + ' ' + esc(t('privacy.ipSummary'));
    sum.appendChild(title);
    // Grant / withdraw the live-preview permission for this widget (Art. 7(3)
    // DSGVO: as easy to revoke as to give). Lives in the summary so it stays one
    // click away; stopPropagation keeps clicking it from toggling the fold.
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'bb-btn bb-btn-secondary avs-note-action';
    const syncLabel = () => {
      toggle.textContent = (isLivePreview(widget.id) ? '⏸ ' : '▶ ')
        + t(isLivePreview(widget.id) ? 'privacy.disableLive' : 'privacy.enableLive');
    };
    syncLabel();
    toggle.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (isLivePreview(widget.id)) disableLivePreview(widget.id);
      else enableLivePreview(widget.id);
      syncLabel(); // the canvas frame is re-rendered by the setter; just flip the label
    });
    sum.appendChild(toggle);
    ipNote.appendChild(sum);
    const detail = document.createElement('p');
    detail.className = 'avs-note-detail';
    detail.textContent = t('privacy.ipInspector', { provider });
    ipNote.appendChild(detail);
    host.querySelector('#ins-content').prepend(ipNote);
  }

  // Store-template content — a template embed (inserted via the Store's "Insert
  // as slide") carries the template's data-slot definitions. Offer per-slot JSON
  // editing in a modal with a live preview, plus a direct "send to display".
  if (widget.type === 'embed' && Array.isArray(widget.content?.slotDefs) && widget.content.slotDefs.length) {
    const tplWrap = document.createElement('div');
    tplWrap.className = 'avs-inspector-section';
    const count = widget.content.slotDefs.length;
    tplWrap.innerHTML = `<div class="avs-section-title">${uiIconSvg('sliders', 13)} ${t('inspector.editContent')}</div>
      <p class="bb-form-help">${t('content.editHelp')}</p>
      <button class="bb-btn bb-btn-primary" id="tpl-edit-content" style="width:100%;">${t('inspector.editContent')} (${count})</button>`;
    host.querySelector('.avs-inspector-body').appendChild(tplWrap);
    tplWrap.querySelector('#tpl-edit-content').addEventListener('click', () => openTemplateContentEditor(widget));
  }

  // On-error fallback (live/network widgets only) — what the display shows at
  // runtime if this widget can't load its data. Player-side only by design.
  // Declarative now: the fallback mode is a select and the mode-specific field
  // (image / message) is a `showIf` conditional — routed through the SAME tested
  // buildForm engine the widget's own content uses, instead of hand-wired
  // controls. The `section` field makes buildForm own the fold (same storage-key
  // convention as the other sections via fold-section.js).
  if (usesNetwork(plugin, widget.content)) {
    const oe = widget.onError ?? {};
    const errForm = buildForm({
      formKey: widget.type,
      schema: { fields: [
        { type: 'section', key: '_onerror', label: t('err.title'), help: t('err.help') },
        { key: 'mode', type: 'select', label: t('err.mode'), options: [
          { value: 'none', label: t('err.none') }, { value: 'hide', label: t('err.hide') },
          { value: 'image', label: t('err.image') }, { value: 'text', label: t('err.text') },
        ] },
        { key: 'image', type: 'asset', accept: 'image/*', label: t('err.imagePick'), showIf: c => c.mode === 'image' },
        { key: 'text', type: 'text', label: t('err.textLabel'), showIf: c => c.mode === 'text' },
      ] },
      value: { mode: oe.mode ?? 'none', image: oe.image ?? '', text: oe.text ?? '' },
      onChange: v => {
        widget.onError = v.mode === 'none'
          ? { mode: 'none' }
          : { mode: v.mode, ...(v.image && { image: v.image }), ...(v.text && { text: v.text }) };
        commit('widget-onerror');
      },
      assetPicker: async accept => await pickAsset(accept),
    });
    host.querySelector('.avs-inspector-body').appendChild(errForm.root);
  }

  // Background section (the general background tool) — repaints the bg layer
  // live, no plugin re-render. Foldable, default open.
  const { section: bgWrap, body: bgBody } = foldSection(widget.type, '_bg', t('bg.widgetTitle'));
  bgBody.innerHTML = '<div id="ins-bg"></div>';
  host.querySelector('.avs-inspector-body').appendChild(bgWrap);
  // The widget's own theme drives the "Theme background" fallback shown in the
  // bg editor — same UX as the slide editor.
  const widgetThemeId = widget.content?.theme;
  mountBackgroundEditor(bgWrap.querySelector('#ins-bg'), {
    get: () => widget.background,
    onChange: bg => { setWidgetBackground(widget.id, bg); commit('widget-bg'); },
    assetPicker: a => pickAsset(a),
    scope: 'widget',
    themeBg: widgetThemeId ? THEME_SWATCHES[widgetThemeId]?.bg : null,
  });

  // Animation section — entrance "build" (one-shot) + ambient "loop"
  // (continuous). Both are stored on the widget and rendered identically by the
  // live player; here the build replays on the canvas for instant feedback and
  // the loop is applied to the preview so it's WYSIWYG.
  //
  // Deliberately NOT routed through buildForm (unlike onError above): this editor
  // needs an action button (▶ preview) bound to the build field, a disable — not
  // just hide — of the timing inputs while build='none', and side-effects that
  // depend on WHICH field changed (previewWidgetBuild on build, applyWidgetLoop
  // on loop, a debounced commit on timing). buildForm's onChange reports the whole
  // value with no "changed field", so forcing this in would add change-diffing +
  // a bespoke button anyway. It stays imperative by design — same boundary as the
  // background editor (a rich picker) and the slot-binding rows (dynamic datalists).
  const anim = widget.anim ?? {};
  const buildType = anim.type ?? 'none';
  const delayS = Math.round(((anim.delay ?? 0) / 1000) * 100) / 100;
  const durS = Math.round(((anim.duration ?? BUILD_DEFAULT_MS) / 1000) * 100) / 100;
  const loopId = widget.loop ?? 'none';
  const { section: animWrap, body: animBody } = foldSection(widget.type, '_anim', t('insp.animation'));
  animWrap.classList.add('avs-anim-section');
  animBody.innerHTML = `
    <div class="bb-form-group">
      <label>${t('insp.anim.build')}</label>
      <div class="avs-anim-row">
        <select id="anim-type">
          ${WIDGET_BUILDS.map(b => `<option value="${b.id}" ${buildType === b.id ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}
        </select>
        <button class="avs-iconbtn" id="anim-play" type="button" title="${t('insp.anim.preview')}" ${buildType === 'none' ? 'disabled' : ''}>▶</button>
      </div>
    </div>
    <div class="avs-ss-grid avs-anim-timing" id="anim-timing">
      <label>${t('insp.anim.delay')}<input type="number" id="anim-delay" min="0" max="10" step="0.1" value="${delayS}"></label>
      <label>${t('insp.anim.duration')}<input type="number" id="anim-dur" min="0.1" max="5" step="0.1" value="${durS}"></label>
    </div>
    <div class="bb-form-group">
      <label>${t('insp.anim.loop')}</label>
      <select id="anim-loop">
        ${AMBIENT_EFFECTS.map(a => `<option value="${a.id}" ${loopId === a.id ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}
      </select>
    </div>
    <p class="bb-form-help">${t('insp.anim.help')}</p>`;
  host.querySelector('.avs-inspector-body').appendChild(animWrap);

  const animType = animWrap.querySelector('#anim-type');
  const animDelay = animWrap.querySelector('#anim-delay');
  const animDur = animWrap.querySelector('#anim-dur');
  const animPlay = animWrap.querySelector('#anim-play');
  const animLoop = animWrap.querySelector('#anim-loop');
  const animTiming = animWrap.querySelector('#anim-timing');
  const syncBuildEnabled = () => {
    const off = animType.value === 'none';
    animTiming.classList.toggle('avs-disabled', off);
    animDelay.disabled = animDur.disabled = animPlay.disabled = off;
  };
  const writeAnim = () => {
    if (animType.value === 'none') { delete widget.anim; return; }
    widget.anim = {
      type: animType.value,
      delay: Math.round(Math.min(10, Math.max(0, +animDelay.value || 0)) * 1000),
      duration: Math.round(Math.min(5, Math.max(0.1, +animDur.value || BUILD_DEFAULT_MS / 1000)) * 1000),
    };
  };
  animType.addEventListener('change', () => {
    writeAnim(); commit('widget-anim'); syncBuildEnabled();
    if (widget.anim) previewWidgetBuild(widget.id);
  });
  const onTiming = () => { writeAnim(); debounce(() => commit('widget-anim')); };
  animDelay.addEventListener('input', onTiming);
  animDur.addEventListener('input', onTiming);
  animPlay.addEventListener('click', () => { if (widget.anim) previewWidgetBuild(widget.id); });
  animLoop.addEventListener('change', () => {
    if (animLoop.value === 'none') delete widget.loop; else widget.loop = animLoop.value;
    commit('widget-loop'); applyWidgetLoop(widget.id);
  });
  syncBuildEnabled();

  // v3: Slot-Bindings section. Lets the editor wire any widget.content field
  // (by field-path) to a data slot. Player resolves at render time. Foldable
  // like its siblings, default open.
  const { section: bindWrap, body: bindBody } = foldSection(widget.type, '_bindings', t('binding.sectionTitle'), { icon: 'link' });
  bindBody.innerHTML = `<p class="bb-form-help">${t('binding.help')}</p>
    <div id="bind-list"></div>
    <div class="avs-flex-row" style="margin-top:6px;">
      <button class="bb-btn" id="bind-add">+ ${t('binding.link')}</button>
    </div>`;
  host.querySelector('.avs-inspector-body').appendChild(bindWrap);
  // Autocomplete field-paths from the widget's actual content keys. Helps
  // users discover bindable fields without having to read the plugin source.
  const fieldSuggestions = (() => {
    const out = [];
    const walk = (obj, prefix) => {
      if (!obj || typeof obj !== 'object') return;
      for (const k of Object.keys(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        const v = obj[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          walk(v, path);
        } else {
          out.push(path);
        }
        if (out.length > 40) return;
      }
    };
    walk(widget.content ?? {}, '');
    return out;
  })();
  const datalistId = `bind-fields-${widget.id}`;
  const slotListId = `bind-slots-${widget.id}`;
  bindWrap.insertAdjacentHTML('beforeend', `<datalist id="${datalistId}">${
    fieldSuggestions.map(f => `<option value="${esc(f)}">`).join('')
  }</datalist><datalist id="${slotListId}"></datalist>`);
  // Lazy-populate the slot-slug suggestions on first inspector mount. The
  // datalist is empty until then; the input still accepts free text.
  getSlotSlugs().then(slugs => {
    const dl = bindWrap.querySelector(`#${slotListId}`);
    if (dl) dl.innerHTML = slugs.map(s => `<option value="${esc(s)}">`).join('');
  });

  const renderBindings = () => {
    const list = bindWrap.querySelector('#bind-list');
    const b = widget.bindings ?? {};
    const keys = Object.keys(b);
    if (!keys.length) { list.innerHTML = `<p class="avs-muted">${t('binding.none')}</p>`; return; }
    list.innerHTML = keys.map(field => `
      <div class="avs-binding-editor" data-field="${esc(field)}">
        <label>${t('binding.field')}<input data-bk="field" value="${esc(field)}" placeholder="title" list="${datalistId}"></label>
        <label>${t('binding.slotSlug')}<input data-bk="slot" value="${esc(b[field].slot ?? '')}" placeholder="meine-daten" list="${slotListId}"></label>
        <label>${t('binding.jsonPath')}<input data-bk="jsonPath" value="${esc(b[field].jsonPath ?? '')}" placeholder="data.title"></label>
        <label>${t('binding.fallback')}<input data-bk="fallback" value="${esc(b[field].fallback ?? '')}" placeholder=""></label>
        <button class="bb-btn bb-btn-danger" data-bind-del="${esc(field)}" style="margin-top:6px;">${t('binding.unlink')}</button>
      </div>`).join('');
    list.querySelectorAll('.avs-binding-editor').forEach(row => {
      // The key this row currently owns in widget.bindings. Mutable: it
      // follows each successful rename so a char-by-char edit deletes its own
      // PREVIOUS key, not the long-gone original — which used to orphan one
      // stale binding per keystroke ('title' → 'titleX' → 'titleXY' left
      // 'titleX' behind forever).
      let prevKey = row.dataset.field;
      row.querySelectorAll('[data-bk]').forEach(inp => inp.addEventListener('input', () => {
        const fld = row.querySelector('[data-bk="field"]').value.trim();
        const slot = row.querySelector('[data-bk="slot"]').value.trim();
        const jsonPath = row.querySelector('[data-bk="jsonPath"]').value.trim();
        const fallback = row.querySelector('[data-bk="fallback"]').value;
        const next = { ...(widget.bindings ?? {}) };
        delete next[prevKey];
        if (fld && slot) {
          next[fld] = { slot, ...(jsonPath && { jsonPath }), ...(fallback !== '' && { fallback }) };
          prevKey = fld;
          row.dataset.field = fld;
        }
        widget.bindings = Object.keys(next).length ? next : undefined;
        debounce(() => { commit('widget-bindings'); refreshWidget(widget.id); });
      }));
      row.querySelector('[data-bind-del]').addEventListener('click', () => {
        const next = { ...(widget.bindings ?? {}) };
        delete next[prevKey];
        widget.bindings = Object.keys(next).length ? next : undefined;
        commit('widget-bindings'); refreshWidget(widget.id); renderBindings();
      });
    });
  };
  bindWrap.querySelector('#bind-add').addEventListener('click', () => {
    const next = { ...(widget.bindings ?? {}) };
    let i = 1;
    while (next['field' + i]) i++;
    next['field' + i] = { slot: '' };
    widget.bindings = next;
    commit('widget-bindings');
    renderBindings();
  });
  renderBindings();
}

