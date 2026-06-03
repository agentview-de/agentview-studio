// Tests for the rich-text sanitizer. Every input the WYSIWYG editor saves
// AND every body the renderer reads passes through sanitizeHtml — both sides
// sanitise so a hand-edited playlist JSON can't smuggle scripts past either
// layer. These tests are the regression net for that.

import { test, expect, describe } from './runner.js';
import { sanitizeHtml, plainToHtml, looksLikeHtml } from '../shared/sanitize-html.js';

// ---------- Hostile input (XSS / injection) ----------
describe('sanitizeHtml — XSS rejection', () => {
  test('strips <script> elements entirely (unwrap, drop tag, keep text)', () => {
    const out = sanitizeHtml('<script>alert(1)</script>');
    expect(out).notToContain('<script');
    // Inline JS becomes literal text after unwrap; what matters is no <script>.
    expect(out.toLowerCase()).notToContain('<script>');
  });

  test('strips inline event handlers (onclick, onerror, …)', () => {
    const out = sanitizeHtml('<b onclick="alert(1)">x</b>');
    expect(out).toContain('<b>x</b>');
    expect(out).notToContain('onclick');
  });

  test('drops <img> with javascript: src entirely', () => {
    const out = sanitizeHtml('<img src="javascript:alert(1)">');
    expect(out).notToContain('img');
    expect(out).notToContain('javascript');
  });

  test('drops <img> with vbscript:/file: schemes', () => {
    expect(sanitizeHtml('<img src="vbscript:msgbox(1)">')).notToContain('img');
    expect(sanitizeHtml('<img src="file:///etc/passwd">')).notToContain('img');
  });

  test('keeps <img> with http(s)/data:image/ src', () => {
    expect(sanitizeHtml('<img src="https://example.com/x.png">')).toContain('src="https://example.com/x.png"');
    expect(sanitizeHtml('<img src="data:image/png;base64,AAA">')).toContain('data:image/png');
    expect(sanitizeHtml('<img src="/local/x.png">')).toContain('src="/local/x.png"');
  });

  test('unwraps <a> with javascript: href (keeps text, drops link)', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click me</a>');
    expect(out).notToContain('<a');
    expect(out).toContain('click me');
  });

  test('keeps <a> with http(s)/mailto href and forces target/rel', () => {
    const out = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(sanitizeHtml('<a href="mailto:a@b.com">m</a>')).toContain('mailto:a@b.com');
  });

  test('strips <iframe>, <object>, <embed>, <link>, <meta>, <style>', () => {
    for (const tag of ['iframe', 'object', 'embed', 'link', 'meta', 'style']) {
      const out = sanitizeHtml(`<${tag} src="x">payload</${tag}>`);
      expect(out).notToContain('<' + tag);
    }
  });

  test('strips HTML comments (could carry IE conditional payloads)', () => {
    const out = sanitizeHtml('<!-- evil --><b>ok</b>');
    expect(out).notToContain('<!--');
    expect(out).toContain('<b>ok</b>');
  });

  test('strips class/id/data-* attributes (no CSS-class XSS surface)', () => {
    const out = sanitizeHtml('<b class="x" id="y" data-foo="z">t</b>');
    expect(out).toBe('<b>t</b>');
  });

  test('strips style props not on the whitelist (e.g. position, expression)', () => {
    const out = sanitizeHtml('<b style="position:absolute; color:red;">t</b>');
    expect(out).toContain('color:');
    expect(out).notToContain('position');
  });

  test('mangled tag names (svg, math, foreignObject) are unwrapped', () => {
    expect(sanitizeHtml('<svg><script>alert(1)</script></svg>')).notToContain('<svg');
    expect(sanitizeHtml('<math><script>alert(1)</script></math>')).notToContain('<math');
  });

  test('SVG with onload is fully stripped', () => {
    const out = sanitizeHtml('<svg onload="alert(1)"></svg>');
    expect(out).notToContain('svg');
    expect(out).notToContain('onload');
  });

  test('case-insensitive tag detection (<ScRiPt>)', () => {
    const out = sanitizeHtml('<ScRiPt>alert(1)</ScRiPt>');
    expect(out.toLowerCase()).notToContain('<script');
  });

  test('mixed-case event handlers (OnClick) are stripped', () => {
    const out = sanitizeHtml('<b OnClick="alert(1)">x</b>');
    expect(out.toLowerCase()).notToContain('onclick');
  });

  test('href is re-validated after attribute strip (no smuggled href)', () => {
    // The sanitiser unwraps anchors with unsafe href; this confirms the path.
    const out = sanitizeHtml(`<a href="https://ok.com" onclick="alert(1)">x</a>`);
    expect(out).toContain('href="https://ok.com"');
    expect(out).notToContain('onclick');
  });
});

