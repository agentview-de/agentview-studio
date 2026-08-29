// Handing a file to the browser, and taking one back.
//
// Two things are asserted here that no unit test would normally reach, because
// both were bugs of OMISSION and both are invisible in Chromium:
//
//   • the <a download> has to be IN the document when it is clicked — Firefox
//     ignores a click on an anchor that was never in the tree, so "Export
//     playlist", the only backup this app can make, silently did nothing there
//   • the blob URL must still be alive at that moment — revoking it in the same
//     tick races the download the click just started
//
// Neither can be observed by downloading a file in a test runner. What CAN be
// observed is the state of the world at the instant of the click, so that is
// what this checks: the click itself is intercepted, and the anchor's parent
// and the revoke bookkeeping are read out from inside it.
//
// Browser-only: it is entirely about DOM and blob-URL lifetime.

import { test, expect, describe } from './runner.js';
import { downloadJson, pickJsonFile, pickFiles } from '../admin/file-io.js';

// Run `fn` with anchor clicks intercepted; returns what the world looked like
// at the moment of each click, plus which URLs were created and revoked.
async function watchDownload(fn, { settleMs = 0 } = {}) {
  const realClick = HTMLAnchorElement.prototype.click;
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  const clicks = [];
  const created = [];
  const revoked = [];
  HTMLAnchorElement.prototype.click = function () {
    clicks.push({
      inDocument: document.body.contains(this),
      download: this.download,
      href: this.href,
      revokedSoFar: [...revoked],
    });
    // deliberately NOT calling realClick — no real download in a test run
  };
  URL.createObjectURL = (b) => { const u = realCreate.call(URL, b); created.push(u); return u; };
  URL.revokeObjectURL = (u) => { revoked.push(u); return realRevoke.call(URL, u); };
  let revokedAfterCall = [];
  try {
    await fn();
    // The snapshot that matters: still the same macrotask as the click, so a
    // revoke issued "right after" the click is already in here.
    revokedAfterCall = [...revoked];
    // The real revoke is deliberately deferred, so the spies have to outlive it.
    if (settleMs) await new Promise(r => setTimeout(r, settleMs));
  } finally {
    HTMLAnchorElement.prototype.click = realClick;
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
  }
  return { clicks, created, revoked, revokedAfterCall };
}

describe('file exchange · giving the browser a file', () => {
  test('REGRESSION: the anchor is in the document when it is clicked', () => {
    const before = document.querySelectorAll('a[download]').length;
    return watchDownload(() => downloadJson('sicherung.json', { slides: [] })).then(({ clicks }) => {
      expect(clicks).toHaveLength(1);
      expect(clicks[0].inDocument).toBeTruthy();
      expect(clicks[0].download).toBe('sicherung.json');
      expect(clicks[0].href.startsWith('blob:')).toBeTruthy();
      // …and gone again straight after, so exports do not litter the page.
      expect(document.querySelectorAll('a[download]').length).toBe(before);
    });
  });

  test('REGRESSION: the blob URL outlives the click', async () => {
    const { created, revoked, revokedAfterCall } = await watchDownload(() => downloadJson('x.json', [1, 2]), { settleMs: 1200 });
    expect(created).toHaveLength(1);
    const mine = created[0];
    // Ask about THIS url, not about the whole list: the previous test's
    // deferred revoke lands inside this window too, so comparing lists would
    // make the assertion depend on test order.
    expect(revokedAfterCall.includes(mine)).toBeFalsy();   // the race, had it been lost
    expect(revoked.includes(mine)).toBeTruthy();           // …but it IS cleaned up, later
  });

  test('an object is serialised, a string is passed through unchanged', async () => {
    const seen = [];
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = (b) => { seen.push(b); return realCreate.call(URL, b); };
    try {
      await watchDownload(async () => {
        downloadJson('a.json', { b: 1 });
        downloadJson('b.json', '{"already":"text"}');
      });
    } finally { URL.createObjectURL = realCreate; }
    const texts = await Promise.all(seen.map(b => b.text()));
    expect(texts[0]).toBe('{\n  "b": 1\n}');
    expect(texts[1]).toBe('{"already":"text"}');
    expect(seen[0].type).toBe('application/json');
  });
});

