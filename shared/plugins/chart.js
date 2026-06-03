import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { liveSource } from '../live-source.js';
import { offlineLiveOpts, SOURCE_OPTIONS } from '../offline-data.js';
import { escapeHtml } from '../utils/escape.js';

// Tiny pure-canvas charts (line, bar, pie). No external lib, keeps dispose simple.
// For richer charts: swap to Chart.js by registering a `chart-pro` plugin variant.

function parseSeries(payload) {
  // payload: object | array. Accept several shapes:
  //   [{label, value}, ...]   (also accepts `count`/`y` as the value key)
  //   { labels: [...], values: [...] }
  //   array of numbers (auto labels)
  // num() coerces then floors non-numbers to 0. `+x ?? 0` does NOT: `??` only
  // catches null/undefined, so `+undefined` (NaN) slipped through and poisoned
  // every downstream Math.max/scale, silently blanking the chart.
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  if (Array.isArray(payload)) {
    if (typeof payload[0] === 'number') return payload.map((v, i) => ({ label: String(i + 1), value: num(v) }));
    return payload.map(p => ({ label: p?.label ?? p?.name ?? '', value: num(p?.value ?? p?.count ?? p?.y) }));
  }
  if (payload && Array.isArray(payload.labels) && Array.isArray(payload.values)) {
    return payload.labels.map((l, i) => ({ label: l, value: num(payload.values[i]) }));
  }
  return [];
}

const PIE_COLORS = ['#8b5cf6','#06b6d4','#22d3ee','#f59e0b','#ef4444','#10b981','#ec4899','#3b82f6'];
// Canvas text can't use CSS container-query units, so axis/legend fonts and the
// paddings/offsets that position them are sized in px and multiplied by `s` — a
// scale factor the render derives from the canvas height. Without it a full-slide
// chart drew 12px labels on an ~800px-tall canvas (tiny on a TV). s≈1 at the
// reference height, capped so a 4K chart doesn't get absurd.
const axisFont = (s) => `${(12 * s).toFixed(1)}px Inter, sans-serif`;
const axisLabelFont = (s) => `600 ${(13 * s).toFixed(1)}px Inter, sans-serif`;

// Reserves extra padding for axis labels so they don't clip the plot area. Scales
// with `s` so the gutter grows together with the (now larger) tick labels.
function plotPadding(opts) {
  const s = opts.s || 1;
  return {
    top: (opts.showLegend ? 36 : 16) * s,
    right: 16 * s,
    bottom: (opts.xLabel ? 56 : 36) * s,
    left: (opts.yLabel ? 60 : 44) * s,
  };
}

