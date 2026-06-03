// "Aus agentView öffnen" — round-trip the other way from `publish-flow.js`.
//
// Every Veröffentlichen uploads the full playlist JSON to a data slot named
// `avs-<playlist-id>` with the playlist name as the slot's `label`. This module
// lists those slots and lets the user re-hydrate `state.playlist` from one.
//
// Asset references inside widgets are absolute URLs on the agentView asset CDN
// (public, auth-free), so loading a slot also transparently restores image /
// video / PDF widgets — no re-upload needed. RSS, Live-JSON, Data-Slot widgets
// reference URLs too, so they work the same way.

import { slots as slotsApi } from './api.js';
import { state, commit, persist } from './store.js';
import { openModal } from './ui/modal.js';
import { toast } from './ui/toast.js';
import { t } from './i18n.js';
import { migratePlaylist, applyWidgetMigrations, SCHEMA_VERSION } from '../shared/slide-schema.js';
import { get as getPlugin } from '../shared/plugins/registry.js';
import { escapeHtml } from '../shared/utils/escape.js';

// All published playlists land under this prefix (see publish-flow.js → slugFor).
const SLUG_PREFIX = 'avs-';

// Slot list comes back as { slots:[…] } / { items:[…] } / a bare array — tolerate
// all three, mirroring the same defensive shape-unwrap as asset-library.
function unwrapList(raw) {
  if (Array.isArray(raw)) return raw;
  return raw?.slots ?? raw?.items ?? raw?.data ?? [];
}

