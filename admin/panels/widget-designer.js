// Widget Designer — the visual editor for a 'custom' widget's SHAPE.
//
// It edits the three structural parts the inspector deliberately doesn't (the
// inspector only edits the author's field VALUES): the HTML template, the
// scoped CSS, and the set of inspector fields the widget exposes. A live
// preview renders through the exact same widget-host path as the canvas and
// player, so what the author sees is what ships. "Preview data" reuses the real
// buildForm() so the author also previews — and seeds defaults for — the
// fields the end user will fill in.
//
// Everything stays DATA: on Apply we only write template/css/fields/values back
// into widget.content. No code is produced, which is what makes a custom widget
// safe to save and share (see shared/custom-template.js).

import { openModal } from '../ui/modal.js';
import { buildForm } from '../ui/inspector.js';
import { mountWidget } from '../../shared/widget-host.js';
import { collectValues, tokensInTemplate } from '../../shared/custom-template.js';
import { saveDesignContent } from '../ui/custom-widget-actions.js';
import { pickAsset } from '../ui/asset-library.js';
import { escapeHtml } from '../../shared/utils/escape.js';
import { t, tx } from '../i18n.js';

const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

// Field types a custom widget may expose. A curated subset of the full
// inspector control set — the ones that make sense for a user filling in a
// designed widget (no slot pickers, no geometry, etc.).
const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Multi-line text' },
  { value: 'rich-text', label: 'Rich text' },
  { value: 'number', label: 'Number' },
  { value: 'color', label: 'Colour' },
  { value: 'toggle', label: 'Toggle' },
  { value: 'select', label: 'Dropdown' },
  { value: 'url', label: 'URL' },
  { value: 'asset', label: 'Image / asset' },
];

let _previewSeq = 0;

export function openWidgetDesigner(widget, { onApply } = {}) {
  const base = widget?.content ?? {};
  // Working copy — nothing touches the real widget until Apply.
  const working = {
    template: typeof base.template === 'string' ? base.template : '',
    css: typeof base.css === 'string' ? base.css : '',
    fields: Array.isArray(base.fields) ? clone(base.fields) : [],
    values: collectValues(base),
    theme: base.theme ?? 'minimal-dark',
    textColor: base.textColor ?? '',
    accentColor: base.accentColor ?? '',
  };

  const validFields = () => working.fields
    .filter(f => f && typeof f.key === 'string' && f.key.trim() && f.type)
    .map(f => ({ ...f, key: f.key.trim() }));

  const workingContent = () => ({
    template: working.template,
    css: working.css,
    fields: validFields(),
    ...working.values,
    theme: working.theme,
    textColor: working.textColor,
    accentColor: working.accentColor,
  });

  // ---- body scaffold ----
  const body = document.createElement('div');
  body.className = 'avs-wd';
  body.innerHTML = `
    <div class="avs-wd-grid">
      <div class="avs-wd-left" id="wd-code"></div>
      <div class="avs-wd-right">
        <div class="avs-wd-preview-label">${escapeHtml(tx('Live preview'))}</div>
        <div class="avs-wd-preview" id="wd-preview"></div>
        <div class="avs-wd-data-label">${escapeHtml(tx('Preview data'))}</div>
        <div id="wd-data"></div>
        <button type="button" class="bb-btn bb-btn-secondary bb-btn-sm" id="wd-save-mine" style="margin-top:10px;width:100%;">⭐ ${escapeHtml(tx('Save to My widgets'))}</button>
      </div>
    </div>`;

  injectStylesOnce();

  const previewHost = body.querySelector('#wd-preview');
  const dataHost = body.querySelector('#wd-data');

  // ---- live preview (debounced) ----
  let previewDispose = null;
  let previewTimer = null;
  const renderPreview = () => {
    try { previewDispose?.(); } catch {}
    previewDispose = null;
    previewHost.replaceChildren();
    previewHost.className = `avs-wd-preview bb-theme-${working.theme ?? 'minimal-dark'}`;
    const temp = { id: `wd_${++_previewSeq}`, type: 'custom', content: workingContent() };
    previewDispose = mountWidget(temp, { duration: 10 }, previewHost, { mode: 'preview', t: k => k });
  };
  const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 150); };

  // ---- "Preview data" form (the real inspector controls) ----
  let dataForm = null;
  const refreshDataForm = () => {
    dataForm?.dispose?.();
    dataHost.replaceChildren();
    const fields = validFields();
    if (!fields.length) {
      dataHost.innerHTML = `<p class="avs-muted" style="font-size:12px;">${escapeHtml(tx('Add a field to give the widget editable content.'))}</p>`;
      return;
    }
    // Seed any missing values so the controls render populated.
    for (const f of fields) if (!(f.key in working.values)) working.values[f.key] = defaultForType(f.type);
    dataForm = buildForm({
      schema: { fields },
      value: working.values,
      formKey: `wd_${widget?.id ?? 'new'}`,
      onChange: v => { working.values = { ...working.values, ...v }; schedulePreview(); },
      assetPicker: async accept => await pickAsset(accept),
    });
    dataHost.appendChild(dataForm.root);
  };

  // ---- structural editor (template / CSS / fields) ----
  // The SAME mountable the full-screen Designer's Code tab uses (mountCustomCode),
  // so the two never drift. It owns the tabs, token chips and field-row builder;
  // this designer only reacts by rebuilding the value form + repainting the preview.
  const codeEditor = mountCustomCode(working, { onChange: () => { refreshDataForm(); schedulePreview(); } });
  body.querySelector('#wd-code').appendChild(codeEditor.root);

  // ---- save to My widgets (does not close the designer) ----
  body.querySelector('#wd-save-mine').addEventListener('click', () => saveDesignContent(workingContent()));

  // initial paint — mountCustomCode already rendered the fields and fired onChange
  // (which built the value form); paint the live preview immediately.
  renderPreview();

  return openModal({
    title: `🎨 ${tx('Widget Designer')}`,
    body,
    actions: [
      { label: t('common.cancel') },
      { label: tx('Apply'), kind: 'primary', value: 'apply' },
    ],
    onMount: card => { card.classList.add('avs-wd-modal'); },
  }).then(result => {
    clearTimeout(previewTimer);
    try { previewDispose?.(); } catch {}
    try { codeEditor.dispose?.(); } catch {}
    dataForm?.dispose?.();
    if (result === 'apply') {
      const next = { ...(widget.content ?? {}) };
      next.template = working.template;
      next.css = working.css;
      next.fields = validFields();
      next.theme = working.theme;
      next.textColor = working.textColor;
      next.accentColor = working.accentColor;
      for (const f of next.fields) next[f.key] = working.values[f.key] ?? next[f.key] ?? defaultForType(f.type);
      widget.content = next;
      onApply?.();
    }
    return result;
  });
}

