// admin/main.js — bootstrap for agentView Studio.
//
// Two views in a slim glass topbar: Editor (3-column Keynote shell) and
// Displays (the dashboard). Everything else (connection, data slots, public
// APIs, language, theme, import/export) lives in the connection chip and the
// overflow menu, or the ⌘K command palette.

import { toast, mount as mountToasts } from './ui/toast.js';
import { setLocale, getLocale, t, tx } from './i18n.js';
import { state, subscribe, commit, undo, redo, persist, persistConn, hydrate, emit } from './store.js';
import { auth, resetScopeWarning } from './api.js';
import * as sse from './sse.js';
import { open as openPalette, registerCommand } from './ui/command-palette.js';
import { bind as bindShortcut, install as installShortcuts, kbd } from './shortcuts.js';
import { openModal } from './ui/modal.js';
import * as slotInspector from './ui/data-slot-inspector.js';
import * as publicApiBrowser from './ui/public-api-browser.js';
import * as cloudLoad from './cloud-load.js';
import { createPlaylist, createSlide, migratePlaylist, migrateSlide, applyWidgetMigrations } from '../shared/slide-schema.js';
import { list as listPlugins, get as getPlugin } from '../shared/plugins/registry.js';
import { widgetIcon } from '../shared/data/widget-icons.js';
import '../shared/plugins/all.js';
import { DESIGNS } from '../shared/designs.js';
import { importFiles, importUrl } from './importers/index.js';
import { makeDropZone } from './ui/drag-drop.js';
import * as assetLibrary from './ui/asset-library.js';
import { mountEditor } from './views/editor.js';
import { mountDisplays, refreshFleet } from './views/displays.js';
import { mountAdmin, refreshAdmin } from './views/admin.js';
import { openPublishPicker, publishLast, refreshRunning } from './publish-flow.js';
import { orgs as orgsApi } from './api.js';
import { openPreview } from './preview-flow.js';
import { addWidget, applyActiveDesign, deleteSelected, duplicateSelected, renderSlide as canvasRender, zoomToFit as canvasFit, resetLivePreviews } from './canvas/canvas.js';
import { splitText } from './ai/smart-split.js';
import { exportPlaylist, importPlaylist } from './playlist-io.js';
import { isEditingVariant, variantBannerLabel, exitVariantEdit } from './canvas/variant-ctx.js';
import { legalLinks } from './legal-links.js';

// ---------- Boot ----------
mountToasts();
hydrate();
state.playlist = applyWidgetMigrations(migratePlaylist(state.playlist ?? createPlaylist('Studio Demo')), getPlugin);
ensureSlide();
document.title = t('app.title');

let displaysMounted = false;
let adminMounted = false;

mountShell();
applyThemePref();
registerAllCommands();
installShortcuts();
bindGlobalShortcuts();
reflectConnectionUi();
maybeAutoConnect();
maybeWelcome();

function ensureSlide() {
  if (!state.playlist.slides.length) {
    const s = createSlide({ duration: state.playlist.defaults?.duration ?? 10 });
    state.playlist.slides.push(s);
  }
  if (!state.ui.activeSlideId || !state.playlist.slides.some(s => s.id === state.ui.activeSlideId)) {
    state.ui.activeSlideId = state.playlist.slides[0].id;
  }
}

