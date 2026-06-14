import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';
import { loadLeaflet, TILE_LAYERS, TILE_ATTRIBUTION } from '../leaflet-loader.js';
import { buildMarkerDivIcon, DEFAULT_MARKER_ICON } from '../data/map-marker-icons.js';
import { escapeHtml } from '../utils/escape.js';
import { mediaPlaceholder } from '../media-placeholder.js';

// CSS filters applied to Leaflet's tile pane only — markers, tooltips and the
// attribution control stay untouched. 'dark-boost' is the classic invert +
// hue-rotate trick that turns bright street maps dark for dark-themed lobbies
// without switching tile providers.
const TILE_FILTERS = Object.freeze({
  'grayscale': 'grayscale(1)',
  'dimmed': 'brightness(0.65) saturate(0.85)',
  'dark-boost': 'invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)',
});

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
    fitMarkers: false,
    // Appearance
    tileFilter: 'none',
    caption: '',
    // Behavior — interaction is locked by default so kiosk touchscreens can't
    // pan the map away into the ocean with no way back.
    tourSec: 0,
    lockInteraction: true,
    // Optional self-hosted / commercial tile provider. When tileUrl is set it
    // overrides `style` and uses tileAttribution as the required credit.
    tileUrl: '',
    tileAttribution: '',
  }),
  // Intentionally theme-less: the map deliberately omits themeField /
  // colorOverrideFields / textScaleField / mediaFitField. Tiles are
  // edge-to-edge raster imagery — there is no themable text, no accent
  // surface and no object-fit semantics to configure. The 'Tile filter'
  // below is the map's appearance knob instead.
  schema: () => ({
    fields: [
      { type: 'section', key: 'map', label: 'Map' },
      { key: 'location', type: 'location', label: 'Location & markers' },
      { key: 'style', type: 'select', label: 'Tile style', buttons: true, tier: 'advanced',
        options: [
          { value: 'osm', label: 'OpenStreetMap' },
          { value: 'carto-dark', label: 'CARTO Dark' },
          { value: 'carto-light', label: 'CARTO Light' },
        ],
        showIf: c => !String(c.tileUrl ?? '').trim(),
        help: 'Public OSM/CARTO tiles are for light, non-commercial use only. For business or heavy use, set a custom tile provider below.' },
      { key: 'fitMarkers', type: 'toggle', label: 'Auto-fit to markers', tier: 'advanced',
        showIf: c => (Array.isArray(c.location?.markers) ? c.location.markers.length : 0) >= 2,
        help: 'Frames the view around all markers automatically instead of using the manual centre and zoom.' },

      { type: 'section', key: 'appearance', label: 'Appearance' },
      { key: 'tileFilter', type: 'select', label: 'Tile filter', buttons: true, tier: 'advanced',
        options: [
          { value: 'none', label: 'None' },
          { value: 'grayscale', label: 'Grayscale' },
          { value: 'dimmed', label: 'Dimmed' },
          { value: 'dark-boost', label: 'Dark boost' },
        ],
        help: 'Restyles the map tiles — Dark boost turns bright street maps dark for dark-themed screens.' },
      { key: 'caption', type: 'text', label: 'Caption', tier: 'advanced',
        placeholder: 'Falls back to the slide title',
        help: 'Floating chip in the top-left corner of the map — names the place on an otherwise edge-to-edge map.' },

      { type: 'section', key: 'behavior', label: 'Behavior' },
      { key: 'tourSec', type: 'duration', label: 'Marker tour every (0 = off)', tier: 'advanced',
        showIf: c => (Array.isArray(c.location?.markers) ? c.location.markers.length : 0) >= 2,
        help: 'Flies the map from marker to marker on a timer — turns a static map into an attract loop across your locations. Values below 3 seconds are raised to 3.' },
      { key: 'lockInteraction', type: 'toggle', label: 'Lock interaction', tier: 'advanced',
        help: 'Blocks panning and zooming so viewers on touch displays can’t drag the map away.' },

      { type: 'section', key: 'tileProvider', label: 'Custom tile provider (optional)', collapsed: true,
        summary: c => {
          const u = String(c.tileUrl ?? '').trim();
          if (!u) return 'built-in tiles';
          try { return new URL(u.replace('{s}.', '')).hostname; } catch { return 'custom URL'; }
        } },
      { key: 'tileUrl', type: 'text', label: 'Tile URL template', tier: 'advanced',
        placeholder: 'https://{s}.tiles.example.com/{z}/{x}/{y}.png',
        help: 'Bring your own tile provider for business or heavy use. Overrides the tile style above. Use {s} {z} {x} {y} placeholders.',
        // A template URL can't be probed with a test: button (the literal
        // {z}/{x}/{y} placeholders 404), so inline validation is the only
        // feasible guard against the silent grey-tiles failure mode.
        validate: v => {
          const url = String(v ?? '').trim();
          if (!url) return null;
          if (!/^https:\/\//i.test(url)) {
            return { level: 'warn', message: 'Tile URL should start with https:// — http:// tiles are blocked as mixed content on secure displays.' };
          }
          if (!url.includes('{z}') || !url.includes('{x}') || !url.includes('{y}')) {
            return { level: 'warn', message: 'Tile URL template needs {z}, {x} and {y} placeholders — without them every tile shows the same image.' };
          }
          return null;
        } },
      { key: 'tileAttribution', type: 'text', label: 'Tile attribution', tier: 'advanced',
        placeholder: '© My Tile Provider',
        showIf: c => !!String(c.tileUrl ?? '').trim(),
        help: 'The credit line your tile provider requires. Shown in the map’s attribution control.' },
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const loc = c.location ?? {};
    // Edge-to-edge host: skip the .bb-slide padding wrapper (other media
    // widgets like video/iframe also append directly), and lock the map to
    // the widget's content box so it fills any container shape. Background is
    // theme-derived so the brief flash before tiles load matches light themes.
    const mapEl = document.createElement('div');
    mapEl.className = 'bb-slide-map';
    mapEl.dataset.field = 'location style fitMarkers tileFilter tourSec lockInteraction tileUrl tileAttribution';
    mapEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:var(--bb-st-bg, #0a0a10);';
    container.appendChild(mapEl);

    // Caption chip: edge-to-edge maps drop the usual slide-title rendering, so
    // the caption (falling back to slide.title) restores it as a floating chip.
    // Sibling of mapEl with z-index above Leaflet's panes/controls (≤1000) —
    // they share mapEl's stacking context since mapEl has no z-index of its own.
    const captionText = String(c.caption ?? '').trim() || String(slide.title ?? '').trim();
    let chip = null;
    if (captionText) {
      chip = document.createElement('div');
      chip.className = 'bb-map-caption';
      chip.dataset.field = 'caption';
      chip.style.cssText =
        'position:absolute;top:14px;left:14px;z-index:1100;pointer-events:none;' +
        'max-width:72%;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
        'padding:.35em .9em;border-radius:999px;' +
        'font:600 clamp(13px, 2.6cqmin, 28px)/1.4 var(--bb-st-font, var(--bb-font, Inter, sans-serif));' +
        'color:var(--bb-st-fg, #f1f1f4);' +
        'background:color-mix(in srgb, var(--bb-st-bg, #0a0a10) 72%, transparent);' +
        'border:1px solid color-mix(in srgb, var(--bb-st-fg, #f1f1f4) 16%, transparent);' +
        'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';
      chip.textContent = captionText;
      container.appendChild(chip);
    }

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
    let tourTimer = 0;
    let disposed = false;
    const gone = () => disposed || !!ctx?.signal?.aborted;

    loadLeaflet().then(L => {
      if (gone()) return;
      // Kiosk lock (default on): viewers on touch screens used to be able to
      // pan/pinch the map away with no way back — only zoomControl was off
      // while Leaflet's drag/scroll/touch handlers stayed at their defaults.
      const locked = c.lockInteraction !== false;
      map = L.map(mapEl, {
        zoomControl: false,
        attributionControl: true,
        dragging: !locked,
        scrollWheelZoom: !locked,
        touchZoom: !locked,
        doubleClickZoom: !locked,
        boxZoom: !locked,
        keyboard: !locked,
      }).setView([lat0, lng0], zoom0);
      // Drop Leaflet's default "Leaflet" prefix, it is NOT legally required
      // (BSD-2 keeps the licence in source, see THIRD-PARTY-NOTICES.md, not as a
      // UI credit). The OSM/CARTO tile attribution below IS required and stays.
      map.attributionControl.setPrefix(false);
      L.tileLayer(tileUrl, { attribution: tileAttribution }).addTo(map);

      const filter = TILE_FILTERS[c.tileFilter];
      if (filter) {
        const pane = map.getPane('tilePane');
        if (pane) pane.style.filter = filter;
      }

      const markers = (Array.isArray(loc.markers) ? loc.markers : [])
        .filter(m => Number.isFinite(+m.lat) && Number.isFinite(+m.lng));
      markers.forEach(m => {
        const mk = L.marker([+m.lat, +m.lng], { icon: buildMarkerDivIcon(L, m.icon) }).addTo(map);
        if (m.label) mk.bindTooltip(m.label, { permanent: true, direction: 'top', offset: [0, -32] });
      });

      // Auto-fit: frame all markers instead of the manual centre/zoom — multi-
      // site maps (branches, plants) stop needing manual zoom fiddling.
      if (c.fitMarkers && markers.length >= 2) {
        map.fitBounds(L.latLngBounds(markers.map(m => [+m.lat, +m.lng])).pad(0.2));
      }

      // Marker tour: fly from marker to marker on a timer (attract loop).
      // Uses the configured zoom as the per-stop zoom level; 3s floor so the
      // map isn't permanently mid-flight.
      const tourSec = Math.max(0, Number(c.tourSec) || 0);
      if (tourSec > 0 && markers.length >= 2) {
        let i = 0;
        tourTimer = setInterval(() => {
          if (gone() || !map) return;
          i = (i + 1) % markers.length;
          map.flyTo([+markers[i].lat, +markers[i].lng], zoom0);
        }, Math.max(3, tourSec) * 1000);
      }
    }).catch(() => {
      if (gone()) return;
      mapEl.replaceChildren(mediaPlaceholder({ icon: '🗺️', message: '⚠️ Map library failed to load.' }));
    });

    return composeDispose(() => {
      disposed = true;
      clearInterval(tourTimer);
      try { map?.remove(); } catch {}
      chip?.remove();
      mapEl.remove();
    });
  },
});
