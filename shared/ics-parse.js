// Minimal iCalendar (.ics) parser shared by the import flow and the live
// calendar widget. Handles VEVENT blocks, folded lines, and basic date forms.

import { zonedWallTimeToDate } from './utils/zoned-time.js';

// An event is a flat map of property → value, plus one extra key:
//
//   params  { DTSTART: { TZID: 'Europe/Berlin' }, … }
//
// The parameters used to be dropped on the floor. That is fine for most of
// them, but TZID is the difference between "09:00" and an instant: a feed from
// a calendar in another zone was read as the DISPLAY's local time, so a Berlin
// meeting showed up on a New York screen six hours late, silently.
export function parseIcs(text) {
  const lines = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; }
    else if (cur) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const raw = line.slice(0, idx);
      const [key, ...paramParts] = raw.split(';');
      cur[key] = line.slice(idx + 1);
      if (paramParts.length) {
        const params = {};
        for (const part of paramParts) {
          const eq = part.indexOf('=');
          if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
        }
        (cur.params ??= {})[key] = params;
      }
    }
  }
  return events;
}

function unescapeIcs(s) {
  return String(s ?? '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
}

// "YYYYMMDD", "YYYYMMDDTHHMMSS", "YYYYMMDDTHHMMSSZ" → Date | null
//
// Three forms, three meanings, and the third one used to be read as the second:
//   …Z            an instant, in UTC.
//   TZID=Zone     a wall time IN THAT ZONE — pass the zone as `tzid`.
//   neither       a "floating" wall time, which the spec says belongs to
//                 whoever is reading it: the display's own clock.
// An all-day value (no T) stays local midnight whatever the zone says — that is
// what a date without a time means to a viewer.
export function parseIcsDate(v, tzid) {
  if (!v) return null;
  const m = String(v).match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  if (tzid && /T/.test(String(v))) {
    const zoned = zonedWallTimeToDate({ y: +y, mo: +mo, d: +d, h: +h, mi: +mi, s: +s }, tzid);
    if (zoned) return zoned;   // null = a zone Intl does not know; fall through
  }
  return new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

// All events: { start: Date, end: Date|null, summary, location, allDay },
// sorted by start. Missing DTEND → assume a 1h block so "in progress" works.
export function allEvents(text) {
  return parseIcs(text)
    .map(e => {
      const start = parseIcsDate(e.DTSTART, e.params?.DTSTART?.TZID);
      let end = parseIcsDate(e.DTEND, e.params?.DTEND?.TZID);
      if (start && !end) end = new Date(start.getTime() + 3600 * 1000);
      return {
        start, end,
        summary: unescapeIcs(e.SUMMARY) || '(no title)',
        location: unescapeIcs(e.LOCATION),
        allDay: !!(e.DTSTART && !/T/.test(e.DTSTART)),
      };
    })
    .filter(e => e.start)
    .sort((a, b) => a.start - b.start);
}

// Upcoming-first events. Keeps events ongoing/started within the last 12h so a
// meeting in progress still shows.
export function upcomingEvents(text, limit = 8) {
  const cutoff = Date.now() - 12 * 3600 * 1000;
  return allEvents(text).filter(e => e.start.getTime() >= cutoff).slice(0, limit);
}
