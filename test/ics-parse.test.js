// Tests for shared/ics-parse.js — the minimal iCalendar parser behind the .ics
// import flow and the live calendar widget.
//
// Timezone note: parseIcsDate uses the LOCAL Date constructor for floating
// (no-Z) timestamps and Date.UTC for the trailing-Z (UTC) form. The assertions
// build their expected instants the same way and compare via getTime(), so the
// suite is correct on any host timezone. ICS text is built with String.raw +
// CRLF so RFC5545 backslash escapes and line folding survive into the parser
// exactly as a real feed would deliver them.
import { describe, test, expect } from './runner.js';
import { parseIcs, parseIcsDate, allEvents, upcomingEvents } from '../shared/ics-parse.js';

// Author multi-line ICS with real CRLF terminators (RFC5545) without fighting
// JS string escaping. As a tag, `strings` already carries the raw segments
// (so `\,` / `\n` reach the parser as literal backslash escapes); we just swap
// the source newlines for CRLF the way a real feed delivers them.
const ics = (strings, ...vals) =>
  String.raw(strings, ...vals).replace(/\r?\n/g, '\r\n');

describe('parseIcsDate', () => {
  test('date-only YYYYMMDD → local midnight', () => {
    expect(parseIcsDate('20260601').getTime()).toBe(new Date(2026, 5, 1, 0, 0, 0).getTime());
  });

  test('local datetime YYYYMMDDTHHMMSS', () => {
    expect(parseIcsDate('20260601T143000').getTime()).toBe(new Date(2026, 5, 1, 14, 30, 0).getTime());
  });

  test('UTC datetime with trailing Z is parsed as UTC', () => {
    expect(parseIcsDate('20260601T143000Z').getTime()).toBe(Date.UTC(2026, 5, 1, 14, 30, 0));
  });

  test('seconds are optional', () => {
    expect(parseIcsDate('20260601T1430').getTime()).toBe(new Date(2026, 5, 1, 14, 30, 0).getTime());
  });

  test('null / empty / garbage → null', () => {
    expect(parseIcsDate(null)).toBe(null);
    expect(parseIcsDate(undefined)).toBe(null);
    expect(parseIcsDate('')).toBe(null);
    expect(parseIcsDate('not-a-date')).toBe(null);
  });
});

describe('parseIcs · VEVENT extraction', () => {
  test('a single VEVENT yields one event with its properties', () => {
    const events = parseIcs(ics`BEGIN:VEVENT
SUMMARY:Standup
DTSTART:20260601T090000
END:VEVENT`);
    expect(events).toHaveLength(1);
    expect(events[0].SUMMARY).toBe('Standup');
    expect(events[0].DTSTART).toBe('20260601T090000');
  });

  test('multiple VEVENTs are all collected', () => {
    const events = parseIcs(ics`BEGIN:VEVENT
SUMMARY:A
DTSTART:20260603T090000
END:VEVENT
BEGIN:VEVENT
SUMMARY:B
DTSTART:20260601T090000
END:VEVENT`);
    expect(events).toHaveLength(2);
    expect(events.map(e => e.SUMMARY)).toEqual(['A', 'B']);
  });

  test('folded continuation lines (CRLF + space) are joined seamlessly', () => {
    // RFC5545 line folding may split anywhere — unfolding removes the CRLF+space
    // boundary WITHOUT inserting a separator, so "Quar" + "terly" → "Quarterly".
    const events = parseIcs(ics`BEGIN:VEVENT
SUMMARY:Quar
 terly review
DTSTART:20260601T090000
END:VEVENT`);
    expect(events[0].SUMMARY).toBe('Quarterly review');
  });

  test('property parameters are stripped from the key — and kept where they matter', () => {
    const events = parseIcs(ics`BEGIN:VEVENT
DTSTART;TZID=Europe/Berlin:20260601T090000
END:VEVENT`);
    // Key is reduced to DTSTART; the value keeps the raw timestamp.
    expect(events[0].DTSTART).toBe('20260601T090000');
    expect('DTSTART;TZID=Europe/Berlin' in events[0]).toBe(false);
    // …but the zone is not thrown away: without it "09:00" means nothing to
    // anyone standing somewhere else.
    expect(events[0].params.DTSTART.TZID).toBe('Europe/Berlin');
  });

  test('a quoted parameter value and several parameters at once', () => {
    const events = parseIcs(ics`BEGIN:VEVENT
DTSTART;VALUE=DATE-TIME;TZID="Europe/Berlin":20260601T090000
END:VEVENT`);
    expect(events[0].DTSTART).toBe('20260601T090000');
    expect(events[0].params.DTSTART.TZID).toBe('Europe/Berlin');
    expect(events[0].params.DTSTART.VALUE).toBe('DATE-TIME');
  });

  test('lines outside a VEVENT block are ignored', () => {
    const events = parseIcs(ics`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Only me
DTSTART:20260601T090000
END:VEVENT
END:VCALENDAR`);
    expect(events).toHaveLength(1);
    expect(events[0].SUMMARY).toBe('Only me');
  });
});

