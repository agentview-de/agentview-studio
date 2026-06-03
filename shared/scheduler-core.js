// Pure functions deciding whether a slide is currently visible.
// Shared by admin (badge on slide card) and player (skip invisible slides).
//
// All times in the user's local timezone unless overridden via opts.tz.

function todayISO(d = new Date()) {
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

function isoDow(d = new Date()) {
  // 1..7 Mon..Sun (ISO)
  return ((d.getDay() + 6) % 7) + 1;
}

function hhmm(d = new Date()) {
  return d.toTimeString().slice(0, 5);
}

function hhmmInRange(now, start, end) {
  // strings like "09:00" — supports wrap-around (e.g. 22:00 → 06:00)
  if (start <= end) return now >= start && now <= end;
  return now >= start || now <= end;
}

export function isSlideVisible(slide, now = new Date()) {
  const s = slide?.schedule;
  if (!s) return true;
  if (s.dateRange) {
    const today = todayISO(now);
    if (s.dateRange.from && today < s.dateRange.from) return false;
    if (s.dateRange.to && today > s.dateRange.to) return false;
  }
  if (Array.isArray(s.daysOfWeek) && s.daysOfWeek.length > 0) {
    const dow = isoDow(now);
    if (!s.daysOfWeek.includes(dow)) return false;
  }
  if (Array.isArray(s.timeRanges) && s.timeRanges.length > 0) {
    const t = hhmm(now);
    const inAny = s.timeRanges.some(r => hhmmInRange(t, r.start, r.end));
    if (!inAny) return false;
  }
  return true;
}

export function filterVisible(slides, now = new Date()) {
  return (slides ?? []).filter(s => isSlideVisible(s, now));
}

// Human-readable schedule summary (for admin slide cards).
export function describeSchedule(slide) {
  const s = slide?.schedule;
  if (!s) return null;
  const parts = [];
  if (s.dateRange?.from || s.dateRange?.to) {
    parts.push(`${s.dateRange.from ?? '…'} → ${s.dateRange.to ?? '…'}`);
  }
  if (s.daysOfWeek?.length) {
    const names = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    parts.push(s.daysOfWeek.map(d => names[d - 1]).join('·'));
  }
  if (s.timeRanges?.length) {
    parts.push(s.timeRanges.map(r => `${r.start}–${r.end}`).join(', '));
  }
  return parts.join(' · ');
}
