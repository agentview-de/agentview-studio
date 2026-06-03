// Generic form renderer driven by a plugin's schema(). Returns a {root, get, set, dispose}.
//
// Each field type maps to one input control. The whole form is reactive:
// whenever any input changes, the supplied onChange(newValue) fires with the
// current values object.

import {
  renderLocation, renderDatetime, renderTimezone, renderDuration, renderCurrency, renderTable, renderFeed, renderFeedList,
  renderTheme, renderPlace, renderIcon, renderCalendarEvents, renderRichText,
} from './field-controls.js';
import { probeUrl } from './probe.js';
import { openModal } from './modal.js';
import { sanitizeHtml } from '../../shared/sanitize-html.js';
import { t, tx } from '../i18n.js';
import { registerControl, getControl } from './field-controls/registry.js';

// Register the rich field controls (each its own module) into the control
// registry — the seam renderField() dispatches through first, mirroring the
// widget-plugin registry. Adding or overriding one of these is now a
// registration, not a new switch arm; a plugin could register its own. The
// simple native inputs (text/number/select/toggle/…) stay inline in
// renderField() below as the built-in fast path.
registerControl('location', renderLocation);
registerControl('datetime', renderDatetime);
registerControl('timezone', renderTimezone);
registerControl('duration', renderDuration);
registerControl('currency', renderCurrency);
registerControl('table', renderTable);
registerControl('calendar-events', renderCalendarEvents);
registerControl('feed', renderFeed);
registerControl('feed-list', renderFeedList);
registerControl('rich-text', renderRichText);
registerControl('theme', renderTheme);
registerControl('place', renderPlace);
registerControl('icon', renderIcon);

// Persist collapse state per (formKey, sectionKey). formKey is typically the
// widget type — passed in by the caller via `buildForm({ formKey: '…' })`.
// Without a formKey, persistence is skipped (state is reset on re-render).
const SECTION_STORE_PREFIX = 'avs_section_';
function loadCollapsed(formKey, sectionKey, defaultCollapsed) {
  if (!formKey) return defaultCollapsed;
  try {
    const v = localStorage.getItem(`${SECTION_STORE_PREFIX}${formKey}_${sectionKey}`);
    if (v === null) return defaultCollapsed;
    return v === '1';
  } catch { return defaultCollapsed; }
}
function saveCollapsed(formKey, sectionKey, collapsed) {
  if (!formKey) return;
  try { localStorage.setItem(`${SECTION_STORE_PREFIX}${formKey}_${sectionKey}`, collapsed ? '1' : '0'); } catch {}
}

