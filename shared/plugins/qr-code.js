import { register } from './registry.js';
import { themeColorSection, applyColorOverrides } from '../widget-color.js';
import { textScaleField } from '../text-scale.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import qrcode from '../vendor/qrcode.js';
import { isRemoteUrl } from '../plugin-network.js';

// Structured QR builder: the customer fills template-specific fields and we
// assemble the correct payload string, they never have to know the WIFI:/vCard
// wire format.
//
// PRIVACY: the QR is generated ON-DEVICE with the vendored MIT qrcode library
// (shared/vendor/qrcode.js). Nothing about the payload, Wi-Fi passwords,
// vCard contact data, URLs, ever leaves the player. (The previous version
// round-tripped the payload through api.qrserver.com.)

// Build the QR module matrix for a payload. ecLevel is L/M/Q/H. typeNumber 0
// lets the library auto-pick the smallest version that fits. Returns
// { count, isDark(r,c) } or null if the payload can't be encoded (e.g. too
// large for the chosen error-correction level).
function buildMatrix(payload, ecLevel) {
  try {
    const qr = qrcode(0, ecLevel);
    qr.addData(payload);   // Byte mode, UTF-8 (set in the vendored module)
    qr.make();
    return { count: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
  } catch {
    return null;
  }
}

// Quiet zone, in modules, around the code. 4 is the QR-spec minimum and
// matches the margin the old qrserver call used (margin=10px ≈ a few modules);
// keeping a generous quiet zone is what scanners need.
const QUIET = 4;

// The three structural finder patterns (the big squares in three corners) must
// stay square + solid no matter the module style, or scanners lose their
// alignment anchors. This marks a module as belonging to one of them so the
// stylised renderers can skip rounding/dotting it.
function isFinderModule(m, r, c) {
  const n = m.count;
  const inBox = (br, bc) => r >= br && r < br + 7 && c >= bc && c < bc + 7;
  return inBox(0, 0) || inBox(0, n - 7) || inBox(n - 7, 0);
}

// Render the matrix to a crisp SVG string sized to `size` px. Colours come
// straight from the inspector. The whole canvas is filled with bgColor (the
// quiet zone), then dark modules are painted. `square` uses one combined <path>
// (far smaller than one <rect> per module); `rounded`/`dots` emit per-module
// shapes for the non-finder modules and keep finder patterns square so the code
// stays scannable. Colours are validated to hex before use so they can't break
// out of the attribute/markup.
function matrixToSvg(m, size, fgColor, bgColor, moduleStyle) {
  const total = m.count + QUIET * 2;
  const fg = safeHexColor(fgColor, '#000000');
  const bg = safeHexColor(bgColor, '#ffffff');
  const style = ['square', 'rounded', 'dots'].includes(moduleStyle) ? moduleStyle : 'square';
  let path = '';     // square modules (incl. finder patterns in all styles)
  let shapes = '';   // rounded/dot shapes for non-finder modules
  for (let r = 0; r < m.count; r++) {
    for (let c = 0; c < m.count; c++) {
      if (!m.isDark(r, c)) continue;
      const x = c + QUIET, y = r + QUIET;
      if (style === 'square' || isFinderModule(m, r, c)) {
        path += `M${x} ${y}h1v1h-1z`;
      } else if (style === 'rounded') {
        shapes += `<rect x="${x + 0.05}" y="${y + 0.05}" width="0.9" height="0.9" rx="0.32"/>`;
      } else { // dots
        shapes += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.45"/>`;
      }
    }
  }
  // viewBox is in module units; width/height scale it to the requested pixels.
  // crispEdges keeps square modules sharp; rounded/dots need anti-aliasing so we
  // switch to geometricPrecision when they're present.
  const rendering = style === 'square' ? 'crispEdges' : 'geometricPrecision';
  return `<svg class="bb-qr-img" data-field="template url text wifiSsid wifiPassword wifiEnc wifiHidden vcardName vcardPhone vcardEmail vcardOrg vcardUrl moduleStyle fgColor bgColor size ecLevel" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="${rendering}" role="img" aria-label="QR code">`
    + `<rect width="${total}" height="${total}" fill="${bg}"/>`
    + (path ? `<path d="${path}" fill="${fg}"/>` : '')
    + (shapes ? `<g fill="${fg}">${shapes}</g>` : '')
    + `</svg>`;
}

// Paint the matrix onto a 2D canvas context at `size` px (used for the
// centre-logo path, where we composite a raster logo over the code). Mirrors
// matrixToSvg's module styling so the logo path looks the same as the inline
// SVG path: rounded/dots stylise non-finder modules, finder patterns stay
// square for scanability.
function drawMatrixToCanvas(dctx, m, size, fgColor, bgColor, moduleStyle) {
  const total = m.count + QUIET * 2;
  const cell = size / total;
  const style = ['square', 'rounded', 'dots'].includes(moduleStyle) ? moduleStyle : 'square';
  dctx.fillStyle = safeHexColor(bgColor, '#ffffff');
  dctx.fillRect(0, 0, size, size);
  dctx.fillStyle = safeHexColor(fgColor, '#000000');
  for (let r = 0; r < m.count; r++) {
    for (let c = 0; c < m.count; c++) {
      if (!m.isDark(r, c)) continue;
      if (style === 'square' || isFinderModule(m, r, c)) {
        // +0.5 / +1 rounding overdraw avoids hairline gaps between cells.
        const x = Math.floor((c + QUIET) * cell);
        const y = Math.floor((r + QUIET) * cell);
        const w = Math.ceil(cell + (((c + QUIET) * cell) - x));
        const h = Math.ceil(cell + (((r + QUIET) * cell) - y));
        dctx.fillRect(x, y, w, h);
      } else if (style === 'rounded') {
        const x = (c + QUIET) * cell, y = (r + QUIET) * cell;
        const rad = cell * 0.32;
        roundRect(dctx, x + cell * 0.05, y + cell * 0.05, cell * 0.9, cell * 0.9, rad);
        dctx.fill();
      } else { // dots
        const cx = (c + QUIET + 0.5) * cell, cy = (r + QUIET + 0.5) * cell;
        dctx.beginPath();
        dctx.arc(cx, cy, cell * 0.45, 0, Math.PI * 2);
        dctx.fill();
      }
    }
  }
}

// Rounded-rect subpath helper for the canvas module-style path (no reliance on
// ctx.roundRect, which isn't in every player's Canvas implementation).
function roundRect(dctx, x, y, w, h, rad) {
  const rr = Math.min(rad, w / 2, h / 2);
  dctx.beginPath();
  dctx.moveTo(x + rr, y);
  dctx.arcTo(x + w, y, x + w, y + h, rr);
  dctx.arcTo(x + w, y + h, x, y + h, rr);
  dctx.arcTo(x, y + h, x, y, rr);
  dctx.arcTo(x, y, x + w, y, rr);
  dctx.closePath();
}

// Relative luminance (WCAG) of a hex colour, 0 (black) … 1 (white). Used by the
// inverted-colour validate: a foreground lighter than the background means a
// light-on-dark code that many phone scanners refuse.
function relLuminance(hex) {
  const s = safeHexColor(hex, '#000000').slice(1);
  const full = s.length === 3 ? s.split('').map(ch => ch + ch).join('') : s;
  const ch = i => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}

// Accept only #RGB / #RRGGBB hex; fall back to a known-good default otherwise.
// Keeps a malformed colour from being injected into SVG markup or a canvas
// fillStyle.
function safeHexColor(v, fallback) {
  const s = String(v ?? '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : fallback;
}

function esc(v) { return String(v ?? '').replace(/([\\;,:"])/g, '\\$1'); }

// vCard 3.0 text-value escaping. Backslash, comma, semicolon and newlines are
// structural in vCard, so an unescaped "Smith; John" or "ACME, Inc." would
// split into the wrong fields and the scanned contact card would be mangled.
// Escape backslash first so we don't double-escape the ones we add.
function escVcard(v) {
  return String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([;,])/g, '\\$1');
}

export function buildPayload(c) {
  switch (c.template ?? 'url') {
    case 'wifi': {
      const enc = c.wifiEnc ?? 'WPA';
      const parts = [`T:${enc === 'nopass' ? 'nopass' : enc}`, `S:${esc(c.wifiSsid)}`];
      if (enc !== 'nopass') parts.push(`P:${esc(c.wifiPassword)}`);
      if (c.wifiHidden) parts.push('H:true');
      return `WIFI:${parts.join(';')};;`;
    }
    case 'vcard': {
      const L = ['BEGIN:VCARD', 'VERSION:3.0'];
      if (c.vcardName) L.push(`FN:${escVcard(c.vcardName)}`);
      if (c.vcardOrg) L.push(`ORG:${escVcard(c.vcardOrg)}`);
      if (c.vcardPhone) L.push(`TEL;TYPE=CELL:${escVcard(c.vcardPhone)}`);
      if (c.vcardEmail) L.push(`EMAIL:${escVcard(c.vcardEmail)}`);
      if (c.vcardUrl) L.push(`URL:${escVcard(c.vcardUrl)}`);
      L.push('END:VCARD');
      return L.join('\n');
    }
    case 'text': return c.text ?? '';
    case 'url':
    default: return c.url ?? '';
  }
}

// Human-readable lines shown under the caption when `showDetails` is on, so
// guests can also type the info in (the hotel/café standard). Returns an array
// of { label, value } pairs per template; empty when there is nothing to show.
function detailLines(c) {
  switch (c.template ?? 'url') {
    case 'url': {
      const u = String(c.url ?? '').trim();
      return u ? [{ label: '', value: u }] : [];
    }
    case 'wifi': {
      const out = [];
      if (c.wifiSsid) out.push({ label: 'Network', value: String(c.wifiSsid) });
      if ((c.wifiEnc ?? 'WPA') !== 'nopass' && c.wifiPassword) {
        out.push({ label: 'Password', value: String(c.wifiPassword) });
      }
      return out;
    }
    case 'vcard': {
      const out = [];
      if (c.vcardName) out.push({ label: '', value: String(c.vcardName) });
      if (c.vcardPhone) out.push({ label: 'Phone', value: String(c.vcardPhone) });
      return out;
    }
    case 'text':
    default:
      return [];
  }
}

export default register({
  type: 'qr-code',
  network: c => isRemoteUrl(c?.logoUrl),
  label: 'QR Code',
  group: 'data',
  icon: '⬛',
  // No network flag: the QR matrix is generated locally (see render below), so
  // there is no live data source that could fail, the inspector's "On error"
  // fallback section would be meaningless here.
  schemaVersion: 2,
  defaults: () => ({
    template: 'url',
    url: 'https://agentview.de',
    text: '',
    wifiSsid: '', wifiPassword: '', wifiEnc: 'WPA', wifiHidden: false,
    vcardName: '', vcardPhone: '', vcardEmail: '', vcardOrg: '', vcardUrl: '',
    label: 'Scan to learn more',
    showDetails: false,
    layout: 'vertical',
    size: 480,
    moduleStyle: 'square',
    fgColor: '#000000',
    bgColor: '#ffffff',
    ecLevel: 'M',
    logoUrl: '',
    logoSize: 22,
    frameless: false,
    textScale: 100,
    theme: 'minimal-dark',
    textColor: '', accentColor: '',
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'template', type: 'select', label: 'QR type', buttons: true,
        options: [
          { value: 'url', label: 'Website link' },
          { value: 'wifi', label: 'Wi-Fi access' },
          { value: 'vcard', label: 'Contact card (vCard)' },
          { value: 'text', label: 'Plain text' },
        ] },
      { key: 'url', type: 'url', label: 'Website URL', test: 'url',
        placeholder: 'https://example.com',
        showIf: c => (c.template ?? 'url') === 'url' },
      { key: 'text', type: 'textarea', label: 'Text',
        placeholder: 'Anything — scanners will show it as plain text.',
        showIf: c => c.template === 'text' },

      // Wi-Fi: SSID + security on one row, password on its own.
      { type: 'row', children: [
        { key: 'wifiSsid', type: 'text', label: 'SSID', placeholder: 'Guest-WiFi' },
        { key: 'wifiEnc', type: 'select', label: 'Security',
          options: [{ value: 'WPA', label: 'WPA/WPA2' }, { value: 'WEP', label: 'WEP' }, { value: 'nopass', label: 'Open' }] },
      ], showIf: c => c.template === 'wifi' },
      { key: 'wifiPassword', type: 'text', label: 'Password', placeholder: '8–63 characters',
        showIf: c => c.template === 'wifi' && (c.wifiEnc ?? 'WPA') !== 'nopass',
        validate: c => {
          const enc = c.wifiEnc ?? 'WPA';
          if (enc === 'nopass') return null;
          const len = String(c.wifiPassword ?? '').length;
          if (len > 0 && (len < 8 || len > 63)) {
            return { level: 'warn', message: 'WPA/WPA2 passwords must be 8–63 characters or the Wi-Fi QR won’t connect.' };
          }
          return null;
        } },
      { key: 'wifiHidden', type: 'toggle', label: 'Hidden network', showIf: c => c.template === 'wifi' },

      // vCard: 5 short fields cluster naturally, name on its own, phone + email
      // share a row, org + website share a row.
      { key: 'vcardName', type: 'text', label: 'Full name', placeholder: 'Jane Doe',
        showIf: c => c.template === 'vcard' },
      { type: 'row', children: [
        { key: 'vcardPhone', type: 'text', label: 'Phone', placeholder: '+49 30 1234567' },
        { key: 'vcardEmail', type: 'text', label: 'Email', placeholder: 'name@company.com',
          validate: c => {
            const v = String(c.vcardEmail ?? '').trim();
            if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
              return { level: 'warn', message: 'This email doesn’t look valid — the scanned contact card would carry a broken address.' };
            }
            return null;
          } },
      ], showIf: c => c.template === 'vcard' },
      { type: 'row', children: [
        { key: 'vcardOrg', type: 'text', label: 'Organization', placeholder: 'ACME Inc.' },
        { key: 'vcardUrl', type: 'url',  label: 'Website', test: true, placeholder: 'https://example.com' },
      ], showIf: c => c.template === 'vcard' },

      { key: 'showDetails', type: 'toggle', label: 'Show details under the code', tier: 'advanced',
        help: 'Prints the human-readable payload under the caption — the link, the Wi-Fi name + password, or the name + phone — so guests can also type it in.' },

      { type: 'section', key: 'layout-sec', label: 'Layout' },
      { key: 'layout', type: 'select', label: 'Arrangement', buttons: true,
        options: [
          { value: 'vertical', label: 'Stacked' },
          { value: 'horizontal', label: 'Side by side' },
        ],
        help: 'Side by side puts the code on the left and the caption on the right — good for wide footer strips.' },
      { key: 'label', type: 'text', label: 'Caption', placeholder: 'Scan to learn more', tier: 'advanced' },
      { ...textScaleField('Caption size'), tier: 'advanced',
        help: '100% is the auto-scaled baseline. Push higher so the caption stays legible at TV viewing distance.' },
      { key: 'frameless', type: 'toggle', label: 'Frameless (edge-to-edge)',
        help: 'Removes the white card around the QR. The required quiet zone inside the code stays (scanners need it).' },

      { type: 'section', key: 'appearance', label: 'Appearance' },
      { key: 'moduleStyle', type: 'select', label: 'Module style', buttons: true, tier: 'advanced',
        options: [
          { value: 'square', label: 'Square' },
          { value: 'rounded', label: 'Rounded' },
          { value: 'dots', label: 'Dots' },
        ],
        help: 'Stylises the QR dots for branded signage. The three corner finder patterns always stay square so the code keeps scanning.' },
      { type: 'row', children: [
        { key: 'fgColor', type: 'color', label: 'Foreground', tier: 'advanced' },
        { key: 'bgColor', type: 'color', label: 'Background', tier: 'advanced',
          validate: c => {
            if (relLuminance(c.fgColor) > relLuminance(c.bgColor)) {
              return { level: 'warn', message: 'Inverted QR codes (light on dark) fail on many phone scanners — keep the foreground darker than the background.' };
            }
            return null;
          } },
      ] },
      { key: 'size', type: 'number', label: 'QR resolution', min: 64, max: 2048, step: 16, slider: true, suffix: 'px',
        help: 'Internal raster/vector resolution, not the on-screen box (the widget sizes that). Matters for the centre-logo canvas on 4K displays — keep it high there.' },

      { type: 'section', key: 'logo', label: 'Centre logo', collapsed: true,
        summary: c => c.logoUrl ? `logo · ${c.ecLevel === 'H' ? 'EC H' : 'EC ' + (c.ecLevel ?? 'M')}` : 'none' },
      { key: 'logoUrl', type: 'asset', label: 'Logo image', accept: 'image/*', tier: 'advanced',
        help: 'Drops a small logo into the centre of the QR. Use error correction H so the code stays scannable.',
        validate: c => {
          if (c.logoUrl && (c.ecLevel ?? 'M') !== 'H') {
            return { level: 'warn', message: 'Centre logos need error correction H to stay scannable.' };
          }
          return null;
        } },
      { key: 'logoSize', type: 'number', label: 'Logo size (% of QR, long edge)', min: 10, max: 30, step: 1, slider: true, suffix: '%', tier: 'advanced',
        showIf: c => !!c.logoUrl,
        help: 'The logo keeps its aspect ratio. The value controls its long edge as a % of the QR. Keep ≤ 22% for reliable scanning, and pair with EC Level H.' },
      { key: 'ecLevel', type: 'select', label: 'Error correction', tier: 'advanced',
        options: [
          { value: 'L', label: 'Low (~7%)' },
          { value: 'M', label: 'Medium (~15%)' },
          { value: 'Q', label: 'Quartile (~25%)' },
          { value: 'H', label: 'High (~30%), needed for centre logos' },
        ],
        help: 'Higher levels survive scratches and centre overlays at the cost of denser modules. The default (Medium) is fine for logo-less codes.' },

      ...themeColorSection(),
    ],
  }),
  looks: () => [
    { id: 'rounded', name: 'Rounded', patch: { moduleStyle: 'rounded' } },
    { id: 'dots', name: 'Dots', patch: { moduleStyle: 'dots' } },
    { id: 'inverted', name: 'Inverted', patch: { fgColor: '#ffffff', bgColor: '#000000' } },
    { id: 'with-caption', name: 'With caption', patch: { showDetails: true, frameless: false } },
  ],
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const horizontal = (c.layout ?? 'vertical') === 'horizontal';
    const root = document.createElement('div');
    root.className = `bb-slide bb-slide-qr bb-theme-${c.theme ?? 'minimal-dark'}${horizontal ? ' bb-qr-horizontal' : ''}`;
    applyColorOverrides(root, c);
    // Caption size: feed the percent (÷100) into a CSS var the caption rule
    // consumes via calc(clamp(…) * var()). Default 1 so untouched widgets are
    // unchanged.
    root.style.setProperty('--bb-qr-cap-scale', String((c.textScale ?? 100) / 100));
    const payload = buildPayload(c).trim();
    const size = Math.max(64, Math.min(2048, c.size ?? 480));
    const moduleStyle = ['square', 'rounded', 'dots'].includes(c.moduleStyle) ? c.moduleStyle : 'square';
    // The card background follows `bgColor` so the framed card visually matches
    // the QR's own quiet zone (the SVG/canvas bg fill). The caption follows
    // `fgColor` so it stays readable against whatever bg the user picks.
    // Frameless drops padding/shadow/radius, the QR fills the widget while
    // the scanner-required internal quiet zone (QUIET modules) stays.
    const cardBg = String(c.bgColor ?? '#ffffff');
    const captionColor = String(c.fgColor ?? '#000000');
    const frameless = !!c.frameless;
    const cardCls = `bb-qr-card${frameless ? ' bb-qr-frameless' : ''}${horizontal ? ' bb-qr-card-h' : ''}`;
    // In frameless mode the card itself becomes transparent so the slide bg
    // (or widget bg) shows through, and only the QR + its quiet zone tint the
    // area. Framed mode paints the card with bgColor.
    const cardStyle = frameless ? '' : `background-color:${escapeAttr(cardBg)};`;
    // Empty/error states must survive the light 'editorial-mono' theme, so they
    // use the theme foreground var (var(--bb-st-fg)) at reduced opacity rather
    // than a hardcoded light-on-dark rgba.
    const mutedStyle = 'padding:40px;color:var(--bb-st-fg,#888);opacity:.55;';
    if (!payload) {
      root.innerHTML = `${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
        <div class="${cardCls}" style="${cardStyle}"><div class="bb-qr-empty" style="${mutedStyle}">Fill in the ${escapeHtml(c.template ?? 'url')} details to generate a QR code.</div></div>`;
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }
    const ecc = ['L', 'M', 'Q', 'H'].includes(c.ecLevel) ? c.ecLevel : 'M';
    const hasLogo = !!c.logoUrl;

    const failMessage = () => {
      ctx?.onError?.();
      const target = root.querySelector('.bb-qr-card');
      if (target) target.innerHTML =
        `<div class="bb-qr-empty" style="${mutedStyle}text-align:center;">⚠️ QR code generator unavailable.<br><span style="opacity:.8;font-size:.9em;">Showing the payload instead:</span><br><code style="display:inline-block;margin-top:8px;padding:6px 10px;background:color-mix(in srgb, var(--bb-st-fg,#888) 10%, transparent);border-radius:6px;font-size:.85em;max-width:80%;word-break:break-all;">${escapeHtml(payload)}</code></div>`;
    };

    // Generate the QR matrix locally, no network, the payload never leaves
    // the device. A null result means the payload is too large for the chosen
    // EC level; fall back to showing the payload text.
    const matrix = buildMatrix(payload, ecc);
    if (!matrix) {
      root.innerHTML = `${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
        <div class="${cardCls}" style="${cardStyle}"></div>`;
      container.appendChild(root);
      failMessage();
      return composeDispose(() => root.remove());
    }

    // No logo → inline SVG (crisp at any size). With a logo → a canvas we draw
    // the modules onto, then composite the raster logo over the centre.
    const qrMarkup = hasLogo
      ? `<canvas class="bb-qr-img bb-qr-canvas" data-field="template url text wifiSsid wifiPassword wifiEnc wifiHidden vcardName vcardPhone vcardEmail vcardOrg vcardUrl moduleStyle fgColor bgColor size ecLevel logoUrl logoSize" width="${size}" height="${size}" aria-label="QR code"></canvas>`
      : matrixToSvg(matrix, size, c.fgColor, c.bgColor, moduleStyle);

    // Optional human-readable detail lines under the caption (showDetails).
    let detailsMarkup = '';
    if (c.showDetails) {
      const lines = detailLines(c).map(({ label, value }) =>
        `<div class="bb-qr-detail" data-field="showDetails template url wifiSsid wifiPassword wifiEnc vcardName vcardPhone">${label ? `<span class="bb-qr-detail-label">${escapeHtml(label)}:</span> ` : ''}<span class="bb-qr-detail-value">${escapeHtml(value)}</span></div>`
      ).join('');
      if (lines) detailsMarkup = `<div class="bb-qr-details" style="color:${escapeAttr(captionColor)};">${lines}</div>`;
    }

    // Caption + details cluster together; in horizontal layout they sit beside
    // the code rather than under it.
    const textMarkup = (c.label || detailsMarkup)
      ? `<div class="bb-qr-text">${c.label ? `<div class="bb-qr-caption" data-field="label textScale fgColor" style="color:${escapeAttr(captionColor)};">${escapeHtml(c.label)}</div>` : ''}${detailsMarkup}</div>`
      : '';

    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="${cardCls}" style="${cardStyle}">
        ${qrMarkup}
        ${textMarkup}
      </div>
    `;
    container.appendChild(root);

    if (hasLogo) {
      // Draw the QR modules straight onto the canvas (no image round-trip),
      // then composite the centre logo over them.
      //
      // We deliberately do NOT set crossOrigin='anonymous' on the logo: drawImage
      // works fine for any origin and we never read the canvas back
      // (no toDataURL/getImageData/captureStream). Setting crossOrigin would
      // require the asset CDN to send Access-Control-Allow-Origin, many
      // image hosts (incl. the agentView asset CDN in some configurations)
      // don't, so it would silently drop the logo and show the QR alone,
      // leaving the user wondering why their logo wasn't there.
      const canvas = root.querySelector('.bb-qr-canvas');
      const dctx = canvas.getContext('2d');
      const logoPct = Math.max(10, Math.min(30, Number(c.logoSize) || 22)) / 100;
      const logoImg = new Image();
      const bg = safeHexColor(c.bgColor, '#ffffff');
      const paint = () => {
        try {
          drawMatrixToCanvas(dctx, matrix, size, c.fgColor, c.bgColor, moduleStyle);
          if (logoImg.complete && logoImg.naturalWidth) {
            // Contain-fit, preserve aspect ratio: `logoSize` controls the
            // logo's LONGER edge as a % of the QR. The shorter edge is
            // derived from the image's natural ratio, so a wide / tall logo
            // is never squished into a square.
            const longEdge = Math.round(size * logoPct);
            const aspect = (logoImg.naturalWidth || 1) / (logoImg.naturalHeight || 1);
            let lw, lh;
            if (aspect >= 1) { lw = longEdge; lh = Math.round(longEdge / aspect); }
            else            { lh = longEdge; lw = Math.round(longEdge * aspect); }
            const lx = Math.round((size - lw) / 2);
            const ly = Math.round((size - lh) / 2);
            // Background-coloured rect matches the logo's bounds (not a forced
            // square) so we only carve out the QR area we actually need.
            // 12% padding around the logo keeps a clean separator from the
            // surrounding modules, important for scanability with EC ≥ Q.
            const pad = Math.round(longEdge * 0.12);
            dctx.fillStyle = bg;
            dctx.fillRect(lx - pad, ly - pad, lw + pad * 2, lh + pad * 2);
            dctx.drawImage(logoImg, lx, ly, lw, lh);
          }
        } catch { failMessage(); }
      };
      // Paint the QR immediately so it shows even before the logo loads.
      paint();
      // Logo failure is non-fatal, the QR already painted, but warn in the
      // console so a missing-logo problem doesn't go silently undetected.
      logoImg.addEventListener('load', paint);
      logoImg.addEventListener('error', () => {
        console.warn(`[qr-code] logo failed to load: ${c.logoUrl}`);
      });
      logoImg.src = c.logoUrl;
    }
    return composeDispose(() => root.remove());
  },
});

