// Tests for shared/inline-vendor.js — the runtime resolver for vendored libs the
// publish bundler inlines into window.BB_VENDOR. Only the DOM-free paths run here
// (no window → null; raw source lookup; data: passthrough); the blob: branch needs
// URL.createObjectURL and is exercised in the browser.
import { describe, test, expect } from './runner.js';
import { inlinedVendorUrl, inlinedVendorSrc } from '../shared/inline-vendor.js';

describe('inline-vendor', () => {
  test('no window / no BB_VENDOR → null (dev shell falls back)', () => {
    expect(inlinedVendorSrc('hls.min.js')).toBe(null);
    expect(inlinedVendorUrl('hls.min.js')).toBe(null);
  });

  test('inlinedVendorSrc returns the raw body; inlinedVendorUrl passes data: through', () => {
    globalThis.window = {
      BB_VENDOR: {
        'leaflet/leaflet.css': { kind: 'css', body: '.leaflet{}' },
        'leaflet/images/marker-icon.png': { kind: 'dataurl', body: 'data:image/png;base64,AAA' },
      },
    };
    try {
      expect(inlinedVendorSrc('leaflet/leaflet.css')).toBe('.leaflet{}');
      expect(inlinedVendorSrc('missing')).toBe(null);
      // CSS is not a URL (must be injected as <style>) → null.
      expect(inlinedVendorUrl('leaflet/leaflet.css')).toBe(null);
      // Images come back as their data: URL verbatim (no blob needed).
      expect(inlinedVendorUrl('leaflet/images/marker-icon.png')).toBe('data:image/png;base64,AAA');
    } finally {
      delete globalThis.window;
    }
  });
});
