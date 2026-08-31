// Right panel when nothing is selected — the content & widget library.
// Tabs: Widgets · Assets · Live-APIs.
//
// Slide-layout "Designs" used to live here too, but they're a per-slide
// property (like Theme), not an item you add to a slide — they now live in
// the slide-settings modal alongside Theme/Background/Schedule.

import { state, on, emit } from '../store.js';
import { listByGroup } from '../../shared/plugins/registry.js';
import { addWidget, renderSlide as canvasRender } from '../canvas/canvas.js';
import { list as listCustomWidgets } from '../../shared/custom-widgets.js';
import { placeEntry, exportEntry, removeEntry, importCustomWidget, saveSlideAsComposite } from '../ui/custom-widget-actions.js';
import { openWidgetDesigner } from './widget-designer.js';
import * as assetLibrary from '../ui/asset-library.js';
import * as publicApiBrowser from '../ui/public-api-browser.js';
import { toast } from '../ui/toast.js';
import { t, tx } from '../i18n.js';
import { widgetIcon } from '../../shared/data/widget-icons.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { escapeHtml, escapeAttr } from '../../shared/utils/escape.js';
import { isSafeImgUrl } from '../../shared/safe-url.js';
import { storeTemplates } from '../api.js';
import { createSlide, createWidget } from '../../shared/slide-schema.js';
import { commit } from '../store.js';
import { openModal } from '../ui/modal.js';
import { openTemplateStore } from '../ui/template-store.js';
import { renderOwnTemplates } from '../ui/html-templates.js';
import { renderSlide as canvasRenderSlide } from '../canvas/canvas.js';

const TABS = [
  { id: 'widgets',   label: () => t('lib.widgets') },
  { id: 'templates', label: () => t('lib.templates') },
  { id: 'assets',    label: () => t('lib.assets') },
  { id: 'apis',      label: () => t('lib.apis') },
  { id: 'store',     label: () => t('library.store') },
];

// The latest mounted library's redraw fn + a once-only subscription, so saving
// / importing / deleting a custom widget refreshes the palette. The library is
// re-mounted on every right-panel swap, so the handler is registered once at
// module scope and dispatches to whichever render is current (no per-mount leak).
let _libRender = null;
let _customSubscribed = false;

export function mountLibrary(host) {
  host.classList.add('avs-library');
  host.innerHTML = `
    <div class="avs-inspector-head">
      <span class="avs-inspector-title">${t('lib.title')}</span>
    </div>
    <div class="avs-lib-tabs">
      ${TABS.map(tb => `<button class="avs-lib-tab" data-tab="${tb.id}">${tb.label()}</button>`).join('')}
    </div>
    <div class="avs-lib-body" id="avs-lib-body"></div>`;

  const body = host.querySelector('#avs-lib-body');
  host.querySelectorAll('.avs-lib-tab').forEach(btn =>
    btn.addEventListener('click', () => { state.ui.libraryTab = btn.dataset.tab; render(); }));

  function render() {
    // Old saved state may still point at 'designs' — coerce back to widgets
    // so users don't land on a missing tab after the upgrade.
    let tab = state.ui.libraryTab ?? 'widgets';
    if (!TABS.find(t => t.id === tab)) { tab = 'widgets'; state.ui.libraryTab = tab; }
    host.querySelectorAll('.avs-lib-tab').forEach(b => b.classList.toggle('avs-on', b.dataset.tab === tab));
    body.replaceChildren();
    if (tab === 'widgets') renderWidgets(body);
    else if (tab === 'templates') renderTemplates(body);
    else if (tab === 'assets') renderAssets(body);
    else if (tab === 'apis') renderApis(body);
    else if (tab === 'store') renderStore(body);
  }
  render();
  _libRender = render;
  if (!_customSubscribed) {
    _customSubscribed = true;
    on('custom-widgets.changed', () => { if (state.ui.libraryTab === 'widgets') _libRender?.(); });
  }
  return { render };
}

