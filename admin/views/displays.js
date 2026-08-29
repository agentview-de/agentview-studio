// Displays view — the dashboard. Cards grouped by Group (native agentView
// categories), live online/offline + "läuft: <slideshow>", and a prominent
// Veröffentlichen flow per card and per group.


import { state, subscribe } from '../store.js';
import { displays as api, groups as groupsApi, PREVIEW_LINK_TTL_S, categoryIdOf } from '../api.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { openPublishPicker, publishToGroup, refreshRunning } from '../publish-flow.js';
import { t, tx } from '../i18n.js';
import * as drawer from '../ui/display-drawer.js';
import { renderConnectGate } from '../ui/connect-gate.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { escapeHtml as esc } from '../../shared/utils/escape.js';
import { coalesce } from '../../shared/async-refresh.js';

function normList(raw, key) {
  if (Array.isArray(raw)) return raw;
  return raw?.[key] ?? raw?.items ?? raw?.displays ?? raw?.categories ?? [];
}

// Ten callers, one of them the SSE handler: a wall of displays coming back
// after a network blip fired one full refresh per `display_online` event, each
// of them 2 + N requests. Overlapping runs also split the dashboard in half —
// state.fleet.displays is written before the member lookups, state.fleet.groups
// after them, so the two could come from different runs. Coalesced, a burst of
// any size costs the run in flight plus one catch-up.
export const refreshFleet = coalesce(refreshFleetOnce);

async function refreshFleetOnce() {
  if (state.connection.status !== 'connected') return; // no API noise while disconnected
  const [dl, gl] = await Promise.allSettled([api.list(), groupsApi.list()]);
  if (dl.status === 'fulfilled') {
    state.fleet.displays = normList(dl.value, 'displays');
    // Every other list endpoint in this API pages and reports `total`. This one
    // is called bare, so if it ever answers with a page instead of a fleet, the
    // dashboard would show a prefix and say nothing — the quietest kind of
    // wrong for the screen an operator uses to check that everything is up.
    // We do not invent limit/offset parameters we cannot verify; we read what
    // the server reports and let the header say so.
    const reported = dl.value?.total;
    state.fleet.displaysTotal = Number.isFinite(reported) ? reported : null;
  } else {
    toast(t('disp.refreshFail', { msg: dl.reason?.message ?? '' }), { kind: 'warn' });
  }
  const cats = gl.status === 'fulfilled' ? normList(gl.value, 'categories') : [];
  // Category membership isn't on the display object — resolve each group's members.
  await Promise.all(cats.map(async c => {
    try {
      const m = await groupsApi.membersOf(categoryIdOf(c));
      c.displayIds = (m?.displays ?? (Array.isArray(m) ? m : [])).map(d => d.id ?? d.profileId).filter(Boolean);
    } catch { c.displayIds = []; }
  }));
  state.fleet.groups = cats;
  refreshRunning();
}

// Map groupId -> [display]. Tolerates membership being on the group OR display.
// Exported for the browser suite: this is pure (displays, groups) → buckets,
// and it is where a mismatched group identity shows up as a display quietly
// dropping out of its group.
export function membership(displays, groups) {
  const byGroup = new Map(groups.map(g => [groupId(g), []]));
  const placed = new Set();
  for (const g of groups) {
    const gid = groupId(g);
    const ids = g.displayIds ?? g.members ?? g.displays ?? null;
    if (Array.isArray(ids)) {
      for (const d of displays) {
        const did = d.id ?? d.profileId;
        if (ids.includes(did)) { byGroup.get(gid).push(d); placed.add(did); }
      }
    }
  }
  // Fallback: membership stored on the display.
  for (const d of displays) {
    const did = d.id ?? d.profileId;
    if (placed.has(did)) continue;
    const cats = d.categoryIds ?? d.categories ?? [];
    let any = false;
    for (const c of cats) {
      const cid = categoryIdOf(c);
      if (byGroup.has(cid)) { byGroup.get(cid).push(d); any = true; }
    }
    if (any) placed.add(did);
  }
  const ungrouped = displays.filter(d => !placed.has(d.id ?? d.profileId));
  return { byGroup, ungrouped };
}

// One resolution for the whole app — see categoryIdOf in api.js for why the
// endpoint's own name wins over a row id.
const groupId = categoryIdOf;
const groupName = g => g.name ?? g.label ?? groupId(g);

