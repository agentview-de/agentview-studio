// Store-template content editor — the per-slot JSON override editor with a live
// sandboxed preview, plus "Send to display". Extracted from inspector.js as a
// self-contained feature: the inspector just calls openTemplateContentEditor(widget)
// when the selected widget is a store template instance.

import { state, commit } from '../store.js';
import { refreshWidget } from '../canvas/canvas.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { t } from '../i18n.js';
import { storeTemplates } from '../api.js';
import { buildPreviewHtml } from '../../shared/store-template-preview.js';
import { escapeHtml, escapeAttr } from '../../shared/utils/escape.js';

// A store-template widget carries the template HTML + slot definitions. Editing
// here writes per-slot override values onto widget.content.slots; empty fields
// fall back to the template's own defaults. "Send to display" ships the template
// with the edited values as per-slot overrides.
export function openTemplateContentEditor(widget) {
  const c = widget.content ?? {};
  const defs = Array.isArray(c.slotDefs) ? c.slotDefs : [];
  const html = String(c.html ?? '');
  // Operate on a live reference so canvas + preview stay in sync as we edit.
  if (!c.slots || typeof c.slots !== 'object') c.slots = {};
  const slots = c.slots;

  const box = document.createElement('div');
  box.className = 'avs-tpl-editor';
  box.innerHTML = `
    <div class="avs-tpl-editor-cols">
      <div class="avs-tpl-slots">
        ${defs.map(d => {
          const key = d.key;
          const val = slots[key];
          const initial = val !== undefined ? escapeHtml(JSON.stringify(val, null, 2)) : '';
          return `<div class="bb-form-group avs-tpl-slot">
            <label>${escapeHtml(d.label || key)} <span class="avs-muted">(${escapeHtml(key)}${d.required ? ' *' : ''})</span></label>
            <textarea class="bb-mono avs-tpl-json" rows="7" spellcheck="false"
              data-key="${escapeAttr(key)}" placeholder="${t('content.usesDefault')}">${initial}</textarea>
            <div class="avs-tpl-err" data-err="${escapeAttr(key)}"></div>
          </div>`;
        }).join('')}
      </div>
      <div class="avs-tpl-preview">
        <iframe class="avs-tpl-preview-frame" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
      </div>
    </div>
    <div class="avs-flex-row avs-tpl-actions">
      <button class="bb-btn bb-btn-primary" id="tpl-send">${t('content.sendToDisplay')}</button>
    </div>`;

  const frame = box.querySelector('.avs-tpl-preview-frame');
  const rebuildPreview = () => { frame.srcdoc = buildPreviewHtml(html, slots); };
  rebuildPreview();

  let editTimer = null;
  const applyEdit = (ta) => {
    const key = ta.dataset.key;
    const errEl = box.querySelector(`[data-err="${CSS.escape(key)}"]`);
    const raw = ta.value.trim();
    if (!raw) {
      delete slots[key];
      errEl.textContent = '';
      commit('tpl-slots'); refreshWidget(widget.id); rebuildPreview();
      return;
    }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { errEl.textContent = t('content.invalidJson'); return; }
    slots[key] = parsed;
    errEl.textContent = '';
    commit('tpl-slots'); refreshWidget(widget.id); rebuildPreview();
  };
  box.querySelectorAll('.avs-tpl-json').forEach(ta =>
    ta.addEventListener('input', () => { clearTimeout(editTimer); editTimer = setTimeout(() => applyEdit(ta), 350); }));

  box.querySelector('#tpl-send').addEventListener('click', () => sendTemplateToDisplay(widget));

  openModal({
    title: t('inspector.editContent'),
    body: box,
    actions: [{ label: t('common.close'), value: 1 }],
    onMount: (card) => {
      // Widen the modal so the editor + live preview sit side by side.
      card.classList.add('bb-modal-wide');
    },
  });
}

// Send THIS template (with the edited slot values as overrides) to a display.
async function sendTemplateToDisplay(widget) {
  const slug = widget.content?.templateSlug;
  if (!slug) { toast(t('content.notATemplate'), { kind: 'warn' }); return; }
  if (state.connection.status !== 'connected') { toast(t('pub.connectFirst'), { kind: 'warn' }); return; }
  const displays = state.fleet.displays ?? [];
  if (!displays.length) { toast(t('content.noDisplays'), { kind: 'warn' }); return; }

  let did = displays[0].id ?? displays[0].profileId;
  if (displays.length > 1) {
    const pick = document.createElement('div');
    pick.innerHTML = `
      <p class="bb-form-help">${t('content.pickDisplay')}</p>
      <select id="tpl-target" style="width:100%;padding:6px;">
        ${displays.map(d => `<option value="${escapeAttr(d.id ?? d.profileId)}">${escapeHtml(d.name ?? d.id)}</option>`).join('')}
      </select>`;
    const ok = await openModal({
      title: t('content.sendToDisplay'), body: pick,
      actions: [{ label: t('common.cancel') }, { label: t('content.sendToDisplay'), kind: 'primary', value: 1 }],
    });
    if (!ok) return;
    did = pick.querySelector('#tpl-target').value;
  }

  const overrides = (widget.content?.slots && Object.keys(widget.content.slots).length) ? widget.content.slots : {};
  try {
    await storeTemplates.sendToDisplay(slug, did, overrides);
    toast(t('content.sent'), { kind: 'success' });
  } catch (e) { toast(e.message, { kind: 'error' }); }
}
