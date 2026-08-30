// Own HTML templates — the account's saved copies of published content, kept
// in agentView itself (Owner API, see `htmlTemplates` in admin/api.js). Three
// doors lead here and they share this file so they cannot drift apart:
//
//   • the publish dialog     → "save as template too" alongside the send
//   • a display card         → save what that screen is RUNNING right now
//   • Library → Templates    → the list: send, rename, delete
//
// Not to be confused with the public store (Library → Store): that catalog is
// editorial and takes nothing from outside. These are yours.
//
// Every field read off a template row is defensive. The owner spec documents
// its responses as a bare "200 OK" with no schema, so names, ids, timestamps
// and the HTML body could each arrive under more than one key; a wrong guess
// must degrade to a missing label, never to a row that cannot be deleted.

import { htmlTemplates, templateIdOf, displays as displaysApi } from '../api.js';
import { openModal, confirmModal } from './modal.js';
import { toast } from './toast.js';
import { t, getLocale } from '../i18n.js';
import { state } from '../store.js';
import { escapeHtml as esc, escapeAttr } from '../../shared/utils/escape.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { extractEmbeddedPlaylist } from '../publish.js';
import { applyPlaylistValue } from '../cloud-load.js';
import { renderSlide as canvasRenderSlide } from '../canvas/canvas.js';

const nameOf = tpl => tpl?.name ?? tpl?.title ?? tpl?.displayName ?? '';
const descOf = tpl => tpl?.description ?? tpl?.summary ?? '';
const htmlOf = tpl => tpl?.html ?? tpl?.content ?? tpl?.htmlContent ?? tpl?.body ?? null;
const stampOf = tpl => tpl?.updatedAt ?? tpl?.createdAt ?? tpl?.created ?? tpl?.modifiedAt ?? null;
// Which display this was saved off, when it was one (verified live: the server
// fills sourceDisplayName for /current-html/save-template, null otherwise).
const sourceOf = tpl => tpl?.sourceDisplayName ?? null;
// The list already carries a ready-to-open preview link per row (verified live:
// preview.current = { available, url, contentUrl }), so showing what is inside a
// template costs no extra request.
const previewUrlOf = tpl => (tpl?.preview?.current?.available ? tpl.preview.current.url : null);

// Server-enforced limits from the spec — mirrored on the inputs so an overlong
// name is stopped here instead of coming back as a 400.
const NAME_MAX = 200;
const DESC_MAX = 2000;

function fmtStamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d) ? null : d.toLocaleString(getLocale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Name + description prompt, shared by every save path. Returns null when the
// user cancels or leaves the name empty (the name is what makes a template
// findable later, so an unnamed one is not worth saving).
export async function askTemplateMeta({ title, defaultName = '', description = '', hint = '', submitLabel } = {}) {
  const box = document.createElement('div');
  box.innerHTML = `
    ${hint ? `<p class="bb-form-help">${esc(hint)}</p>` : ''}
    <div class="bb-form-group"><label for="avs-tplname">${esc(t('tpl.name'))}</label>
      <input id="avs-tplname" maxlength="${NAME_MAX}" value="${escapeAttr(defaultName)}" autocomplete="off"></div>
    <div class="bb-form-group"><label for="avs-tpldesc">${esc(t('tpl.desc'))}</label>
      <textarea id="avs-tpldesc" maxlength="${DESC_MAX}" rows="2">${esc(description)}</textarea></div>`;
  const ok = await openModal({
    title,
    body: box,
    actions: [{ label: t('common.cancel') }, { label: submitLabel ?? t('tpl.save'), kind: 'primary', value: 1 }],
    onMount: (card) => {
      const inp = box.querySelector('#avs-tplname');
      setTimeout(() => { inp?.focus(); inp?.select(); }, 10);
      inp?.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        card.querySelector('.bb-modal-footer .bb-btn-primary')?.click();
      });
    },
  });
  if (!ok) return null;
  const name = box.querySelector('#avs-tplname').value.trim();
  if (!name) return null;
  return { name, description: box.querySelector('#avs-tpldesc').value.trim() };
}

