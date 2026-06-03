// Playlist file import/export — download the current playlist as JSON, and load
// a playlist file back (with schema + widget migrations applied). Extracted from
// main.js. The import path needs two app-level hooks the editor owns: ensureSlide
// (guarantee an active slide id) and render (repaint the canvas); they're passed
// in so this module stays free of editor-shell coupling.

import { state, commit } from './store.js';
import { migratePlaylist, applyWidgetMigrations } from '../shared/slide-schema.js';
import { get as getPlugin } from '../shared/plugins/registry.js';
import { toast } from './ui/toast.js';
import { t } from './i18n.js';

export function exportPlaylist() {
  const blob = new Blob([JSON.stringify(state.playlist, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (state.playlist?.name ?? 'playlist') + '.json'; a.click();
  URL.revokeObjectURL(url);
  toast(t('toast.exported'), { kind: 'success' });
}

export function importPlaylist({ ensureSlide, render } = {}) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json';
  input.addEventListener('change', async () => {
    const f = input.files[0]; if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      state.playlist = applyWidgetMigrations(migratePlaylist(obj), getPlugin);
      ensureSlide?.(); commit('import-playlist'); render?.();
      toast(t('toast.loaded'), { kind: 'success' });
    } catch (e) { toast(e.message, { kind: 'error' }); }
  });
  input.click();
}
