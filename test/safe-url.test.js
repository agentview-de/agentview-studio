// Tests for the safe-url helper. CSS `url('…')` can be escaped out of even
// after HTML-entity escaping, so anywhere user-controlled URLs hit a `style="
// background-image: url(…)"` attribute we use cssUrl() instead of raw concat.

import { test, expect, describe } from './runner.js';
import { isSafeImgUrl, cssUrl } from '../shared/safe-url.js';

describe('isSafeImgUrl', () => {
  test('accepts http and https', () => {
    expect(isSafeImgUrl('http://example.com/x.png')).toBeTruthy();
    expect(isSafeImgUrl('https://example.com/x.png')).toBeTruthy();
    expect(isSafeImgUrl('HTTPS://EXAMPLE.COM/X.PNG')).toBeTruthy();
  });

  test('accepts data:image/ payloads but rejects other data: types', () => {
    expect(isSafeImgUrl('data:image/png;base64,AAA')).toBeTruthy();
    expect(isSafeImgUrl('data:image/svg+xml;utf8,<svg/>')).toBeTruthy();
    expect(isSafeImgUrl('data:text/html,<script>alert(1)</script>')).toBeFalsy();
    expect(isSafeImgUrl('data:application/javascript,alert(1)')).toBeFalsy();
  });

  test('accepts relative paths', () => {
    expect(isSafeImgUrl('/assets/x.png')).toBeTruthy();
    expect(isSafeImgUrl('./x.png')).toBeTruthy();
    expect(isSafeImgUrl('../x.png')).toBeTruthy();
    expect(isSafeImgUrl('foo.png')).toBeTruthy();          // no scheme → relative
    expect(isSafeImgUrl('subdir/foo.png')).toBeTruthy();
  });

  test('rejects empty and nullish input', () => {
    expect(isSafeImgUrl('')).toBeFalsy();
    expect(isSafeImgUrl(null)).toBeFalsy();
    expect(isSafeImgUrl(undefined)).toBeFalsy();
    expect(isSafeImgUrl('   ')).toBeFalsy();
  });

  test('rejects script-bearing schemes (the whole point of this helper)', () => {
    expect(isSafeImgUrl('javascript:alert(1)')).toBeFalsy();
    expect(isSafeImgUrl('JaVaScRiPt:alert(1)')).toBeFalsy();
    expect(isSafeImgUrl('vbscript:msgbox(1)')).toBeFalsy();
    expect(isSafeImgUrl('file:///etc/passwd')).toBeFalsy();
    expect(isSafeImgUrl('blob:http://x/abc')).toBeFalsy();
    expect(isSafeImgUrl('ftp://example.com/x.png')).toBeFalsy();
  });

  test('rejects protocol-relative URLs (they load from an arbitrary host)', () => {
    expect(isSafeImgUrl('//evil.com/x.png')).toBeFalsy();
    expect(isSafeImgUrl('//evil.com/track.gif')).toBeFalsy();
    expect(isSafeImgUrl('  //evil.com/x.png')).toBeFalsy(); // leading whitespace trimmed first
  });
});

describe('cssUrl', () => {
  test('returns empty string for unsafe URLs (graceful CSS degradation)', () => {
    expect(cssUrl('')).toBe('');
    expect(cssUrl('javascript:alert(1)')).toBe('');
    expect(cssUrl(null)).toBe('');
    expect(cssUrl('file:///etc/passwd')).toBe('');
  });

  test('wraps safe URLs in double-quoted url() expression', () => {
    const out = cssUrl('https://example.com/x.png');
    expect(out).toMatch(/^url\("https:\/\/example\.com\/x\.png"\)$/);
  });

  test('escapes embedded double quotes that could break out of the url() string', () => {
    const out = cssUrl('https://example.com/x".png');
    // " must be encoded so it can't terminate the surrounding quote.
    expect(out).notToContain('".png"');
    expect(out).toContain('%22');
  });

  test('escapes parens that could close the url() function call early', () => {
    const out = cssUrl('https://example.com/x).png');
    expect(out).notToContain(').png');
    expect(out).toContain('%29');
  });

  test('CSS-injection attempt: closing url() and starting a new rule', () => {
    const evil = 'https://x.png");background:url("javascript:alert(1)")';
    const out = cssUrl(evil);
    // The escaped output must not contain an unescaped `)` after the URL
    // that would allow a second CSS declaration to take effect.
    const inside = out.slice(5, -2); // strip url(" and ")
    expect(inside).notToContain(')');
    expect(inside).notToContain('"');
  });

  test('passes data:image/ URLs through (they are whitelisted)', () => {
    const data = 'data:image/png;base64,iVBORw0KGgoAAAA';
    const out = cssUrl(data);
    expect(out).toContain('data:image/png');
  });

  test('encodes spaces and high-bit chars via encodeURI', () => {
    const out = cssUrl('https://example.com/my photo.png');
    expect(out).toContain('%20');
  });
});
