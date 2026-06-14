// Tests for the custom-widget template engine. The string transforms are pure
// (run headlessly); sanitizeCustomTemplate needs the DOM and is guarded so the
// node runner skips it while the browser suite exercises it.
import { describe, test, expect } from './runner.js';
import {
  substituteTokens, applyFilter, tokensInTemplate, fieldTypeMap, collectValues,
  sanitizeCss, scopeCss, sanitizeCustomTemplate, renderCustom, CUSTOM_RESERVED_KEYS,
} from '../shared/custom-template.js';

describe('custom-template · tokens', () => {
  test('substitutes scalar values and HTML-escapes them', () => {
    const out = substituteTokens('Hi {{name}}', { name: '<b>x</b>' });
    expect(out).toBe('Hi &lt;b&gt;x&lt;/b&gt;');
  });

  test('rich-text fields are inserted raw (trusted, already sanitized)', () => {
    const out = substituteTokens('{{body}}', { body: '<b>hi</b>' }, { body: 'rich-text' });
    expect(out).toBe('<b>hi</b>');
  });

  test('missing token resolves to empty string', () => {
    expect(substituteTokens('[{{nope}}]', {})).toBe('[]');
  });

  test('filters transform the value before escaping', () => {
    expect(substituteTokens('{{n | round}}', { n: 3.7 })).toBe('4');
    expect(substituteTokens('{{s | upper}}', { s: 'hi' })).toBe('HI');
    expect(substituteTokens('{{p | percent}}', { p: 40 })).toBe('40%');
  });

  test('unknown filter passes the value through', () => {
    expect(applyFilter('x', 'bogus')).toBe('x');
  });

  test('tokensInTemplate dedups in order', () => {
    expect(tokensInTemplate('{{a}}{{b}}{{a}}')).toEqual(['a', 'b']);
  });

  test('fieldTypeMap maps key→type', () => {
    expect(fieldTypeMap([{ key: 'a', type: 'text' }, { key: 'b', type: 'number' }]))
      .toEqual({ a: 'text', b: 'number' });
  });

  test('collectValues skips reserved + underscore keys', () => {
    const vals = collectValues({ template: 't', css: 'c', fields: [], theme: 'd', _offline: {}, title: 'T', n: 1 });
    expect(vals).toEqual({ title: 'T', n: 1 });
    // sanity: the reserved list is what's being excluded
    expect(CUSTOM_RESERVED_KEYS).toContain('template');
  });
});

describe('custom-template · css', () => {
  test('sanitizeCss drops @import and neutralizes expression()/javascript:', () => {
    const out = sanitizeCss('@import url(evil.css); a{color:red;background:expression(x);content:javascript:y}');
    expect(out).notToContain('@import');
    expect(out).notToContain('expression(');
    expect(out.toLowerCase()).notToContain('javascript:');
  });

  test('scopeCss prefixes selectors with the scope', () => {
    const out = scopeCss('.card { color: red; }', '[data-cw="w1"]');
    expect(out).toContain('[data-cw="w1"] .card');
  });

  test('scopeCss collapses :root/body to the scope itself', () => {
    const out = scopeCss(':root { --x: 1; }', '[data-cw="w1"]');
    expect(out).toContain('[data-cw="w1"] {');
    expect(out).notToContain(':root');
  });

  test('scopeCss recurses into @media but leaves @keyframes inner intact', () => {
    const media = scopeCss('@media (min-width: 10px) { .a { color: red; } }', '#s');
    expect(media).toContain('@media (min-width: 10px)');
    expect(media).toContain('#s .a');
    const kf = scopeCss('@keyframes spin { from { opacity: 0; } to { opacity: 1; } }', '#s');
    // keyframe offsets must NOT be prefixed (they'd become invalid)
    expect(kf).notToContain('#s from');
    expect(kf).toContain('@keyframes spin');
  });

  test('scopeCss scopes a comma-separated selector list', () => {
    const out = scopeCss('.a, .b { color: red; }', '#s');
    expect(out).toContain('#s .a');
    expect(out).toContain('#s .b');
  });
});

// DOM-only — skipped under the node runner, run by the browser suite.
describe('custom-template · sanitize (DOM)', () => {
  const hasDom = typeof document !== 'undefined';

  test('strips <script> and event handlers, keeps class/style', () => {
    if (!hasDom) return;
    const out = sanitizeCustomTemplate('<div class="x" style="color:red" onclick="evil()">hi<script>bad()</scr' + 'ipt></div>');
    expect(out).toContain('class="x"');
    expect(out).toContain('color:red');
    expect(out.toLowerCase()).notToContain('onclick');
    expect(out.toLowerCase()).notToContain('<script');
    expect(out).toContain('hi');
  });

  test('drops <iframe> entirely and unwraps unknown tags', () => {
    if (!hasDom) return;
    const out = sanitizeCustomTemplate('<iframe src="x"></iframe><marquee>keep</marquee>');
    expect(out.toLowerCase()).notToContain('<iframe');
    expect(out.toLowerCase()).notToContain('<marquee');
    expect(out).toContain('keep');
  });

  test('neutralizes javascript: urls in href and style', () => {
    if (!hasDom) return;
    const out = sanitizeCustomTemplate('<a href="javascript:alert(1)">x</a><div style="background:url(javascript:bad)"></div>');
    expect(out.toLowerCase()).notToContain('javascript:');
  });

  test('renderCustom returns scoped css + sanitized html', () => {
    if (!hasDom) return;
    const { html, css } = renderCustom(
      { template: '<div class="cw">{{v}}</div>', css: '.cw{color:red}', fields: [{ key: 'v', type: 'text' }], v: 'hi' },
      '[data-cw="w1"]',
    );
    expect(html).toContain('hi');
    expect(css).toContain('[data-cw="w1"] .cw');
  });
});
