// Publish flow — the "Veröffentlichen" action. Bundles the current playlist
// into a self-contained player (via the generic publish.js bundler), uploads
// the playlist JSON to a data slot, then ships to a Display / Group / multiple.
//
// Single   → displays.sendContent
// Group    → resolve the category's member displayIds → displays.broadcast
// Multiple → displays.broadcast with the chosen displayIds
//
// Wording is deliberately unambiguous: only "Veröffentlichen" / "Publish".

import { state } from './store.js';
import { displays as displaysApi, slots, groups as groupsApi } from './api.js';
import { bundlePlayer } from './publish.js';
import { openModal } from './ui/modal.js';
import { toast } from './ui/toast.js';
import { t } from './i18n.js';
import { collectUniqueSlots } from '../shared/binding-resolver.js';
import { buildSyncAnchor } from '../shared/sync-clock.js';
import { isEditingVariant, exitVariantEdit } from './canvas/variant-ctx.js';
// Reused at runtime only (publish-flow <-> displays is a module cycle; the
// binding is resolved by the time the click handler fires).
import { pairModal } from './views/displays.js';

const slugFor = pl => 'avs-' + (pl?.id ?? 'data');
const historySlugFor = pl => 'avs-' + (pl?.id ?? 'data') + '-history';

// Append a snapshot of the just-published playlist to a sidecar history slot.
// FIFO cap = 20. Failures are non-blocking — versioning is best-effort.
async function snapshotVersion(pl, deployedToIds = []) {
  if (!pl) return;
  const slug = historySlugFor(pl);
  let history;
  try {
    history = await slots.getValue(slug).catch(() => null);
  } catch { history = null; }
  if (!history || !Array.isArray(history.versions)) history = { versions: [] };
  history.versions.unshift({
    at: new Date().toISOString(),
    by: state.connection?.user?.email ?? 'unknown',
    deployedTo: deployedToIds,
    name: pl.name ?? '',
    snapshot: pl,
  });
  // FIFO 10 (was 20). agentView soft-limit recommendation (2026-05-28): keep
  // aggregate slot size per org under 1-2 MB. With ~200 KB per snapshot and
  // multi-playlist accounts, 20 entries would risk quota-exceeded.
  if (history.versions.length > 10) history.versions.length = 10;
  try {
    await slots.put(slug, history, { label: (pl.name ?? 'Playlist') + ' — history' });
    if (!pl.versionsSlot) pl.versionsSlot = slug;
  } catch (e) {
    console.warn('history snapshot failed', e);
  }
}

// Resolve public read URLs for every slot the playlist binds to. The player
// runtime needs these to poll the slots independently of the playlist slot.
async function resolveSlotEndpoints(pl) {
  const slugs = collectUniqueSlots(pl);
  if (!slugs.length) return {};
  const out = {};
  await Promise.all(slugs.map(async slug => {
    try {
      const meta = await slots.get(slug);
      const url = meta?.slot?.readUrl ?? meta?.readUrl ?? meta?.url;
      if (url) out[slug] = url;
    } catch { /* slot unreachable — fall back to default URL pattern at runtime */ }
  }));
  return out;
}

async function buildBundle() {
  // v3 safety: if a variant is being edited via swap-in-place, restore the
  // default widgets BEFORE serialising — otherwise the published playlist
  // would have the variant's widgets at slide.widgets and the default array
  // dropped (the stash is in memory only).
  if (isEditingVariant()) exitVariantEdit();
  const pl = state.playlist;
  // v3: stamp the playlist with sync anchor + resolved slot endpoints so the
  // bundled player can sync via server-time math and poll bindings without
  // re-querying agentView's API. Both are mutations on the about-to-be-
  // uploaded copy, not on the editor's working copy — clone shallowly.
  const slotEndpoints = await resolveSlotEndpoints(pl);
  const plToShip = {
    ...pl,
    syncAnchor: buildSyncAnchor(pl),
    slotEndpoints,
  };
  const slug = slugFor(plToShip);
  await slots.put(slug, plToShip, { label: plToShip?.name || 'agentView Studio' });
  const meta = await slots.get(slug);
  const readUrl = meta?.slot?.readUrl ?? meta?.readUrl ?? meta?.url
    ?? `${state.connection.baseUrl}/data/u/${encodeURIComponent(slug)}.json`;
  const baseUrl = `${location.protocol}//${location.host}/`;
  // v3 globals: org brand-kit (cascade root), display lang (set by per-display
  // publish call when supported), and the resolved slot endpoint map.
  const html = await bundlePlayer({
    baseUrl, readUrl,
    windowGlobals: {
      BB_ORG_BRAND: state.admin?.brandKitOrg ?? null,
    },
  });
  return { html, slug, name: plToShip?.name ?? 'Playlist', shippedPlaylist: plToShip };
}

