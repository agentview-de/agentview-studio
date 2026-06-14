import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { mediaPlaceholder } from '../media-placeholder.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';

export default register({
  type: 'audio-viz',
  label: 'Audio Visualizer',
  group: 'media',
  icon: '🎵',
  network: true,
  schemaVersion: 2,
  defaults: () => ({
    url: '',
    nowPlaying: '',
    style: 'bars',
    barCount: 64,
    mirror: false,
    sensitivity: 100,
    colorA: '#8b5cf6',
    colorB: '#06b6d4',
    volume: 100,
    theme: 'neon-cyber',
    ...colorOverrideDefaults(),
  }),
  schema: () => ({
    fields: [
      { type: 'section', label: 'Source', key: 'source' },
      { key: 'url', type: 'asset', label: 'Audio URL', accept: 'audio/*',
        help: 'The visualiser needs CORS access (Access-Control-Allow-Origin) to read the audio. Files uploaded to the library always work; remote URLs may play without visuals.' },
      { key: 'nowPlaying', type: 'text', label: 'Now-playing caption', placeholder: 'Playlist: Smooth Jazz',
        help: 'Shown as a themed caption under the visualiser.' },

      { type: 'section', label: 'Appearance', key: 'appearance' },
      // Style is the design gate — it must render above the fields it gates.
      { key: 'style', type: 'select', label: 'Style', buttons: true, options: [
        { value: 'bars',     label: 'Bars' },
        { value: 'waveform', label: 'Waveform' },
        { value: 'circle',   label: 'Radial' },
        { value: 'dots',     label: 'Dots' },
      ] },
      { key: 'barCount', type: 'number', label: 'Bar / dot count', min: 8, max: 256, slider: true,
        showIf: c => (c.style ?? 'bars') !== 'waveform',
        help: 'How many bars or dots the spectrum is split into — fewer for a chunky retro EQ, more for fine detail.' },
      { key: 'mirror', type: 'toggle', label: 'Mirror from centre',
        showIf: c => ['bars', 'dots'].includes(c.style ?? 'bars'),
        help: 'Draws the spectrum symmetrically outward from the middle — the classic equalizer look, great on wide screens.' },
      { key: 'sensitivity', type: 'number', label: 'Sensitivity', min: 50, max: 300, step: 10, slider: true, suffix: '%',
        help: 'Boosts the visual response for quiet tracks. 100 % = raw level; higher values amplify (capped at full height).' },
      { type: 'row', children: [
        { key: 'colorA', type: 'color', label: 'Low (quiet)', clearable: true,
          help: 'Gradient colour pair for quiet → loud frequencies. Click × to reset to the widget defaults.' },
        { key: 'colorB', type: 'color', label: 'High (loud)', clearable: true },
      ] },

      { type: 'section', label: 'Playback', key: 'playback' },
      { key: 'volume', type: 'number', label: 'Volume', min: 0, max: 100, step: 5, slider: true, suffix: '%',
        help: 'Browsers may block un-muted autoplay until someone interacts with the page.' },

      ...themeColorSection(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    root.className = `bb-slide bb-slide-audio bb-theme-${c.theme ?? 'neon-cyber'}`;
    root.style.cssText = 'position:relative;width:100%;height:100%;box-sizing:border-box;padding:24px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:24px;';
    applyColorOverrides(root, c);

    // mediaPlaceholder() fills width/height 100% — inside this flex column it
    // must flex instead so the title keeps its row.
    const flexPlaceholder = opts => {
      const ph = mediaPlaceholder(opts);
      ph.style.height = 'auto';
      ph.style.flex = '1 1 auto';
      ph.style.minHeight = '0';
      ph.style.alignSelf = 'stretch';
      return ph;
    };

    // Empty URL → friendly empty-state. Without this guard the <audio>
    // tag has src="" → silent broken player + a permanent black canvas.
    if (!c.url) {
      if (slide.title) {
        const t = document.createElement('h1');
        t.className = 'bb-h1';
        t.textContent = slide.title;
        root.appendChild(t);
      }
      root.appendChild(flexPlaceholder({
        icon: '🎵',
        messageHtml: 'Pick an audio file in the inspector.<br>The visualiser will sync to its frequency spectrum.',
      }));
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }

    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <canvas class="bb-audio-canvas" data-field="url style barCount mirror sensitivity colorA colorB" width="800" height="400" style="width:80%;max-width:1100px;flex:1 1 auto;min-height:0;"></canvas>
      ${c.nowPlaying ? `<div class="bb-h2" data-field="nowPlaying" style="margin:0;font-size:clamp(14px,3cqmin,32px);opacity:.85;">${escapeHtml(c.nowPlaying)}</div>` : ''}
      <audio src="${escapeHtml(c.url)}" data-field="url volume" autoplay loop crossorigin="anonymous"></audio>
    `;
    container.appendChild(root);

    const canvas = root.querySelector('.bb-audio-canvas');
    const audio = root.querySelector('audio');
    if (typeof c.volume === 'number') {
      audio.volume = Math.max(0, Math.min(100, c.volume)) / 100;
    }

    const dctx = canvas.getContext('2d');
    const style = ['bars', 'waveform', 'circle', 'dots'].includes(c.style) ? c.style : 'bars';
    // Clearable colours: '' must fall through to the widget defaults (and the
    // `colorA + '00'` alpha-tail concat in drawDots relies on a 6-digit hex).
    const colorA = c.colorA || '#8b5cf6';
    const colorB = c.colorB || '#06b6d4';
    const gain = Math.max(50, Math.min(300, Number(c.sensitivity) || 100)) / 100;
    const mirror = c.mirror === true && (style === 'bars' || style === 'dots');

    // The motion-trail fill used to be hardcoded rgba(0,0,0,…), which turned
    // the canvas into a dark slab on light themes. Derive it from the theme
    // background instead; gradient backgrounds (not a valid canvas fillStyle)
    // fall back to the resolved background-color, then to black — identical to
    // the old behavior on the dark gradient themes. Same idea for the radial
    // style's anchor ring, which was a fixed white.
    const cs = getComputedStyle(root);
    const themeBg = (cs.getPropertyValue('--bb-st-bg') || '').trim();
    let trailColor = themeBg && !themeBg.includes('gradient') ? themeBg : '';
    if (!trailColor) {
      const bgc = cs.backgroundColor;
      trailColor = bgc && bgc !== 'rgba(0, 0, 0, 0)' && bgc !== 'transparent' ? bgc : '#000';
    }
    const ringColor = (cs.getPropertyValue('--bb-st-fg') || '').trim() || '#fff';

    // Size the backing store from the CANVAS BOX, not a fixed 800×400 / 40vh:
    // viewport units are wrong inside tiled layouts (a half-height widget
    // still measured 40% of the SCREEN) and the fixed resolution was blurry
    // on 4K TVs. devicePixelRatio is capped at 2 to bound the fill cost.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const syncSize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    };
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    syncSize();

    let actx, analyser, src, raf;
    let hintEl = null;
    const clearHint = () => { if (hintEl) { hintEl.remove(); hintEl = null; } };
    const showFatal = messageHtml => {
      cancelAnimationFrame(raf);
      clearTimeout(hintTimer);
      hintEl = null; // wiped with the rest of the subtree below
      root.innerHTML = slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : '';
      root.appendChild(flexPlaceholder({ icon: '🎵', messageHtml }));
    };

    audio.addEventListener('error', () => {
      if (ctx?.onError?.()) return;
      showFatal('⚠️ Audio could not be loaded.<br><span style="opacity:.7;font-size:.85em;">CORS-friendly source required for the visualiser.</span>');
    });

    const start = async () => {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        // createMediaElementSource throws SecurityError when the cross-origin
        // audio doesn't expose CORS headers, that's the most common failure
        // for this widget. Surface it as a user-readable warning instead of
        // silently dying with a console.warn.
        try {
          src = actx.createMediaElementSource(audio);
        } catch (corsErr) {
          showFatal('⚠️ Visualiser blocked by CORS.<div style="opacity:.7;font-size:.85em;margin-top:8px;">The audio plays, but the source must send <code>Access-Control-Allow-Origin</code> for the spectrum to read it. Self-host the file or pick a CORS-friendly source.</div>');
          throw corsErr;
        }
        analyser = actx.createAnalyser();
        // Waveform wants the time-domain buffer at full resolution; the other
        // styles only need a moderate FFT for binned frequency data.
        analyser.fftSize = style === 'waveform' ? 2048 : 512;
        src.connect(analyser);
        analyser.connect(actx.destination);
        await audio.play().catch(() => {});
        loop();
      } catch (e) { console.warn('audio viz', e); }
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      // Subtle motion-blur "trail" effect for non-waveform styles. Waveform
      // needs a hard wipe, the line otherwise smears into a fuzzy blob.
      // globalAlpha (instead of baked-in rgba) lets the trail use ANY theme
      // background string the browser can parse.
      dctx.globalAlpha = style === 'waveform' ? 0.4 : 0.18;
      dctx.fillStyle = trailColor;
      dctx.fillRect(0, 0, canvas.width, canvas.height);
      dctx.globalAlpha = 1;
      switch (style) {
        case 'waveform': drawWaveform(dctx, analyser, canvas, colorA, colorB, gain); break;
        case 'circle':   drawCircle(dctx, analyser, canvas, c.barCount ?? 64, colorA, colorB, gain, ringColor); break;
        case 'dots':     drawDots(dctx, analyser, canvas, c.barCount ?? 64, colorA, colorB, gain, mirror); break;
        default:         drawBars(dctx, analyser, canvas, c.barCount ?? 64, colorA, colorB, gain, mirror); break;
      }
    };
    audio.addEventListener('play', start, { once: true });
    audio.addEventListener('play', () => { clearTimeout(hintTimer); clearHint(); });
    audio.play?.().catch(() => {});

    // Autoplay with sound needs a user gesture in the admin preview, so the
    // canvas can sit idle until interaction. If playback hasn't started after
    // a moment, show a click-to-start hint (editor-facing; on published
    // displays kiosk autoplay policies normally let it start on its own).
    const hintTimer = setTimeout(() => {
      if (!audio.paused || hintEl) return;
      hintEl = document.createElement('div');
      hintEl.textContent = '▶ Click to start the audio preview';
      hintEl.style.cssText =
        'position:absolute;left:50%;bottom:8%;transform:translateX(-50%);padding:8px 16px;border-radius:999px;' +
        'font:13px/1 var(--bb-font, Inter, sans-serif);cursor:pointer;white-space:nowrap;' +
        'color:color-mix(in srgb, var(--bb-st-fg, #f1f1f4) 80%, transparent);' +
        'background:color-mix(in srgb, var(--bb-st-fg, #f1f1f4) 12%, transparent);';
      root.appendChild(hintEl);
    }, 1500);
    root.addEventListener('click', () => {
      try { actx?.resume?.(); } catch {}
      audio.play?.().catch(() => {});
    });

    return composeDispose(() => {
      cancelAnimationFrame(raf);
      clearTimeout(hintTimer);
      ro.disconnect();
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch {}
      try { actx?.close(); } catch {}
      root.remove();
    });
  },
});

// Normalized 0..1 level for bin i of n, with the sensitivity gain applied and
// clamped so boosted quiet tracks still cap at full height.
function level(freq, i, n, gain) {
  return Math.min(1, (freq[Math.floor(i * freq.length / n)] / 255) * gain);
}

function drawBars(ctx, analyser, canvas, bc, colorA, colorB, gain, mirror) {
  const freq = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freq);
  const w = canvas.width / bc;
  // Mirrored: low frequencies start at the centre and fan outward both ways —
  // the classic symmetric equalizer, one bar of each pair per loop turn.
  const n = mirror ? Math.ceil(bc / 2) : bc;
  const cx = canvas.width / 2;
  for (let i = 0; i < n; i++) {
    const v = level(freq, i, n, gain);
    const h = v * canvas.height;
    const grad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - h);
    grad.addColorStop(0, colorA); grad.addColorStop(1, colorB);
    ctx.fillStyle = grad;
    if (mirror) {
      ctx.fillRect(cx + i * w + w * 0.1, canvas.height - h, w * 0.8, h);
      ctx.fillRect(cx - (i + 1) * w + w * 0.1, canvas.height - h, w * 0.8, h);
    } else {
      ctx.fillRect(i * w + w * 0.1, canvas.height - h, w * 0.8, h);
    }
  }
}

function drawWaveform(ctx, analyser, canvas, colorA, colorB, gain) {
  // Time-domain oscilloscope. Single stroke; line gradient runs from A→B
  // across the width to give it a subtle shift.
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  // Line weight scales with the backing store (3px at the old 400px height).
  ctx.lineWidth = Math.max(2, canvas.height * 0.0075);
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, colorA); grad.addColorStop(1, colorB);
  ctx.strokeStyle = grad;
  ctx.beginPath();
  const step = canvas.width / buf.length;
  for (let i = 0; i < buf.length; i++) {
    // Gain stretches the excursion around the midline, clamped to ±1.
    const v = Math.max(-1, Math.min(1, (buf[i] / 128 - 1) * gain));
    const y = canvas.height / 2 + v * canvas.height / 2.4;
    if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(i * step, y);
  }
  ctx.stroke();
}

function drawCircle(ctx, analyser, canvas, bc, colorA, colorB, gain, ringColor) {
  const freq = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freq);
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const r0 = Math.min(canvas.width, canvas.height) * 0.18;
  const maxLen = Math.min(canvas.width, canvas.height) * 0.32;
  for (let i = 0; i < bc; i++) {
    const v = level(freq, i, bc, gain);
    const angle = (i / bc) * Math.PI * 2 - Math.PI / 2;
    const len = v * maxLen;
    const x1 = cx + Math.cos(angle) * r0;
    const y1 = cy + Math.sin(angle) * r0;
    const x2 = cx + Math.cos(angle) * (r0 + len);
    const y2 = cy + Math.sin(angle) * (r0 + len);
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, colorA); grad.addColorStop(1, colorB);
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(2, (Math.PI * 2 * r0) / bc * 0.55);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  // Subtle inner ring to anchor the visual — theme foreground at low alpha so
  // it stays visible on light themes too.
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r0 - 4, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawDots(ctx, analyser, canvas, bc, colorA, colorB, gain, mirror) {
  const freq = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freq);
  const spacing = canvas.width / (bc + 1);
  const cy = canvas.height / 2;
  // Radius scales with the backing store (matches the old 4 + …min(h/3, 60)
  // at the previous fixed 400px height, but stays proportional on 4K).
  const baseR = Math.max(2, canvas.height * 0.01);
  const maxR = Math.min(canvas.height / 3, canvas.height * 0.15);
  const n = mirror ? Math.ceil(bc / 2) : bc;
  const cx = canvas.width / 2;
  const dot = (x, radius) => {
    const grad = ctx.createRadialGradient(x, cy, 1, x, cy, radius);
    grad.addColorStop(0, colorB);
    grad.addColorStop(1, colorA + '00');  // fade alpha tail
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, cy, radius, 0, Math.PI * 2); ctx.fill();
  };
  for (let i = 0; i < n; i++) {
    const v = level(freq, i, n, gain);
    const radius = baseR + v * maxR;
    if (mirror) {
      dot(cx + (i + 0.5) * spacing, radius);
      dot(cx - (i + 0.5) * spacing, radius);
    } else {
      dot((i + 1) * spacing, radius);
    }
  }
}