function fmtBytes(b) {
  if (!b) return '—';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(b >= 10 || i === 0 ? 0 : 1) + ' ' + u[i];
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  // Locale-aware short form — matches the rest of the admin UI.
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function row(s) {
  // Per swagger DataSlotListItem: slotId, slug, sizeBytes, readUrl, label?, updatedAt?, …
  // Fall back across the names we've seen on the wire — `label` is what
  // publish-flow.js sets to `playlist.name`, so it's the friendly display name.
  const slug = s.slug ?? s.slotId ?? s.id ?? '';
  const name = s.label ?? s.name ?? slug.replace(SLUG_PREFIX, '');
  const size = s.sizeBytes ?? s.bytes ?? 0;
  const updated = s.updatedAt ?? s.modifiedAt ?? s.lastModified ?? null;
  return `<li class="bb-cloud-row" data-slug="${escapeHtml(slug)}">
    <div class="bb-cloud-row-main">
      <div class="bb-cloud-row-name">${escapeHtml(name)}</div>
      <div class="bb-cloud-row-meta">
        <span>${escapeHtml(slug)}</span>
        <span>·</span>
        <span>${fmtBytes(size)}</span>
        ${updated ? `<span>·</span><span title="${escapeHtml(updated)}">${escapeHtml(fmtDate(updated))}</span>` : ''}
      </div>
    </div>
    <button class="bb-btn bb-btn-primary" data-act="open">${escapeHtml(t('cloud.open'))}</button>
  </li>`;
}

function looksLikePlaylist(v) {
  // The publish bundler always stores a shape like createPlaylist() — but the
  // value could also be hand-edited via the data-slot inspector or be a legacy
  // shape. Be liberal: anything with a slides array passes; migratePlaylist()
  // handles the rest (legacy v1, missing defaults, missing ids, etc.).
  return v && typeof v === 'object' && Array.isArray(v.slides);
}

// Check forward-compatibility BEFORE we apply the playlist. The migration
// chain only walks old→new; if a Studio published with a future schema, those
// new shapes pass through unchanged and the user could mistake silent feature
// degradation for "everything's fine". Surfacing the gaps here lets them
// decide whether to update Studio or accept the missing bits.
//
// Returns { schemaTooNew, unknownTypes:Set, forwardWidgets:Set }. Empty
// fields = nothing to warn about.
function compatibilityReport(playlist, rawSchemaVersion) {
  const report = {
    schemaTooNew: Number.isInteger(rawSchemaVersion) && rawSchemaVersion > SCHEMA_VERSION,
    unknownTypes: new Set(),
    forwardWidgets: new Set(),
  };
  for (const slide of playlist.slides ?? []) {
    for (const w of slide.widgets ?? []) {
      const plugin = getPlugin(w.type);
      if (!plugin) {
        report.unknownTypes.add(w.type);
        continue;
      }
      // applyWidgetMigrations() leaves contentVersion as-is when from >= target,
      // so a future-versioned widget still carries the higher stamp here.
      if (
        Number.isInteger(w.contentVersion) &&
        Number.isInteger(plugin.schemaVersion) &&
        w.contentVersion > plugin.schemaVersion
      ) {
        report.forwardWidgets.add(w.type);
      }
    }
  }
  return report;
}

export async function loadInto(slug, label) {
  let value;
  try {
    value = await slotsApi.getValue(slug);
  } catch (e) {
    toast(t('cloud.loadFailed', { msg: e.message }), { kind: 'error' });
    return false;
  }
  if (!looksLikePlaylist(value)) {
    toast(t('cloud.notAPlaylist'), { kind: 'error' });
    return false;
  }
  // Capture the raw schemaVersion before migratePlaylist rewrites it. Run the
  // same migration chain Studio uses on import / hydrate, so an older
  // schemaVersion gets upgraded transparently and missing per-widget versions
  // are stamped forward.
  const rawSchemaVersion = value.schemaVersion;
  const pl = applyWidgetMigrations(migratePlaylist(value), getPlugin);

  // Surface forward-incompatibility AFTER migration (so v1→v2 isn't flagged)
  // but BEFORE assigning to state (so the success toast appears last). The
  // load still proceeds — Canvas already renders unknown widgets as a visible
  // "Unknown widget" placeholder, and the user can decide what to do.
  const report = compatibilityReport(pl, rawSchemaVersion);
  if (report.schemaTooNew) {
    toast(t('cloud.newerSchema'), { kind: 'warn', ttl: 9000 });
  }
  if (report.unknownTypes.size) {
    toast(t('cloud.unknownTypes', { types: [...report.unknownTypes].join(', ') }), { kind: 'warn', ttl: 9000 });
  }
  if (report.forwardWidgets.size) {
    toast(t('cloud.forwardWidgets', { types: [...report.forwardWidgets].join(', ') }), { kind: 'warn', ttl: 9000 });
  }

  state.playlist = pl;
  state.ui.activeSlideId = pl.slides[0]?.id ?? null;
  state.ui.selectedWidgetId = null;
  commit('load-from-cloud');
  persist();
  toast(t('cloud.loaded', { name: label || pl.name || slug }), { kind: 'success' });
  return true;
}

export async function open() {
  if (state.connection.status !== 'connected') {
    toast(t('cloud.connectFirst'), { kind: 'warn' });
    return;
  }

  let list = [];
  try {
    list = unwrapList(await slotsApi.list()).filter(s => {
      const slug = s.slug ?? s.slotId ?? s.id ?? '';
      return slug.startsWith(SLUG_PREFIX);
    });
  } catch (e) {
    toast(t('cloud.listFailed', { msg: e.message }), { kind: 'error' });
    return;
  }

  // Newest first — most useful default for "what did I just publish".
  list.sort((a, b) => {
    const at = new Date(a.updatedAt ?? a.modifiedAt ?? 0).getTime();
    const bt = new Date(b.updatedAt ?? b.modifiedAt ?? 0).getTime();
    return bt - at;
  });

  const host = document.createElement('div');
  host.className = 'bb-cloud-picker';
  host.innerHTML = `
    <p class="bb-form-help">${escapeHtml(t('cloud.help'))}</p>
    <ul class="bb-cloud-list">
      ${list.length
        ? list.map(row).join('')
        : `<li class="bb-empty-state">${escapeHtml(t('cloud.empty'))}</li>`}
    </ul>
  `;

  await openModal({
    title: t('cloud.title'),
    body: host,
    actions: [{ label: t('common.close') }],
    onMount: (_card, close) => {
      host.addEventListener('click', async e => {
        const btn = e.target.closest('[data-act="open"]');
        if (!btn) return;
        const li = btn.closest('.bb-cloud-row');
        const slug = li?.dataset.slug;
        if (!slug) return;

        const currentHasContent = (state.playlist?.slides?.length ?? 0) > 0;
        if (currentHasContent) {
          const proceed = await openModal({
            title: t('cloud.replaceTitle'),
            body: (() => { const d = document.createElement('p'); d.textContent = t('cloud.replaceBody'); return d; })(),
            actions: [
              { label: t('common.cancel'), value: 0 },
              { label: t('cloud.openBtn'), kind: 'primary', value: 1 },
            ],
          });
          if (!proceed) return;
        }

        const labelEl = li.querySelector('.bb-cloud-row-name');
        const ok = await loadInto(slug, labelEl?.textContent ?? slug);
        if (ok) close(undefined);
      });
    },
  });
}
