// What a widget is CALLED in the editor's chrome.
//
// One rule, one place, because three surfaces show it and they have to agree:
// the canvas frame's hover label, the Layers row, and the inspector header. The
// Layers panel lets you rename a widget; a canvas that went on calling it
// "Shape" would make the rename look like it had not worked.
//
// It lives in admin/ rather than shared/ because it needs tx() for the plugin
// labels, and shared/ is deliberately free of admin i18n (see the note at the
// top of admin/locales/overlay.de.js).

import { get as getPlugin } from '../shared/plugins/registry.js';
import { tx } from './i18n.js';

export function widgetName(w) {
  // A title the user typed wins over the plugin's generic label — that is the
  // entire point of being able to type one.
  const title = typeof w?.title === 'string' ? w.title.trim() : '';
  if (title) return title;
  const label = getPlugin(w?.type)?.label;
  // Never the raw type as a last resort in the normal case: "live-json" is not
  // a name anybody chose. It is still better than an empty row for a widget
  // whose plugin is missing, which is the only way to get here.
  return label ? tx(label) : (w?.type ?? '');
}
