// Tests for the API client's pure decision logic, extracted from api.js so it
// runs without a DOM/network: which auth header a credential maps to, and how a
// request path resolves (same-origin proxy vs. absolute baseUrl). These two
// choices are easy to get subtly wrong (a JWT under X-API-Key 401s; a wrong
// proxy decision breaks every call), so they're worth pinning.

import { test, expect, describe } from './runner.js';
import { authHeader, resolveUrl } from '../admin/api-url.js';

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