describe('allEvents', () => {
  test('missing DTEND defaults to a 1-hour block', () => {
    const e = allEvents(ics`BEGIN:VEVENT
SUMMARY:Quick
DTSTART:20260601T100000
END:VEVENT`)[0];
    expect(e.end.getTime() - e.start.getTime()).toBe(3600 * 1000);
  });

  test('explicit DTEND is honoured', () => {
    const e = allEvents(ics`BEGIN:VEVENT
SUMMARY:Long
DTSTART:20260601T080000
DTEND:20260601T093000
END:VEVENT`)[0];
    expect(e.end.getTime()).toBe(new Date(2026, 5, 1, 9, 30, 0).getTime());
  });

  test('all-day detection: date-only DTSTART → allDay true, datetime → false', () => {
    const events = allEvents(ics`BEGIN:VEVENT
SUMMARY:Holiday
DTSTART:20260601
END:VEVENT
BEGIN:VEVENT
SUMMARY:Meeting
DTSTART:20260601T090000
END:VEVENT`);
    const byName = Object.fromEntries(events.map(e => [e.summary, e.allDay]));
    expect(byName.Holiday).toBe(true);
    expect(byName.Meeting).toBe(false);
  });

  test('events are sorted ascending by start', () => {
    const events = allEvents(ics`BEGIN:VEVENT
SUMMARY:Later
DTSTART:20260605T100000
END:VEVENT
BEGIN:VEVENT
SUMMARY:AllDay
DTSTART:20260601
END:VEVENT
BEGIN:VEVENT
SUMMARY:Mid
DTSTART:20260603T080000
END:VEVENT`);
    expect(events.map(e => e.summary)).toEqual(['AllDay', 'Mid', 'Later']);
  });

  test('events without a parseable DTSTART are dropped', () => {
    const events = allEvents(ics`BEGIN:VEVENT
SUMMARY:NoStart
END:VEVENT
BEGIN:VEVENT
SUMMARY:Good
DTSTART:20260601T090000
END:VEVENT`);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe('Good');
  });

  test('SUMMARY / LOCATION backslash escapes are unescaped', () => {
    const e = allEvents(ics`BEGIN:VEVENT
SUMMARY:Lunch\, Team\; Sync
LOCATION:Room\nFloor 2
DTSTART:20260601T120000
END:VEVENT`)[0];
    expect(e.summary).toBe('Lunch, Team; Sync');
    expect(e.location).toBe('Room Floor 2');   // literal \n collapses to a space
  });

  test('missing SUMMARY → "(no title)"; missing LOCATION → empty string', () => {
    const e = allEvents(ics`BEGIN:VEVENT
DTSTART:20260601
END:VEVENT`)[0];
    expect(e.summary).toBe('(no title)');
    expect(e.location).toBe('');
  });

  test('empty input → empty array', () => {
    expect(allEvents('')).toEqual([]);
  });
});

describe('upcomingEvents', () => {
  test('keeps future events and respects the limit', () => {
    // Build three events strictly in the future relative to now.
    const fmt = d => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}` +
      `${String(d.getUTCMinutes()).padStart(2, '0')}00Z`;
    const inHours = h => new Date(Date.now() + h * 3600 * 1000);
    const text = ics`BEGIN:VEVENT
SUMMARY:Soon
DTSTART:${fmt(inHours(2))}
END:VEVENT
BEGIN:VEVENT
SUMMARY:Soonish
DTSTART:${fmt(inHours(4))}
END:VEVENT
BEGIN:VEVENT
SUMMARY:Late
DTSTART:${fmt(inHours(6))}
END:VEVENT`;
    const up = upcomingEvents(text, 2);
    expect(up).toHaveLength(2);
    expect(up.map(e => e.summary)).toEqual(['Soon', 'Soonish']);
  });

  test('drops events that ended more than 12h ago', () => {
    const fmt = d => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}` +
      `${String(d.getUTCMinutes()).padStart(2, '0')}00Z`;
    const longAgo = new Date(Date.now() - 48 * 3600 * 1000);
    const text = ics`BEGIN:VEVENT
SUMMARY:Ancient
DTSTART:${fmt(longAgo)}
END:VEVENT`;
    expect(upcomingEvents(text)).toEqual([]);
  });
});

