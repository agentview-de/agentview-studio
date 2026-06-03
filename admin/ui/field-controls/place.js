// Place picker — Nominatim address search WITHOUT a map. Value: { name, lat, lng }.

import { t } from '../../i18n.js';
import { geocode } from '../../../shared/leaflet-loader.js';
import { h, esc } from './_shared.js';

function normalizePlace(v) {
  if (v && typeof v === 'object') return { name: v.name ?? '', lat: +v.lat, lng: +v.lng };
  return { name: typeof v === 'string' ? v : '', lat: NaN, lng: NaN };
}

export function renderPlace(f, v, set) {
  const val = normalizePlace(v);
  const wrap = h('div', 'bb-place-field');
  const row = h('div', 'bb-asset-field');
  const input = h('input');
  input.type = 'text';
  input.placeholder = t('field.addressPlaceholder');
  input.value = val.name ?? '';
  const btn = h('button', 'bb-btn bb-btn-secondary', '🔍');
  btn.type = 'button';
  btn.setAttribute('aria-label', t('field.addressPlaceholder'));
  row.append(input, btn);
  const results = h('div', 'bb-location-results');
  results.hidden = true;
  const current = h('div', 'bb-place-current');
  const showCurrent = () => {
    current.textContent = Number.isFinite(val.lat)
      ? `📍 ${val.name} (${val.lat.toFixed(3)}, ${val.lng.toFixed(3)})`
      : '';
  };
  showCurrent();

  let ctrl = null;
  const doSearch = async () => {
    const term = input.value.trim();
    if (!term) return;
    btn.disabled = true; btn.textContent = '…';
    ctrl?.abort(); ctrl = new AbortController();
    try {
      const rows = await geocode(term, ctrl.signal);
      results.hidden = false;
      results.innerHTML = rows.length
        ? rows.map((r, i) => `<div class="bb-location-result" data-i="${i}">${esc(r.label)}</div>`).join('')
        : `<div class="bb-combo-empty">${esc(t('field.noMatch'))}</div>`;
      results._rows = rows;
    } catch (e) {
      if (e.name !== 'AbortError') { results.hidden = false; results.innerHTML = `<div class="bb-combo-empty">${esc(t('field.noMatch'))}</div>`; }
    } finally { btn.disabled = false; btn.textContent = '🔍'; }
  };
  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  results.addEventListener('click', e => {
    const row2 = e.target.closest('.bb-location-result');
    if (!row2) return;
    const r = results._rows[+row2.dataset.i];
    val.name = r.label.split(',')[0]; val.lat = r.lat; val.lng = r.lng;
    input.value = val.name; results.hidden = true;
    showCurrent();
    set({ name: val.name, lat: val.lat, lng: val.lng });
  });

  wrap.append(row, results, current);
  return { el: wrap };
}
