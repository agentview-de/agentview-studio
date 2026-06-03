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
import { displays as displaysApi, slots, groups as groupsApi, assets } from './api.js';
import { bundlePlayer } from './publish.js';
import { openModal } from './ui/modal.js';
import { toast } from './ui/toast.js';
import { t } from './i18n.js';
import { collectUniqueSlots } from '../shared/binding-resolver.js';
import { offlineSlugFor, withOfflineBindings, offlineWidgets } from '../shared/offline-data.js';
import { get as getPlugin } from '../shared/plugins/registry.js';
import { buildSyncAnchor } from '../shared/sync-clock.js';
import { isEditingVariant, exitVariantEdit } from './canvas/variant-ctx.js';
// Reused at runtime only (publish-flow <-> displays is a module cycle; the
// binding is resolved by the time the click handler fires).
import { pairModal } from './views/displays.js';

const slugFor = pl => 'avs-' + (pl?.id ?? 'data');
const historySlugFor = pl => 'avs-' + (pl?.id ?? 'data') + '-history';

// Fetch ONE "provided offline" widget's source (Studio-side — the API key is used
// here and never leaves the Studio) and store the RAW response in its data slot,
// with a fetchedAt stamp. The display reads this slot; no live call on screen.
async function refreshWidgetData(w) {
  const plugin = getPlugin(w?.type);
  let data;
  if (typeof plugin?.provisionOffline === 'function') {
    // Widgets with a computed source (currency/weather build their URL from config
    // + API key) provision themselves — the key is used HERE in the Studio and
    // never ships to the display.
    data = await plugin.provisionOffline(w.content ?? {});
  } else {
    const src = w?.content?.dataUrl ?? w?.content?.url;
    if (!src) throw new Error('no source URL');
    const res = await fetch(src, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  }
  await slots.put(
    offlineSlugFor(w),
    { data, fetchedAt: new Date().toISOString() },
    { label: `${w.content?.title || w.type || 'Offline data'} · ${offlineSlugFor(w)}` },
  );
}

// Refresh ALL "provided offline" widgets in the CURRENT playlist in one action —
// the "Daten aktualisieren" button. Each widget's data slot is rewritten; displays
// pick up the new data on their next slot poll, so NO republish is needed. Resilient
// (Promise.allSettled): one failing source doesn't block the others.
export async function refreshAllOfflineData() {
  const widgets = offlineWidgets(state.playlist);
  if (!widgets.length) {
    toast(t('offline.none') ?? 'No offline-data widgets in this playlist.', { kind: 'info' });
    return { ok: 0, fail: 0, total: 0 };
  }
  toast((t('offline.refreshing') ?? 'Refreshing data…'), { kind: 'info', ttl: 2000 });
  const results = await Promise.allSettled(widgets.map(refreshWidgetData));
  const fail = results.filter(r => r.status === 'rejected').length;
  const ok = results.length - fail;
  toast(
    fail
      ? (t('offline.refreshPartial', { ok, fail }) ?? `${ok} refreshed, ${fail} failed.`)
      : (t('offline.refreshOk', { n: ok }) ?? `${ok} data source(s) refreshed.`),
    { kind: fail ? 'warn' : 'success' },
  );
  return { ok, fail, total: results.length };
}

// Does the current playlist have any offline-data widgets? (gates the toolbar button)
export function hasOfflineData() {
  return offlineWidgets(state.playlist).length > 0;
}

// "Datenquellen" overview — the toolbar button opens this. Lists every provided-
// offline widget in the CURRENT playlist with its data slot and "last refreshed"
// stamp (read live from each slot), plus the single "refresh all" action. Gives
// the secretary-style workflow visibility: what's stored, how fresh it is, and
// one click to update everything.
export async function openOfflineDataPanel() {
  const widgets = offlineWidgets(state.playlist);
  const box = document.createElement('div');
  box.className = 'avs-offline-panel';

  if (!widgets.length) {
    box.innerHTML = `<p class="bb-form-help">${esc(t('offline.none') ?? 'No offline data sources in this playlist.')}</p>`;
    await openModal({ title: t('offline.panelTitle') ?? 'Offline data sources', body: box, actions: [{ label: t('common.close') ?? 'Close' }] });
    return;
  }

  const fmtStamp = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d) ? null : d.toLocaleString();
  };

  // Read each slot's fetchedAt once, then paint. Re-run after a refresh.
  const renderRows = async () => {
    box.innerHTML = `<p class="bb-form-help">${esc(t('offline.panelHelp') ?? 'The display reads this stored data — no live API call, no key, no internet needed on screen.')}</p>
      <div class="avs-ods-list" style="display:flex;flex-direction:column;gap:8px;margin:10px 0;">${
        widgets.map(() => '<div class="avs-ods-row" style="opacity:.5;">…</div>').join('')}</div>
      <button type="button" class="bb-btn bb-btn-primary avs-ods-refresh" style="width:100%;">⤓ ${esc(t('offline.refreshNow') ?? 'Refresh all now')}</button>`;
    const list = box.querySelector('.avs-ods-list');
    const stamps = await Promise.allSettled(widgets.map(w => slots.getValue(offlineSlugFor(w))));
    list.innerHTML = widgets.map((w, i) => {
      const plugin = getPlugin(w.type);
      const icon = plugin?.icon ?? '◷';
      const label = plugin?.label ?? w.type ?? 'Widget';
      const slug = offlineSlugFor(w);
      const val = stamps[i].status === 'fulfilled' ? stamps[i].value : null;
      const when = fmtStamp(val?.fetchedAt);
      const stand = when
        ? (t('offline.lastUpdated', { when }) ?? `Last refreshed: ${when}`)
        : (t('offline.neverYet') ?? 'not provisioned yet');
      return `<div class="avs-ods-row" style="display:flex;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--bb-border,#2a2a35);border-radius:8px;">
        <span style="font-size:20px;line-height:1;">${esc(String(icon))}</span>
        <div style="min-width:0;flex:1;">
          <div style="font-weight:600;">${esc(label)}${w.content?.title ? ' · ' + esc(w.content.title) : ''}</div>
          <div class="bb-form-help" style="margin:2px 0 0;">${esc(slug)} · ${esc(stand)}</div>
        </div>
      </div>`;
    }).join('');
    box.querySelector('.avs-ods-refresh').addEventListener('click', async (e) => {
      if (state.connection.status !== 'connected') { toast(t('pub.connectFirst'), { kind: 'warn' }); return; }
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await refreshAllOfflineData(); }
      finally { await renderRows(); }
    });
  };
  await renderRows();
  await openModal({ title: t('offline.panelTitle') ?? 'Offline data sources', body: box, actions: [{ label: t('common.close') ?? 'Close' }] });
}