async function renderStore(body) {
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'avs-lib-search';
  search.placeholder = t('store.search');
  const grid = document.createElement('div');
  grid.className = 'avs-store-grid';
  const status = document.createElement('div');
  status.className = 'avs-admin-loading';
  status.textContent = '…';
  body.append(search, status, grid);

  let lastQuery = '';
  const fetchAndRender = async () => {
    const q = search.value.trim();
    lastQuery = q;
    status.textContent = '…';
    grid.replaceChildren();
    try {
      // searchAll walks the server's pages (?limit caps at 100) so the grid
      // shows the whole catalog, not just the first page.
      const r = await storeTemplates.searchAll(q);
      // tolerate the call failing or returning multiple shapes
      if (q !== lastQuery) return;
      const list = Array.isArray(r) ? r : (r?.templates ?? r?.items ?? []);
       status.textContent = '';
      if (!list.length) { grid.innerHTML = `<p class="avs-muted">${t('store.empty')}</p>`; return; }
      grid.innerHTML = list.map(tpl => {
        // Server uses `slug` as the install identifier; `id` is a fallback
        // for forward compatibility with a future spec change.
        const key = tpl.slug ?? tpl.id ?? '';
        const title = tpl.title ?? tpl.name ?? key ?? '—';
        const desc = tpl.shortDescription ?? tpl.description ?? '';
        return `
        <article class="avs-store-card" title="${escapeHtml(desc)}">
          <h6>${escapeHtml(title)}</h6>
          <p class="avs-muted" style="font-size:11px;">${escapeHtml(desc.slice(0, 80))}</p>
          <div class="avs-store-card-actions">
            <button data-send="${escapeHtml(key)}">${t('store.send')}</button>
            <button data-insert="${escapeHtml(key)}">${t('store.insert')}</button>
            <button data-copy="${escapeHtml(key)}" data-title="${escapeHtml(title)}">${t('store.copy')}</button>
          </div>
        </article>`;
      }).join('');
      grid.querySelectorAll('[data-send]').forEach(b => b.addEventListener('click', () => sendStoreTemplate(b.dataset.send)));
      grid.querySelectorAll('[data-insert]').forEach(b => b.addEventListener('click', () => insertStoreTemplate(b.dataset.insert)));
      grid.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copyStoreTemplate(b.dataset.copy, b.dataset.title)));
    } catch (e) {
      // Backend may not support the store endpoint yet — degrade gracefully.
      status.innerHTML = `<div class="avs-admin-empty">${escapeHtml(e.message ?? '—')}</div>`;
    }
  };
  let timer = null;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(fetchAndRender, 300); });
  fetchAndRender();
}

async function sendStoreTemplate(id) {
  const displays = state.fleet.displays ?? [];
  if (!displays.length) { toast(tx('Connect a display first.'), { kind: 'warn' }); return; }
  // Single-display shortcut: no picker needed.
  let did;
  if (displays.length === 1) {
    did = displays[0].id ?? displays[0].profileId;
  } else {
    const box = document.createElement('div');
    box.innerHTML = `
      <p class="bb-form-help">${tx('Which display should the template go to?')}</p>
      <select id="tpl-display" style="width:100%;padding:6px;">
        ${displays.map(d => `<option value="${escapeHtml(d.id ?? d.profileId)}">${escapeHtml(d.name ?? d.id)}</option>`).join('')}
      </select>`;
    const ok = await openModal({
      title: t('store.send'), body: box,
      actions: [{ label: t('common.cancel') }, { label: t('store.send'), kind: 'primary', value: 1 }],
    });
    if (!ok) return;
    did = box.querySelector('#tpl-display').value;
  }
  try { await storeTemplates.sendToDisplay(id, did); toast(t('store.send'), { kind: 'success' }); }
  catch (e) { toast(e.message, { kind: 'error' }); }
}

