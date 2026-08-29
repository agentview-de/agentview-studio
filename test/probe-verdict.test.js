// The URL probe's verdict.
//
// The bug: the json branch returned before the shared status check, so a 404
// answering with {"error":"not found"} was reported green — "Valid JSON · 1
// top-level entries" — next to the field the customer had just filled in. Every
// other kind checked the status. The one people paste API URLs into did not.

import { test, expect, describe } from './runner.js';
import { corsVerdict, opaqueVerdict } from '../shared/probe-verdict.js';

describe('probe-verdict · the status comes first, for every kind', () => {
  test('REGRESSION: a 404 with a JSON body is a warning, not a green tick', () => {
    const v = corsVerdict({ kind: 'json', ok: false, status: 404, bodyText: '{"error":"not found"}' });
    expect(v.level).toBe('warn');
    expect(v.key).toBe('probe.httpStatus');
    expect(v.params.status).toBe(404);
  });
  test('REGRESSION: a 500 with a JSON body is a warning too', () => {
    expect(corsVerdict({ kind: 'json', ok: false, status: 500, bodyText: '{"detail":"boom"}' }).level).toBe('warn');
  });
  test('the other kinds keep refusing a bad status', () => {
    for (const kind of ['url', 'feed', 'embed', 'stream']) {
      const v = corsVerdict({ kind, ok: false, status: 403, bodyText: '' });
      expect(v.level).toBe('warn');
      expect(v.key).toBe('probe.httpStatus');
    }
  });
});

describe('probe-verdict · a good JSON source', () => {
  test('an object reports its top-level key count', () => {
    const v = corsVerdict({ kind: 'json', ok: true, status: 200, bodyText: '{"a":1,"b":2,"c":3}' });
    expect(v.level).toBe('ok');
    expect(v.key).toBe('probe.jsonOk');
    expect(v.params.n).toBe(3);
  });
  test('an array reports its length', () => {
    expect(corsVerdict({ kind: 'json', ok: true, status: 200, bodyText: '[1,2,3,4]' }).params.n).toBe(4);
  });
  test('a body that is not JSON says so', () => {
    const v = corsVerdict({ kind: 'json', ok: true, status: 200, bodyText: '<html>nope</html>' });
    expect(v.level).toBe('warn');
    expect(v.key).toBe('probe.notJson');
  });
  test('REGRESSION: literal null is valid JSON, not a parse failure', () => {
    // Object.keys(null) throws, so this used to be reported as "not valid JSON".
    const v = corsVerdict({ kind: 'json', ok: true, status: 200, bodyText: 'null' });
    expect(v.key).toBe('probe.jsonOk');
    expect(v.params.n).toBe(0);
  });
  test('a bare number or string is valid JSON with nothing in it', () => {
    expect(corsVerdict({ kind: 'json', ok: true, status: 200, bodyText: '42' }).params.n).toBe(0);
    expect(corsVerdict({ kind: 'json', ok: true, status: 200, bodyText: '"hi"' }).params.n).toBe(0);
  });
  test('an empty body is not JSON', () => {
    expect(corsVerdict({ kind: 'json', ok: true, status: 200, bodyText: '' }).key).toBe('probe.notJson');
  });
});

describe('probe-verdict · the other kinds when the status is fine', () => {
  test('a feed that could be read is ok', () => {
    expect(corsVerdict({ kind: 'feed', ok: true, status: 200 })).toEqual({ level: 'ok', key: 'probe.feedOk' });
  });
  test('a plain URL reports the status it answered with', () => {
    const v = corsVerdict({ kind: 'url', ok: true, status: 204 });
    expect(v.key).toBe('probe.reachable');
    expect(v.params.status).toBe(204);
  });
});

describe('probe-verdict · opaque responses', () => {
  test('each kind gets its own reading of "reachable but unreadable"', () => {
    expect(opaqueVerdict('feed')).toEqual({ level: 'error', key: 'probe.feedBlocked' });
    expect(opaqueVerdict('json')).toEqual({ level: 'warn', key: 'probe.corsBlocked' });
    expect(opaqueVerdict('embed')).toEqual({ level: 'warn', key: 'probe.embedMaybe' });
    expect(opaqueVerdict('stream')).toEqual({ level: 'warn', key: 'probe.streamMaybe' });
  });
  test('a plain URL is simply reachable', () => {
    expect(opaqueVerdict('url')).toEqual({ level: 'ok', key: 'probe.reachableNoCors' });
    expect(opaqueVerdict(undefined)).toEqual({ level: 'ok', key: 'probe.reachableNoCors' });
  });
});
