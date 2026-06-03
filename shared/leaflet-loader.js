// Lazily loads Leaflet (CSS + JS) exactly once. Shared by the map widget
// (player render) and the admin 'location' field control (picker).
//
// Self-hosted (vendored under shared/vendor/leaflet/) — no third-party CDN call,
// so display/viewer IPs stay out of CDN logs (DSGVO/GDPR). The marker/layer PNGs
// live in shared/vendor/leaflet/images/ and we point Leaflet's default icon path
// at them so markers render without reaching out to a CDN.

import { inlinedVendorUrl, inlinedVendorSrc } from './inline-vendor.js';

let _leafletPromise = null;

// In a published player the vendored leaflet/* siblings 404 on the content host and
// the asset store rejects .js, so the bundler inlines leaflet.js (blob: script),
// leaflet.css (inline <style>, its image url()s pre-rewritten to data:) and the
// marker PNGs (data:). The dev shell has no BB_VENDOR and falls back to the
// vendored files via import.meta.url.
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (_leafletPromise) return _leafletPromise;
  _leafletPromise = new Promise((res, rej) => {
    const base = new URL('./vendor/leaflet/', import.meta.url);

    const cssSrc = inlinedVendorSrc('leaflet/leaflet.css');
    if (cssSrc) {
      const st = document.createElement('style');
      st.textContent = cssSrc;
      document.head.appendChild(st);
    } else {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = new URL('leaflet.css', base).href;
      document.head.appendChild(css);
    }

    const s = document.createElement('script');
    s.src = inlinedVendorUrl('leaflet/leaflet.js') || new URL('leaflet.js', base).href;
    s.onload = () => {
      const icon = inlinedVendorUrl('leaflet/images/marker-icon.png');
      if (icon && window.L?.Icon?.Default) {
        // Inlined: give Leaflet explicit data: URLs (no images/ directory to point at).
        window.L.Icon.Default.mergeOptions({
          iconUrl: icon,
          iconRetinaUrl: inlinedVendorUrl('leaflet/images/marker-icon-2x.png') || icon,
          shadowUrl: inlinedVendorUrl('leaflet/images/marker-shadow.png') || '',
        });
      } else if (window.L?.Icon?.Default) {
        window.L.Icon.Default.imagePath = new URL('images/', base).href;
      }
      res(window.L);
    };
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return _leafletPromise;
}

// Tile-style URL templates. Kept as bare URL strings (consumed directly by
// L.tileLayer in both map.js and the admin location picker).
export const TILE_LAYERS = Object.freeze({
  'osm': 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'carto-dark': 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'carto-light': 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
});

// The attribution string each tile provider's licence REQUIRES be shown,
// keyed by the same style id. OSM tiles need the OpenStreetMap credit; CARTO
// basemaps additionally need the CARTO credit. Callers pass the matching
// string as the `attribution` option of L.tileLayer so Leaflet's attribution
// control renders it. Kept separate from TILE_LAYERS so the URL map stays a
// plain string lookup for existing callers.
export const TILE_ATTRIBUTION = Object.freeze({
  'osm': '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  'carto-dark': '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  'carto-light': '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
});

// Forward + reverse geocoding via the free OpenStreetMap Nominatim service.
// Usage policy: <=1 req/s, attribution required (we show it in the picker).
const NOMINATIM = 'https://nominatim.openstreetmap.org';

export async function geocode(query, signal) {
  const url = `${NOMINATIM}/search?format=jsonv2&limit=6&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { signal, headers: { 'Accept-Language': document.documentElement.lang || 'en' } });
  if (!r.ok) throw new Error(`Geocoding failed (${r.status})`);
  const rows = await r.json();
  return rows.map(row => ({
    label: row.display_name,
    lat: +row.lat,
    lng: +row.lon,
    kind: row.type,
  }));
}
