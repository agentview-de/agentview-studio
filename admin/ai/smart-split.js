// Split a long markdown / plain-text blob into N slides at heading boundaries.
import { createSlide } from '../../shared/slide-schema.js';

export function splitText(text, { defaultTheme = 'dark-minimal', durationPerSlide = 12 } = {}) {
  const blocks = String(text ?? '')
    .split(/\n(?=#{1,3}\s)/) // start of a new heading
    .map(s => s.trim()).filter(Boolean);
  if (blocks.length <= 1) {
    return [createSlide('markdown', { duration: durationPerSlide, content: { body: text, theme: defaultTheme } })];
  }
  return blocks.map(b => {
    const m = b.match(/^#{1,3}\s+(.+)/);
    const title = m?.[1] ?? '';
    const body = b.replace(/^#{1,3}\s+.+\n*/, '');
    return createSlide('markdown', { title, duration: durationPerSlide, content: { body, theme: defaultTheme } });
  });
}
