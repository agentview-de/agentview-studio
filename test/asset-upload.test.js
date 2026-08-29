// Dropping files into the media library.
//
// Three things were wrong with the same short path, and all three are the kind
// that only show up with more than one file and a filter on screen:
//
//   THE FILTER VANISHED.  `refresh()` defaulted to an EMPTY filter, and the
//   upload path called it with no argument. Search for "logo", drop a file in,
//   and the search was silently gone and the grid back to everything. Deleting
//   got this right — `refresh(state.library.filter)` — in the same file.
//
//   ONE LIST CALL PER FILE.  `uploadAndGetUrl` re-listed the whole library
//   after every upload, so thirty images cost thirty-one list calls racing each
//   other, and re-rendered the grid mid-upload.
//
//   NOTHING SAID ANYTHING.  Thirty images over a slow link, and the panel sat
//   there looking idle until the very end.
//
// Browser-only, and it goes in through the drop zone rather than calling the
// upload function directly: that is the path a person uses, and it is where
// the per-file refresh actually hurt. fetch is stubbed — nothing leaves here.

import { test, expect, describe } from './runner.js';
import { state } from '../admin/store.js';
import { renderPanel } from '../admin/ui/asset-library.js';

const settle = (ms = 60) => new Promise(r => setTimeout(r, ms));
const json = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'content-type': 'application/json' },
});

/**
 * Mount the panel with fetch stubbed, drop `n` files on it, and report what
 * the network saw.
 */
async function dropFiles(n, filter) {
  const realFetch = window.fetch;
  const before = state.library.filter;
  let lists = 0, uploads = 0;
  window.fetch = (url, opts) => {
    if ((opts?.method || 'GET').toUpperCase() === 'POST') {
      uploads++;
      const n = uploads;
      // A real upload takes time, and the progress line only exists for that
      // time. An instant stub leaves nothing to observe and would make the
      // "says how far it has got" test pass or fail on scheduling luck.
      return new Promise(r => setTimeout(() => r(json({ assets: [{ url: `https://example.org/${n}.png` }] })), 40));
    }
    lists++;
    return Promise.resolve(json({ assets: [], total: 0 }));
  };
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-4000px;top:0;width:520px;';
  document.body.appendChild(host);
  try {
    state.library.filter = { ...filter };
    renderPanel(host);
    await settle(80);
    lists = 0; uploads = 0;               // count only the drop
    const dt = new DataTransfer();
    for (let i = 0; i < n; i++) dt.items.add(new File([new Uint8Array(8)], `f${i}.png`, { type: 'image/png' }));
    const zone = host.querySelector('.bb-lib-dropzone') ?? host;
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    // Catch it mid-flight, then wait for the batch to FINISH rather than for a
    // number of milliseconds I guessed: a sleep long enough to be safe is long
    // enough to push the shared suite page past its own budget, and that page
    // fails by producing no results at all.
    await settle(30);
    const midway = {
      progress: host.querySelector('.bb-lib-progress')?.textContent ?? '',
      buttonShut: !!host.querySelector('[data-act="upload"]')?.disabled,
    };
    const until = performance.now() + 4000;
    while (host.querySelector('[data-act="upload"]')?.disabled) {
      if (performance.now() > until) throw new Error('the upload never finished');
      await settle(20);
    }
    await settle(40);
    return { lists, uploads, midway, host, filter: { ...state.library.filter } };
  } finally {
    window.fetch = realFetch;
    state.library.filter = before;
    host.remove();
  }
}

describe('asset upload · dropping a handful of files', () => {
  test('REGRESSION: the filter you were using survives the upload', async () => {
    const r = await dropFiles(3, { search: 'logo', type: 'image' });
    expect(r.uploads).toBe(3);
    expect(r.filter).toEqual({ search: 'logo', type: 'image' });
  });

  test('REGRESSION: the library is listed once for the batch, not once per file', async () => {
    const r = await dropFiles(6, { search: '', type: '' });
    expect(r.uploads).toBe(6);
    // One for the drop zone's own refresh, one for the batch. Seven would be
    // the old behaviour, and thirty-one for a realistic drop.
    expect(r.lists <= 2).toBeTruthy();
  });

  test('REGRESSION: it says how far it has got while it runs', async () => {
    const r = await dropFiles(6, { search: '', type: '' });
    expect(r.midway.progress.length > 0).toBeTruthy();
    // …and holds the button shut so a second drop cannot interleave.
    expect(r.midway.buttonShut).toBeTruthy();
  });

  test('and it stops saying it when the batch is done', async () => {
    const r = await dropFiles(2, { search: '', type: '' });
    expect(r.host.querySelector('.bb-lib-progress')?.textContent ?? '').toBe('');
    expect(!!r.host.querySelector('[data-act="upload"]')?.disabled).toBe(false);
  });
});
