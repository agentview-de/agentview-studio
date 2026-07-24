import { createSlideWithWidget } from '../../shared/slide-schema.js';
import { upcomingEvents } from '../../shared/ics-parse.js';
import { stripExt } from './_helpers.js';

export const id = 'ics';
export const label = 'iCalendar';

export function sniff(file) {
  if (!file) return false;
  return file.type === 'text/calendar' || /\.ics$/i.test(file.name ?? '');
}

function fmtTime(d) {
  if (!d) return '';
  return d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export async function convert(file) {
  const text = await file.text();
  const items = upcomingEvents(text, 20).map(e => ({ date: fmtTime(e.start), desc: e.summary }));
  return {
    slides: [createSlideWithWidget('calendar',
      { heading: 'Upcoming Events', items },
      { title: stripExt(file.name, 'Calendar'), duration: 14 })],
  };
}
