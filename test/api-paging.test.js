// Walking a paged list endpoint to the end.
//
// Three list endpoints in this API page and report a `total`, and every one of
// them has already truncated something in this app: the Library stopped at the
// first page of store templates, the asset grid at the first page of assets,
// and the slot list — which "Aus agentView öffnen" and the binding inspector
// both read — at the server's default fifty. The symptom is always the same and
// always quiet: a screen full of results that looks complete.
//
// nextStoreOffset() owns the arithmetic and is tested next door
// (api-url.test.js). What is asserted here is the WALK: that listAll() keeps
// asking until the server says there is nothing more, and — the case that broke
// the Library — that a page shorter than the requested limit is not read as the
// end when the envelope reported a bigger total. Endpoints cap `limit` at their
// own maximum, so asking for 200 where the cap is 100 comes back short on every
// single page.
//
// Browser-only, for one reason: api.js resolves its base URL through
// `location` (same-origin in the app, the dev proxy locally), so the module
// cannot even build a request under node. fetch is stubbed; nothing else here
// needs a document.

import { test, expect, describe } from './runner.js';
import { assets, slots } from '../admin/api.js';

// A server holding `count` rows, answering under `key`, capping page size at
// `cap`, and optionally refusing to report a total at all.
function serve({ count, key, cap = 100, reportTotal = true }) {
  const asked = [];
  const rows = Array.from({ length: count }, (_, i) => ({ slug: `s${i}`, id: `s${i}` }));
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const q = new URL(String(url), 'http://x').searchParams;
    const limit = Math.min(Number(q.get('limit')) || 50, cap);
    const offset = Number(q.get('offset')) || 0;
    asked.push({ limit, offset });
    const page = rows.slice(offset, offset + limit);
    const body = { [key]: page, ...(reportTotal ? { total: count } : {}) };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { asked, restore: () => { globalThis.fetch = real; } };
}

describe('api · a paged list is walked to the end', () => {
  test('REGRESSION: a cap below the requested limit does not look like the last page', async () => {
    // 214 slots, server cap 100, listAll asks for 200: EVERY page comes back
    // short. Reading a short page as "done" is exactly how the first fix here
    // was gotten wrong.
    const srv = serve({ count: 214, key: 'slots', cap: 100 });
    try {
      const r = await slots.listAll();
      expect(r.slots).toHaveLength(214);
      expect(r.total).toBe(214);
      expect(srv.asked.map(a => a.offset)).toEqual([0, 100, 200]);
      // …and it asked for the maximum each time rather than crawling.
      expect(srv.asked.every(a => a.limit === 100)).toBeTruthy();
    } finally { srv.restore(); }
  });

  test('the assets list is walked the same way', async () => {
    const srv = serve({ count: 450, key: 'assets', cap: 200 });
    try {
      const r = await assets.listAll();
      expect(r.assets).toHaveLength(450);
      expect(srv.asked.map(a => a.offset)).toEqual([0, 200, 400]);
    } finally { srv.restore(); }
  });

  test('an endpoint that reports no total stops on the first short page', async () => {
    const srv = serve({ count: 130, key: 'slots', cap: 200, reportTotal: false });
    try {
      const r = await slots.listAll();
      expect(r.slots).toHaveLength(130);
      expect(r.total).toBe(130);          // counted, since nobody said otherwise
      expect(srv.asked).toHaveLength(1);  // 130 < 200 → that was everything
    } finally { srv.restore(); }
  });

  test('one page that holds everything is one request', async () => {
    const srv = serve({ count: 7, key: 'slots', cap: 200 });
    try {
      const r = await slots.listAll();
      expect(r.slots).toHaveLength(7);
      expect(srv.asked).toHaveLength(1);
    } finally { srv.restore(); }
  });

  test('an empty account is not an infinite loop', async () => {
    const srv = serve({ count: 0, key: 'slots' });
    try {
      const r = await slots.listAll();
      expect(r.slots).toEqual([]);
      expect(r.total).toBe(0);
      expect(srv.asked).toHaveLength(1);
    } finally { srv.restore(); }
  });

  test('a server that never stops is still bounded', async () => {
    // A `total` that never gets reached (a miscounting server, a moving target)
    // must not spin forever inside a modal that is waiting for the list.
    const real = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ slots: [{ slug: 'x' }], total: 1e9 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };
    try {
      const r = await slots.listAll();
      expect(calls).toBe(25);
      expect(r.slots).toHaveLength(25);
    } finally { globalThis.fetch = real; }
  });

  test('filters travel with every page, not just the first', async () => {
    const real = globalThis.fetch;
    const seen = [];
    globalThis.fetch = async (url) => {
      const q = new URL(String(url), 'http://x').searchParams;
      seen.push(q.get('search'));
      const offset = Number(q.get('offset')) || 0;
      return new Response(JSON.stringify({ slots: offset ? [] : [{ slug: 'a' }], total: 300 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };
    try {
      await slots.listAll({ search: 'avs-' });
      expect(seen).toEqual(['avs-', 'avs-']);
    } finally { globalThis.fetch = real; }
  });
});