// ---------- Shell ----------
function mountShell() {
  const root = document.getElementById('app');
  root.innerHTML = `
    <header class="avs-topbar">
      <div class="avs-brand">
        <a class="avs-brandlink" id="t-dashboard" href="${esc(dashboardUrl())}" target="_blank" rel="noopener noreferrer" title="${t('dash.tip')}">
          <img class="avs-logo-img" src="logo.png" alt="agentView" />
        </a>
        <span class="avs-brand-tag">Studio</span>
      </div>
      <div class="avs-viewswitch" id="avs-viewswitch">
        <button data-view="editor">${t('view.editor')}</button>
        <button data-view="displays">${t('view.displays')}</button>
        <button data-view="admin">${t('view.admin')}</button>
      </div>
      <div class="avs-top-actions">
        <span class="avs-savechip" id="avs-save"></span>
        <span class="avs-orgchip" id="avs-orgchip" style="display:none;"></span>
        <button class="avs-iconbtn" id="t-undo" title="${t('tb.undo')} (${kbd('mod+z')})">↶</button>
        <button class="avs-iconbtn" id="t-redo" title="${t('tb.redo')} (${kbd('mod+shift+z')})">↷</button>
        <button class="avs-iconbtn" id="t-preview" title="${t('preview.go')} (${kbd('shift+p')})">▶</button>
        <button class="bb-btn bb-btn-primary avs-publish-btn" id="t-publish">${t('pub.go')}</button>
        <button class="avs-iconbtn avs-republish-btn" id="t-republish" title="${t('pub.republish')}" hidden>↻</button>
        <button class="avs-iconbtn avs-langbtn" id="t-lang" title="${t('tb.language')}">${getLocale() === 'de' ? 'EN' : 'DE'}</button>
        <button class="avs-iconbtn" id="t-palette" title="${kbd('mod+k')}">${kbd('mod+k')}</button>
        <button class="avs-conn" id="t-conn"></button>
        <button class="avs-iconbtn" id="t-overflow" title="${t('menu.more')}">⋯</button>
      </div>
    </header>
    <div class="avs-variant-banner" id="avs-variant-banner" style="display:none;"></div>
    <main class="avs-views">
      <div class="avs-view" data-view="editor" id="view-editor"></div>
      <div class="avs-view" data-view="displays" id="view-displays" style="display:none;"></div>
      <div class="avs-view" data-view="admin" id="view-admin" style="display:none;"></div>
    </main>`;

  root.querySelectorAll('#avs-viewswitch button').forEach(b =>
    b.addEventListener('click', () => switchView(b.dataset.view)));
  document.getElementById('t-undo').addEventListener('click', doUndo);
  document.getElementById('t-redo').addEventListener('click', doRedo);
  document.getElementById('t-publish').addEventListener('click', tryPublish);
  document.getElementById('t-republish').addEventListener('click', () => {
    if (state.connection.status !== 'connected') { tryPublish(); return; }
    publishLast();
  });
  // Reveal Quick-Republish button only after the first successful publish in
  // this session — otherwise it's noise.
  subscribe('meta.lastPublish', () => {
    const btn = document.getElementById('t-republish');
    if (btn) btn.hidden = !state.meta?.lastPublish;
  });
  subscribe('meta', p => {
    if (p !== 'meta.lastPublish') return;
    const btn = document.getElementById('t-republish');
    if (btn) btn.hidden = !state.meta?.lastPublish;
  });
  document.getElementById('t-preview').addEventListener('click', openPreview);
  document.getElementById('t-palette').addEventListener('click', openPalette);
  document.getElementById('t-lang').addEventListener('click', toggleLang);
  document.getElementById('t-conn').addEventListener('click', openConnModal);
  document.getElementById('t-overflow').addEventListener('click', openOverflow);

  mountEditor(document.getElementById('view-editor'));

  // Whole-window file/URL drop → import as slides.
  makeDropZone(root, async ({ files, text }) => {
    try {
      if (files?.length) {
        const r = await importFiles(files, { upload: assetLibrary.uploadAndGetUrl });
        addImportedSlides(r?.slides);
      } else if (text && /^https?:\/\//i.test(text)) {
        const r = await importUrl(text);
        addImportedSlides(r?.slides);
      }
    } catch (e) { toast(e.message, { kind: 'error' }); }
  });

  switchView(state.ui.activeView ?? 'editor');
}

function switchView(v) {
  state.ui.activeView = v;
  document.querySelectorAll('#avs-viewswitch button').forEach(b => b.classList.toggle('avs-on', b.dataset.view === v));
  document.querySelectorAll('.avs-view').forEach(el => { el.style.display = el.dataset.view === v ? '' : 'none'; });
  if (v === 'displays' && !displaysMounted) { mountDisplays(document.getElementById('view-displays')); displaysMounted = true; }
  if (v === 'admin') {
    // mountAdmin() already renders the active tab. Only refresh on RE-entry,
    // otherwise the mount render + an immediate refresh render race on the same
    // tab body and the section is drawn twice (duplicate empty-state / cards).
    if (!adminMounted) { mountAdmin(document.getElementById('view-admin')); adminMounted = true; }
    else refreshAdmin();
  }
  if (v === 'editor') requestAnimationFrame(canvasFit);
}

function addImportedSlides(slides) {
  if (!slides?.length) return;
  for (const s of slides) state.playlist.slides.push(migrateSlide(s));
  commit('import-slides');
  toast(t('toast.addedSlides', { n: slides.length }), { kind: 'success' });
  canvasRender();
}

