import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

export default register({
  type: 'audio-viz',
  label: 'Audio Visualizer',
  group: 'media',
  icon: '🎵',
  network: true,
  schemaVersion: 2,
  defaults: () => ({
    url: '',
    barCount: 64,
    style: 'bars',
    colorA: '#8b5cf6',
    colorB: '#06b6d4',
    theme: 'neon-cyber',
  }),
  schema: () => ({
    fields: [
      { type: 'section', label: 'Source' },
      { key: 'url',  type: 'asset', label: 'Audio URL', accept: 'audio/*' },

      { type: 'section', label: 'Visualiser' },
      { key: 'style', type: 'select', label: 'Style', options: [
        { value: 'bars',     label: 'Bars (vertical)' },
        { value: 'waveform', label: 'Waveform (oscilloscope)' },
        { value: 'circle',   label: 'Radial bars (circle)' },
        { value: 'dots',     label: 'Dots (pulsing)' },
      ] },
      { key: 'barCount', type: 'number', label: 'Bar / dot count', min: 8, max: 256, slider: true,
        showIf: c => (c.style ?? 'bars') !== 'waveform' },
      { type: 'row', children: [
        { key: 'colorA', type: 'color', label: 'Low' },
        { key: 'colorB', type: 'color', label: 'High' },
      ] },
      themeField(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    root.className = `bb-slide bb-slide-audio bb-theme-${c.theme ?? 'neon-cyber'}`;
    root.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:32px;';
    // Empty URL → friendly empty-state. Without this guard the <audio>
    // tag has src="" → silent broken player + a permanent black canvas.
    if (!c.url) {
      root.innerHTML = `${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
        <div style="color:currentColor;opacity:.55;font:14px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;padding:24px;">
          <div style="font-size:48px;opacity:.5;margin-bottom:8px;">🎵</div>
          <div>Pick an audio file in the inspector.<br>The visualiser will sync to its frequency spectrum.</div>
        </div>`;
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <canvas class="bb-audio-canvas" width="800" height="400" style="width:80%;max-width:1100px;height:40vh;"></canvas>
      <audio src="${escapeHtml(c.url)}" autoplay loop crossorigin="anonymous"></audio>
    `;
    container.appendChild(root);

    const canvas = root.querySelector('.bb-audio-canvas');
    const audio = root.querySelector('audio');
    audio.addEventListener('error', () => {
      if (ctx?.onError?.()) return;
      root.innerHTML = `${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
        <div style="color:currentColor;opacity:.55;font:14px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;padding:24px;">
          <div style="font-size:48px;opacity:.5;margin-bottom:8px;">🎵</div>
          <div>⚠️ Audio could not be loaded.<br><span style="opacity:.7;font-size:.85em;">CORS-friendly source required for the visualiser.</span></div>
        </div>`;
    });
    const dctx = canvas.getContext('2d');
    const style = ['bars', 'waveform', 'circle', 'dots'].includes(c.style) ? c.style : 'bars';
    const colorA = c.colorA || '#8b5cf6';
    const colorB = c.colorB || '#06b6d4';

    let actx, analyser, src, raf;
    const showCorsWarning = () => {
      root.innerHTML = `${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
        <div style="color:currentColor;opacity:.55;font:14px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;padding:24px;max-width:520px;">
          <div style="font-size:48px;opacity:.5;margin-bottom:8px;">🎵</div>
          <div>⚠️ Visualiser blocked by CORS.</div>
          <div style="opacity:.7;font-size:.85em;margin-top:8px;">The audio plays, but the source must send <code>Access-Control-Allow-Origin</code> for the spectrum to read it. Self-host the file or pick a CORS-friendly source.</div>
        </div>`;
    };
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
          showCorsWarning();
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
      if (style === 'waveform') {
        dctx.fillStyle = 'rgba(0,0,0,0.4)';
      } else {
        dctx.fillStyle = 'rgba(0,0,0,0.18)';
      }
      dctx.fillRect(0, 0, canvas.width, canvas.height);
      switch (style) {
        case 'waveform': drawWaveform(dctx, analyser, canvas, colorA, colorB); break;
        case 'circle':   drawCircle(dctx, analyser, canvas, c.barCount ?? 64, colorA, colorB); break;
        case 'dots':     drawDots(dctx, analyser, canvas, c.barCount ?? 64, colorA, colorB); break;
        default:         drawBars(dctx, analyser, canvas, c.barCount ?? 64, colorA, colorB); break;
      }
    };
    audio.addEventListener('play', start, { once: true });
    audio.play?.().catch(() => {});

    return composeDispose(() => {
      cancelAnimationFrame(raf);
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch {}
      try { actx?.close(); } catch {}
      root.remove();
    });
  },
});

function drawBars(ctx, analyser, canvas, bc, colorA, colorB) {
  const freq = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freq);
  const w = canvas.width / bc;
  for (let i = 0; i < bc; i++) {
    const v = freq[Math.floor(i * freq.length / bc)] / 255;
    const h = v * canvas.height;
    const grad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - h);
    grad.addColorStop(0, colorA); grad.addColorStop(1, colorB);
    ctx.fillStyle = grad;
    ctx.fillRect(i * w + w * 0.1, canvas.height - h, w * 0.8, h);
  }
}

function drawWaveform(ctx, analyser, canvas, colorA, colorB) {
  // Time-domain oscilloscope. Single stroke; line gradient runs from A→B
  // across the width to give it a subtle shift.
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  ctx.lineWidth = 3;
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, colorA); grad.addColorStop(1, colorB);
  ctx.strokeStyle = grad;
  ctx.beginPath();
  const step = canvas.width / buf.length;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] / 128 - 1; // -1..1
    const y = canvas.height / 2 + v * canvas.height / 2.4;
    if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(i * step, y);
  }
  ctx.stroke();
}

function drawCircle(ctx, analyser, canvas, bc, colorA, colorB) {
  const freq = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freq);
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const r0 = Math.min(canvas.width, canvas.height) * 0.18;
  const maxLen = Math.min(canvas.width, canvas.height) * 0.32;
  for (let i = 0; i < bc; i++) {
    const v = freq[Math.floor(i * freq.length / bc)] / 255;
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
  // Subtle inner ring to anchor the visual.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r0 - 4, 0, Math.PI * 2); ctx.stroke();
}

function drawDots(ctx, analyser, canvas, bc, colorA, colorB) {
  const freq = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freq);
  const spacing = canvas.width / (bc + 1);
  const cy = canvas.height / 2;
  for (let i = 0; i < bc; i++) {
    const v = freq[Math.floor(i * freq.length / bc)] / 255;
    const radius = 4 + v * Math.min(canvas.height / 3, 60);
    const x = (i + 1) * spacing;
    const grad = ctx.createRadialGradient(x, cy, 1, x, cy, radius);
    grad.addColorStop(0, colorB);
    grad.addColorStop(1, colorA + '00');  // fade alpha tail
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, cy, radius, 0, Math.PI * 2); ctx.fill();
  }
}

