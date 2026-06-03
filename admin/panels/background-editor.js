// Reusable background editor — the general background tool. Edits a background
// object (see shared/background.js) and emits it live. Used for both widget
// and slide backgrounds.
//
//   mountBackgroundEditor(host, { get, onChange, assetPicker })

import { normalizeBackground, gradientCss } from '../../shared/background.js';
import { t } from '../i18n.js';

export function mountBackgroundEditor(host, { get, onChange, assetPicker, themeBg } = {}) {
  let bg = normalizeBackground(get?.());
  host.classList.add('avs-bg-editor');
  const emit = () => onChange?.(normalizeBackground(bg));
  // "Theme background" applies whenever a theme is in play — slides always
  // have one; widgets only if the widget's theme field is set. When present,
  // the runtime falls back to var(--bb-st-bg) for the layer, so "no override"
  // really shows the theme rather than being a no-op transparent.
  const hasThemeFallback = !!themeBg;

  const TYPES = [
    ['transparent', hasThemeFallback ? t('bg.themeBackground') : t('bg.transparent')],
    ['color', t('bg.color')],
    ['gradient', t('bg.gradient')],
    ['image', t('bg.image')],
  ];

  function render() {
    host.innerHTML = `
      <div class="bb-bezel-selector avs-bg-types">
        ${TYPES.map(([v, l]) => {
          const on = bg.type === v ? ' bb-on' : '';
          const chip = (v === 'transparent' && hasThemeFallback)
            ? `<span class="avs-bg-theme-chip" style="background:${themeBg}"></span>` : '';
          return `<button class="bb-bezel-btn${on}" data-type="${v}">${chip}${l}</button>`;
        }).join('')}
      </div>
      ${hasThemeFallback ? `<p class="bb-form-help avs-bg-help">${t('bg.slideHelp')}</p>` : ''}
      <div class="avs-bg-body" id="avs-bg-body"></div>`;
    host.querySelectorAll('[data-type]').forEach(b =>
      b.addEventListener('click', () => { bg.type = b.dataset.type; emit(); render(); }));
    const body = host.querySelector('#avs-bg-body');
    if (bg.type === 'color') body.appendChild(colorPanel());
    else if (bg.type === 'gradient') body.appendChild(gradientPanel());
    else if (bg.type === 'image') body.appendChild(imagePanel());
  }

  function opacityRow() {
    const w = document.createElement('label'); w.className = 'avs-bg-row';
    w.innerHTML = `<span>${t('bg.opacity')}</span>
      <input type="range" min="0" max="100" value="${Math.round(bg.opacity * 100)}">
      <span class="avs-bg-val">${Math.round(bg.opacity * 100)}%</span>`;
    const range = w.querySelector('input'), val = w.querySelector('.avs-bg-val');
    range.addEventListener('input', () => { bg.opacity = +range.value / 100; val.textContent = range.value + '%'; emit(); });
    return w;
  }

  function colorPanel() {
    const wrap = document.createElement('div');
    const c = document.createElement('label'); c.className = 'avs-bg-row';
    c.innerHTML = `<span>${t('bg.color')}</span><input type="color" value="${bg.color}"><span class="avs-bg-val">${bg.color}</span>`;
    const inp = c.querySelector('input'), val = c.querySelector('.avs-bg-val');
    inp.addEventListener('input', () => { bg.color = inp.value; val.textContent = inp.value; emit(); });
    wrap.append(c, opacityRow());
    return wrap;
  }

  function gradientPanel() {
    const wrap = document.createElement('div');

    // Live preview bar of the whole gradient.
    const preview = document.createElement('div');
    preview.className = 'avs-bg-preview';
    const updatePreview = () => { preview.style.background = gradientCss(bg.gradient); };
    wrap.appendChild(preview);

    const k = document.createElement('label'); k.className = 'avs-bg-row';
    k.innerHTML = `<span>${t('bg.gradientKind')}</span><select><option value="linear">Linear</option><option value="radial">Radial</option></select>`;
    k.querySelector('select').value = bg.gradient.kind;
    k.querySelector('select').addEventListener('change', e => { bg.gradient.kind = e.target.value; emit(); render(); });
    wrap.appendChild(k);

    if (bg.gradient.kind === 'linear') {
      const a = document.createElement('label'); a.className = 'avs-bg-row';
      a.innerHTML = `<span>${t('bg.angle')}</span><input type="number" min="0" max="360" value="${bg.gradient.angle}"><span>°</span>`;
      a.querySelector('input').addEventListener('input', e => { bg.gradient.angle = +e.target.value || 0; updatePreview(); emit(); });
      wrap.appendChild(a);
    }

    const stopsBox = document.createElement('div'); stopsBox.className = 'avs-bg-stops';
    const drawStops = () => {
      stopsBox.innerHTML = `<div class="avs-bg-sublabel">${t('bg.stops')}</div>`;
      bg.gradient.stops.forEach((s, i) => {
        const row = document.createElement('div'); row.className = 'avs-bg-stop';
        row.innerHTML = `<input type="color" value="${s.color}"><input type="number" min="0" max="100" value="${s.pos}"><span>%</span><button class="avs-iconbtn" ${bg.gradient.stops.length <= 2 ? 'disabled' : ''}>✕</button>`;
        const [col, pos] = row.querySelectorAll('input');
        col.addEventListener('input', () => { s.color = col.value; updatePreview(); emit(); });
        pos.addEventListener('input', () => { s.pos = +pos.value || 0; updatePreview(); emit(); });
        row.querySelector('button').addEventListener('click', () => {
          if (bg.gradient.stops.length > 2) { bg.gradient.stops.splice(i, 1); updatePreview(); emit(); drawStops(); }
        });
        stopsBox.appendChild(row);
      });
      const add = document.createElement('button'); add.className = 'bb-btn bb-btn-secondary avs-bg-addstop';
      add.textContent = '+ ' + t('bg.addStop');
      add.addEventListener('click', () => { bg.gradient.stops.push({ color: '#ffffff', pos: 50 }); updatePreview(); emit(); drawStops(); });
      stopsBox.appendChild(add);
    };
    drawStops();
    updatePreview();
    wrap.append(stopsBox, opacityRow());
    return wrap;
  }

  function imagePanel() {
    const wrap = document.createElement('div');
    const u = document.createElement('div'); u.className = 'avs-bg-row';
    u.innerHTML = `<span>${t('bg.url')}</span><input type="text" value="${esc(bg.image.url)}" placeholder="https://… / asset"><button class="bb-btn bb-btn-secondary">📁</button>`;
    const inp = u.querySelector('input');
    inp.addEventListener('input', () => { bg.image.url = inp.value; emit(); });
    u.querySelector('button').addEventListener('click', async () => {
      const url = await assetPicker?.('image'); if (url) { inp.value = url; bg.image.url = url; emit(); }
    });
    wrap.appendChild(u);

    const f = document.createElement('label'); f.className = 'avs-bg-row';
    f.innerHTML = `<span>${t('bg.fit')}</span><select><option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option></select>`;
    f.querySelector('select').value = bg.image.fit;
    f.querySelector('select').addEventListener('change', e => { bg.image.fit = e.target.value; emit(); });
    wrap.appendChild(f);

    const p = document.createElement('label'); p.className = 'avs-bg-row';
    p.innerHTML = `<span>${t('bg.position')}</span><select>${['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'].map(o => `<option>${o}</option>`).join('')}</select>`;
    p.querySelector('select').value = bg.image.position;
    p.querySelector('select').addEventListener('change', e => { bg.image.position = e.target.value; emit(); });
    wrap.appendChild(p);
    wrap.appendChild(opacityRow());
    return wrap;
  }

  render();
  return { getValue: () => normalizeBackground(bg) };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
