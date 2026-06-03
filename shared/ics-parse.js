// Minimal iCalendar (.ics) parser shared by the import flow and the live
// calendar widget. Handles VEVENT blocks, folded lines, and basic date forms.

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
      const key = line.slice(0, idx).split(';')[0];
      cur[key] = line.slice(idx + 1);
    }
  }
  return events;
}

function unescapeIcs(s) {
  return String(s ?? '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
}

// "YYYYMMDD", "YYYYMMDDTHHMMSS", "YYYYMMDDTHHMMSSZ" → Date | null
export function parseIcsDate(v) {
  if (!v) return null;
  const m = String(v).match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

// All events: { start: Date, end: Date|null, summary, location, allDay },
// sorted by start. Missing DTEND → assume a 1h block so "in progress" works.
export function allEvents(text) {
  return parseIcs(text)
    .map(e => {
      const start = parseIcsDate(e.DTSTART);
      let end = parseIcsDate(e.DTEND);
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
