// Importing a playlist file over the one that is open.
//
// This is the single most destructive button in the editor: it replaces the
// whole playlist, and the only thing standing between the user and an empty
// canvas used to be picking the right file. migratePlaylist() turns ANY object
// into a playlist — so a widget export, a data slot, a package.json, anything
// with no `slides` array became a playlist with no slides, and the editor said
// "Playlist loaded."
//
// The player has refused exactly that shape since the day a 404 body wiped a
// display's offline cache (see shared/playlist-response.js). The editor now
// uses the same front door.
//
// Browser-only: it drives a real file picker and reads the real toast.

import { test, expect, describe } from './runner.js';
import { state } from '../admin/store.js';
import { importPlaylist } from '../admin/playlist-io.js';
import { setLocale } from '../admin/i18n.js';
import { loadInto } from '../admin/cloud-load.js';

const canForgeFiles = (() => { try { return !!new DataTransfer(); } catch { return false; } })();

const fileOf = (text, name = 'datei.json') => {
  const dt = new DataTransfer();
  dt.items.add(new File([text], name, { type: 'application/json' }));
  return dt.files;
};

// Run importPlaylist() and answer its picker with `files`.
async function importFile(files) {
  const realClick = HTMLInputElement.prototype.click;
  let input = null;
  HTMLInputElement.prototype.click = function () { input = this; };
  let rendered = 0;
  try {
    const pending = importPlaylist({ ensureSlide: () => {}, render: () => { rendered++; } });
    await new Promise(r => setTimeout(r, 0));
    input.files = files;
    input.dispatchEvent(new Event('change'));
    await pending;
  } finally {
    HTMLInputElement.prototype.click = realClick;
  }
  const toasts = [...document.querySelectorAll('.bb-toast')];
  return { rendered, said: toasts.length ? toasts[toasts.length - 1].textContent.trim() : '' };
}

const OPEN = () => ({
  schemaVersion: 3, id: 'offen', name: 'Die offene Playlist',
  defaults: { duration: 10, transition: 'fade', theme: 'minimal-dark' },
  slides: [{ id: 'behalten', name: 'BEHALTEN', duration: 10, widgets: [] }],
});

describe('playlist import · the file has to be a playlist', () => {
  test('REGRESSION: a file with no slides leaves the open playlist alone', async () => {
    if (!canForgeFiles) return;
    const saved = state.playlist;
    try {
      state.playlist = OPEN();
      // What a user actually picks by mistake: the app's OTHER export format.
      const widgetExport = '{"kind":"avs-custom-widget","name":"Mein Widget","template":"<b>hi</b>"}';
      const { rendered, said } = await importFile(fileOf(widgetExport, 'mein-widget.avswidget.json'));
      expect(state.playlist.slides).toHaveLength(1);
      expect(state.playlist.slides[0].name).toBe('BEHALTEN');
      expect(state.playlist.name).toBe('Die offene Playlist');
      expect(rendered).toBe(0);
      // …and it says which file, and what was wrong with it — in one
      // language. The verdict comes from a player module with no i18n, so it
      // travels as a CODE and the editor puts the sentence together.
      expect(said).toContain('mein-widget.avswidget.json');
      expect(said).toContain('no list of slides');
      expect(said).toContain('kind, name');
    } finally { state.playlist = saved; }
  });

  test('REGRESSION: an error envelope is not a playlist either', async () => {
    if (!canForgeFiles) return;
    const saved = state.playlist;
    try {
      state.playlist = OPEN();
      const { said } = await importFile(fileOf('{"detail":"Not Found"}', 'antwort.json'));
      expect(state.playlist.slides[0].name).toBe('BEHALTEN');
      expect(said).toContain('detail');
      // The German UI must not end its sentence in English.
      setLocale('de');
      const de = await importFile(fileOf('{"detail":"Not Found"}', 'antwort.json'));
      expect(de.said).toContain('keine Folienliste');
      expect(de.said).toContain('Es wurde nichts geändert');
      setLocale('en');
    } finally { state.playlist = saved; }
  });

  test('a file that is not JSON at all says so instead of throwing', async () => {
    if (!canForgeFiles) return;
    const saved = state.playlist;
    try {
      state.playlist = OPEN();
      const { said } = await importFile(fileOf('<html>404</html>', 'seite.html'));
      expect(state.playlist.slides[0].name).toBe('BEHALTEN');
      expect(said.length > 0).toBeTruthy();
      expect(said).notToContain('BEHALTEN');
    } finally { state.playlist = saved; }
  });

  test('a real playlist still replaces the open one', async () => {
    if (!canForgeFiles) return;
    const saved = state.playlist;
    try {
      state.playlist = OPEN();
      const incoming = JSON.stringify({
        schemaVersion: 3, id: 'neu', name: 'Die neue',
        slides: [{ id: 'n1', name: 'NEU', duration: 10, widgets: [] }],
      });
      const { rendered } = await importFile(fileOf(incoming, 'neu.json'));
      expect(state.playlist.slides).toHaveLength(1);
      expect(state.playlist.slides[0].name).toBe('NEU');
      expect(rendered).toBe(1);
    } finally { state.playlist = saved; }
  });

  test('a bare array of slides is a playlist too — v1 files still load', async () => {
    if (!canForgeFiles) return;
    const saved = state.playlist;
    try {
      state.playlist = OPEN();
      await importFile(fileOf('[{"id":"alt","type":"text","title":"ALT","duration":8,"content":"hallo"}]', 'v1.json'));
      expect(state.playlist.slides).toHaveLength(1);
      expect(state.playlist.slides[0].name).toBe('ALT');
    } finally { state.playlist = saved; }
  });
});