// Stable section identifier — explicit `key` wins, else fall back to the label
// (slugified). Avoids storage-key collisions between different schemas.
function sectionKeyFor(f) {
  if (f.key) return f.key;
  return String(f.label ?? 'unnamed').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function buildForm({ schema, value, onChange, assetPicker, assetsPicker, codePicker, formKey }) {
  const root = document.createElement('div');
  root.className = 'bb-form';
  const refs = new Map(); // key → control element

  const cur = structuredCloneSafe(value);
  const groups = [];

  // Wrap any element in a `.bb-form-section` with a clickable header. Used
  // both for explicit `type: 'section'` schema entries and for auto-wrapping
  // big content fields below.
  function buildSection(label, sectionKey, defaultCollapsed) {
    const section = document.createElement('section');
    section.className = 'bb-form-section';
    const initial = loadCollapsed(formKey, sectionKey, !!defaultCollapsed);
    if (initial) section.classList.add('bb-form-section-closed');
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'bb-form-section-head';
    head.innerHTML = `<span class="bb-form-section-chev">▾</span> <span class="bb-form-section-label">${esc(label ?? '')}</span>`;
    const body = document.createElement('div');
    body.className = 'bb-form-section-body';
    head.addEventListener('click', () => {
      const nowClosed = section.classList.toggle('bb-form-section-closed');
      saveCollapsed(formKey, sectionKey, nowClosed);
    });
    section.append(head, body);
    return { section, body };
  }

  // Build a single field-group node (label + control + help + msg). Extracted
  // so the section and row layouts can re-use it without duplicating logic.
  // `suppressLabel` skips the field's own <label> — used when the field lives
  // inside an auto-section whose header already shows the label.
  function mountField(f, { suppressLabel = false } = {}) {
    const group = document.createElement('div');
    group.className = `bb-form-group bb-form-${f.type}`;
    if (!suppressLabel) {
      const lbl = document.createElement('label');
      lbl.textContent = tx(f.label) ?? f.key;
      group.appendChild(lbl);
    }

    // Inline validation / probe message slot (shared by validate() + Test).
    const msg = document.createElement('div');
    msg.className = 'bb-field-msg';
    msg.hidden = true;
    const showMsg = res => {
      if (!res) { msg.hidden = true; msg.textContent = ''; return; }
      msg.hidden = false;
      msg.textContent = res.message;
      msg.dataset.level = res.level;
    };
    const runValidate = () => { if (typeof f.validate === 'function') showMsg(f.validate(cur[f.key], cur)); };

    const ctrl = renderField(f, cur[f.key], v => {
      cur[f.key] = v;
      applyVisibility();
      runValidate();
      onChange?.(cur);
    }, { assetPicker, assetsPicker, codePicker });
    refs.set(f.key, ctrl.el);
    group.appendChild(ctrl.el);

    if (f.test) {
      const testRow = document.createElement('div');
      testRow.className = 'bb-field-test';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bb-btn bb-btn-secondary bb-btn-sm';
      btn.textContent = '⚡ ' + t('probe.test');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = t('probe.testing');
        try { showMsg(await probeUrl(cur[f.key], f.test === true ? 'url' : f.test)); }
        finally { btn.disabled = false; btn.textContent = label; }
      });
      testRow.appendChild(btn);
      group.appendChild(testRow);
    }

    if (f.help) {
      const help = document.createElement('p');
      help.className = 'bb-form-help';
      help.textContent = tx(f.help);
      group.appendChild(help);
    }
    group.appendChild(msg);
    groups.push({ f, group });
    runValidate();
    return group;
  }

  // Iterate the schema's flat field list and interpret two marker types:
  //   `section` opens a collapsible group; subsequent fields mount into it.
  //   `row` wraps its `children` array in a horizontal flex container.
  // Anything else is a regular field.
  let currentTarget = root;
  for (const f of (schema.fields ?? [])) {
    if (f.type === 'section') {
      // Explicit section marker — opens a new container that subsequent
      // top-level fields mount into (until the next section / EOF).
      const { section, body } = buildSection(tx(f.label), sectionKeyFor(f), f.collapsed);
      root.appendChild(section);
      currentTarget = body;
      groups.push({ f, group: section });
      continue;
    }
    if (f.type === 'row') {
      const rowWrap = document.createElement('div');
      rowWrap.className = 'bb-form-row-cluster';
      const children = Array.isArray(f.children) ? f.children : [];
      for (const child of children) rowWrap.appendChild(mountField(child));
      currentTarget.appendChild(rowWrap);
      groups.push({ f, group: rowWrap });
      continue;
    }
    // Universal collapsibility: every top-level labelled field becomes its
    // own collapsible section so the inspector has one consistent fold
    // interaction. Fields inside an explicit `type: 'section'` group keep
    // rendering as before — the surrounding section already provides the fold.
    if (currentTarget === root && f.label) {
      const { section, body } = buildSection(tx(f.label), sectionKeyFor(f), f.collapsed);
      body.appendChild(mountField(f, { suppressLabel: true }));
      root.appendChild(section);
      groups.push({ f, group: section });
      continue;
    }
    currentTarget.appendChild(mountField(f));
  }

  // Conditional fields: re-evaluate showIf(content) whenever any value changes.
  // Sections + rows can themselves have showIf — useful for "advanced" groups
  // that only matter when a switch above is enabled.
  function applyVisibility() {
    for (const { f, group } of groups) {
      if (typeof f.showIf === 'function') group.style.display = f.showIf(cur) ? '' : 'none';
    }
  }
  applyVisibility();

  return {
    root,
    get value() { return cur; },
    setValue(next) { Object.assign(cur, next); /* re-render isn't tracked deeply */ },
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderField(f, v, set, opts) {
  // Registered controls win; the switch below holds the built-in native inputs.
  const control = getControl(f.type);
  if (control) return control(f, v, set, opts);
  switch (f.type) {
    case 'text':
    case 'url':
    case 'date':
    case 'time': {
      const el = document.createElement('input');
      el.type = f.type === 'text' ? 'text' : f.type;
      el.value = v ?? '';
      if (f.placeholder) el.placeholder = tx(f.placeholder);
      el.addEventListener('input', () => set(el.value));
      return { el };
    }
    case 'color': {
      // Native <input type="color"> has no empty state — once a value is set
      // it can't be cleared back to "use default". For fields where an empty
      // value is meaningful (e.g. weather textColor = follow theme), pass
      // `clearable: true` and a small × button is rendered next to the swatch.
      const wrap = document.createElement('div');
      wrap.className = 'bb-color-field';
      wrap.style.cssText = 'display:flex; align-items:center; gap:6px;';
      const el = document.createElement('input');
      el.type = 'color';
      el.value = v || '#000000';
      // When v is empty, fade the swatch so the user sees "no override active".
      if (!v) el.style.opacity = '0.45';
      el.addEventListener('input', () => { el.style.opacity = '1'; set(el.value); });
      wrap.appendChild(el);
      if (f.clearable) {
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'bb-color-clear';
        clear.title = tx('Reset to default');
        clear.setAttribute('aria-label', tx('Reset to default'));
        clear.textContent = '×';
        clear.style.cssText = 'background:transparent; border:1px solid var(--bb-border, rgba(255,255,255,.15)); color:inherit; width:24px; height:24px; border-radius:6px; cursor:pointer; line-height:1; font-size:16px; padding:0;';
        clear.addEventListener('click', () => { el.style.opacity = '0.45'; set(''); });
        wrap.appendChild(clear);
      }
      return { el: wrap };
    }
    case 'number': {
      if (f.slider) {
        const wrap = document.createElement('div');
        wrap.className = 'bb-slider-field';
        const el = document.createElement('input');
        el.type = 'range';
        if (f.min != null) el.min = f.min;
        if (f.max != null) el.max = f.max;
        el.step = f.step != null ? f.step : 1;
        el.value = v ?? f.default ?? f.min ?? 0;
        const lbl = document.createElement('span');
        lbl.className = 'bb-slider-val';
        const fmt = () => { lbl.textContent = `${el.value}${f.suffix ?? ''}`; };
        el.addEventListener('input', () => { fmt(); set(+el.value); });
        fmt();
        wrap.append(el, lbl);
        return { el: wrap };
      }
      const el = document.createElement('input');
      el.type = 'number';
      el.value = v ?? '';
      if (f.min != null) el.min = f.min;
      if (f.max != null) el.max = f.max;
      if (f.step != null) el.step = f.step;
      el.addEventListener('input', () => set(el.value === '' ? null : +el.value));
      return { el };
    }
    case 'textarea': {
      const el = document.createElement('textarea');
      el.value = v ?? '';
      if (f.placeholder) el.placeholder = tx(f.placeholder);
      el.addEventListener('input', () => set(el.value));
      return wrapExpandable(el, f, () => el.value, val => { el.value = val; set(val); }, 'text');
    }
    case 'markdown':
    case 'code': {
      const el = document.createElement('textarea');
      el.value = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
      el.className = 'bb-mono';
      if (f.placeholder) el.placeholder = tx(f.placeholder);
      el.addEventListener('input', () => set(el.value));
      return wrapExpandable(el, f, () => el.value, val => { el.value = val; set(val); }, f.type);
    }
    case 'toggle': {
      const el = document.createElement('label');
      el.className = 'bb-switch';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !!v;
      cb.addEventListener('change', () => set(cb.checked));
      const slider = document.createElement('span'); slider.className = 'bb-switch-slider';
      el.appendChild(cb); el.appendChild(slider);
      return { el };
    }
    case 'select': {
      const el = document.createElement('select');
      for (const opt of (f.options ?? [])) {
        const o = document.createElement('option');
        if (typeof opt === 'string') { o.value = opt; o.textContent = opt; }
        else { o.value = opt.value; o.textContent = tx(opt.label) ?? opt.value; }
        if (o.value === v) o.selected = true;
        el.appendChild(o);
      }
      el.addEventListener('change', () => set(el.value));
      return { el };
    }
    // location / datetime / timezone / duration / currency / table /
    // calendar-events / feed / feed-list / rich-text / theme / place / icon are
    // registered controls (see registerControl() calls above) — dispatched via
    // the registry before this switch is reached.
    case 'asset': {
      const wrap = document.createElement('div');
      wrap.className = 'bb-asset-wrap';
      const row = document.createElement('div');
      row.className = 'bb-asset-field';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = tx(f.placeholder ?? 'URL or pick from library');
      input.value = v ?? '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bb-btn bb-btn-secondary';
      btn.textContent = '📁 ' + tx('Browse');
      row.appendChild(input);
      row.appendChild(btn);

      // Thumbnail preview of the selected image/video.
      const thumb = document.createElement('div');
      thumb.className = 'bb-asset-thumb';
      const accept = f.accept ?? '';
      const updateThumb = url => {
        thumb.innerHTML = '';
        if (!url) { thumb.hidden = true; return; }
        const isVideo = /video\//.test(accept) || /\.(mp4|webm|m4v|mov)(\?|$)/i.test(url);
        const isImage = /image\//.test(accept) || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(url);
        if (isVideo) {
          const vd = document.createElement('video');
          vd.src = url; vd.muted = true; vd.preload = 'metadata';
          thumb.hidden = false; thumb.appendChild(vd);
        } else if (isImage || !accept) {
          const im = document.createElement('img');
          im.src = url; im.alt = '';
          im.addEventListener('error', () => { thumb.hidden = true; });
          thumb.hidden = false; thumb.appendChild(im);
        } else { thumb.hidden = true; }
      };

      input.addEventListener('input', () => { set(input.value); updateThumb(input.value); });
      btn.addEventListener('click', async () => {
        const url = await opts.assetPicker?.(f.accept);
        if (url) { input.value = url; set(url); updateThumb(url); }
      });
      updateThumb(input.value);
      wrap.append(row, thumb);
      return { el: wrap };
    }
    case 'list': {
      const wrap = document.createElement('div');
      wrap.className = 'bb-list-field';
      const list = Array.isArray(v) ? [...v] : [];
      const itemShape = f.itemShape ?? [{ key: 'value', type: 'text', label: 'Value' }];
      let dragFrom = null;
      const render = () => {
        wrap.innerHTML = '';
        list.forEach((item, idx) => {
          const row = document.createElement('div');
          row.className = 'bb-list-item';
          row.dataset.idx = idx;

          const handle = document.createElement('span');
          handle.className = 'bb-drag-handle';
          handle.textContent = '⠿';
          handle.title = t('field.dragReorder');
          handle.draggable = true;
          handle.addEventListener('dragstart', e => { dragFrom = idx; e.dataTransfer.effectAllowed = 'move'; row.classList.add('bb-dragging'); });
          handle.addEventListener('dragend', () => { dragFrom = null; row.classList.remove('bb-dragging'); });
          row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('bb-drop-into'); });
          row.addEventListener('dragleave', () => row.classList.remove('bb-drop-into'));
          row.addEventListener('drop', e => {
            e.preventDefault(); row.classList.remove('bb-drop-into');
            if (dragFrom == null || dragFrom === idx) return;
            const [moved] = list.splice(dragFrom, 1);
            list.splice(idx, 0, moved);
            set([...list]); render();
          });
          row.appendChild(handle);

          const fields = document.createElement('div');
          fields.className = 'bb-list-fields';
          for (const sf of itemShape) {
            const cell = document.createElement('div');
            cell.className = 'bb-list-cell';
            const sub = renderField(sf, item?.[sf.key], nv => {
              if (!list[idx] || typeof list[idx] !== 'object') list[idx] = {};
              list[idx][sf.key] = nv;
              set([...list]);
            }, opts);
            const lbl = document.createElement('label');
            lbl.textContent = tx(sf.label) ?? sf.key;
            cell.appendChild(lbl);
            cell.appendChild(sub.el);
            fields.appendChild(cell);
          }
          row.appendChild(fields);

          const rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'bb-btn bb-btn-ghost bb-list-rm';
          rm.textContent = '✕';
          rm.addEventListener('click', () => { list.splice(idx, 1); set([...list]); render(); });
          row.appendChild(rm);
          wrap.appendChild(row);
        });

        const actions = document.createElement('div');
        actions.className = 'bb-list-actions';
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'bb-btn bb-btn-secondary bb-btn-sm';
        add.textContent = '+ ' + t('field.addRow');
        add.addEventListener('click', () => {
          const empty = Object.fromEntries(itemShape.map(sf => [sf.key, sf.type === 'number' ? 0 : '']));
          list.push(empty); set([...list]); render();
        });
        actions.appendChild(add);

        if (f.bulkAsset) {
          const bulk = document.createElement('button');
          bulk.type = 'button';
          bulk.className = 'bb-btn bb-btn-secondary bb-btn-sm';
          bulk.textContent = '🖼 ' + t('field.pickMultiple');
          bulk.addEventListener('click', async () => {
            const urls = await opts.assetsPicker?.(f.bulkAsset);
            if (urls?.length) {
              const key = itemShape[0].key;
              urls.forEach(u => list.push({ [key]: u }));
              set([...list]); render();
            }
          });
          actions.appendChild(bulk);
        }
        wrap.appendChild(actions);
      };
      render();
      return { el: wrap };
    }
    default: {
      // Unknown field type — log so a typo in a plugin schema or a new field
      // type that wasn't added here surfaces during development. The plain
      // input fallback keeps the form usable in production.
      console.warn('[inspector] unknown field type', f.type, 'for key', f.key, '— falling back to plain input');
      const el = document.createElement('input');
      el.value = v ?? '';
      el.addEventListener('input', () => set(el.value));
      return { el };
    }
  }
}