// ---------- Connection ----------
async function openConnModal() {
  const c = state.connection;
  const box = document.createElement('div');
  if (c.status === 'connected') {
    box.innerHTML = `
      <div class="bb-account-card">
        <div class="bb-account-email">${esc(c.user?.email ?? '—')}</div>
        <div class="bb-account-plan">${esc(c.user?.plan ?? 'Free')}</div>
        <a class="avs-account-dash" href="${esc(dashboardUrl())}" target="_blank" rel="noopener noreferrer">${t('dash.tip')} ↗</a>
      </div>`;
    const ok = await openModal({ title: t('conn.title'), body: box, actions: [{ label: t('common.close') }, { label: t('conn.disconnect'), kind: 'danger', value: 'dc' }] });
    if (ok === 'dc') { c.apiKey = ''; c.user = null; c.status = 'disconnected'; persistConn(); sse.stop(); reflectConnectionUi(); }
    return;
  }
  // Session login is the default path: self-contained (no pre-existing key
  // needed), and auth.sessionRequest asks for admin scope so the whole app
  // works. API key stays as the second tab for developers / headless / kiosk.
  box.innerHTML = `
    <img class="avs-brand-logo" src="logo.png" alt="agentView" />
    <div class="bb-bezel-selector"><button class="bb-bezel-btn bb-on" data-m="session">${t('conn.session')}</button><button class="bb-bezel-btn" data-m="key">${t('conn.apiKey')}</button></div>
    <div id="m-session"><p class="bb-form-help">${t('conn.sessionHelp')}</p><div id="m-session-status" class="bb-form-help"></div></div>
    <div id="m-key" style="display:none;">
      <div class="bb-form-group"><label>${t('conn.apiKey')}</label><input type="password" id="ck" placeholder="avk_…"></div>
      <details class="avs-advanced"><summary>${t('conn.advanced')}</summary>
        <div class="bb-form-group"><label>Base URL</label><input type="text" id="cb" value="${esc(c.baseUrl)}"></div>
      </details>
    </div>`;
  box.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
    box.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('bb-on', x === b));
    box.querySelector('#m-key').style.display = b.dataset.m === 'key' ? '' : 'none';
    box.querySelector('#m-session').style.display = b.dataset.m === 'session' ? '' : 'none';
  }));
  const res = await openModal({
    title: t('conn.title'), body: box,
    actions: [{ label: t('common.cancel') }, { label: t('conn.connect'), kind: 'primary', value: 'go' }],
  });
  if (res === 'go') {
    // One submit button: the active tab decides session login vs API key.
    const mode = box.querySelector('.bb-bezel-btn.bb-on')?.dataset.m ?? 'session';
    if (mode === 'key') {
      _sessionFlowAbort?.abort(); _sessionFlowAbort = null;
      state.connection.apiKey = box.querySelector('#ck').value.trim();
      state.connection.baseUrl = box.querySelector('#cb').value.trim() || state.connection.baseUrl;
      await connect();
    } else {
      try { await startSessionFlow(); } catch (e) { toast(e.message, { kind: 'error' }); }
    }
  } else {
    // Cancelled: kill any in-flight poll the user has lost interest in.
    _sessionFlowAbort?.abort(); _sessionFlowAbort = null;
  }
}

function tryPublish() {
  if (state.connection.status !== 'connected') { toast(t('pub.connectFirst'), { kind: 'warn' }); openConnModal(); return; }
  openPublishPicker();
}

// Active session-flow poll, if any. Re-opening the connection modal or
// connecting via API key cancels the in-flight polling — otherwise the
// 3-minute loop would keep firing even after the modal closed.
let _sessionFlowAbort = null;

async function startSessionFlow() {
  // Cancel any prior polling — a second click on "Start session login"
  // should restart, not stack two polls.
  _sessionFlowAbort?.abort();
  const abort = new AbortController();
  _sessionFlowAbort = abort;

  toast(t('conn.polling'), { kind: 'info', ttl: 6000 });
  const init = await auth.sessionRequest('agentView Studio');
  if (abort.signal.aborted) return;
  const loginUrl = init?.loginUrl ?? init?.url;
  const sessionId = init?.id ?? init?.sessionRequestId;
  if (loginUrl) window.open(loginUrl, '_blank', 'noopener');
  for (let i = 0; i < 90; i++) {
    if (abort.signal.aborted) return;
    await new Promise(r => setTimeout(r, 2000));
    if (abort.signal.aborted) return;
    try {
      const s = await auth.sessionStatus(sessionId);
      if (s?.token) {
        _sessionFlowAbort = null;
        state.connection.apiKey = s.token;
        await connect();
        return;
      }
      if (s?.status === 'denied') throw new Error(t('conn.loginDenied'));
    } catch (e) {
      // Network blip vs hard fail — only propagate the "denied" string.
      if (e.message === t('conn.loginDenied')) throw e;
    }
  }
  throw new Error(t('conn.loginTimedOut'));
}

async function connect() {
  resetScopeWarning(); // re-arm the one-shot admin-scope warning for this connection
  state.connection.status = 'connecting';
  reflectConnectionUi();
  try {
    const me = await auth.me();
    state.connection.user = me;
    state.connection.status = 'connected';
    persist(); persistConn();
    try { state.connection.plan = await auth.licenseInfo(); } catch {}
    // v3: load orgs eagerly for the Lazy-Picker chip and for owner-scoped Verwaltung.
    try {
      const o = await orgsApi.list();
      const list = Array.isArray(o) ? o : (o?.organizations ?? o?.items ?? []);
      state.fleet.orgs = list;
      // Server uses orgId (sometimes groupId) as the canonical identifier;
      // the documented `id` / `organizationId` shapes are accepted as fallbacks
      // for forward compatibility.
      if (!state.fleet.activeOrgId && list.length) {
        const first = list[0];
        state.fleet.activeOrgId = first.orgId ?? first.id ?? first.organizationId ?? first.groupId;
      }
    } catch {}
    // v3: load org-level brand-kit if a sidecar slot exists, so the editor's
    // canvas shows the cascade live. List first and only GET when the slug is
    // really present — a bare GET on a missing slot logs a noisy (but harmless)
    // 404 in the console on every connect.
    try {
      const orgId = state.fleet.activeOrgId;
      const slug = orgId ? `org-${orgId}-brandkit` : null;
      if (slug) {
        const { slots } = await import('./api.js');
        // ListDataSlotsResponse: { slots, total, … }; item slug per DataSlotListItem.
        const r = await slots.list();
        const items = Array.isArray(r) ? r : (r?.slots ?? r?.items ?? []);
        const exists = items.some(s => (s?.slug ?? s?.slotId ?? s?.id) === slug);
        if (exists) state.admin.brandKitOrg = await slots.getValue(slug).catch(() => null);
      }
    } catch {}
    toast(t('conn.welcome', { email: me?.email ?? 'user' }), { kind: 'success' });
    reflectConnectionUi();
    reflectOrgChip();
    sse.start();
    refreshFleet();
    assetLibrary.refresh();
  } catch (e) {
    state.connection.status = 'disconnected';
    toast(t('conn.failed', { msg: e.message }), { kind: 'error' });
    reflectConnectionUi();
  }
}

