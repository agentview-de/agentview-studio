// Clicking "centre horizontally" has to move the widget AND tell the number
// fields about it.
//
// The pure geometry is covered in canvas-geo.test.js. This is the wiring, and
// the wiring is where the first version of this feature was wrong: it applied
// the new rect and then re-read `widget.rect` to refresh the X/Y/W/H inputs —
// which handed back the value from BEFORE the write. The canvas moved, and the
// X field went on claiming the old number. Only clicking the real button in
// the real editor showed it, and — see the note on that test — this fixture
// still does not reproduce it.
//
// Browser-only, and driven entirely through the UI: the iframe has its own
// module instances, so reaching into its store would prove nothing about what
// a person actually gets. Everything here is read off the rendered frame and
// the inspector's own inputs.

import { test, expect, describe } from './runner.js';

const settle = () => new Promise(r => setTimeout(r, 90));

/** Wait for a selector inside the frame — the editor mounts asynchronously and
 *  a fixed delay is a race, not a wait. */
async function waitFor(doc, sel, ms = 4000) {
  const until = performance.now() + ms;
  for (;;) {
    const el = doc.querySelector(sel);
    if (el) return el;
    if (performance.now() > until) throw new Error(`timed out waiting for ${sel}`);
    await new Promise(r => setTimeout(r, 40));
  }
}

const editor = () => new Promise((resolve, reject) => {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:-5000px;top:0;width:1400px;height:900px;border:0';
  f.src = '../index.html';
  // A ripcord: without it a frame that never fires `load` hangs the test, and
  // a hung test produces no results for the WHOLE page rather than one red
  // line. That is what happened the first time this ran.
  const bail = setTimeout(() => reject(new Error('the editor iframe never loaded')), 15000);
  f.addEventListener('load', () => { clearTimeout(bail); resolve(f); });
  f.addEventListener('error', (e) => { clearTimeout(bail); reject(e); });
  document.body.appendChild(f);
});

// ONE editor for the whole block. Booting the full app four times blew the
// suite's own time budget, and nothing here needs a fresh one: every test
// starts by putting the widget back where it belongs.
let _frame = null;
// Exported so the collapse suite can share this frame: booting the whole app
// twice on one page costs more than the page's own budget allows.
export async function withEditor(fn) {
  return inEditor(({ doc }) => fn({ doc, settle }));
}

async function inEditor(fn) {
  const f = _frame ?? (_frame = await editor());
  {
    const d = f.contentDocument, w = f.contentWindow;
    if (!d.querySelector('.avs-widget-frame')) {
      // A first run, which is what a fresh browser profile always is: the
      // welcome gate is up, the Displays view is in front, and the starter
      // slide is empty. Walk it the way the screen tells a person to — the
      // canvas's own hint says "double-click empty space to add text".
      [...d.querySelectorAll('.bb-modal-overlay button')]
        .find(b => /explore|erkunden/i.test(b.textContent))?.click();
      await settle();
      d.querySelector('#avs-viewswitch button[data-view="editor"]')?.click();
      const stage = await waitFor(d, '.avs-stage');
      await settle();
      const b = stage.getBoundingClientRect();
      stage.dispatchEvent(new w.MouseEvent('dblclick', {
        bubbles: true, clientX: b.left + b.width * 0.4, clientY: b.top + b.height * 0.4,
      }));
    }
    // Select it and open the geometry fold.
    const frame = await waitFor(d, '.avs-widget-frame');
    frame.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    await waitFor(d, '[data-align]');
    d.querySelector('.avs-geo-section')?.classList.remove('bb-form-section-closed');

    const field = (k) => d.querySelector(`[data-geo="${k}"]`);
    const setGeo = async (k, v) => {
      const inp = field(k);
      inp.value = String(v);
      inp.dispatchEvent(new f.contentWindow.Event('input', { bubbles: true }));
      await settle();
    };
    // The rendered truth, not the store: percent off the frame's own style.
    const painted = () => {
      const st = d.querySelector('.avs-widget-frame').style;
      return { x: parseFloat(st.left), y: parseFloat(st.top), w: parseFloat(st.width), h: parseFloat(st.height) };
    };
    await fn({
      doc: d,
      field: (k) => field(k)?.value,
      setGeo,
      painted,
      click: async (edge) => { d.querySelector(`[data-align="${edge}"]`).click(); await settle(); },
    });
  }
}

/** Put the widget somewhere off-centre so every edge is a visible move. */
async function place(api) {
  await api.setGeo('w', 40);
  await api.setGeo('h', 30);
  await api.setGeo('x', 12);
  await api.setGeo('y', 7);
}

describe('align buttons · the inspector row', () => {
  test('all six are there, in order, and named', async () => {
    await inEditor(({ doc }) => {
      const btns = [...doc.querySelectorAll('[data-align]')];
      expect(btns).toHaveLength(6);
      expect(btns.map(b => b.dataset.align))
        .toEqual(['left', 'hcenter', 'right', 'top', 'vmiddle', 'bottom']);
      // Named, not merely drawn — the mini-slide picture carries no text.
      expect(btns.every(b => (b.getAttribute('aria-label') || '').length > 0)).toBeTruthy();
    });
  });

  test('a click moves the widget and leaves its size alone', async () => {
    await inEditor(async (api) => {
      await place(api);
      expect(api.painted()).toEqual({ x: 12, y: 7, w: 40, h: 30 });
      await api.click('hcenter');
      expect(api.painted()).toEqual({ x: 30, y: 7, w: 40, h: 30 });
      await api.click('bottom');
      expect(api.painted()).toEqual({ x: 30, y: 70, w: 40, h: 30 });
    });
  });

  // NOT a regression guard, and labelled honestly: reverting the fix does not
  // make this fail. The stale read only bites when the inspector's closed-over
  // `widget` is a stale proxy — which is what happened in the editor by hand,
  // and is not what this fixture builds. Reading back the object you just
  // wrote through is unreliable by construction either way; the fix stands on
  // that, not on this test.
  test('the number fields follow the click', async () => {
    await inEditor(async (api) => {
      await place(api);
      await api.click('hcenter');
      expect(api.field('x')).toBe('30');
      expect(api.field('y')).toBe('7');
      await api.click('bottom');
      expect(api.field('y')).toBe('70');
      expect(api.field('w')).toBe('40');
    });
  });

  test('every edge is reachable from the same starting point', async () => {
    await inEditor(async (api) => {
      await place(api);
      for (const [edge, want] of [
        ['left', { x: 0, y: 7 }], ['right', { x: 60, y: 7 }],
        ['top', { x: 60, y: 0 }], ['vmiddle', { x: 60, y: 35 }],
      ]) {
        await api.click(edge);
        const p = api.painted();
        expect({ x: p.x, y: p.y }).toEqual(want);
        expect(p.w).toBe(40);
      }
    });
  });
});

// Give the shared frame back once the block is done.
export function teardown() { _frame?.remove(); _frame = null; }