function structuredCloneSafe(v) {
  try { return structuredClone(v); } catch {
    try { return JSON.parse(JSON.stringify(v)); } catch { return { ...v }; }
  }
}

// Wraps a textarea-style control with an "⛶ Expand" button that opens the
// same content in a much larger modal — mirrors the announcement widget's
// expand-modal pattern. For markdown fields, the modal also shows a live
// preview pane (HTML pipelined through sanitizeHtml on every keystroke).
//
// kind: 'text' | 'code' | 'markdown' — drives whether to show a preview and
// whether to use monospace font.
function wrapExpandable(inner, f, getValue, setValue, kind) {
  const wrap = document.createElement('div');
  wrap.className = 'bb-textfield-wrap';
  wrap.appendChild(inner);
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = 'bb-textfield-expand';
  expand.title = t('rt.expand');
  expand.textContent = '⛶';
  expand.addEventListener('click', () => openExpandedTextEditor(f, getValue, setValue, kind));
  wrap.appendChild(expand);
  return { el: wrap };
}

function openExpandedTextEditor(f, getValue, setValue, kind) {
  const body = document.createElement('div');
  body.className = `bb-textmodal bb-textmodal-${kind}`;
  const ta = document.createElement('textarea');
  ta.className = kind === 'text' ? 'bb-textmodal-area' : 'bb-textmodal-area bb-mono';
  ta.value = getValue() ?? '';
  if (f.placeholder) ta.placeholder = tx(f.placeholder);
  ta.spellcheck = kind !== 'code';

  // Live commit so the canvas updates while the user types in the modal —
  // exact same UX as the announcement widget's expand modal.
  ta.addEventListener('input', () => setValue(ta.value));

  if (kind === 'markdown') {
    // Side-by-side preview. Renders the markdown on every keystroke using the
    // global `marked` lib (already loaded by display.html / studio.html) and
    // pipes through sanitizeHtml so an authored body still can't inject.
    const split = document.createElement('div');
    split.className = 'bb-textmodal-split';
    const pane = document.createElement('article');
    pane.className = 'bb-textmodal-preview bb-md';
    const renderPreview = () => {
      if (typeof window !== 'undefined' && window.marked?.parse) {
        pane.innerHTML = sanitizeHtml(window.marked.parse(ta.value, { breaks: true, gfm: true }));
      } else {
        pane.textContent = ta.value;
      }
    };
    ta.addEventListener('input', renderPreview);
    split.append(ta, pane);
    body.appendChild(split);
    setTimeout(renderPreview, 0);
  } else {
    body.appendChild(ta);
  }

  openModal({
    title: tx(f.label) || t('rt.editTitle'),
    body,
    actions: [{ label: t('rt.done'), kind: 'primary', value: true }],
    onMount: (card) => {
      card.classList.add('bb-modal-textmodal');
      setTimeout(() => ta.focus(), 30);
    },
  });
}
