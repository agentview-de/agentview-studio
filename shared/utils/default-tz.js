// The viewer device's IANA timezone, with a UTC fallback — the default for
// every timezone-carrying field (countdown target, days-since start, clock).
// Extracted from the byte-identical private helpers countdown.js and
// days-since.js used to carry (and the 'Europe/Berlin' literal clock.js
// hardcoded) so all time widgets resolve "no timezone chosen" the same way.
// The try/catch covers exotic embedders where Intl resolves no zone.
export function defaultTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}
