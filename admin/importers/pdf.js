import { createSlide } from '../../shared/slide-schema.js';

export const id = 'pdf';
export const label = 'PDF';

export function sniff(file) {
  if (!file) return false;
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
}

export async function convert(file, ctx) {
  const url = await (ctx?.upload?.(file) ?? Promise.resolve(''));
  const slide = createSlide('pdf', {
    title: file.name?.replace(/\.pdf$/i, '') ?? 'PDF',
    duration: 12,
    content: { url, startPage: 1, endPage: 0, pageSec: 6 },
  });
  return { slides: [slide], assetsToUpload: [{ file, name: file.name }] };
}
