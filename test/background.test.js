// Tests for shared/background.js applyWidgetBg — the theme-aware widget bg
// fallback the canvas frame, the canvas live-updater, and the player slot share.
// A tiny fake element (style bag + classList) is enough: the appliers only write
// element.style.* and element.classList, never read layout — so this runs
// headlessly in the node suite.
import { describe, test, expect } from './runner.js';
import { applyWidgetBg } from '../shared/background.js';

const fakeEl = () => {
  const classes = new Set();
  return {
    style: {},
    classList: { add: c => classes.add(c), contains: c => classes.has(c) },
  };
};

describe('background · applyWidgetBg', () => {
  test('a themeless widget with no paint stays transparent (no theme class)', () => {
    const el = fakeEl();
    applyWidgetBg(el, { content: {} });
    expect(el.classList.contains('bb-theme-neon-cyber')).toBe(false);
    expect(el.style.background).toBe('transparent');
  });

  test('a themed widget adds its theme class and falls back to --bb-st-bg', () => {
    const el = fakeEl();
    applyWidgetBg(el, { content: { theme: 'neon-cyber' } });
    expect(el.classList.contains('bb-theme-neon-cyber')).toBe(true);
    expect(el.style.background).toContain('--bb-st-bg');
  });

  test('an explicit painted background wins over the theme fallback', () => {
    const el = fakeEl();
    applyWidgetBg(el, { content: { theme: 'neon-cyber' }, background: { type: 'color', color: '#ff0000' } });
    expect(el.classList.contains('bb-theme-neon-cyber')).toBe(true);
    expect(el.style.backgroundColor).toBe('#ff0000');
  });

  test('null layer is a no-op (never throws)', () => {
    applyWidgetBg(null, { content: { theme: 'x' } });
    expect(true).toBe(true);
  });
});
