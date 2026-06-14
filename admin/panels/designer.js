// Widget Designer (general) — a full-screen, WYSIWYG design surface for ANY
// widget. Where the inline inspector shows the controls in a narrow column,
// the Designer gives the widget a large live stage plus the full set of
// controls, with device-format previews (landscape / portrait / TV) so a
// design can be checked across the screens signage actually runs on.
//
// It renders through the SAME mountWidget path as the canvas and player, so the
// preview is exactly what ships. Edits go to a WORKING COPY of widget.content;
// nothing touches the real widget until "Done" (Cancel discards) — which makes
// the Designer a safe place to experiment.
//
// This is the "Ebene ②" of the staged design model (Inspector → Designer →
// Custom/Code). The custom-widget template editor (widget-designer.js) is the
// deepest tier and keeps its own launcher for `type === 'custom'`.

import { openModal } from '../ui/modal.js';
import { buildForm } from '../ui/inspector.js';
import { mountWidget } from '../../shared/widget-host.js';
import { isStored } from '../../shared/offline-data.js';
import { isLivePreview, enableLivePreview } from '../canvas/canvas.js';
import { get as getPlugin } from '../../shared/plugins/registry.js';
import { THEME_SWATCHES } from '../../shared/data/themes.js';
import { pickAsset, pickAssets } from '../ui/asset-library.js';
import { escapeHtml } from '../../shared/utils/escape.js';
import { t, tx } from '../i18n.js';

const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

// Preview stage formats. 'slide' resolves to the playlist canvas ratio (passed
// in by the caller); the rest are the common signage orientations — landscape,
// portrait, square, ultrawide — so a single design can be checked on every
// screen it might run on. Widget typography tracks the box via cqmin, so simply
// resizing the stage shows exactly how the design adapts.
const FORMATS = [
  { id: 'slide', label: 'Match slide' },
  { id: '16/9',  label: '16:9' },
  { id: '9/16',  label: '9:16' },
  { id: '1/1',   label: '1:1' },
  { id: '21/9',  label: '21:9' },
];
const STAGE_PAD = 18; // keep in sync with .avs-dz-stage padding
const STAGE_GAP = 16; // gap between the two panes in split mode

let _seq = 0;

