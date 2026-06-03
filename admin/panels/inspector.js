// Right panel — two parts:
//   mountSlideSettings(host)     always-visible slide-level controls
//   renderWidgetInspector(host)  the selected widget's properties (swaps with Library)

import { state, commit, subscribe, on } from '../store.js';
import { get as getPlugin } from '../../shared/plugins/registry.js';
import { buildForm } from '../ui/inspector.js';
import { isStored } from '../../shared/offline-data.js';
import { getControl } from '../ui/field-controls/registry.js';
import { widgetIcon } from '../../shared/data/widget-icons.js';
import { THEME_SWATCHES } from '../../shared/data/themes.js';
import { DESIGNS } from '../../shared/designs.js';
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
import { pickAsset, pickAssets } from '../ui/asset-library.js';
import { toast } from '../ui/toast.js';
import { t, tx } from '../i18n.js';
import { enterVariantEdit } from '../canvas/variant-ctx.js';
import { openTemplateContentEditor } from './template-editor.js';
import { slots as slotsApi } from '../api.js';

// Lazy slot-slug cache for the binding-inspector datalist. Populated on first
// inspector mount per session; invalidated by SSE data.changed/data.deleted
// events (main.js emits 'slots.changed' on the store bus; see below).
let _slotSlugCache = null;
async function getSlotSlugs() {
  if (_slotSlugCache) return _slotSlugCache;
  try {
    const r = await slotsApi.list();
    const list = Array.isArray(r) ? r : (r?.slots ?? r?.items ?? r?.data ?? []);
    _slotSlugCache = list.map(s => s.slug ?? s.name ?? s.id).filter(Boolean);
  } catch { _slotSlugCache = []; }
  return _slotSlugCache;
}

// On an SSE slot mutation, clear the cache so the next datalist population
// pulls fresh values from the server.
on('slots.changed', () => { _slotSlugCache = null; });