function reflectOrgChip() {
  const chip = document.getElementById('avs-orgchip');
  if (!chip) return;
  const orgs = state.fleet.orgs ?? [];
  if (orgs.length < 2) { chip.style.display = 'none'; return; }
  const active = orgs.find(o => orgIdOf(o) === state.fleet.activeOrgId) ?? orgs[0];
  chip.style.display = '';
  chip.innerHTML = `🏢 ${esc(active?.name ?? '—')} ▾`;
  chip.title = t('org.switch');
  chip.onclick = openOrgPicker;
}

// Single source of truth for "which field holds the org id". Server today
// uses `orgId`; the documented MCP/REST surface lists `id` / `organizationId`
// in different places; some older endpoints surface `groupId`. We try them
// in that order — first non-empty value wins.
export function orgIdOf(org) {
  return org?.orgId ?? org?.id ?? org?.organizationId ?? org?.groupId ?? null;
}

async function openOrgPicker() {
  const orgs = state.fleet.orgs ?? [];
  if (orgs.length < 2) return;
  const box = document.createElement('div');
  box.className = 'avs-menu';
  box.innerHTML = orgs.map(o => {
    const id = orgIdOf(o);
    const active = id === state.fleet.activeOrgId;
    return `<button class="avs-menu-item${active ? ' avs-on' : ''}" data-id="${esc(id)}">🏢 ${esc(o.name ?? '—')}</button>`;
  }).join('');
  const p = openModal({ title: t('org.switch'), body: box, actions: [{ label: t('common.close') }] });
  box.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => {
    state.fleet.activeOrgId = b.dataset.id;
    reflectOrgChip();
    if (state.ui.activeView === 'admin') refreshAdmin();
    document.querySelector('.bb-modal-close')?.click?.();
  }));
  await p;
}

// Web dashboard URL for the connected instance. Base URL can be customised via
// the connection modal's advanced field (self-hosting), so derive from it and
// tolerate a trailing slash.
function dashboardUrl() {
  const base = (state.connection.baseUrl || 'https://agentview.de').replace(/\/+$/, '');
  return base + '/dashboard.html';
}

function reflectConnectionUi() {
  const c = state.connection;
  // Keep the Dashboard link pointed at the connected instance — base URL can
  // change via the connection modal's advanced field (self-hosting).
  const dash = document.getElementById('t-dashboard');
  if (dash) dash.href = dashboardUrl();
  const chip = document.getElementById('t-conn');
  if (!chip) return;
  if (c.status === 'connected') {
    const email = c.user?.email ?? 'connected';
    const plan = c.user?.plan;
    // Plan badge (free/premium) inline so the user always knows their tier
    // at a glance — used to require a trip to Verwaltung → Lizenzen.
    const planBadge = plan
      ? `<span class="avs-plan-badge avs-plan-${esc(plan)}">${esc(plan)}</span>`
      : '';
    chip.innerHTML = `<span class="avs-dot avs-on"></span>${esc(email)}${planBadge}`;
  } else if (c.status === 'connecting') {
    chip.innerHTML = `<span class="avs-dot"></span>${t('conn.connecting')}`;
  } else {
    chip.innerHTML = `<span class="avs-dot avs-off"></span>${t('conn.notConnected')}`;
  }
}

async function maybeAutoConnect() {
  if (state.connection.apiKey) { try { await connect(); } catch {} }
}

// First-run welcome: a one-time, dismissible explainer with a connect CTA.
// Never blocks — "explore" drops you straight into the editor with the demo
// playlist. Reachable any time via the ⋯ menu. No network / data processing
// happens here; connecting is an explicit, separate action.
async function showWelcome() {
  const box = document.createElement('div');
  box.className = 'avs-welcome';
  box.innerHTML = `
    <div class="avs-welcome-langrow"><button type="button" class="avs-welcome-lang" data-act="welcome-lang">${getLocale() === 'de' ? 'EN' : 'DE'}</button></div>
    <img class="avs-brand-logo" src="logo.png" alt="agentView" />
    <p class="avs-welcome-lead">${t('welcome.lead')}</p>
    <ul class="avs-welcome-points">
      <li>${t('welcome.p1')}</li>
      <li>${t('welcome.p2')}</li>
      <li>${t('welcome.p3')}</li>
    </ul>
    <p class="avs-welcome-foot">${t('welcome.foot')} <a href="https://agentview.de" target="_blank" rel="noopener noreferrer">agentview.de ↗</a></p>`;
  box.querySelector('[data-act="welcome-lang"]')?.addEventListener('click', toggleLang);
  const choice = await openModal({
    title: t('welcome.title'),
    body: box,
    actions: [
      { label: t('welcome.explore'), kind: 'secondary', value: 'explore' },
      { label: t('welcome.connect'), kind: 'primary', value: 'connect' },
    ],
    onMount: card => card.classList.add('bb-modal-welcome'),
  });
  if (choice === 'connect') openConnModal();
  return choice;
}