export function openDesigner(widget, { onApply, slideRatio } = {}) {
  const plugin = getPlugin(widget.type);
  const looks = (typeof plugin?.looks === 'function' ? plugin.looks() : null) || [];
  const hasLooks = looks.length > 0;
  const slideR = (slideRatio && slideRatio > 0) ? slideRatio : 16 / 9;
  // Working copy — nothing touches the real widget until Done.
  let working = clone(widget.content ?? plugin?.defaults?.() ?? {});
  let currentFmt = 'slide';

  const parseRatio = (id) => {
    if (id === 'slide') return slideR;
    const [a, b] = id.split('/').map(Number);
    return (a > 0 && b > 0) ? a / b : 16 / 9;
  };

  const body = document.createElement('div');
  body.className = 'avs-dz';
  body.innerHTML = `
    <div class="avs-dz-grid">
      <div class="avs-dz-stagewrap">
        <div class="avs-dz-toolbar">
          <div class="avs-dz-formats">
            ${FORMATS.map((f, i) => `<button type="button" class="avs-dz-fmt${i === 0 ? ' avs-on' : ''}" data-fmt="${escapeHtml(f.id)}">${escapeHtml(tx(f.label))}</button>`).join('')}
          </div>
          <button type="button" class="avs-dz-split" id="dz-split" aria-pressed="false" title="${escapeHtml(tx('Show both orientations side by side'))}">⊟ ${escapeHtml(tx('Split'))}</button>
          <span class="avs-dz-tb-spacer"></span>
          <label class="avs-dz-tb-theme">${escapeHtml(tx('Theme'))}
            <select id="dz-theme">
              <option value="">${escapeHtml(tx('Widget theme'))}</option>
              ${Object.keys(THEME_SWATCHES).map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('')}
            </select>
          </label>
          <div class="avs-dz-zoom" role="group" aria-label="${escapeHtml(tx('Zoom'))}">
            <button type="button" data-zoom="out" aria-label="${escapeHtml(tx('Zoom out'))}">−</button>
            <span id="dz-zoom-label">100%</span>
            <button type="button" data-zoom="in" aria-label="${escapeHtml(tx('Zoom in'))}">+</button>
          </div>
        </div>
        <div class="avs-dz-stage"></div>
      </div>
      <div class="avs-dz-side">
        <div class="avs-dz-sidetabs">
          <button type="button" class="avs-dz-sidetab avs-on" data-side="design">${escapeHtml(tx('Settings'))}</button>
          ${hasLooks ? `<button type="button" class="avs-dz-sidetab" data-side="looks">${escapeHtml(tx('Looks'))}</button>` : ''}
        </div>
        <div class="avs-dz-sidepane" data-pane="design"><div class="avs-dz-form" id="dz-form"></div></div>
        ${hasLooks ? '<div class="avs-dz-sidepane" data-pane="looks" hidden><div id="dz-looks"></div></div>' : ''}
      </div>
    </div>`;

  injectStylesOnce();

  const stage = body.querySelector('.avs-dz-stage');
  const formHost = body.querySelector('#dz-form');

  // ---- preview state ----
  let themeOverride = null;   // null = use the widget's own content.theme
  let zoom = 1;
  let split = false;
  let panes = [];             // current pane host elements
  const previewDisposers = [];
  let previewTimer = null;

  const transpose = r => (r > 0 ? 1 / r : r);

  const clearPanes = () => {
    while (previewDisposers.length) { try { previewDisposers.pop()(); } catch { /* ignore */ } }
    panes = [];
    stage.replaceChildren();
  };

  // px sizes (not CSS aspect-ratio) so the widget's cqmin typography computes
  // against a real box; letterbox the ratio into the available area.
  const fitInto = (host, ratio, availW, availH) => {
    let w = availW, h = availW / ratio;
    if (h > availH) { h = availH; w = availH * ratio; }
    host.style.width = `${Math.round(w)}px`;
    host.style.height = `${Math.round(h)}px`;
  };

  const mountInto = (host) => {
    host.className = `avs-dz-preview bb-theme-${themeOverride ?? working.theme ?? 'minimal-dark'}`;
    // Mirror the canvas privacy gate: a network widget that would fetch live
    // data does NOT auto-fetch in the designer. Offer one-click consent (the
    // inspector's IP-note model) so the design can still be previewed.
    if (plugin?.network && !isStored(working) && !isLivePreview(widget.id)) {
      const note = document.createElement('div');
      note.className = 'avs-dz-note';
      const msg = document.createElement('div');
      msg.textContent = tx('Live preview is off for this widget.');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bb-btn bb-btn-secondary';
      btn.style.marginTop = '10px';
      btn.textContent = '▶ ' + t('privacy.enableLive');
      btn.addEventListener('click', () => { enableLivePreview(widget.id); paintAll(); });
      note.append(msg, btn);
      host.appendChild(note);
      return;
    }
    const temp = { ...widget, id: `dz_${++_seq}`, content: working };
    previewDisposers.push(mountWidget(temp, { duration: 10 }, host, { mode: 'preview', t: k => k }));
  };

  const applyZoom = () => { for (const p of panes) p.style.transform = `scale(${zoom})`; };

  const ratiosFor = () => {
    const baseR = parseRatio(currentFmt);
    return split ? [baseR, transpose(baseR)] : [baseR];
  };

  // Build the stage: one pane, or two (format + its transpose) in split mode.
  const paintAll = () => {
    clearPanes();
    const availW = Math.max(0, stage.clientWidth - STAGE_PAD * 2);
    const availH = Math.max(0, stage.clientHeight - STAGE_PAD * 2);
    if (!availW || !availH) return;
    const ratios = ratiosFor();
    const perW = split ? Math.max(0, (availW - STAGE_GAP) / 2) : availW;
    for (const r of ratios) {
      const host = document.createElement('div');
      panes.push(host);
      stage.appendChild(host);
      fitInto(host, r, perW, availH);
      mountInto(host);
    }
    applyZoom();
  };

  // Re-letterbox existing panes without re-mounting (resize / open-anim settle).
  const refit = () => {
    if (!panes.length) { paintAll(); return; }
    const availW = Math.max(0, stage.clientWidth - STAGE_PAD * 2);
    const availH = Math.max(0, stage.clientHeight - STAGE_PAD * 2);
    if (!availW || !availH) return;
    const ratios = ratiosFor();
    const perW = split ? Math.max(0, (availW - STAGE_GAP) / 2) : availW;
    panes.forEach((host, i) => fitInto(host, ratios[i] ?? ratios[0], perW, availH));
  };
  const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(paintAll, 120); };

  // ---- toolbar handlers ----
  body.querySelectorAll('.avs-dz-fmt').forEach(btn => btn.addEventListener('click', () => {
    body.querySelectorAll('.avs-dz-fmt').forEach(b => b.classList.toggle('avs-on', b === btn));
    currentFmt = btn.dataset.fmt;
    paintAll();
  }));
  const splitBtn = body.querySelector('#dz-split');
  splitBtn.addEventListener('click', () => {
    split = !split;
    splitBtn.classList.toggle('avs-on', split);
    splitBtn.setAttribute('aria-pressed', String(split));
    paintAll();
  });
  body.querySelector('#dz-theme').addEventListener('change', e => {
    themeOverride = e.target.value || null;
    paintAll();
  });
  const zoomLabel = body.querySelector('#dz-zoom-label');
  body.querySelectorAll('[data-zoom]').forEach(btn => btn.addEventListener('click', () => {
    const next = zoom + (btn.dataset.zoom === 'in' ? 0.25 : -0.25);
    zoom = Math.max(0.5, Math.min(2, Math.round(next * 100) / 100));
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    applyZoom();
  }));

  // ---- the full form (all fields, same buildForm as the inspector) ----
  // schema(working) so a content-driven schema (custom widget) reacts; built-in
  // plugins ignore the argument. Wrapped in mountForm() so applying a Look (which
  // mutates `working`) can rebuild the controls to show the new values — the
  // form has no deep external-update path.
  let form = null;
  const mountForm = () => {
    form?.dispose?.();
    formHost.replaceChildren();
    form = buildForm({
      schema: plugin.schema(working),
      value: working,
      defaults: plugin.defaults?.(),
      formKey: widget.type,
      // The Designer is the place for everything — show basic AND advanced fields.
      tierFilter: 'all',
      onChange: v => { working = v; schedulePreview(); },
      assetPicker: async accept => await pickAsset(accept),
      assetsPicker: async accept => await pickAssets(accept),
    });
    formHost.appendChild(form.root);
  };
  mountForm();

  // ---- direct manipulation bridge (hover + click) ----
  // Plugins annotate rendered elements with data-field="key1 key2 …" (the keys
  // that drive the element; first = primary). buildForm tags each control group
  // with data-field-key. Hover a control → glow the element(s) it drives; click
  // an element → focus its primary control. Delegated on the stable stage + form
  // hosts so it survives re-paints (incl. split panes). Unannotated widgets opt
  // out — nothing breaks.
  const fieldTokens = el => (el.getAttribute('data-field') || '').split(/\s+/).filter(Boolean);
  const cssEscape = k => (window.CSS && CSS.escape) ? CSS.escape(k) : String(k).replace(/"/g, '\\"');
  const glowFor = (key, on) => {
    stage.querySelectorAll('[data-field]').forEach(el => {
      if (fieldTokens(el).includes(key)) el.classList.toggle('avs-dz-hl', on);
    });
  };
  formHost.addEventListener('mouseover', e => {
    const grp = e.target.closest('[data-field-key]');
    if (grp && formHost.contains(grp)) glowFor(grp.dataset.fieldKey, true);
  });
  formHost.addEventListener('mouseout', e => {
    const grp = e.target.closest('[data-field-key]');
    if (grp && formHost.contains(grp)) glowFor(grp.dataset.fieldKey, false);
  });
  stage.addEventListener('click', e => {
    const el = e.target.closest('[data-field]');
    if (!el || !stage.contains(el)) return;
    const key = fieldTokens(el)[0];
    if (!key) return;
    const grp = formHost.querySelector(`[data-field-key="${cssEscape(key)}"]`);
    if (!grp) return;
    grp.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Focus the actual control, not the hover-revealed ↺ reset button.
    grp.querySelector('input, select, textarea, [contenteditable], button:not(.bb-field-reset)')?.focus?.();
    grp.classList.remove('avs-dz-flash'); void grp.offsetWidth; grp.classList.add('avs-dz-flash');
  });

  // ---- Looks gallery (Phase 4) — curated starting points as live thumbnails ----
  const looksHost = body.querySelector('#dz-looks');
  const looksDisposers = [];
  const clearLooks = () => { while (looksDisposers.length) { try { looksDisposers.pop()(); } catch { /* ignore */ } } };
  const renderLooks = () => {
    if (!looksHost) return;
    clearLooks();
    looksHost.replaceChildren();
    const intro = document.createElement('p');
    intro.className = 'bb-form-help';
    intro.textContent = tx('Pick a starting look, then fine-tune — your text and colours are kept.');
    looksHost.appendChild(intro);
    const grid = document.createElement('div');
    grid.className = 'avs-dz-looks-grid';
    looksHost.appendChild(grid);
    const gated = plugin?.network && !isStored(working) && !isLivePreview(widget.id);
    for (const look of looks) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'avs-dz-look';
      const thumb = document.createElement('div');
      thumb.className = `avs-dz-look-thumb bb-theme-${themeOverride ?? working.theme ?? 'minimal-dark'}`;
      const name = document.createElement('div');
      name.className = 'avs-dz-look-name';
      name.textContent = tx(look.name);
      card.append(thumb, name);
      grid.appendChild(card);
      if (gated) {
        thumb.classList.add('avs-dz-look-thumb-empty');
        thumb.textContent = '◻';
      } else {
        const temp = { ...widget, id: `dzl_${++_seq}`, content: { ...working, ...look.patch } };
        looksDisposers.push(mountWidget(temp, { duration: 10 }, thumb, { mode: 'preview', t: k => k }));
      }
      card.addEventListener('click', () => {
        working = { ...working, ...clone(look.patch) };
        mountForm();        // reflect the patch in the controls
        paintAll();         // update the big stage
        switchSide('design'); // surface the controls the user can now tweak
      });
    }
  };

  // ---- side tabs (Settings / Looks / …) ----
  const switchSide = (which) => {
    body.querySelectorAll('.avs-dz-sidetab').forEach(b => b.classList.toggle('avs-on', b.dataset.side === which));
    body.querySelectorAll('.avs-dz-sidepane').forEach(p => { p.hidden = p.dataset.pane !== which; });
    if (which === 'looks') renderLooks();
  };
  body.querySelectorAll('.avs-dz-sidetab').forEach(btn => btn.addEventListener('click', () => switchSide(btn.dataset.side)));

  const onResize = () => { refit(); };

  return openModal({
    title: `🎨 ${tx('Widget Designer')} · ${tx(plugin?.label ?? widget.type)}`,
    body,
    actions: [
      { label: t('common.cancel') },
      { label: t('common.done'), kind: 'primary', value: 'apply' },
    ],
    onMount: card => {
      card.classList.add('avs-dz-modal');
      // Card is in the document now → the stage already has its layout size, so
      // paint immediately. A short follow-up re-fit catches the case where the
      // open animation changes the final box. (Avoid requestAnimationFrame for
      // the first paint: in a backgrounded/headless tab rAF can be paused.)
      paintAll();
      setTimeout(refit, 220);
      window.addEventListener('resize', onResize);
    },
  }).then(result => {
    window.removeEventListener('resize', onResize);
    clearTimeout(previewTimer);
    clearPanes();
    clearLooks();
    form?.dispose?.();
    if (result === 'apply') {
      widget.content = working;
      onApply?.();
    }
    return result;
  });
}

