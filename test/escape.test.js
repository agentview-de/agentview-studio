// Tests for the shared escape helper. Replaces ~10 identical copies of this
// helper that used to live inside individual plugins.

import { test, expect, describe } from './runner.js';
import { escapeHtml, escapeAttr } from '../shared/utils/escape.js';

describe('escapeHtml', () => {
  test('escapes the five HTML special characters', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  test('preserves benign characters unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
    expect(escapeHtml('Über-Café · €')).toBe('Über-Café · €');
    expect(escapeHtml('1+1=2')).toBe('1+1=2');
  });

  test('coerces null and undefined to empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  test('coerces numbers and booleans via String()', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(true)).toBe('true');
    expect(escapeHtml(0)).toBe('0');
  });

  test('blocks an injected <script> tag literal', () => {
    const xss = '<script>alert(1)</script>';
    const out = escapeHtml(xss);
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).notToContain('<script>');
  });

  test('blocks event-handler attribute injection', () => {
    const xss = `" onmouseover="alert('x')`;
    const out = escapeHtml(xss);
    expect(out).notToContain('"');
    expect(out).toContain('&quot;');
  });

  test('escapes each character only once (no double-encoding)', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    expect(escapeHtml('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  test('handles a long mixed-content string in linear time', () => {
    const s = '<<' + 'a'.repeat(10000) + '>>';
    const out = escapeHtml(s);
    expect(out.startsWith('&lt;&lt;')).toBeTruthy();
    expect(out.endsWith('&gt;&gt;')).toBeTruthy();
    expect(out).toHaveLength(s.length + 12); // each <,> becomes 4 chars (+3 each), 4 occurrences
  });

  test('escapes apostrophes (single quote) — needed for attribute contexts', () => {
    const s = "Joe's coffee";
    expect(escapeHtml(s)).toBe('Joe&#39;s coffee');
  });
});

describe('escapeAttr', () => {
  test('is a synonym for escapeHtml today (identical output)', () => {
    const samples = ['<a>', '"\'', '&&&', 'plain', null, undefined, 42];
    for (const v of samples) expect(escapeAttr(v)).toBe(escapeHtml(v));
  });

  // DOM-only — skipped under the node runner, exercised by the browser suite.
  // Everything above is a pure string transform and now runs on every `npm test`:
  // this helper became the single escape implementation for the whole app, so its
  // tests should not live only in a suite that has to be opened by hand.
  test('renders safely inside a double-quoted attribute', () => {
    if (typeof document === 'undefined') return;
    const user = `" onerror="alert(1)`;
    const attr = `<img alt="${escapeAttr(user)}">`;
    // The result should parse as a single img element with one alt attribute.
    const tmpl = document.createElement('template');
    tmpl.innerHTML = attr;
    const img = tmpl.content.firstElementChild;
    expect(img.tagName).toBe('IMG');
    expect(img.hasAttribute('onerror')).toBeFalsy();
    expect(img.getAttribute('alt')).toBe(user);
  });
});
