// Per-Display Drawer — slides in from the right edge with 5 tabs:
//   Übersicht · Genehmigung · Einstellungen · Zugriff · Diagnose
//
// open(displayId) is the only entry-point. The drawer mounts itself once
// (idempotent), populates from `state.fleet.displays`, and lazily fetches
// per-tab data on demand.

import { state } from '../store.js';
import {
  displays as displaysApi, approval as approvalApi, grants as grantsApi,
  licensing as licensingApi, auth as authApi, slots as slotsApi, storeTemplates,
} from '../api.js';
import { t, tx } from '../i18n.js';
import { toast } from './toast.js';
import { extractSlotRefs } from '../../shared/store-template-preview.js';

const TABS = [
  { id: 'overview',     label: () => t('drawer.overview') },
  { id: 'content',      label: () => t('drawer.content') },
  { id: 'approval',     label: () => t('drawer.approval') },
  { id: 'settings',     label: () => t('drawer.settings') },
  { id: 'access',       label: () => t('drawer.access') },
  { id: 'diagnostics',  label: () => t('drawer.diagnostics') },
];

// Per-display memory of the slot keys a Studio-initiated send installed, so the
// "Inhalte" tab can list them even before the display re-renders. displayId →
// [{ key, slug, readUrl }].
const _installedSlots = new Map();

let root = null;
let backdrop = null;
let currentId = null;
// Remember which DOM element had focus before the drawer opened so we can
// hand focus back when it closes — keyboard users shouldn't get dumped at
// the top of the page.
let lastFocusedBeforeOpen = null;

