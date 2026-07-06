// Pure schema field-tier filter — extracted from buildForm so it is unit-testable
// without the DOM.
//
// The inline inspector passes tierFilter:'basic' to show only the essential
// controls (PowerPoint-simple); the Widget Designer passes 'all' (or omits it)
// to show everything. A field opts into advanced via `tier: 'advanced'` —
// everything else (no tier / 'basic') stays. Rows filter their children and drop
// when empty; section markers left with no content before the next section / EOF
// are dropped so the basic view shows no empty groups. Any value other than
// 'basic' (incl. undefined) returns the fields unchanged → backward-compatible.
export function filterFieldsByTier(fields, tierFilter) {
  const src = Array.isArray(fields) ? fields : [];
  if (tierFilter !== 'basic') return src;
  const isAdv = x => x && x.tier === 'advanced';
  const kept = [];
  for (const f of src) {
    if (f.type === 'row') {
      const children = (Array.isArray(f.children) ? f.children : []).filter(c => !isAdv(c));
      if (children.length) kept.push({ ...f, children });
      continue;
    }
    if (f.type === 'section') { kept.push(f); continue; }
    if (isAdv(f)) continue;
    kept.push(f);
  }
  // Drop section markers with no content before the next section / EOF.
  const out = [];
  for (let i = 0; i < kept.length; i++) {
    if (kept[i].type === 'section' && (!kept[i + 1] || kept[i + 1].type === 'section')) continue;
    out.push(kept[i]);
  }
  return out;
}