async function insertStoreTemplate(id) {
  // The template's display-HTML comes from the dedicated /content endpoint —
  // NOT /agent-artifacts (those are LLM onboarding files: prompt/skill/
  // mcp-config/example-code, and carry no `html`, which is why this used to
  // insert an empty placeholder). The HTML is a full standalone document; the
  // embed widget renders it via a sandboxed iframe srcdoc. {{slot:…}} markers
  // stay literal so the template falls back to its inline defaults in-editor.
  try {
    const r = await storeTemplates.content(id);
    const html = r?.html ?? '';
    if (!html) { toast(t('store.empty'), { kind: 'warn' }); return; }
    // Carry the template's slot definitions + an (initially empty) edit map so
    // the inspector can offer per-slot JSON editing and the embed renders a
    // live preview of edited values. `slots` empty → template uses its own
    // defaults. See admin/panels/inspector.js + shared/store-template-preview.js.
    const slotDefs = Array.isArray(r?.slots) ? r.slots : [];
    const slide = createSlide({
      duration: 12,
      widgets: [createWidget('embed', {
        rect: { x: 0, y: 0, w: 100, h: 100 },
        content: {
          mode: 'srcdoc', html: String(html), sandbox: true, background: '#0a0a10',
          templateSlug: id, slotDefs, slots: {},
        },
      })],
    });
    state.playlist.slides.push(slide);
    state.ui.activeSlideId = slide.id;
    commit('store-insert');
    toast(t('store.insert'), { kind: 'success' });
  } catch (e) { toast(e.message, { kind: 'error' }); }
}

async function copyStoreTemplate(slug, title) {
  if (state.connection.status !== 'connected') { toast(t('pub.connectFirst'), { kind: 'warn' }); return; }
  // t() takes a PARAMS object as its second argument, never a fallback string —
  // it answers with the key itself when one is missing, so the strings that used
  // to sit here were dead weight that could never render.
  const defaultName = `${title} ${t('common.copySuffix')}`;
  const box = document.createElement('div');
  box.className = 'bb-form-group';
  box.innerHTML = `
    <p class="bb-form-help">${t('store.newName')}</p>
    <input type="text" id="tpl-copy-name" value="${escapeHtml(defaultName)}" style="width:100%;padding:6px;" autofocus>`;
  const proceed = await openModal({
    title: t('store.copy'), body: box,
    actions: [{ label: t('common.cancel') }, { label: t('store.copyGo'), kind: 'primary', value: 1 }],
    onMount: card => {
      setTimeout(() => box.querySelector('#tpl-copy-name')?.focus(), 10);
      const inp = box.querySelector('#tpl-copy-name');
      inp?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          card.querySelector('.bb-modal-footer .bb-btn-primary')?.click();
        }
      });
    }
  });
  if (!proceed) return;
  const displayName = box.querySelector('#tpl-copy-name').value.trim();
  if (!displayName) return;

  toast(t('store.copying'), { kind: 'info', ttl: 3000 });
  try {
    const res = await storeTemplates.copy(slug, displayName);
    // `/copy` creates a PRIVATE HTML TEMPLATE in the account — not a data slot
    // holding a playlist. Its response is { success, templateSlug, templateId,
    // name } (store spec + verified live). This read `res.slot.slug ?? res.slug`,
    // neither of which exists, so every copy ended in "No target slug received
    // from the server" — while the server had in fact created the template. A
    // live account had three of them sitting there unnoticed, because until now
    // nothing in the Studio listed owned templates at all.
    const id = res?.templateId ?? res?.templateSlug;
    if (!id) throw new Error(tx('The server returned no template id.'));
    toast(t('store.copiedToTemplates', { name: res?.name || displayName }), { kind: 'success' });
    // Show the result instead of describing it: switch to the tab that now
    // holds the copy.
    state.ui.libraryTab = 'templates';
    _libRender?.();
  } catch (e) {
    toast(e.message, { kind: 'error' });
  }
}

const groupLabel = g => t('group.' + g) !== 'group.' + g ? t('group.' + g) : (g ?? 'misc');

