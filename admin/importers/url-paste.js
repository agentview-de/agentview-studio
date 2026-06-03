import { createSlide } from '../../shared/slide-schema.js';

export const id = 'url-paste';
export const label = 'URL';

export async function convert(url, _ctx) {
  const u = (url ?? '').trim();
  if (!u) return null;
  // YouTube
  if (/youtu\.?be/.test(u)) {
    return { slides: [createSlide('youtube', { title: 'Video', duration: 30, content: { url: u, provider: 'youtube', muted: true, loop: true } })] };
  }
  if (/vimeo\.com/.test(u)) {
    return { slides: [createSlide('youtube', { title: 'Video', duration: 30, content: { url: u, provider: 'vimeo', muted: true, loop: true } })] };
  }
  if (/\.pdf(\?|$)/i.test(u)) {
    return { slides: [createSlide('pdf', { title: 'PDF', duration: 18, content: { url: u, startPage: 1, endPage: 0, pageSec: 6 } })] };
  }
  if (/\.(png|jpe?g|webp|avif|gif)(\?|$)/i.test(u)) {
    return { slides: [createSlide('image', { title: 'Image', duration: 8, content: { url: u, fit: 'cover' } })] };
  }
  if (/\.(mp4|webm|m4v|mov)(\?|$)/i.test(u)) {
    return { slides: [createSlide('video', { title: 'Video', duration: 30, content: { url: u, loop: true, autoDuration: true, muted: true } })] };
  }
  if (/\.(m3u8)(\?|$)/i.test(u)) {
    return { slides: [createSlide('stream-cam', { title: 'Stream', duration: 60, content: { url: u, kind: 'hls', muted: true } })] };
  }
  if (/\.(rss|atom|xml)(\?|$)/i.test(u) || /\brss\b|\bfeed\b/.test(u)) {
    return { slides: [createSlide('rss', { title: 'RSS', duration: 14, content: { url: u, maxItems: 5, theme: 'gradient-blue' } })] };
  }
  if (/\.ics(\?|$)/i.test(u)) {
    return { slides: [createSlide('iframe', { title: 'Calendar', duration: 14, content: { url: u, sandbox: true } })] };
  }
  if (/\.(json)(\?|$)/i.test(u)) {
    return { slides: [createSlide('live-json', { title: 'Live JSON', duration: 12, content: { url: u, refreshSec: 30, theme: 'dark-minimal' } })] };
  }
  // Fallback: iframe
  return { slides: [createSlide('iframe', { title: u.replace(/^https?:\/\//, ''), duration: 20, content: { url: u, sandbox: true } })] };
}
