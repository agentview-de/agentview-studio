# Security policy

We take the security of **agentView Studio** seriously even though it is a
client-side application that ships no backend of its own.

## Scope

This policy covers the code in **this repository** — the admin console
(`admin/`, `index.html`), the player (`player/`, `display.html`), the shared
widget plugins (`shared/`), and the local dev/proxy helper (`server.mjs`).

It also covers the way this code interacts with:

- the **public** agentView REST API it talks to, and
- the third-party services individual widgets bridge to in the browser
  (weather, map tiles, geocoding, currency, RSS feeds —
  see [`docs/datenquellen.md`](docs/datenquellen.md) and
  [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)).

Out of scope:

- **The agentView platform itself** (server, database, owner/agent API
  implementation, delivery infrastructure). Report those against the platform
  via the contact on **agentview.de**, not against this repository.
- **Third-party services we merely bridge to.** Report those through the third
  party's own channel (e.g. an upstream tile, font, or feed provider).

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Use GitHub's **private vulnerability reporting** for this repository (the
**Security** tab → *Report a vulnerability*), which reaches the maintainer
privately. Include:

- A description of the issue (what the code does wrong, what the attacker
  gains).
- Step-by-step reproduction.
- The affected version — the commit SHA you are looking at.
- Optional: a suggested fix.

This is a **small, single-maintainer reference project**, so there is **no
guaranteed response time** — reports are handled on a best-effort basis. Fixes
land as time allows, with script-injection and account-hijacking issues
prioritised. Contributors are credited in the release notes unless they ask to
stay anonymous.

## What we consider in-scope vulnerabilities

- **HTML/script injection** through untrusted content — a widget that renders
  slide data, an imported file, or a third-party API response without going
  through the existing escaping/sanitising helpers
  (`shared/utils/escape.js`, `shared/sanitize-html.js`, `shared/safe-url.js`).
- **Unsafe URL handling** — a widget that loads an attacker-controlled `src`,
  iframe, or stylesheet that bypasses `isSafeImgUrl` / `cssUrl`.
- A widget or importer that **exfiltrates session data** to a host not called
  out in the documentation.
- The published self-contained player bundle (`admin/publish.js` output) pulling
  in an unexpected or attacker-influenced module.
- The local dev proxy (`server.mjs`) forwarding requests to an unintended
  upstream, or leaking credentials in transit.

## What we explicitly do NOT consider a vulnerability

- The fact that several widgets call **public, no-auth third-party endpoints**
  (Open-Meteo, OpenStreetMap/Nominatim, CARTO tiles, ExchangeRate-API, publisher
  RSS feeds). These are documented in
  [`docs/datenquellen.md`](docs/datenquellen.md); a provider changing or removing
  an endpoint is a normal breaking change, not a security bug.
- The fact that `server.mjs` attaches permissive CORS headers and proxies to
  `agentview.de`. It is a **local development convenience**, intended for
  `localhost` only — do not expose it on a public interface.
- Rate-limiting or abuse-protection of the agentView platform. That is the
  platform's responsibility — report it against the platform.

## Known design tradeoff — credential storage

agentView Studio has **no backend of its own**, so the agentView API key (or
session token) you connect with is held in the browser's `localStorage`
(`avs_conn`). This is convenient (no server round-trip) but means **a successful
script-injection bug in the app could read that credential**. We mitigate by
routing all untrusted content through the escaping/sanitising helpers above and
by pinning every CDN dependency with Subresource Integrity. For commercial
deployments, prefer connecting with a **short-lived session token** (via the
login flow) over a long-lived API key where possible.

## Coordinated disclosure

If your finding affects the agentView platform OR a third party a widget bridges
to, we will forward your report (with credit) to the relevant team and
coordinate the timing of the public disclosure with them.