async function maybeWelcome() {
  // Show once per browser, and never to a visitor who already has a saved
  // connection (returning user) — hydrate() has populated state.connection by now.
  let seen = true;
  try { seen = !!localStorage.getItem('bb_intro_seen'); } catch {}
  if (seen || state.connection.apiKey) return;
  const choice = await showWelcome();
  // Mark as seen only after the user dismisses, so switching language (which
  // reloads the page) re-shows the welcome in the new language rather than
  // suppressing it.
  try { localStorage.setItem('bb_intro_seen', '1'); } catch {}
  if (choice !== 'connect') toast(t('firstRun.hint'), { kind: 'info', ttl: 9000 });
}

// ---------- Overflow menu ----------
async function openOverflow() {
  const box = document.createElement('div');
  box.className = 'avs-menu';
  const items = [
    { k: 'new', label: '🆕 ' + t('menu.newPlaylist') },
    { k: 'cloud-open', label: '☁️ ' + t('menu.openCloud') },
    { k: 'import', label: '⬆️ ' + t('menu.import') },
    { k: 'export', label: '⬇️ ' + t('menu.export') },
    { k: 'brandkit', label: '🎨 ' + t('brandkit.playlistMenu') },
    { k: 'slots', label: '🗄️ ' + t('menu.dataSlots') },
    { k: 'apis', label: '🔌 ' + t('menu.publicApis') },
    { k: 'theme', label: '🌓 ' + t('menu.theme') },
    { k: 'shortcuts', label: '⌨️ ' + t('menu.shortcuts') },
    { k: 'about', label: 'ℹ️ ' + t('menu.about') },
    { k: 'reset-live', label: '🛡️ ' + t('privacy.resetAll') },
  ];
  // Operator legal links (Impressum / Datenschutz) only on a configured public
  // host — null on forks / self-hosted copies / localhost (see legal-links.js).
  const legal = legalLinks();
  const legalHtml = legal
    ? `<div class="avs-menu-sep" role="separator"></div>`
      + (legal.impressum ? `<a class="avs-menu-item" href="${esc(legal.impressum)}" target="_blank" rel="noopener noreferrer">📄 ${t('menu.impressum')} ↗</a>` : '')
      + (legal.datenschutz ? `<a class="avs-menu-item" href="${esc(legal.datenschutz)}" target="_blank" rel="noopener noreferrer">🔒 ${t('menu.privacy')} ↗</a>` : '')
    : '';
  box.innerHTML = items.map(i => `<button class="avs-menu-item" data-k="${i.k}">${i.label}</button>`).join('') + legalHtml;
  const p = openModal({ title: t('menu.more'), body: box, actions: [{ label: t('common.close') }] });
  box.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
    document.querySelector('.bb-modal-close')?.click?.();
    handleMenu(b.dataset.k);
  }));
  box.querySelectorAll('a.avs-menu-item').forEach(a => a.addEventListener('click', () => {
    document.querySelector('.bb-modal-close')?.click?.();
  }));
  await p;
}

function handleMenu(k) {
  if (k === 'new') { state.playlist = createPlaylist(); ensureSlide(); commit('new-playlist'); canvasRender(); }
  else if (k === 'cloud-open') cloudLoad.open().then(() => canvasRender());
  else if (k === 'export') exportPlaylist();
  else if (k === 'import') importPlaylist({ ensureSlide, render: canvasRender });
  else if (k === 'brandkit') openPlaylistBrandKit();
  else if (k === 'slots') slotInspector.open();
  else if (k === 'apis') publicApiBrowser.open(slide => { addWidget(slide.type ?? 'live-json', slide.content ?? {}); });
  else if (k === 'theme') cycleTheme();
  else if (k === 'shortcuts') showShortcuts();
  else if (k === 'about') showWelcome();
  else if (k === 'reset-live') doResetLivePreviews();
}

function toggleLang() {
  setLocale(getLocale() === 'de' ? 'en' : 'de');
  location.reload();
}

// Withdraw all granted live previews (DSGVO): network widgets fall back to the
// data-minimising placeholder, so the editor stops contacting third-party APIs.
function doResetLivePreviews() {
  const n = resetLivePreviews();
  toast(n ? t('privacy.resetDone', { n }) : t('privacy.resetNone'), { kind: n ? 'success' : 'info' });
}