// ---------- Tag whitelist (added in WYSIWYG expansion) ----------
describe('sanitizeHtml — allowed tags pass through', () => {
  const cases = [
    ['<b>x</b>', '<b>x</b>'],
    ['<strong>x</strong>', '<strong>x</strong>'],
    ['<i>x</i>', '<i>x</i>'],
    ['<em>x</em>', '<em>x</em>'],
    ['<u>x</u>', '<u>x</u>'],
    ['<s>x</s>', '<s>x</s>'],
    ['<sub>x</sub>', '<sub>x</sub>'],
    ['<sup>x</sup>', '<sup>x</sup>'],
    ['<code>x</code>', '<code>x</code>'],
    ['<pre>x</pre>', '<pre>x</pre>'],
    ['<h2>x</h2>', '<h2>x</h2>'],
    ['<h3>x</h3>', '<h3>x</h3>'],
    ['<blockquote>x</blockquote>', '<blockquote>x</blockquote>'],
    ['<hr>', '<hr>'],
    ['<ul><li>x</li></ul>', '<ul><li>x</li></ul>'],
    ['<ol><li>x</li></ol>', '<ol><li>x</li></ol>'],
  ];
  for (const [input, expected] of cases) {
    test(`keeps ${input}`, () => expect(sanitizeHtml(input)).toBe(expected));
  }
});

describe('sanitizeHtml — table support', () => {
  test('keeps full table structure', () => {
    const html = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  test('keeps colspan/rowspan when positive integer', () => {
    const out = sanitizeHtml('<table><tr><td colspan="2" rowspan="3">x</td></tr></table>');
    expect(out).toContain('colspan="2"');
    expect(out).toContain('rowspan="3"');
  });

  test('drops colspan/rowspan when not a positive integer > 1', () => {
    expect(sanitizeHtml('<table><tr><td colspan="0">x</td></tr></table>')).notToContain('colspan');
    expect(sanitizeHtml('<table><tr><td colspan="-1">x</td></tr></table>')).notToContain('colspan');
    expect(sanitizeHtml('<table><tr><td colspan="abc">x</td></tr></table>')).notToContain('colspan');
  });

  test('caps colspan/rowspan below an absurd value', () => {
    expect(sanitizeHtml('<table><tr><td colspan="9999">x</td></tr></table>')).notToContain('colspan');
  });
});

describe('sanitizeHtml — style filtering', () => {
  test('keeps allowed style props', () => {
    const out = sanitizeHtml('<span style="color:#f00; text-align:center; font-size:20px;">x</span>');
    expect(out).toContain('color:');
    expect(out).toContain('text-align:');
    expect(out).toContain('font-size:');
  });

  test('drops disallowed style props (e.g. position)', () => {
    const out = sanitizeHtml('<b style="color:red; position:absolute;">x</b>');
    expect(out).toContain('color:');
    expect(out).notToContain('position');
  });

  test('drops the style attribute entirely if all props are stripped', () => {
    const out = sanitizeHtml('<b style="position:absolute; z-index:9999;">x</b>');
    expect(out).toBe('<b>x</b>');
  });
});

describe('sanitizeHtml — empty / nullish input', () => {
  test('returns empty string for null/undefined/empty', () => {
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('plainToHtml', () => {
  test('escapes HTML metacharacters', () => {
    expect(plainToHtml('<b>')).toBe('&lt;b&gt;');
    expect(plainToHtml('a & b')).toBe('a &amp; b');
  });

  test('converts \\n to <br>', () => {
    expect(plainToHtml('a\nb')).toBe('a<br>b');
  });

  test('coerces null/undefined safely', () => {
    expect(plainToHtml(null)).toBe('');
    expect(plainToHtml(undefined)).toBe('');
  });
});

describe('looksLikeHtml', () => {
  test('detects real tags', () => {
    expect(looksLikeHtml('<b>x</b>')).toBeTruthy();
    expect(looksLikeHtml('plain text <p>here</p>')).toBeTruthy();
  });

  test('detects entity-encoded markup (so re-encoding does not double-escape)', () => {
    expect(looksLikeHtml('&lt;script&gt;')).toBeTruthy();
    expect(looksLikeHtml('Tom &amp; Jerry')).toBeTruthy();
  });

  test('returns false for plain text', () => {
    expect(looksLikeHtml('hello world')).toBeFalsy();
    expect(looksLikeHtml('Über-Café')).toBeFalsy();
    expect(looksLikeHtml('1 < 2 but ok')).toBeFalsy(); // "<\s" is not a tag start
  });

  test('returns false for null/undefined', () => {
    expect(looksLikeHtml(null)).toBeFalsy();
    expect(looksLikeHtml(undefined)).toBeFalsy();
  });
});

// ---------- Round-trip stability ----------
describe('sanitizeHtml — idempotency', () => {
  // The sanitiser is called on save AND on render — running it twice on the
  // same input must produce a stable string, otherwise we'd see drift in
  // saved playlists.
  const samples = [
    '<b>x</b>',
    '<a href="https://x">y</a>',
    '<table><tr><td>x</td></tr></table>',
    '<span style="color:red">x</span>',
    '<ul><li>x</li><li><b>y</b></li></ul>',
    '<h2>title</h2><p>body</p>',
    '<sup>2</sup>',
    '<sub>2</sub>',
  ];
  for (const s of samples) {
    test(`sanitize(sanitize(x)) === sanitize(x) for ${s}`, () => {
      const once = sanitizeHtml(s);
      const twice = sanitizeHtml(once);
      expect(twice).toBe(once);
    });
  }
});
