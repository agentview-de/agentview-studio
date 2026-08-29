// A partial fleet has to look partial.
//
// Every other list endpoint in this API pages and reports `total`. The display
// list is called bare — so if it ever answers with a page instead of a whole
// fleet, the dashboard would show a prefix and say nothing. That is the
// quietest kind of wrong for the one screen an operator opens to check that
// everything is up: fifty green tiles look exactly like a healthy fleet of
// fifty, whether or not there are another hundred and sixty behind them.
//
// The fix does not invent `limit`/`offset` parameters that cannot be verified
// against the live API. It reads what the server reports and lets the header
// say it — which changes nothing at all while the endpoint answers unpaged.
//
// Browser-only: it mounts the real dashboard. On the same page as the
// Verwaltung console, because these views fetch on mount and have no teardown
// to await (see that file's header).

import { test, expect, describe } from './runner.js';
import { state } from '../admin/store.js';
import { mountDisplays, refreshFleet } from '../admin/views/displays.js';

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const fleetOf = (n) => Array.from({ length: n }, (_, i) => ({
  id: `d${i}`, name: `Display ${i}`, status: 'online', online: true, categoryIds: [],
}));

describe('displays dashboard · says when it only holds part of the fleet', () => {
  test('REGRESSION: a reported total larger than the list is announced', async () => {
    const saved = { status: state.connection.status, displays: state.fleet.displays, groups: state.fleet.groups };
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-3000px;top:0;width:900px;height:600px;overflow:hidden;';
    document.body.appendChild(host);
    const realFetch = window.fetch;
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};

    // One stub for the three calls a fleet refresh makes; `total` is the knob.
    let reportedTotal = null;
    window.fetch = async (url) => {
      const u = String(url);
      if (u.includes('display-categories')) return json({ categories: [] });
      if (u.includes('/content')) return json({});
      const displays = fleetOf(50);
      return json(reportedTotal == null ? { displays } : { displays, total: reportedTotal });
    };

    const notice = () => host.querySelector('.avs-disp-partial')?.textContent ?? null;
    try {
      state.connection.status = 'connected';
      mountDisplays(host);

      reportedTotal = 214;
      await refreshFleet();
      await new Promise(r => setTimeout(r, 120));
      const partial = notice();
      expect(partial === null).toBeFalsy();
      expect(partial).toContain('50');
      expect(partial).toContain('214');

      // The whole fleet fits: nothing to warn about.
      reportedTotal = 50;
      await refreshFleet();
      await new Promise(r => setTimeout(r, 120));
      expect(notice()).toBe(null);

      // And an endpoint that reports no total at all behaves as it always did.
      reportedTotal = null;
      await refreshFleet();
      await new Promise(r => setTimeout(r, 120));
      expect(notice()).toBe(null);

      // Let the coalesced refresh settle inside the stub.
      await new Promise(r => setTimeout(r, 300));
    } finally {
      host.remove();
      window.fetch = realFetch;
      console.warn = realWarn;
      console.error = realError;
      state.connection.status = saved.status;
      state.fleet.displays = saved.displays;
      state.fleet.groups = saved.groups;
      state.fleet.displaysTotal = null;
    }
  });
});