// The same question, asked of a data slot instead of a file.
//
// "Aus agentView öffnen" had grown its OWN copy of "is this a playlist" — the
// third in the codebase — and the copy was stricter in one place: a bare array
// of slides is a legitimate v1 payload that migratePlaylist() wraps, it loads
// from a file, and it loaded onto a display; out of a data slot it answered
// "not a playlist". One front door now, for all three.
describe('cloud load · the same front door as file and player', () => {
  const serveSlot = (body) => {
    const real = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(body), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
    return () => { globalThis.fetch = real; };
  };

  test('REGRESSION: a bare array of slides loads out of a slot too', async () => {
    const saved = state.playlist;
    const restore = serveSlot([{ id: 'alt', type: 'text', title: 'AUS-DER-WOLKE', duration: 8, content: 'hallo' }]);
    try {
      state.playlist = OPEN();
      const ok = await loadInto('avs-alt', 'Alt');
      expect(ok).toBe(true);
      expect(state.playlist.slides).toHaveLength(1);
      expect(state.playlist.slides[0].name).toBe('AUS-DER-WOLKE');
    } finally { restore(); state.playlist = saved; }
  });

  test('and something that is not a playlist still does not replace anything', async () => {
    const saved = state.playlist;
    const restore = serveSlot({ detail: 'Not Found' });
    try {
      state.playlist = OPEN();
      const ok = await loadInto('avs-weg', 'Weg');
      expect(ok).toBe(false);
      expect(state.playlist.slides[0].name).toBe('BEHALTEN');
    } finally { restore(); state.playlist = saved; }
  });

  test('an empty playlist still leaves the editor something to edit', async () => {
    // The file import guarantees a slide (ensureSlide); loading the same empty
    // playlist out of a slot used to hand the editor nothing at all.
    const saved = state.playlist;
    const restore = serveSlot({ schemaVersion: 3, id: 'leer', name: 'Leer', slides: [] });
    try {
      state.playlist = OPEN();
      expect(await loadInto('avs-leer', 'Leer')).toBe(true);
      expect(state.playlist.slides).toHaveLength(1);
      expect(state.ui.activeSlideId).toBe(state.playlist.slides[0].id);
    } finally { restore(); state.playlist = saved; }
  });

  test('a slot wrapped the way the API wraps it is unwrapped first', async () => {
    // The value can arrive as { slot: { jsonContent: "<json string>" } }.
    const saved = state.playlist;
    const restore = serveSlot({ slot: { jsonContent: JSON.stringify({
      schemaVersion: 3, id: 'w', name: 'Verpackt',
      slides: [{ id: 'w1', name: 'VERPACKT', duration: 10, widgets: [] }],
    }) } });
    try {
      state.playlist = OPEN();
      expect(await loadInto('avs-w', 'Verpackt')).toBe(true);
      expect(state.playlist.slides[0].name).toBe('VERPACKT');
    } finally { restore(); state.playlist = saved; }
  });
});
