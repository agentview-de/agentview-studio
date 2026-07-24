import { createSlideWithWidget } from '../../shared/slide-schema.js';
import { stripExt } from './_helpers.js';

export const id = 'image-batch';
export const label = 'Images';

export function sniff(file) {
  if (!file) return false;
  return /^image\//.test(file.type ?? '') || /\.(png|jpe?g|webp|avif|gif|bmp|svg)$/i.test(file.name ?? '');
}

export async function convert(input, ctx) {
  const files = Array.isArray(input) ? input : [input];
  // Need to upload each, then build one gallery slide referencing the resulting URLs.
  const assetsToUpload = files.map(f => ({ file: f, name: f.name }));
  // Caller may upload synchronously and resolve URLs back into the slide via ctx.
  const urls = await Promise.all(files.map(f => ctx?.upload?.(f) ?? Promise.resolve('')));
  const slide = createSlideWithWidget('image-gallery', {
    urls: urls.filter(Boolean).map(u => ({ url: u })),
    perImageSec: 5,
    fit: 'cover',
    kenBurns: true,
  }, {
    title: files.length > 1 ? `${files.length} images` : stripExt(files[0]?.name, 'Image'),
    duration: Math.max(8, files.length * 5),
  });
  return { slides: [slide], assetsToUpload };
}