function renderWidgets(body) {
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'avs-lib-search';
  search.placeholder = t('lib.search');
  const groupsWrap = document.createElement('div');
  body.append(search, groupsWrap);

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    groupsWrap.replaceChildren();
    for (const { group, plugins } of listByGroup()) {
      const matches = plugins.filter(p => !q
        || (p.label + ' ' + tx(p.label)).toLowerCase().includes(q)
        || (p.type + ' ' + (group ?? '')).toLowerCase().includes(q)
        || groupLabel(group).toLowerCase().includes(q));
      if (!matches.length) continue;
      const sec = document.createElement('div');
      sec.className = 'avs-lib-group';
      sec.innerHTML = `<div class="avs-lib-group-label">${escapeHtml(groupLabel(group))}</div>`;
      const grid = document.createElement('div');
      grid.className = 'avs-widget-grid';
      for (const p of matches) {
        const btn = document.createElement('button');
        btn.className = 'avs-widget-tile';
        btn.title = tx(p.label);
        btn.innerHTML = `<span class="avs-widget-ic">${widgetIcon(p.type, p.icon ?? '&#9633;', 24)}</span><span class="avs-widget-lab">${escapeHtml(tx(p.label))}</span>`;
        // Usage/licensing badge — a quiet amber corner glyph for plugins whose
        // data source carries a constraint (private-only / bring-your-own-key).
        // business-ok is intentionally left unbadged (see mountUsageBadge).
        mountUsageBadge(btn, p.usage);
        btn.addEventListener('click', () => {
          const w = addWidget(p.type);
          if (!w) return;
          toast(t('lib.added', { label: tx(p.label) }), { kind: 'success', ttl: 1500 });
          // On a phone this library IS a sheet covering the canvas, so the
          // widget just added would land out of sight behind it. The editor
          // shell listens and gets out of the way; on a desktop nothing is
          // listening and nothing happens.
          emit('widget.added', w);
        });
        // Drag-to-canvas: the canvas listens for `avs/widget-type` payloads on
        // dragover/drop and places the widget at the drop point. Click-to-add
        // (handler above) stays as the fallback.
        btn.draggable = true;
        btn.addEventListener('dragstart', e => {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('avs/widget-type', p.type);
          // Also set a generic text payload so other drop targets degrade
          // gracefully.
          e.dataTransfer.setData('text/plain', p.type);
          btn.classList.add('avs-widget-tile-dragging');
        });
        btn.addEventListener('dragend', () => btn.classList.remove('avs-widget-tile-dragging'));
        grid.appendChild(btn);
      }
      sec.appendChild(grid);
      groupsWrap.appendChild(sec);
    }
    if (!groupsWrap.children.length) groupsWrap.innerHTML = `<div class="bb-empty-state">${t('lib.noWidgets')}</div>`;
    // "My widgets" — the user's saved presets / designs / composites. Always
    // shown (even when empty) so New / Import are reachable.
    renderMyWidgets(groupsWrap, q);
  };
  search.addEventListener('input', draw);
  draw();
}