export async function publishToDisplay(displayId) {
  return doPublish({ mode: 'single', displayIds: [displayId] });
}
export async function publishToGroup(groupId) {
  return doPublish({ mode: 'group', groupId });
}

// v3 comfort: remember the last successful publish target so the user can
// re-publish with one click. Stored under state.meta.lastPublish via doPublish.
export async function publishLast() {
  const last = state.meta?.lastPublish;
  if (!last) { toast(t('pub.noLastTarget') ?? 'Noch nichts veröffentlicht — bitte zuerst Ziel wählen.', { kind: 'warn' }); openPublishPicker(); return; }
  if (last.mode === 'group') return doPublish({ mode: 'group', groupId: last.groupId });
  return doPublish({ mode: last.mode, displayIds: last.displayIds });
}

// Read-only accessor — used by the topbar Quick-Republish button to decide
// whether to show "Erneut →" or fall through to the picker.
export function hasLastPublishTarget() {
  return !!state.meta?.lastPublish;
}

export async function openPublishPicker(preselect = {}) {
  if (state.connection.status !== 'connected') { toast(t('pub.connectFirst'), { kind: 'warn' }); return; }
  const groups = state.fleet.groups ?? [];

  const box = document.createElement('div');
  box.className = 'avs-publish-picker';
  box.innerHTML = `
    <div class="bb-bezel-selector avs-pub-modes">
      <button class="bb-bezel-btn bb-on" data-mode="single">${t('pub.single')}</button>
      <button class="bb-bezel-btn" data-mode="group">${t('pub.group')}</button>
      <button class="bb-bezel-btn" data-mode="multi">${t('pub.multi')}</button>
    </div>
    <p class="bb-form-help">${t('pub.modeHelp')}</p>
    <div class="avs-pub-target" id="avs-pub-target"></div>`;

  const target = box.querySelector('#avs-pub-target');
  let mode = preselect.mode ?? 'single';
  // Read the fleet live so a display paired mid-flow shows up on re-render.
  const fleetDisplays = () => state.fleet.displays ?? [];
  const newDisplayBtn = `<button type="button" class="bb-btn bb-btn-secondary avs-pub-newdisp" data-act="pub-new-display">+ ${t('disp.pair')}</button>`;

  const renderTarget = () => {
    const ds = fleetDisplays();
    if (mode === 'single') {
      target.innerHTML = `<label>${t('pub.display')}</label>
        <select id="pub-one">${ds.map(d => `<option value="${d.id}">${esc(d.name ?? d.id)}</option>`).join('')}</select>
        ${newDisplayBtn}`;
      if (preselect.displayId) target.querySelector('#pub-one').value = preselect.displayId;
    } else if (mode === 'group') {
      target.innerHTML = groups.length
        ? `<label>${t('pub.group')}</label><select id="pub-grp">${groups.map(g => `<option value="${g.id ?? g.categoryId}">${esc(g.name ?? g.label)}</option>`).join('')}</select>`
        : `<p class="bb-form-help">${t('pub.noGroups')}</p>`;
    } else {
      target.innerHTML = `<label>${t('pub.multi')}</label><div class="avs-pub-checks">${ds.map(d =>
        `<label class="avs-check"><input type="checkbox" value="${d.id}"> ${esc(d.name ?? d.id)}</label>`).join('')}</div>
        ${newDisplayBtn}`;
    }
  };
  box.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
    box.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('bb-on', x === b));
    mode = b.dataset.mode; renderTarget();
  }));
  renderTarget();

  // "+ New display" right here in the picker: close, run the pair-by-code flow
  // (the same one the Displays view uses), then reopen the picker in the same
  // mode with the fleet refreshed — no detour through the Displays view.
  let closePicker = null;
  target.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-act="pub-new-display"]')) return;
    closePicker?.();
    await new Promise(r => setTimeout(r, 220)); // let the picker finish closing first
    await pairModal();
    openPublishPicker({ mode, displayId: preselect.displayId });
  });

  const ok = await openModal({
    title: t('pub.title'),
    body: box,
    actions: [{ label: t('common.cancel') }, { label: t('pub.go'), kind: 'primary', value: 1 }],
    onMount: (card, close) => { closePicker = close; },
  });
  if (!ok) return;

  if (mode === 'single') return doPublish({ mode: 'single', displayIds: [box.querySelector('#pub-one')?.value].filter(Boolean) });
  if (mode === 'group') {
    const gid = box.querySelector('#pub-grp')?.value;
    if (!gid) { toast(t('pub.noGroups'), { kind: 'warn' }); return; }
    return doPublish({ mode: 'group', groupId: gid });
  }
  const ids = [...box.querySelectorAll('.avs-pub-checks input:checked')].map(i => i.value);
  if (!ids.length) { toast(t('pub.pickTarget'), { kind: 'warn' }); return; }
  return doPublish({ mode: 'multi', displayIds: ids });
}

