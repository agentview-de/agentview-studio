// The Verwaltung console, all nine tabs, as a screen reader meets them.
//
// These views are the least-walked part of the app — they need a connected
// account, so nothing in this suite had ever rendered one. Stubbing fetch and
// filling state.fleet is enough to open every tab, and the first walk through
// them found eight form controls with no accessible name at all: the five
// audit filters (a placeholder disappears the moment you type, and a date
// input never shows one), and three fields in Connectivity and Licenses whose
// <label> was right there on screen but never bound with for=.
//
// ONE mount for every assertion below. mountAdmin() subscribes to the store and
// has no teardown, so a second mount leaves the first one listening: the next
// connection change drives both, and their requests outlive whatever fetch stub
// a test still holds. (The displays dashboard taught this the hard way — see
// the note at the end of fleet-membership.test.js.)
//
// The main assertion is deliberately a RULE, not a list: any new control in any
// of these tabs has to be named, or this fails.
//
// Browser-only: it mounts the real console into a real document.

import { test, expect, describe } from './runner.js';
import { state } from '../admin/store.js';
import { mountAdmin } from '../admin/views/admin.js';

// One instant, in the shape the API sends it. Nothing rendered from it may
// still look like this by the time it reaches a person.
const STAMP = '2026-08-29T05:20:11.123Z';
const ISO_ON_SCREEN = /\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}|(?!\d))/;

const unnamed = (root) => [...root.querySelectorAll('input, select, textarea')]
  .filter(el => !el.getAttribute('aria-label') && !el.labels?.length && !el.title && !el.closest('label'))
  .map(el => el.id || el.type);

describe('Verwaltung · nine tabs, every control named', () => {
  test('REGRESSION: each tab renders, and nothing in it is left without a name', async () => {
    const saved = {
      status: state.connection.status, user: state.connection.user,
      orgs: state.fleet.orgs, activeOrgId: state.fleet.activeOrgId,
      displays: state.fleet.displays, tab: state.ui.adminTab,
    };
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-3000px;top:0;width:900px;height:600px;overflow:hidden;';
    document.body.appendChild(host);
    const realFetch = window.fetch;
    const realWarn = console.warn;
    const realError = console.error;
    // Every tab fetches on activation. One canned envelope answers all of
    // them: the shell unwraps whichever list key it wants and renders its
    // rows. Every row carries a WIRE TIMESTAMP, because the second rule this
    // walk enforces is about what happens to those.
    window.fetch = async () => new Response(JSON.stringify({
      approvals: [{ id: 'a1', displayName: 'Schaufenster', requestedAt: STAMP }],
      entries: [{ id: 'e1', timestamp: STAMP, actorUserId: 'u1', action: 'publish', metadata: '{}' }],
      webhooks: [{ id: 'w1', url: 'https://example.org/hook', eventPattern: '*', isActive: true, secretPrefix: 'whs', createdAt: STAMP, lastTriggeredAt: STAMP }],
      apiKeys: [{ id: 'k1', name: 'CI', keyPrefix: 'avs', createdAt: STAMP }],
      members: [{ userId: 'm1', email: 'a@example.org', role: 'admin', joinedAt: STAMP }],
      licenses: [{ id: 'l1', tier: 'pro', validUntil: STAMP }],
      versions: [{ at: STAMP, by: 'a@example.org', deployedTo: [], name: 'P', snapshot: { slides: [] } }],
      organizations: [{ orgId: 'o1', name: 'Testorg' }],
      total: 1,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    console.warn = () => {};
    console.error = () => {};

    const empty = [];
    const nameless = {};
    const rawDates = {};
    try {
      state.connection.status = 'connected';
      state.connection.user = { email: 'test@example.com' };
      state.fleet.orgs = [{ orgId: 'o1', name: 'Testorg' }];
      state.fleet.activeOrgId = 'o1';
      state.fleet.displays = [{ id: 'd1', name: 'Schaufenster', status: 'online', online: true, categoryIds: [] }];
      mountAdmin(host);
      await new Promise(r => setTimeout(r, 250));

      const tabs = [...host.querySelectorAll('.avs-admin-tab')];
      expect(tabs).toHaveLength(9);

      for (const t of tabs) {
        t.click();
        await new Promise(r => setTimeout(r, 220));
        const body = host.querySelector('#avs-admin-body');
        if ((body?.innerText ?? '').trim().length < 3) empty.push(t.dataset.tab);
        const found = unnamed(body);
        if (found.length) nameless[t.dataset.tab] = found;

        // RULE, not a list: no tab may print a wire timestamp. Four of them
        // did — the raw ISO string, or a slice of one — while two others
        // formatted it for the Studio's language. Any new column that forgets
        // fails here.
        const shown = (body?.innerText ?? '');
        const hit = shown.match(ISO_ON_SCREEN);
        if (hit) rawDates[t.dataset.tab] = hit[0];

        // Two tabs get a closer look while they are open, because their fix
        // was a different one: the audit filters gained a name of their own,
        // the connectivity fields were bound to labels that already existed.
        if (t.dataset.tab === 'audit') {
          for (const id of ['f-display', 'f-user', 'f-action', 'f-from', 'f-to']) {
            const el = host.querySelector('#' + id);
            expect(el === null).toBeFalsy();
            expect((el.getAttribute('aria-label') ?? '').length > 0).toBeTruthy();
          }
        }
        if (t.dataset.tab === 'connectivity') {
          for (const id of ['conn-mode', 'conn-wl']) {
            const el = host.querySelector('#' + id);
            expect(el === null).toBeFalsy();
            expect(el.labels.length > 0).toBeTruthy();
          }
        }
      }
      // Let the last tab's own request finish inside the stub rather than
      // escaping to the test server once it is gone.
      await new Promise(r => setTimeout(r, 300));
    } finally {
      host.remove();
      window.fetch = realFetch;
      console.warn = realWarn;
      console.error = realError;
      state.connection.status = saved.status;
      state.connection.user = saved.user;
      state.fleet.orgs = saved.orgs;
      state.fleet.activeOrgId = saved.activeOrgId;
      state.fleet.displays = saved.displays;
      state.ui.adminTab = saved.tab;
    }

    expect(empty).toEqual([]);
    expect(nameless).toEqual({});
    expect(rawDates).toEqual({});
  });
});
