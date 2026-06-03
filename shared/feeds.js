// Multi-feed fetch + parse, shared by the RSS and News-with-Photos widgets and
// their offline provisioning. One place owns the "fetch every feed in parallel,
// parse each as XML, map <item>/<entry>, merge, sort newest-first, cap" pipeline
// so the live render path and the Studio-side offline refresh stay byte-identical
// (no drift between what the display shows live and what gets stored offline).
//
// One dead feed never blanks the widget (Promise.allSettled + per-feed parse
// try/catch). `okCount` tells the caller how many feeds actually yielded items so
// it can distinguish "no feed configured", "all feeds down", and "fine".
//
// Browser-oriented (DOMParser), but fetch + parse are injectable so the
// orchestration is unit-testable under Node (test/feeds.test.js).

// Parse one feed body into the raw <item>/<entry> nodes mapped via `mapItem`.
// `parseDoc` returns an XML document exposing querySelectorAll (DOMParser default).
export function parseFeedItems(xmlText, mapItem, parseDoc) {
  const parse = parseDoc || ((xml) => new DOMParser().parseFromString(xml, 'application/xml'));
  const doc = parse(xmlText);
  const nodes = Array.from(doc.querySelectorAll('item, entry'));
  return nodes.map(mapItem);
}

// Accept the widgets' `url` shape: an array of feed URLs (new) or a single
// string (legacy). Empty/blank entries are dropped.
function normalizeUrls(urls) {
  if (Array.isArray(urls)) return urls.filter(Boolean);
  if (typeof urls === 'string' && urls) return [urls];
  return [];
}

// Fetch + merge every feed. Returns { items, okCount, configured }:
//   configured — at least one feed URL was given
//   okCount    — feeds that parsed to ≥1 item (0 → "feed unavailable")
//   items      — merged, newest-first, capped to maxItems
export async function fetchFeedItems(urls, { signal, mapItem, maxItems = 10, fetchImpl, parseDoc } = {}) {
  const list = normalizeUrls(urls);
  if (!list.length) return { items: [], okCount: 0, configured: false };

  const doFetch = fetchImpl || fetch;
  const responses = await Promise.allSettled(
    list.map(u => doFetch(u, signal ? { signal } : {}).then(r => r.text())),
  );

  const merged = [];
  let okCount = 0;
  for (const resp of responses) {
    if (resp.status !== 'fulfilled') continue;
    let items;
    try { items = parseFeedItems(resp.value, mapItem, parseDoc); }
    catch { continue; } // malformed body — skip this feed, keep the rest
    if (!items.length) continue;
    okCount++;
    merged.push(...items);
  }
  // Newest first; undated items (date 0) sink to the bottom.
  merged.sort((a, b) => b.date - a.date);
  return { items: merged.slice(0, maxItems), okCount, configured: true };
}
