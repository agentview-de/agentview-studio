import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

// Injects the scroll keyframes once (works in player + admin preview).
// Two directions: ltr (left-to-right text scrolling right→left) is the
// default; rtl scrolls left→right and is the natural direction for Arabic /
// Hebrew content as well as a popular stylistic flip.
function ensureKeyframes() {
  if (document.getElementById('bb-ticker-kf')) return;
  const style = document.createElement('style');
  style.id = 'bb-ticker-kf';
  style.textContent =
    '@keyframes bb-ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }' +
    '@keyframes bb-ticker-scroll-rtl { from { transform: translateX(-50%); } to { transform: translateX(0); } }';
  document.head.appendChild(style);
}

export default register({
  type: 'ticker',
  label: 'News Ticker',
  group: 'basic',
  icon: '📜',
  schemaVersion: 2,
  defaults: () => ({ ...colorOverrideDefaults(),
    items: [
      { text: 'Welcome to agentView Studio' },
      { text: 'Edit these messages in the inspector' },
      { text: 'Drag to reorder · paste from a spreadsheet' },
    ],
    speed: 80,
    separator: '•',
    direction: 'ltr',
    pauseOnHover: false,
    theme: 'minimal-dark',
  }),
  schema: () => ({
    fields: [
      { key: 'items', type: 'table', label: 'Ticker messages',
        columns: [{ key: 'text', label: 'Message' }] },
      { key: 'speed', type: 'number', label: 'Speed', min: 20, max: 300, step: 10, slider: true, suffix: ' px/s' },
      { key: 'separator', type: 'text', label: 'Separator' },
      { key: 'direction', type: 'select', label: 'Direction', options: [
        { value: 'ltr', label: '← Right to left (default)' },
        { value: 'rtl', label: '→ Left to right (Arabic / Hebrew style)' },
      ] },
      { key: 'pauseOnHover', type: 'toggle', label: 'Pause on hover',
        help: 'Useful for interactive kiosks where viewers may want to read a message in full.' },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container) {
    ensureKeyframes();
    const c = slide.content ?? {};
    const items = (Array.isArray(c.items) ? c.items : []).map(i => (typeof i === 'string' ? i : i?.text)).filter(Boolean);
    const sep = c.separator ?? '•';
    const dir = c.direction === 'rtl' ? 'rtl' : 'ltr';

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-ticker bb-theme-${c.theme ?? 'minimal-dark'}`;
    root.style.cssText += 'width:100%;height:100%;display:flex;align-items:center;overflow:hidden;background:transparent;color:var(--bb-st-fg,#f1f1f4);';

    if (!items.length) {
      root.innerHTML = '<div style="opacity:.5;padding:0 24px;font-family:var(--bb-font,Inter,sans-serif);">Add ticker messages in the form.</div>';
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }

    const viewport = document.createElement('div');
    viewport.style.cssText = 'white-space:nowrap;will-change:transform;display:inline-flex;';
    // Two identical copies → translateX(-50%) loops seamlessly.
    const oneCopy = items.map(t => escapeHtml(t)).join(`<span style="opacity:.5;margin:0 1.2em;color:var(--bb-st-accent,#8b5cf6);">${escapeHtml(sep)}</span>`);
    const block = `<span style="padding:0 1.2em;font:700 clamp(18px,4cqh,56px)/1 var(--bb-st-font,Inter,sans-serif);">${oneCopy}</span>`;
    viewport.innerHTML = block + block;
    root.style.containerType = 'size';

    // Duration derived synchronously from the text length (no layout read, so it
    // applies even before/without a layout pass). speed = px/s; ~16px per char
    // approximates the rendered width well enough for a ticker.
    const oneCopyText = items.join('   ' + sep + '   ');
    const approxPx = Math.max(240, oneCopyText.length * 16);
    const dur = Math.max(6, approxPx / Math.max(10, c.speed ?? 80));
    const kf = dir === 'rtl' ? 'bb-ticker-scroll-rtl' : 'bb-ticker-scroll';
    viewport.style.animation = `${kf} ${dur.toFixed(1)}s linear infinite`;

    if (c.pauseOnHover) {
      // play-state toggle on hover, common on news tickers and kiosks where
      // viewers want to read a longer message without it scrolling out.
      root.addEventListener('mouseenter', () => { viewport.style.animationPlayState = 'paused'; });
      root.addEventListener('mouseleave', () => { viewport.style.animationPlayState = 'running'; });
    }

    root.appendChild(viewport);
    container.appendChild(root);

    return composeDispose(() => root.remove());
  },
});

