// Line icons for the app's own CHROME — navigation, panel headers, toolbars.
//
// Three icon sets live side by side and they are not interchangeable:
//   shared/data/icons.js         — the curated set the Icon WIDGET offers on a
//                                  slide; user-facing content, user-recolourable.
//   shared/data/widget-icons.js  — one icon per widget TYPE, for the library
//                                  grid, slide rail, command palette, inspector.
//   this file                    — the admin UI's own furniture.
//
// Same drawing contract as the other two: inner markup of a 24×24 viewBox,
// stroke-based, currentColor, so a nav item's icon inherits its text colour and
// its hover/active state for free. Emoji cannot do that — they are painted by
// the OS in their own colours, at their own weight, and differently on every
// platform. For a signage product whose admin is opened from Windows, macOS and
// Android tablets alike, that meant the same nav rendered three ways.
export const UI_ICONS = {
  approvals:    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  audit:        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  webhooks:     '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/>',
  apikeys:      '<circle cx="7.5" cy="15.5" r="4.5"/><line x1="10.7" y1="12.3" x2="21" y2="2"/><line x1="18" y1="5" x2="20.5" y2="7.5"/><line x1="15" y1="8" x2="17" y2="10"/>',
  members:      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  licenses:     '<circle cx="12" cy="8" r="6"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  connectivity: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  brandkit:     '<path d="M12 2.7l5.3 5.3a7.5 7.5 0 1 1-10.6 0z"/>',
  versions:     '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><polyline points="12 8 12 12 15 14"/>',

  // ---- Rich-text toolbar -------------------------------------------------
  // The four alignments are the reason this block exists. They used to be the
  // typographic arrows ⇤ ↔ ⇥ ☰, and ↔ for "centre" actively misled — a
  // left-right arrow reads as "stretch to the full width", which is what
  // justify does. Ragged-edge line stacks say which edge is flush without a
  // tooltip, and the four now differ from each other rather than from nothing.
  'align-left':      '<line x1="3" y1="5" x2="21" y2="5"/><line x1="3" y1="10" x2="14" y2="10"/><line x1="3" y1="15" x2="19" y2="15"/><line x1="3" y1="20" x2="12" y2="20"/>',
  'align-center':    '<line x1="3" y1="5" x2="21" y2="5"/><line x1="6.5" y1="10" x2="17.5" y2="10"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="7.5" y1="20" x2="16.5" y2="20"/>',
  'align-right':     '<line x1="3" y1="5" x2="21" y2="5"/><line x1="10" y1="10" x2="21" y2="10"/><line x1="5" y1="15" x2="21" y2="15"/><line x1="12" y1="20" x2="21" y2="20"/>',
  'align-justify':   '<line x1="3" y1="5" x2="21" y2="5"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="3" y1="20" x2="21" y2="20"/>',
  link:              '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  image:             '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  emoji:             '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  trash:             '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  undo:              '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  redo:              '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  expand:            '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/>',
  'chevron-down':    '<polyline points="6 9 12 15 18 9"/>',
  'chevron-left':    '<polyline points="15 18 9 12 15 6"/>',
  // Four panes — the template store's gallery, and the shape of the thing it
  // shows. Not a "layout" icon: the designs picker already draws its own
  // rects (shared/designs.js), so this one never has to stand for a layout.
  grid:              '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  search:            '<circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.2" y1="15.2" x2="21" y2="21"/>',
  // An A with a cross: strip the styling off the letter, not the letter itself.
  'clear-format':    '<path d="M3 20l6-14 3.4 8"/><line x1="5.6" y1="14" x2="11.4" y2="14"/><line x1="15" y1="14" x2="22" y2="21"/><line x1="22" y1="14" x2="15" y2="21"/>',
  // The highlight bar with a stroke through it — one shape, one negation.
  'clear-highlight': '<rect x="3" y="9" width="18" height="6" rx="1"/><line x1="3" y1="20" x2="21" y2="4"/>',
  // Arrows pushing apart, not text lines: a rule drawn as "long line, short
  // line, short line" is the align-left icon, and both sit in this same toolbar.
  hr:                '<line x1="3" y1="12" x2="21" y2="12"/><polyline points="8 8 12 4 16 8"/><polyline points="16 16 12 20 8 16"/>',
  table:             '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',

  // ---- Table operations (the contextual bar inside the rich-text editor) ---
  // These nine were two-character combinations of typographic arrows — `+⤴`,
  // `⇥⇤`, `−⇕` — set in 28px buttons. Nothing about `−⇔` says "delete the
  // column"; the tooltip carried the whole meaning, and a tooltip is not
  // available to a glance or to a touchscreen.
  //
  // One grammar across all nine, so they can be told apart at 16px:
  //   · the grid is drawn SHORT on the side the operation acts on, and a `+`
  //     sits in the space that makes — insert reads as "another one, here"
  //   · delete keeps the full grid, fills the band it will remove, and pairs it
  //     with a `−` outside that band
  //   · merge draws two cells with a DASHED divider and arrows converging on
  //     it; split draws one cell with a SOLID divider and arrows leaving it
  'table-row-above':  '<rect x="3" y="9" width="18" height="12" rx="2"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="1.8" x2="12" y2="6.6"/><line x1="9.6" y1="4.2" x2="14.4" y2="4.2"/>',
  'table-row-below':  '<rect x="3" y="3" width="18" height="12" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="12" y1="17.4" x2="12" y2="22.2"/><line x1="9.6" y1="19.8" x2="14.4" y2="19.8"/>',
  'table-col-left':   '<rect x="9" y="3" width="12" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="4.2" y1="9.6" x2="4.2" y2="14.4"/><line x1="1.8" y1="12" x2="6.6" y2="12"/>',
  'table-col-right':  '<rect x="3" y="3" width="12" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="19.8" y1="9.6" x2="19.8" y2="14.4"/><line x1="17.4" y1="12" x2="22.2" y2="12"/>',
  'table-row-delete': '<rect x="2" y="9.5" width="15" height="5" fill="currentColor" opacity=".22" stroke="none"/><rect x="2" y="4.5" width="15" height="15" rx="2"/><line x1="2" y1="9.5" x2="17" y2="9.5"/><line x1="2" y1="14.5" x2="17" y2="14.5"/><line x1="18.8" y1="12" x2="22.6" y2="12"/>',
  'table-col-delete': '<rect x="9.5" y="2" width="5" height="15" fill="currentColor" opacity=".22" stroke="none"/><rect x="4.5" y="2" width="15" height="15" rx="2"/><line x1="9.5" y1="2" x2="9.5" y2="17"/><line x1="14.5" y1="2" x2="14.5" y2="17"/><line x1="10.1" y1="20.5" x2="13.9" y2="20.5"/>',
  'table-merge-right': '<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="12" y1="6" x2="12" y2="18" stroke-dasharray="2.5 2.5"/><polyline points="5.6 9.8 8 12 5.6 14.2"/><polyline points="18.4 9.8 16 12 18.4 14.2"/>',
  'table-merge-down': '<rect x="6" y="2" width="12" height="20" rx="2"/><line x1="6" y1="12" x2="18" y2="12" stroke-dasharray="2.5 2.5"/><polyline points="9.8 5.6 12 8 14.2 5.6"/><polyline points="9.8 18.4 12 16 14.2 18.4"/>',
  'table-split':      '<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="12" y1="6" x2="12" y2="18"/><polyline points="7.5 9.5 5 12 7.5 14.5"/><polyline points="16.5 9.5 19 12 16.5 14.5"/>',
  'external-link':   '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  close:             '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',

  // ---- Displays: device classes and row actions --------------------------
  // The device class comes from the display's own capabilities report, so these
  // four are DATA, not decoration — they are the fastest way to tell a lobby TV
  // from a reception tablet in a long list.
  monitor:           '<rect x="2" y="4" width="20" height="13" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  smartphone:        '<rect x="7" y="2" width="10" height="20" rx="2"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5"/>',
  tablet:            '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5"/>',
  tv:                '<rect x="2" y="7" width="20" height="14" rx="2"/><polyline points="7 3 12 7 17 3"/>',
  eye:               '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
  // The struck-through eye: the SAME eye with a slash, so the pair reads as one
  // control in two states rather than as two unrelated icons.
  'eye-off':         '<path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a20 20 0 0 1-3.2 4.2M6.6 6.6A20 20 0 0 0 1 12s4 7 11 7a10.8 10.8 0 0 0 5.4-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><line x1="2" y1="2" x2="22" y2="22"/>',
  lock:              '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock:            '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  more:              '<circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  touch:             '<path d="M9 11V5a2 2 0 0 1 4 0v6"/><path d="M13 7a2 2 0 0 1 4 0v5"/><path d="M17 9a2 2 0 0 1 4 0v6a6 6 0 0 1-6 6h-2a7 7 0 0 1-5-2l-4-4a2 2 0 0 1 3-3l2 2"/>',
  play:              '<polygon points="6 4 20 12 6 20 6 4"/>',
  info:              '<circle cx="12" cy="12" r="10"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/>',

  // ---- Main menu and command palette -------------------------------------
  'file-plus':       '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>',
  cloud:             '<path d="M18 18.5a4.5 4.5 0 0 0 .4-9 6.5 6.5 0 0 0-12.5 1.6A3.9 3.9 0 0 0 6.5 18.5z"/>',
  upload:            '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/>',
  download:          '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/>',
  database:          '<ellipse cx="12" cy="5.5" rx="8" ry="3.2"/><path d="M4 5.5v13c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-13"/><path d="M4 12c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2"/>',
  plug:              '<path d="M9 2v6"/><path d="M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6z"/><line x1="12" y1="17" x2="12" y2="22"/>',
  // Half-filled disc: the theme control cycles light/dark, and a sun-or-moon
  // would name one state while the button means "switch".
  theme:             '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
  keyboard:          '<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6.01" y2="10"/><line x1="10" y1="10" x2="10.01" y2="10"/><line x1="14" y1="10" x2="14.01" y2="10"/><line x1="18" y1="10" x2="18.01" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/>',
  shield:            '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  rocket:            '<path d="M12 2c3.5 2.4 5.5 6 5.5 10L12 17l-5.5-5C6.5 8 8.5 4.4 12 2z"/><circle cx="12" cy="9" r="2"/><path d="M8.5 15.5 6 18l1 3 3-1"/><path d="M15.5 15.5 18 18l-1 3-3-1"/>',
  scissors:          '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.1" y2="15.9"/><line x1="14.5" y1="14.5" x2="20" y2="20"/><line x1="8.1" y1="8.1" x2="12" y2="12"/>',
  film:              '<rect x="2" y="3" width="20" height="18" rx="2"/><line x1="7" y1="3" x2="7" y2="21"/><line x1="17" y1="3" x2="17" y2="21"/><line x1="2" y1="9" x2="7" y2="9"/><line x1="2" y1="15" x2="7" y2="15"/><line x1="17" y1="9" x2="22" y2="9"/><line x1="17" y1="15" x2="22" y2="15"/>',
  building:          '<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="9" y1="7" x2="9.01" y2="7"/><line x1="15" y1="7" x2="15.01" y2="7"/><line x1="9" y1="11" x2="9.01" y2="11"/><line x1="15" y1="11" x2="15.01" y2="11"/><path d="M10 21v-4h4v4"/>',
  refresh:           '<polyline points="21 4 21 10 15 10"/><polyline points="3 20 3 14 9 14"/><path d="M19.4 9a8 8 0 0 0-13.1-3L3 9"/><path d="M4.6 15a8 8 0 0 0 13.1 3l3.3-3"/>',

  // ---- Library, inspector, canvas menu -----------------------------------
  puzzle:            '<path d="M10 3h4a1 1 0 0 1 1 1v1.5a2 2 0 1 0 4 0V4h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1.5a2 2 0 1 0 0 4H20a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4v-1.5a2 2 0 1 0-4 0V21H5a1 1 0 0 1-1-1v-4h1.5a2 2 0 1 0 0-4H4V5a1 1 0 0 1 1-1h5z"/>',
  sliders:           '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  // A/B variants: two faces of one thing, which is what a die shows.
  dice:              '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/>',
  copy:              '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  type:              '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
  gear:              '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3.7 8a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H8a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V8a1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  clock:             '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  star:              '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
  plus:              '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'arrow-up':        '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  'arrow-down':      '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  pencil:            '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  folder:            '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  calendar:          '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  // Toast status marks. They inherit currentColor, so the toast's own kind class
  // (--bb-success / --bb-warn / --bb-danger) colours them — the emoji ✅ ⚠️ ❌
  // carried their own fixed colours and ignored the theme entirely.
  'check-circle':    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'x-circle':        '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  alert:             '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  // Object-arrange icons. Deliberately NOT the align-left/center/right trio
  // above: those are TEXT alignment (four ragged lines of type) and they are
  // already in this file for the inspector's text controls. These show two BOXES
  // snapping to a rule, which is what the button does — reusing the type icons
  // would put the same picture on two controls that do different things.
  'arr-left':     '<line x1="3" y1="3" x2="3" y2="21"/><rect x="6" y="5" width="15" height="5" rx="1"/><rect x="6" y="14" width="9" height="5" rx="1"/>',
  'arr-hcenter':  '<line x1="12" y1="3" x2="12" y2="21"/><rect x="4.5" y="5" width="15" height="5" rx="1"/><rect x="7.5" y="14" width="9" height="5" rx="1"/>',
  'arr-right':    '<line x1="21" y1="3" x2="21" y2="21"/><rect x="3" y="5" width="15" height="5" rx="1"/><rect x="9" y="14" width="9" height="5" rx="1"/>',
  'arr-top':      '<line x1="3" y1="3" x2="21" y2="3"/><rect x="5" y="6" width="5" height="15" rx="1"/><rect x="14" y="6" width="5" height="9" rx="1"/>',
  'arr-vmiddle':  '<line x1="3" y1="12" x2="21" y2="12"/><rect x="5" y="4.5" width="5" height="15" rx="1"/><rect x="14" y="7.5" width="5" height="9" rx="1"/>',
  'arr-bottom':   '<line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="3" width="5" height="15" rx="1"/><rect x="14" y="9" width="5" height="9" rx="1"/>',
  // Distribute: three boxes with the WHITESPACE between them called out, since
  // even gaps (not even centres) is what the action produces.
  'arr-dist-h':   '<rect x="2" y="7" width="4" height="10" rx="1"/><rect x="10" y="7" width="4" height="10" rx="1"/><rect x="18" y="7" width="4" height="10" rx="1"/><line x1="7.5" y1="12" x2="8.5" y2="12"/><line x1="15.5" y1="12" x2="16.5" y2="12"/>',
  'arr-dist-v':   '<rect x="7" y="2" width="10" height="4" rx="1"/><rect x="7" y="10" width="10" height="4" rx="1"/><rect x="7" y="18" width="10" height="4" rx="1"/><line x1="12" y1="7.5" x2="12" y2="8.5"/><line x1="12" y1="15.5" x2="12" y2="16.5"/>',
  // Match size: a small box growing to a big one's dimension.
  'arr-match-w':  '<rect x="2" y="4" width="20" height="6" rx="1"/><rect x="2" y="14" width="12" height="6" rx="1"/><polyline points="16 15 19 17 16 19"/>',
  'arr-match-h':  '<rect x="4" y="2" width="6" height="20" rx="1"/><rect x="14" y="2" width="6" height="12" rx="1"/><polyline points="15 16 17 19 19 16"/>',
  // Group: two boxes inside one dashed frame. Ungroup: the same two with
  // the frame broken open, so the pair reads as one action and its undo.
  // Stacked sheets — the slide MASTER (and the Layers panel's own header):
  // one thing drawn under all the others.
  // Indent / outdent: text lines with an arrow showing which way the block
  // moves. The arrow points the direction of travel, not at the text.
  'text-indent':  '<line x1="3" y1="4" x2="21" y2="4"/><line x1="10" y1="9" x2="21" y2="9"/><line x1="10" y1="14" x2="21" y2="14"/><line x1="3" y1="19" x2="21" y2="19"/><polyline points="3 9 6 11.5 3 14"/>',
  'text-outdent': '<line x1="3" y1="4" x2="21" y2="4"/><line x1="10" y1="9" x2="21" y2="9"/><line x1="10" y1="14" x2="21" y2="14"/><line x1="3" y1="19" x2="21" y2="19"/><polyline points="6 9 3 11.5 6 14"/>',
  printer:        '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  layers:         '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  'arr-group':    '<rect x="2" y="2" width="20" height="20" rx="2" stroke-dasharray="3 3"/><rect x="5" y="5" width="7" height="7" rx="1"/><rect x="12" y="12" width="7" height="7" rx="1"/>',
  'arr-ungroup':  '<polyline points="2 7 2 2 7 2"/><polyline points="17 2 22 2 22 7"/><polyline points="22 17 22 22 17 22"/><polyline points="7 22 2 22 2 17"/><rect x="5" y="5" width="7" height="7" rx="1"/><rect x="12" y="12" width="7" height="7" rx="1"/>',
};

// Full <svg> markup for a chrome icon, or '' when the id is unknown — callers
// decide what an unknown id should degrade to, exactly like widgetIcon().
export function uiIconSvg(id, size = 16) {
  const inner = UI_ICONS[id];
  if (!inner) return '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
