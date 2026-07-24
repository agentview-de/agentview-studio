import { createSlideWithWidget } from '../../shared/slide-schema.js';

export const id = 'url-paste';
export const label = 'URL';

// Every branch produces the same shape — one full-bleed widget slide — so the
// per-type construction is a single local helper. `title` becomes the slide's
// rail name (media renders clean, no heading overlay).
const one = (type, content, title, duration) =>
  ({ slides: [createSlideWithWidget(type, content, { title, duration })] });

export async function convert(url, _ctx) {
  const u = (url ?? '').trim();
  if (!u) return null;
  if (/youtu\.?be/.test(u))  return one('youtube', { url: u, provider: 'youtube', muted: true, loop: true }, 'Video', 30);
  if (/vimeo\.com/.test(u))  return one('youtube', { url: u, provider: 'vimeo', muted: true, loop: true }, 'Video', 30);
  if (/\.pdf(\?|$)/i.test(u)) return one('pdf', { url: u, startPage: 1, endPage: 0, pageSec: 6 }, 'PDF', 18);
  if (/\.(png|jpe?g|webp|avif|gif)(\?|$)/i.test(u)) return one('image', { url: u, fit: 'cover' }, 'Image', 8);
  if (/\.(mp4|webm|m4v|mov)(\?|$)/i.test(u)) return one('video', { url: u, loop: true, autoDuration: true, muted: true }, 'Video', 30);
  if (/\.(m3u8)(\?|$)/i.test(u)) return one('stream-cam', { url: u, kind: 'hls', muted: true }, 'Stream', 60);
  if (/\.(rss|atom|xml)(\?|$)/i.test(u) || /\brss\b|\bfeed\b/.test(u)) return one('rss', { url: u, maxItems: 5, theme: 'gradient-blue' }, 'RSS', 14);
  if (/\.ics(\?|$)/i.test(u)) return one('iframe', { url: u, sandbox: true }, 'Calendar', 14);
  if (/\.(json)(\?|$)/i.test(u)) return one('live-json', { url: u, refreshSec: 30, theme: 'dark-minimal' }, 'Live JSON', 12);
  // Fallback: sandboxed iframe of whatever was pasted.
  return one('iframe', { url: u, sandbox: true }, u.replace(/^https?:\/\//, ''), 20);
}