// The "My widgets" palette group: saved entries plus New + Import actions.
// `q` is the active search filter (matched against entry names).
function renderMyWidgets(groupsWrap, q) {
  const entries = listCustomWidgets()
    .filter(e => !q || e.name.toLowerCase().includes(q));
  const sec = document.createElement('div');
  sec.className = 'avs-lib-group avs-lib-group-mine';
  sec.innerHTML = `<div class="avs-lib-group-label">${escapeHtml(tx('My widgets'))}</div>`;

  const actions = document.createElement('div');
  actions.className = 'avs-lib-mine-actions';
  actions.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;';
  const newBtn = document.createElement('button');
  newBtn.className = 'bb-btn bb-btn-secondary bb-btn-sm';
  newBtn.innerHTML = uiIconSvg('brandkit', 14) + escapeHtml(tx('New custom widget'));
  newBtn.addEventListener('click', () => {
    const w = addWidget('custom');
    if (w) openWidgetDesigner(w, { onApply: () => { commit('widget-design'); canvasRender(); } });
  });
  const slideBtn = document.createElement('button');
  slideBtn.className = 'bb-btn bb-btn-secondary bb-btn-sm';
  slideBtn.innerHTML = uiIconSvg('puzzle', 14) + escapeHtml(tx('Save slide'));
  slideBtn.title = tx('Save every widget on the current slide as one composite');
  slideBtn.addEventListener('click', () => {
    const pl = state.playlist;
    const slide = pl?.slides.find(s => s.id === state.ui.activeSlideId) ?? pl?.slides[0];
    saveSlideAsComposite(slide);
  });
  const impBtn = document.createElement('button');
  impBtn.className = 'bb-btn bb-btn-secondary bb-btn-sm';
  impBtn.innerHTML = uiIconSvg('upload', 14) + escapeHtml(tx('Import'));
  impBtn.addEventListener('click', () => importCustomWidget());
  actions.append(newBtn, slideBtn, impBtn);
  sec.appendChild(actions);

  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'avs-muted';
    empty.style.cssText = 'font-size:12px;margin:0 0 4px;';
    empty.textContent = q ? tx('No saved widgets match.') : tx('Save any widget with ⭐ in the inspector, or design a new one.');
    sec.appendChild(empty);
    groupsWrap.appendChild(sec);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'avs-widget-grid';
  for (const entry of entries) {
    const btn = document.createElement('button');
    btn.className = 'avs-widget-tile';
    btn.title = entry.name;
    btn.style.position = 'relative';
    btn.innerHTML = `<span class="avs-widget-ic">${widgetIcon('custom', escapeHtml(entry.icon ?? ''), 24)}</span><span class="avs-widget-lab">${escapeHtml(entry.name)}</span>`;
    btn.addEventListener('click', () => placeEntry(entry));
    // Drag-to-canvas: the canvas resolves `avs/custom-id` on drop.
    btn.draggable = true;
    btn.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('avs/custom-id', entry.id);
      e.dataTransfer.setData('text/plain', entry.name);
      btn.classList.add('avs-widget-tile-dragging');
    });
    btn.addEventListener('dragend', () => btn.classList.remove('avs-widget-tile-dragging'));

    // Corner actions: export + delete. Stop propagation so they don't add/drag.
    const corner = document.createElement('span');
    corner.className = 'avs-mine-corner';
    corner.style.cssText = 'position:absolute;top:2px;right:2px;display:flex;gap:1px;';
    // <button>, not <span>: these are the export and DELETE actions on a saved
    // widget. As spans they had a cursor and a tooltip but no keyboard path at
    // all — a destructive action reachable only by mouse.
    const mkCorner = (icon, title, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'avs-mine-corner-btn';
      b.innerHTML = uiIconSvg(icon, 12);
      b.title = title;
      b.setAttribute('aria-label', title);
      const stop = e => { e.preventDefault(); e.stopPropagation(); };
      b.addEventListener('mousedown', stop);
      b.addEventListener('click', e => { stop(e); fn(); });
      return b;
    };
    corner.appendChild(mkCorner('download', tx('Export'), () => exportEntry(entry)));
    corner.appendChild(mkCorner('trash', tx('Delete'), async () => {
      const ok = await openModal({
        title: tx('Delete widget'),
        body: (() => { const d = document.createElement('div'); d.innerHTML = `<p>${escapeHtml(tx('Delete'))} “${escapeHtml(entry.name)}”?</p>`; return d; })(),
        actions: [{ label: t('common.cancel') }, { label: tx('Delete'), kind: 'danger', value: 1 }],
      });
      if (ok) removeEntry(entry.id);
    }));
    btn.appendChild(corner);
    grid.appendChild(btn);
  }
  sec.appendChild(grid);
  groupsWrap.appendChild(sec);
}


function renderAssets(body) {
  if (state.connection.status !== 'connected') {
    body.innerHTML = `<p class="bb-form-help">${t('lib.assetsConnect')}</p>`;
    return;
  }
  const addBtn = document.createElement('button');
  addBtn.className = 'bb-btn bb-btn-secondary';
  addBtn.innerHTML = uiIconSvg('image', 14) + escapeHtml(t('lib.addImage'));
  addBtn.addEventListener('click', async () => {
    const url = await assetLibrary.pickAsset('image');
    if (url) addWidget('image', { url, fit: 'cover', overlay: 0 });
  });
  body.appendChild(addBtn);
  const panel = document.createElement('div');
  body.appendChild(panel);
  assetLibrary.renderPanel(panel);
  assetLibrary.refresh();
}