// Save what a display is showing RIGHT NOW. Nothing is uploaded — the server
// snapshots its own stored content for that profile, so this captures content
// the Studio never published (a store template, a quick-sent URL) just as well.
export async function saveRunningAsTemplate(displayId, displayName, running) {
  if (state.connection.status !== 'connected') { toast(t('pub.connectFirst'), { kind: 'warn' }); return false; }
  const meta = await askTemplateMeta({
    title: t('tpl.saveRunning'),
    defaultName: running || displayName || '',
    hint: t('tpl.saveRunningHelp'),
  });
  if (!meta) return false;
  try {
    await htmlTemplates.saveCurrent(displayId, meta);
    toast(t('tpl.saved', { name: meta.name }), { kind: 'success' });
    return true;
  } catch (e) {
    toast(t('tpl.saveFailed', { msg: e.message }), { kind: 'error' });
    return false;
  }
}

// Save an already-bundled player as a template. Used by the publish flow, where
// the name was collected before the send and the HTML is the very bundle that
// just shipped. Never throws: publishing succeeded, and a failed template must
// not read as a failed publish.
export async function saveBundleAsTemplate({ html, name, description, sourceProfileId } = {}) {
  if (!html || !name) return false;
  try {
    await htmlTemplates.create({ name, description, html, sourceProfileId });
    toast(t('tpl.saved', { name }), { kind: 'success' });
    return true;
  } catch (e) {
    toast(t('tpl.saveFailed', { msg: e.message }), { kind: 'warn' });
    return false;
  }
}

// ---------- the list (Library → Templates) ----------

// Send one saved template to a display. The list holds rows, not bodies, so the
// HTML is fetched on demand; if the response carries no recognisable body we
// say so rather than pushing `undefined` to a screen.
async function sendTemplate(id, name) {
  const ds = state.fleet.displays ?? [];
  if (!ds.length) { toast(t('tpl.noDisplays'), { kind: 'warn' }); return; }
  const box = document.createElement('div');
  box.innerHTML = `
    <p class="bb-form-help">${esc(t('tpl.sendHelp'))}</p>
    <div class="bb-form-group"><label for="avs-tplsend">${esc(t('pub.display'))}</label>
      <select id="avs-tplsend">${ds.map(d => `<option value="${escapeAttr(d.id ?? d.profileId ?? '')}">${esc(d.name ?? d.id)}</option>`).join('')}</select></div>`;
  const ok = await openModal({
    title: t('tpl.send'), body: box,
    actions: [{ label: t('common.cancel') }, { label: t('tpl.send'), kind: 'primary', value: 1 }],
  });
  if (!ok) return;
  const displayId = box.querySelector('#avs-tplsend').value;
  if (!displayId) return;
  try {
    const full = await htmlTemplates.get(id);
    const html = htmlOf(full) ?? htmlOf(full?.template) ?? htmlOf(full?.data);
    if (!html) throw new Error(t('tpl.noBody'));
    await displaysApi.sendContent(displayId, html, { description: name });
    toast(t('pub.success'), { kind: 'success' });
  } catch (e) {
    toast(t('tpl.sendFailed', { msg: e.message }), { kind: 'error' });
  }
}

// Open a saved template back in the editor. Only works for templates the Studio
// froze (their slides ride inside the HTML as BB_PLAYLIST); one saved off a
// running display, or published before that existed, carries only a slot URL
// and cannot be taken apart into slides — say so instead of failing obscurely.
async function editTemplate(id, name) {
  try {
    const full = await htmlTemplates.get(id);
    const html = htmlOf(full) ?? htmlOf(full?.template) ?? htmlOf(full?.data);
    if (!html) throw new Error(t('tpl.noBody'));
    const playlist = extractEmbeddedPlaylist(html);
    if (!playlist) { toast(t('tpl.notEditable'), { kind: 'warn', ttl: 7000 }); return; }
    if (applyPlaylistValue(playlist, name)) canvasRenderSlide();
  } catch (e) {
    toast(t('tpl.openFailed', { msg: e.message }), { kind: 'error' });
  }
}

async function renameTemplate(tpl, after) {
  const id = templateIdOf(tpl);
  const meta = await askTemplateMeta({
    title: t('tpl.rename'),
    defaultName: nameOf(tpl),
    description: descOf(tpl),
    // NOT `t('common.save') ?? …` — t() answers with the KEY when a string is
    // missing, never null, so a `??` fallback beside it can never fire.
    submitLabel: t('common.save'),
  });
  if (!meta || !id) return;
  try {
    await htmlTemplates.update(id, meta);
    toast(t('tpl.renamed'), { kind: 'success' });
    after?.();
  } catch (e) { toast(e.message, { kind: 'error' }); }
}