export function mountDisplays(host) {
  host.classList.add('avs-displays');
  const render = () => {
    if (state.connection.status !== 'connected') {
      renderConnectGate(host, { title: t('cg.dispTitle'), desc: t('cg.dispDesc') });
      return;
    }
    const displays = state.fleet.displays ?? [];
    const groups = state.fleet.groups ?? [];

    const sel = state.ui.selectedDisplays ?? [];
    const flt = state.ui.displayFilter ?? {};
    const filteredDisplays = applyFilter(displays, flt);
    const onlineCount = displays.filter(d => d.isOnline || d.online || d.status === 'online').length;
    // Only when the server says there are more than we hold.
    const serverTotal = state.fleet.displaysTotal;
    const truncated = Number.isFinite(serverTotal) && serverTotal > displays.length;
    host.innerHTML = `
      <div class="avs-disp-toolbar">
        <h2 class="avs-disp-title">${t('disp.title')} <span class="avs-disp-count">${esc(filteredDisplays.length)}/${esc(displays.length)} · <span class="avs-dot avs-on" title="${t('disp.online')}"></span> ${esc(onlineCount)}</span>${truncated ? `<span class="avs-disp-partial" title="${esc(t('disp.partialHelp'))}">${esc(t('disp.partial', { shown: displays.length, total: serverTotal }))}</span>` : ''}</h2>
        <div class="avs-disp-tools">
          <button class="bb-btn bb-btn-secondary" data-act="refresh">↻ ${t('disp.refresh')}</button>
          <button class="bb-btn bb-btn-secondary" data-act="new-group">+ ${t('disp.newGroup')}</button>
          <button class="bb-btn bb-btn-primary" data-act="pair">+ ${t('disp.pair')}</button>
        </div>
      </div>
      <div class="avs-display-filter">
        <label class="avs-flex-row" style="margin-right:8px;font-size:12px;">
          <input type="checkbox" id="dlf-all" title="${tx('Select all filtered')}" ${filteredDisplays.length && filteredDisplays.every(d => sel.includes(d.id ?? d.profileId)) ? 'checked' : ''}>
          ${tx('All')}
        </label>
        <!-- Named, not just placeheld: a placeholder disappears the moment you
             type, and the first <option> of a select is its VALUE, not its
             name — a screen reader announced an unnamed text field and two
             unnamed comboboxes. -->
        <input id="dlf-q" type="search" aria-label="${tx('Search displays')}"
               placeholder="${tx('Search…')}" value="${esc(flt.q ?? '')}">
        <select id="dlf-status" aria-label="${tx('Filter by status')}">
          <option value="">${tx('Status: all')}</option>
          <option value="online" ${flt.status==='online'?'selected':''}>${tx('online')}</option>
          <option value="offline" ${flt.status==='offline'?'selected':''}>${tx('offline')}</option>
        </select>
        <select id="dlf-lock" aria-label="${tx('Filter by lock state')}">
          <option value="">${tx('Lock: any')}</option>
          <option value="locked" ${flt.lock==='locked'?'selected':''}>${tx('locked')}</option>
          <option value="unlocked" ${flt.lock==='unlocked'?'selected':''}>${tx('unlocked')}</option>
        </select>
        ${(flt.q || flt.status || flt.lock) ? `<button class="bb-btn" id="dlf-reset" title="${tx('Reset filter')}">×</button>` : ''}
      </div>
      ${sel.length ? `<div class="avs-bulkbar">
        <span class="avs-bulkbar-count">${t('bulk.selected', { n: sel.length })}</span>
        <div class="avs-bulkbar-actions">
          <button class="bb-btn" data-bulk="lock">${t('bulk.lock')}</button>
          <button class="bb-btn" data-bulk="unlock">${t('bulk.unlock')}</button>
          <button class="bb-btn" data-bulk="clear">${t('bulk.clear')}</button>
          <button class="bb-btn bb-btn-primary" data-bulk="publish">${t('bulk.publishHere')}</button>
          <button class="bb-btn" data-bulk="deselect">×</button>
        </div>
      </div>` : ''}
      ${displays.length === 0
        ? `<div class="bb-empty-state"><div class="bb-empty-illus">${uiIconSvg('tv', 44)}</div><div class="bb-empty-title">${t('disp.empty')}</div><div class="bb-empty-desc">${t('disp.emptyDesc')}</div><button class="bb-btn bb-btn-primary" data-act="pair-empty" style="margin-top:14px;">+ ${t('disp.pair')}</button></div>`
        : ''}
      <div class="avs-disp-groups" id="avs-disp-groups"></div>`;
    host.querySelector('#dlf-q')?.addEventListener('input', e => { state.ui.displayFilter.q = e.target.value; render(); });
    host.querySelector('#dlf-status')?.addEventListener('change', e => { state.ui.displayFilter.status = e.target.value; render(); });
    host.querySelector('#dlf-lock')?.addEventListener('change', e => { state.ui.displayFilter.lock = e.target.value; render(); });
    host.querySelector('#dlf-reset')?.addEventListener('click', () => {
      state.ui.displayFilter = { q: '', status: '', group: '', lock: '' };
      render();
    });
    host.querySelector('#dlf-all')?.addEventListener('change', e => {
      // "Select all" toggles selection across the CURRENTLY FILTERED set —
      // a master checkbox over a filtered list ignoring the filter is
      // confusing, so we scope to visible cards only.
      const ids = filteredDisplays.map(d => d.id ?? d.profileId);
      const cur = new Set(state.ui.selectedDisplays ?? []);
      if (e.target.checked) ids.forEach(id => cur.add(id));
      else ids.forEach(id => cur.delete(id));
      state.ui.selectedDisplays = [...cur];
      render();
    });
    host.querySelectorAll('[data-bulk]').forEach(b => b.addEventListener('click', () => runBulk(b.dataset.bulk)));

    host.querySelector('[data-act="refresh"]').addEventListener('click', refreshFleet);
    host.querySelector('[data-act="pair"]').addEventListener('click', pairModal);
    host.querySelector('[data-act="new-group"]').addEventListener('click', newGroup);
    host.querySelector('[data-act="pair-empty"]')?.addEventListener('click', pairModal);

    const groupsHost = host.querySelector('#avs-disp-groups');
    const { byGroup: byGroupFiltered, ungrouped: ungroupedFiltered } = membership(filteredDisplays, groups);

    // Build parent-child tree mapping from groups
    const byParent = new Map();
    const roots = [];
    const idMap = new Map(groups.map(g => [groupId(g), g]));

    for (const g of groups) {
      const parentId = g.parentCategoryId ?? g.parent_category_id;
      if (parentId && idMap.has(parentId)) {
        if (!byParent.has(parentId)) byParent.set(parentId, []);
        byParent.get(parentId).push(g);
      } else {
        roots.push(g);
      }
    }

    const renderTree = (g, level) => {
      const gid = groupId(g);
      const m = byGroupFiltered.get(gid) ?? [];
      if (m.length || !flt.q) {
        groupsHost.appendChild(groupSection(g, m, level));
      }
      const children = byParent.get(gid) ?? [];
      for (const child of children) {
        renderTree(child, level + 1);
      }
    };

    for (const g of roots) {
      renderTree(g, 0);
    }

    if (ungroupedFiltered.length) groupsHost.appendChild(groupSection(null, ungroupedFiltered, 0));
  };

  function applyFilter(ds, flt) {
    const q = (flt.q ?? '').toLowerCase();
    return ds.filter(d => {
      const online = d.status === 'online' || d.online === true;
      if (flt.status === 'online' && !online) return false;
      if (flt.status === 'offline' && online) return false;
      if (flt.lock === 'locked' && !d.locked) return false;
      if (flt.lock === 'unlocked' && d.locked) return false;
      if (q && !((d.name ?? '') + ' ' + (d.id ?? '')).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  async function runBulk(op) {
    const ids = state.ui.selectedDisplays ?? [];
    if (!ids.length) return;
    if (op === 'deselect') { state.ui.selectedDisplays = []; render(); return; }
    if (op === 'publish') { state.ui.selectedDisplays = []; openPublishPicker({ mode: 'multi', displayIds: ids }); return; }
    const fn = { lock: api.lock, unlock: api.unlock, clear: api.clear }[op];
    if (!fn) return;
    const results = await Promise.allSettled(ids.map(id => fn(id)));
    const failed = results.filter(r => r.status === 'rejected').length;
    toast(failed ? `${failed} ${tx('failed')}` : `${ids.length} ${tx('updated')}`, { kind: failed ? 'warn' : 'success' });
    state.ui.selectedDisplays = [];
    refreshFleet();
  }

  subscribe('fleet', render);
  subscribe('connection', render); // swap gate <-> dashboard on connect/disconnect
  render();
  refreshFleet();
}

function groupSection(group, members, level = 0) {
  const sec = document.createElement('section');
  sec.className = 'avs-group';
  if (level > 0) {
    sec.style.marginLeft = `${level * 24}px`;
    sec.style.borderLeft = '2px solid var(--bb-border, rgba(255, 255, 255, 0.08))';
    sec.style.paddingLeft = '16px';
  }
  const name = group ? groupName(group) : t('disp.ungrouped');
  sec.innerHTML = `
    <div class="avs-group-head">
      <div class="avs-group-name">
        <span class="avs-group-chip">${level > 0 ? t('disp.subGroup') : tx('Group')}</span> ${esc(name)}
        <span class="avs-group-count">${members.length}</span>
      </div>
      <div class="avs-group-actions">
        ${group ? `<button class="bb-btn bb-btn-primary" data-act="pub-group">${t('disp.publishGroup')}</button>` : ''}
        ${group ? `<button class="avs-iconbtn" data-act="rename-group" title="${t('disp.rename')}">✎</button>` : ''}
        ${group ? `<button class="avs-iconbtn" data-act="del-group" title="${t('disp.delete')}">${uiIconSvg('trash')}</button>` : ''}
      </div>
    </div>
    <div class="avs-card-grid"></div>`;

  if (group) {
    sec.querySelector('[data-act="pub-group"]').addEventListener('click', () => publishToGroup(groupId(group)));
    sec.querySelector('[data-act="rename-group"]').addEventListener('click', () => renameGroup(group));
    sec.querySelector('[data-act="del-group"]').addEventListener('click', () => delGroup(group));
  }
  const grid = sec.querySelector('.avs-card-grid');
  for (const d of members) grid.appendChild(displayCard(d));
  return sec;
}

function displayCard(d) {
  const id = d.id ?? d.profileId;
  const online = d.status === 'online' || d.online === true || d.isOnline === true;
  const running = state.fleet.running?.[id];
  const groups = state.fleet.groups ?? [];
  const selected = (state.ui.selectedDisplays ?? []).includes(id);
  const el = document.createElement('div');
  el.className = 'avs-display-card';
  // Device-class glyph from the capabilities response (cached on display object
  // from GET /agent/displays). Falls back to a generic display icon.
  const deviceIcon = uiIconSvg({
    desktop: 'monitor', mobile: 'smartphone', tablet: 'tablet', tv: 'tv', kiosk: 'monitor',
  }[d.deviceClass] ?? 'monitor', 16);
  el.innerHTML = `
    <div class="avs-dc-top">
      <input type="checkbox" class="avs-dc-check" data-bulk-id="${esc(id)}" ${selected ? 'checked' : ''} title="${tx('Select')}">
      <span class="avs-dc-dot ${online ? 'avs-on' : 'avs-off'}" title="${online ? t('disp.onlineHint') : t('disp.offlineHint')}"></span>
      <span class="avs-dc-deviceicon" title="${esc(d.deviceClass ?? 'display')}${d.deviceFamily ? ' · ' + esc(d.deviceFamily) : ''}">${deviceIcon}</span>
      <div class="avs-dc-id">
        <div class="avs-dc-name">${esc(d.name ?? id)}</div>
        <div class="avs-dc-sub">
          ${esc(id)} · ${online ? t('disp.online') : t('disp.offline')}${d.locked ? ` · <span class="avs-dc-flag" title="${tx('Locked')}">${uiIconSvg('lock', 11)}</span>` : ''}
          ${d.resolution ? ` · ${esc(d.resolution)}` : ''}
          ${d.hasTouch ? ` · <span class="avs-dc-flag" title="${tx('Touch input')}">${uiIconSvg('touch', 11)}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="avs-dc-running">${running ? `${uiIconSvg('play', 11)} ${t('disp.running')}: <b>${esc(running)}</b>` : `<span class="avs-dc-idle">${t('disp.idle')}</span>`}</div>
    <div class="avs-dc-group">
      <select data-act="assign" title="${t('disp.assignHint')}">
        <option value="">${t('disp.noGroup')}</option>
        ${groups.map(g => `<option value="${groupId(g)}">${esc(groupName(g))}</option>`).join('')}
      </select>
    </div>
    <div class="avs-dc-actions">
      <button class="bb-btn bb-btn-primary" data-act="pub">${t('disp.publish')}</button>
      <button class="avs-iconbtn" data-act="preview" title="${t('disp.preview')}">${uiIconSvg('eye')}</button>
      <button class="avs-iconbtn" data-act="lock" title="${d.locked ? t('disp.unlock') : t('disp.lock')}">${uiIconSvg(d.locked ? 'unlock' : 'lock')}</button>
      <button class="avs-iconbtn" data-act="details" title="${t('drawer.overview')}">${uiIconSvg('more')}</button>
    </div>`;

  el.querySelector('[data-bulk-id]').addEventListener('change', e => {
    const sel = new Set(state.ui.selectedDisplays ?? []);
    if (e.target.checked) sel.add(id); else sel.delete(id);
    state.ui.selectedDisplays = [...sel];
  });
  el.querySelector('[data-act="pub"]').addEventListener('click', () =>
    openPublishPicker({ mode: 'single', displayId: id }));
  el.querySelector('[data-act="preview"]').addEventListener('click', () => previewLink(id));
  el.querySelector('[data-act="lock"]').addEventListener('click', () => toggleLock(id, d.locked));
  el.querySelector('[data-act="details"]').addEventListener('click', () => drawer.open(id));
  el.querySelector('[data-act="assign"]').addEventListener('change', e => assignGroup(id, e.target.value));
  return el;
}

// ---------- actions ----------
export async function pairModal() {
  // Pairing has two shapes: a fresh display (name required), or a REBIND that
  // moves an existing profile onto the new hardware — content, group membership
  // and licence follow the profile, so a replaced screen keeps its identity.
  // The server ignores profileName on a rebind, hence the name field hides.
  const existing = state.fleet.displays ?? [];
  const box = document.createElement('div');
  box.innerHTML = `
    <p class="bb-form-help">${t('disp.pairHelp')}</p>
    <div class="bb-form-group"><label>${t('disp.pairCode')}</label>
      <input id="pc" maxlength="6" class="bb-pair-code" placeholder="ABCDEF" autocapitalize="characters" autocomplete="off"></div>
    <div class="bb-form-group"><label>${t('disp.pairTarget')}</label>
      <select id="pt">
        <option value="">${t('disp.pairTargetNew')}</option>
        ${existing.map(d => `<option value="${esc(d.id ?? '')}">${t('disp.pairTargetRebind', { name: esc(d.name ?? d.id ?? '') })}</option>`).join('')}
      </select>
      <p class="bb-form-help">${t('disp.pairTargetHelp')}</p>
    </div>
    <div class="bb-form-group" id="pn-group"><label>${t('disp.name')}</label><input id="pn" placeholder="${tx('Lobby TV')}"></div>`;
  box.querySelector('#pt').addEventListener('change', e => {
    box.querySelector('#pn-group').style.display = e.target.value ? 'none' : '';
  });
  const ok = await openModal({ title: t('disp.pair'), body: box, actions: [{ label: t('common.cancel') }, { label: t('disp.pair'), kind: 'primary', value: 1 }] });
  if (!ok) return false;
  const code = box.querySelector('#pc').value.trim().toUpperCase();
  const name = box.querySelector('#pn').value.trim();
  const targetDisplayId = box.querySelector('#pt').value;
  if (!code) return false;
  try {
    await api.pairByCode(targetDisplayId ? { code, targetDisplayId } : { code, profileName: name });
    toast(t(targetDisplayId ? 'disp.rebound' : 'disp.paired'), { kind: 'success' });
    refreshFleet();
    return true;
  }
  catch (e) { toast(e.message, { kind: 'error' }); return false; }
}

async function previewLink(id) {
  try {
    const r = await api.previewLink(id, PREVIEW_LINK_TTL_S);
    // Verified server canonical key is `previewUrl`. Other variants surface
    // via different historical paths — try them all before giving up.
    const url = r?.previewUrl ?? r?.url ?? r?.previewLink ?? r?.shareUrl ?? r?.link;
    if (!url) throw new Error('No preview URL');
    window.open(url, '_blank', 'noopener');
  } catch (e) { toast(e.message, { kind: 'error' }); }
}

async function toggleLock(id, locked) {
  try { locked ? await api.unlock(id) : await api.lock(id); refreshFleet(); }
  catch (e) { toast(e.message, { kind: 'error' }); }
}

async function assignGroup(displayId, groupIdVal) {
  try {
    await groupsApi.setForDisplay(displayId, groupIdVal ? [groupIdVal] : []);
    toast(t('disp.assigned'), { kind: 'success' }); refreshFleet();
  } catch (e) { toast(e.message, { kind: 'error' }); }
}

async function newGroup() {
  const groups = state.fleet.groups ?? [];
  const parentOptions = groups.map(g => `<option value="${groupId(g)}">${esc(groupName(g))}</option>`).join('');
  const box = document.createElement('div');
  box.innerHTML = `
    <div class="bb-form-group"><label>${t('disp.groupName')}</label><input id="gn" placeholder="${tx('Foyer')}"></div>
    <div class="bb-form-group">
      <label>${t('disp.parentGroup')}</label>
      <select id="gpg">
        <option value="">${t('disp.noParentGroup')}</option>
        ${parentOptions}
      </select>
    </div>`;
  const ok = await openModal({ title: t('disp.newGroup'), body: box, actions: [{ label: t('common.cancel') }, { label: t('disp.pair') || tx('Create'), kind: 'primary', value: 1 }] });
  if (!ok) return;
  const name = box.querySelector('#gn').value.trim();
  const parentCategoryId = box.querySelector('#gpg').value || undefined;
  if (!name) return;
  try {
    await groupsApi.create({ name, parentCategoryId });
    toast(t('disp.groupCreated'), { kind: 'success' });
    refreshFleet();
  }
  catch (e) { toast(e.message, { kind: 'error' }); }
}

async function renameGroup(g) {
  const groups = state.fleet.groups ?? [];
  const gId = groupId(g);
  const currentParentId = g.parentCategoryId ?? g.parent_category_id ?? '';

  // Cycle prevention: Exclude current group and its descendants
  const descendants = new Set();
  const findDescendants = (id) => {
    for (const other of groups) {
      const pid = other.parentCategoryId ?? other.parent_category_id;
      if (pid === id && !descendants.has(groupId(other))) {
        descendants.add(groupId(other));
        findDescendants(groupId(other));
      }
    }
  };
  findDescendants(gId);

  const parentOptions = groups
    .filter(other => groupId(other) !== gId && !descendants.has(groupId(other)))
    .map(other => `<option value="${groupId(other)}" ${groupId(other) === currentParentId ? 'selected' : ''}>${esc(groupName(other))}</option>`)
    .join('');

  const box = document.createElement('div');
  box.innerHTML = `
    <div class="bb-form-group"><label>${t('disp.groupName')}</label><input id="gn" value="${esc(groupName(g))}"></div>
    <div class="bb-form-group">
      <label>${t('disp.parentGroup')}</label>
      <select id="gpg">
        <option value="" ${!currentParentId ? 'selected' : ''}>${t('disp.noParentGroup')}</option>
        ${parentOptions}
      </select>
    </div>`;

  const ok = await openModal({ title: t('disp.rename'), body: box, actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', value: 1 }] });
  if (!ok) return;
  const name = box.querySelector('#gn').value.trim();
  const parentCategoryId = box.querySelector('#gpg').value || null;
  try {
    await groupsApi.patch(gId, { name, parentCategoryId });
    refreshFleet();
  }
  catch (e) { toast(e.message, { kind: 'error' }); }
}

async function delGroup(g) {
  const ok = await openModal({ title: t('disp.delete'), body: (() => { const b = document.createElement('div'); b.textContent = t('disp.delGroupConfirm', { name: groupName(g) }); return b; })(), actions: [{ label: t('common.cancel') }, { label: t('common.delete'), kind: 'danger', value: 1 }] });
  if (!ok) return;
  try { await groupsApi.remove(groupId(g)); refreshFleet(); }
  catch (e) { toast(e.message, { kind: 'error' }); }
}

