// Tests for shared/store-template-preview.js — the editor-side, network-free
// preview of a store template's data slots, plus slot-ref discovery from
// rendered display HTML.
import { describe, test, expect } from './runner.js';
import { buildPreviewHtml, extractSlotRefs } from '../shared/store-template-preview.js';

const TEMPLATE = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script>
  const BRAND_URL = "{{slot:brand.readUrl}}";
  const HOURS_URL = "{{slot:hours.readUrl}}";
</script>
</body></html>`;

describe('buildPreviewHtml · passthrough', () => {
  test('no slots → html returned unchanged', () => {
    expect(buildPreviewHtml(TEMPLATE, {})).toBe(TEMPLATE);
    expect(buildPreviewHtml(TEMPLATE, null)).toBe(TEMPLATE);
    expect(buildPreviewHtml(TEMPLATE, undefined)).toBe(TEMPLATE);
  });

  test('keys with undefined value are ignored (placeholder kept)', () => {
    const out = buildPreviewHtml(TEMPLATE, { brand: undefined });
    expect(out).toBe(TEMPLATE);
  });
});

describe('buildPreviewHtml · injection', () => {
  test('an edited slot rewrites only its placeholder to a sentinel URL', () => {
    const out = buildPreviewHtml(TEMPLATE, { brand: { name: 'Trattoria' } });
    // brand placeholder is gone, replaced by the sentinel origin
    expect(out.includes('{{slot:brand.readUrl}}')).toBe(false);
    expect(out.includes('https://avs-slot.local/brand')).toBe(true);
    // hours has no edited value → its placeholder stays literal (uses defaults)
    expect(out.includes('{{slot:hours.readUrl}}')).toBe(true);
  });

  test('the shim + data are injected right after <head>', () => {
    const out = buildPreviewHtml(TEMPLATE, { brand: { name: 'X' } });
    const headIdx = out.indexOf('<head>');
    const shimIdx = out.indexOf('window.fetch');
    expect(headIdx !== -1).toBe(true);
    expect(shimIdx > headIdx).toBe(true);
    // injected before the template script so it runs first
    expect(shimIdx < out.indexOf('BRAND_URL')).toBe(true);
  });

  test('embedded JSON is HTML-escaped so it cannot break out of <script>', () => {
    const out = buildPreviewHtml(TEMPLATE, { brand: { html: '</script><x>' } });
    // No raw closing-script sequence from the data survives
    expect(out.includes('</script><x>')).toBe(false);
    expect(out.includes('\\u003c/script>')).toBe(true);
  });

  test('no <head> → shim is prepended', () => {
    const out = buildPreviewHtml('<div>{{slot:a.readUrl}}</div>', { a: { v: 1 } });
    expect(out.startsWith('<script>')).toBe(true);
    expect(out.includes('window.fetch')).toBe(true);
    expect(out.includes('https://avs-slot.local/a')).toBe(true);
  });
});

describe('extractSlotRefs', () => {
  test('finds slugs from rendered public read URLs', () => {
    const html = `<script>
      const B = "https://agentview.de/data/brand/public";
      const H = "https://agentview.de/data/hours/public";
    </script>`;
    const refs = extractSlotRefs(html).map(r => r.slug).sort();
    expect(refs).toEqual(['brand', 'hours']);
  });

  test('finds slugs from the /data/u/<token>/<slug> variant', () => {
    const html = `<a href="https://content.agentview.de/data/u/abc123/menu/json">x</a>`;
    const refs = extractSlotRefs(html);
    expect(refs.length).toBe(1);
    expect(refs[0].slug).toBe('menu');
  });

  test('falls back to literal {{slot:KEY.prop}} placeholders', () => {
    const refs = extractSlotRefs(TEMPLATE).map(r => r.slug).sort();
    expect(refs).toEqual(['brand', 'hours']);
    expect(extractSlotRefs(TEMPLATE).every(r => r.url === null)).toBe(true);
  });

  test('dedupes repeated slugs', () => {
    const html = 'a/data/x/public b/data/x/public {{slot:x.readUrl}}';
    const refs = extractSlotRefs(html);
    expect(refs.length).toBe(1);
    expect(refs[0].slug).toBe('x');
  });
});
