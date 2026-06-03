// admin/legal-links.js — operator legal links (Impressum / Datenschutz).
//
// IMPORTANT (open source): an Impressum / Datenschutzerklärung is an obligation
// of whoever OPERATES a publicly reachable instance — it is NOT a property of
// this source code. So this map is keyed by hostname: a link only ever renders
// on the exact public deployment it belongs to. A fork on ANY other host shows
// NOTHING — that is intentional. If you run a public instance, add your OWN
// hostname here and point it at your OWN pages. Never surface another operator's
// legal pages as if they were yours.
//
// See docs/datenquellen.md → "Betreiberpflichten (Impressum / Datenschutz)".

const LEGAL_LINKS = {
  // agentView's own canonical deployment (operator: Rafael Kocurek, agentview.de).
  'studio.agentview.de': {
    impressum: 'https://agentview.de/impressum.html',
    datenschutz: 'https://agentview.de/datenschutz.html',
  },
};

/**
 * Legal links for the current (or given) host, or null when none are configured
 * — e.g. on a fork, a self-hosted copy, or localhost. Callers must treat null as
 * "render no legal links".
 */
export function legalLinks(hostname = location.hostname) {
  return LEGAL_LINKS[hostname] ?? null;
}
