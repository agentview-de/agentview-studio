// Tests for the API client's pure decision logic, extracted from api.js so it
// runs without a DOM/network: which auth header a credential maps to, and how a
// request path resolves (same-origin proxy vs. absolute baseUrl). These two
// choices are easy to get subtly wrong (a JWT under X-API-Key 401s; a wrong
// proxy decision breaks every call), so they're worth pinning.

import { test, expect, describe } from './runner.js';
import { authHeader, resolveUrl, storeQuery, nextStoreOffset } from '../admin/api-url.js';

describe('api-url · authHeader', () => {
  test('no credential → no auth header', () => {
    expect(authHeader('')).toEqual({});
    expect(authHeader(null)).toEqual({});
    expect(authHeader(undefined)).toEqual({});
  });
  test('an avk_ API key goes via X-API-Key only', () => {
    expect(authHeader('avk_abc123')).toEqual({ 'X-API-Key': 'avk_abc123' });
  });
  test('a session JWT goes via Authorization: Bearer only', () => {
    expect(authHeader('eyJhbGciOi.jwt.token')).toEqual({ Authorization: 'Bearer eyJhbGciOi.jwt.token' });
  });
  test('only one scheme is ever emitted (never both)', () => {
    const keys = Object.keys(authHeader('avk_x'));
    expect(keys).toHaveLength(1);
    const keys2 = Object.keys(authHeader('jwtish'));
    expect(keys2).toHaveLength(1);
  });
});

describe('api-url · resolveUrl', () => {
  test('absolute http(s) URLs pass through untouched', () => {
    expect(resolveUrl('https://x.example/api/y', { host: 'studio.local', baseUrl: 'https://agentview.de' }))
      .toBe('https://x.example/api/y');
  });
  test('running behind the local proxy (any host ≠ agentview.de) keeps the path relative', () => {
    expect(resolveUrl('/api/displays', { host: 'localhost:8138', baseUrl: 'https://agentview.de' }))
      .toBe('/api/displays');
  });
  test('served directly from agentview.de → prefix the baseUrl', () => {
    expect(resolveUrl('/api/displays', { host: 'agentview.de', baseUrl: 'https://agentview.de' }))
      .toBe('https://agentview.de/api/displays');
  });
  test('no host (non-browser/edge) → prefix the baseUrl', () => {
    expect(resolveUrl('/api/x', { host: '', baseUrl: 'https://agentview.de' }))
      .toBe('https://agentview.de/api/x');
  });
});

describe('api-url · storeQuery', () => {
  test('the free-text filter goes out as `search` (a `q` is ignored server-side)', () => {
    expect(storeQuery({ search: 'hotel' })).toBe('search=hotel');
  });
  test('empty/absent values are dropped, never sent as empty params', () => {
    expect(storeQuery({ search: '', category: '', language: '', offset: 0 })).toBe('');
    expect(storeQuery()).toBe('');
  });
  test('category, language, limit and offset are carried through', () => {
    const qs = new URLSearchParams(storeQuery({
      search: 'menu', category: 'gastronomy', language: 'en', limit: 100, offset: 100,
    }));
    expect(qs.get('search')).toBe('menu');
    expect(qs.get('category')).toBe('gastronomy');
    expect(qs.get('language')).toBe('en');
    expect(qs.get('limit')).toBe('100');
    expect(qs.get('offset')).toBe('100');
  });
  test('limit 0 is still sent (explicit), offset 0 is not (it is the default)', () => {
    expect(storeQuery({ limit: 0 })).toBe('limit=0');
    expect(storeQuery({ offset: 0 })).toBe('');
  });
});

describe('api-url · nextStoreOffset', () => {
  test('a full page with more to come → advance by the page size', () => {
    expect(nextStoreOffset({ offset: 0, limit: 100, returned: 100, total: 250 })).toBe(100);
    expect(nextStoreOffset({ offset: 100, limit: 100, returned: 100, total: 250 })).toBe(200);
  });
  test('a short page means the catalog is exhausted', () => {
    expect(nextStoreOffset({ offset: 0, limit: 100, returned: 63, total: 63 })).toBe(null);
  });
  test('an empty page stops the walk even without a total', () => {
    expect(nextStoreOffset({ offset: 200, limit: 100, returned: 0 })).toBe(null);
  });
  test('reaching the reported total stops the walk', () => {
    expect(nextStoreOffset({ offset: 100, limit: 100, returned: 100, total: 200 })).toBe(null);
  });
  test('no total → keep walking while pages come back full', () => {
    expect(nextStoreOffset({ offset: 0, limit: 50, returned: 50 })).toBe(50);
  });
  test('called with nothing → null, never NaN', () => {
    expect(nextStoreOffset()).toBe(null);
  });
});

// The short-page rule and the total, in the order that matters.
//
// nextStoreOffset used to stop at any page shorter than the requested limit,
// before it looked at `total`. That is right when there is no total to go by —
// and wrong the moment a server caps `limit` below what was asked: the assets
// endpoint pages at its own maximum, so a caller asking for 200 gets 100 back
// on EVERY page. Read as "exhausted", that leaves the caller with page one and
// nothing to say so.
describe('api-url · nextStoreOffset · a capped page size is not the end', () => {
  test('REGRESSION: short page, but the total says there is more → keep walking', () => {
    // Asked for 200, the server capped at 100, and there are 470.
    expect(nextStoreOffset({ offset: 0, limit: 200, returned: 100, total: 470 })).toBe(100);
    expect(nextStoreOffset({ offset: 100, limit: 200, returned: 100, total: 470 })).toBe(200);
    expect(nextStoreOffset({ offset: 400, limit: 200, returned: 70, total: 470 })).toBe(null);
  });

  test('the total still ends the walk exactly, not one page late', () => {
    expect(nextStoreOffset({ offset: 400, limit: 100, returned: 70, total: 470 })).toBe(null);
    expect(nextStoreOffset({ offset: 0, limit: 100, returned: 63, total: 63 })).toBe(null);
  });

  test('without a total the short page is still the signal', () => {
    expect(nextStoreOffset({ offset: 0, limit: 200, returned: 100 })).toBe(null);
    expect(nextStoreOffset({ offset: 0, limit: 200, returned: 200 })).toBe(200);
  });

  test('an empty page ends it whatever the total claims', () => {
    // A total that outruns the data must not turn into an endless walk.
    expect(nextStoreOffset({ offset: 300, limit: 100, returned: 0, total: 999 })).toBe(null);
  });
});