// SHA-256 of an ArrayBuffer as lowercase hex. crypto.subtle needs a secure
// context (https / localhost); callers tolerate a throw and fall back to no-hash.
async function sha256Hex(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// MIME for our runtime asset extensions — set explicitly so the asset host serves
// vendor scripts with an executable type even under X-Content-Type-Options: nosniff.
function mimeFor(name) {
  if (/\.m?js$/i.test(name)) return 'text/javascript';
  if (/\.woff2$/i.test(name)) return 'font/woff2';
  if (/\.woff$/i.test(name)) return 'font/woff';
  if (/\.css$/i.test(name)) return 'text/css';
  return '';
}

// agentView list endpoints return a bare array or an {assets|items|data:[…]} wrap.
function unwrapAssets(raw) {
  if (Array.isArray(raw)) return raw;
  for (const k of ['assets', 'items', 'data', 'results']) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

// Build a resolveAsset(absoluteUrl) -> assetUrl hook for bundlePlayer. The
// published HTML lives on the content host, where relative shared/vendor and
// /fonts paths 404; uploading those binaries (vendor scripts, fonts, pdf worker)
// to the agentView asset store gives URLs the SAME displays can reach. Dedup is
// content-addressed (sha256) with a stable-name fallback, so the immutable vendor
// files upload once per account — repeat publishes reuse them. The in-flight
// `cache` keys by source URL so each file is fetched/hashed once per publish.
function makeAssetResolver() {
  const cache = new Map();   // absoluteUrl → assetUrl (this publish)
  let existing = null;       // lazily: { byHash, byName } from assets.list()
  const ensureExisting = async () => {
    if (existing) return existing;
    existing = { byHash: new Map(), byName: new Map() };
    try {
      for (const a of unwrapAssets(await assets.list())) {
        const url = a?.url || a?.publicUrl || a?.downloadUrl;
        if (!url) continue;
        if (a.sha256) existing.byHash.set(String(a.sha256).toLowerCase(), url);
        if (a.name) existing.byName.set(a.name, url);
      }
    } catch { /* list unavailable — we'll just upload */ }
    return existing;
  };
  return async (absoluteUrl) => {
    if (cache.has(absoluteUrl)) return cache.get(absoluteUrl);
    const name = 'avs-' + (absoluteUrl.split('/').pop().split(/[?#]/)[0] || 'asset');
    const res = await fetch(absoluteUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`asset fetch ${absoluteUrl} → ${res.status}`);
    const buf = await res.arrayBuffer();
    let hex = null;
    try { hex = await sha256Hex(buf); } catch { /* insecure context — skip hash dedup */ }
    const ex = await ensureExisting();
    let url = (hex && ex.byHash.get(hex)) || ex.byName.get(name) || null;
    if (!url) {
      const file = new File([buf], name, { type: mimeFor(name) || res.headers.get('content-type') || 'application/octet-stream' });
      const r = await assets.upload(file, ['agentView Studio runtime asset']);
      const a = r?.assets?.[0];
      url = a?.url || a?.publicUrl || r?.url || r?.assetUrl || null;
      if (url) {
        if (a?.sha256) ex.byHash.set(String(a.sha256).toLowerCase(), url);
        else if (hex) ex.byHash.set(hex, url);
        ex.byName.set(name, url);
      }
    }
    if (!url) throw new Error(`asset upload returned no URL for ${name}`);
    cache.set(absoluteUrl, url);
    return url;
  };
}

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
  // Prepare a SHIPPING copy: "provided offline" widgets get a binding to their
  // data slot + their API keys stripped (deep clone — the editor copy keeps the
  // full config). Resolve endpoints from THIS copy so the offline slots' read URLs
  // are included for the player to poll.
  const shipped = withOfflineBindings(pl);
  // v3: stamp the playlist with sync anchor + resolved slot endpoints so the
  // bundled player can sync via server-time math and poll bindings without
  // re-querying agentView's API.
  const slotEndpoints = await resolveSlotEndpoints(shipped);
  const plToShip = {
    ...shipped,
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
  // Widget types whose lazy-loaded vendor libs must be inlined (each is large, so
  // only inline what the playlist uses). Cheap structural check on the about-to-
  // ship playlist.
  const plBlob = JSON.stringify(plToShip ?? {});
  const vendorTypes = ['pdf', 'stream-cam', 'map'].filter(t => plBlob.includes(`"type":"${t}"`));
  const html = await bundlePlayer({
    baseUrl, readUrl,
    windowGlobals: {
      BB_ORG_BRAND: state.admin?.brandKitOrg ?? null,
    },
    // Fonts (woff2) upload fine as agentView assets and are repointed at those
    // URLs (relative /fonts paths 404 on the content host); deduped per account by
    // sha256. Vendor scripts are inlined instead (the asset store rejects .js).
    resolveAsset: makeAssetResolver(),
    vendorTypes,
  });
  // sourcePlaylist (with keys intact) is snapshotted to history so a restore keeps
  // the full config; the displays only ever see the key-stripped plToShip.
  return { html, slug, name: plToShip?.name ?? 'Playlist', shippedPlaylist: plToShip, sourcePlaylist: pl };
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
    const { html, name, sourcePlaylist } = await buildBundle();
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
    snapshotVersion(sourcePlaylist ?? state.playlist, ids).catch(() => {});
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
