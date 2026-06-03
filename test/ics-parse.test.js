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

  test('property parameters (TZID=…) are stripped from the key', () => {
    const events = parseIcs(ics`BEGIN:VEVENT
DTSTART;TZID=Europe/Berlin:20260601T090000
END:VEVENT`);
    // Key is reduced to DTSTART; the value keeps the raw timestamp.
    expect(events[0].DTSTART).toBe('20260601T090000');
    expect('DTSTART;TZID=Europe/Berlin' in events[0]).toBe(false);
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
