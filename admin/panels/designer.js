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

let _seq = 0;

export function openDesigner(widget, { onApply, slideRatio } = {}) {
  const plugin = getPlugin(widget.type);
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
          <span class="avs-dz-tb-label">${escapeHtml(tx('Format'))}</span>
          <div class="avs-dz-formats">
            ${FORMATS.map((f, i) => `<button type="button" class="avs-dz-fmt${i === 0 ? ' avs-on' : ''}" data-fmt="${escapeHtml(f.id)}">${escapeHtml(tx(f.label))}</button>`).join('')}
          </div>
        </div>
        <div class="avs-dz-stage">
          <div class="avs-dz-preview" id="dz-preview"></div>
        </div>
      </div>
      <div class="avs-dz-side">
        <div class="avs-dz-form" id="dz-form"></div>
      </div>
    </div>`;

  injectStylesOnce();

  const stage = body.querySelector('.avs-dz-stage');
  const previewHost = body.querySelector('#dz-preview');
  const formHost = body.querySelector('#dz-form');

  // ---- preview sizing: letterbox the stage to the chosen ratio (px so the
  // widget's cqmin sizing computes against a real box) ----
  const fitPreview = () => {
    const availW = Math.max(0, stage.clientWidth - STAGE_PAD * 2);
    const availH = Math.max(0, stage.clientHeight - STAGE_PAD * 2);
    if (!availW || !availH) return;
    const r = parseRatio(currentFmt);
    let w = availW, h = availW / r;
    if (h > availH) { h = availH; w = availH * r; }
    previewHost.style.width = `${Math.round(w)}px`;
    previewHost.style.height = `${Math.round(h)}px`;
  };

  // ---- live preview (debounced, same render path as canvas/player) ----
  let previewDispose = null;
  let previewTimer = null;
  const renderPreview = () => {
    try { previewDispose?.(); } catch { /* ignore */ }
    previewDispose = null;
    previewHost.replaceChildren();
    previewHost.className = `avs-dz-preview bb-theme-${working.theme ?? 'minimal-dark'}`;
    fitPreview();
    // Mirror the canvas privacy gate: a network widget that would fetch live
    // data does NOT auto-fetch in the designer. Offer one-click consent — the
    // same model as the inspector's IP note — so the design can still be
    // previewed (in inline mode no fetch happens anyway, but the gate is coarse
    // by widget type, matching the canvas, so we let the user opt in here too).
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
      btn.addEventListener('click', () => { enableLivePreview(widget.id); renderPreview(); });
      note.append(msg, btn);
      previewHost.appendChild(note);
      return;
    }
    const temp = { ...widget, id: `dz_${++_seq}`, content: working };
    previewDispose = mountWidget(temp, { duration: 10 }, previewHost, { mode: 'preview', t: k => k });
  };
  const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 120); };

  // ---- format switcher ----
  body.querySelectorAll('.avs-dz-fmt').forEach(btn => btn.addEventListener('click', () => {
    body.querySelectorAll('.avs-dz-fmt').forEach(b => b.classList.toggle('avs-on', b === btn));
    currentFmt = btn.dataset.fmt;
    renderPreview();
  }));

  // ---- the full form (all fields, same buildForm as the inspector) ----
  // schema(working) so a content-driven schema (custom widget) reacts; built-in
  // plugins ignore the argument.
  const form = buildForm({
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

  // ---- direct manipulation bridge (hover + click) ----
  // Plugins annotate rendered elements with data-field="key1 key2 …" (the keys
  // that drive the element; first = primary). buildForm tags each control group
  // with data-field-key. Hover a control → glow the element(s) it drives; click
  // an element → focus its primary control. Both are delegated on stable hosts
  // so they survive preview re-renders. Widgets without annotations simply opt
  // out — nothing breaks.
  const fieldTokens = el => (el.getAttribute('data-field') || '').split(/\s+/).filter(Boolean);
  const cssEscape = k => (window.CSS && CSS.escape) ? CSS.escape(k) : String(k).replace(/"/g, '\\"');
  const glowFor = (key, on) => {
    previewHost.querySelectorAll('[data-field]').forEach(el => {
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
  previewHost.addEventListener('click', e => {
    const el = e.target.closest('[data-field]');
    if (!el || !previewHost.contains(el)) return;
    const key = fieldTokens(el)[0];
    if (!key) return;
    const grp = formHost.querySelector(`[data-field-key="${cssEscape(key)}"]`);
    if (!grp) return;
    grp.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Focus the actual control, not the hover-revealed ↺ reset button.
    grp.querySelector('input, select, textarea, [contenteditable], button:not(.bb-field-reset)')?.focus?.();
    grp.classList.remove('avs-dz-flash'); void grp.offsetWidth; grp.classList.add('avs-dz-flash');
  });

  const onResize = () => { fitPreview(); };

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
      // render immediately. A short follow-up re-fit catches the case where the
      // open animation changes the final box. (Avoid requestAnimationFrame for
      // the first paint: in a backgrounded/headless tab rAF can be paused.)
      renderPreview();
      setTimeout(() => { fitPreview(); }, 220);
      window.addEventListener('resize', onResize);
    },
  }).then(result => {
    window.removeEventListener('resize', onResize);
    clearTimeout(previewTimer);
    try { previewDispose?.(); } catch { /* ignore */ }
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
    .avs-dz-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
    .avs-dz-tb-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; opacity: .6; }
    .avs-dz-formats { display: flex; gap: 4px; flex-wrap: wrap; }
    .avs-dz-fmt { padding: 4px 10px; border-radius: 6px; border: 1px solid var(--bb-border,#333); background: transparent; color: var(--bb-ink-muted,#aaa); cursor: pointer; font-size: 12px; }
    .avs-dz-fmt.avs-on { background: var(--bb-bg-2,#1a1d24); color: var(--bb-ink,#eee); border-color: var(--bb-accent,#8b5cf6); }
    .avs-dz-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: ${STAGE_PAD}px; overflow: hidden; border: 1px solid var(--bb-border,#333); border-radius: 10px; background: color-mix(in srgb, var(--bb-ink,#888) 7%, transparent); background-image: linear-gradient(45deg, color-mix(in srgb, var(--bb-ink,#888) 5%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--bb-ink,#888) 5%, transparent) 75%), linear-gradient(45deg, color-mix(in srgb, var(--bb-ink,#888) 5%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--bb-ink,#888) 5%, transparent) 75%); background-size: 24px 24px; background-position: 0 0, 12px 12px; }
    .avs-dz-preview { border-radius: 8px; overflow: hidden; position: relative; background: var(--bb-st-bg,#0f1218); box-shadow: 0 8px 34px rgba(0,0,0,.4); }
    .avs-dz-note { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; font-size: 13px; color: var(--bb-ink-muted,#aaa); }
    .avs-dz-side { min-width: 0; overflow-y: auto; padding-right: 4px; }
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
