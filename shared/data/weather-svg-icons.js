// SVG icon symbols for the weather widget's "Dashboard" design.
//
// Inlined as a single <svg> block of <defs> + <symbol>s injected into the
// dashboard root. Other weather designs continue to use emoji icons; this
// library is loaded only when needed (the dashboard branch in weather.js
// imports it). Keeping the icons in shared/data means they can be reused if
// future widgets (e.g. forecast cards in a different layout) want the same
// visual language.

// Maps Open-Meteo WMO weather codes to the appropriate symbol id.
// Six visual buckets cover every WMO code we care about:
//   sun · cloud-sun · cloud · fog · rain · snow · storm.
export function wmoToIconId(code, { small = false } = {}) {
  const sunId = small ? 'i-sun-small' : 'i-sun';
  const c = Number(code);
  if (c === 0) return sunId;
  if (c === 1 || c === 2) return 'i-cloud-sun';
  if (c === 3) return 'i-cloud';
  if (c === 45 || c === 48) return 'i-fog';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'i-rain';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'i-snow';
  if (c >= 95 && c <= 99) return 'i-storm';
  return 'i-cloud';
}

// Full SVG icon library — gradients in <defs>, weather symbols, plus a small
// utility icon set for stat labels (drop, wind, thermometer, sunrise).
// `width="0" height="0"` keeps it out of the visual flow; symbols are
// referenced via `<use href="#i-name"/>` from elsewhere in the DOM.
//
// Visual language: warm sun-amber, cool cloud-slate, fresh rain-blue,
// crisp snow-cyan, electric bolt-yellow. Every shape uses a top-light to
// bottom-shadow gradient and a fine inner highlight stroke for depth.
export const WEATHER_SVG_DEFS = `
<svg class="bb-weather-svg-defs" width="0" height="0" aria-hidden="true">
  <defs>
    <radialGradient id="bb-g-sun-disc" cx="35%" cy="32%" r="78%">
      <stop offset="0" stop-color="#fff4c2"/>
      <stop offset="0.45" stop-color="#ffc759"/>
      <stop offset="1" stop-color="#e07a2c"/>
    </radialGradient>
    <linearGradient id="bb-g-sun-ray" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd97a"/>
      <stop offset="1" stop-color="#f59e2c"/>
    </linearGradient>
    <radialGradient id="bb-g-sun-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffd97a" stop-opacity="0.55"/>
      <stop offset="0.6" stop-color="#ffae3d" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ff8a1a" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="bb-g-cloud" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6f8ff"/>
      <stop offset="0.55" stop-color="#d7dff0"/>
      <stop offset="1" stop-color="#8a98ba"/>
    </linearGradient>
    <linearGradient id="bb-g-cloud-d" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#aab6d3"/>
      <stop offset="0.6" stop-color="#74819f"/>
      <stop offset="1" stop-color="#3f475e"/>
    </linearGradient>

    <linearGradient id="bb-g-rain" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a8d0ff"/>
      <stop offset="0.6" stop-color="#5b9cf0"/>
      <stop offset="1" stop-color="#2a6dd6"/>
    </linearGradient>

    <linearGradient id="bb-g-snow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#9ad2ff"/>
    </linearGradient>

    <linearGradient id="bb-g-bolt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff3a0"/>
      <stop offset="0.5" stop-color="#ffd24a"/>
      <stop offset="1" stop-color="#f59325"/>
    </linearGradient>


    <!-- Soft drop-shadow used under cloud bodies to lift them off the card. -->
    <filter id="bb-f-cloud-shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.2"/>
      <feOffset dy="1.6" result="off"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <!-- Reusable cloud silhouette so every weather symbol shares the same
         geometry. Three rounded lobes + a flat base, drawn so it sits
         centered around y=58 in a 100x100 viewBox. -->
    <symbol id="bb-cloud-shape" viewBox="0 0 100 100">
      <path d="M26 72
               C12 72, 8 60, 14 52
               C8 40, 18 30, 30 32
               C32 22, 44 18, 54 24
               C60 16, 76 18, 80 30
               C90 32, 92 46, 84 52
               C90 62, 84 72, 72 72
               Z"/>
    </symbol>
  </defs>

  <!-- ── Sun ───────────────────────────────────────────────────────────── -->
  <symbol id="i-sun" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="42" fill="url(#bb-g-sun-glow)"/>
    <g class="bb-sun-rays">
      <g fill="url(#bb-g-sun-ray)">
        <rect x="47.5" y="6"  width="5" height="14" rx="2.5"/>
        <rect x="47.5" y="80" width="5" height="14" rx="2.5"/>
        <rect x="6"  y="47.5" width="14" height="5" rx="2.5"/>
        <rect x="80" y="47.5" width="14" height="5" rx="2.5"/>
        <rect x="47.5" y="6"  width="5" height="14" rx="2.5" transform="rotate(45 50 50)"/>
        <rect x="47.5" y="80" width="5" height="14" rx="2.5" transform="rotate(45 50 50)"/>
        <rect x="47.5" y="6"  width="5" height="14" rx="2.5" transform="rotate(-45 50 50)"/>
        <rect x="47.5" y="80" width="5" height="14" rx="2.5" transform="rotate(-45 50 50)"/>
      </g>
    </g>
    <g class="bb-sun-core">
      <circle cx="50" cy="50" r="24" fill="url(#bb-g-sun-disc)"/>
      <circle cx="50" cy="50" r="24" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1"/>
      <ellipse cx="42" cy="42" rx="9" ry="5" fill="rgba(255,255,255,.55)" transform="rotate(-25 42 42)"/>
    </g>
  </symbol>

  <symbol id="i-sun-small" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="36" fill="url(#bb-g-sun-glow)"/>
    <g fill="url(#bb-g-sun-ray)">
      <rect x="47" y="10" width="6" height="14" rx="3"/>
      <rect x="47" y="76" width="6" height="14" rx="3"/>
      <rect x="10" y="47" width="14" height="6" rx="3"/>
      <rect x="76" y="47" width="14" height="6" rx="3"/>
      <rect x="47" y="10" width="6" height="14" rx="3" transform="rotate(45 50 50)"/>
      <rect x="47" y="76" width="6" height="14" rx="3" transform="rotate(45 50 50)"/>
      <rect x="47" y="10" width="6" height="14" rx="3" transform="rotate(-45 50 50)"/>
      <rect x="47" y="76" width="6" height="14" rx="3" transform="rotate(-45 50 50)"/>
    </g>
    <circle cx="50" cy="50" r="22" fill="url(#bb-g-sun-disc)"/>
    <circle cx="50" cy="50" r="22" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1"/>
  </symbol>

  <!-- ── Cloud ─────────────────────────────────────────────────────────── -->
  <symbol id="i-cloud" viewBox="0 0 100 100">
    <g filter="url(#bb-f-cloud-shadow)">
      <use href="#bb-cloud-shape" fill="url(#bb-g-cloud)"/>
    </g>
    <use href="#bb-cloud-shape" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="0.8"/>
    <!-- Inner highlight ridge along the top lobes. -->
    <path d="M34 38 C40 32, 50 32, 56 38" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.4" stroke-linecap="round"/>
  </symbol>

  <!-- ── Cloud + Sun ───────────────────────────────────────────────────── -->
  <symbol id="i-cloud-sun" viewBox="0 0 100 100">
    <!-- Sun, top-right, peeking out behind the cloud. -->
    <g transform="translate(20 -12)">
      <circle cx="50" cy="50" r="22" fill="url(#bb-g-sun-glow)"/>
      <g class="bb-sun-rays" fill="url(#bb-g-sun-ray)">
        <rect x="48" y="18" width="4" height="10" rx="2"/>
        <rect x="48" y="72" width="4" height="10" rx="2"/>
        <rect x="18" y="48" width="10" height="4" rx="2"/>
        <rect x="72" y="48" width="10" height="4" rx="2"/>
        <rect x="48" y="18" width="4" height="10" rx="2" transform="rotate(45 50 50)"/>
        <rect x="48" y="72" width="4" height="10" rx="2" transform="rotate(45 50 50)"/>
        <rect x="48" y="18" width="4" height="10" rx="2" transform="rotate(-45 50 50)"/>
        <rect x="48" y="72" width="4" height="10" rx="2" transform="rotate(-45 50 50)"/>
      </g>
      <circle cx="50" cy="50" r="14" fill="url(#bb-g-sun-disc)"/>
      <circle cx="50" cy="50" r="14" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1"/>
    </g>
    <!-- Cloud, foreground, shifted down-left and slightly smaller so the
         sun peeks above its right shoulder. -->
    <g transform="translate(-10 18) scale(0.92)" filter="url(#bb-f-cloud-shadow)">
      <use href="#bb-cloud-shape" fill="url(#bb-g-cloud)"/>
    </g>
    <g transform="translate(-10 18) scale(0.92)">
      <use href="#bb-cloud-shape" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="0.8"/>
      <path d="M34 38 C40 32, 50 32, 56 38" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.4" stroke-linecap="round"/>
    </g>
  </symbol>

  <!-- ── Rain ──────────────────────────────────────────────────────────── -->
  <symbol id="i-rain" viewBox="0 0 100 100">
    <g transform="translate(0 -10)" filter="url(#bb-f-cloud-shadow)">
      <use href="#bb-cloud-shape" fill="url(#bb-g-cloud-d)"/>
    </g>
    <g transform="translate(0 -10)">
      <use href="#bb-cloud-shape" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="0.8"/>
    </g>
    <g fill="url(#bb-g-rain)">
      <path class="bb-rain-drop" d="M30 70 C30 70, 26 78, 26 82 a4 4 0 0 0 8 0 C34 78, 30 70, 30 70 Z"/>
      <path class="bb-rain-drop" d="M50 74 C50 74, 46 82, 46 86 a4 4 0 0 0 8 0 C54 82, 50 74, 50 74 Z"/>
      <path class="bb-rain-drop" d="M70 70 C70 70, 66 78, 66 82 a4 4 0 0 0 8 0 C74 78, 70 70, 70 70 Z"/>
    </g>
  </symbol>

  <!-- ── Snow ──────────────────────────────────────────────────────────── -->
  <symbol id="i-snow" viewBox="0 0 100 100">
    <g transform="translate(0 -10)" filter="url(#bb-f-cloud-shadow)">
      <use href="#bb-cloud-shape" fill="url(#bb-g-cloud)"/>
    </g>
    <g transform="translate(0 -10)">
      <use href="#bb-cloud-shape" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="0.8"/>
    </g>
    <!-- Each snowflake is wrapped in an outer positioning g element because
         CSS keyframes set the "transform" property, which REPLACES any SVG
         transform= attribute on the same element rather than composing. -->
    <g stroke="url(#bb-g-snow)" stroke-width="2.6" stroke-linecap="round" fill="none">
      <g transform="translate(28 76)">
        <g class="bb-snow-flake">
          <line x1="-8" y1="0" x2="8" y2="0"/>
          <line x1="0" y1="-8" x2="0" y2="8"/>
          <line x1="-5.5" y1="-5.5" x2="5.5" y2="5.5"/>
          <line x1="-5.5" y1="5.5" x2="5.5" y2="-5.5"/>
        </g>
      </g>
      <g transform="translate(50 84)">
        <g class="bb-snow-flake">
          <line x1="-7" y1="0" x2="7" y2="0"/>
          <line x1="0" y1="-7" x2="0" y2="7"/>
          <line x1="-5" y1="-5" x2="5" y2="5"/>
          <line x1="-5" y1="5" x2="5" y2="-5"/>
        </g>
      </g>
      <g transform="translate(72 76)">
        <g class="bb-snow-flake">
          <line x1="-8" y1="0" x2="8" y2="0"/>
          <line x1="0" y1="-8" x2="0" y2="8"/>
          <line x1="-5.5" y1="-5.5" x2="5.5" y2="5.5"/>
          <line x1="-5.5" y1="5.5" x2="5.5" y2="-5.5"/>
        </g>
      </g>
    </g>
  </symbol>

  <!-- ── Storm ─────────────────────────────────────────────────────────── -->
  <symbol id="i-storm" viewBox="0 0 100 100">
    <g transform="translate(0 -14)" filter="url(#bb-f-cloud-shadow)">
      <use href="#bb-cloud-shape" fill="url(#bb-g-cloud-d)"/>
    </g>
    <g transform="translate(0 -14)">
      <use href="#bb-cloud-shape" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="0.8"/>
    </g>
    <!-- Lightning bolt — cleaner zigzag, centered. -->
    <path class="bb-bolt"
          d="M52 52 L38 76 L48 76 L42 92 L62 68 L52 68 L58 52 Z"
          fill="url(#bb-g-bolt)"
          stroke="rgba(0,0,0,.18)" stroke-width="0.6" stroke-linejoin="round"/>
  </symbol>

  <!-- ── Fog ───────────────────────────────────────────────────────────── -->
  <symbol id="i-fog" viewBox="0 0 100 100">
    <g transform="translate(0 -22) scale(0.9) translate(5 0)" filter="url(#bb-f-cloud-shadow)">
      <use href="#bb-cloud-shape" fill="url(#bb-g-cloud)" opacity="0.8"/>
    </g>
    <g stroke="#e8eef8" stroke-width="5.5" stroke-linecap="round" fill="none" opacity="0.85">
      <g class="bb-fog-line"><line x1="14" y1="64" x2="86" y2="64"/></g>
      <g class="bb-fog-line"><line x1="22" y1="78" x2="78" y2="78"/></g>
      <g class="bb-fog-line"><line x1="14" y1="92" x2="68" y2="92"/></g>
    </g>
  </symbol>

  <!-- ── Utility / stat icons (currentColor for theme tinting) ─────────── -->
  <symbol id="i-drop" viewBox="0 0 24 24">
    <path d="M12 2.5 C12 2.5 5.5 11 5.5 15.5 a6.5 6.5 0 0 0 13 0 C18.5 11 12 2.5 12 2.5 Z"
          fill="currentColor"/>
    <path d="M9 13 C8.4 14.5 8.5 16 9.5 17"
          fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.4" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-wind" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 8 H13.5 a2.5 2.5 0 1 0 -2.5 -2.5"/>
      <path d="M3 17 H15 a2.5 2.5 0 1 1 -2.5 2.5"/>
      <path d="M3 12.5 H19 a2 2 0 1 0 -2 -2"/>
    </g>
  </symbol>

  <symbol id="i-thermo" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 13.5 V5 a2 2 0 1 0 -4 0 V13.5 a4 4 0 1 0 4 0 Z"/>
      <line x1="16" y1="7" x2="18" y2="7"/>
      <line x1="16" y1="10" x2="18" y2="10"/>
    </g>
    <circle cx="12" cy="17.5" r="2.3" fill="currentColor"/>
  </symbol>

  <symbol id="i-sunrise" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 19 H21"/>
      <path d="M5 15.5 a7 7 0 0 1 14 0"/>
      <path d="M12 3 V7"/>
      <path d="M5.5 8 L7 9.5"/>
      <path d="M18.5 8 L17 9.5"/>
      <path d="M9 19 L12 15.5 L15 19"/>
    </g>
  </symbol>
</svg>
`.trim();