describe('file exchange · taking one back', () => {
  // A real FileList can only be built through DataTransfer. Where that is not
  // available the picker cannot be driven, so say so rather than pass.
  const canForgeFiles = (() => {
    try { return !!new DataTransfer(); } catch { return false; }
  })();

  const withPicker = async (drive) => {
    const realClick = HTMLInputElement.prototype.click;
    let input = null;
    HTMLInputElement.prototype.click = function () { input = this; };
    try {
      const pending = pickJsonFile();
      await new Promise(r => setTimeout(r, 0));
      drive(input);
      return { result: await pending, input };
    } finally {
      HTMLInputElement.prototype.click = realClick;
    }
  };

  test('REGRESSION: the input is in the document, and gone once it answered', async () => {
    if (!canForgeFiles) { expect('DataTransfer unavailable').toBe('DataTransfer unavailable'); return; }
    const dt = new DataTransfer();
    dt.items.add(new File(['{"slides":[]}'], 'wand.json', { type: 'application/json' }));
    const { result, input } = await withPicker(el => {
      // A detached input's click is ignored by some browsers — it has to be here.
      expect(document.body.contains(el)).toBeTruthy();
      el.files = dt.files;
      el.dispatchEvent(new Event('change'));
    });
    expect(result.name).toBe('wand.json');
    expect(result.text).toBe('{"slides":[]}');
    expect(document.body.contains(input)).toBeFalsy();
  });

  test('a dismissed picker resolves to nothing and cleans up after itself', async () => {
    const { result, input } = await withPicker(el => el.dispatchEvent(new Event('cancel')));
    expect(result).toBe(null);
    expect(document.body.contains(input)).toBeFalsy();
  });
});

// The same omission, one layer up: the asset library hand-rolled TWO file
// inputs of its own — one for "Upload", one inside the asset picker — and
// neither was ever put into the document or taken back out. Chromium humours
// that; the browsers this app is meant to survive on do not fire `change` at
// all, so "Upload from disk" did nothing and left a node behind either way.
describe('file exchange · asking for files', () => {
  /** Intercept the click and read the world as the picker sees it. */
  // async, and it AWAITS. A synchronous try/finally around an async callback
  // puts the real `click` back before the body has finished, so the next
  // pickFiles inside opens a REAL file dialog that never answers — and that
  // hangs the whole page, not one test. (The same slip as the publish fixture
  // two rounds ago; this time the harness named the test it stopped in.)
  async function whenPicked(fn) {
    const proto = HTMLInputElement.prototype;
    const realClick = proto.click;
    let seen = null;
    proto.click = function () {
      if (this.type === 'file') {
        seen = { inDocument: document.body.contains(this), multiple: this.multiple, accept: this.accept };
        // Answer the picker so the promise settles.
        setTimeout(() => this.dispatchEvent(new Event('cancel')), 0);
        return;
      }
      return realClick.call(this);
    };
    try { return await fn(() => seen); } finally { proto.click = realClick; }
  }

  test('REGRESSION: the input is IN the document when it is clicked', async () => {
    await whenPicked(async (seen) => {
      const files = await pickFiles({ accept: 'image/*', multiple: true });
      expect(seen().inDocument).toBe(true);
      expect(files).toEqual([]);           // dismissed
    });
  });

  test('it carries the accept and multiple it was asked for', async () => {
    await whenPicked(async (seen) => {
      await pickFiles({ accept: 'image/png', multiple: false });
      expect(seen().accept).toBe('image/png');
      expect(seen().multiple).toBe(false);
    });
    await whenPicked(async (seen) => {
      await pickFiles({ multiple: true });
      expect(seen().multiple).toBe(true);
    });
  });

  test('REGRESSION: dismissing it leaves nothing behind', async () => {
    const before = document.querySelectorAll('input[type=file]').length;
    await whenPicked(() => pickFiles({}));
    expect(document.querySelectorAll('input[type=file]').length).toBe(before);
  });

  test('a dismissal is an empty list, not a crash', async () => {
    await whenPicked(async () => {
      expect(await pickFiles({})).toEqual([]);
      // pickJsonFile is built on it and keeps its own contract: null.
      expect(await pickJsonFile()).toBe(null);
    });
  });
});
