// Importer dispatcher. Each importer module exports:
//   { id, label, accept (mime/ext list), sniff(file|url), convert(input) }
// convert() returns { slides: [...], assetsToUpload: [{file, name}] }.

import * as image from './image-batch.js';
import * as pdf   from './pdf.js';
import * as csv   from './csv.js';
import * as docx  from './docx.js';
import * as xlsx  from './xlsx.js';
import * as ics   from './ics.js';
import * as json  from './json.js';
import * as pptx  from './pptx.js';
import * as urlPaste from './url-paste.js';

const ALL = [image, pdf, csv, docx, xlsx, ics, json, pptx];

export async function importFile(file, ctx) {
  for (const imp of ALL) {
    if (imp.sniff?.(file)) {
      try { return await imp.convert(file, ctx); }
      catch (e) { console.warn(`Importer ${imp.id} failed`, e); }
    }
  }
  return null;
}

export async function importFiles(files, ctx) {
  // Heuristic: if all files are images, route the whole batch to image-batch
  // for a single Ken Burns gallery slide.
  const allImages = files.length > 1 && files.every(f => /^image\//.test(f.type ?? ''));
  if (allImages) return await image.convert(files, ctx);
  const out = { slides: [], assetsToUpload: [] };
  for (const f of files) {
    const res = await importFile(f, ctx);
    if (res) {
      out.slides.push(...(res.slides ?? []));
      out.assetsToUpload.push(...(res.assetsToUpload ?? []));
    }
  }
  return out;
}

export async function importUrl(url, ctx) {
  return await urlPaste.convert(url, ctx);
}

export { ALL as IMPORTERS };
