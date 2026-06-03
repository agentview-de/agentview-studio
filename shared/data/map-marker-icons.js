// Curated emoji icon set for map markers. Keeps the map widget zero-build:
// emojis ship with every OS font, no CDN, no extra image assets.
//
// Each entry is { id, emoji, label }. `id` is what gets persisted on the
// marker (`m.icon`), `emoji` is rendered via L.divIcon, `label` is the
// tooltip/aria label shown in the picker.
//
// `DEFAULT_MARKER_ICON` is what the player falls back to when a marker has
// no `icon` field (existing markers from before this feature was added).

export const MAP_MARKER_ICONS = Object.freeze([
  // Generic
  { id: 'pin',          emoji: '📍', label: 'Pin' },
  { id: 'flag',         emoji: '🚩', label: 'Flag' },
  { id: 'star',         emoji: '⭐', label: 'Star' },
  { id: 'heart',        emoji: '❤️', label: 'Heart' },
  { id: 'sparkles',     emoji: '✨', label: 'Highlight' },
  // Places
  { id: 'home',         emoji: '🏠', label: 'Home' },
  { id: 'office',       emoji: '🏢', label: 'Office' },
  { id: 'hotel',        emoji: '🏨', label: 'Hotel' },
  { id: 'shop',         emoji: '🏪', label: 'Shop' },
  { id: 'hospital',     emoji: '🏥', label: 'Hospital' },
  { id: 'school',       emoji: '🏫', label: 'School' },
  { id: 'castle',       emoji: '🏰', label: 'Castle' },
  { id: 'museum',       emoji: '🏛️', label: 'Museum' },
  { id: 'factory',      emoji: '🏭', label: 'Factory' },
  // Food & drink
  { id: 'restaurant',   emoji: '🍽️', label: 'Restaurant' },
  { id: 'cafe',         emoji: '☕', label: 'Café' },
  { id: 'pizza',        emoji: '🍕', label: 'Pizza' },
  { id: 'beer',         emoji: '🍺', label: 'Bar / Beer' },
  { id: 'wine',         emoji: '🍷', label: 'Wine' },
  { id: 'icecream',     emoji: '🍦', label: 'Ice cream' },
  // Transit
  { id: 'car',          emoji: '🚗', label: 'Car / parking' },
  { id: 'bus',          emoji: '🚌', label: 'Bus' },
  { id: 'train',        emoji: '🚉', label: 'Train station' },
  { id: 'plane',        emoji: '✈️', label: 'Airport' },
  { id: 'ship',         emoji: '🚢', label: 'Port' },
  { id: 'bike',         emoji: '🚲', label: 'Bike' },
  { id: 'fuel',         emoji: '⛽', label: 'Fuel' },
  // Leisure / sights
  { id: 'camera',       emoji: '📷', label: 'Viewpoint' },
  { id: 'mountain',     emoji: '⛰️', label: 'Mountain' },
  { id: 'beach',        emoji: '🏖️', label: 'Beach' },
  { id: 'park',         emoji: '🌳', label: 'Park' },
  { id: 'island',       emoji: '🏝️', label: 'Island' },
  { id: 'stage',        emoji: '🎭', label: 'Theatre' },
  { id: 'music',        emoji: '🎵', label: 'Music' },
  { id: 'sport',        emoji: '⚽', label: 'Sports' },
  { id: 'shopping',     emoji: '🛍️', label: 'Shopping' },
  { id: 'art',          emoji: '🎨', label: 'Art' },
  // Operational
  { id: 'warning',      emoji: '⚠️', label: 'Warning' },
  { id: 'construction', emoji: '🚧', label: 'Construction' },
  { id: 'tools',        emoji: '🛠️', label: 'Service' },
  { id: 'info',         emoji: 'ℹ️', label: 'Info' },
]);

export const DEFAULT_MARKER_ICON = 'pin';

const _byId = new Map(MAP_MARKER_ICONS.map(i => [i.id, i]));

export function markerEmoji(id) {
  return (_byId.get(id ?? DEFAULT_MARKER_ICON) ?? _byId.get(DEFAULT_MARKER_ICON)).emoji;
}

export function markerLabel(id) {
  return (_byId.get(id ?? DEFAULT_MARKER_ICON) ?? _byId.get(DEFAULT_MARKER_ICON)).label;
}

// Shared L.divIcon factory: produces an emoji pin that the player and the
// location-field editor both render. Keeping it in one place means the picker
// preview always matches the final on-map appearance.
export function buildMarkerDivIcon(L, iconId) {
  const emoji = markerEmoji(iconId);
  return L.divIcon({
    className: 'avs-map-marker',
    html: `<div class="avs-map-marker-pin"><span class="avs-map-marker-emoji">${emoji}</span></div>`,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
    tooltipAnchor: [0, -36],
  });
}
