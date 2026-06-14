import { register } from './registry.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { composeDispose, childSignal } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { isStored, dataModeField } from '../offline-data.js';
import { refreshSecField } from '../refresh-field.js';
import { localeField } from '../locale-field.js';
import { textScaleField } from '../text-scale.js';
import { WEATHER_SVG_DEFS, wmoToIconId } from '../data/weather-svg-icons.js';
import {
  WMO, tempColor, tempBarGradient, windArrowSvg, formatTime, formatHour,
  compassName, windDesc, humidityDesc, feelsLikeDesc, dayLength, designSupports, relativeAge,
  isSevereWmo, uvDesc,
} from './weather-format.js';

// ── Open-Meteo response cache ───────────────────────────────────────────────
// Editing a weather widget rebuilds it on every toggle / theme / design click
//, that's the widget contract, the inspector debounces input and refreshes
// the canvas. Without a cache, every keystroke fires a real Open-Meteo call.
// One design session = 20-30 wasted requests.
//
// We cache by the FULL URL (which already encodes lat/lng/units/which fields
// are requested) and dedupe concurrent in-flight requests so multiple weather
// widgets pointing at the same place share one network round-trip. TTL is
// 5 minutes, Open-Meteo updates roughly hourly anyway, and a design session
// rarely lasts longer than the TTL.
const WEATHER_TTL_MS = 5 * 60 * 1000;
const _weatherCache = new Map();   // url → { data, expiresAt }
const _weatherInflight = new Map(); // url → Promise<data>

