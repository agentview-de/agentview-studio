// Curated RSS feed directory for the feed picker. Grouped by category.
//
// IMPORTANT — only feeds that explicitly allow cross-origin reads (CORS) work
// in the browser-side RSS widget. Every entry below was end-to-end verified:
// the URL responds 200 directly (no redirects, since CORS doesn't survive a
// 3xx hop), the body is valid RSS/Atom XML, and it returns either
// `Access-Control-Allow-Origin: *` or reflects the request origin.
//
// Many otherwise popular feeds refuse cross-origin reads and are deliberately
// NOT listed (they would show "Feed unavailable" in the widget): BBC, Spiegel,
// Hacker News, The Verge, Ars Technica, Zeit, FAZ, Welt, NPR, TechCrunch,
// Reddit (.rss), Reuters, Politico, Engadget, Slashdot, Phys.org, ScienceDaily.
//
// When adding a feed, verify with the FINAL URL (don't trust a feed that 301s):
//   curl -I -H "Origin: http://localhost" <URL> | grep -i access-control
//
// `commercial` is a HINT for the UI to show a business-use info marker next to
// a feed — it does NOT block anything. Values:
//   'ok'      — clearly-permissive source, fine to display commercially
//               (US-gov / public-domain, or explicitly open: NASA, W3C,
//               dev.to, github.blog).
//   'caution' — CONSERVATIVE default for everything else: commercial
//               publishers (NYT, Dow Jones/MarketWatch, Handelsblatt,
//               WirtschaftsWoche, ESPN, kicker, heise, Wired) and broadcasters
//               (tagesschau, Deutsche Welle), plus CC-NC sources (Quanta).
//               Check the publisher's terms before commercial display.

export const RSS_FEEDS = [
  { category: 'News — Welt', feeds: [
    { name: 'Deutsche Welle — Top Stories (EN)', url: 'https://rss.dw.com/atom/rss-en-top', commercial: 'caution' },
    { name: 'New York Times — Home', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', commercial: 'caution' },
  ] },

  { category: 'News — Deutschland', feeds: [
    { name: 'Tagesschau — Schlagzeilen', url: 'https://www.tagesschau.de/index~rss2.xml', commercial: 'caution' },
    { name: 'Tagesschau — Inland', url: 'https://www.tagesschau.de/inland/index~rss2.xml', commercial: 'caution' },
    { name: 'Tagesschau — Ausland', url: 'https://www.tagesschau.de/ausland/index~rss2.xml', commercial: 'caution' },
    { name: 'Deutsche Welle — Top Stories (DE)', url: 'https://rss.dw.com/atom/rss-de-top', commercial: 'caution' },
  ] },

  { category: 'Technology', feeds: [
    { name: 'heise online', url: 'https://www.heise.de/rss/heise-atom.xml', commercial: 'caution' },
    { name: 'Wired', url: 'https://www.wired.com/feed/rss', commercial: 'caution' },
    { name: 'GitHub Blog', url: 'https://github.blog/feed/', commercial: 'ok' },
    { name: 'GitHub Changelog', url: 'https://github.blog/changelog/feed/', commercial: 'ok' },
    { name: 'Dev.to', url: 'https://dev.to/feed/', commercial: 'ok' },
    { name: 'W3C — News', url: 'https://www.w3.org/news/feed/', commercial: 'ok' },
  ] },

  { category: 'Business / Finance', feeds: [
    { name: 'MarketWatch — Top Stories', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', commercial: 'caution' },
    { name: 'MarketWatch — Market Pulse', url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse', commercial: 'caution' },
    { name: 'MarketWatch — Bulletins', url: 'https://feeds.content.dowjones.io/public/rss/mw_bulletins', commercial: 'caution' },
    { name: 'Tagesschau — Wirtschaft', url: 'https://www.tagesschau.de/wirtschaft/index~rss2.xml', commercial: 'caution' },
    { name: 'Handelsblatt — Schlagzeilen', url: 'https://feeds.cms.handelsblatt.com/schlagzeilen', commercial: 'caution' },
    { name: 'Wirtschaftswoche', url: 'https://feeds.cms.wiwo.de/rss/schlagzeilen', commercial: 'caution' },
    { name: 'Deutsche Welle — Wirtschaft (DE)', url: 'https://rss.dw.com/atom/rss-de-eco', commercial: 'caution' },
  ] },

  { category: 'Sport', feeds: [
    { name: 'Tagesschau — Sport', url: 'https://www.tagesschau.de/sport/index~rss2.xml', commercial: 'caution' },
    { name: 'kicker — Aktuell', url: 'https://newsfeed.kicker.de/news/aktuell', commercial: 'caution' },
    { name: 'kicker — Bundesliga', url: 'https://newsfeed.kicker.de/news/bundesliga', commercial: 'caution' },
    { name: 'kicker — Champions League', url: 'https://newsfeed.kicker.de/news/champions-league', commercial: 'caution' },
    { name: 'kicker — DFB-Pokal', url: 'https://newsfeed.kicker.de/news/dfb-pokal', commercial: 'caution' },
    { name: 'kicker — Eishockey', url: 'https://newsfeed.kicker.de/news/eishockey', commercial: 'caution' },
    { name: 'kicker — Handball', url: 'https://newsfeed.kicker.de/news/handball', commercial: 'caution' },
    { name: 'ESPN — Top', url: 'https://www.espn.com/espn/rss/news', commercial: 'caution' },
    { name: 'ESPN — NBA', url: 'https://www.espn.com/espn/rss/nba/news', commercial: 'caution' },
    { name: 'ESPN — NFL', url: 'https://www.espn.com/espn/rss/nfl/news', commercial: 'caution' },
    { name: 'ESPN — Soccer', url: 'https://www.espn.com/espn/rss/soccer/news', commercial: 'caution' },
    { name: 'Deutsche Welle — Sport (DE)', url: 'https://rss.dw.com/atom/rss-de-sport', commercial: 'caution' },
  ] },

  { category: 'Wissenschaft / Science', feeds: [
    { name: 'NASA — News Releases', url: 'https://www.nasa.gov/news-release/feed/', commercial: 'ok' },
    { name: 'NASA — Image of the Day', url: 'https://www.nasa.gov/feeds/iotd-feed/', commercial: 'ok' },
    { name: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/', commercial: 'caution' },
    { name: 'Tagesschau — Wissen', url: 'https://www.tagesschau.de/wissen/index~rss2.xml', commercial: 'caution' },
  ] },
];
