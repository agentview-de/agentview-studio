import { createSlideWithWidget } from '../../shared/slide-schema.js';
import { tx } from '../i18n.js';

export const id = 'url-paste';
export const label = 'URL';

// Every branch produces the same shape — one full-bleed widget slide — so the
// per-type construction is a single local helper. `title` becomes the slide's
// rail name (media renders clean, no heading overlay).
const one = (type, content, title, duration) =>
  ({ slides: [createSlideWithWidget(type, content, { title, duration })] });

/**
 * The host a pasted URL points at, lower-cased, or '' when it is not a URL.
 *
 * The provider branches used to test the WHOLE string — `/youtu\.?be/` and
 * `/vimeo\.com/` — which matches anywhere, including inside a path. So
 * `firma.de/prospekt-youtube-tipps.pdf` became an empty video embed instead of
 * a PDF, and `cdn.example.com/vimeo.com-tutorial.mp4` became a Vimeo player.
 * Marketing files really are named like that.
 *
 * A pasted address often has no scheme ("youtube.com/watch?v=…"), which URL()
 * rejects — so try again with https:// before giving up.
 */
function hostOf(u) {
  for (const candidate of [u, `https://${u}`]) {
    try { return new URL(candidate).hostname.toLowerCase(); } catch { /* try the next */ }
  }
  return '';
}

const isHost = (host, ...domains) =>
  domains.some(d => host === d || host.endsWith(`.${d}`));

export async function convert(url, _ctx) {
  const u = (url ?? '').trim();
  if (!u) return null;
  const host = hostOf(u);
  // Providers are decided by HOST, everything else by extension.
  if (isHost(host, 'youtube.com', 'youtube-nocookie.com', 'youtu.be')) {
    return one('youtube', { url: u, provider: 'youtube', muted: true, loop: true }, tx('Video'), 30);
  }
  if (isHost(host, 'vimeo.com')) {
    return one('youtube', { url: u, provider: 'vimeo', muted: true, loop: true }, tx('Video'), 30);
  }
  if (/\.pdf(\?|$)/i.test(u)) return one('pdf', { url: u, startPage: 1, endPage: 0, pageSec: 6 }, tx('PDF'), 18);
  if (/\.(png|jpe?g|webp|avif|gif)(\?|$)/i.test(u)) return one('image', { url: u, fit: 'cover' }, tx('Image'), 8);
  if (/\.(mp4|webm|m4v|mov)(\?|$)/i.test(u)) return one('video', { url: u, loop: true, autoDuration: true, muted: true }, tx('Video'), 30);
  if (/\.(m3u8)(\?|$)/i.test(u)) return one('stream-cam', { url: u, kind: 'hls', muted: true }, tx('Stream'), 60);
  if (/\.(rss|atom|xml)(\?|$)/i.test(u) || /\brss\b|\bfeed\b/.test(u)) return one('rss', { url: u, maxItems: 5, theme: 'gradient-blue' }, tx('RSS'), 14);
  if (/\.ics(\?|$)/i.test(u)) return one('iframe', { url: u, sandbox: true }, tx('Calendar'), 14);
  if (/\.(json)(\?|$)/i.test(u)) return one('live-json', { url: u, refreshSec: 30, theme: 'dark-minimal' }, tx('Live JSON'), 12);
  // Fallback: sandboxed iframe of whatever was pasted.
  return one('iframe', { url: u, sandbox: true }, u.replace(/^https?:\/\//, ''), 20);
}
