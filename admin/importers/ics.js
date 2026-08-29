import { createSlideWithWidget } from '../../shared/slide-schema.js';
import { upcomingEvents } from '../../shared/ics-parse.js';
import { stripExt } from './_helpers.js';
import { tx, getLocale } from '../i18n.js';

export const id = 'ics';
export const label = 'iCalendar';

export function sniff(file) {
  if (!file) return false;
  return file.type === 'text/calendar' || /\.ics$/i.test(file.name ?? '');
}

function fmtTime(d) {
  if (!d) return '';
  // The STUDIO's language, not the browser's. These strings are frozen into
  // the slide at import time, so they should match the language the operator
  // is working in — an English browser chrome on a German Studio otherwise
  // writes "Mar 03" into a German playlist.
  return d.toLocaleString(getLocale(), { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export async function convert(file) {
  const text = await file.text();
  const items = upcomingEvents(text, 20).map(e => ({ date: fmtTime(e.start), desc: e.summary }));
  return {
    slides: [createSlideWithWidget('calendar',
      // This heading is the one importer string that reaches the SCREEN, not
      // just the slide rail — an English line above a German calendar.
      { heading: tx('Upcoming Events'), items },
      { title: stripExt(file.name, tx('Calendar')), duration: 14 })],
  };
}
