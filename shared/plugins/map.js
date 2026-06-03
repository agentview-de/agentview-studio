import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';
import { loadLeaflet, TILE_LAYERS, TILE_ATTRIBUTION } from '../leaflet-loader.js';
import { buildMarkerDivIcon, DEFAULT_MARKER_ICON } from '../data/map-marker-icons.js';
import { escapeHtml } from '../utils/escape.js';

export default register({
  type: 'map',
  label: 'Map',
  group: 'data',
  icon: '🗺️',
  network: true,
  usage: {
    tier: 'private-only',
    providerTerms: 'https://operations.osmfoundation.org/policies/tiles/',
    note: 'Default public OSM/CARTO tiles are for light, non-commercial use. For business or heavy use, configure your own tile provider.',
  },
  // v3: per-marker `icon` (emoji id from shared/data/map-marker-icons.js).
  // Old markers without `icon` fall back to DEFAULT_MARKER_ICON at render time.
  schemaVersion: 3,
  defaults: () => ({
    location: {
      lat: 48.137, lng: 11.575, zoom: 12,
      markers: [{ lat: 48.137, lng: 11.575, label: 'Munich HQ', icon: DEFAULT_MARKER_ICON }],
    },
    style: 'osm',
    // Optional self-hosted / commercial tile provider. When tileUrl is set it
    // overrides `style` and uses tileAttribution as the required credit.
    tileUrl: '',
    tileAttribution: '',
  }),
  schema: () => ({
    fields: [
      { key: 'location', type: 'location', label: 'Location & markers' },
      { key: 'style', type: 'select', label: 'Tile style', options: ['osm', 'carto-dark', 'carto-light'],
        showIf: c => !String(c.tileUrl ?? '').trim() },
      { type: 'section', label: 'Custom tile provider (optional)', collapsed: true },
      { key: 'tileUrl', type: 'text', label: 'Tile URL template',
        placeholder: 'https://{s}.tiles.example.com/{z}/{x}/{y}.png',
        help: 'Bring your own tile provider for business or heavy use. Overrides the tile style above. Use {s} {z} {x} {y} placeholders.' },
      { key: 'tileAttribution', type: 'text', label: 'Tile attribution',
        showIf: c => !!String(c.tileUrl ?? '').trim(),
        help: 'The credit line your tile provider requires. Shown in the map’s attribution control.' },
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const loc = c.location ?? {};
    // Edge-to-edge host: skip the .bb-slide padding wrapper (other media
    // widgets like video/iframe also append directly), and lock the map to
    // the widget's content box so it fills any container shape.
    const mapEl = document.createElement('div');
    mapEl.className = 'bb-slide-map';
    mapEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#0a0a10;';
    container.appendChild(mapEl);

    // Coerce/guard against half-entered coordinates: `??` only catches
    // null/undefined, so an in-progress marker with a NaN lat/lng used to throw
    // inside Leaflet and trip the .catch below, surfacing a misleading "Map
    // library failed to load" when the library was fine.
    const lat0 = Number.isFinite(+loc.lat) ? +loc.lat : 48.137;
    const lng0 = Number.isFinite(+loc.lng) ? +loc.lng : 11.575;
    const zoom0 = Number.isFinite(+loc.zoom) ? +loc.zoom : 12;
    // Resolve the tile source: a custom tileUrl wins over the built-in style.
    // Attribution is mandatory under the tile providers' licences, OSM/CARTO
    // strings are trusted constants; the custom one is user text, so escape it
    // (Leaflet renders attribution as HTML) before handing it to the control.
    const customTileUrl = String(c.tileUrl ?? '').trim();
    const tileUrl = customTileUrl || TILE_LAYERS[c.style ?? 'osm'] || TILE_LAYERS.osm;
    const tileAttribution = customTileUrl
      ? escapeHtml(String(c.tileAttribution ?? '').trim())
      : (TILE_ATTRIBUTION[c.style ?? 'osm'] ?? TILE_ATTRIBUTION.osm);

    let map = null;
    loadLeaflet().then(L => {
      map = L.map(mapEl, { zoomControl: false, attributionControl: true })
            .setView([lat0, lng0], zoom0);
      // Drop Leaflet's default "Leaflet" prefix, it is NOT legally required
      // (BSD-2 keeps the licence in source, see THIRD-PARTY-NOTICES.md, not as a
      // UI credit). The OSM/CARTO tile attribution below IS required and stays.
      map.attributionControl.setPrefix(false);
      L.tileLayer(tileUrl, { attribution: tileAttribution }).addTo(map);
      const markers = (Array.isArray(loc.markers) ? loc.markers : [])
        .filter(m => Number.isFinite(+m.lat) && Number.isFinite(+m.lng));
      markers.forEach(m => {
        const mk = L.marker([+m.lat, +m.lng], { icon: buildMarkerDivIcon(L, m.icon) }).addTo(map);
        if (m.label) mk.bindTooltip(m.label, { permanent: true, direction: 'top', offset: [0, -32] });
      });
    }).catch(() => {
      mapEl.innerHTML = '<div style="color:currentColor;opacity:.55;padding:20px;font:14px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;">⚠️ Map library failed to load.</div>';
    });

    return composeDispose(() => { try { map?.remove(); } catch {} mapEl.remove(); });
  },
});