// A wall time plus the zone it belongs to.
//
// `DTSTART;TZID=Europe/Berlin:20260830T090000` is what Google and Outlook write
// for every timed event. The zone used to be dropped and the wall time read as
// the DISPLAY's local time — so a Berlin meeting on a New York screen sat there
// saying 09:00, six hours late, and nothing said otherwise.
//
// Every assertion below is on the resulting INSTANT, so the suite means the
// same thing on any machine.
describe('ics · TZID is the difference between a wall time and an instant', () => {
  const startOf = (text) => allEvents(text)[0].start;

  test('REGRESSION: the same wall time in two zones is not the same instant', () => {
    // The assertion that means the same thing on every machine. Read as local
    // time — which is what dropping the zone amounts to — these two parse
    // identically and the gap is zero, wherever the suite happens to run.
    const berlin = startOf(ics`BEGIN:VEVENT
DTSTART;TZID=Europe/Berlin:20260830T090000
END:VEVENT`);
    const newYork = startOf(ics`BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260830T090000
END:VEVENT`);
    expect((newYork - berlin) / 3600000).toBe(6);
  });

  test('REGRESSION: a zoned summer time resolves to the right instant', () => {
    // 09:00 Berlin in August is CEST, UTC+2.
    const d = startOf(ics`BEGIN:VEVENT
DTSTART;TZID=Europe/Berlin:20260830T090000
END:VEVENT`);
    expect(d.toISOString()).toBe('2026-08-30T07:00:00.000Z');
  });

  test('REGRESSION: the same wall time in winter is an hour further from UTC', () => {
    // 09:00 Berlin in January is CET, UTC+1 — proof the offset is read AT the
    // instant rather than taken as a constant.
    const d = startOf(ics`BEGIN:VEVENT
DTSTART;TZID=Europe/Berlin:20260130T090000
END:VEVENT`);
    expect(d.toISOString()).toBe('2026-01-30T08:00:00.000Z');
  });

  test('a zone on the other side of the world, and one with a half-hour offset', () => {
    expect(startOf(ics`BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260830T090000
END:VEVENT`).toISOString()).toBe('2026-08-30T13:00:00.000Z');
    expect(startOf(ics`BEGIN:VEVENT
DTSTART;TZID=Asia/Kolkata:20260830T090000
END:VEVENT`).toISOString()).toBe('2026-08-30T03:30:00.000Z');
  });

  test('DTEND carries its own zone', () => {
    const [e] = allEvents(ics`BEGIN:VEVENT
DTSTART;TZID=Europe/Berlin:20260830T090000
DTEND;TZID=Europe/Berlin:20260830T103000
END:VEVENT`);
    expect(e.end.toISOString()).toBe('2026-08-30T08:30:00.000Z');
  });

  test('a Z value ignores any zone it is given — it is already an instant', () => {
    expect(startOf(ics`BEGIN:VEVENT
DTSTART;TZID=Europe/Berlin:20260830T070000Z
END:VEVENT`).toISOString()).toBe('2026-08-30T07:00:00.000Z');
  });

  test('a floating time still belongs to whoever reads it', () => {
    // No zone, no Z: the spec says this is the reader's local wall time, and a
    // display showing its own building's schedule depends on that.
    const d = startOf(ics`BEGIN:VEVENT
DTSTART:20260830T090000
END:VEVENT`);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  test('an all-day date stays local midnight, zone or no zone', () => {
    for (const line of ['DTSTART;TZID=Asia/Tokyo:20260830', 'DTSTART:20260830']) {
      const d = startOf(`BEGIN:VEVENT\n${line}\nEND:VEVENT`);
      expect(d.getHours()).toBe(0);
      expect(d.getDate()).toBe(30);
    }
  });

  test('a zone nobody has heard of falls back to local instead of throwing', () => {
    const d = startOf(ics`BEGIN:VEVENT
DTSTART;TZID=Mittelerde/Auenland:20260830T090000
END:VEVENT`);
    expect(d.getHours()).toBe(9);
  });

  test('the hour that does not exist still yields a usable instant', () => {
    // Europe/Berlin jumps 02:00 → 03:00 on 29 March 2026, so 02:30 never
    // happens. A calendar can still contain it; the player must not show
    // "Invalid Date" on a wall.
    const d = startOf(ics`BEGIN:VEVENT
DTSTART;TZID=Europe/Berlin:20260329T023000
END:VEVENT`);
    expect(Number.isNaN(d.getTime())).toBeFalsy();
    expect(d.toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  test('the hour that happens twice resolves to one of them, not to neither', () => {
    // 25 October 2026, 02:30 Berlin exists twice (CEST then CET).
    const d = startOf(ics`BEGIN:VEVENT
DTSTART;TZID=Europe/Berlin:20261025T023000
END:VEVENT`);
    expect(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']).toContain(d.toISOString());
  });
});
