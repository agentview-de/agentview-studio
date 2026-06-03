// Design catalog — the former zone-layouts, now expressed as widget generators.
// Applying a design STAMPS editable widgets at percent rects (single render
// path). Existing widgets are re-flowed into the design's slots; empty slots
// get a neutral text placeholder the user can retype.

import { DESIGN_RECTS, createWidget, normalizeRect } from './slide-schema.js';
import { get as getPlugin } from './plugins/registry.js';

export const DESIGNS = Object.freeze([
  { id: 'single',        label: 'Fullscreen',    icon: '▢' },
  { id: 'split-50-50',   label: 'Split 50/50',   icon: '▯▯' },
  { id: 'split-70-30',   label: 'Split 70/30',   icon: '◧' },
  { id: 'ticker-bottom', label: 'Main + ticker', icon: '▤' },
  { id: 'grid-2x2',      label: '2×2 grid',      icon: '田' },
  { id: 'header-main',   label: 'Header + main', icon: '▥' },
].map(d => ({ ...d, rects: DESIGN_RECTS[d.id] })));

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