function drawAxisLabels(ctx, w, h, p, opts) {
  const s = opts.s || 1;
  ctx.fillStyle = withAlpha(opts.ink, 0.7);
  ctx.font = axisLabelFont(s);
  if (opts.xLabel) {
    ctx.textAlign = 'center';
    ctx.fillText(opts.xLabel, p.left + (w - p.left - p.right) / 2, h - 12 * s);
  }
  if (opts.yLabel) {
    ctx.save();
    ctx.translate(16 * s, p.top + (h - p.top - p.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(opts.yLabel, 0, 0);
    ctx.restore();
  }
  ctx.textAlign = 'start';
}

function drawLegend(ctx, w, items, opts) {
  const s = opts.s || 1;
  ctx.font = axisFont(s);
  ctx.textBaseline = 'middle';
  const widths = items.map(it => ctx.measureText(it.label).width + 22 * s);
  const totalW = widths.reduce((a, b) => a + b, 0) + (items.length - 1) * 14 * s;
  let x = (w - totalW) / 2;
  const y = 18 * s;
  const box = 10 * s;
  items.forEach((it, i) => {
    ctx.fillStyle = it.color;
    ctx.fillRect(x, y - box / 2, box, box);
    ctx.fillStyle = withAlpha(opts.ink, 0.85);
    ctx.fillText(it.label, x + box + 4 * s, y);
    x += widths[i] + 14 * s;
  });
  ctx.textBaseline = 'alphabetic';
}

function drawLine(ctx, series, w, h, opts) {
  if (series.length < 2) return;
  const p = plotPadding(opts);
  const valMax = Math.max(...series.map(s => s.value)) || 1;
  const valMin = Math.min(...series.map(s => s.value), 0);
  const max = Number.isFinite(opts.yMax) && opts.yMax > 0 ? opts.yMax : valMax;
  const min = valMin;
  const span = max - min || 1;
  const plotW = w - p.left - p.right;
  const plotH = h - p.top - p.bottom;
  const lineColor = opts.palette?.[0] || '#8b5cf6';
  const s = opts.s || 1;

  ctx.strokeStyle = lineColor; ctx.lineWidth = 3 * s;
  ctx.beginPath();
  series.forEach((s, i) => {
    const x = p.left + plotW * (i / (series.length - 1));
    const y = p.top + plotH - plotH * ((s.value - min) / span);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.lineTo(p.left + plotW, p.top + plotH); ctx.lineTo(p.left, p.top + plotH); ctx.closePath();
  // Match the area fill to the line colour at 18% alpha. hexToRgba parses
  // the line colour so a custom palette gets a colour-matched area.
  ctx.fillStyle = hexToRgba(lineColor, 0.18); ctx.fill();
  // Axes
  ctx.strokeStyle = withAlpha(opts.ink, 0.18); ctx.lineWidth = Math.max(1, s);
  ctx.beginPath(); ctx.moveTo(p.left, p.top); ctx.lineTo(p.left, p.top + plotH); ctx.lineTo(p.left + plotW, p.top + plotH); ctx.stroke();
  ctx.fillStyle = withAlpha(opts.ink, 0.6); ctx.font = axisFont(s);
  // Y-axis tick labels (min, mid, max)
  [0, 0.5, 1].forEach(t => {
    const v = min + t * span;
    const y = p.top + plotH - plotH * t;
    ctx.fillText(formatTick(v), 6 * s, y + 4 * s);
  });
  // X-axis labels
  series.forEach((d, i) => {
    const x = p.left + plotW * (i / (series.length - 1));
    const txt = String(d.label);
    const tw = ctx.measureText(txt).width;
    ctx.fillText(txt, x - tw / 2, p.top + plotH + 16 * s);
  });
  // Value labels at each point
  if (opts.showValues) {
    ctx.fillStyle = withAlpha(opts.ink, 0.85);
    series.forEach((d, i) => {
      const x = p.left + plotW * (i / (series.length - 1));
      const y = p.top + plotH - plotH * ((d.value - min) / span);
      const txt = formatTick(d.value);
      const tw = ctx.measureText(txt).width;
      ctx.fillText(txt, x - tw / 2, y - 8 * s);
    });
  }
  drawAxisLabels(ctx, w, h, p, opts);
  if (opts.showLegend) drawLegend(ctx, w, [{ label: opts.seriesLabel || 'Value', color: lineColor }], opts);
}

function drawBar(ctx, series, w, h, opts) {
  const s = opts.s || 1;
  const p = plotPadding(opts);
  const valMax = Math.max(...series.map(d => d.value)) || 1;
  const max = Number.isFinite(opts.yMax) && opts.yMax > 0 ? opts.yMax : valMax;
  const gap = 8 * s;
  const plotW = w - p.left - p.right;
  const plotH = h - p.top - p.bottom;
  const bw = (plotW - gap * (series.length - 1)) / series.length;
  // Gradient picks first two palette colours when set; defaults preserve the
  // brand purple→cyan gradient users have grown used to.
  const grad0 = opts.palette?.[0] || '#8b5cf6';
  const grad1 = opts.palette?.[1] || opts.palette?.[0] || '#06b6d4';
  // Axes first so bars overlay them.
  ctx.strokeStyle = withAlpha(opts.ink, 0.18); ctx.lineWidth = Math.max(1, s);
  ctx.beginPath(); ctx.moveTo(p.left, p.top); ctx.lineTo(p.left, p.top + plotH); ctx.lineTo(p.left + plotW, p.top + plotH); ctx.stroke();
  ctx.fillStyle = withAlpha(opts.ink, 0.6); ctx.font = axisFont(s);
  [0, 0.5, 1].forEach(t => {
    const v = t * max;
    const y = p.top + plotH - plotH * t;
    ctx.fillText(formatTick(v), 6 * s, y + 4 * s);
  });
  series.forEach((d, i) => {
    const bh = plotH * Math.max(0, Math.min(1, d.value / max));
    const x = p.left + i * (bw + gap), y = p.top + plotH - bh;
    const grad = ctx.createLinearGradient(0, y, 0, p.top + plotH);
    grad.addColorStop(0, grad0); grad.addColorStop(1, grad1);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = withAlpha(opts.ink, 0.7); ctx.font = axisFont(s);
    const labelTxt = String(d.label);
    const lw = ctx.measureText(labelTxt).width;
    ctx.fillText(labelTxt, x + bw / 2 - lw / 2, p.top + plotH + 16 * s);
    if (opts.showValues) {
      ctx.fillStyle = withAlpha(opts.ink, 0.85);
      const vt = formatTick(d.value);
      const vw = ctx.measureText(vt).width;
      ctx.fillText(vt, x + bw / 2 - vw / 2, y - 4 * s);
    }
  });
  drawAxisLabels(ctx, w, h, p, opts);
  if (opts.showLegend) drawLegend(ctx, w, [{ label: opts.seriesLabel || 'Value', color: grad0 }], opts);
}

function drawPie(ctx, series, w, h, opts) {
  const s = opts.s || 1;
  const total = series.reduce((a, d) => a + d.value, 0) || 1;
  // Reserve top room for a legend if requested.
  const topReserve = (opts.showLegend ? 40 : 8) * s;
  const cx = w / 2, cy = topReserve + (h - topReserve) / 2;
  const r = Math.min(w, h - topReserve) / 2.4;
  const palette = opts.palette?.length ? opts.palette : PIE_COLORS;
  let a = -Math.PI / 2;
  series.forEach((d, i) => {
    const a2 = a + (d.value / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a, a2);
    ctx.closePath();
    ctx.fillStyle = palette[i % palette.length];
    ctx.fill();
    // Value label slice, only if there's room (small slices skip)
    if (opts.showValues && (d.value / total) > 0.04) {
      const mid = (a + a2) / 2;
      const tx = cx + Math.cos(mid) * r * 0.62;
      const ty = cy + Math.sin(mid) * r * 0.62;
      const txt = Math.round((d.value / total) * 100) + '%';
      ctx.font = axisLabelFont(s);
      ctx.fillStyle = withAlpha(opts.ink, 0.95);
      const tw = ctx.measureText(txt).width;
      ctx.fillText(txt, tx - tw / 2, ty + 4 * s);
    }
    a = a2;
  });
  if (opts.showLegend) {
    drawLegend(ctx, w, series.map((d, i) => ({ label: String(d.label || '—'), color: palette[i % palette.length] })), opts);
  }
}

// Parse #rgb/#rrggbb into "rgba(r, g, b, a)" with the requested alpha. Used
// by drawLine's area fill so a custom line colour gets a colour-matched
// translucent underlay.
function hexToRgba(hex, alpha) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return `rgba(139,92,246,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Apply alpha to a resolved CSS colour. Handles getComputedStyle's
// "rgb(r, g, b)" / "rgba(...)" output and #hex; falls back to translucent ink.
function withAlpha(color, alpha) {
  const str = String(color || '').trim();
  const m = str.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
  if (/^#/.test(str)) return hexToRgba(str, alpha);
  return `rgba(241,241,244,${alpha})`;
}

// Compact tick formatter: 1234 → "1.2k", 1234567 → "1.2M".
function formatTick(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

export default register({
  type: 'chart',
  label: 'Chart',
  group: 'data',
  icon: '📊',
  network: true,
  schemaVersion: 2,
  defaults: () => ({ ...colorOverrideDefaults(),
    kind: 'bar',
    source: 'inline',
    data: [
      { label: 'Mon', value: 4 }, { label: 'Tue', value: 7 }, { label: 'Wed', value: 5 },
      { label: 'Thu', value: 9 }, { label: 'Fri', value: 6 },
    ],
    dataUrl: '',
    theme: 'minimal-dark',
    xLabel: '',
    yLabel: '',
    yMax: 0,
    showLegend: true,
    showValues: false,
    seriesLabel: '',
    palette: [],
  }),
  schema: () => ({
    fields: [
      { type: 'section', label: 'Data' },
      { key: 'kind', type: 'select', label: 'Chart type', options: ['line','bar','pie'] },
      { key: 'source', type: 'select', label: 'Data source', options: SOURCE_OPTIONS,
        help: 'Offline: the Studio fetches the JSON URL on “Refresh data” and stores it; the display reads that — no live call on screen.' },
      { key: 'data', type: 'table', label: 'Data points',
        showIf: c => (c.source ?? 'inline') === 'inline',
        columns: [{ key: 'label', label: 'Label' }, { key: 'value', label: 'Value', type: 'number' }] },
      { key: 'dataUrl', type: 'url', label: 'Remote JSON URL', test: 'json',
        showIf: c => c.source === 'url' || c.source === 'stored' },

      { type: 'section', label: 'Axes & labels', showIf: c => (c.kind ?? 'bar') !== 'pie' },
      { type: 'row', children: [
        { key: 'xLabel', type: 'text', label: 'X-axis label' },
        { key: 'yLabel', type: 'text', label: 'Y-axis label' },
      ], showIf: c => (c.kind ?? 'bar') !== 'pie' },
      { key: 'yMax', type: 'number', label: 'Y-axis max (0 = auto-fit data)', min: 0, step: 1,
        showIf: c => (c.kind ?? 'bar') !== 'pie',
        help: 'Set a fixed ceiling so e.g. a fundraising goal renders honestly rather than auto-scaling to the highest value.' },
      { key: 'seriesLabel', type: 'text', label: 'Series name (for the legend)',
        showIf: c => (c.kind ?? 'bar') !== 'pie' && c.showLegend !== false },

      { type: 'section', label: 'Appearance' },
      { type: 'row', children: [
        { key: 'showLegend', type: 'toggle', label: 'Legend' },
        { key: 'showValues', type: 'toggle', label: 'Value labels' },
      ] },
      { key: 'palette', type: 'list', label: 'Color palette',
        itemShape: [{ key: 'color', type: 'color', label: 'Colour' }],
        help: 'Optional, override the default palette with brand colours. Bar/line use the first two for the gradient, pie cycles through all entries.' },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-chart bb-theme-${c.theme ?? 'minimal-dark'}`;
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <canvas class="bb-chart-canvas" width="1100" height="540"></canvas>
    `;
    container.appendChild(root);
    const canvas = root.querySelector('.bb-chart-canvas');
    const dctx = canvas.getContext('2d');
    const draw = (payload) => {
      // payload may be a parsed JSON object/array, or a JSON string
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { payload = []; }
      }
      const series = parseSeries(payload);
      const kind = c.kind ?? 'bar';
      // An empty series (or a one-point line) draws nothing useful, show why
      // instead of a blank canvas the user can't tell apart from a load error.
      if (!series.length || (kind === 'line' && series.length < 2)) {
        canvas.parentElement.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:currentColor;opacity:.6;font:13px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;padding:16px;">${
          series.length ? 'A line chart needs at least two data points.' : 'No data to chart yet.'
        }</div>`;
        return;
      }
      // High-DPI
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.parentElement.clientWidth * 0.92;
      const cssH = canvas.parentElement.clientHeight * 0.72;
      canvas.width = cssW * dpr; canvas.height = cssH * dpr;
      canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
      dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dctx.clearRect(0, 0, cssW, cssH);
      // Palette can come as the new list-of-{color} shape OR, for backwards
      // compat with v2 widgets, as a comma-separated hex string. Normalise
      // both to an array of valid hex strings.
      const rawPalette = Array.isArray(c.palette)
        ? c.palette.map(p => typeof p === 'string' ? p : p?.color).filter(Boolean)
        : String(c.palette ?? '').split(',').map(s => s.trim()).filter(Boolean);
      const paletteRaw = rawPalette
        .map(s => /^#/.test(s) ? s : '#' + s)
        .filter(s => /^#[0-9a-f]{3,8}$/i.test(s));
      const palette = paletteRaw.length ? paletteRaw : null;
      // Resolve the slide's text colour (theme / brand-kit / per-widget
      // override all funnel through .bb-slide's `color`) so canvas text & grid
      // adapt instead of being hardcoded white.
      const ink = getComputedStyle(canvas).color || 'rgb(241,241,244)';
      // Font/padding scale: 1 at the ~480px reference height, growing with the
      // canvas so a full-slide chart gets readable labels, capped at 3.2× so a
      // 4K chart stays sane. Floors at .85 so a small widget keeps a px minimum.
      const s = Math.max(0.85, Math.min(3.2, cssH / 480));
      const opts = {
        ink,
        s,
        xLabel: c.xLabel || '',
        yLabel: c.yLabel || '',
        yMax: Number(c.yMax) || 0,
        showLegend: c.showLegend !== false,
        showValues: !!c.showValues,
        seriesLabel: c.seriesLabel || '',
        palette,
      };
      if (kind === 'line') drawLine(dctx, series, cssW, cssH, opts);
      else if (kind === 'pie') drawPie(dctx, series, cssW, cssH, opts);
      else drawBar(dctx, series, cssW, cssH, opts);
    };

    // Inline data draws immediately; a remote source fetches once via the shared
    // live-source seam. A load failure surfaces instead of a silently empty
    // canvas, an unreachable URL would otherwise look identical to "no data".
    const stored = c.source === 'stored';
    if (stored || (c.source === 'url' && c.dataUrl)) {
      // Offline with nothing provisioned yet → draw the empty-state hint.
      if (stored && c._offline?.data === undefined) { draw([]); return composeDispose(() => root.remove()); }
      const stop = liveSource({
        url: c.dataUrl,
        signal: ctx?.signal,
        ...offlineLiveOpts(c),
        onData: (data) => draw(data),
        onError: (e) => {
          if (ctx?.onError?.()) return;
          canvas.parentElement.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:currentColor;opacity:.65;font:13px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;padding:16px;">⚠️ ${escapeHtml(e.message || 'Could not load chart data')}</div>`;
        },
      });
      return composeDispose(() => { stop(); root.remove(); });
    }
    draw(Array.isArray(c.data) ? c.data : []);
    return composeDispose(() => root.remove());
  },
});