async function openPlaylistBrandKit() {
  if (!state.playlist) return;
  const kit = state.playlist.brandKit ?? {};
  const c = kit.colors ?? {};
  // Snapshot current values so we can revert if user cancels — otherwise the
  // live preview leaves the canvas in a different state than localStorage.
  const original = JSON.parse(JSON.stringify(kit));
  const box = document.createElement('div');
  box.innerHTML = `
    <p class="bb-form-help">${t('brandkit.playlistHelp')}</p>
    <div class="avs-brandkit-grid">
      <label>${t('brandkit.bg')}     <span class="avs-bk-row"><input type="color" id="pbk-bg"     value="${c.bg ?? '#0f1218'}"><code id="pbk-bg-hex">${esc(c.bg ?? '#0f1218')}</code></span></label>
      <label>${t('brandkit.fg')}     <span class="avs-bk-row"><input type="color" id="pbk-fg"     value="${c.fg ?? '#f1f1f4'}"><code id="pbk-fg-hex">${esc(c.fg ?? '#f1f1f4')}</code></span></label>
      <label>${t('brandkit.accent')} <span class="avs-bk-row"><input type="color" id="pbk-accent" value="${c.accent ?? '#8b5cf6'}"><code id="pbk-accent-hex">${esc(c.accent ?? '#8b5cf6')}</code></span></label>
      <label>${t('brandkit.font')}   <input type="text"  id="pbk-font"   value="${esc(kit.font ?? '')}" placeholder="Inter, sans-serif" style="grid-column:span 2;"></label>
    </div>
    <p class="avs-muted" style="font-size:11px;margin-top:8px;">${t('brandkit.livePreview')}</p>`;
  // Live-preview wiring: every change writes through to state.playlist.brandKit
  // and re-applies the cascade. Hex labels next to color inputs reflect value.
  const apply = () => {
    state.playlist.brandKit = {
      colors: {
        bg:     box.querySelector('#pbk-bg').value,
        fg:     box.querySelector('#pbk-fg').value,
        accent: box.querySelector('#pbk-accent').value,
      },
      font: box.querySelector('#pbk-font').value.trim(),
    };
    box.querySelector('#pbk-bg-hex').textContent = state.playlist.brandKit.colors.bg;
    box.querySelector('#pbk-fg-hex').textContent = state.playlist.brandKit.colors.fg;
    box.querySelector('#pbk-accent-hex').textContent = state.playlist.brandKit.colors.accent;
    applyEditorBrandKit();
  };
  box.querySelectorAll('input').forEach(inp => inp.addEventListener('input', apply));

  const res = await openModal({
    title: '🎨 ' + t('brandkit.playlistTitle'), body: box,
    actions: [
      { label: t('brandkit.remove'), value: 'clear' },
      { label: t('common.cancel'), value: 'cancel' },
      { label: t('common.save'), kind: 'primary', value: 'save' },
    ],
  });
  if (res === 'clear') {
    delete state.playlist.brandKit;
    commit('playlist-brandkit-clear');
  } else if (res === 'save') {
    // Already in state via apply(); just commit.
    commit('playlist-brandkit-save');
  } else {
    // Cancel / dismiss → restore the snapshot so live-preview rolls back.
    if (Object.keys(original).length) state.playlist.brandKit = original;
    else delete state.playlist.brandKit;
  }
  applyEditorBrandKit();
  canvasRender();
}

// v3: apply the brand-kit cascade (org → playlist) onto the editor canvas so
// the user sees what the player will render. Slide-level overrides land in
// renderSlide inside canvas.js (or live-applied by the inspector).
function applyEditorBrandKit() {
  try {
    const canvas = document.querySelector('#bb-canvas, .avs-canvas, .bb-canvas');
    if (!canvas) return;
    // Lazy-load to avoid a circular import — the brand-kit module imports nothing
    // app-specific itself.
    import('../shared/brand-kit-apply.js').then(({ applyCascade }) => {
      applyCascade(canvas, {
        org: state.admin?.brandKitOrg,
        playlist: state.playlist,
      });
    });
  } catch {}
}
subscribe('playlist.brandKit', applyEditorBrandKit);
subscribe('admin.brandKitOrg', applyEditorBrandKit);

function showShortcuts() {
  const rows = [
    [`${kbd('mod+k')}  /  /`, t('sc.palette')],
    [kbd('mod+z'), t('tb.undo')],
    [kbd('mod+shift+z'), t('tb.redo')],
    ['P', t('pub.go')],
    [kbd('shift+p'), t('preview.go')],
    ['D', t('rail.duplicate')],
    ['Del', t('rail.delete')],
    ['J', t('sc.nextSlide')],
    ['K', t('sc.prevSlide')],
    ['Esc', t('sc.deselect')],
  ];
  const box = document.createElement('div');
  box.className = 'avs-shortcuts';
  box.innerHTML = rows.map(([k, d]) => `<div class="avs-sc-row"><kbd>${esc(k)}</kbd><span>${esc(d)}</span></div>`).join('');
  openModal({ title: t('shortcuts.title'), body: box, actions: [{ label: t('common.close') }] });
}

