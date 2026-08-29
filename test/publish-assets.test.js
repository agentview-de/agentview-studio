// Publishing uploads the player's runtime binaries — vendor scripts, fonts, the
// PDF worker — to the agentView asset store, because the published page lives on
// a content host where the repo's relative paths 404. They are immutable, so the
// resolver keeps an index of what is already up there and reuses it.
//
// The index was built from `assets.list()` — one page. The comment above it
// promises "the immutable vendor files upload once per account"; that holds
// exactly until the account has more assets than fit on the server's first page.
// After that the resolver stops finding its own uploads and every publish
// re-uploads the same ten files. Nothing fails, nothing is logged: the store
// just grows, and one day the quota is gone for a reason nobody can see.
//
// Browser-only: it drives the real resolver, which needs fetch, File and
// crypto.subtle (http://localhost is a secure context).

import { test, expect, describe } from './runner.js';
import { makeAssetResolver } from '../admin/publish-flow.js';

// An asset store holding `count` rows, capping page size at `cap`, with one
// known file placed at `wantedAt`. Records every upload attempt.
function store({ count, cap, wantedName, wantedAt, wantedUrl }) {
  const rows = Array.from({ length: count }, (_, i) => ({
    name: `andere-${i}.bin`, url: `https://cdn.example/andere-${i}.bin`,
  }));
  rows[wantedAt] = { name: wantedName, url: wantedUrl };

  const uploads = [];
  const listed = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url ?? input);
    const method = (init.method ?? input?.method ?? 'GET').toUpperCase();
    if (url.includes('/api/v1/assets')) {
      if (method === 'POST') {
        uploads.push(url);
        return new Response(JSON.stringify({ assets: [{ url: 'https://cdn.example/neu.bin' }] }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      const q = new URL(url, 'http://x').searchParams;
      const limit = Math.min(Number(q.get('limit')) || 50, cap);
      const offset = Number(q.get('offset')) || 0;
      listed.push(offset);
      return new Response(JSON.stringify({ assets: rows.slice(offset, offset + limit), total: count }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    // The source file the resolver is asked about.
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'text/javascript' } });
  };
  return { uploads, listed, restore: () => { globalThis.fetch = real; } };
}

describe('publish · a runtime asset is uploaded once, not once per publish', () => {
  test('REGRESSION: an asset past the first page is still found', async () => {
    // 320 assets, server page cap 100: the vendor file sits on page three.
    const s = store({
      count: 320, cap: 100,
      wantedName: 'avs-marked.min.js', wantedAt: 250,
      wantedUrl: 'https://cdn.example/avs-marked.min.js',
    });
    try {
      const resolve = makeAssetResolver();
      const url = await resolve('https://studio.example/shared/vendor/marked.min.js');
      expect(url).toBe('https://cdn.example/avs-marked.min.js');
      expect(s.uploads).toEqual([]);          // nothing re-uploaded
      expect(s.listed).toEqual([0, 100, 200, 300]);
    } finally { s.restore(); }
  });

  test('a file that really is new is uploaded — once, however often it is asked for', async () => {
    const s = store({
      count: 10, cap: 100,
      wantedName: 'egal.bin', wantedAt: 0, wantedUrl: 'https://cdn.example/egal.bin',
    });
    try {
      const resolve = makeAssetResolver();
      const a = await resolve('https://studio.example/shared/vendor/neu.min.js');
      const b = await resolve('https://studio.example/shared/vendor/neu.min.js');
      expect(a).toBe('https://cdn.example/neu.bin');
      expect(b).toBe(a);
      expect(s.uploads).toHaveLength(1);      // the per-publish cache holds
      expect(s.listed).toEqual([0]);          // …and the index is built once
    } finally { s.restore(); }
  });

  test('the name it looks for is the one it would upload under', async () => {
    // Query strings and fragments are not part of the asset name, and the
    // 'avs-' prefix is what keeps runtime files apart from a user's own media.
    const s = store({
      count: 3, cap: 100,
      wantedName: 'avs-pdf.worker.js', wantedAt: 1,
      wantedUrl: 'https://cdn.example/avs-pdf.worker.js',
    });
    try {
      const resolve = makeAssetResolver();
      const url = await resolve('https://studio.example/shared/vendor/pdf.worker.js?v=3#x');
      expect(url).toBe('https://cdn.example/avs-pdf.worker.js');
      expect(s.uploads).toEqual([]);
    } finally { s.restore(); }
  });

  test('a source file that cannot be fetched fails loudly rather than publishing a broken bundle', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input?.url ?? input);
      if (url.includes('/api/v1/assets')) {
        return new Response(JSON.stringify({ assets: [], total: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('nope', { status: 404 });
    };
    try {
      const resolve = makeAssetResolver();
      let threw = null;
      try { await resolve('https://studio.example/shared/vendor/weg.js'); } catch (e) { threw = e; }
      expect(threw === null).toBeFalsy();
      expect(String(threw.message)).toContain('404');
    } finally { globalThis.fetch = real; }
  });
});
