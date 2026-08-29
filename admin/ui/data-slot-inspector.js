// Data Slot inspector — list, peek, edit raw JSON.

import { slots as api } from '../api.js';
import { on } from '../store.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { t, tx } from '../i18n.js';
import { escapeHtml } from '../../shared/utils/escape.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { fmtBytes } from '../format-bytes.js';

// Track whether the inspector modal is currently mounted so SSE
// data.changed/data.deleted events can re-render it in place.
let _inspectorClose = null;

// On an SSE slot mutation, soft-refresh the inspector if the user has it open.
on('slots.changed', () => {
  if (!_inspectorClose) return;
  // Close + reopen — simplest way to surface a fresh list without
  // duplicating the rendering logic. Triggered only when the modal is open.
  const reopen = _inspectorClose;
  _inspectorClose = null;
  try { reopen(); open(); } catch {}
});

export async function open() {
  let list = [];
  try {
    const r = await api.list();
    // Per swagger Screen.Central.Contracts.ListDataSlotsResponse: { slots, total, offset, limit, quota }
    list = Array.isArray(r) ? r : (r?.slots ?? r?.items ?? []);
  } catch (e) { toast(e.message, { kind: 'error' }); return; }

  const host = document.createElement('div');
  host.innerHTML = `
    <div class="bb-slot-toolbar">
      <input type="text" id="slot-filter" placeholder="${tx('Filter…')}" />
      <button class="bb-btn bb-btn-secondary" id="new-slot">+ ${tx('New slot')}</button>
    </div>
    <ul class="bb-slot-list">${list.map(s => row(s)).join('') || `<li class="bb-empty-state">${tx('No slots.')}</li>`}</ul>
  `;
  try { await openModal({
    title: tx('Data slots'),
    body: host,
    actions: [{ label: tx('Close') }],
    onMount: (card, close) => {
      _inspectorClose = close;
      host.querySelector('#slot-filter').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        host.querySelectorAll('.bb-slot-row').forEach(r => {
          r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
      host.querySelector('#new-slot').addEventListener('click', async () => {
        await createSlotModal(close);
      });
      host.addEventListener('click', async e => {
        const r = e.target.closest('.bb-slot-row');
        if (!r) return;
        const act = e.target.dataset.act;
        const slug = r.dataset.slug;
        if (act === 'edit') {
          await editSlot(slug);
        } else if (act === 'copy') {
          navigator.clipboard.writeText(`{{slot:${slug}.readUrl}}`);
          toast(tx('Copied placeholder'), { kind: 'success' });
        } else if (act === 'usage') {
          await showSlotUsage(slug);
        }
      });
    },
  }); } finally { _inspectorClose = null; }
}

function row(s) {
  // Per swagger Screen.Central.Contracts.DataSlotListItem: slotId, slug, sizeBytes, readUrl, type, …
  const slug = s.slug ?? s.slotId ?? s.id;
  const isAggregate = s.type === 'aggregate' || s.slotType === 'aggregate';
  const typeIcon = uiIconSvg(isAggregate ? 'database' : 'pencil', 13);
  const typeLabel = isAggregate ? (t('slot.typeAggregate') || 'Collection') : (t('slot.typeValue') || 'Value');

  return `<li class="bb-slot-row" data-slug="${slug}">
    <span class="bb-slot-type-icon" title="${typeLabel}" style="margin-right: 4px; cursor: default;">${typeIcon}</span>
    <span class="bb-slot-slug">${slug}</span>
    <span class="bb-slot-size">${fmtBytes(s.sizeBytes ?? s.bytes)}</span>
    <span class="bb-slot-actions">
      <button class="bb-iconbtn" data-act="edit">${t('slot.edit')}</button>
      <button class="bb-iconbtn" data-act="copy">${t('slot.copy')}</button>
      <button class="bb-iconbtn" data-act="usage">${t('slot.usage')}</button>
    </span>
  </li>`;
}

async function createSlotModal(closeParent) {
  const box = document.createElement('div');
  box.innerHTML = `
    <div class="bb-form-group">
      <label>${t('slot.slug') || 'Slot-Slug'}</label>
      <input id="ns-slug" placeholder="e.g. sensor-a" class="bb-form-control" style="width: 100%; padding: 6px 8px; margin-bottom: 12px; background: var(--bb-bg-2); border: 1px solid var(--bb-border); color: var(--bb-ink); border-radius: var(--bb-r-sm);" required>
    </div>
    <div class="bb-form-group">
      <label>${t('slot.label') || 'Bezeichnung'}</label>
      <input id="ns-label" placeholder="e.g. Temperature Sensor" class="bb-form-control" style="width: 100%; padding: 6px 8px; margin-bottom: 12px; background: var(--bb-bg-2); border: 1px solid var(--bb-border); color: var(--bb-ink); border-radius: var(--bb-r-sm);">
    </div>
    <div class="bb-form-group">
      <label>${t('slot.type') || 'Typ'}</label>
      <select id="ns-type" style="width: 100%; padding: 6px 8px; background: var(--bb-bg-2); border: 1px solid var(--bb-border); color: var(--bb-ink); border-radius: var(--bb-r-sm);">
        <option value="value">${t('slot.typeValue') || 'Wert-Slot'}</option>
        <option value="aggregate">${t('slot.typeAggregate') || 'JSON-Kollektion (Aggregiert)'}</option>
      </select>
    </div>
  `;
  const ok = await openModal({
    title: t('slot.newSlot') || 'Neuer Slot',
    body: box,
    actions: [{ label: t('common.cancel') || 'Abbrechen' }, { label: t('common.create') || 'Erstellen', kind: 'primary', value: 1 }]
  });
  if (!ok) return;
  const slug = box.querySelector('#ns-slug').value.trim();
  const label = box.querySelector('#ns-label').value.trim() || slug;
  const type = box.querySelector('#ns-type').value;
  if (!slug) return;

  const initialValue = type === 'aggregate' 
    ? { sources: [] } 
    : { hello: 'world' };

  try {
    await api.put(slug, initialValue, { label, type });
    toast(tx('Slot created'), { kind: 'success' });
    closeParent();
    open();
  } catch (e) {
    toast(e.message, { kind: 'error' });
  }
}

async function editSlot(slug) {
  // `slots.getValue` unwraps `slot.jsonContent` so the editor shows the actual
  // stored value, not the API envelope (which used to make Save overwrite the
  // slot with `{ slot:{…}, quota }` on the next round-trip).
  const value = await api.getValue(slug);
  const host = document.createElement('div');
  host.innerHTML = `<textarea class="bb-mono" rows="20" style="width:100%;">${JSON.stringify(value, null, 2)}</textarea>`;
  const ok = await openModal({
    title: `${tx('Edit slot')}: ${slug}`,
    body: host,
    actions: [{ label: tx('Cancel') }, { label: tx('Save'), kind: 'primary', value: 1 }],
  });
  if (!ok) return;
  try {
    const parsed = JSON.parse(host.querySelector('textarea').value);
    await api.put(slug, parsed);
    toast(tx('Saved'), { kind: 'success' });
  } catch (e) { toast(e.message, { kind: 'error' }); }
}

async function showSlotUsage(slug) {
  // t(key, params) takes an OBJECT of interpolations; the string passed here
  // was walked character by character, and the `||` fallback could never fire
  // because a missing key comes back as the key itself — the toast said
  // "common.loading".
  toast(t('common.loading'), { kind: 'info', ttl: 1500 });
  try {
    const res = await api.usage(slug);
    const list = Array.isArray(res) ? res : (res?.displays ?? res?.items ?? []);
    const host = document.createElement('div');
    if (!list.length) {
      host.innerHTML = `<p class="avs-muted" style="padding:10px 0;">${escapeHtml(t('slot.noUsage'))}</p>`;
    } else {
      host.innerHTML = `
        <p class="bb-form-help">${escapeHtml(t('slot.usageList'))}</p>
        <ul style="padding-left: 20px; margin-top: 10px; max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
          ${list.map(d => `<li><b>${escapeHtml(d.name ?? d.id)}</b> <span class="avs-muted">(${escapeHtml(d.id)})</span></li>`).join('')}
        </ul>
        ${res?.truncated ? `<p class="avs-muted" style="margin-top: 8px; font-size: 11px;">⚠️ ${tx('The list was truncated (max 50 entries).')}</p>` : ''}
      `;
    }
    await openModal({
      title: t('slot.usageTitle', { slug }).replace('{slug}', slug),
      body: host,
      actions: [{ label: t('common.close') }]
    });
  } catch (e) {
    toast(e.message, { kind: 'error' });
  }
}