// The Templates tab is a doorway, not a second store: the gallery needs the
// width of a modal to show real previews, and a 300 px side panel cannot. So
// this explains what is behind the door and opens it.
function renderTemplates(body) {
  body.innerHTML = `<p class="bb-form-help">${escapeHtml(t('tplStore.libLead'))}</p>`;
  const btn = document.createElement('button');
  btn.className = 'bb-btn bb-btn-primary';
  btn.innerHTML = uiIconSvg('grid', 14) + escapeHtml(t('tplStore.libOpen'));
  btn.addEventListener('click', () => openTemplateStore().then(applied => { if (applied) canvasRenderSlide(); }));
  body.appendChild(btn);

  // Below the door to the Studio's own slide sets: the templates THIS account
  // saved in agentView (from a publish, or off a running display). Different
  // things entirely — one is a catalog to start from, the other is your own
  // shelf — so they get their own heading rather than one merged list.
  const own = document.createElement('div');
  own.className = 'avs-lib-own-tpl';
  own.innerHTML = `<h4 class="avs-lib-subhead">${escapeHtml(t('tpl.ownHead'))}</h4>`;
  const list = document.createElement('div');
  own.appendChild(list);
  body.appendChild(own);
  renderOwnTemplates(list);
}

function renderApis(body) {
  body.innerHTML = `<p class="bb-form-help">${t('lib.apisHelp')}</p>`;
  const btn = document.createElement('button');
  btn.className = 'bb-btn bb-btn-primary';
  btn.innerHTML = uiIconSvg('plug', 14) + escapeHtml(t('lib.openApis'));
  btn.addEventListener('click', () =>
    publicApiBrowser.open(slide => {
      addWidget(slide.type ?? 'live-json', slide.content ?? {});
      toast(t('lib.added', { label: slide.type ?? 'API' }), { kind: 'success', ttl: 1500 });
    }));
  body.appendChild(btn);
}

// ---------- Usage / licensing badge ----------
// Plugins MAY carry a `usage` descriptor (see shared/plugin-contract.js):
//   { tier: 'business-ok' | 'private-only' | 'byo-key', note?, attribution?, providerTerms? }
// We badge ONLY the tiers that carry a constraint the operator must know
// BEFORE picking the widget — and quietly: a single amber glyph in the tile
// corner (a key for byo-key, a padlock for private-only), not a loud word-pill. The readable
// tier, note and attribution ride along in the hover tooltip + click popover,
// and the full note is repeated in the inspector once the widget is placed
// (see admin/panels/inspector.js).
//
// `business-ok` deliberately gets NO badge: a reassurance chip prevents no bad
// decision, it only adds noise and dilutes the real warnings — the absence of
// a glyph already says "fine to use". Attribution is likewise NOT a reason to
// badge here: it's a *display*-time duty already rendered on the widget itself
// (e.g. weather/map), so the library only needs to signal the *constraint*.
const USAGE_BADGES = {
  'private-only': { icon: 'lock',    labelKey: 'usage.privateOnly' },
  'byo-key':      { icon: 'apikeys', labelKey: 'usage.byoKey' },
};