// Mountable template / CSS / fields editor — the STRUCTURAL editor for a custom
// widget, extracted so the general Widget Designer (designer.js) can host it as
// a "Code" tab next to its live stage and value form. Operates on a live
// `working` object ({ template, css, fields }, mutated in place); calls onChange
// after any change so the host can rebuild the value form + repaint the preview.
// No preview/data-form of its own — the host already provides those.
export function mountCustomCode(working, { onChange } = {}) {
  injectStylesOnce();
  if (!Array.isArray(working.fields)) working.fields = [];
  const root = document.createElement('div');
  root.className = 'avs-wd avs-wd-codeonly';
  root.innerHTML = `
    <div class="avs-wd-tabs">
      <button type="button" class="avs-wd-tab avs-on" data-tab="template">${escapeHtml(tx('Template'))}</button>
      <button type="button" class="avs-wd-tab" data-tab="css">${escapeHtml(tx('Style (CSS)'))}</button>
      <button type="button" class="avs-wd-tab" data-tab="fields">${escapeHtml(tx('Fields'))}</button>
    </div>
    <div class="avs-wd-pane" data-pane="template">
      <p class="bb-form-help">${escapeHtml(tx('Write HTML. Insert a field value with {{key}}. Optional filter: {{value | number}}.'))}</p>
      <textarea class="bb-mono avs-wd-code" id="cc-template" spellcheck="false"></textarea>
      <div class="avs-wd-tokens" id="cc-tokens"></div>
    </div>
    <div class="avs-wd-pane" data-pane="css" hidden>
      <p class="bb-form-help">${escapeHtml(tx('CSS is scoped to this widget automatically — selectors only affect what you build here.'))}</p>
      <textarea class="bb-mono avs-wd-code" id="cc-css" spellcheck="false"></textarea>
    </div>
    <div class="avs-wd-pane" data-pane="fields" hidden>
      <p class="bb-form-help">${escapeHtml(tx('Each field becomes an inspector control the user fills in. The field key is the {{token}} you reference in the template.'))}</p>
      <div id="cc-fields"></div>
      <button type="button" class="bb-btn bb-btn-secondary bb-btn-sm" id="cc-add-field">+ ${escapeHtml(tx('Add field'))}</button>
    </div>`;

  const templateTa = root.querySelector('#cc-template');
  const cssTa = root.querySelector('#cc-css');
  const fieldsHost = root.querySelector('#cc-fields');
  const tokensHost = root.querySelector('#cc-tokens');
  templateTa.value = working.template ?? '';
  cssTa.value = working.css ?? '';

  root.querySelectorAll('.avs-wd-tab').forEach(btn => btn.addEventListener('click', () => {
    root.querySelectorAll('.avs-wd-tab').forEach(b => b.classList.toggle('avs-on', b === btn));
    root.querySelectorAll('.avs-wd-pane').forEach(p => { p.hidden = p.dataset.pane !== btn.dataset.tab; });
  }));

  const validFields = () => working.fields.filter(f => f && typeof f.key === 'string' && f.key.trim() && f.type);
  const renderTokens = () => {
    const toks = tokensInTemplate(working.template ?? '');
    const known = new Set(validFields().map(f => f.key.trim()));
    tokensHost.innerHTML = !toks.length ? '' :
      `<span class="avs-wd-tokens-h">${escapeHtml(tx('Tokens used:'))}</span> ` + toks.map(tk =>
        `<code class="avs-wd-token${known.has(tk) ? '' : ' avs-wd-token-unknown'}">{{${escapeHtml(tk)}}}</code>`).join(' ');
  };
  const insertAtCursor = (ta, text) => {
    const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    ta.selectionStart = ta.selectionEnd = s + text.length; ta.focus();
  };
  templateTa.addEventListener('input', () => { working.template = templateTa.value; renderTokens(); onChange?.(); });
  cssTa.addEventListener('input', () => { working.css = cssTa.value; onChange?.(); });

  const renderFields = () => {
    fieldsHost.replaceChildren();
    working.fields.forEach((f, idx) => fieldsHost.appendChild(renderRow(f, idx)));
    renderTokens();
    onChange?.();
  };
  function renderRow(f, idx) {
    const row = document.createElement('div');
    row.className = 'avs-wd-fieldrow';
    row.innerHTML = `
      <div class="avs-wd-fieldmain">
        <input class="avs-wd-fkey" placeholder="${escapeHtml(tx('key'))}" value="${escapeHtml(f.key ?? '')}">
        <input class="avs-wd-flabel" placeholder="${escapeHtml(tx('Label'))}" value="${escapeHtml(f.label ?? '')}">
        <select class="avs-wd-ftype">
          ${FIELD_TYPES.map(o => `<option value="${o.value}" ${f.type === o.value ? 'selected' : ''}>${escapeHtml(tx(o.label))}</option>`).join('')}
        </select>
      </div>
      <div class="avs-wd-fieldopts" ${f.type === 'select' ? '' : 'hidden'}>
        <input class="avs-wd-foptions" placeholder="${escapeHtml(tx('Options: a, b, c  (or  val=Label)'))}" value="${escapeHtml(optionsToText(f.options))}">
      </div>
      <div class="avs-wd-fieldbtns">
        <button type="button" class="avs-iconbtn" data-act="up" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="avs-iconbtn" data-act="down" ${idx === working.fields.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="avs-iconbtn" data-act="copytoken" title="${escapeHtml(tx('Insert token into template'))}">{ }</button>
        <button type="button" class="avs-iconbtn bb-btn-danger" data-act="del">✕</button>
      </div>`;
    const keyI = row.querySelector('.avs-wd-fkey');
    const labelI = row.querySelector('.avs-wd-flabel');
    const typeI = row.querySelector('.avs-wd-ftype');
    const optsWrap = row.querySelector('.avs-wd-fieldopts');
    const optsI = row.querySelector('.avs-wd-foptions');
    keyI.addEventListener('input', () => { f.key = sanitizeKey(keyI.value); if (keyI.value !== f.key) keyI.value = f.key; renderTokens(); onChange?.(); });
    labelI.addEventListener('input', () => { f.label = labelI.value; onChange?.(); });
    typeI.addEventListener('change', () => {
      f.type = typeI.value; optsWrap.hidden = f.type !== 'select';
      if (f.type === 'select' && !Array.isArray(f.options)) f.options = textToOptions(optsI.value);
      onChange?.();
    });
    optsI.addEventListener('input', () => { f.options = textToOptions(optsI.value); onChange?.(); });
    row.querySelector('[data-act="up"]').addEventListener('click', () => moveRow(idx, -1));
    row.querySelector('[data-act="down"]').addEventListener('click', () => moveRow(idx, 1));
    row.querySelector('[data-act="del"]').addEventListener('click', () => { working.fields.splice(idx, 1); renderFields(); });
    row.querySelector('[data-act="copytoken"]').addEventListener('click', () => {
      if (!f.key) return;
      root.querySelector('.avs-wd-tab[data-tab="template"]').click();
      insertAtCursor(templateTa, `{{${f.key}}}`);
      working.template = templateTa.value; renderTokens(); onChange?.();
    });
    return row;
  }
  const moveRow = (idx, dir) => {
    const j = idx + dir; if (j < 0 || j >= working.fields.length) return;
    const [m] = working.fields.splice(idx, 1); working.fields.splice(j, 0, m); renderFields();
  };
  root.querySelector('#cc-add-field').addEventListener('click', () => {
    let i = working.fields.length + 1, key = `field${i}`;
    const used = new Set(working.fields.map(f => f.key));
    while (used.has(key)) { i++; key = `field${i}`; }
    working.fields.push({ key, type: 'text', label: `Field ${i}` });
    renderFields();
  });

  renderFields();
  return { root, dispose() { /* no document-level listeners to remove */ } };
}