// Returns `{ data, fetchedAt }`. fetchedAt is the timestamp the JSON was
// actually pulled from Open-Meteo, used by the dashboard design's "Updated
// X ago" line and preserved across cache reuse so a cache-hit shows the real
// network time, not the current render time.
function fetchWeather(url) {
  const now = Date.now();
  const cached = _weatherCache.get(url);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve({ data: cached.data, fetchedAt: cached.fetchedAt });
  }
  const pending = _weatherInflight.get(url);
  if (pending) return pending;
  // Note: deliberately no per-widget AbortSignal here. If widget A unmounts
  // while its fetch is still flying, we still want the response cached for
  // widget B (or for a quick re-render). Each caller checks its own signal
  // AFTER the cached promise resolves.
  const p = fetch(url, { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(data => {
      const fetchedAt = Date.now();
      _weatherCache.set(url, { data, expiresAt: fetchedAt + WEATHER_TTL_MS, fetchedAt });
      _weatherInflight.delete(url);
      return { data, fetchedAt };
    })
    .catch(err => {
      _weatherInflight.delete(url);
      throw err;
    });
  _weatherInflight.set(url, p);
  return p;
}

// Build the Open-Meteo forecast URL for OFFLINE provisioning. Unlike the live
// render (which requests only the params the enabled toggles need), this asks for
// the UNION of every field any design/toggle might read, so whatever the display
// has enabled, the stored payload already contains it. The API key — when set —
// is used HERE, Studio-side, to route to the paid customer endpoint; it is stripped
// from the shipped widget (STRIP_KEYS) and never reaches the display.
function offlineForecastUrl(c) {
  const loc = c?.location ?? {};
  const unit = c?.unit === 'F' ? 'fahrenheit' : 'celsius';
  const windUnit = ['kmh', 'mph', 'ms'].includes(c?.windUnit) ? c.windUnit : 'kmh';
  const qs = new URLSearchParams({
    latitude:  String(loc.lat),
    longitude: String(loc.lng),
    current:   'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature,wind_direction_10m,uv_index',
    daily:     'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset,uv_index_max',
    hourly:    'temperature_2m,weather_code,precipitation_probability',
    temperature_unit: unit,
    wind_speed_unit:  windUnit,
    timezone:  'auto',
  });
  const apiKey = typeof c?.apiKey === 'string' ? c.apiKey.trim() : '';
  const host = apiKey ? 'https://customer-api.open-meteo.com' : 'https://api.open-meteo.com';
  if (apiKey) qs.set('apikey', apiKey);
  return `${host}/v1/forecast?${qs.toString()}`;
}

export default register({
  type: 'weather',
  label: 'Live Weather',
  group: 'live',
  icon: '🌤️',
  network: true,
  usage: {
    tier: 'byo-key',
    attribution: 'Weather data by Open-Meteo.com',
    providerTerms: 'https://open-meteo.com/en/terms',
    note: 'Free tier is for non-commercial use only. For business use, add your own Open-Meteo API key.',
  },
  // v4: added data toggles (hilo/precip/sunrise/wind-vector/hourly/colorTemp)
  // and the hourly design variant. Existing widgets keep working, every new
  // toggle is opt-in (default false except where noted) so the previous
  // visual stays identical until the user opts in.
  // v5: added 'dashboard' design, a premium full-canvas variant with stat
  // cards, section headers ("Hourly forecast · Next 12 hours"), HEUTE/Jetzt
  // highlights, and per-card subtitles. Pure-additive: no migration needed.
  // v6: inspector-polish wave — sectioned schema (Location / Appearance /
  // Show on this widget / Data / Theme & colours), live auto-refresh
  // (refreshSec), audience locale + 12/24h time format, severe-weather alert
  // banner (showAlerts), UV index stat card (showUv), text-size control
  // (textScale). Pure-additive: every new key has a safe default and stored
  // content without them renders exactly as before, no migrate() needed.
  schemaVersion: 6,
  // Offline provisioning: the Studio fetches the full Open-Meteo forecast on
  // "Refresh data" (using the API key here, never on the display) and stores the
  // raw response; the display reads that — no live call, no key on screen.
  provisionOffline: async (content) => {
    const loc = content?.location ?? {};
    if (!Number.isFinite(+loc.lat) || !Number.isFinite(+loc.lng)) throw new Error('No location set');
    const r = await fetch(offlineForecastUrl(content), { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
  defaults: () => ({
    // 'live' (display fetches Open-Meteo) or 'stored' (Studio pre-fetches into a
    // data slot, the display reads that — no live call, no key on screen).
    dataMode: 'live',
    location: { name: 'Munich', lat: 48.137, lng: 11.575 },
    unit: 'C', windUnit: 'kmh',
    // Optional Open-Meteo API key. Empty = free public api.open-meteo.com
    // (non-commercial only). Setting a key routes to the commercial
    // customer-api.open-meteo.com endpoint instead.
    apiKey: '',
    // Live-mode polling interval in seconds. 15 minutes is generous headroom
    // (Open-Meteo updates roughly hourly) while keeping permanently-mounted
    // widgets from going stale. Existing stored widgets without the key keep
    // the old fetch-once behaviour (0). Offline mode ignores it.
    refreshSec: 900,
    // Audience language for weekday/date/time formatting ('' = device locale)
    // and the 12/24h clock preference ('auto' follows the locale).
    locale: '',
    timeFormat: 'auto',
    // What to show, granular toggles, customer picks per widget.
    // showCity/showTemp/showIcon let the user hide the "core" hero elements
    // so they can stack multiple weather widgets (e.g. one with just the
    // temp, another with just the forecast strip) into a composite layout.
    showCity: true,
    showTemp: true,
    showIcon: true,
    // Description ("Clear sky", "Mainly clear" etc.) is an English WMO label;
    // defaulted off so the widget stays international by default. Customers
    // opting in to add a localized "Sunny" etc. can flip this toggle on.
    showDescription: false,
    showHiLo: true,
    showStats: true,
    showWindVector: false,
    showPrecip: true,
    showSunrise: false,
    showForecast: true,
    forecastDays: 7,
    showHourly: false,
    hourlyHours: 12,
    // Opt-in extras: severe-weather banner (heavy rain/snow, storms — shows
    // even when condition text is off) and a UV-index stat card.
    showAlerts: false,
    showUv: false,
    // Visual treatment
    colorTemperature: true,
    design: 'classic',
    theme: 'gradient-blue',
    textScale: 100,
    // Optional text/accent overrides (shared shape). Empty = use the theme's
    // default; a hex sets --bb-st-fg/-accent on the root, cascading to city,
    // temp, desc, stats, forecast — every text element in the widget.
    ...colorOverrideDefaults(),
    // 'auto' = dashboard uses custom SVG icons, every other design uses
    // emoji; 'svg' / 'emoji' override per-widget so users can pick whichever
    // style fits their composition.
    iconSet: 'auto',
  }),
  schema: () => ({
    fields: [
      // ── Location — the primary input comes first ──────────────────────────
      { type: 'section', key: 'place', label: 'Location' },
      { key: 'location', type: 'place', label: 'Location',
        validate: (v) => (!Number.isFinite(+v?.lat) || !Number.isFinite(+v?.lng))
          ? { level: 'error', message: 'Pick a location — weather cannot load without coordinates.' }
          : null },
      { type: 'row', children: [
        { key: 'unit', type: 'select', label: 'Temperature', options: [
          { value: 'C', label: '°C (Celsius)' },
          { value: 'F', label: '°F (Fahrenheit)' },
        ] },
        { key: 'windUnit', type: 'select', label: 'Wind', options: [
          { value: 'kmh', label: 'km/h' },
          { value: 'mph', label: 'mph' },
          { value: 'ms',  label: 'm/s' },
        ] },
      ] },

      // ── Appearance — the design select sits ABOVE the toggles it gates via
      // designSupports() so switching designs never makes fields appear or
      // disappear off-screen above the user's scroll position. ──────────────
      { type: 'section', key: 'appearance', label: 'Appearance' },
      { key: 'design', type: 'select', label: 'Design', options: [
        { value: 'classic',   label: 'Classic, icon · temp · forecast strip' },
        { value: 'minimal',   label: 'Minimal, temp + city only' },
        { value: 'hero',      label: 'Hero, huge temperature' },
        { value: 'forecast',  label: 'Forecast, multi-day tiles dominate' },
        { value: 'split',     label: 'Split, current left, forecast right' },
        { value: 'hourly',    label: 'Hourly, next 12–24 hours strip' },
        { value: 'dashboard', label: 'Dashboard, premium full-canvas, all data' },
      ] },
      { key: 'iconSet', type: 'select', label: 'Icon style', tier: 'advanced', options: [
        { value: 'auto',  label: 'Auto (Dashboard = SVG, others = Emoji)' },
        { value: 'svg',   label: 'SVG, custom illustrated icons' },
        { value: 'emoji', label: 'Emoji, system color icons (☀️ ⛅ 🌧️)' },
      ] },
      { key: 'colorTemperature', type: 'toggle', label: 'Colour-code temperature', tier: 'advanced',
        help: 'Tints the current temperature and forecast hi/lo by °C, blue for cold, amber for warm, red for hot.' },
      { ...textScaleField(), tier: 'advanced' },
      { ...localeField(), tier: 'advanced' },
      { key: 'timeFormat', type: 'select', label: 'Time format', buttons: true, tier: 'advanced', options: [
        { value: 'auto', label: 'Auto' },
        { value: '12h',  label: '12 h (AM/PM)' },
        { value: '24h',  label: '24 h' },
      ], help: 'Clock format for sunrise/sunset times and the hourly strip. Auto follows the language above.' },

      // ── Data the customer wants on this widget ────────────────────────────
      // Each toggle is gated by `designSupports(design, slot)` so the inspector
      // only shows options whose output the current design will actually paint.
      // Picking "Minimal" hides everything except the temp/city toggles; "Hero"
      // hides forecast + hourly + precip; "Split" hides hourly + sunrise.
      //
      // City/Temp/Icon are always available, they're the visual primitives
      // and the user opts out to build composite layouts (stack two weather
      // widgets, one showing just the temp, another just the forecast strip).
      { type: 'section', key: 'show', label: 'Show on this widget',
        help: 'Only options the selected design can display are offered here.' },
      { type: 'row', children: [
        { key: 'showCity', type: 'toggle', label: 'City' },
        { key: 'showTemp', type: 'toggle', label: 'Temperature' },
      ] },
      { type: 'row', children: [
        { key: 'showIcon', type: 'toggle', label: 'Weather icon' },
        { key: 'showDescription', type: 'toggle', label: 'Condition text', tier: 'advanced',
          help: 'English WMO label ("Clear sky", "Mainly clear"…). Off by default to keep widget international.' },
      ] },
      { type: 'row', children: [
        { key: 'showHiLo',       type: 'toggle', label: 'High / Low today', tier: 'advanced',
          showIf: c => designSupports(c.design, 'hilo') },
        { key: 'showStats',      type: 'toggle', label: 'Wind / Humidity / Feels-like', tier: 'advanced',
          showIf: c => designSupports(c.design, 'stats') },
      ] },
      { type: 'row', children: [
        { key: 'showWindVector', type: 'toggle', label: 'Wind direction arrow', tier: 'advanced',
          showIf: c => designSupports(c.design, 'stats') && c.showStats !== false,
          help: 'Adds a small compass arrow next to the wind speed.' },
        { key: 'showUv', type: 'toggle', label: 'UV index card', tier: 'advanced',
          showIf: c => designSupports(c.design, 'stats') && c.showStats !== false,
          help: 'Adds a UV index card (Low / Moderate / High) to the stats row.' },
      ] },
      { type: 'row', children: [
        { key: 'showPrecip',     type: 'toggle', label: 'Precipitation chance', tier: 'advanced',
          showIf: c => designSupports(c.design, 'precip') },
        { key: 'showSunrise',    type: 'toggle', label: 'Sunrise / Sunset', tier: 'advanced',
          showIf: c => designSupports(c.design, 'sunrise') },
      ] },
      { type: 'row', children: [
        { key: 'showForecast', type: 'toggle', label: 'Daily forecast', tier: 'advanced',
          showIf: c => designSupports(c.design, 'forecast') },
        { key: 'forecastDays', type: 'number', label: 'Forecast days', min: 1, max: 7, step: 1, slider: true, suffix: ' days', tier: 'advanced',
          showIf: c => designSupports(c.design, 'forecast') && c.showForecast !== false,
          help: 'Portrait screens often want 3–5, landscape can take all 7.' },
      ] },
      { type: 'row', children: [
        { key: 'showHourly', type: 'toggle', label: 'Hourly strip (next N hours)', tier: 'advanced',
          showIf: c => designSupports(c.design, 'hourly') },
        { key: 'hourlyHours', type: 'number', label: 'Hours to show', min: 4, max: 24, step: 1, slider: true, suffix: ' h', tier: 'advanced',
          showIf: c => designSupports(c.design, 'hourly') && c.showHourly === true },
      ] },
      { key: 'showAlerts', type: 'toggle', label: 'Severe-weather banner', tier: 'advanced',
        help: 'Shows a warning banner when current or upcoming conditions are severe (heavy rain or snow, storms) — even when the condition text is off.' },

      // ── Data plumbing — rarely touched, folded by default ─────────────────
      { type: 'section', key: 'data', label: 'Data', collapsed: true,
        summary: (c) => {
          if (isStored(c)) return 'Offline';
          const r = Number(c?.refreshSec) || 0;
          const every = r <= 0 ? '1×' : r % 60 === 0 ? `${r / 60} min` : `${r} s`;
          return `Live · ${every}${c?.apiKey ? ' · API key' : ''}`;
        } },
      dataModeField({
        help: 'Offline: the Studio fetches the forecast on “Refresh data” (the API key is used here, never on screen) and stores it; the display reads that — no live call, works without internet on the screen.',
      }),
      refreshSecField({
        help: 'Open-Meteo updates its forecast roughly hourly — 15 minutes is plenty. 0 fetches once and keeps that forecast until the slide re-renders.',
        showIf: c => !isStored(c),
      }),
      { key: 'apiKey', type: 'text', label: 'Open-Meteo API key (optional)',
        placeholder: 'Leave empty for the free non-commercial tier',
        help: 'Open-Meteo’s free tier is non-commercial only. Business users should add their own Open-Meteo API key, it routes requests to the paid customer-api.open-meteo.com endpoint.' },

      ...themeColorSection(),
    ],
  }),
  looks: () => [
    { id: 'current-only', name: 'Current only', patch: {
      design: 'minimal', showForecast: false, showHourly: false, showStats: false, showHiLo: false, showDescription: false } },
    { id: 'with-forecast', name: 'With forecast', patch: {
      design: 'classic', showForecast: true, forecastDays: 5, showHourly: false, showHiLo: true } },
    { id: 'detailed', name: 'Detailed', patch: {
      design: 'dashboard', showStats: true, showHiLo: true, showForecast: true, showHourly: true, showDescription: true } },
    { id: 'hourly-strip', name: 'Hourly strip', patch: {
      design: 'hourly', showHourly: true, hourlyHours: 12, showForecast: false } },
    { id: 'fahrenheit-hero', name: 'Fahrenheit hero', patch: {
      design: 'hero', unit: 'F', showForecast: false, showStats: false } },
  ],
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    const design = ['classic', 'minimal', 'hero', 'forecast', 'split', 'hourly', 'dashboard'].includes(c.design) ? c.design : 'classic';
    const theme = c.theme ?? 'gradient-blue';
    root.className = `bb-slide bb-slide-weather bb-weather-design-${design} bb-theme-${theme}`;
    // textColor is an optional brand override. Setting --bb-st-fg here
    // re-routes every text colour (the theme block, --w-ink in the dashboard,
    // and every dim/faint tint derived via color-mix) to the chosen value.
    // The marker class lets the dashboard CSS swap its amber-gradient temp
    // for a flat fill that honours the override (background-clip:text would
    // otherwise win over any inline color).
    applyColorOverrides(root, c);
    if (typeof c.textColor === 'string' && c.textColor.trim()) root.classList.add('bb-weather-textcolor-on');
    // Text-size multiplier — consumed by the weather cqmin clamps in
    // styles/slide-themes.css (calc(clamp(…) * var(--bb-weather-text-scale, 1)))
    // and by the inline attribution / alert-banner sizes below.
    root.style.setProperty('--bb-weather-text-scale', String((Number(c.textScale) || 100) / 100));

    // Pre-compute visibility flags. The render output omits sections entirely
    // when their toggle is off, keeps the DOM lean and lets CSS rely on
    // ":has(.bb-weather-hourly)" / sibling selectors where needed.
    const showHiLo     = c.showHiLo     !== false;
    const showStats    = c.showStats    !== false;
    const showForecast = c.showForecast !== false;
    const showSunrise  = c.showSunrise  === true;
    const showHourly   = c.showHourly   === true;
    const showWindVec  = c.showWindVector === true;
    const showPrecip   = c.showPrecip   !== false;
    const colorTemp    = c.colorTemperature !== false;
    const isDashboard  = design === 'dashboard';
    const tempUnitSym  = c.unit === 'F' ? '°F' : '°C';
    // Icon style: explicit svg/emoji override the design's default. 'auto' (or
    // legacy widgets with no setting) → dashboard uses SVG, others use emoji.
    const useSvgIcons  = c.iconSet === 'svg' || (c.iconSet !== 'emoji' && isDashboard);
    const showCity     = c.showCity !== false;
    const showTemp     = c.showTemp !== false;
    const showIcon     = c.showIcon !== false;
    const showDesc     = c.showDescription === true;
    const showAlerts   = c.showAlerts === true;
    const showUv       = c.showUv === true;
    // Audience-language formatting: '' / missing = device default. `||`
    // semantics (never `??`) so the empty string falls through to the device
    // locale. hour12 undefined keeps the locale's own clock convention.
    const locale = (typeof c.locale === 'string' && c.locale.trim()) ? c.locale.trim() : undefined;
    const hour12 = c.timeFormat === '12h' ? true : c.timeFormat === '24h' ? false : undefined;
    const timeOpts = { locale, hour12 };
    // Toggle a marker class so the dashboard's CSS can paint lo/hi with
    // vivid semantic colours (blue=cold, red=hot) when colour-coding is on.
    // Other designs continue to tint by actual temperature via inline styles.
    if (colorTemp) root.classList.add('bb-weather-colortemp-on');
    // Per-element opt-out classes, let users hide City / Temp / Icon to
    // build composite layouts by stacking multiple weather widgets.
    if (!showCity) root.classList.add('bb-weather-no-city');
    if (!showTemp) root.classList.add('bb-weather-no-temp');
    if (!showIcon) root.classList.add('bb-weather-no-icon');
    if (!showDesc) root.classList.add('bb-weather-no-desc');

    // Markup layout:
    //   .bb-weather-current     ← hero (icon + city/temp/desc)
    //   .bb-weather-stats       ← KPI cards (Wind / Humidity / Feels like [+ Sun])
    //   .bb-weather-sun         ← inline sunrise/sunset row (non-dashboard only)
    //   .bb-weather-section-head (hourly) ← dashboard-only label strip
    //   .bb-weather-hourly      ← hourly tiles
    //   .bb-weather-section-head (forecast) ← dashboard-only label strip
    //   .bb-weather-forecast    ← daily tiles
    //
    // Stat cards always emit icon + label + value + sub. Non-dashboard designs
    // hide icon + sub via CSS so they look like the original inline rows.
    // Section heads are only rendered for the dashboard design.
    const hourlyCap = Math.max(4, Math.min(24, Number(c.hourlyHours) || 12));
    const forecastCap = Math.max(1, Math.min(7, Number(c.forecastDays) || 7));

    // Icon style picks between the SVG library (custom gradient sun, cloud,
    // rain, storm, plus stat-label utility icons) and system emoji. The DOM
    // key stays the same (`.bb-weather-icon`), we swap text content for an
    // `<svg><use href="#i-sun"/></svg>` reference depending on choice.
    const iconHero = useSvgIcons
      ? `<svg class="bb-weather-icon-svg" aria-hidden="true"><use href="#i-sun"/></svg>`
      : '⏳';
    const statIcon = (id, color) => useSvgIcons
      ? `<svg class="bb-weather-icon-svg"${color ? ` style="color:${color}"` : ''} aria-hidden="true"><use href="#${id}"/></svg>`
      : null;
    root.innerHTML = `
      ${useSvgIcons ? WEATHER_SVG_DEFS : ''}
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      ${showAlerts ? `<div class="bb-weather-alert" data-field="showAlerts accentColor textScale" role="status" style="display:none;grid-column:1 / -1;align-items:center;justify-content:center;gap:.5em;font-size:calc(clamp(13px, 2.4cqmin, 28px) * var(--bb-weather-text-scale, 1));font-weight:600;line-height:1.3;padding:.35em .9em;border:2px solid var(--bb-st-accent, #f5a85a);border-radius:.5em;background:color-mix(in srgb, var(--bb-st-accent, #f5a85a) 16%, transparent);"></div>` : ''}
      <div class="bb-weather-current">
        <div class="bb-weather-icon" data-field="showIcon iconSet">${iconHero}</div>
        <div class="bb-weather-meta">
          <div class="bb-weather-city" data-field="showCity location textScale">${escapeHtml(c.location?.name ?? 'Munich')}</div>
          <div class="bb-weather-temp" data-field="showTemp unit colorTemperature textScale">—°</div>
          <div class="bb-weather-desc" data-field="showDescription locale textScale">Loading…</div>
          ${showHiLo ? `<div class="bb-weather-hilo" data-field="showHiLo unit colorTemperature" hidden>
            <span class="bb-weather-hi">H —°</span>
            <span class="bb-weather-lo">L —°</span>
          </div>` : ''}
        </div>
      </div>
      ${showStats ? `<div class="bb-weather-stats">
        <div class="bb-stat-card bb-stat-card-wind" data-field="showStats windUnit showWindVector">
          <span class="bb-stat-icon" aria-hidden="true">${statIcon('i-wind') ?? '💨'}</span>
          <span class="bb-stat-label">Wind</span>
          <b class="bb-stat-wind">—</b>
          <span class="bb-stat-sub bb-stat-wind-sub"></span>
        </div>
        <div class="bb-stat-card bb-stat-card-hum" data-field="showStats">
          <span class="bb-stat-icon" aria-hidden="true">${statIcon('i-drop', 'var(--bb-st-accent, #79b6ff)') ?? '💧'}</span>
          <span class="bb-stat-label">Humidity</span>
          <b class="bb-stat-hum">—</b>
          <span class="bb-stat-sub bb-stat-hum-sub"></span>
        </div>
        <div class="bb-stat-card bb-stat-card-feels" data-field="showStats unit">
          <span class="bb-stat-icon" aria-hidden="true">${statIcon('i-thermo') ?? '🌡️'}</span>
          <span class="bb-stat-label">Feels like</span>
          <b class="bb-stat-feels">—</b>
          <span class="bb-stat-sub bb-stat-feels-sub"></span>
        </div>
        ${showUv ? `<div class="bb-stat-card bb-stat-card-uv" data-field="showUv showStats">
          <span class="bb-stat-icon" aria-hidden="true">${statIcon('i-sun-small') ?? '🔆'}</span>
          <span class="bb-stat-label">UV</span>
          <b class="bb-stat-uv">—</b>
          <span class="bb-stat-sub bb-stat-uv-sub"></span>
        </div>` : ''}
        ${isDashboard && showSunrise ? `<div class="bb-stat-card bb-stat-card-sun" data-field="showSunrise design timeFormat locale">
          <span class="bb-stat-icon" aria-hidden="true">${statIcon('i-sunrise') ?? '🌅'}</span>
          <span class="bb-stat-label">Sun</span>
          <b class="bb-stat-sun-times">—:— · —:—</b>
          <span class="bb-stat-sub bb-stat-sun-sub"></span>
        </div>` : ''}
      </div>` : ''}
      ${showSunrise && !isDashboard ? `<div class="bb-weather-sun" data-field="showSunrise timeFormat locale" hidden>
        <span class="bb-weather-sunrise"><span aria-hidden="true">🌅</span> <b>—:—</b></span>
        <span class="bb-weather-sunset"><span aria-hidden="true">🌇</span> <b>—:—</b></span>
      </div>` : ''}
      ${showHourly ? `${isDashboard ? `<div class="bb-weather-section-head" data-field="showHourly hourlyHours design">
        <span class="bb-weather-section-title">Hourly forecast · Next ${hourlyCap} hours</span>
        <span class="bb-weather-section-meta bb-weather-updated"></span>
      </div>` : ''}<div class="bb-weather-hourly" data-field="showHourly hourlyHours unit iconSet timeFormat locale showPrecip colorTemperature" hidden></div>` : ''}
      ${showForecast ? `${isDashboard ? `<div class="bb-weather-section-head" data-field="showForecast forecastDays design location">
        <span class="bb-weather-section-title">${forecastCap}-day forecast</span>
        <span class="bb-weather-section-meta bb-weather-coords"></span>
      </div>` : ''}<div class="bb-weather-forecast" data-field="showForecast forecastDays unit iconSet showPrecip colorTemperature locale"></div>` : ''}
      <div class="bb-weather-attribution" data-field="textScale" style="font-size:calc(clamp(10px, 1.4cqmin, 18px) * var(--bb-weather-text-scale, 1));line-height:1.4;opacity:.55;margin-top:6px;text-align:center;">
        Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">Open-Meteo.com</a>
      </div>
    `;
    container.appendChild(root);

    if (ctx?.thumbnail) {
      // Fake "looks alive" preview without burning Open-Meteo calls per card.
      root.querySelector('.bb-weather-icon').textContent = '⛅';
      const tempEl = root.querySelector('.bb-weather-temp');
      tempEl.textContent = '18°';
      if (colorTemp) tempEl.style.color = tempColor(18) ?? '';
      root.querySelector('.bb-weather-desc').textContent = 'Partly cloudy';
      return composeDispose(() => root.remove());
    }

    // Offline / provided mode: the Studio pre-fetched the forecast and it lives in
    // a data slot, injected here as content._offline via a slot binding (set at
    // publish). The display reads that — no live call, no API key.
    const stored = isStored(c);
    if (stored && c._offline?.data === undefined) {
      // Stored mode but nothing provisioned yet (editor preview before the first
      // "Refresh data") — neutral placeholder, not an error.
      root.querySelector('.bb-weather-desc').textContent = 'Provided offline — appears after “Refresh data”.';
      return composeDispose(() => root.remove());
    }

    const ctrl = childSignal(ctx?.signal);
    // Named loader (not an anonymous IIFE) so live mode can re-poll it on a
    // timer. Repainting is idempotent: every section fills its elements by
    // selector, so a second pass simply overwrites the previous values.
    async function loadAndPaint() {
      try {
        const loc = c.location ?? {};
        // windUnit is read later (stats/hourly rendering) regardless of mode, so
        // derive it up front in both the live and offline paths.
        const windUnit = ['kmh', 'mph', 'ms'].includes(c.windUnit) ? c.windUnit : 'kmh';
        let w, fetchedAt;
        if (stored) {
          // Read the pre-fetched payload; no network, no key. fetchedAt comes from
          // the slot's ISO stamp (when the Studio last refreshed).
          w = c._offline.data;
          const ts = Date.parse(c._offline.fetchedAt);
          fetchedAt = Number.isFinite(ts) ? ts : Date.now();
        } else {
          if (!Number.isFinite(+loc.lat) || !Number.isFinite(+loc.lng)) throw new Error('No location set');
          const unit = c.unit === 'F' ? 'fahrenheit' : 'celsius';

          // Build the API URL: every section the user enabled adds its own
          // params. Keeping the request lean when toggles are off avoids
          // surprising Open-Meteo with kitchen-sink calls for users who just
          // want the current temperature.
          const currentParams = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'weather_code', 'apparent_temperature'];
          if (showWindVec || showStats) currentParams.push('wind_direction_10m');
          if (showUv && showStats)      currentParams.push('uv_index');
          const dailyParams = [];
          if (showForecast || showHiLo) dailyParams.push('temperature_2m_max', 'temperature_2m_min', 'weather_code');
          if (showPrecip)               dailyParams.push('precipitation_probability_max');
          if (showSunrise)              dailyParams.push('sunrise', 'sunset');
          const hourlyParams = [];
          if (showHourly) hourlyParams.push('temperature_2m', 'weather_code', 'precipitation_probability');
          // The alert banner scans the upcoming hours for severe codes even
          // when the hourly strip itself is off — request just the codes then.
          else if (showAlerts) hourlyParams.push('weather_code');

          const qs = new URLSearchParams({
            latitude:  String(loc.lat),
            longitude: String(loc.lng),
            current:   currentParams.join(','),
            temperature_unit: unit,
            wind_speed_unit:  windUnit,
            timezone:  'auto',
          });
          if (dailyParams.length)  qs.set('daily',  dailyParams.join(','));
          if (hourlyParams.length) qs.set('hourly', hourlyParams.join(','));

          // Free public endpoint is non-commercial only; a configured key routes
          // to the paid customer endpoint (different host, `apikey` param). See
          // https://open-meteo.com/en/terms.
          const apiKey = typeof c.apiKey === 'string' ? c.apiKey.trim() : '';
          const host = apiKey ? 'https://customer-api.open-meteo.com' : 'https://api.open-meteo.com';
          if (apiKey) qs.set('apikey', apiKey);

          ({ data: w, fetchedAt } = await fetchWeather(`${host}/v1/forecast?${qs.toString()}`));
        }
        if (ctrl.signal.aborted) return;

        const cur = w.current ?? {};
        const code = cur.weather_code ?? 0;
        const [icon, desc] = WMO[code] ?? ['🌍', 'Weather'];
        const iconHost = root.querySelector('.bb-weather-icon');
        if (useSvgIcons) {
          iconHost.innerHTML = `<svg class="bb-weather-icon-svg" aria-hidden="true"><use href="#${wmoToIconId(code, { small: false })}"/></svg>`;
        } else {
          iconHost.textContent = icon;
        }
        const tempVal = cur.temperature_2m;
        const tempEl = root.querySelector('.bb-weather-temp');
        // Bare degree symbol (no C/F suffix) matches Apple/Google Weather and
        // is consistent with hi/lo, feels-like, forecast, and hourly temps
        // which never carried a suffix. Unit is controlled via the inspector
        // picker, readers know which they picked.
        tempEl.textContent = Math.round(tempVal ?? 0) + '°';
        // When colorTemperature is on, paint the current temp with a per-value
        // colour (cold-blue → cream → amber → hot-red). Dashboard's default
        // amber-gradient is dropped via the .bb-weather-colortemp-on class on
        // the root, the CSS in slide-themes.css turns off background-clip:text
        // when that class is present, so this inline colour wins.
        if (colorTemp) tempEl.style.color = tempColor(tempVal) ?? '';
        root.querySelector('.bb-weather-desc').textContent = desc;

        // Severe-weather banner: current code OR any severe code in the next
        // ~6 hours lights it up — independent of showDescription, safety
        // information should not depend on a cosmetic toggle. Accent border +
        // tint so it survives light themes (no hardcoded white-on-dark).
        if (showAlerts) {
          const alertEl = root.querySelector('.bb-weather-alert');
          if (alertEl) {
            let severe = isSevereWmo(code) ? code : null;
            if (severe == null && Array.isArray(w.hourly?.time) && Array.isArray(w.hourly?.weather_code)) {
              // Same "first hour at/after now" heuristic as the hourly strip.
              const nowMs = Date.now();
              let si = 0;
              for (let i = 0; i < w.hourly.time.length; i++) {
                if (new Date(w.hourly.time[i]).getTime() >= nowMs - 30 * 60 * 1000) { si = i; break; }
              }
              for (let i = si; i < Math.min(si + 6, w.hourly.time.length); i++) {
                if (isSevereWmo(w.hourly.weather_code[i])) { severe = w.hourly.weather_code[i]; break; }
              }
            }
            if (severe != null) {
              const [aIcon, aDesc] = WMO[severe] ?? ['⚠️', 'Severe weather'];
              const aIconHtml = useSvgIcons
                ? `<svg class="bb-weather-icon-svg" aria-hidden="true"><use href="#${wmoToIconId(severe, { small: true })}"/></svg>`
                : aIcon;
              alertEl.innerHTML = `<span aria-hidden="true">${aIconHtml}</span><span>${escapeHtml(aDesc)}</span>`;
              alertEl.style.display = 'flex';
            } else {
              // A later poll can clear a previously shown banner.
              alertEl.style.display = 'none';
              alertEl.innerHTML = '';
            }
          }
        }

        // Hi/Lo: comes from today's row in the daily payload (always index 0).
        // Dashboard uses universal ↑/↓ arrows (international); other designs
        // keep the H/L letter shorthand. Dashboard's lo/hi colours come from
        // the .bb-weather-colortemp-on CSS class (semantic blue/red); other
        // designs tint by actual value via inline tempColor().
        if (showHiLo && w.daily && w.daily.temperature_2m_max?.[0] != null) {
          const hi = w.daily.temperature_2m_max[0];
          const lo = w.daily.temperature_2m_min[0];
          const hiloEl = root.querySelector('.bb-weather-hilo');
          if (hiloEl) {
            const hiEl = hiloEl.querySelector('.bb-weather-hi');
            const loEl = hiloEl.querySelector('.bb-weather-lo');
            const hiPrefix = isDashboard ? '↑ ' : 'H ';
            const loPrefix = isDashboard ? '↓ ' : 'L ';
            hiEl.textContent = hiPrefix + Math.round(hi) + '°';
            loEl.textContent = loPrefix + Math.round(lo) + '°';
            if (colorTemp && !isDashboard) {
              hiEl.style.color = tempColor(hi) ?? '';
              loEl.style.color = tempColor(lo) ?? '';
            }
            hiloEl.hidden = false;
          }
        }

        // Stats: wind (with optional direction arrow) + humidity + feels-like.
        // Dashboard reads .bb-stat-*-sub elements for subtitles ("Northwest · Light",
        // "Dry", "As actual"); other designs hide subs via CSS.
        if (showStats) {
          const windLabel = { kmh: 'km/h', mph: 'mph', ms: 'm/s' }[windUnit] || 'km/h';
          const windSpeed = +cur.wind_speed_10m;
          const windEl = root.querySelector('.bb-stat-wind');
          const windText = (Number.isFinite(windSpeed) ? windSpeed.toFixed(1) : '—')
            + ` <i class="bb-stat-unit">${escapeHtml(windLabel)}</i>`;
          // Dashboard: arrow is promoted to the stat-card icon position (bigger,
          // prominent), so the value is just the speed. Other designs keep
          // the small inline arrow next to the value.
          const hasDir = showWindVec && Number.isFinite(+cur.wind_direction_10m);
          windEl.innerHTML = (hasDir && !isDashboard)
            ? `${windArrowSvg(cur.wind_direction_10m)}<span>${windText}</span>`
            : windText;
          if (isDashboard && hasDir) {
            const windIconHost = root.querySelector('.bb-stat-card-wind .bb-stat-icon');
            if (windIconHost) windIconHost.innerHTML = windArrowSvg(cur.wind_direction_10m);
          }
          const compass = compassName(cur.wind_direction_10m);
          const speedDesc = windDesc(windSpeed, windUnit);
          const windSubEl = root.querySelector('.bb-stat-wind-sub');
          if (windSubEl) windSubEl.textContent = [compass, speedDesc].filter(Boolean).join(' · ');

          const hum = +cur.relative_humidity_2m;
          root.querySelector('.bb-stat-hum').innerHTML =
            (Number.isFinite(hum) ? Math.round(hum) : '—') + ` <i class="bb-stat-unit">%</i>`;
          const humSubEl = root.querySelector('.bb-stat-hum-sub');
          if (humSubEl) humSubEl.textContent = humidityDesc(hum);

          const feels = +cur.apparent_temperature;
          const actual = +cur.temperature_2m;
          root.querySelector('.bb-stat-feels').innerHTML =
            (Number.isFinite(feels) ? Math.round(feels) : '—') + ` <i class="bb-stat-unit">${escapeHtml(tempUnitSym)}</i>`;
          const feelsSubEl = root.querySelector('.bb-stat-feels-sub');
          if (feelsSubEl) feelsSubEl.textContent = feelsLikeDesc(actual, feels);

          // UV index card (opt-in 4th/5th card). Live mode reads the current
          // uv_index; stored payloads provisioned before the field existed
          // fall back to today's daily max so older slots keep working.
          if (showUv) {
            const uvEl = root.querySelector('.bb-stat-uv');
            if (uvEl) {
              const uvRaw = Number.isFinite(+cur.uv_index) ? +cur.uv_index : +(w.daily?.uv_index_max?.[0]);
              uvEl.textContent = Number.isFinite(uvRaw) ? String(Math.round(uvRaw)) : '—';
              const uvSubEl = root.querySelector('.bb-stat-uv-sub');
              if (uvSubEl) uvSubEl.textContent = uvDesc(uvRaw);
            }
          }
        }

        // Sunrise / Sunset, today's row only (index 0).
        // Dashboard renders these inside a 4th stat card with a day-length
        // subtitle; other designs render the inline .bb-weather-sun strip.
        if (showSunrise && w.daily?.sunrise?.[0]) {
          const sunriseStr = formatTime(w.daily.sunrise[0], timeOpts);
          const sunsetStr  = formatTime(w.daily.sunset?.[0], timeOpts);
          const dayLen     = dayLength(w.daily.sunrise[0], w.daily.sunset?.[0]);
          const sunCard = root.querySelector('.bb-stat-card-sun');
          if (sunCard) {
            sunCard.querySelector('.bb-stat-sun-times').textContent = `${sunriseStr} · ${sunsetStr}`;
            sunCard.querySelector('.bb-stat-sun-sub').textContent   = dayLen;
          }
          const sunEl = root.querySelector('.bb-weather-sun');
          if (sunEl) {
            sunEl.querySelector('.bb-weather-sunrise b').textContent = sunriseStr;
            sunEl.querySelector('.bb-weather-sunset b').textContent  = sunsetStr;
            sunEl.hidden = false;
          }
        }

        // Dashboard section-head meta: "Updated 2 min ago" + coords.
        // Cheap to compute even when not in dashboard mode (no DOM = no-op).
        if (isDashboard) {
          const upEl = root.querySelector('.bb-weather-updated');
          if (upEl) upEl.textContent = relativeAge(fetchedAt);
          const coordsEl = root.querySelector('.bb-weather-coords');
          if (coordsEl && Number.isFinite(+loc.lat) && Number.isFinite(+loc.lng)) {
            const hemiLat = loc.lat >= 0 ? 'N' : 'S';
            const hemiLng = loc.lng >= 0 ? 'E' : 'W';
            coordsEl.textContent = `${loc.name ?? ''}${loc.name ? ' · ' : ''}`
              + `${Math.abs(loc.lat).toFixed(2)}° ${hemiLat}, ${Math.abs(loc.lng).toFixed(2)}° ${hemiLng}`;
          }
        }

        // Hourly strip, show the next N hours starting from the current hour.
        if (showHourly && w.hourly?.time?.length) {
          const cap = Math.max(4, Math.min(24, Number(c.hourlyHours) || 12));
          const now = Date.now();
          // Find the first hour index at or after "now" (Open-Meteo returns the full day)
          let startIdx = 0;
          for (let i = 0; i < w.hourly.time.length; i++) {
            if (new Date(w.hourly.time[i]).getTime() >= now - 30 * 60 * 1000) { startIdx = i; break; }
          }
          const hours = Math.min(cap, w.hourly.time.length - startIdx);
          const hostEl = root.querySelector('.bb-weather-hourly');
          if (hostEl) {
            let html = '';
            for (let i = 0; i < hours; i++) {
              const idx = startIdx + i;
              const t = w.hourly.temperature_2m[idx];
              const wcode = w.hourly.weather_code[idx];
              const [hicon] = WMO[wcode] ?? ['🌍'];
              const precip = w.hourly.precipitation_probability?.[idx] ?? 0;
              // Dashboard keeps hourly temps plain (matches reference);
              // other designs tint each hour by its actual temperature.
              const color = (colorTemp && !isDashboard) ? tempColor(t) : null;
              // First tile keeps its actual time, the amber accent border
              // already signals "this is now" without needing a localized
              // "Now" / "Jetzt" word. International-friendly.
              const timeLabel = formatHour(w.hourly.time[idx], timeOpts);
              const iconHtml = useSvgIcons
                ? `<svg class="bb-weather-icon-svg"><use href="#${wmoToIconId(wcode, { small: true })}"/></svg>`
                : hicon;
              // Unified precip slot: when showPrecip is on we always render the
              // element (em-dash placeholder when 0%) so tile heights stay
              // consistent across the strip. When the toggle is off we render
              // nothing so non-precip-relevant designs stay tight.
              const precipHtml = !showPrecip ? ''
                : (precip > 0
                    ? (useSvgIcons
                        ? `<span class="bb-hour-precip"><svg class="bb-weather-icon-svg"><use href="#i-drop"/></svg>${precip}%</span>`
                        : `<span class="bb-hour-precip" title="${precip}% precipitation chance">💧 ${precip}%</span>`)
                    : `<span class="bb-hour-precip bb-weather-precip-empty">—</span>`);
              html += `<div class="bb-weather-hour${i === 0 && isDashboard ? ' bb-weather-hour-now' : ''}">
                <span class="bb-hour-time">${escapeHtml(timeLabel)}</span>
                <span class="bb-hour-icon">${iconHtml}</span>
                <span class="bb-hour-temp"${color ? ` style="color:${color}"` : ''}>${Math.round(t)}°</span>
                ${precipHtml}
              </div>`;
            }
            hostEl.innerHTML = html;
            hostEl.hidden = false;
            // Dashboard distributes all configured tiles equally across the
            // panel width (`repeat(N, 1fr)`) so 4 or 24 hours both fit cleanly
            // without horizontal overflow. Base designs keep their
            // auto-column scroll behaviour.
            //
            // Critically we set `overflow: visible` here so the panel can grow
            // tall enough to fit the time + icon + temp + precip stack. Earlier
            // we set `overflow: hidden` to silence horizontal scroll, but with
            // explicit grid-template-columns we already prevent horizontal
            // overflow, `hidden` was clipping the temp row out the bottom.
            if (isDashboard) {
              hostEl.style.gridTemplateColumns = `repeat(${hours}, minmax(0, 1fr))`;
              hostEl.style.gridAutoFlow = 'row';
              hostEl.style.overflow = 'visible';
            }
          }
        }

        // Daily forecast, premium tile with day-name, icon, min/max temps,
        // colored range bar, and optional precipitation chance.
        if (showForecast && w.daily?.time?.length) {
          const fc = root.querySelector('.bb-weather-forecast');
          fc.innerHTML = '';
          const cap = Math.max(1, Math.min(7, Number(c.forecastDays) || 7));
          const days = Math.min(cap, w.daily.time.length);
          // Get overall min/max across the visible window so the bar position
          // is relative (today's swing relative to the week's swing).
          let wMin = Infinity, wMax = -Infinity;
          for (let i = 0; i < days; i++) {
            const lo = w.daily.temperature_2m_min[i];
            const hi = w.daily.temperature_2m_max[i];
            if (Number.isFinite(lo) && lo < wMin) wMin = lo;
            if (Number.isFinite(hi) && hi > wMax) wMax = hi;
          }
          const wRange = Math.max(1, wMax - wMin);
          for (let i = 0; i < days; i++) {
            const d = new Date(w.daily.time[i]);
            const dcode = w.daily.weather_code[i];
            const [ic] = WMO[dcode] ?? ['🌍'];
            const lo = w.daily.temperature_2m_min[i];
            const hi = w.daily.temperature_2m_max[i];
            const precip = showPrecip ? (w.daily.precipitation_probability_max?.[i] ?? 0) : 0;
            // Range bar: positioned by (lo, hi) within the week's overall (wMin, wMax)
            const leftPct = ((lo - wMin) / wRange) * 100;
            const widthPct = ((hi - lo) / wRange) * 100;
            // Dashboard paints lo/hi via .bb-weather-colortemp-on CSS class
            // (semantic blue/red), skipping the per-value inline tempColor()
            // which produces washed-out cream for 12-22°C and rarely shows
            // visible difference toggling on/off.
            const loColor = (colorTemp && !isDashboard) ? tempColor(lo) : null;
            const hiColor = (colorTemp && !isDashboard) ? tempColor(hi) : null;
            // First tile keeps its weekday shorthand (locale-aware via
            // toLocaleDateString), the amber accent already signals
            // "this is today" without needing a localized "Today" / "Heute"
            // word. Keeps the dashboard international-friendly.
            const isToday = i === 0;
            // Weekday/date follow the configured audience language (locale
            // field), falling back to the device locale when unset.
            const dayLabel = d.toLocaleDateString(locale, { weekday: 'short' });
            const dateLabel = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
            const iconHtml = useSvgIcons
              ? `<svg class="bb-weather-icon-svg"><use href="#${wmoToIconId(dcode, { small: true })}"/></svg>`
              : ic;
            // Unified precip slot, when showPrecip is on, always emit the
            // element (em-dash placeholder for 0%) so tile heights stay
            // consistent across the strip. When the toggle is off, emit
            // nothing so tiles stay tight without a hanging dash.
            const precipHtml = !showPrecip ? ''
              : (precip > 0
                  ? (useSvgIcons
                      ? `<span class="bb-forecast-precip"><svg class="bb-weather-icon-svg"><use href="#i-drop"/></svg>${precip}%</span>`
                      : `<span class="bb-forecast-precip" title="${precip}% precipitation chance">💧 ${precip}%</span>`)
                  : `<span class="bb-forecast-precip bb-weather-precip-empty">—</span>`);
            fc.insertAdjacentHTML('beforeend', `
              <div class="bb-forecast-day${isToday && isDashboard ? ' bb-forecast-day-today' : ''}">
                <span>${escapeHtml(dayLabel)}<i class="bb-forecast-date" aria-hidden="true">${escapeHtml(dateLabel)}</i></span>
                <span class="bb-forecast-icon">${iconHtml}</span>
                ${precipHtml}
                <span class="bb-forecast-temps">
                  <span class="bb-forecast-lo"${loColor ? ` style="color:${loColor}"` : ''}>${Math.round(lo)}°</span>
                  <span class="bb-forecast-bar" style="--bar-left:${leftPct.toFixed(1)}%;--bar-width:${widthPct.toFixed(1)}%;--bar-gradient:${tempBarGradient(lo, hi)};"></span>
                  <span class="bb-forecast-hi"${hiColor ? ` style="color:${hiColor}"` : ''}>${Math.round(hi)}°</span>
                </span>
              </div>
            `);
          }
        }
      } catch (e) {
        if (e.name !== 'AbortError' && !ctx?.onError?.()) {
          root.querySelector('.bb-weather-desc').textContent = 'Unavailable';
          root.querySelector('.bb-weather-icon').textContent = '🌐';
        }
      }
    }
    loadAndPaint();

    // Live-mode auto-refresh so permanently-mounted widgets (layout regions,
    // single-slide playlists) don't show stale data forever. 0 keeps the old
    // fetch-once behaviour; positive values are clamped to the 5-second player
    // floor (the 5-minute response cache rate-limits actual network calls
    // anyway). Offline mode reads a pre-fetched slot, nothing to poll.
    const refreshSec = stored ? 0 : Math.max(0, Number(c.refreshSec) || 0);
    const timer = refreshSec > 0 ? setInterval(loadAndPaint, Math.max(5000, refreshSec * 1000)) : 0;

    return composeDispose(() => { if (timer) clearInterval(timer); ctrl.abort(); root.remove(); });
  },
});