// Inline brand-kit form helpers used by per-slide and per-playlist editors.
function renderBrandKitForm(kit = {}) {
  const c = kit.colors ?? {};
  return `<div class="avs-brandkit-grid">
    <label>${t('brandkit.bg')}     <input type="color" data-bk="bg"     value="${c.bg ?? '#0f1218'}"></label>
    <label>${t('brandkit.fg')}     <input type="color" data-bk="fg"     value="${c.fg ?? '#f1f1f4'}"></label>
    <label>${t('brandkit.accent')} <input type="color" data-bk="accent" value="${c.accent ?? '#8b5cf6'}"></label>
    <label>${t('brandkit.font')}   <input type="text"  data-bk="font"   value="${kit.font ?? ''}" placeholder="Inter, sans-serif" style="grid-column:span 2;"></label>
  </div>`;
}
function readBrandKitForm(box) {
  return {
    colors: {
      bg: box.querySelector('[data-bk="bg"]').value,
      fg: box.querySelector('[data-bk="fg"]').value,
      accent: box.querySelector('[data-bk="accent"]').value,
    },
    font: box.querySelector('[data-bk="font"]').value.trim(),
  };
}

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
        <span class="avs-ss-trigger-icon" aria-hidden="true">⚙️</span>
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
      <button class="bb-btn bb-btn-secondary" id="sm-bg" type="button">🎨 ${t('bg.slideTitle')}</button>
      <button class="bb-btn bb-btn-secondary" id="sm-schedule" type="button">⏰ ${t('insp.schedule')}</button>
      <button class="bb-btn bb-btn-secondary" id="sm-brandkit" type="button">🎨 ${t('admin.brandkit')}</button>
    </div>
    <details class="avs-variants-details">
      <summary>🌐 ${t('variants.langs')} <span class="avs-variants-count" id="sm-lang-count">${esc(slide.langs ? Object.keys(slide.langs).length : 0)}</span></summary>
      <div id="sm-langs"></div>
      <div class="avs-flex-row" style="margin-top:6px;">
        <input id="sm-lang-input" placeholder="${t('variants.langPlaceholder')}" style="max-width:120px;">
        <button class="bb-btn" id="sm-lang-add" type="button">${t('variants.addLang')}</button>
      </div>
    </details>
    <details class="avs-variants-details">
      <summary>🎲 ${t('variants.ab')} <span class="avs-variants-count" id="sm-ab-count">${esc(Array.isArray(slide.abVariants) ? slide.abVariants.length : 0)}</span></summary>
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
    inner.innerHTML = renderBrandKitForm(slide.brandKit ?? {});
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
      slide.brandKit = readBrandKitForm(inner);
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
    host.innerHTML = list.map((v, i) => `
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

export function renderWidgetInspector(host) {
  host.classList.add('avs-inspector');
  const slide = activeSlide();
  const id = state.ui.selectedWidgetId;
  const widget = slide?.widgets.find(w => w.id === id);
  if (!widget) { host.innerHTML = `<div class="avs-inspector-empty">${t('insp.noWidget')}</div>`; return; }
  const plugin = getPlugin(widget.type);

  host.innerHTML = `
    <div class="avs-inspector-head">
      <button class="avs-inspector-back" id="ins-back" title="${t('insp.backToLibrary')}" aria-label="${t('insp.backToLibrary')}">
        <span class="avs-inspector-back-arrow" aria-hidden="true">←</span>
        <span class="avs-inspector-back-label">${t('insp.backToLibrary')}</span>
      </button>
      <span class="avs-inspector-title">${widgetIcon(widget.type, plugin?.icon ?? '◻', 18)} ${tx(plugin?.label ?? widget.type)}</span>
      <div class="avs-inspector-actions">
        <button class="avs-iconbtn" id="ins-reset" title="${t('insp.reset')}">↺</button>
        <button class="avs-iconbtn" id="ins-dup" title="${t('rail.duplicate')}">⧉</button>
        <button class="avs-iconbtn" id="ins-del" title="${t('rail.delete')}">🗑</button>
      </div>
    </div>
    <div class="avs-inspector-body">
      <div class="avs-geo-grid">
        ${['x', 'y', 'w', 'h'].map(k => `
          <label>${k.toUpperCase()}
            <input type="number" data-geo="${k}" min="0" max="100" step="0.5" value="${widget.rect[k]}">
          </label>`).join('')}
        <label>Z<input type="number" data-geo="z" min="0" step="1" value="${widget.z ?? 0}"></label>
        <label>R<input type="number" data-geo="rot" min="-180" max="180" step="1" value="${widget.rotation ?? 0}"></label>
      </div>
      <div class="avs-geo-presets" aria-label="${t('insp.layoutPresets')}">
        <button class="avs-geo-preset" data-preset="full"  title="${t('insp.preset.full')}">▣</button>
        <button class="avs-geo-preset" data-preset="left"  title="${t('insp.preset.left')}">◧</button>
        <button class="avs-geo-preset" data-preset="right" title="${t('insp.preset.right')}">◨</button>
        <button class="avs-geo-preset" data-preset="top"   title="${t('insp.preset.top')}">⬒</button>
        <button class="avs-geo-preset" data-preset="bot"   title="${t('insp.preset.bottom')}">⬓</button>
        <button class="avs-geo-preset" data-preset="center" title="${t('insp.preset.center')}">⊕</button>
        <button class="avs-geo-preset" data-preset="tl"  title="${t('insp.preset.tl')}">⌜</button>
        <button class="avs-geo-preset" data-preset="tr"  title="${t('insp.preset.tr')}">⌝</button>
        <button class="avs-geo-preset" data-preset="bl"  title="${t('insp.preset.bl')}">⌞</button>
        <button class="avs-geo-preset" data-preset="br"  title="${t('insp.preset.br')}">⌟</button>
      </div>
      <div class="avs-inspector-content" id="ins-content"></div>
    </div>`;

  host.querySelector('#ins-back').addEventListener('click', () => { state.ui.selectedWidgetId = null; });
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
  // Geometry presets — quick alternatives to typing X/Y/W/H by hand.
  // All values are percentages of the slide; corner presets use 33% boxes
  // so two corner widgets side-by-side leave space for a third.
  const PRESETS = {
    full:   { x: 0,    y: 0,    w: 100, h: 100 },
    left:   { x: 0,    y: 0,    w: 50,  h: 100 },
    right:  { x: 50,   y: 0,    w: 50,  h: 100 },
    top:    { x: 0,    y: 0,    w: 100, h: 50 },
    bot:    { x: 0,    y: 50,   w: 100, h: 50 },
    center: { x: 25,   y: 25,   w: 50,  h: 50 },
    tl:     { x: 0,    y: 0,    w: 33,  h: 33 },
    tr:     { x: 67,   y: 0,    w: 33,  h: 33 },
    bl:     { x: 0,    y: 67,   w: 33,  h: 33 },
    br:     { x: 67,   y: 67,   w: 33,  h: 33 },
  };
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
    });
  });
  // Per-widget title field removed: titles are now their own Text widget
  // (gives full WYSIWYG control over size/colour/font/alignment, can be
  // placed anywhere on the slide). Legacy widgets with widget.title still
  // render their h1 in the plugins for backward compatibility.
  host.querySelectorAll('[data-geo]').forEach(inp => inp.addEventListener('input', () => {
    const k = inp.dataset.geo;
    if (k === 'z') { widget.z = +inp.value || 0; setWidgetGeometry(widget.id, widget.rect); }
    else if (k === 'rot') { setWidgetRotation(widget.id, +inp.value || 0); }
    else setWidgetGeometry(widget.id, { ...widget.rect, [k]: +inp.value });
    commit('widget-geo');
  }));

  const form = buildForm({
    schema: plugin.schema(),
    value: widget.content ?? plugin.defaults(),
    // Used as a storage-key prefix so each widget type remembers its own
    // collapsed-section state. Without it, every inspector re-render would
    // reset the user's folding.
    formKey: widget.type,
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

  // Usage / licensing note. The library shows a quiet corner glyph BEFORE the
  // widget is picked; here — once it's placed — we repeat the full constraint
  // so the operator doesn't have to remember why the tile was flagged. Only
  // the constraint tiers get a note; business-ok stays silent (no news is good
  // news). Data comes straight off plugin.usage (see shared/plugin-contract.js).
  const usage = plugin?.usage;
  if (usage && (usage.tier === 'byo-key' || usage.tier === 'private-only')) {
    const tok = 'var(--bb-warn)';
    const tierKey = usage.tier === 'byo-key' ? 'usage.byoKey' : 'usage.privateOnly';
    const note = document.createElement('div');
    note.className = 'avs-inspector-usage';
    note.style.cssText = `margin:0 0 10px;padding:8px 10px;border-radius:var(--bb-r-md,8px);`
      + `border-left:3px solid ${tok};background:color-mix(in srgb, ${tok} 10%, transparent);`
      + `font-size:11px;line-height:1.5;`;
    const rows = [`<div style="font-weight:600;">${esc(t(tierKey))}</div>`];
    if (usage.note) rows.push(`<div style="opacity:.85;margin-top:2px;">${esc(usage.note)}</div>`);
    if (usage.attribution) rows.push(`<div style="opacity:.7;margin-top:4px;">${esc(usage.attribution)}</div>`);
    if (usage.providerTerms && /^https:\/\//i.test(usage.providerTerms)) {
      rows.push(`<div style="margin-top:6px;"><a href="${esc(usage.providerTerms)}" target="_blank" rel="noopener noreferrer" style="color:${tok};text-decoration:underline;">${esc(t('usage.terms'))} ↗</a></div>`);
    }
    note.innerHTML = rows.join('');
    // Sits at the very top of the widget's own settings so the constraint is
    // the first thing seen when editing a flagged widget.
    host.querySelector('#ins-content').prepend(note);
  }

  // Data-protection note (DSGVO): any network widget transmits the rendering
  // device's IP to a third party when it loads its live data. Surface it on
  // every network widget — not only the ones carrying a licensing tier.
  if (plugin?.network) {
    const provider = usage?.attribution || t('privacy.providerGeneric');
    const ipNote = document.createElement('div');
    ipNote.className = 'avs-inspector-usage avs-inspector-ipnote';
    ipNote.style.cssText = `margin:0 0 10px;padding:8px 10px;border-radius:var(--bb-r-md,8px);`
      + `border-left:3px solid var(--bb-ink-faint);background:color-mix(in srgb, var(--bb-ink) 6%, transparent);`
      + `font-size:11px;line-height:1.5;color:var(--bb-ink-muted);`;
    const msg = document.createElement('div');
    msg.textContent = '🛈 ' + t('privacy.ipInspector', { provider });
    ipNote.appendChild(msg);
    // Grant / withdraw the live-preview permission for this widget (Art. 7(3)
    // DSGVO: as easy to revoke as to give). Label reflects the current state.
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'bb-btn bb-btn-secondary';
    toggle.style.cssText = 'margin-top:6px;font-size:11px;';
    const syncLabel = () => {
      toggle.textContent = (isLivePreview(widget.id) ? '⏸ ' : '▶ ')
        + t(isLivePreview(widget.id) ? 'privacy.disableLive' : 'privacy.enableLive');
    };
    syncLabel();
    toggle.addEventListener('click', () => {
      if (isLivePreview(widget.id)) disableLivePreview(widget.id);
      else enableLivePreview(widget.id);
      syncLabel(); // the canvas frame is re-rendered by the setter; just flip the label
    });
    ipNote.appendChild(toggle);
    host.querySelector('#ins-content').prepend(ipNote);
  }

  // Store-template content — a template embed (inserted via the Store's "Insert
  // as slide") carries the template's data-slot definitions. Offer per-slot JSON
  // editing in a modal with a live preview, plus a direct "send to display".
  if (widget.type === 'embed' && Array.isArray(widget.content?.slotDefs) && widget.content.slotDefs.length) {
    const tplWrap = document.createElement('div');
    tplWrap.className = 'avs-inspector-section';
    const count = widget.content.slotDefs.length;
    tplWrap.innerHTML = `<div class="avs-section-title">🎛 ${t('inspector.editContent')}</div>
      <p class="bb-form-help">${t('content.editHelp')}</p>
      <button class="bb-btn bb-btn-primary" id="tpl-edit-content" style="width:100%;">${t('inspector.editContent')} (${count})</button>`;
    host.querySelector('.avs-inspector-body').appendChild(tplWrap);
    tplWrap.querySelector('#tpl-edit-content').addEventListener('click', () => openTemplateContentEditor(widget));
  }

  // On-error fallback (live/network widgets only) — what the display shows at
  // runtime if this widget can't load its data. Player-side only by design.
  if (plugin?.network) {
    const errWrap = document.createElement('div');
    errWrap.className = 'avs-inspector-section';
    errWrap.innerHTML = `<div class="avs-section-title">${t('err.title')}</div>
      <p class="bb-form-help">${t('err.help')}</p>`;
    const modeGroup = document.createElement('div');
    modeGroup.className = 'bb-form-group';
    const modeSel = document.createElement('select');
    [['none', 'err.none'], ['hide', 'err.hide'], ['image', 'err.image'], ['text', 'err.text']].forEach(([v, k]) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = t(k);
      if ((widget.onError?.mode ?? 'none') === v) o.selected = true;
      modeSel.appendChild(o);
    });
    modeGroup.appendChild(modeSel);
    const extra = document.createElement('div');
    extra.className = 'bb-form-group';
    const renderExtra = () => {
      extra.replaceChildren();
      const m = widget.onError?.mode ?? 'none';
      if (m === 'image') {
        const lbl = document.createElement('label'); lbl.textContent = t('err.imagePick');
        const field = document.createElement('div'); field.className = 'bb-asset-field';
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = widget.onError?.image ?? '';
        inp.placeholder = t('err.imagePick');
        inp.addEventListener('input', () => { widget.onError = { ...widget.onError, image: inp.value }; commit('widget-onerror'); });
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'bb-btn bb-btn-secondary'; btn.textContent = '📁';
        btn.addEventListener('click', async () => { const url = await pickAsset('image'); if (url) { inp.value = url; widget.onError = { ...widget.onError, image: url }; commit('widget-onerror'); } });
        field.append(inp, btn);
        extra.append(lbl, field);
      } else if (m === 'text') {
        const lbl = document.createElement('label'); lbl.textContent = t('err.textLabel');
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = widget.onError?.text ?? '';
        inp.addEventListener('input', () => { widget.onError = { ...widget.onError, text: inp.value }; commit('widget-onerror'); });
        extra.append(lbl, inp);
      }
    };
    modeSel.addEventListener('change', () => {
      widget.onError = { ...(widget.onError || {}), mode: modeSel.value };
      if (modeSel.value === 'none') widget.onError = { mode: 'none' };
      renderExtra(); commit('widget-onerror');
    });
    renderExtra();
    errWrap.append(modeGroup, extra);
    host.querySelector('.avs-inspector-body').appendChild(errWrap);
  }

  // Background section (the general background tool) — repaints the bg layer
  // live, no plugin re-render.
  const bgWrap = document.createElement('div');
  bgWrap.className = 'avs-inspector-section';
  bgWrap.innerHTML = `<div class="avs-section-title">${t('bg.widgetTitle')}</div><div id="ins-bg"></div>`;
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
  const anim = widget.anim ?? {};
  const buildType = anim.type ?? 'none';
  const delayS = Math.round(((anim.delay ?? 0) / 1000) * 100) / 100;
  const durS = Math.round(((anim.duration ?? BUILD_DEFAULT_MS) / 1000) * 100) / 100;
  const loopId = widget.loop ?? 'none';
  const animWrap = document.createElement('div');
  animWrap.className = 'avs-inspector-section avs-anim-section';
  animWrap.innerHTML = `
    <div class="avs-section-title">${t('insp.animation')}</div>
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
  // (by field-path) to a data slot. Player resolves at render time.
  const bindWrap = document.createElement('div');
  bindWrap.className = 'avs-inspector-section';
  bindWrap.innerHTML = `<div class="avs-section-title">🔗 ${t('binding.sectionTitle')}</div>
    <p class="bb-form-help">${t('binding.help')}</p>
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
      const field = row.dataset.field;
      row.querySelectorAll('[data-bk]').forEach(inp => inp.addEventListener('input', () => {
        const fld = row.querySelector('[data-bk="field"]').value.trim();
        const slot = row.querySelector('[data-bk="slot"]').value.trim();
        const jsonPath = row.querySelector('[data-bk="jsonPath"]').value.trim();
        const fallback = row.querySelector('[data-bk="fallback"]').value;
        const next = { ...(widget.bindings ?? {}) };
        delete next[field];
        if (fld && slot) next[fld] = { slot, ...(jsonPath && { jsonPath }), ...(fallback !== '' && { fallback }) };
        widget.bindings = Object.keys(next).length ? next : undefined;
        debounce(() => { commit('widget-bindings'); refreshWidget(widget.id); });
      }));
      row.querySelector('[data-bind-del]').addEventListener('click', () => {
        const next = { ...(widget.bindings ?? {}) };
        delete next[field];
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

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