async function deleteTemplate(tpl, after) {
  const id = templateIdOf(tpl);
  if (!id) return;
  const ok = await confirmModal({
    title: t('tpl.delete'),
    message: t('tpl.deleteConfirm', { name: nameOf(tpl) }),
    confirmLabel: t('tpl.delete'),
  });
  if (!ok) return;
  try {
    await htmlTemplates.remove(id);
    toast(t('tpl.deleted'), { kind: 'success' });
    after?.();
  } catch (e) { toast(e.message, { kind: 'error' }); }
}

// Render the account's templates into `host`. Re-entrant: every action calls
// back into it, so the list always reflects the server after a change.
export async function renderOwnTemplates(host) {
  if (state.connection.status !== 'connected') {
    host.innerHTML = `<p class="bb-form-help">${esc(t('tpl.connectFirst'))}</p>`;
    return;
  }
  host.innerHTML = `<p class="bb-form-help">${esc(t('common.loading'))}</p>`;
  let rows;
  try {
    rows = await htmlTemplates.list();
  } catch (e) {
    host.innerHTML = `<p class="bb-form-help">${esc(t('tpl.listFailed', { msg: e.message }))}</p>`;
    return;
  }
  if (!rows.length) {
    host.innerHTML = `<p class="bb-form-help">${esc(t('tpl.empty'))}</p>`;
    return;
  }
  host.innerHTML = `<div class="avs-tpl-own-list">${rows.map((tpl, i) => {
    // Description, origin display and timestamp, in that order, joined only
    // where a part actually exists — a row for a template with none of them
    // would otherwise show a line of stray separators.
    const sub = [descOf(tpl), sourceOf(tpl) ? t('tpl.fromDisplay', { name: sourceOf(tpl) }) : '', fmtStamp(stampOf(tpl))]
      .filter(Boolean).join(' · ');
    return `<div class="avs-tpl-own-row" data-i="${i}">
      <div class="avs-tpl-own-main">
        <div class="avs-tpl-own-name">${esc(nameOf(tpl) || t('tpl.untitled'))}</div>
        <div class="bb-form-help avs-tpl-own-sub">${esc(sub)}</div>
      </div>
      <div class="avs-tpl-own-actions">
        <button class="bb-btn bb-btn-secondary" data-tpl-act="send">${esc(t('tpl.send'))}</button>
        ${previewUrlOf(tpl) ? `<button class="avs-iconbtn" data-tpl-act="preview" title="${escapeAttr(t('tpl.preview'))}">${uiIconSvg('eye')}</button>` : ''}
        <!-- An open-folder glyph, not a pencil: the rename button beside it
             already carries one, and two would read as the same action. -->
        <button class="avs-iconbtn" data-tpl-act="edit" title="${escapeAttr(t('tpl.edit'))}">${uiIconSvg('folder')}</button>
        <button class="avs-iconbtn" data-tpl-act="rename" title="${escapeAttr(t('tpl.rename'))}">✎</button>
        <button class="avs-iconbtn" data-tpl-act="delete" title="${escapeAttr(t('tpl.delete'))}">${uiIconSvg('trash')}</button>
      </div>
    </div>`;
  }).join('')}</div>`;

  host.querySelectorAll('[data-tpl-act]').forEach(btn => btn.addEventListener('click', () => {
    const tpl = rows[Number(btn.closest('[data-i]').dataset.i)];
    const again = () => renderOwnTemplates(host);
    const act = btn.dataset.tplAct;
    if (act === 'send') return sendTemplate(templateIdOf(tpl), nameOf(tpl));
    // Opened straight from the row object, never rendered into an href: the
    // preview link carries a signed token, and putting it in the markup would
    // leak it into the DOM, into a hover tooltip and into any copied link.
    if (act === 'preview') return void window.open(previewUrlOf(tpl), '_blank', 'noopener,noreferrer');
    if (act === 'edit') return editTemplate(templateIdOf(tpl), nameOf(tpl));
    if (act === 'rename') return renameTemplate(tpl, again);
    if (act === 'delete') return deleteTemplate(tpl, again);
  }));
}
