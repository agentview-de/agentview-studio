// Location field — Leaflet map + Nominatim search + draggable markers.
// Value: { lat, lng, zoom, markers: [{ lat, lng, label, icon }] }.

import { t } from '../../i18n.js';
import { loadLeaflet, TILE_LAYERS, TILE_ATTRIBUTION, geocode } from '../../../shared/leaflet-loader.js';
import {
  MAP_MARKER_ICONS, DEFAULT_MARKER_ICON, markerEmoji, markerLabel, buildMarkerDivIcon,
} from '../../../shared/data/map-marker-icons.js';
import { h, esc } from './_shared.js';

function normalizeLoc(v) {
  const o = (v && typeof v === 'object') ? v : {};
  return {
    lat: Number.isFinite(+o.lat) ? +o.lat : 48.137,
    lng: Number.isFinite(+o.lng) ? +o.lng : 11.575,
    zoom: Number.isFinite(+o.zoom) ? +o.zoom : 12,
    markers: Array.isArray(o.markers) ? o.markers.map(m => ({
      lat: +m.lat, lng: +m.lng, label: m.label ?? '',
      icon: typeof m.icon === 'string' && m.icon ? m.icon : DEFAULT_MARKER_ICON,
    })) : [],
  };
}

// Opens a small grid popover anchored to `button`, lets the user pick any icon
// from MAP_MARKER_ICONS, calls onPick(id), then closes itself. One popover is
// reused across all marker rows — clicking another icon button moves it.
function openIconPicker(anchor, currentId, onPick) {
  // Close any existing picker first.
  document.querySelectorAll('.bb-marker-icon-pop').forEach(el => el.remove());
  const pop = h('div', 'bb-marker-icon-pop');
  pop.role = 'dialog';
  MAP_MARKER_ICONS.forEach(it => {
    const cell = h('button', 'bb-marker-icon-cell' + (it.id === currentId ? ' bb-sel' : ''));
    cell.type = 'button';
    cell.title = it.label;
    cell.setAttribute('aria-label', it.label);
    cell.textContent = it.emoji;
    cell.addEventListener('click', () => { onPick(it.id); pop.remove(); cleanup(); });
    pop.appendChild(cell);
  });
  document.body.appendChild(pop);

  // Position the popover under the anchor button. `position:fixed` on .pop in
  // CSS — the rect coords come from getBoundingClientRect, which already
  // account for scroll, so no extra math is needed.
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 280, r.left))}px`;
  pop.style.top  = `${r.bottom + 6}px`;

  const onAway = e => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); cleanup(); } };
  const onKey  = e => { if (e.key === 'Escape') { pop.remove(); cleanup(); } };
  function cleanup() {
    document.removeEventListener('mousedown', onAway, true);
    document.removeEventListener('keydown', onKey);
  }
  // `mousedown` capture beats the cell's click handler when clicking on a cell —
  // but cells call pop.remove() themselves first, so the away handler then sees
  // a detached target and noops. Outside clicks still close the popover.
  setTimeout(() => {
    document.addEventListener('mousedown', onAway, true);
    document.addEventListener('keydown', onKey);
  }, 0);
}

export function renderLocation(f, v, set) {
  const val = normalizeLoc(v);
  const wrap = h('div', 'bb-location');

  // Search row
  const searchRow = h('div', 'bb-location-search');
  const q = h('input');
  q.type = 'text';
  q.placeholder = t('field.addressPlaceholder');
  const searchBtn = h('button', 'bb-btn bb-btn-secondary', '🔍');
  searchBtn.type = 'button';
  searchBtn.setAttribute('aria-label', t('field.addressPlaceholder'));
  searchRow.append(q, searchBtn);
  const results = h('div', 'bb-location-results');
  results.hidden = true;

  const mapEl = h('div', 'bb-location-map');
  const markersBox = h('div', 'bb-location-markers');
  const attribution = h('div', 'bb-location-attr', t('field.osmAttr'));
  const help = h('p', 'bb-form-help', t('field.locationHelp'));
  wrap.append(searchRow, results, mapEl, help, markersBox, attribution);

  let map = null;
  let leafletMarkers = [];
  let sizeTimer = 0;
  const commit = () => set({ ...val, markers: val.markers.map(m => ({ ...m })) });

  const renderMarkerList = () => {
    markersBox.innerHTML = '';
    if (!val.markers.length) {
      markersBox.append(h('div', 'bb-location-nomarkers', t('field.noMarkers')));
      return;
    }
    val.markers.forEach((m, i) => {
      const row = h('div', 'bb-location-marker');

      // Icon picker button (shows current emoji)
      const iconBtn = h('button', 'bb-marker-icon-btn');
      iconBtn.type = 'button';
      iconBtn.title = t('field.markerIcon');
      iconBtn.setAttribute('aria-label', t('field.markerIcon'));
      iconBtn.textContent = markerEmoji(m.icon);
      iconBtn.addEventListener('click', () => {
        openIconPicker(iconBtn, m.icon ?? DEFAULT_MARKER_ICON, id => {
          m.icon = id;
          iconBtn.textContent = markerEmoji(id);
          iconBtn.dataset.tip = markerLabel(id);
          refreshLeafletMarkers();
          commit();
        });
      });

      const label = h('input');
      label.type = 'text';
      label.placeholder = t('field.markerLabel');
      label.value = m.label ?? '';
      label.addEventListener('input', () => { m.label = label.value; refreshLeafletMarkers(); commit(); });

      const rm = h('button', 'bb-btn bb-btn-ghost', '✕');
      rm.type = 'button';
      rm.title = t('common.delete');
      rm.setAttribute('aria-label', t('common.delete'));
      rm.addEventListener('click', () => { val.markers.splice(i, 1); renderMarkerList(); refreshLeafletMarkers(); commit(); });

      row.append(iconBtn, label, rm);
      markersBox.append(row);
    });
  };

  const refreshLeafletMarkers = () => {
    if (!map || !window.L) return;
    leafletMarkers.forEach(mk => map.removeLayer(mk));
    leafletMarkers = val.markers.map((m) => {
      const mk = window.L.marker([m.lat, m.lng], {
        draggable: true,
        icon: buildMarkerDivIcon(window.L, m.icon),
      }).addTo(map);
      if (m.label) mk.bindTooltip(m.label, { permanent: true, direction: 'top', offset: [0, -32] });
      mk.on('dragend', () => { const ll = mk.getLatLng(); m.lat = ll.lat; m.lng = ll.lng; commit(); });
      return mk;
    });
  };

  const showResults = rows => {
    results.hidden = false;
    if (!rows.length) { results.innerHTML = `<div class="bb-combo-empty">${esc(t('field.noMatch'))}</div>`; return; }
    results.innerHTML = rows.map((r, i) =>
      `<div class="bb-location-result" data-i="${i}">${esc(r.label)}</div>`).join('');
    results._rows = rows;
  };
  results.addEventListener('click', e => {
    const row = e.target.closest('.bb-location-result');
    if (!row) return;
    const r = results._rows[+row.dataset.i];
    val.lat = r.lat; val.lng = r.lng; val.zoom = Math.max(val.zoom, 13);
    results.hidden = true; q.value = r.label.split(',')[0];
    if (map) map.setView([val.lat, val.lng], val.zoom);
    // First search result also seeds a labelled marker if none exist yet.
    if (!val.markers.length) {
      val.markers.push({ lat: r.lat, lng: r.lng, label: r.label.split(',')[0], icon: DEFAULT_MARKER_ICON });
      renderMarkerList(); refreshLeafletMarkers();
    }
    commit();
  });

  let searchCtrl = null;
  const doSearch = async () => {
    const term = q.value.trim();
    if (!term) return;
    searchBtn.disabled = true; searchBtn.textContent = '…';
    searchCtrl?.abort(); searchCtrl = new AbortController();
    try {
      const rows = await geocode(term, searchCtrl.signal);
      showResults(rows);
    } catch (e) {
      if (e.name !== 'AbortError') showResults([]);
    } finally { searchBtn.disabled = false; searchBtn.textContent = '🔍'; }
  };
  searchBtn.addEventListener('click', doSearch);
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

  loadLeaflet().then(L => {
    if (!wrap.isConnected) return;
    // Attribution is mandatory under the OSM/CARTO tile licences — keep
    // Leaflet's attribution control visible and feed it the matching credit
    // string (consistent with the map widget in shared/plugins/map.js).
    map = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([val.lat, val.lng], val.zoom);
    // Drop the "Leaflet" prefix (not required); keep the mandatory OSM/CARTO credit.
    map.attributionControl.setPrefix(false);
    L.tileLayer(TILE_LAYERS['carto-dark'], { attribution: TILE_ATTRIBUTION['carto-dark'] }).addTo(map);
    // The panel is laid out around this map, so Leaflet has to re-measure once
    // the flex/grid settles. Sixty milliseconds is also long enough for the
    // inspector to have re-rendered this field away — selecting another widget
    // does it — and Leaflet's remove() deletes the map pane while leaving the
    // map "loaded", so a late invalidateSize() reads _leaflet_pos off nothing
    // and throws where no try/catch can see it. Hold the timer and check the
    // element is still on the page.
    sizeTimer = setTimeout(() => { if (map && mapEl.isConnected) map.invalidateSize(); }, 60);
    refreshLeafletMarkers();
    map.on('moveend zoomend', () => {
      const c = map.getCenter();
      val.lat = +c.lat.toFixed(6); val.lng = +c.lng.toFixed(6); val.zoom = map.getZoom();
      commit();
    });
    map.on('click', e => {
      val.markers.push({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6), label: '', icon: DEFAULT_MARKER_ICON });
      renderMarkerList(); refreshLeafletMarkers(); commit();
    });
  }).catch(() => { mapEl.innerHTML = `<div class="bb-location-fail">${esc(t('field.mapFail'))}</div>`; });

  // Tear down the Leaflet instance when the inspector re-renders this away.
  const mo = new MutationObserver(() => {
    if (!document.contains(mapEl)) {
      clearTimeout(sizeTimer);
      try { map?.remove(); } catch { /* already gone */ }
      map = null;
      document.querySelectorAll('.bb-marker-icon-pop').forEach(el => el.remove());
      mo.disconnect();
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  renderMarkerList();
  return { el: wrap };
}
