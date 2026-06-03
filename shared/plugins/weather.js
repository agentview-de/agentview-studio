import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose, childSignal } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { isStored, DATAMODE_OPTIONS } from '../offline-data.js';
import { WEATHER_SVG_DEFS, wmoToIconId } from '../data/weather-svg-icons.js';
import {
  WMO, tempColor, tempBarGradient, windArrowSvg, formatTime, formatHour,
  compassName, windDesc, humidityDesc, feelsLikeDesc, dayLength, designSupports, relativeAge,
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
    current:   'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature,wind_direction_10m',
    daily:     'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset',
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
  schemaVersion: 5,
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
    // Visual treatment
    colorTemperature: true,
    design: 'classic',
    theme: 'gradient-blue',
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
      // ── Source ────────────────────────────────────────────────────────────
      { type: 'section', label: 'Source' },
      { key: 'dataMode', type: 'select', label: 'Data source', default: 'live', options: DATAMODE_OPTIONS,
        help: 'Offline: the Studio fetches the forecast on “Refresh data” (the API key is used here, never on screen) and stores it; the display reads that — no live call, works without internet on the screen.' },
      { key: 'location', type: 'place', label: 'Location' },
      { type: 'row', children: [
        { key: 'unit',     type: 'select', label: 'Temp', options: ['C','F'] },
        { key: 'windUnit', type: 'select', label: 'Wind', options: [
          { value: 'kmh', label: 'km/h' },
          { value: 'mph', label: 'mph' },
          { value: 'ms',  label: 'm/s' },
        ] },
      ] },
      { key: 'apiKey', type: 'text', label: 'Open-Meteo API key (optional)',
        placeholder: 'business use only',
        help: 'Open-Meteo’s free tier is non-commercial only. Business users should add their own Open-Meteo API key, it routes requests to the paid customer-api.open-meteo.com endpoint.' },

      // ── Data the customer wants on this widget ────────────────────────────
      // Each toggle is gated by `designSupports(design, slot)` so the inspector
      // only shows options whose output the current design will actually paint.
      // Picking "Minimal" hides everything except the temp/city toggles; "Hero"
      // hides forecast + hourly + precip; "Split" hides hourly + sunrise.
      //
      // City/Temp/Icon are always available, they're the visual primitives
      // and the user opts out to build composite layouts (stack two weather
      // widgets, one showing just the temp, another just the forecast strip).
      { type: 'section', label: 'Show on this widget' },
      { type: 'row', children: [
        { key: 'showCity', type: 'toggle', label: 'City' },
        { key: 'showTemp', type: 'toggle', label: 'Temperature' },
      ] },
      { type: 'row', children: [
        { key: 'showIcon', type: 'toggle', label: 'Weather icon' },
        { key: 'showDescription', type: 'toggle', label: 'Condition text',
          help: 'English WMO label ("Clear sky", "Mainly clear"…). Off by default to keep widget international.' },
      ] },
      { type: 'row', children: [
        { key: 'showHiLo',       type: 'toggle', label: 'High / Low today',
          showIf: c => designSupports(c.design, 'hilo') },
        { key: 'showStats',      type: 'toggle', label: 'Wind / Humidity / Feels-like',
          showIf: c => designSupports(c.design, 'stats') },
      ] },
      { key: 'showWindVector', type: 'toggle', label: 'Wind direction arrow',
        showIf: c => designSupports(c.design, 'stats') && c.showStats !== false,
        help: 'Adds a small compass arrow next to the wind speed.' },
      { type: 'row', children: [
        { key: 'showPrecip',     type: 'toggle', label: 'Precipitation chance',
          showIf: c => designSupports(c.design, 'precip') },
        { key: 'showSunrise',    type: 'toggle', label: 'Sunrise / Sunset',
          showIf: c => designSupports(c.design, 'sunrise') },
      ] },
      { key: 'showForecast', type: 'toggle', label: 'Daily forecast',
        showIf: c => designSupports(c.design, 'forecast') },
      { key: 'forecastDays', type: 'number', label: 'Forecast days', min: 1, max: 7, step: 1, slider: true,
        showIf: c => designSupports(c.design, 'forecast') && c.showForecast !== false,
        help: 'Portrait screens often want 3–5, landscape can take all 7.' },
      { key: 'showHourly', type: 'toggle', label: 'Hourly strip (next N hours)',
        showIf: c => designSupports(c.design, 'hourly') },
      { key: 'hourlyHours', type: 'number', label: 'Hours to show', min: 4, max: 24, step: 1, slider: true,
        showIf: c => designSupports(c.design, 'hourly') && c.showHourly === true },

      // ── Visual treatment ──────────────────────────────────────────────────
      { type: 'section', label: 'Visual' },
      { key: 'colorTemperature', type: 'toggle', label: 'Colour-code temperature',
        help: 'Tints the current temperature and forecast hi/lo by °C, blue for cold, amber for warm, red for hot.' },
      { key: 'iconSet', type: 'select', label: 'Icon style', options: [
        { value: 'auto',  label: 'Auto (Dashboard = SVG, others = Emoji)' },
        { value: 'svg',   label: 'SVG, custom illustrated icons' },
        { value: 'emoji', label: 'Emoji, system color icons (☀️ ⛅ 🌧️)' },
      ] },
      { key: 'design', type: 'select', label: 'Design', options: [
        { value: 'classic',   label: 'Classic, icon · temp · forecast strip' },
        { value: 'minimal',   label: 'Minimal, temp + city only' },
        { value: 'hero',      label: 'Hero, huge temperature' },
        { value: 'forecast',  label: 'Forecast, multi-day tiles dominate' },
        { value: 'split',     label: 'Split, current left, forecast right' },
        { value: 'hourly',    label: 'Hourly, next 12–24 hours strip' },
        { value: 'dashboard', label: 'Dashboard, premium full-canvas, all data' },
      ] },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
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
      <div class="bb-weather-current">
        <div class="bb-weather-icon">${iconHero}</div>
        <div class="bb-weather-meta">
          <div class="bb-weather-city">${escapeHtml(c.location?.name ?? 'Munich')}</div>
          <div class="bb-weather-temp">—°</div>
          <div class="bb-weather-desc">Loading…</div>
          ${showHiLo ? `<div class="bb-weather-hilo" hidden>
            <span class="bb-weather-hi">H —°</span>
            <span class="bb-weather-lo">L —°</span>
          </div>` : ''}
        </div>
      </div>
      ${showStats ? `<div class="bb-weather-stats">
        <div class="bb-stat-card bb-stat-card-wind">
          <span class="bb-stat-icon" aria-hidden="true">${statIcon('i-wind') ?? '💨'}</span>
          <span class="bb-stat-label">Wind</span>
          <b class="bb-stat-wind">—</b>
          <span class="bb-stat-sub bb-stat-wind-sub"></span>
        </div>
        <div class="bb-stat-card bb-stat-card-hum">
          <span class="bb-stat-icon" aria-hidden="true">${statIcon('i-drop', '#79b6ff') ?? '💧'}</span>
          <span class="bb-stat-label">Humidity</span>
          <b class="bb-stat-hum">—</b>
          <span class="bb-stat-sub bb-stat-hum-sub"></span>
        </div>
        <div class="bb-stat-card bb-stat-card-feels">
          <span class="bb-stat-icon" aria-hidden="true">${statIcon('i-thermo') ?? '🌡️'}</span>
          <span class="bb-stat-label">Feels like</span>
          <b class="bb-stat-feels">—</b>
          <span class="bb-stat-sub bb-stat-feels-sub"></span>
        </div>
        ${isDashboard && showSunrise ? `<div class="bb-stat-card bb-stat-card-sun">
          <span class="bb-stat-icon" aria-hidden="true">${statIcon('i-sunrise') ?? '🌅'}</span>
          <span class="bb-stat-label">Sun</span>
          <b class="bb-stat-sun-times">—:— · —:—</b>
          <span class="bb-stat-sub bb-stat-sun-sub"></span>
        </div>` : ''}
      </div>` : ''}
      ${showSunrise && !isDashboard ? `<div class="bb-weather-sun" hidden>
        <span class="bb-weather-sunrise"><span aria-hidden="true">🌅</span> <b>—:—</b></span>
        <span class="bb-weather-sunset"><span aria-hidden="true">🌇</span> <b>—:—</b></span>
      </div>` : ''}
      ${showHourly ? `${isDashboard ? `<div class="bb-weather-section-head">
        <span class="bb-weather-section-title">Hourly forecast · Next ${hourlyCap} hours</span>
        <span class="bb-weather-section-meta bb-weather-updated"></span>
      </div>` : ''}<div class="bb-weather-hourly" hidden></div>` : ''}
      ${showForecast ? `${isDashboard ? `<div class="bb-weather-section-head">
        <span class="bb-weather-section-title">${forecastCap}-day forecast</span>
        <span class="bb-weather-section-meta bb-weather-coords"></span>
      </div>` : ''}<div class="bb-weather-forecast"></div>` : ''}
      <div class="bb-weather-attribution" style="font-size:clamp(10px, 1.4cqmin, 18px);line-height:1.4;opacity:.55;margin-top:6px;text-align:center;">
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
    (async () => {
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
          const dailyParams = [];
          if (showForecast || showHiLo) dailyParams.push('temperature_2m_max', 'temperature_2m_min', 'weather_code');
          if (showPrecip)               dailyParams.push('precipitation_probability_max');
          if (showSunrise)              dailyParams.push('sunrise', 'sunset');
          const hourlyParams = [];
          if (showHourly) hourlyParams.push('temperature_2m', 'weather_code', 'precipitation_probability');

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
        }

        // Sunrise / Sunset, today's row only (index 0).
        // Dashboard renders these inside a 4th stat card with a day-length
        // subtitle; other designs render the inline .bb-weather-sun strip.
        if (showSunrise && w.daily?.sunrise?.[0]) {
          const sunriseStr = formatTime(w.daily.sunrise[0]);
          const sunsetStr  = formatTime(w.daily.sunset?.[0]);
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
              const timeLabel = formatHour(w.hourly.time[idx]);
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
            const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
            const dateLabel = d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
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
    })();

    return composeDispose(() => { ctrl.abort(); root.remove(); });
  },
});