// ---- helpers ----
function sanitizeKey(s) {
  // A {{token}} key: starts with a letter/_, then word chars. Strip the rest.
  let k = String(s ?? '').replace(/[^\w$]/g, '');
  if (k && /^[0-9]/.test(k)) k = '_' + k;
  return k;
}
function defaultForType(type) {
  if (type === 'number') return 0;
  if (type === 'toggle') return false;
  return '';
}
function optionsToText(options) {
  if (!Array.isArray(options)) return '';
  return options.map(o => (o.value === o.label ? o.value : `${o.value}=${o.label}`)).join(', ');
}
function textToOptions(text) {
  return String(text ?? '').split(',').map(s => s.trim()).filter(Boolean).map(part => {
    const eq = part.indexOf('=');
    if (eq >= 0) return { value: part.slice(0, eq).trim(), label: part.slice(eq + 1).trim() };
    return { value: part, label: part };
  });
}

let _stylesInjected = false;
function injectStylesOnce() {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'avs-wd-styles';
  style.textContent = `
    .avs-wd-modal { max-width: min(1040px, 94vw); width: 1040px; }
    .avs-wd-grid { display: grid; grid-template-columns: 1fr 360px; gap: 16px; align-items: start; }
    .avs-wd-left { min-width: 0; }
    .avs-wd-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
    .avs-wd-tab { padding: 5px 12px; border-radius: 7px; border: 1px solid var(--bb-border,#333); background: transparent; color: var(--bb-ink-muted,#aaa); cursor: pointer; font-size: 13px; }
    .avs-wd-tab.avs-on { background: var(--bb-bg-2,#1a1d24); color: var(--bb-ink,#eee); border-color: var(--bb-accent,#8b5cf6); }
    .avs-wd-code { width: 100%; min-height: 300px; resize: vertical; font-size: 12.5px; line-height: 1.5; tab-size: 2; }
    .avs-wd-tokens { margin-top: 8px; font-size: 11px; line-height: 1.9; color: var(--bb-ink-muted,#999); }
    .avs-wd-tokens-h { opacity: .7; }
    .avs-wd-token { background: color-mix(in srgb, var(--bb-accent,#8b5cf6) 16%, transparent); padding: 1px 5px; border-radius: 4px; }
    .avs-wd-token-unknown { background: color-mix(in srgb, var(--bb-warn,#e0a030) 22%, transparent); text-decoration: line-through; }
    .avs-wd-preview-label, .avs-wd-data-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; opacity: .6; margin: 0 0 6px; }
    .avs-wd-data-label { margin-top: 14px; }
    .avs-wd-preview { width: 100%; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; position: relative; background: var(--bb-st-bg, #0f1218); border: 1px solid var(--bb-border,#333); }
    .avs-wd-fieldrow { border: 1px solid var(--bb-border,#333); border-radius: 8px; padding: 8px; margin-bottom: 8px; background: color-mix(in srgb, var(--bb-bg-2,#1a1d24) 60%, transparent); }
    .avs-wd-fieldmain { display: grid; grid-template-columns: 1fr 1fr 130px; gap: 6px; }
    .avs-wd-fieldmain input, .avs-wd-fieldmain select { padding: 5px 7px; }
    .avs-wd-fieldopts { margin-top: 6px; }
    .avs-wd-foptions { width: 100%; padding: 5px 7px; }
    .avs-wd-fieldbtns { display: flex; gap: 4px; justify-content: flex-end; margin-top: 6px; }
    @media (max-width: 820px) { .avs-wd-grid { grid-template-columns: 1fr; } .avs-wd-modal { width: 94vw; } }
  `;
  document.head.appendChild(style);
}
