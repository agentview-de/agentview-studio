// Verwaltung → Versionen Tab. Per-playlist publish history with one-click
// restore. The history lives in a sidecar data slot (`avs-<playlistId>-history`)
// written at publish time; each entry is a full playlist snapshot. Sits behind
// the Tab-Shell, but with two twists ported faithfully from the inline renderer:
//   1. No `spec.load`. The playlist is read from `state.playlist` (not fetched),
//      so the "no playlist → emptyState()" edge case can't live in load — we do
//      everything in an async `render` that reads state, fetches the slot, and
//      renders the empties or the table.
//   2. Restore is NOT a tab reload. It replaces `state.playlist` via the boot
//      migration pipeline and switches to the editor view, so it binds with
//      ctx.onClick (raw, no reload) rather than ctx.onAction.
import { mountTab, table, esc, emptyState } from './shell.js';
import { slots } from '../../api.js';
import { state, commit } from '../../store.js';
import { migratePlaylist, applyWidgetMigrations } from '../../../shared/slide-schema.js';
import { get as getPlugin } from '../../../shared/plugins/registry.js';
import { t } from '../../i18n.js';
import { toast } from '../../ui/toast.js';
import { openModal } from '../../ui/modal.js';
import { fmtDateTime } from '../../format-date.js';

export function mountVersions(body) {
  return mountTab(body, {
    title: t('admin.versions'),
    // The shell owns header/loading/error. We fetch fresh inside render (the
    // Verwaltung data cache is dropped — no state.admin.versions): read the
    // playlist from state, build the history slug, and render straight in.
    render: async (_data, ctx) => {
      const pl = state.playlist;
      // Edge case: no playlist → generic empty state (the slug can't be built).
      if (!pl?.id) { ctx.content.innerHTML = emptyState(); return; }
      const slug = `avs-${pl.id}-history`;
      const hist = await slots.getValue(slug).catch(() => null);
      const versions = hist?.versions ?? [];
      if (!versions.length) {
        ctx.content.innerHTML = emptyState(t('ver.empty'));
        return;
      }
      ctx.content.innerHTML = table(
        [t('ver.colTime'), t('ver.colBy'), t('ver.colSlides'), t('ver.colDeployed'), t('ver.colAction')],
        versions.map((v, idx) => `<tr>
          <td>${esc(fmtDateTime(v.at))}</td>
          <td>${esc(v.by ?? '—')}</td>
          <td>${esc(v.snapshot?.slides?.length ?? 0)}</td>
          <td>${esc((v.deployedTo ?? []).length)}</td>
          <td><button class="bb-btn" data-restore="${idx}">${t('admin.restore')}</button></td>
        </tr>`)
      );
      // Restore is a modal-confirm that does NOT reload the tab: on OK it
      // replaces state.playlist via the migration pipeline and switches to the
      // editor view. Hence ctx.onClick (raw), not ctx.onAction.
      ctx.onClick('[data-restore]', async (b) => {
        const idx = +b.dataset.restore;
        const v = versions[idx];
        if (!v?.snapshot) return;
        const ok = await openModal({
          title: t('admin.restore'),
          body: (() => { const d = document.createElement('div'); d.innerHTML = `<p>${t('ver.restoreConfirm', { at: `<b>${esc(fmtDateTime(v.at))}</b>` })}</p>`; return d; })(),
          actions: [{ label: t('common.cancel') }, { label: t('admin.restore'), kind: 'primary', value: 1 }],
        });
        if (!ok) return;
        // Reload-free restore: replace state.playlist with the snapshot via the same
        // migration pipeline used at boot. Ensures schema v3 stamp on older
        // snapshots, runs widget-content migrations, and notifies subscribers
        // (canvas / slide-rail) without a full page refresh.
        state.playlist = applyWidgetMigrations(migratePlaylist(v.snapshot), getPlugin);
        if (state.playlist?.slides?.length) {
          state.ui.activeSlideId = state.playlist.slides[0].id;
        }
        state.ui.selectedWidgetId = null;
        commit('restore-version');
        toast(t('admin.restore'), { kind: 'success' });
        // Switch back to editor so the user sees the restored content.
        state.ui.activeView = 'editor';
        document.querySelector('[data-view="editor"]')?.click();
      });
    },
  });
}