let _stylesInjected = false;
function injectStylesOnce() {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'avs-dz-styles';
  style.textContent = `
    .avs-dz-modal { width: 96vw; max-width: 1400px; }
    .avs-dz-grid { display: grid; grid-template-columns: minmax(0,1fr) 380px; gap: 16px; align-items: stretch; height: min(78vh, 780px); }
    .avs-dz-stagewrap { display: flex; flex-direction: column; min-width: 0; }
    /* nowrap + horizontal scroll so the toolbar always stays one row tall and
       never steals the stage's height at narrow widths. */
    .avs-dz-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: nowrap; overflow-x: auto; flex: 0 0 auto; padding-bottom: 2px; }
    .avs-dz-toolbar > * { flex: 0 0 auto; }
    .avs-dz-tb-spacer { flex: 1 1 auto !important; min-width: 4px; }
    .avs-dz-formats { display: flex; gap: 4px; }
    .avs-dz-fmt, .avs-dz-split { padding: 4px 10px; border-radius: 6px; border: 1px solid var(--bb-border,#333); background: transparent; color: var(--bb-ink-muted,#aaa); cursor: pointer; font-size: 12px; }
    .avs-dz-fmt.avs-on, .avs-dz-split.avs-on { background: var(--bb-bg-2,#1a1d24); color: var(--bb-ink,#eee); border-color: var(--bb-accent,#8b5cf6); }
    .avs-dz-tb-theme { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; opacity: .75; }
    .avs-dz-tb-theme select { text-transform: none; letter-spacing: 0; font-size: 12px; padding: 3px 6px; }
    .avs-dz-zoom { display: inline-flex; align-items: center; gap: 4px; }
    .avs-dz-zoom button { width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--bb-border,#333); background: transparent; color: var(--bb-ink,#eee); cursor: pointer; font-size: 14px; line-height: 1; }
    .avs-dz-zoom span { font-size: 12px; min-width: 38px; text-align: center; font-variant-numeric: tabular-nums; opacity: .8; }
    .avs-dz-stage { flex: 1 1 auto; min-height: 200px; display: flex; align-items: center; justify-content: center; gap: ${STAGE_GAP}px; padding: ${STAGE_PAD}px; overflow: hidden; border: 1px solid var(--bb-border,#333); border-radius: 10px; background: color-mix(in srgb, var(--bb-ink,#888) 7%, transparent); background-image: linear-gradient(45deg, color-mix(in srgb, var(--bb-ink,#888) 5%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--bb-ink,#888) 5%, transparent) 75%), linear-gradient(45deg, color-mix(in srgb, var(--bb-ink,#888) 5%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--bb-ink,#888) 5%, transparent) 75%); background-size: 24px 24px; background-position: 0 0, 12px 12px; }
    .avs-dz-preview { flex: 0 0 auto; border-radius: 8px; overflow: hidden; position: relative; background: var(--bb-st-bg,#0f1218); box-shadow: 0 8px 34px rgba(0,0,0,.4); }
    .avs-dz-note { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; font-size: 13px; color: var(--bb-ink-muted,#aaa); }
    .avs-dz-side { min-width: 0; display: flex; flex-direction: column; min-height: 0; }
    .avs-dz-sidetabs { display: flex; gap: 4px; margin-bottom: 8px; flex: 0 0 auto; }
    .avs-dz-sidetab { padding: 5px 12px; border-radius: 7px; border: 1px solid var(--bb-border,#333); background: transparent; color: var(--bb-ink-muted,#aaa); cursor: pointer; font-size: 13px; }
    .avs-dz-sidetab.avs-on { background: var(--bb-bg-2,#1a1d24); color: var(--bb-ink,#eee); border-color: var(--bb-accent,#8b5cf6); }
    .avs-dz-sidepane { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-right: 4px; }
    .avs-dz-looks-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
    .avs-dz-look { display: flex; flex-direction: column; gap: 6px; padding: 6px; border: 1px solid var(--bb-border,#333); border-radius: 9px; background: transparent; cursor: pointer; text-align: center; }
    .avs-dz-look:hover { border-color: var(--bb-accent,#8b5cf6); }
    .avs-dz-look-thumb { width: 100%; aspect-ratio: 16/9; border-radius: 6px; overflow: hidden; position: relative; background: var(--bb-st-bg,#0f1218); }
    .avs-dz-look-thumb-empty { display: flex; align-items: center; justify-content: center; color: var(--bb-ink-muted,#888); font-size: 22px; }
    .avs-dz-look-name { font-size: 12px; color: var(--bb-ink,#ddd); }
    /* direct-manipulation bridge */
    .avs-dz-preview [data-field] { cursor: pointer; }
    .avs-dz-preview [data-field]:hover { outline: 1px dashed color-mix(in srgb, var(--bb-accent,#8b5cf6) 70%, transparent); outline-offset: 2px; }
    .avs-dz-hl { outline: 2px solid var(--bb-accent,#8b5cf6) !important; outline-offset: 2px; border-radius: 3px; }
    .avs-dz-form [data-field-key].avs-dz-flash { animation: avs-dz-flash 1.1s ease; }
    @keyframes avs-dz-flash { 0%, 100% { background: transparent; } 15% { background: color-mix(in srgb, var(--bb-accent,#8b5cf6) 26%, transparent); } }
    @media (max-width: 860px) {
      .avs-dz-grid { grid-template-columns: 1fr; height: auto; }
      .avs-dz-stage { height: 46vh; }
      .avs-dz-side { max-height: 40vh; }
    }
  `;
  document.head.appendChild(style);
}