// ---------- Commands & shortcuts ----------
function registerAllCommands() {
  registerCommand({ label: t('pub.go'), icon: '🚀', run: () => openPublishPicker() });
  registerCommand({ label: t('preview.go'), icon: '▶', run: () => openPreview() });
  registerCommand({ label: t('menu.newPlaylist'), icon: '🆕', run: () => handleMenu('new') });
  registerCommand({ label: 'Undo', icon: '↶', run: doUndo });
  registerCommand({ label: 'Redo', icon: '↷', run: doRedo });
  registerCommand({ label: t('menu.theme'), icon: '🌓', run: () => cycleTheme() });
  registerCommand({ label: t('menu.shortcuts'), icon: '⌨️', run: () => showShortcuts() });
  registerCommand({ label: t('privacy.resetAll'), icon: '🛡️', keywords: 'privacy dsgvo gdpr live preview ip vorschau datenschutz', run: () => doResetLivePreviews() });
  registerCommand({ label: t('menu.dataSlots'), icon: '🗄️', run: () => slotInspector.open() });
  registerCommand({ label: t('menu.publicApis'), icon: '🔌', run: () => publicApiBrowser.open(s => addWidget(s.type ?? 'live-json', s.content ?? {})) });
  registerCommand({ label: t('cmd.smartSplit'), icon: '✂️', run: () => promptSmartSplit() });
  registerCommand({ label: t('menu.export'), icon: '⬇️', run: () => exportPlaylist() });
  registerCommand({ label: t('menu.import'), icon: '⬆️', run: () => importPlaylist({ ensureSlide, render: canvasRender }) });
  registerCommand({ label: t('menu.openCloud'), icon: '☁️', keywords: 'cloud agentview load open', run: () => handleMenu('cloud-open') });
  registerCommand({ label: t('view.displays'), icon: '📺', run: () => switchView('displays') });
  registerCommand({ label: t('view.editor'), icon: '🎬', run: () => switchView('editor') });
  for (const d of DESIGNS) registerCommand({ label: t('cmd.applyDesign', { label: d.label }), icon: d.icon, keywords: 'design layout', run: () => applyActiveDesign(d.id) });
  for (const p of listPlugins()) registerCommand({
    label: t('cmd.addWidget', { label: p.label }), icon: widgetIcon(p.type, p.icon, 16), keywords: p.type + ' ' + (p.group ?? ''),
    run: () => addWidget(p.type),
  });
}

function bindGlobalShortcuts() {
  bindShortcut('meta+k', openPalette); bindShortcut('ctrl+k', openPalette);
  bindShortcut('meta+z', doUndo); bindShortcut('ctrl+z', doUndo);
  bindShortcut('meta+shift+z', doRedo); bindShortcut('ctrl+shift+z', doRedo);
  bindShortcut('p', () => openPublishPicker());
  bindShortcut('shift+p', () => openPreview());
  bindShortcut('/', openPalette);
  bindShortcut('delete', () => deleteSelected());
  bindShortcut('d', () => duplicateSelected());
  bindShortcut('j', () => moveSlide(1));
  bindShortcut('k', () => moveSlide(-1));
  bindShortcut('shift+?', showShortcuts);
  // Escape exits the widget inspector → swaps the right pane back to Library.
  // Only fires when an inspector is open AND nothing else is in front (modals,
  // popovers handle Escape themselves and stopPropagation before this runs).
  bindShortcut('escape', () => { if (state.ui.selectedWidgetId) state.ui.selectedWidgetId = null; });
}

function moveSlide(delta) {
  const ids = state.playlist.slides.map(s => s.id);
  if (!ids.length) return;
  // Switching slides while a variant is being edited must commit the variant
  // edits back to its slot first — otherwise the swap-in-place would orphan
  // the variant array on the new slide.
  if (isEditingVariant()) exitVariantEdit();
  const cur = ids.indexOf(state.ui.activeSlideId);
  const next = cur === -1 ? 0 : (cur + delta + ids.length) % ids.length;
  state.ui.activeSlideId = ids[next];
  state.ui.selectedWidgetId = null;
}

// v3: variant-edit banner — visible above the views whenever a slide's variant
// (lang or A/B) is being edited via the swap-in-place ctx. Clicking "Back to
// default" calls exitVariantEdit() which restores slide.widgets.
function refreshVariantBanner() {
  const el = document.getElementById('avs-variant-banner');
  if (!el) return;
  if (!isEditingVariant()) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = `<span class="avs-variant-banner-label">✏️ ${esc(variantBannerLabel())}</span>
    <button class="bb-btn" id="variant-back">${t('variant.backToDefault')}</button>`;
  el.querySelector('#variant-back').addEventListener('click', () => {
    exitVariantEdit();
    refreshVariantBanner();
    canvasRender();
  });
}
subscribe('ui._variantStash', refreshVariantBanner);
subscribe('ui', p => { if (p === 'ui._variantStash') refreshVariantBanner(); });

