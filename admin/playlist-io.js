// Playlist file import/export — download the current playlist as JSON, and load
// a playlist file back (with schema + widget migrations applied). Extracted from
// main.js. The import path needs two app-level hooks the editor owns: ensureSlide
// (guarantee an active slide id) and render (repaint the canvas); they're passed
// in so this module stays free of editor-shell coupling.

import { state, commit, withSavedShape } from './store.js';
import { migratePlaylist, applyWidgetMigrations } from '../shared/slide-schema.js';
import { checkPlaylistShape } from '../shared/playlist-response.js';
import { downloadJson, pickJsonFile } from './file-io.js';
import { get as getPlugin } from '../shared/plugins/registry.js';
import { toast } from './ui/toast.js';
import { t } from './i18n.js';

export function exportPlaylist() {
  // Same bracket the store uses when it saves — otherwise a backup taken
  // while a language or A/B variant is open carries the VARIANT as the
  // default and loses the original content entirely.
  const json = withSavedShape(() => JSON.stringify(state.playlist, null, 2));
  downloadJson((state.playlist?.name ?? 'playlist') + '.json', json);
  toast(t('toast.exported'), { kind: 'success' });
}

// Replace the whole playlist with the contents of a file.
//
// The player refuses a response it cannot recognise as a playlist, for a
// documented reason: migratePlaylist turns anything into a playlist, and a
// playlist with no slides is indistinguishable on screen from a crash. The
// editor's import took the same JSON and asked nothing at all — so picking the
// wrong file (a widget export, a data slot, anything) replaced the open
// playlist with an empty one and said "Playlist loaded." Undo could get it
// back, if you realised in time what had happened.
//
// Same front door as the player now, and it names what it got instead.
export async function importPlaylist({ ensureSlide, render } = {}) {
  const picked = await pickJsonFile();
  if (!picked) return;
  let obj;
  try {
    obj = JSON.parse(picked.text);
  } catch (e) {
    toast(t('toast.importBadJson', { reason: e.message ?? String(e) }), { kind: 'error' });
    return;
  }
  const shape = checkPlaylistShape(obj);
  if (!shape.ok) {
    // Say it in the reader's language, all the way to the end of the sentence.
    const why = shape.code
      ? t(`import.why.${shape.code}`, { keys: shape.keys || '—', got: shape.got ?? '' })
      : shape.reason;
    toast(t('toast.importNotPlaylist', { file: picked.name, reason: why }), { kind: 'error' });
    return;
  }
  state.playlist = applyWidgetMigrations(migratePlaylist(obj), getPlugin);
  ensureSlide?.(); commit('import-playlist'); render?.();
  toast(t('toast.loaded'), { kind: 'success' });
}
