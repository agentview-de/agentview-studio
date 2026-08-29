// Design catalog — the former zone-layouts, now expressed as widget generators.
// Applying a design STAMPS editable widgets at percent rects (single render
// path). Existing widgets are re-flowed into the design's slots; empty slots
// get a neutral text placeholder the user can retype.

import { DESIGN_RECTS, createWidget, normalizeRect } from './slide-schema.js';
import { get as getPlugin } from './plugins/registry.js';

export const DESIGNS = Object.freeze([
  { id: 'single',        label: 'Fullscreen' },
  { id: 'split-50-50',   label: 'Split 50/50' },
  { id: 'split-70-30',   label: 'Split 70/30' },
  { id: 'ticker-bottom', label: 'Main + ticker' },
  { id: 'grid-2x2',      label: '2×2 grid' },
  { id: 'header-main',   label: 'Header + main' },
].map(d => ({ ...d, rects: DESIGN_RECTS[d.id] })));

// A design's icon is DRAWN FROM ITS OWN RECTS, never hand-picked.
//
// Each entry used to carry an `icon` glyph — ▢ ▯▯ ◧ ▤ 田 ▥ — a hand-maintained
// second description of a layout the `rects` already describe exactly. It could
// drift from the layout, it cost a decision for every new design, and it did not
// survive contact with real machines: 田 is a CJK ideograph standing in for a
// 2×2 grid, so it renders in whatever CJK font the box happens to have, at a
// different weight and size than everything beside it. ▯▯ was two characters
// pretending to be one icon.
//
// The inspector's design picker already drew the rects directly (see
// .avs-design-thumb) — this is the same idea, packaged so the command palette
// and any future surface get it too. Add a seventh design and its icon exists
// the moment its rects do.
export function designIconSvg(design, size = 16) {
  const rects = design?.rects ?? [];
  if (!rects.length) return '';
  // 100×100 user units = the percent space the rects are already in, so the
  // rect values drop straight in. The 2px inset keeps a 0/0 rect's stroke from
  // being clipped at the viewBox edge.
  const boxes = rects.map(r =>
    `<rect x="${r.x + 2}" y="${r.y + 2}" width="${Math.max(r.w - 4, 1)}" height="${Math.max(r.h - 4, 1)}" rx="4"/>`).join('');
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round" aria-hidden="true">${boxes}</svg>`;
}

// Default widget type + sample content for a named slot. Without demo
// content, applying a design produced N empty grey rectangles the user had
// to laboriously fill — and never understood what the slot was *for*. Now
// each slot lands with representative content the user can either keep or
// replace.
function widgetForSlot(slot, rect, z) {
  const stamp = type => ({ contentVersion: getPlugin(type)?.schemaVersion ?? 1 });
  if (slot === 'ticker') {
    // BBC News is the most-stable curated RSS in our directory and
    // demonstrates the ticker-style layout immediately.
    return createWidget('rss', { rect, z, ...stamp('rss'), content: {
      urls: ['https://feeds.bbci.co.uk/news/rss.xml'],
      mode: 'ticker', max: 8,
    } });
  }
  if (slot === 'header') {
    return createWidget('text', { rect, z, ...stamp('text'), content: {
      body: '<h2>Section title</h2>',
      font: 'sans',
    } });
  }
  // Default "main"/"a"/"b"/"c"/"d": short demo body the user obviously
  // overwrites. Beats a blank rectangle as a teaching moment.
  return createWidget('text', { rect, z, ...stamp('text'), content: {
    body: '<p><strong>Add content here.</strong></p><p>Click to edit.</p>',
    font: 'sans',
  } });
}

// Return a NEW widgets array for `slide` after applying `designId`.
// Re-flows existing widgets into slots; fills the rest with placeholders;
// keeps any extra widgets beyond the slot count at their current rects.
export function applyDesign(slide, designId) {
  const rects = DESIGN_RECTS[designId] ?? DESIGN_RECTS['single'];
  const existing = [...(slide?.widgets ?? [])].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const widgets = rects.map((r, i) => {
    const rect = normalizeRect({ x: r.x, y: r.y, w: r.w, h: r.h });
    const w = existing[i];
    if (w) return { ...w, rect };
    return widgetForSlot(r.slot, rect, i);
  });
  if (existing.length > rects.length) widgets.push(...existing.slice(rects.length));
  return widgets;
}

export function getDesign(id) {
  const found = DESIGNS.find(d => d.id === id);
  if (!found) console.warn('[designs] unknown id:', id, '— falling back to single');
  return found ?? DESIGNS[0];
}