function mountUsageBadge(tile, usage) {
  const def = usage?.tier && USAGE_BADGES[usage.tier];
  if (!def) return;
  // The tile is a flex column; anchor the badge to its top-right corner.
  tile.style.position = 'relative';
  const tok = 'var(--bb-warn)';
  const badge = document.createElement('span');
  badge.className = 'avs-usage-badge';
  badge.innerHTML = uiIconSvg(def.icon, 11);
  // Icon-only: a small amber-tinted dot, not a word-pill. Quiet enough not to
  // compete with the widget icon/label, but still reads as "this one has
  // strings attached". Tier label + note travel in the tooltip / popover.
  badge.style.cssText = `position:absolute;top:3px;right:3px;display:inline-flex;align-items:center;justify-content:center;`
    + `width:17px;height:17px;border-radius:999px;font-size:11px;line-height:1;`
    + `cursor:help;pointer-events:auto;`
    + `background:color-mix(in srgb, ${tok} 20%, transparent);`
    + `box-shadow:0 0 0 1px color-mix(in srgb, ${tok} 32%, transparent);`;
  // Tooltip carries tier + note + attribution so the signal is legible on
  // hover without opening the popover (touch users tap → popover). The glyph
  // alone is opaque to screen readers, so mirror the same text into aria-label.
  const tipParts = [t(def.labelKey), usage.note, usage.attribution].filter(Boolean);
  badge.title = tipParts.join(' · ');
  badge.setAttribute('aria-label', tipParts.join('. '));
  // Clicking the badge opens the details popover and must NOT fall through to
  // the tile's "add widget" / drag handlers.
  // Focusable: the badge is the only way into the popover with the provider's
  // terms, and it sat on a <span> that Tab could not reach. The aria-label above
  // already carries tier + note, so a screen-reader user was not blind to the
  // constraint — but could not open the detail.
  badge.tabIndex = 0;
  badge.setAttribute('role', 'button');
  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  badge.addEventListener('mousedown', stop);
  badge.addEventListener('click', e => { stop(e); openUsagePopover(badge, usage, tok); });
  badge.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    stop(e);
    openUsagePopover(badge, usage, tok);
  });
  tile.appendChild(badge);
}

// Small popover anchored under the badge showing the full usage note,
// attribution, and a link to the provider's terms. One popover at a time —
// opening another (or an outside click / Escape) closes the previous.
function openUsagePopover(anchor, usage, tok) {
  document.querySelectorAll('.avs-usage-pop').forEach(el => el.remove());
  const pop = document.createElement('div');
  pop.className = 'avs-usage-pop';
  pop.setAttribute('role', 'dialog');
  pop.style.cssText = `position:fixed;z-index:1000;max-width:260px;padding:10px 12px;`
    + `background:var(--bb-bg-2,#1a1d24);border:1px solid var(--bb-border,#333);`
    + `border-left:3px solid ${tok};border-radius:var(--bb-r-md,8px);`
    + `box-shadow:var(--bb-shadow-pop,0 8px 24px rgba(0,0,0,.4));`
    + `font-size:12px;line-height:1.5;color:var(--bb-ink,#eee);`;
  const rows = [];
  rows.push(`<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(t(({
    'private-only': 'usage.privateOnly', 'byo-key': 'usage.byoKey',
  })[usage.tier] ?? usage.tier))}</div>`);
  if (usage.note) rows.push(`<div style="opacity:.85;">${escapeHtml(usage.note)}</div>`);
  if (usage.attribution) rows.push(`<div style="opacity:.7;margin-top:6px;">${escapeHtml(usage.attribution)}</div>`);
  if (usage.providerTerms && isSafeImgUrl(usage.providerTerms)) {
    rows.push(`<div style="margin-top:8px;"><a href="${escapeAttr(usage.providerTerms)}" target="_blank" rel="noopener noreferrer" style="color:${tok};text-decoration:underline;">${escapeHtml(t('usage.terms'))} ↗</a></div>`);
  }
  pop.innerHTML = rows.join('');
  document.body.appendChild(pop);

  // Position under the badge, clamped to the viewport (rect coords already
  // account for scroll since position is fixed).
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth || 260;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
  pop.style.top  = `${r.bottom + 6}px`;

  const onAway = e => { if (!pop.contains(e.target) && e.target !== anchor) cleanup(); };
  const onKey  = e => { if (e.key === 'Escape') cleanup(); };
  function cleanup() {
    pop.remove();
    document.removeEventListener('mousedown', onAway, true);
    document.removeEventListener('keydown', onKey);
  }
  // Defer wiring so the click that opened the popover doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener('mousedown', onAway, true);
    document.addEventListener('keydown', onKey);
  }, 0);
}