function ensureMounted() {
  if (root) return;
  backdrop = document.createElement('div');
  backdrop.className = 'avs-drawer-backdrop';
  backdrop.addEventListener('click', close);
  root = document.createElement('aside');
  root.className = 'avs-drawer';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <header class="avs-drawer-head">
      <h3 id="drw-title">…</h3>
      <button class="avs-drawer-close" aria-label="${t('drawer.close')}">×</button>
    </header>
    <nav class="avs-drawer-tabs" id="drw-tabs"></nav>
    <div class="avs-drawer-body" id="drw-body"></div>`;
  document.body.append(backdrop, root);
  root.querySelector('.avs-drawer-close').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('avs-on')) close(); });
}

export function open(displayId) {
  ensureMounted();
  currentId = displayId;
  const d = (state.fleet.displays ?? []).find(x => x.id === displayId);
  root.querySelector('#drw-title').textContent = d?.name ?? displayId;
  const tabsBar = root.querySelector('#drw-tabs');
  tabsBar.innerHTML = TABS.map(tab =>
    `<button class="avs-drawer-tab" data-tab="${tab.id}">${tab.label()}</button>`).join('');
  tabsBar.querySelectorAll('.avs-drawer-tab').forEach(b => {
    b.setAttribute('role', 'tab');
    b.setAttribute('tabindex', '0');
    b.addEventListener('click', () => switchTab(b.dataset.tab));
    // Keyboard navigation between tabs — left/right cycles, Home/End jump.
    b.addEventListener('keydown', e => {
      const tabsEls = [...tabsBar.querySelectorAll('.avs-drawer-tab')];
      const i = tabsEls.indexOf(b);
      let next = null;
      if (e.key === 'ArrowRight') next = tabsEls[(i + 1) % tabsEls.length];
      else if (e.key === 'ArrowLeft') next = tabsEls[(i - 1 + tabsEls.length) % tabsEls.length];
      else if (e.key === 'Home') next = tabsEls[0];
      else if (e.key === 'End') next = tabsEls[tabsEls.length - 1];
      if (next) { e.preventDefault(); next.focus(); switchTab(next.dataset.tab); }
    });
  });
  tabsBar.setAttribute('role', 'tablist');
  switchTab(state.ui.displayDrawerTab ?? 'overview');
  // Open immediately — a setTimeout(0) is needed so the initial off-screen
  // translateX(100%) gets painted once, then the class swap animates in. We
  // use setTimeout instead of requestAnimationFrame so the drawer still opens
  // when the page is in the background (rAF is paused when document.hidden).
  // We also clear any stale inline transform from a prior close() interruption.
  backdrop.style.opacity = '';
  root.style.transform = '';
  setTimeout(() => {
    backdrop.classList.add('avs-on');
    root.classList.add('avs-on');
    // Move keyboard focus into the drawer (currently-active tab button) so
    // arrow-key + tab navigation feels natural. Remember the opener element
    // so close() can put focus back where it was.
    lastFocusedBeforeOpen = document.activeElement;
    root.querySelector('.avs-drawer-tab.avs-on')?.focus?.();
  }, 0);
  state.ui.displayDrawer = displayId;
}

export function close() {
  if (!root) return;
  backdrop.classList.remove('avs-on');
  root.classList.remove('avs-on');
  state.ui.displayDrawer = null;
  currentId = null;
  // Restore focus to the element that opened the drawer if it's still in the DOM.
  try { lastFocusedBeforeOpen?.focus?.(); } catch {}
  lastFocusedBeforeOpen = null;
}

function switchTab(id) {
  state.ui.displayDrawerTab = id;
  root.querySelectorAll('.avs-drawer-tab').forEach(b => b.classList.toggle('avs-on', b.dataset.tab === id));
  const body = root.querySelector('#drw-body');
  body.innerHTML = '<div class="avs-admin-loading">…</div>';
  Promise.resolve(({
    overview: renderOverview,
    content: renderContent,
    approval: renderApproval,
    settings: renderSettings,
    access: renderAccess,
    diagnostics: renderDiagnostics,
  })[id]?.(body, currentId)).catch(e => {
    body.innerHTML = `<div class="avs-admin-error">${esc(e?.message ?? tx('Error'))}</div>`;
  });
}

// ---------- Tabs ----------

async function renderOverview(body, id) {
  const d = (state.fleet.displays ?? []).find(x => x.id === id) ?? {};
  let caps = null;
  try { caps = await displaysApi.capabilities(id); } catch { caps = null; }
  // Real shape (verified against agentview.de): caps.runtime.{browser,screen,features,input,platform}
  // + caps.status.{isOnline, lastSeen, statusHint, isReachable}.
  const rt = caps?.runtime ?? {};
  const br = rt.browser ?? {};
  const sz = rt.screen ?? caps?.screen ?? {};
  const ft = rt.features ?? {};
  const inp = rt.input ?? {};
  const stat = caps?.status ?? {};
  const lastSeen = stat.lastSeen ?? d.lastSeen ?? d.lastFallbackPollAt ?? '—';
  const isOnline = d.isOnline ?? d.online ?? (d.status === 'online');
  body.innerHTML = `
    <h4>${tx('Status')}</h4>
    <p>${isOnline ? '🟢 Online' : '⚫ Offline'} ·
       <span class="avs-muted">${esc(d.id)}</span></p>
    <p class="avs-muted">${t('drawer.lastSeen')}: ${esc(lastSeen)}</p>
    ${d.statusHint ? `<p class="avs-muted">💬 ${esc(d.statusHint)}</p>` : ''}
    <h4>${tx('Currently running')}</h4>
    <p>${esc(state.fleet.running?.[id] ?? '—')}</p>
    <h4>${t('drawer.capabilities')}</h4>
    <div class="avs-capbadges">
      ${sz.width ? `<span class="avs-capbadge" title="${tx('Resolution')}">📐 ${esc(sz.width)}×${esc(sz.height)}${sz.devicePixelRatio && sz.devicePixelRatio !== 1 ? ` @ ${esc(sz.devicePixelRatio)}x` : ''}</span>` : ''}
      ${br.name ? `<span class="avs-capbadge" title="Browser">🌐 ${esc(br.name)} ${esc(br.major ?? br.version ?? '')}</span>` : ''}
      ${rt.platform?.name ? `<span class="avs-capbadge" title="${tx('Operating system')}">💻 ${esc(rt.platform.name)}</span>` : ''}
      ${inp.hasTouch || rt.hasTouch ? `<span class="avs-capbadge" title="${tx('Touch input')}">👆 Touch</span>` : ''}
      ${ft.supportsFetch !== false ? `<span class="avs-capbadge" title="HTTP fetch()">📡 fetch</span>` : ''}
      ${ft.supportsWebSockets !== false ? `<span class="avs-capbadge" title="WebSockets">🔌 WS</span>` : ''}
      ${ft.supportsCssVariables !== false ? `<span class="avs-capbadge" title="CSS Custom Properties">🎨 CSS-Vars</span>` : ''}
      ${ft.supportsBackdropFilter ? `<span class="avs-capbadge" title="backdrop-filter">✨ Backdrop</span>` : ''}
      ${ft.supportsWebGl ? `<span class="avs-capbadge" title="WebGL">🎮 WebGL</span>` : ''}
      ${ft.canRunCustomJavaScript === false ? `<span class="avs-capbadge" title="${tx('JavaScript blocked')}">🚫 JS</span>` : ''}
    </div>
    ${rt.knownLimitations?.length ? `<p class="avs-muted" style="margin-top:8px;">⚠️ ${esc(rt.knownLimitations.join(', '))}</p>` : ''}
    <h4 style="margin-top:20px;">${tx('Actions')}</h4>
    <div class="avs-flex-row">
      <button class="bb-btn" id="dw-preview">${t('drawer.openPreview')}</button>
    </div>`;
  body.querySelector('#dw-preview').addEventListener('click', async () => {
    try {
      const r = await displaysApi.previewLink(id);
      // Server canonical key is previewUrl; older docs/MCP variants also surface
      // url / previewLink / shareUrl — try them all.
      const url = r?.previewUrl ?? r?.url ?? r?.previewLink ?? r?.shareUrl ?? r?.link;
      if (url) window.open(url, '_blank', 'noopener');
      else toast(tx('No preview URL received'), { kind: 'warn' });
    } catch (e) { toast(e.message, { kind: 'error' }); }
  });
}

// ---------- Inhalte (content console for one display) ----------
// Four sections: current content + preview · editable data-slots · send a store
// template here · edit/send raw HTML. Covers both round-trips: store template →
// edit → send, and load-from-display → edit → send back.
async function renderContent(body, id) {
  body.innerHTML = `<div class="avs-admin-loading">…</div>`;
  let info = null, html = '';
  const [meta, htmlRes] = await Promise.all([
    displaysApi.contentState(id).catch(() => null),
    displaysApi.readHtml(id).catch(() => null),
  ]);
  info = meta;
  html = htmlRes?.html ?? '';

  body.innerHTML = `
    <h4>${t('content.current')}</h4>
    <p class="avs-muted">${esc(info?.currentContentDescription ?? '—')}</p>
    <div class="avs-ct-preview">${html
      ? '<iframe class="avs-ct-frame" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>'
      : `<p class="avs-muted">${t('content.noContent')}</p>`}</div>
    <div class="avs-flex-row" style="margin-top:8px;">
      <button class="bb-btn" id="ct-refresh">${t('content.refresh')}</button>
      <button class="bb-btn" id="ct-view">${t('content.viewOnDisplay')}</button>
    </div>

    <h4 style="margin-top:22px;">${t('content.slots')}</h4>
    <p class="bb-form-help">${t('content.refreshHint')}</p>
    <div id="ct-slots"></div>

    <h4 style="margin-top:22px;">${t('content.sendTemplate')}</h4>
    <div id="ct-tpl"></div>

    <h4 style="margin-top:22px;">${t('content.editHtml')}</h4>
    <textarea id="ct-html" class="bb-mono" rows="6" spellcheck="false">${esc(html)}</textarea>
    <div class="avs-flex-row" style="margin-top:8px;">
      <button class="bb-btn" id="ct-validate">${t('content.validate')}</button>
      <button class="bb-btn bb-btn-primary" id="ct-send-html">${t('content.sendHtml')}</button>
    </div>
    <div id="ct-html-out" style="margin-top:8px;"></div>`;

  if (html) body.querySelector('.avs-ct-frame').srcdoc = html;
  body.querySelector('#ct-refresh').addEventListener('click', () => switchTab('content'));
  body.querySelector('#ct-view').addEventListener('click', async () => {
    try {
      const r = await displaysApi.previewLink(id);
      const url = r?.previewUrl ?? r?.url ?? r?.previewLink ?? r?.shareUrl ?? r?.link;
      if (url) window.open(url, '_blank', 'noopener'); else toast(t('content.noPreview'), { kind: 'warn' });
    } catch (e) { toast(e.message, { kind: 'error' }); }
  });
  body.querySelector('#ct-validate').addEventListener('click', async () => {
    const out = body.querySelector('#ct-html-out');
    out.innerHTML = '…';
    try {
      const r = await displaysApi.testContent(body.querySelector('#ct-html').value);
      out.innerHTML = `<pre class="avs-codeblock">${esc(JSON.stringify(r, null, 2))}</pre>`;
    } catch (e) { out.innerHTML = `<div class="avs-admin-error">${esc(e.message)}</div>`; }
  });
  body.querySelector('#ct-send-html').addEventListener('click', async () => {
    try {
      await displaysApi.sendContent(id, body.querySelector('#ct-html').value, { description: 'agentView Studio' });
      toast(t('content.sent'), { kind: 'success' });
    } catch (e) { toast(e.message, { kind: 'error' }); }
  });

  renderContentSlots(body.querySelector('#ct-slots'), id, html);
  renderContentTemplatePicker(body.querySelector('#ct-tpl'), id);
}

async function renderContentSlots(host, id, html) {
  // Slugs feeding this display: what Studio just installed ∪ what's parseable
  // from the rendered HTML's read URLs / leftover placeholders.
  const installed = _installedSlots.get(id) ?? [];
  const refs = extractSlotRefs(html);
  const slugs = [...new Set([...installed.map(s => s.slug), ...refs.map(r => r.slug)])].filter(Boolean);
  if (!slugs.length) { host.innerHTML = `<p class="avs-muted">${t('content.noSlots')}</p>`; return; }
  host.innerHTML = `<div class="avs-admin-loading">…</div>`;
  const entries = await Promise.all(slugs.map(async slug => {
    try { return { slug, value: await slotsApi.getValue(slug), ok: true }; }
    catch (e) { return { slug, error: e.message, ok: false }; }
  }));
  host.innerHTML = entries.map(en => `
    <div class="bb-form-group avs-ct-slot" data-slug="${esc(en.slug)}">
      <label>${esc(en.slug)}</label>
      ${en.ok
        ? `<textarea class="bb-mono avs-ct-slot-json" rows="6" spellcheck="false">${esc(JSON.stringify(en.value, null, 2))}</textarea>
           <div class="avs-flex-row" style="margin-top:6px;">
             <button class="bb-btn bb-btn-primary" data-save>${t('content.save')}</button>
             <span class="avs-tpl-err" data-err></span>
           </div>`
        : `<p class="avs-muted">${t('content.slotReadFailed')}: ${esc(en.error)}</p>`}
    </div>`).join('');
  host.querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', async () => {
    const row = btn.closest('.avs-ct-slot');
    const slug = row.dataset.slug;
    const ta = row.querySelector('.avs-ct-slot-json');
    const errEl = row.querySelector('[data-err]');
    let parsed;
    try { parsed = JSON.parse(ta.value); } catch { errEl.textContent = t('content.invalidJson'); return; }
    errEl.textContent = '';
    try { await slotsApi.put(slug, parsed); toast(t('content.saved'), { kind: 'success' }); }
    catch (e) { toast(e.message, { kind: 'error' }); }
  }));
}

async function renderContentTemplatePicker(host, id) {
  host.innerHTML = `
    <input type="search" class="avs-lib-search" id="ct-tpl-search" placeholder="${esc(t('store.search'))}">
    <div class="avs-ct-tpl-list" id="ct-tpl-list"></div>`;
  const search = host.querySelector('#ct-tpl-search');
  const list = host.querySelector('#ct-tpl-list');
  let timer = null, lastQ = null;
  const run = async () => {
    const q = search.value.trim(); lastQ = q;
    list.innerHTML = `<div class="avs-admin-loading">…</div>`;
    try {
      const r = await storeTemplates.search(q);
      if (q !== lastQ) return;
      const arr = Array.isArray(r) ? r : (r?.templates ?? r?.items ?? []);
      if (!arr.length) { list.innerHTML = `<p class="avs-muted">${t('store.empty')}</p>`; return; }
      list.innerHTML = arr.slice(0, 12).map(tpl => {
        const slug = tpl.slug ?? tpl.id ?? '';
        const title = tpl.title ?? tpl.name ?? slug;
        return `<div class="avs-ct-tpl-row">
          <span class="avs-ct-tpl-title">${esc(title)}</span>
          <button class="bb-btn bb-btn-primary" data-send-tpl="${esc(slug)}">${t('store.send')}</button>
        </div>`;
      }).join('');
      list.querySelectorAll('[data-send-tpl]').forEach(b =>
        b.addEventListener('click', () => sendTemplateToDisplay(b.dataset.sendTpl, id)));
    } catch (e) { list.innerHTML = `<p class="avs-muted">${esc(e.message)}</p>`; }
  };
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 300); });
  run();
}

async function sendTemplateToDisplay(slug, id) {
  try {
    const res = await storeTemplates.sendToDisplay(slug, id);
    const installed = res?.installedSlots ?? res?.slots ?? [];
    if (Array.isArray(installed) && installed.length) {
      _installedSlots.set(id, installed.map(s => ({ key: s.key, slug: s.slug ?? s.key, readUrl: s.readUrl })));
    }
    toast(t('content.sent'), { kind: 'success' });
    switchTab('content');
  } catch (e) { toast(e.message, { kind: 'error' }); }
}

async function renderApproval(body, id) {
  const d = (state.fleet.displays ?? []).find(x => x.id === id) ?? {};
  body.innerHTML = `
    <h4>${tx('Approval mode')}</h4>
    <div class="bb-bezel-selector" id="ap-bezel">
      <button class="bb-bezel-btn" data-mode="off">${t('approval.modeOff')}</button>
      <button class="bb-bezel-btn" data-mode="on">${t('approval.modeOn')}</button>
    </div>
    <div id="ap-pending-area" style="margin-top:16px;">…</div>
    <h4 style="margin-top:24px;">${t('approval.rollback')}</h4>
    <p class="bb-form-help">${tx('Restores the previous content, in case this display just received an unwanted push.')}</p>
    <button class="bb-btn" id="ap-rollback">${t('approval.rollback')}</button>`;
  // Server-verified pattern: GET /approval-state returns BOTH the current
  // mode and the pending submission in one object — replaces our earlier
  // PUT-no-op workaround.
  const refresh = async () => {
    let r;
    try { r = await approvalApi.state(id); }
    catch (e) {
      body.querySelector('#ap-pending-area').innerHTML = `<p class="avs-muted">${tx('Status query failed')}: ${esc(e.message)}</p>`;
      return;
    }
    // Verified live shape: { requireApproval: bool, current, pending, previous }.
    // The reply mentioned `mode` as a string — server actually uses
    // `requireApproval: bool`. Tolerate both for forward compat.
    const mode = r?.mode ?? (r?.requireApproval ? 'on' : 'off');
    body.querySelectorAll('#ap-bezel [data-mode]').forEach(x => x.classList.toggle('bb-on', x.dataset.mode === mode));
    d.approvalMode = mode;
    // Pending is always an object — detect "actually pending" by checking
    // for non-null fields. When nothing is pending, all sub-fields are null.
    const p = r?.pending;
    const hasPending = p && (p.submittedAt || p.versionId || p.fileName || p.description);
    const area = body.querySelector('#ap-pending-area');
    if (!hasPending) {
      const cur = r?.current;
      const prev = r?.previous;
      area.innerHTML = `<p class="avs-muted">${tx('No pending submissions.')}</p>
        ${cur?.description ? `<p class="avs-muted" style="font-size:12px;margin-top:6px;">${tx('Currently live')}: <b>${esc(cur.description)}</b></p>` : ''}
        ${prev?.versionId ? `<p class="avs-muted" style="font-size:12px;">${tx('Previous version available (rollback possible)')}</p>` : ''}`;
      return;
    }
    area.innerHTML = `
      <h4>${t('approval.pending')}</h4>
      <p>${esc((p.submittedAt ?? '').slice(0, 19))} · ${esc(p.submittedBy ?? p.submittedByUserId ?? '—')}</p>
      <p>${esc(p.description ?? p.contentDescription ?? '—')}</p>
      <div class="avs-flex-row" style="margin-top:8px;">
        <button class="bb-btn bb-btn-primary" id="ap-accept">${t('approval.accept')}</button>
        <button class="bb-btn" id="ap-reject">${t('approval.reject')}</button>
        ${p.previewUrl ? `<a href="${esc(p.previewUrl)}" target="_blank" rel="noopener" class="bb-btn" style="margin-left:auto;">${tx('Preview')} ↗</a>` : (d.approvalUrl ? `<a href="${esc(d.approvalUrl)}" target="_blank" rel="noopener" class="bb-btn" style="margin-left:auto;">${tx('View in portal')} ↗</a>` : '')}
      </div>`;
    area.querySelector('#ap-accept').addEventListener('click', async () => {
      try { await approvalApi.accept(id); toast(t('approval.accept'), { kind: 'success' }); refresh(); }
      catch (e) { toast(e.message, { kind: 'error' }); }
    });
    area.querySelector('#ap-reject').addEventListener('click', async () => {
      try { await approvalApi.reject(id); toast(t('approval.reject'), { kind: 'success' }); refresh(); }
      catch (e) { toast(e.message, { kind: 'error' }); }
    });
  };
  body.querySelectorAll('#ap-bezel [data-mode]').forEach(b => b.addEventListener('click', async () => {
    try {
      await approvalApi.setMode(id, b.dataset.mode);
      toast(t('common.saved'), { kind: 'success' });
      refresh();
    } catch (e) { toast(e.message, { kind: 'error' }); }
  }));
  body.querySelector('#ap-rollback').addEventListener('click', async () => {
    try { await approvalApi.rollback(id); toast(t('approval.rollback'), { kind: 'success' }); refresh(); }
    catch (e) { toast(e.message, { kind: 'error' }); }
  });
  refresh();
}

async function renderSettings(body, id) {
  const d = (state.fleet.displays ?? []).find(x => x.id === id) ?? {};

  let currentLockId = '';
  try {
    const lockRes = await displaysApi.getSourceLock(id);
    currentLockId = lockRes?.apiKeyId ?? lockRes?.lockedToApiKeyId ?? lockRes?.id ?? lockRes?.keyId ?? '';
  } catch (e) {
    console.warn("Failed to fetch source lock status", e);
    toast(`${tx('Source lock status could not be loaded')}: ${e.message}`, { kind: 'warn' });
  }

  let apiKeys = [];
  try {
    const keysRes = await authApi.apiKeyList();
    apiKeys = Array.isArray(keysRes) ? keysRes : (keysRes?.apiKeys ?? keysRes?.items ?? []);
  } catch (e) {
    console.warn("Failed to fetch API keys", e);
    toast(`${tx('API keys could not be loaded')}: ${e.message}`, { kind: 'warn' });
  }

  body.innerHTML = `
    <h4>${tx('Permissions')}</h4>
    <label class="avs-flex-row"><input type="checkbox" id="cam" ${d.allowCamera ? 'checked' : ''}> ${tx('Camera')}</label>
    <label class="avs-flex-row"><input type="checkbox" id="mic" ${d.allowMicrophone ? 'checked' : ''}> ${tx('Microphone')}</label>
    <label class="avs-flex-row"><input type="checkbox" id="geo" ${d.allowGeolocation ? 'checked' : ''}> ${tx('Location')}</label>

    <h4>${t('drawer.lock')}</h4>
    <div class="bb-bezel-selector">
      <button class="bb-bezel-btn ${d.locked ? '' : 'bb-on'}" data-lock="off">${tx('Unlocked')}</button>
      <button class="bb-bezel-btn ${d.locked ? 'bb-on' : ''}" data-lock="on">${tx('Locked')}</button>
    </div>

    <h4>${t('drawer.sourceLockTitle') || tx('Source lock')}</h4>
    <p class="bb-form-help">${t('drawer.sourceLockHelp') || tx('Binds the display exclusively to a specific API key. Other API keys can then no longer send content to this display.')}</p>
    <select id="s-lock-select" style="width: 100%; padding: 6px 8px; margin-bottom: 12px; background: var(--bb-bg-2); border: 1px solid var(--bb-border); color: var(--bb-ink); border-radius: var(--bb-r-sm);">
      <option value="">${t('drawer.noSourceLock') || tx('(No source lock)')}</option>
      ${apiKeys.map(k => `<option value="${k.id}" ${k.id === currentLockId ? 'selected' : ''}>${esc(k.name ?? k.id)}</option>`).join('')}
    </select>

    <h4>${t('drawer.privacy')}</h4>
    <select id="priv">
      <option value="private" ${d.privacyMode === 'private' ? 'selected' : ''}>${tx('Private (1h TTL)')}</option>
      <option value="public" ${d.privacyMode === 'public' ? 'selected' : ''}>${tx('Public (24h TTL)')}</option>
    </select>

    <h4>${t('drawer.embedOrigins')}</h4>
    <textarea id="origins" rows="3" placeholder="https://customer.com\nhttps://shop.example.com">${esc((d.embeddableOrigins ?? []).join('\n'))}</textarea>

    <h4 style="margin-top:16px;">${t('drawer.idleContent')}</h4>
    <textarea id="idle" rows="3" placeholder="<div>${tx('Idle mode')}</div>">${esc(d.idleContent ?? '')}</textarea>

    <h4>${t('drawer.gdprTitle')}</h4>
    <p class="bb-form-help">${t('drawer.gdprHelp')}</p>
    <div class="avs-flex-row" style="flex-wrap: wrap; gap: 6px; margin-bottom: 16px;">
      <button class="bb-btn" id="s-rot-managed">${t('drawer.rotManaged')}</button>
      <button class="bb-btn bb-btn-danger" id="s-rev-managed">${t('drawer.revManaged')}</button>
      <button class="bb-btn" id="s-rot-recovery">${t('drawer.rotRecovery')}</button>
    </div>

    <div class="avs-flex-row" style="margin-top:16px;">
      <button class="bb-btn bb-btn-primary" id="s-save">${t('common.save')}</button>
    </div>`;
  body.querySelectorAll('[data-lock]').forEach(b => b.addEventListener('click', async () => {
    try {
      if (b.dataset.lock === 'on') await displaysApi.lock(id);
      else await displaysApi.unlock(id);
      body.querySelectorAll('[data-lock]').forEach(x => x.classList.toggle('bb-on', x === b));
    } catch (e) { toast(e.message, { kind: 'error' }); }
  }));
  body.querySelector('#s-save').addEventListener('click', async () => {
    try {
      await displaysApi.configure(id, {
        allowCamera: body.querySelector('#cam').checked,
        allowMicrophone: body.querySelector('#mic').checked,
        allowGeolocation: body.querySelector('#geo').checked,
      });
      await displaysApi.setPrivacyMode(id, body.querySelector('#priv').value);
      
      const selectedKeyId = body.querySelector('#s-lock-select').value || null;
      await displaysApi.setSourceLock(id, selectedKeyId);

      const origins = body.querySelector('#origins').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (origins.length) await displaysApi.setEmbeddableOrigins(id, origins).catch(() => {});
      const idle = body.querySelector('#idle').value.trim();
      if (idle) await displaysApi.setDefault(id, idle).catch(() => {});
      toast(t('common.saved'), { kind: 'success' });
    } catch (e) { toast(e.message, { kind: 'error' }); }
  });
  body.querySelector('#s-rot-managed').addEventListener('click', async () => {
    const proceed = confirm(t('drawer.rotManagedConfirm'));
    if (!proceed) return;
    try {
      await displaysApi.rotateManagedSecret(id);
      toast(t('drawer.rotManagedSuccess'), { kind: 'success' });
    } catch (e) { toast(e.message, { kind: 'error' }); }
  });
  body.querySelector('#s-rev-managed').addEventListener('click', async () => {
    const proceed = confirm(t('drawer.revManagedConfirm'));
    if (!proceed) return;
    try {
      await displaysApi.revokeManagedSecret(id);
      toast(t('drawer.revManagedSuccess'), { kind: 'success' });
    } catch (e) { toast(e.message, { kind: 'error' }); }
  });
  body.querySelector('#s-rot-recovery').addEventListener('click', async () => {
    const proceed = confirm(t('drawer.rotRecoveryConfirm'));
    if (!proceed) return;
    try {
      await displaysApi.rotateRecoverySecret(id);
      toast(t('drawer.rotRecoverySuccess'), { kind: 'success' });
    } catch (e) { toast(e.message, { kind: 'error' }); }
  });
}

async function renderAccess(body, id) {
  const d = (state.fleet.displays ?? []).find(x => x.id === id) ?? {};
  const orgId = d.orgId ?? state.fleet.activeOrgId;
  const isPersonal = !d.orgId;
  body.innerHTML = `
    <h4>${t('drawer.grants')}</h4>
    ${isPersonal
      ? `<p class="bb-form-help">⚠ ${tx('Per-user grants are only available for displays assigned to an organization. This display is personal.')}</p>`
      : `<p class="bb-form-help">Org-scoped: PUT / DELETE ${tx('on')} <code>/agent/organizations/${esc(orgId)}/displays/${esc(id)}/grants/{userId}</code></p>
         <div id="grants-list">…</div>
         <div class="avs-flex-row" style="margin-top:8px;">
           <input id="g-uid" placeholder="${tx('User ID')}" style="flex:1;">
           <select id="g-lvl"><option value="view">view</option><option value="control">control</option></select>
           <button class="bb-btn" id="g-add">${t('admin.add')}</button>
         </div>`}

    <h4 style="margin-top:24px;">${t('drawer.license')}</h4>
    <p class="bb-form-help">POST /agent/displays/${esc(id)}/(un)assign-license. ${tx('Pool capacity is not reduced when unassigning (server design decision).')}</p>
    <div class="avs-flex-row">
      <button class="bb-btn bb-btn-primary" id="lic-assign">${t('drawer.assignLicense')}</button>
      <button class="bb-btn" id="lic-unassign">${t('drawer.unassignLicense')}</button>
    </div>`;

  if (!isPersonal) {
    // Best-effort grants fetch — the endpoint may 404 until the agentView
    // team's reply notes ship that path.
    let list = [];
    try {
      const r = await grantsApi.list(orgId, id);
      list = Array.isArray(r) ? r : (r?.grants ?? r?.items ?? []);
    } catch { list = []; }
    const host = body.querySelector('#grants-list');
    host.innerHTML = list.length ? list.map(g => `
      <div class="avs-flex-row" style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);">
        <span style="flex:1;">${esc(g.email ?? g.userId)}</span>
        <select data-grant-level="${esc(g.userId)}">
          <option value="view" ${g.level === 'view' ? 'selected' : ''}>view</option>
          <option value="control" ${g.level === 'control' ? 'selected' : ''}>control</option>
        </select>
        <button class="bb-btn bb-btn-danger" data-rm-grant="${esc(g.userId)}">×</button>
      </div>`).join('') : `<p class="avs-muted">${tx('No additional permissions.')}</p>`;
    host.querySelectorAll('[data-grant-level]').forEach(s => s.addEventListener('change', async () => {
      try { await grantsApi.set(orgId, id, s.dataset.grantLevel, s.value); toast(t('common.saved'), { kind: 'success' }); }
      catch (e) { toast(e.message, { kind: 'error' }); }
    }));
    host.querySelectorAll('[data-rm-grant]').forEach(b => b.addEventListener('click', async () => {
      try { await grantsApi.remove(orgId, id, b.dataset.rmGrant); switchTab('access'); }
      catch (e) { toast(e.message, { kind: 'error' }); }
    }));
    body.querySelector('#g-add')?.addEventListener('click', async () => {
      const uid = body.querySelector('#g-uid').value.trim();
      if (!uid) return;
      try { await grantsApi.set(orgId, id, uid, body.querySelector('#g-lvl').value); switchTab('access'); }
      catch (e) { toast(e.message, { kind: 'error' }); }
    });
  }

  body.querySelector('#lic-assign').addEventListener('click', async () => {
    try { await licensingApi.assign(id); toast(t('drawer.assignLicense'), { kind: 'success' }); }
    catch (e) { toast(e.message, { kind: 'error' }); }
  });
  body.querySelector('#lic-unassign').addEventListener('click', async () => {
    try { await licensingApi.unassign(id); toast(t('drawer.unassignLicense'), { kind: 'success' }); }
    catch (e) { toast(e.message, { kind: 'error' }); }
  });
}

async function renderDiagnostics(body, id) {
  body.innerHTML = `
    <h4>${tx('Connectivity')}</h4>
    <button class="bb-btn" id="diag-probe">${t('drawer.runConnectivityProbe')}</button>
    <div id="diag-result" style="margin-top:8px;"></div>

    <h4 style="margin-top:16px;">${tx('Test content')}</h4>
    <textarea id="diag-html" rows="4" placeholder="<h1>Test</h1>"></textarea>
    <div class="avs-flex-row" style="margin-top:8px;">
      <button class="bb-btn" id="diag-test">${tx('Validate (dry run)')}</button>
      <button class="bb-btn" id="diag-clear">${tx('Clear display')}</button>
    </div>
    <div id="diag-test-out" style="margin-top:8px;"></div>`;
  body.querySelector('#diag-probe').addEventListener('click', async () => {
    const out = body.querySelector('#diag-result');
    out.innerHTML = '…';
    try {
      const caps = await displaysApi.capabilities(id);
      out.innerHTML = `<pre class="avs-codeblock">${esc(JSON.stringify(caps, null, 2))}</pre>`;
    } catch (e) { out.innerHTML = `<div class="avs-admin-error">${esc(e.message)}</div>`; }
  });
  body.querySelector('#diag-test').addEventListener('click', async () => {
    const html = body.querySelector('#diag-html').value;
    const out = body.querySelector('#diag-test-out');
    try {
      const r = await displaysApi.testContent(html);
      out.innerHTML = `<pre class="avs-codeblock">${esc(JSON.stringify(r, null, 2))}</pre>`;
    } catch (e) { out.innerHTML = `<div class="avs-admin-error">${esc(e.message)}</div>`; }
  });
  body.querySelector('#diag-clear').addEventListener('click', async () => {
    try { await displaysApi.clear(id); toast(t('bulk.clear'), { kind: 'success' }); }
    catch (e) { toast(e.message, { kind: 'error' }); }
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