// Failsafe: flush the variant swap + persist before the page goes away. Without
// this a close-while-editing could leave the in-memory variant edits in the
// editor's slide.widgets and a stale default in localStorage.
window.addEventListener('beforeunload', () => {
  if (isEditingVariant()) exitVariantEdit();
  persist();
});

// v3 comfort: every .avs-codeblock acts as a one-click copy target. Delegated
// at document level so dynamically-injected codeblocks (Webhook-Secret-Modal,
// API-Key-creation-Modal, etc.) work without per-site wiring.
document.addEventListener('click', async e => {
  const block = e.target.closest?.('.avs-codeblock');
  if (!block) return;
  e.preventDefault();
  const text = block.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    block.classList.add('avs-copied');
    setTimeout(() => block.classList.remove('avs-copied'), 1400);
  } catch {
    // Older browsers / non-secure contexts: fall back to a selection range so
    // the user can hit Ctrl/⌘+C themselves.
    const r = document.createRange();
    r.selectNodeContents(block);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
});

// The Verwaltung→Members tab can create an organization (and re-set activeOrgId).
// It dispatches this event so the top-bar org chip reflects the new org/list
// without a reconnect. Event-based to avoid a circular import with admin.js.
document.addEventListener('avs:orgs-changed', reflectOrgChip);

function doUndo() { if (undo()) { ensureSlide(); state.ui.selectedWidgetId = null; canvasRender(); } }
function doRedo() { if (redo()) { ensureSlide(); state.ui.selectedWidgetId = null; canvasRender(); } }

// ---------- AI prompts ----------
async function promptSmartSplit() {
  const box = document.createElement('div');
  box.innerHTML = `<textarea rows="12" placeholder="${tx('# Heading…')}" style="width:100%;font-family:var(--bb-mono);"></textarea>`;
  const ok = await openModal({ title: t('cmd.smartSplit'), body: box, actions: [{ label: t('common.cancel') }, { label: t('common.add'), kind: 'primary', value: 1 }] });
  if (!ok) return;
  const slides = splitText(box.querySelector('textarea').value);
  for (const s of slides) state.playlist.slides.push(migrateSlide(s));
  commit('smart-split'); canvasRender();
  toast(t('toast.addedSlides', { n: slides.length }), { kind: 'success' });
}

// ---------- Theme ----------
function cycleTheme() {
  const order = ['system', 'dark', 'light'];
  state.ui.themePref = order[(order.indexOf(state.ui.themePref) + 1) % order.length];
  applyThemePref();
}
function applyThemePref() {
  const pref = state.ui.themePref ?? 'dark';
  document.documentElement.dataset.theme = pref === 'system'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref;
}

// ---------- Import / export ----------
// ---------- Save chip ----------
setInterval(() => {
  const el = document.getElementById('avs-save');
  if (el && state.meta.autoSaveAt) {
    const diff = Date.now() - state.meta.autoSaveAt;
    el.textContent = diff < 5000 ? t('toast.saved') : (diff < 60000 ? Math.floor(diff / 1000) + 's' : Math.floor(diff / 60000) + 'm');
  }
}, 1000);

// ---------- SSE ----------
sse.onEvent(evt => {
  if (!evt) return;
  if (['display_online', 'display_offline', 'displays.changed'].includes(evt.type)) refreshFleet();
  if (evt.type === 'content.delivered' || evt.type === 'display.content') refreshRunning();

  // v3 + agentView v2.1.91: push-events for data-slot mutations. Replaces
  // the editor's polling-based awareness of slot changes.
  //   data.changed → { slug, groupId, contentVersion, updatedAt, timestamp }
  //   data.deleted → same shape, indicates the slot no longer exists
  if (evt.type === 'data.changed' || evt.type === 'data.deleted') {
    const slug = evt.slug ?? evt.data?.slug;
    if (slug) {
      // Notify interested editor modules (slot-binding autocomplete cache,
      // the slot inspector if open) via the store event bus — no window globals.
      emit('slots.changed', { slug, kind: evt.type });
      // Surface a subtle hint, but only when the editor is the active view
      // (in Verwaltung/Displays the toast would be noise).
      if (state.ui.activeView === 'editor') {
        const verb = evt.type === 'data.deleted' ? t('slot.verbDeleted') : t('slot.verbUpdated');
        toast(t('slot.toastChanged', { slug, verb }), { kind: 'info', ttl: 3500 });
      }
    }
    return;
  }

  // v3: surface display state changes as toasts so the editor knows when a
  // remote display drops or comes back. Skip while sitting on the Displays
  // view — that view already shows the change inline and a toast would feel
  // redundant. The display.name lookup uses the latest fleet snapshot.
  if (state.ui.activeView === 'displays') return;
  const did = evt.displayId ?? evt.id ?? evt.profileId;
  if (!did) return;
  const d = (state.fleet.displays ?? []).find(x => x.id === did);
  const name = d?.name ?? did;
  if (evt.type === 'display_online')  toast(`🟢 ${name}: online`, { kind: 'info', ttl: 4000 });
  if (evt.type === 'display_offline') toast(`⚫ ${name}: offline`, { kind: 'warn', ttl: 5000 });
});

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
