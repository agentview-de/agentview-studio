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
    const title = b.match(/^#{1,3}\s+(.+)/)?.[1]?.trim() ?? '';
    // The heading STAYS in the body. `opts.title` only names the card in the
    // slide rail — createSlideWithWidget is explicit that it never paints a
    // heading — so stripping it took the headline off the screen while the rail
    // still showed it: every card correctly named, every slide missing its own
    // title. A section that was nothing BUT a heading became a blank slide.
    // Markdown renders '#' as a heading; that is what the widget is for.
    return createSlideWithWidget('markdown', { body: b, theme: defaultTheme }, { title, duration: durationPerSlide });
  });
}