async function doPublish({ mode, displayIds = [], groupId }) {
  // Guard against publishing an empty playlist — would silently push a blank
  // bundle to every targeted display and leave them showing nothing.
  if (!state.playlist?.slides?.length) {
    toast(t('pub.emptyPlaylist'), { kind: 'warn' });
    return;
  }
  toast(t('pub.publishing'), { kind: 'info', ttl: 2000 });
  try {
    const { html, name, shippedPlaylist } = await buildBundle();
    // Pre-publish dry-run (warn only — never blocks shipping).
    try {
      const r = await displaysApi.testContent(html);
      if (r?.warnings?.length) toast(t('pub.warnings', { n: r.warnings.length }), { kind: 'warn', ttl: 5000 });
    } catch { /* dry-run unsupported / oversize — proceed */ }

    let ids = displayIds;
    if (mode === 'group') {
      const m = await groupsApi.membersOf(groupId);
      ids = (m?.displays ?? (Array.isArray(m) ? m : [])).map(d => d.id ?? d.profileId).filter(Boolean);
      if (!ids.length) { toast(t('pub.groupEmpty'), { kind: 'warn' }); return; }
    }

    if (mode === 'single' && ids.length === 1) {
      const last = await displaysApi.sendContent(ids[0], html, { description: name });
      toast(t('pub.success'), { kind: 'success' });
      if (last?.hint) toast(last.hint, { kind: 'info', ttl: 6000 });
    } else {
      // Group + multi → one broadcast call with resolved displayIds.
      await displaysApi.broadcast({ displayIds: ids, html, description: name, contentDescription: name });
      toast(mode === 'group' ? t('pub.successGroup') : t('pub.success'), { kind: 'success' });
    }
    // v3: best-effort version snapshot after a successful publish.
    snapshotVersion(shippedPlaylist ?? state.playlist, ids).catch(() => {});
    // v3 comfort: remember the target so the Quick-Republish button works next.
    state.meta.lastPublish = { mode, displayIds: ids, groupId, at: Date.now() };
    confetti();
    refreshRunning(ids);
  } catch (e) {
    toast(t('pub.failed', { msg: e.message }), { kind: 'error' });
  }
}

// Refresh "currently running" labels for the given displays (or all online).
export async function refreshRunning(displayIds) {
  const ids = displayIds?.length ? displayIds
    : (state.fleet.displays ?? []).filter(d => d.status === 'online' || d.online).map(d => d.id);
  await Promise.all(ids.map(async id => {
    try {
      const r = await displaysApi.contentState(id);
      const desc = r?.currentContentDescription ?? r?.description ?? null;
      if (!state.fleet.running) state.fleet.running = {};
      state.fleet.running[id] = desc;
    } catch { /* ignore */ }
  }));
  // nudge subscribers
  state.fleet.running = { ...(state.fleet.running ?? {}) };
}

function confetti() {
  const colors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];
  for (let i = 0; i < 70; i++) {
    const el = document.createElement('span');
    el.className = 'bb-confetti';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.background = colors[i % colors.length];
    el.style.animationDelay = (Math.random() * 0.4) + 's';
    el.style.animationDuration = (1.2 + Math.random() * 1.4) + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
