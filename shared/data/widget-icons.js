// Crisp line icons (Feather/Lucide style, 24×24, currentColor) per widget type,
// so the library / slide rail / command palette / inspector show a consistent
// icon set instead of platform-dependent emoji. Unmapped types fall back to the
// plugin's emoji.

export const WIDGET_ICONS = {
  text: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
  markdown: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15V9l3 3 3-3v6"/><path d="M18 9v4m0 0 1.6-1.8M18 13l-1.6-1.8"/>',
  quote: '<path d="M10 11a4 4 0 0 1-4 4H5a1 1 0 0 1-1-1v-3a4 4 0 0 1 4-4h1a1 1 0 0 1 1 1z"/><path d="M20 11a4 4 0 0 1-4 4h-1a1 1 0 0 1-1-1v-3a4 4 0 0 1 4-4h1a1 1 0 0 1 1 1z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  ticker: '<rect x="2" y="9" width="20" height="6" rx="1"/><line x1="6" y1="12" x2="14" y2="12"/>',
  icon: '<circle cx="7" cy="7" r="3.5"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1"/><path d="M8.5 21l3.5-6 3.5 6z"/>',
  menu: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  'image-gallery': '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><polygon points="10 9 16 12 10 15 10 9"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9zM9 16v-3"/>',
  'audio-viz': '<line x1="4" y1="10" x2="4" y2="14"/><line x1="8" y1="6" x2="8" y2="18"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="16" y1="4" x2="16" y2="20"/><line x1="20" y1="11" x2="20" y2="13"/>',
  iframe: '<rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="8" x2="22" y2="8"/><circle cx="5" cy="5.5" r=".6" fill="currentColor" stroke="none"/><circle cx="7" cy="5.5" r=".6" fill="currentColor" stroke="none"/>',
  embed: '<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9.5 10 7.5 12 9.5 14"/><polyline points="14.5 10 16.5 12 14.5 14"/>',
  'stream-cam': '<path d="M3 7h2l1.5-2.5h11L19 7h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  weather: '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1"/><path d="M17.5 20a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.2A3.4 3.4 0 0 0 8.5 20z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  'world-clock': '<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3c2.8 2.4 4.5 5.6 4.5 9S14.8 18.6 12 21c-2.8-2.4-4.5-5.6-4.5-9S9.2 5.4 12 3z"/>',
  countdown: '<path d="M7 3h10M7 21h10"/><path d="M7 3c0 4 4 5.5 5 9M17 3c0 4-4 5.5-5 9"/><path d="M7 21c0-4 4-5.5 5-9M17 21c0-4-4-5.5-5-9"/>',
  'days-since': '<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><path d="M9 15l2 2 4-4"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>',
  rss: '<path d="M5 11a8 8 0 0 1 8 8"/><path d="M5 4a15 15 0 0 1 15 15"/><circle cx="6" cy="18" r="1.6" fill="currentColor" stroke="none"/>',
  'news-photos': '<path d="M4 5h12v15H5a2 2 0 0 1-2-2V7"/><path d="M16 9h3a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2"/><line x1="7" y1="9" x2="13" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/><line x1="7" y1="17" x2="11" y2="17"/>',
  currency: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5a3 3 0 0 0-3-1.5c-1.7 0-3 .9-3 2.2 0 1.2 1 1.8 3 2.3s3 1.1 3 2.3c0 1.3-1.3 2.2-3 2.2a3.4 3.4 0 0 1-3-1.5"/><line x1="12" y1="6.5" x2="12" y2="17.5"/>',
  chart: '<line x1="4" y1="20" x2="4" y2="11"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="13"/><line x1="2" y1="20" x2="22" y2="20"/>',
  'kpi-cards': '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><rect x="13" y="13" width="8" height="7" rx="1"/>',
  'live-json': '<path d="M8 4H7a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h1"/><path d="M16 4h1a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-1"/>',
  'data-table': '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>',
  progress: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
  'qr-code': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="17" y2="14"/><line x1="20" y1="14" x2="21" y2="14"/><line x1="14" y1="17" x2="14" y2="21"/><line x1="18" y1="18" x2="21" y2="18"/><line x1="18" y1="21" x2="21" y2="21"/>',
  // Sunrise, not a waving hand: the widget's subject is the TIME OF DAY it
  // greets from ("Good morning" → "Good night"), and a hand does not survive
  // being drawn in two strokes at 24px.
  greeting: '<path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="4.2" y1="10.2" x2="5.6" y2="11.6"/><line x1="18.4" y1="11.6" x2="19.8" y2="10.2"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="1" y1="22" x2="23" y2="22"/><polyline points="8 6 12 2 16 6"/>',
  // Panel + pen: the one plugin whose SHAPE the user authors. Deliberately not
  // a plus-in-a-box — in a library grid where every tile adds a widget, "add"
  // says nothing.
  custom: '<path d="M17 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/><path d="M20.4 12.6a2 2 0 0 1 0 2.8L15 20.8l-3.4.6.6-3.4 5.4-5.4a2 2 0 0 1 2.8 0z"/>',
};

// Full <svg> markup for a widget type, or '' if unmapped.
export function widgetIconSvg(type, size = 22) {
  const inner = WIDGET_ICONS[type];
  if (!inner) return '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// Crisp icon when available, else the plugin's emoji fallback.
export function widgetIcon(type, fallbackEmoji = '◻', size = 22) {
  return widgetIconSvg(type, size) || fallbackEmoji;
}
