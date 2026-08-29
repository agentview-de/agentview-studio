// What the app says, and whether anyone can hear it.
//
// 181 call sites use the toast to report what just happened — "Playlist
// geladen", "Veröffentlicht", "„x.json“ ist keine Playlist-Datei". The host
// carried no role and no aria-live, so all of it appeared and vanished in
// silence: a blind user pressed Publish and was told nothing, either way.
//
// The visual toast stays what it is. Beside it now sit two live regions, and
// the politeness is chosen by kind — because a region's politeness cannot be
// changed once it is in the document, so one region cannot do both jobs.
//
// Browser-only: live regions are DOM.

import { test, expect, describe } from './runner.js';
import { toast, mount } from '../admin/ui/toast.js';

const host = () => document.querySelector('.bb-toast-host');
const polite = () => host()?.querySelector('[aria-live="polite"]');
const assertive = () => host()?.querySelector('[aria-live="assertive"]');
const settle = () => new Promise(r => setTimeout(r, 60));

describe('toast · the message reaches a screen reader', () => {
  test('REGRESSION: the host carries two live regions, wired by urgency', () => {
    mount();
    expect(host() === null).toBeFalsy();
    expect(polite()?.getAttribute('role')).toBe('status');
    expect(assertive()?.getAttribute('role')).toBe('alert');
    // Atomic: the region reads as one message, not as the words that changed.
    expect(polite()?.getAttribute('aria-atomic')).toBe('true');
    expect(assertive()?.getAttribute('aria-atomic')).toBe('true');
  });

  // Assert what THIS call did, never what the other region happens to hold:
  // the regions live for the whole page, and every suite that triggers a toast
  // leaves its last message in one of them.
  const said = async (text, kind) => {
    const before = { polite: polite().textContent, assertive: assertive().textContent };
    const el = toast(text, { kind, ttl: 50 });
    await settle();
    const after = { polite: polite().textContent, assertive: assertive().textContent };
    el.remove();
    return { before, after };
  };

  test('REGRESSION: a success is announced politely', async () => {
    const { before, after } = await said('Playlist geladen.', 'success');
    expect(after.polite).toBe('Playlist geladen.');
    expect(after.assertive).toBe(before.assertive);   // the urgent one is untouched
  });

  test('REGRESSION: a failure interrupts', async () => {
    const { before, after } = await said('Import fehlgeschlagen', 'error');
    expect(after.assertive).toBe('Import fehlgeschlagen');
    expect(after.polite).toBe(before.polite);
  });

  test('a warning is urgent too — it is the one people must not miss', async () => {
    const { after } = await said('Nur 50 von 214 geladen', 'warn');
    expect(after.assertive).toBe('Nur 50 von 214 geladen');
  });

  test('the same message twice is two announcements', async () => {
    // A region whose text does not change announces nothing, so it is cleared
    // first. Pressing Publish twice has to be audible twice.
    const a = toast('Veröffentlicht', { kind: 'success', ttl: 50 });
    await settle();
    expect(polite().textContent).toBe('Veröffentlicht');
    const b = toast('Veröffentlicht', { kind: 'success', ttl: 50 });
    // Cleared on the way…
    expect(polite().textContent).toBe('');
    await settle();
    // …and set again, which is the event a reader picks up.
    expect(polite().textContent).toBe('Veröffentlicht');
    a.remove(); b.remove();
  });

  test('the visible toast is not announced a second time', async () => {
    const el = toast('Gespeichert', { kind: 'success', ttl: 50 });
    await settle();
    // The message is announced from the region; the decoration says nothing.
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.bb-toast-icon').getAttribute('aria-hidden')).toBe('true');
    // …and it still SHOWS the text, for everyone who reads with their eyes.
    expect(el.textContent).toContain('Gespeichert');
    el.remove();
  });

  test('the regions do not take part in the visible stack', async () => {
    // They live inside the host on purpose — the dialog-inerting pass spares
    // .bb-toast-host, so it spares them. That only works if they cost no
    // layout: absolutely positioned, out of the flex flow.
    const el = toast('x', { kind: 'info', ttl: 50 });
    await settle();
    for (const r of [polite(), assertive()]) {
      expect(r.className).toContain('bb-sr-only');
      expect(host().contains(r)).toBeTruthy();
    }
    el.remove();
  });
});
