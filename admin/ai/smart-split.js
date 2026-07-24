// Split a long markdown / plain-text blob into N slides at heading boundaries.
import { createSlideWithWidget } from '../../shared/slide-schema.js';

export function splitText(text, { defaultTheme = 'dark-minimal', durationPerSlide = 12 } = {}) {
  const blocks = String(text ?? '')
    .split(/\n(?=#{1,3}\s)/) // start of a new heading
    .map(s => s.trim()).filter(Boolean);
  if (blocks.length <= 1) {
    return [createSlideWithWidget('markdown', { body: text, theme: defaultTheme }, { duration: durationPerSlide })];
  }
  return blocks.map(b => {
    const m = b.match(/^#{1,3}\s+(.+)/);
    const title = m?.[1] ?? '';
    const body = b.replace(/^#{1,3}\s+.+\n*/, '');
    return createSlideWithWidget('markdown', { body, theme: defaultTheme }, { title, duration: durationPerSlide });
  });
}
