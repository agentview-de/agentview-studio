// Traffic-light status colours shared by every widget with good/warn/bad
// semantics (kpi-cards' delta arrows + target bars, progress' threshold
// colours, future SLA/status widgets). One definition so "green means good"
// is the SAME green everywhere — and a planned 'lower is better' inversion
// flips one mapping instead of hunting hex literals across plugins. The hexes
// are saturated enough to read on both the dark themes and 'editorial-mono'.
export const STATUS_COLORS = Object.freeze({
  good: '#10b981',
  warn: '#f59e0b',
  bad:  '#ef4444',
});
