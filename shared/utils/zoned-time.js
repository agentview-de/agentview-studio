// "09:00 in Europe/Berlin" → the instant that actually is.
//
// A calendar feed writes timed events as a WALL TIME plus the zone it belongs
// to: `DTSTART;TZID=Europe/Berlin:20260830T090000`. Without the zone the wall
// time is meaningless to anyone standing anywhere else — read as local time on
// a display in New York, that 09:00 meeting shows up as 09:00 New York, six
// hours late, and nothing on the screen says so.
//
// No timezone library: Intl already carries the whole IANA database. The trick
// is to ask it what a candidate instant looks like IN the zone, compare that to
// the wall time we wanted, and correct by the difference. Twice, because the
// offset itself can change between the guess and the answer — that is the hour
// around a DST switch.

// How far ahead of UTC the zone is at this instant, in milliseconds.
function offsetAt(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t) => Number(parts.find(p => p.type === t)?.value);
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asIfUtc - utcMs;
}

/**
 * @param {{y:number,mo:number,d:number,h?:number,mi?:number,s?:number}} wall
 * @param {string} tz  IANA zone name
 * @returns {Date|null} null when the zone is not one Intl knows — the caller
 *          then keeps whatever it would have done without a zone, rather than
 *          throwing a calendar off a screen over one bad line.
 */
export function zonedWallTimeToDate({ y, mo, d, h = 0, mi = 0, s = 0 }, tz) {
  if (!tz) return null;
  const wantUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let off;
  try { off = offsetAt(wantUtc, tz); } catch { return null; }   // unknown zone
  let ms = wantUtc - off;
  // Second pass: if the first guess landed on the other side of a DST switch,
  // the offset it was corrected by was the wrong one.
  const off2 = offsetAt(ms, tz);
  if (off2 !== off) ms = wantUtc - off2;
  return new Date(ms);
}
