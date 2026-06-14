// Admin-side flows for "My widgets": place onto the canvas, save the selected
// widget / slide, and export / import a widget file. Kept out of
// shared/custom-widgets.js so that module stays DOM- and store-free; everything
// here touches the document, the reactive store, or the canvas.
//
// After any mutation we emit('custom-widgets.changed') so the library palette
// (which subscribes via store.on) re-renders without a manual refresh.

import { emit } from '../store.js';
import { toast } from './toast.js';
import { openModal } from './modal.js';
import { t, tx } from '../i18n.js';
import { escapeHtml } from '../../shared/utils/escape.js';
import * as customWidgets from '../../shared/custom-widgets.js';
import { addWidget, addComposite } from '../canvas/canvas.js';

const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

// Place a saved entry onto the active slide. preset/custom add a single widget
// seeded with the saved content; composite inserts all its widgets.
export function placeEntry(entry) {
  if (!entry) return null;
  if (entry.kind === 'composite') {
    return addComposite(clone(entry.widgets ?? []));
  }
  const w = addWidget(entry.baseType ?? 'custom', clone(entry.content ?? {}));
  if (w) toast(tx('Added “{name}”').replace('{name}', entry.name), { kind: 'success', ttl: 1500 });
  return w;
}

// Persist an entry and notify the palette. Returns the stored entry.
function commitEntry(input) {
  const entry = customWidgets.save(input);
  emit('custom-widgets.changed');
  return entry;
}

// Small name/icon prompt. Resolves to { name, icon } or null on cancel.
async function promptNameIcon(defaultName, title) {
  const box = document.createElement('div');
  box.className = 'bb-form-group';
  box.innerHTML = `
    <label>${escapeHtml(tx('Name'))}</label>
    <input type="text" id="cw-name" value="${escapeHtml(defaultName ?? '')}" style="width:100%;padding:6px;">
    <label style="margin-top:8px;">${escapeHtml(tx('Icon (emoji)'))}</label>
    <input type="text" id="cw-icon" maxlength="4" placeholder="🎨" style="width:80px;padding:6px;">`;
  const ok = await openModal({
    title,
    body: box,
    actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', value: 1 }],
    onMount: card => {
      setTimeout(() => box.querySelector('#cw-name')?.focus(), 10);
      box.querySelector('#cw-name')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); card.querySelector('.bb-modal-footer .bb-btn-primary')?.click(); }
      });
    },
  });
  if (!ok) return null;
  const name = box.querySelector('#cw-name').value.trim();
  if (!name) return null;
  return { name, icon: box.querySelector('#cw-icon').value.trim() || undefined };
}

// Save the currently-selected widget as a reusable entry. A 'custom' widget is
// saved as kind 'custom'; anything else as kind 'preset'. Geometry is dropped —
// a preset is "this widget configured this way", placed at the default rect.
export async function saveWidgetAsPreset(widget) {
  if (!widget) return;
  const res = await promptNameIcon(tx('My widget'), tx('Save as widget'));
  if (!res) return;
  commitEntry({
    kind: widget.type === 'custom' ? 'custom' : 'preset',
    name: res.name,
    icon: res.icon,
    baseType: widget.type,
    content: clone(widget.content ?? {}),
  });
  toast(tx('Saved to My widgets'), { kind: 'success' });
}

// Save a content snapshot from the Designer (no live widget needed). Used by
// the "Save to My widgets" button inside the designer so the save reflects the
// in-progress design without first mutating the placed widget.
export async function saveDesignContent(content) {
  const res = await promptNameIcon(tx('My widget'), tx('Save as widget'));
  if (!res) return;
  commitEntry({ kind: 'custom', name: res.name, icon: res.icon, baseType: 'custom', content: clone(content ?? {}) });
  toast(tx('Saved to My widgets'), { kind: 'success' });
}

// Save every widget on a slide as one composite unit.
export async function saveSlideAsComposite(slide) {
  const widgets = slide?.widgets ?? [];
  if (!widgets.length) { toast(tx('This slide has no widgets to save.'), { kind: 'warn' }); return; }
  const res = await promptNameIcon(tx('My layout'), tx('Save slide as composite'));
  if (!res) return;
  // Keep only the portable bits of each widget — ids are regenerated on place.
  const portable = widgets.map(w => ({
    type: w.type, content: clone(w.content), rect: clone(w.rect),
    z: w.z, rotation: w.rotation, background: clone(w.background),
    anim: clone(w.anim), loop: w.loop, title: w.title,
    contentVersion: w.contentVersion,
  }));
  commitEntry({ kind: 'composite', name: res.name, icon: res.icon || '🧩', widgets: portable });
  toast(tx('Saved to My widgets'), { kind: 'success' });
}

// Remove an entry and notify the palette.
export function removeEntry(id) {
  if (customWidgets.remove(id)) emit('custom-widgets.changed');
}

// Download an entry as a .json file the user can share.
export function exportEntry(entry) {
  if (!entry) return;
  const data = JSON.stringify(customWidgets.toExportJson(entry), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(entry.name)}.avswidget.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Open a file picker, parse the chosen .json, save it, and notify the palette.
// Resolves to the imported entry, or null on cancel / parse failure.
export function importCustomWidget() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { resolve(null); return; }
      try {
        const text = await file.text();
        const entry = customWidgets.fromImportJson(JSON.parse(text));
        const saved = commitEntry(entry);
        toast(tx('Imported “{name}”').replace('{name}', saved.name), { kind: 'success' });
        resolve(saved);
      } catch (e) {
        toast(tx('Could not import file: ') + (e.message ?? e), { kind: 'error' });
        resolve(null);
      }
    }, { once: true });
    input.click();
  });
}

function slug(s) {
  return String(s ?? 'widget').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'widget';
}
