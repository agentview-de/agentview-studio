// Pure formatting + derivation helpers for the weather widget. Extracted from
// weather.js so they can be unit-tested without mounting the DOM-heavy widget:
// the temperature colour ramp, the wind arrow SVG, the dashboard KPI subtitles
// (compass/wind/humidity/feels-like/day-length), per-design toggle gating, and
// the "updated N ago" freshness label. All side-effect-free.

// WMO weather-code → [emoji, description]. From the Open-Meteo WMO codes list.
export const WMO = {
  0: ['☀️', 'Clear sky'], 1: ['🌤️', 'Mainly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'], 48: ['🌫️', 'Rime fog'],
  51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Moderate drizzle'], 55: ['🌧️', 'Dense drizzle'],
  61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Moderate rain'], 65: ['🌧️', 'Heavy rain'],
  71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Moderate snow'], 75: ['❄️', 'Heavy snow'],
  77: ['❄️', 'Snow grains'],
  80: ['🌧️', 'Showers'], 81: ['🌧️', 'Heavy showers'], 82: ['⛈️', 'Violent showers'],
  85: ['🌨️', 'Snow showers'], 86: ['❄️', 'Heavy snow showers'],
  95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm + hail'], 99: ['⛈️', 'Severe thunderstorm'],
};

// Map a temperature in °C to a weather-app-style colour. Skips the green
// midrange (looks weird in weather UIs) and blends:
//   cold → blue   ·   mild → neutral cream   ·   warm → amber   ·   hot → red
// Returns an HSL string the caller assigns to `element.style.color`.
export function tempColor(t) {
  if (!Number.isFinite(t)) return null;
  const x = Math.max(-25, Math.min(45, t));
  // < 12°C: cool side, blue ramp 220→195 hue, sat 70→45, light 60→72
  if (x < 12) {
    const k = (x + 25) / 37; // 0..1
    const h = 220 - k * 15;
    const s = 70 - k * 25;
    const l = 60 + k * 12;
    return `hsl(${h.toFixed(1)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
  }
  // 12-22°C: neutral cream, barely visible tint so it sits next to the theme fg
  if (x < 22) return 'hsl(40, 12%, 88%)';
  // > 22°C: warm side, amber→red. hue 40 (amber) → 0 (red), sat climbs.
  const k = Math.min(1, (x - 22) / 18); // 22..40 → 0..1
  const h = 40 - k * 40;
  const s = 65 + k * 30;
  const l = 65 - k * 5;
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
}

// Build a horizontal gradient between two temperature colours, used inside
// each forecast tile's min-max range bar so the bar visually communicates the
// day's swing without the user having to read both numbers.
export function tempBarGradient(min, max) {
  const a = tempColor(min) ?? 'rgba(255,255,255,.4)';
  const b = tempColor(max) ?? 'rgba(255,255,255,.7)';
  return `linear-gradient(90deg, ${a}, ${b})`;
}

// Open-Meteo's `wind_direction_10m` is the bearing the wind is COMING FROM
// (0°=N, 90°=E, …). Render a small SVG arrow pointing in the direction the
// wind is going TOWARDS (rotate by deg + 180) so the visual matches the
// intuition "arrow flies along with the wind". 16x16 by default; the caller
// sizes it with CSS.
export function windArrowSvg(deg) {
  const angle = ((Number(deg) || 0) + 180) % 360;
  return `<svg class="bb-weather-wind-arrow" viewBox="0 0 16 16" style="transform:rotate(${angle.toFixed(0)}deg)" aria-hidden="true">
    <path d="M8 1 L12 11 L8 9 L4 11 Z" fill="currentColor"/>
  </svg>`;
}

// Time formatting. The optional second argument threads the widget's audience
// settings through: `locale` is a BCP-47 tag ('' / undefined = device default,
// `||` semantics so an empty string falls through) and `hour12` forces AM/PM
// (true) or 24h (false); undefined keeps the locale's own convention. The
// 1-arg form keeps behaving exactly as before (additive change, tests rely
// on the old signature).
export function formatTime(iso, opts) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const o = { hour: '2-digit', minute: '2-digit' };
  if (opts && typeof opts.hour12 === 'boolean') o.hour12 = opts.hour12;
  return d.toLocaleTimeString(opts?.locale || undefined, o);
}
export function formatHour(iso, opts) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const o = { hour: '2-digit', minute: '2-digit' };
  if (opts && typeof opts.hour12 === 'boolean') o.hour12 = opts.hour12;
  return d.toLocaleTimeString(opts?.locale || undefined, o);
}

// Severe-weather WMO codes (heavy rain/snow, violent showers, thunderstorms) —
// drives the opt-in alert banner so safety-relevant conditions surface even
// when the regular condition text is toggled off. Kept here (next to the WMO
// table) so the two lists can't drift apart unnoticed.
const SEVERE_WMO = new Set([65, 75, 82, 86, 95, 96, 99]);
export function isSevereWmo(code) {
  return SEVERE_WMO.has(Number(code));
}

// UV-index descriptor buckets (WHO scale). Subtitle for the opt-in UV stat
// card; same cheap-by-design contract as the other stat-sub helpers above.
export function uvDesc(uv) {
  const u = +uv;
  if (!Number.isFinite(u)) return '';
  if (u < 3) return 'Low';
  if (u < 6) return 'Moderate';
  if (u < 8) return 'High';
  if (u < 11) return 'Very high';
  return 'Extreme';
}

// ── Stat-subtitle helpers ──────────────────────────────────────────────────
// Used by the Dashboard design under each KPI card ("Northwest · Light",
// "Dry", "As actual", "Day: 15h 44min"). The base stats row (other designs)
// doesn't show these, they're CSS-hidden, so the helpers are cheap-by-design
// and safe to always compute.
export function compassName(deg) {
  if (!Number.isFinite(+deg)) return '';
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round((((+deg) % 360) / 22.5)) % 16;
  return names[(idx + 16) % 16];
}
// Convert wind speed (in the unit the user picked) to an approximate km/h
// value for the descriptor bucket. Buckets are loosely Beaufort but use the
// user-facing labels.
export function windDesc(speed, unit) {
  if (!Number.isFinite(+speed)) return '';
  const kmh = unit === 'mph' ? speed * 1.609 : unit === 'ms' ? speed * 3.6 : speed;
  if (kmh < 2) return 'Calm';
  if (kmh < 12) return 'Light';
  if (kmh < 20) return 'Moderate';
  if (kmh < 30) return 'Fresh';
  if (kmh < 50) return 'Strong';
  if (kmh < 75) return 'Gale';
  return 'Storm';
}
export function humidityDesc(pct) {
  const p = +pct;
  if (!Number.isFinite(p)) return '';
  if (p < 30) return 'Dry';
  if (p < 55) return 'Comfortable';
  if (p < 75) return 'Humid';
  return 'Very humid';
}
export function feelsLikeDesc(actual, feels) {
  const a = +actual, f = +feels;
  if (!Number.isFinite(a) || !Number.isFinite(f)) return '';
  const d = f - a;
  if (Math.abs(d) < 1.5) return 'As actual';
  return d > 0 ? `${Math.round(d)}° warmer` : `${Math.round(Math.abs(d))}° cooler`;
}
export function dayLength(sunriseIso, sunsetIso) {
  if (!sunriseIso || !sunsetIso) return '';
  const r = new Date(sunriseIso).getTime();
  const s = new Date(sunsetIso).getTime();
  if (!Number.isFinite(r) || !Number.isFinite(s) || s <= r) return '';
  const mins = Math.round((s - r) / 60000);
  return `Day: ${Math.floor(mins / 60)}h ${mins % 60}min`;
}

// Per-design toggle relevance, the schema hides any toggle that maps to content
// the current design would hide via CSS, so the inspector doesn't offer options
// that simply do nothing. Keys match the conceptual data slots rather than the
// toggle names so future renames don't drift.
const DESIGN_HIDDEN_TOGGLES = {
  classic:   new Set(),
  minimal:   new Set(['hilo', 'stats', 'precip', 'sunrise', 'forecast', 'hourly']),
  hero:      new Set(['precip', 'forecast', 'hourly']),
  forecast:  new Set(),
  split:     new Set(['sunrise', 'hourly']),
  hourly:    new Set(),
  dashboard: new Set(),
};
export function designSupports(design, slot) {
  const d = ['classic', 'minimal', 'hero', 'forecast', 'split', 'hourly', 'dashboard'].includes(design) ? design : 'classic';
  return !DESIGN_HIDDEN_TOGGLES[d].has(slot);
}

// "Updated 2 min ago", used in the dashboard's section-head meta to signal data
// freshness. Reads from the cache's fetchedAt timestamp, so a cache-hit will
// correctly show the original fetch time, not "just now".
export function relativeAge(ms) {
  if (!Number.isFinite(ms)) return '';
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (sec < 30) return 'Updated just now';
  if (sec < 60) return `Updated ${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `Updated ${min} min ago`;
  return 'Updated over an hour ago';
}
