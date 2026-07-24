import { createSlideWithWidget } from '../../shared/slide-schema.js';
import { stripExt } from './_helpers.js';

export const id = 'pdf';
export const label = 'PDF';

export function sniff(file) {
  if (!file) return false;
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
}

export async function convert(file, ctx) {
  const url = await (ctx?.upload?.(file) ?? Promise.resolve(''));
  return {
    slides: [createSlideWithWidget('pdf',
      { url, startPage: 1, endPage: 0, pageSec: 6 },
      { title: stripExt(file.name, 'PDF'), duration: 12 })],
    assetsToUpload: [{ file, name: file.name }],
  };
}
