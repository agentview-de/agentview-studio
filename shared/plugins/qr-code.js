import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import qrcode from '../vendor/qrcode.js';

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

// Render the matrix to a crisp SVG string sized to `size` px. Colours come
// straight from the inspector. The whole canvas is filled with bgColor (the
// quiet zone), then one <path> covers every dark module, far smaller than one
// <rect> per module. Colours are validated to hex before use so they can't
// break out of the attribute/markup.
function matrixToSvg(m, size, fgColor, bgColor) {
  const total = m.count + QUIET * 2;
  const fg = safeHexColor(fgColor, '#000000');
  const bg = safeHexColor(bgColor, '#ffffff');
  let path = '';
  for (let r = 0; r < m.count; r++) {
    for (let c = 0; c < m.count; c++) {
      if (m.isDark(r, c)) path += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
    }
  }
  // viewBox is in module units; width/height scale it to the requested pixels.
  return `<svg class="bb-qr-img" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code">`
    + `<rect width="${total}" height="${total}" fill="${bg}"/>`
    + `<path d="${path}" fill="${fg}"/>`
    + `</svg>`;
}

// Paint the matrix onto a 2D canvas context at `size` px (used for the
// centre-logo path, where we composite a raster logo over the code).
function drawMatrixToCanvas(dctx, m, size, fgColor, bgColor) {
  const total = m.count + QUIET * 2;
  const cell = size / total;
  dctx.fillStyle = safeHexColor(bgColor, '#ffffff');
  dctx.fillRect(0, 0, size, size);
  dctx.fillStyle = safeHexColor(fgColor, '#000000');
  for (let r = 0; r < m.count; r++) {
    for (let c = 0; c < m.count; c++) {
      if (m.isDark(r, c)) {
        // +0.5 / +1 rounding overdraw avoids hairline gaps between cells.
        const x = Math.floor((c + QUIET) * cell);
        const y = Math.floor((r + QUIET) * cell);
        const w = Math.ceil(cell + (((c + QUIET) * cell) - x));
        const h = Math.ceil(cell + (((r + QUIET) * cell) - y));
        dctx.fillRect(x, y, w, h);
      }
    }
  }
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

export default register({
  type: 'qr-code',
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
    size: 480,
    fgColor: '#000000',
    bgColor: '#ffffff',
    ecLevel: 'M',
    logoUrl: '',
    logoSize: 22,
    frameless: false,
    theme: 'minimal-dark',
  }),
  schema: () => ({
    fields: [
      { type: 'section', label: 'Content' },
      { key: 'template', type: 'select', label: 'QR type',
        options: [
          { value: 'url', label: 'Website link' },
          { value: 'wifi', label: 'Wi-Fi access' },
          { value: 'vcard', label: 'Contact card (vCard)' },
          { value: 'text', label: 'Plain text' },
        ] },
      { key: 'url', type: 'url', label: 'Website URL', test: 'url',
        showIf: c => (c.template ?? 'url') === 'url' },
      { key: 'text', type: 'textarea', label: 'Text',
        showIf: c => c.template === 'text' },

      // Wi-Fi: SSID + security on one row, password on its own.
      { type: 'row', children: [
        { key: 'wifiSsid', type: 'text', label: 'SSID' },
        { key: 'wifiEnc', type: 'select', label: 'Security',
          options: [{ value: 'WPA', label: 'WPA/WPA2' }, { value: 'WEP', label: 'WEP' }, { value: 'nopass', label: 'Open' }] },
      ], showIf: c => c.template === 'wifi' },
      { key: 'wifiPassword', type: 'text', label: 'Password',
        showIf: c => c.template === 'wifi' && (c.wifiEnc ?? 'WPA') !== 'nopass' },
      { key: 'wifiHidden', type: 'toggle', label: 'Hidden network', showIf: c => c.template === 'wifi' },

      // vCard: 5 short fields cluster naturally, name on its own, phone + email
      // share a row, org + website share a row.
      { key: 'vcardName', type: 'text', label: 'Full name', showIf: c => c.template === 'vcard' },
      { type: 'row', children: [
        { key: 'vcardPhone', type: 'text', label: 'Phone' },
        { key: 'vcardEmail', type: 'text', label: 'Email' },
      ], showIf: c => c.template === 'vcard' },
      { type: 'row', children: [
        { key: 'vcardOrg', type: 'text', label: 'Organization' },
        { key: 'vcardUrl', type: 'url',  label: 'Website' },
      ], showIf: c => c.template === 'vcard' },

      { type: 'section', label: 'Appearance' },
      { key: 'label', type: 'text', label: 'Caption' },
      { key: 'size', type: 'number', label: 'QR size', min: 64, max: 2048, step: 16, slider: true, suffix: 'px' },
      { type: 'row', children: [
        { key: 'fgColor', type: 'color', label: 'Foreground' },
        { key: 'bgColor', type: 'color', label: 'Background' },
      ] },
      { key: 'ecLevel', type: 'select', label: 'Error correction',
        options: [
          { value: 'L', label: 'Low (~7%)' },
          { value: 'M', label: 'Medium (~15%)' },
          { value: 'Q', label: 'Quartile (~25%)' },
          { value: 'H', label: 'High (~30%), needed for centre logos' },
        ],
        help: 'Higher levels survive scratches and centre overlays at the cost of denser modules.' },
      { key: 'frameless', type: 'toggle', label: 'Frameless (edge-to-edge)',
        help: 'Removes the white card around the QR. The required quiet zone inside the code stays (scanners need it).' },

      { type: 'section', label: 'Centre logo', collapsed: true },
      { key: 'logoUrl', type: 'asset', label: 'Logo image', accept: 'image/*',
        help: 'Drops a small logo into the centre of the QR. Use error correction H so the code stays scannable.' },
      { key: 'logoSize', type: 'number', label: 'Logo size (% of QR, long edge)', min: 10, max: 30, step: 1, slider: true,
        showIf: c => !!c.logoUrl,
        help: 'The logo keeps its aspect ratio. The value controls its long edge as a % of the QR. Keep ≤ 22% for reliable scanning, and pair with EC Level H.' },

      { type: 'section', label: 'Theme' },
      themeField(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    root.className = `bb-slide bb-slide-qr bb-theme-${c.theme ?? 'minimal-dark'}`;
    const payload = buildPayload(c).trim();
    const size = Math.max(64, Math.min(2048, c.size ?? 480));
    // The card background follows `bgColor` so the framed card visually matches
    // the QR's own quiet zone (the SVG/canvas bg fill). The caption follows
    // `fgColor` so it stays readable against whatever bg the user picks.
    // Frameless drops padding/shadow/radius, the QR fills the widget while
    // the scanner-required internal quiet zone (QUIET modules) stays.
    const cardBg = String(c.bgColor ?? '#ffffff');
    const captionColor = String(c.fgColor ?? '#000000');
    const frameless = !!c.frameless;
    const cardCls = `bb-qr-card${frameless ? ' bb-qr-frameless' : ''}`;
    // In frameless mode the card itself becomes transparent so the slide bg
    // (or widget bg) shows through, and only the QR + its quiet zone tint the
    // area. Framed mode paints the card with bgColor.
    const cardStyle = frameless ? '' : `background-color:${escapeAttr(cardBg)};`;
    if (!payload) {
      root.innerHTML = `${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
        <div class="${cardCls}" style="${cardStyle}"><div class="bb-qr-empty" style="padding:40px;color:rgba(255,255,255,.5);">Fill in the ${escapeHtml(c.template ?? 'url')} details to generate a QR code.</div></div>`;
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }
    const ecc = ['L', 'M', 'Q', 'H'].includes(c.ecLevel) ? c.ecLevel : 'M';
    const hasLogo = !!c.logoUrl;

    const failMessage = () => {
      ctx?.onError?.();
      const target = root.querySelector('.bb-qr-card');
      if (target) target.innerHTML =
        `<div class="bb-qr-empty" style="padding:40px;color:rgba(255,255,255,.5);text-align:center;">⚠️ QR code generator unavailable.<br><span style="opacity:.7;font-size:.9em;">Showing the payload instead:</span><br><code style="display:inline-block;margin-top:8px;padding:6px 10px;background:rgba(255,255,255,.08);border-radius:6px;font-size:.85em;max-width:80%;word-break:break-all;">${escapeHtml(payload)}</code></div>`;
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
      ? `<canvas class="bb-qr-img bb-qr-canvas" width="${size}" height="${size}" aria-label="QR code"></canvas>`
      : matrixToSvg(matrix, size, c.fgColor, c.bgColor);
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="${cardCls}" style="${cardStyle}">
        ${qrMarkup}
        ${c.label ? `<div class="bb-qr-caption" style="color:${escapeAttr(captionColor)};">${escapeHtml(c.label)}</div>` : ''}
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
          drawMatrixToCanvas(dctx, matrix, size, c.fgColor, c.bgColor);
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

