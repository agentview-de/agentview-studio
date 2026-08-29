// Which widgets reach the network — and does the editor's privacy gate agree?
//
// The gate exists so that building a slide never sends the device's IP to a
// third party unasked. It read one boolean on the plugin, and a boolean is the
// wrong shape for the question. It was wrong in both directions at once:
//
//   TOO LOOSE — five widgets fetched and never said so. `calendar` calls
//   fetch(icsUrl) against a user-supplied calendar server; `markdown` POLLS a
//   remote sourceUrl; and `menu`, `quote` and `qr-code` each load a remote
//   <img> — a dish photo, a portrait, a logo — which hands that host the IP,
//   the user agent and the referrer just the same.
//
//   TOO TIGHT — a chart with INLINE data reaches nobody, and was gated anyway.
//   You could not see your own numbers while editing without granting a "live
//   preview" that was never live.

import { test, expect, describe } from './runner.js';
import { isRemoteUrl, anyRemote, usesNetwork, remoteJsonNetwork, dataModeNetwork } from '../shared/plugin-network.js';

describe('plugin-network · what counts as leaving the machine', () => {
  test('an absolute http(s) or protocol-relative URL does', () => {
    expect(isRemoteUrl('https://example.org/a.ics')).toBe(true);
    expect(isRemoteUrl('http://example.org/a.ics')).toBe(true);
    expect(isRemoteUrl('//cdn.example.org/a.png')).toBe(true);
    expect(isRemoteUrl('  https://example.org/x  ')).toBe(true);
  });

  test('a data: URI, a relative path and an empty field do not', () => {
    expect(isRemoteUrl('data:image/png;base64,AA')).toBe(false);
    expect(isRemoteUrl('logo.png')).toBe(false);
    expect(isRemoteUrl('/assets/logo.png')).toBe(false);
    expect(isRemoteUrl('')).toBe(false);
    expect(isRemoteUrl(null)).toBe(false);
    expect(isRemoteUrl(undefined)).toBe(false);
  });

  test('anyRemote looks inside lists, because a menu has rows', () => {
    expect(anyRemote(['a.png', 'https://x/b.png'])).toBe(true);
    expect(anyRemote(['a.png', 'b.png'])).toBe(false);
    expect(anyRemote('', null, ['', null])).toBe(false);
    expect(anyRemote([], undefined)).toBe(false);
  });
});

describe('plugin-network · asking the plugin about THIS content', () => {
  test('a boolean still means exactly what it always did', () => {
    expect(usesNetwork({ network: true }, {})).toBe(true);
    expect(usesNetwork({ network: false }, {})).toBe(false);
    expect(usesNetwork({}, {})).toBe(false);
    expect(usesNetwork(null, {})).toBe(false);
  });

  test('a predicate is asked, not merely tested for truthiness', () => {
    // The trap this replaced: `plugin.network &&` on a FUNCTION is always true.
    const p = { network: c => c.url === 'remote' };
    expect(usesNetwork(p, { url: 'remote' })).toBe(true);
    expect(usesNetwork(p, { url: 'inline' })).toBe(false);
  });

  test('REGRESSION: a predicate that throws answers YES, not no', () => {
    // For a privacy gate the safe failure is "ask first". A thrown error must
    // never be read as "this widget contacts nobody".
    expect(usesNetwork({ network: () => { throw new Error('boom'); } }, {})).toBe(true);
  });

  test('missing content is not a crash', () => {
    expect(usesNetwork({ network: c => !!c.url }, undefined)).toBe(false);
    expect(usesNetwork({ network: c => !!c.url }, null)).toBe(false);
  });

  test('the two shared shapes answer for the families that use them', () => {
    expect(remoteJsonNetwork({ source: 'inline', data: [] })).toBe(false);
    expect(remoteJsonNetwork({ source: 'url', dataUrl: 'https://x/d.json' })).toBe(true);
    // Provided-offline reads a slot the Studio filled earlier — no live call.
    expect(remoteJsonNetwork({ source: 'stored', dataUrl: 'https://x/d.json' })).toBe(false);
    // A URL mode with nothing entered yet cannot call anyone.
    expect(remoteJsonNetwork({ source: 'url', dataUrl: '' })).toBe(false);

    expect(dataModeNetwork({ dataMode: 'live' })).toBe(true);
    expect(dataModeNetwork({ dataMode: 'stored' })).toBe(false);
    expect(dataModeNetwork({})).toBe(true);   // live is the default
  });
});
