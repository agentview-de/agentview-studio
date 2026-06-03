<div align="center">

<img src="logo.png" alt="agentView Studio" width="120" />

# agentView Studio

**A complete, in-browser digital-signage studio — no build, no install, no dependencies.**

Design 4K-ready slideshows on a Keynote-style free canvas, then publish them to your
screens — all from a single static HTML app.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![No build step](https://img.shields.io/badge/build-none-brightgreen.svg)](#-self-host--run-locally)
[![Vanilla ES modules](https://img.shields.io/badge/stack-vanilla%20ES%20modules-yellow.svg)](#-architecture)
[![Platform: agentView](https://img.shields.io/badge/platform-agentView-7c3aed.svg)](https://agentview.de)

[**Try it →**](https://studio.agentview.de) · [Live demo](https://studio.agentview.de/display.html?slot=./sample/presentation.json) · [Architecture](#-architecture) · [Contributing](CONTRIBUTING.md)

</div>

---

agentView Studio is a visual editor **and** player for the
[agentView](https://agentview.de) digital-signage platform. You compose slides on a
zoomable free canvas using 33 widget types, schedule them with day-parting, and deploy
to one screen, a whole group, or a hand-picked set — then a built-in **Admin** console
runs the organisation behind the screens (approvals, audit, webhooks, members, licenses).

The entire app is **pure static files**: vanilla ES modules, no framework, no bundler,
no `npm install` to run it. Serve the folder and open `index.html`.

> **Lineage.** Studio is the v2 redesign of an earlier in-house "Bulletin Board"
> prototype (a fixed-zone signage editor). This repository is the standalone Studio
> rewrite — the old prototype is not part of it. The agentView API surface (session
> login, pair-by-code, asset upload, data slots, SSE, broadcast) is unchanged.

---

## ✨ Highlights

| | |
|---|---|
| 🎨 **Free-canvas editor** | A three-column Keynote-style shell: slide rail · zoomable canvas · inspector & library. Drop widgets anywhere, drag/resize with snap guides, live previews. |
| 🧩 **33 widget types** | From plain text and Markdown to live weather, charts, maps, RSS, currency tickers, QR codes, video, PDF and IP-camera streams — see the [full catalog](#-widget-catalog). |
| ▦ **Designs, not fixed zones** | Six layouts (Fullscreen · Split 50/50 · Split 70/30 · Main + ticker · 2×2 grid · Header + main) **stamp editable widgets** onto the canvas — then move them freely. No locked zones. |
| 📺 **Displays dashboard** | Screens grouped by native agentView **groups** (categories), each card showing online state and the slideshow currently running. |
| 🚀 **One-click publish** | Deploy to one display, a whole group, or a hand-picked set. The playlist is bundled into a self-contained player and pushed live in seconds. |
| 🛠 **Admin console** | A third view beside Editor & Displays — a 9-tab owner console: approvals · audit log · webhooks · API keys · members · licenses · connectivity · brand kit · version history. |
| ⏰ **Day-parting & scheduling** | Per slide: days of week · time windows · date ranges. The player evaluates visibility every minute and skips slides outside their window. |
| 🪄 **Drop any file → slideshow** | PDF, multiple images, `.csv`, `.xlsx`, `.docx`, `.pptx`, `.ics`, `.json` — auto-detected and imported as the right widgets. (Drop a media URL for video / streams.) |
| ⌨️ **Command palette + shortcuts** | `⌘/Ctrl+K` runs every action by name · undo/redo · `J`/`K` navigate slides · `D` duplicate · `Del` remove. |
| 🌗 **Themes** | 11 slide themes + light/dark admin chrome. |
| 🎬 **Motion** | 9 slide transitions, 10 per-widget entrance **builds** (fade-up · pop · reveal · blur · rise …), and 6 continuous ambient **loops** (float · pulse · sway · Ken Burns · glow · spin). All pure-CSS and `prefers-reduced-motion`-aware. |
| 🎯 **Plugin architecture** | Every widget type is a small ES-module plugin with a declarative `schema()` and a `render()` that handles its own `dispose()`. The **same** plugin renders the editor preview and the live screen — no drift. |
| 🌍 **Bilingual** | English (default) and German UI, switchable at runtime. |

---

## 🚀 Use it

**Hosted — nothing to install.** Open **[studio.agentview.de](https://studio.agentview.de)**.
The studio runs without an account — connect only when you want to publish to your screens.

**Live demo — no account, no backend.** The player runs fully client-side, so the sample
playlist plays immediately:
**[studio.agentview.de/display.html?slot=./sample/presentation.json](https://studio.agentview.de/display.html?slot=./sample/presentation.json)**

**Install it as a desktop app — no download, no admin rights.**
- **Edge:** ⋯ → *Apps* → *Install this site as an app*
- **Chrome:** ⋯ → *Cast, save, and share* → *Install page as app*

You get a Start-menu/desktop icon that launches the studio in its own window — ideal for
non-technical users. It is still the hosted site, so there is nothing to update.

---

## 🛠 Self-host / run locally

The app is **pure static files — no build, no `npm install` to run.** Serve the folder
with any static web server and open `index.html`:

```bash
npx -y http-server ./ -p 8080      # any OS
# or:
python -m http.server 8080
```

To call the agentView API from your **own** origin, that origin must be allowed by the
API's CORS policy. The bundled Node dev server handles this for local development — it
serves the app **and** proxies `/api`, `/data`, `/send`, `/oauth`, `/.well-known` and the
SSE event stream to `agentview.de` same-origin:

```bash
node server.mjs      # first free port in 8080–8100 · Node 20+ · --help for options
```

It serves the admin app at `/`, the player at `/display.html`, opens your browser, and
has **zero dependencies** of its own.

On **Windows** you can also just **double-click `run-windows.cmd`** — a one-line shortcut
that runs `node server.mjs` (and tells you where to get Node if it's missing).

---

## 🗺️ Architecture

```
agentview-studio/              ← this repository (standalone, no build, no npm)
├── index.html                 admin shell (loads admin/main.js)
├── display.html               player shell (loads player/runtime.js)
├── server.mjs                 optional Node dev server + CORS/SSE proxy
├── sample/                    offline-only demo data (presentation.json)
│
├── admin/                     the editor + displays + admin app
│   ├── main.js                bootstrap + three-view shell (Editor / Displays / Admin)
│   ├── store.js               reactive Proxy store + JSON-snapshot undo/redo
│   ├── api.js                 agentView REST client
│   ├── sse.js                 live event-stream consumer
│   ├── publish.js             self-contained-player bundler
│   ├── publish-flow.js        publish flow — single / group / multiple
│   ├── shortcuts.js           keyboard bindings
│   ├── i18n.js + locales/     English (default) + German
│   ├── importers/             file-type → slide(s) dispatch (PDF · DOCX · PPTX · XLSX · CSV · ICS · JSON · image batch · URL paste)
│   ├── ai/                    smart-split (text → slides)
│   ├── canvas/                zoomable canvas + widget frame (drag · resize · snap)
│   ├── panels/                slide rail · library · inspector (slide + widget forms)
│   ├── views/                 editor (3-column shell) · displays (dashboard) · admin (9-tab console)
│   └── ui/                    command palette · modals · toasts · drag-drop · schema→form inspector · asset library · schedule editor · data-slot inspector · public-API browser
│
├── player/
│   ├── runtime.js             polls slot · day-parting · renders slide.widgets[] · plays builds · 6h hard reload
│   ├── transitions.js         9 slide transitions (fade · zoom · push · wipe · flip …)
│   └── debug-hud.js           ?debug=1 → state HUD
│
├── shared/                    imported by BOTH admin + player — single source of truth
│   ├── plugin-contract.js     { type, label, group, icon, defaults, schema, render } + helpers
│   ├── plugins/               ONE file per widget type (33) + registry + all.js barrel
│   ├── slide-schema.js        schema v3: Playlist / Slide / Widget + per-widget content migration
│   ├── designs.js             the 6 designs, as widget generators
│   ├── animations.js          transition · build · loop catalogs + apply helpers
│   ├── scheduler-core.js      isSlideVisible(slide, now)
│   ├── data/themes.js         slide-theme swatches + the canonical theme list
│   ├── sanitize-html.js       HTML sanitiser for user content
│   ├── safe-url.js            URL allow-listing for embeds
│   └── vendor/                vendored third-party libs (no runtime CDN)
│
├── styles/
│   ├── tokens.css             admin design tokens
│   ├── components.css         shared UI components
│   ├── studio.css             the v2 shell · 3-column editor · canvas · dashboard
│   ├── slide-themes.css       player/widget themes
│   └── fonts.css              self-hosted font faces
│
├── test/                      browser + node test suites (see Development)
└── docs/
    └── datenquellen.md        external data sources + operator (imprint / GDPR) duties
```

### Why this shape?

- **Free-canvas widget model.** A slide is a container; every element is a positioned
  widget with a percent rect (`slide.widgets[]`). Designs are just generators that stamp
  widgets — so the player has **one** render path and there is no separate layout engine.
- **Plugins over a megaswitch.** Each of the 33 widget types is a tiny plugin with a
  declarative schema (the inspector auto-builds the form) and one `render()`/`dispose()`.
  Adding a 34th means a single new file in `shared/plugins/`.
- **Same render in editor and screen.** A `widgetAsSlide()` adapter feeds each widget to
  its plugin, so editor previews and the live player share the exact same code — no drift.
- **Publish-bundler instead of a build step.** Locally the player is clean ES modules. At
  publish time `admin/publish.js` walks the import graph and emits one HTML string with all
  app + vendor JS (marked / pdf.js / Prism) and CSS inlined. Self-hosted fonts are uploaded
  once as agentView assets (sha256-deduped) and referenced by URL — relative `/fonts` paths
  404 on the content host. Vendored libs that widgets lazy-load at render time (the pdf.js
  worker, hls.js, Leaflet) are inlined as source and turned into `blob:`/`data:` URLs at
  runtime — but only for the widget types a given playlist actually uses, so a text-only
  player ships none of them. Net result: the content host serves a page whose every
  dependency it can actually reach.
- **Memory-safe player.** Every plugin returns a `dispose()`; the player calls it before
  each transition, and a scheduled 6-hour hard reload keeps long-running screens honest.

---

## 🧩 Widget catalog

33 widget types, organised into four library groups:

| Group | Widgets |
|---|---|
| **Basic** | Announcement · Markdown · Quote · Code Block · News Ticker · Icon / Symbol · Greeting · Menu / Pricelist |
| **Media** | Image · Image Gallery (Ken Burns) · Video · YouTube / Vimeo · PDF Document · Audio Visualizer · Web Page (iframe) · Embed / Web · Live Stream / IP Camera |
| **Data** | Chart · KPI Cards · Live JSON Viewer · Data Table · Progress / Goal · Map · QR Code · Calendar |
| **Live** | Clock · World Clock · Countdown · Days Since · Currency Ticker · Live Weather · RSS Feed · News with Photos |

---

## 🧰 What you can do

### Build a slideshow on the canvas

1. Add a slide in the left **rail**.
2. From the **Library** pick a widget, or apply a **Design** to stamp a starting arrangement.
3. Drag and resize widgets on the **canvas** — snap guides align them. Scroll to pan,
   `⌘/Ctrl+scroll` to zoom, **Fit** to frame everything.
4. Select a widget to open its **Inspector** (auto-generated form); the preview updates as you type.

### Import an existing file

Drop a file anywhere on the window. Studio detects the type and creates the right slide(s):

| Dropped | Becomes |
|---|---|
| `.pdf` | PDF widget cycling pages |
| `.docx` | Markdown slides — one per top-level heading |
| `.pptx` | Text slides (one per PowerPoint slide), plus image widgets for embedded media |
| `.xlsx` / `.xls` | Chart widget per sheet (or table fallback) |
| `.csv` / `.tsv` | Chart widget |
| `.ics` | Calendar widget with the next 20 events |
| `.json` | Chart if it looks like `{label, value}` data; Live-JSON viewer otherwise |
| One or more images | A single Ken-Burns gallery widget |
| A pasted URL | YouTube/Vimeo → video · image URL → image · video / `.m3u8` URL → video / stream · `.pdf` → PDF · RSS/Atom/XML → feed · `.ics` → embedded calendar · `.json` → Live JSON · anything else → sandboxed iframe |

### Apply a design

Pick a design from the Library (or the `⌘K` palette) — Fullscreen, Split 50/50,
Split 70/30, Main + ticker, 2×2 grid, Header + main. It re-flows your existing widgets
into the design's slots and fills the rest with placeholders. Afterwards everything is an
ordinary widget you can move and resize freely — there are no locked zones.

### Schedule with day-parting

Open a slide's **Schedule**. Set days of week (Mon–Sun), one or more time windows
(`09:00–17:00`), and an optional date range (`2026-12-01 → 2026-12-26`). The player
evaluates visibility every minute and silently skips slides outside their window.

### Publish

Switch to the **Displays** view, or hit the topbar **Publish** button (or press `P`).
Screens are shown as cards grouped by **group** (your native agentView categories), each
card showing online state and the slideshow it's currently running. Pick a target mode:

- **Display** — push to one screen.
- **Group** — Studio resolves the group's member displays and deploys them in one broadcast call.
- **Multiple** — tick a hand-picked set of screens.

Either path uploads your playlist JSON to a data slot, bundles the player into one
HTML string (with runtime binaries uploaded as assets), and ships it. Screens refresh
within seconds.

### Watch what a screen sees

On a display card, click the 👁 icon — a new tab opens with agentView's official
preview-link URL. Edit in the studio; the preview updates as the slot updates.

### Discover free data feeds

The overflow menu (⋯) and `⌘K` palette open **Public APIs** — agentView's curated list of
free, no-auth, CORS-friendly endpoints. One click adds a Live-JSON widget pointing at it.

### Administer the organisation (Admin console)

The third view — beside **Editor** and **Displays** — is a 9-tab owner console for
everything *around* the screens, so you don't need a separate portal:

| Tab | What it does |
|---|---|
| **Approvals** | Review pending content submissions per display — accept, reject, or roll back. |
| **Audit log** | Filter the org activity audit by display, actor, action, and date range; cursor-paginated. |
| **Webhooks** | Register HMAC-SHA256-signed event subscriptions (`display.*`, `data.*`) pointing at **your own** URL. agentView delivers the callbacks; Studio only creates/tests/pauses/deletes the subscriptions. |
| **API keys** | Create scoped keys (`admin` / `content_only`), revoke, hide revoked. |
| **Members** | Invite members, change roles, remove — owners can't eject themselves. |
| **Licenses** | Pool / allocated / used overview, add slots, per-display assign/unassign, plan comparison. |
| **Connectivity** | Org default URL policy: `full-access` · `whitelist-only` · `isolated`. |
| **Brand kit** | Org-wide colors + font, stored in a sidecar data slot. |
| **Versions** | Per-playlist publish history with one-click restore. |

Every tab is a thin client over agentView's `/owner/*` and `/agent/*` REST surface — the
console needs **no backend of its own**, consistent with the single-file, no-install model.

---

## 🔌 agentView API usage

| Endpoint | Used for |
|---|---|
| `POST /api/v1/agent/session/request` + `GET .../status` | Session login |
| `GET  /api/v1/agent/me` | Profile + plan |
| `GET  /api/v1/agent/license-info` | Plan badge |
| `GET  /api/v1/agent/displays` | Displays list (also via SSE delta) |
| `GET  /api/v1/owner/display-categories` | Groups (categories) on the dashboard |
| `POST /api/v1/agent/displays/pair-by-code` | Pair a TV / tablet |
| `POST /api/v1/agent/displays/{id}/content` | Push the bundled player to one display |
| `POST /api/v1/agent/displays/broadcast` | Deploy to a group (resolved display IDs) or a hand-picked set |
| `POST /api/v1/agent/displays/{id}/preview-link` | Live preview tab |
| `POST /api/v1/agent/displays/{id}/configure` | Permissions (cam / mic / geo) |
| `POST /api/v1/agent/displays/{id}/lock` · `unlock` | Lock / unlock |
| `PATCH .../privacy-mode` | Toggle private / public share-TTL |
| `POST /api/v1/assets` + quota | Upload images / PDFs / videos |
| `PUT /api/v1/data/{slug}` + `GET` | Playlist data slot |
| `GET  /api/v1/agent/public-apis` | Public-API browser |
| `GET  /api/v1/agent/events` (SSE) | Live display status |
| `GET/POST/DELETE /api/v1/owner/webhooks` (+ `/{id}/active`, `/{id}/test`) | Admin → Webhooks |
| `GET  /api/v1/owner/activity-audit` | Admin → Audit log |
| `.../owner/displays/{id}/approval-*` + `pending/accept` · `reject` + `rollback` | Admin → Approvals |
| `GET/POST/DELETE /api/v1/agent/api-keys` | Admin → API keys |
| `GET/POST /api/v1/agent/organizations` + members / roles | Admin → Members |
| `.../organizations/{id}/slots` + `displays/{id}/(un)assign-license` + `GET /api/v1/pricing` | Admin → Licenses |
| `POST /api/v1/agent/organizations/{id}/connectivity` | Admin → Connectivity |
| `PUT /api/v1/data/{slug}` (sidecar slots) | Admin → Brand kit + version history |

---

## ⌨️ Keyboard shortcuts

| Combo | Action |
|---|---|
| `Ctrl/⌘ + K` or `/` | Open command palette (run any action) |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` | Redo |
| `J` / `K` | Next / previous slide |
| `D` | Duplicate selected widget |
| `Delete` | Remove selected widget |
| `P` | Publish |
| `Shift + P` | Live preview |
| `Shift + ?` | Show this shortcut list |
| `Esc` | Deselect widget (modals & palette close themselves) |

---

## 🧪 Development

There is **no build step** — these scripts only cover linting and tests.

```bash
npm install        # dev tooling only (eslint + playwright); not needed to run the app
npm run lint       # eslint .
npm test           # headless pure-logic suite (node test/run-node.mjs)
npm run test:browser   # full suite via Playwright (node test/run-browser.mjs)
npm run check      # lint + test
```

The **full** test suite (including DOM-dependent tests) also runs in any browser by
opening `test/index.html`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution
workflow and coding conventions.

---

## 📦 Bundled libraries (vendored — no runtime CDN)

| Library | Purpose | Loaded |
|---|---|---|
| marked.js | Markdown → HTML | eager `<script>` |
| pdf.js | PDF rendering | eager `<script>` |
| Prism | Code syntax highlighting | eager `<script>` |
| qrcode.js | QR-code generation (on-device) | static ES import (with the QR widget) |
| Leaflet | Map widget | lazy (on first map) |
| SheetJS | XLSX import | lazy (on `.xlsx` import) |
| Mammoth | DOCX import | lazy (on `.docx` import) |
| JSZip | PPTX unzip | lazy (on `.pptx` import) |
| hls.js | HLS livestream | lazy (on stream widget) |

All of these are **vendored under [`shared/vendor/`](shared/vendor/) and served locally —
no third-party CDN is contacted at runtime**, so display/viewer IP addresses stay out of
CDN logs (GDPR). Versions, license texts and the full attribution list live in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) and
[`shared/vendor/LICENSES/`](shared/vendor/LICENSES/).

---

## 🌐 External data sources & terms (private vs. commercial use)

Several widgets read **live data straight from external services in the browser**. These
are **not** part of agentView and have their **own** terms; the defaults target **light,
private** use. The full reference (with attribution and what a business user must do) is
[`docs/datenquellen.md`](docs/datenquellen.md).

| Service | Widget | Default: private / commercial | Attribution |
|---|---|---|---|
| **Open-Meteo** | Weather | Private ✓ · commercial: provider terms / own access | "Weather data by Open-Meteo.com" (CC-BY 4.0) |
| **OpenStreetMap tiles** | Map (`osm`) | Private ✓ · commercial: **own tile provider** | "© OpenStreetMap contributors" — required |
| **CARTO basemaps** | Map (`carto-*`) | Private ✓ · commercial: CARTO terms | "© OpenStreetMap contributors © CARTO" — required |
| **Nominatim** (OSM) | Map geocoding | Private ✓ (≤1 req/s) · commercial: **own instance / commercial geocoder** | "© OpenStreetMap contributors" — required |
| **ExchangeRate-API** | Currency | Private ✓ · commercial: **own API key** | Link to exchangerate-api.com — required |
| **QR codes** (generated locally) | QR Code | Private ✓ · commercial ✓ — no external service | — |
| **RSS / Atom feeds** | RSS / News | Content belongs to the publisher · check feed terms | per publisher |
| **Fonts** (self-hosted, `fonts/`) | UI + themes | Private ✓ · commercial ✓ — no external requests (SIL OFL 1.1) | — |

**In short:** weather, map and geocoding defaults are for **private** use. For
**commercial** use you generally need your **own provider / API key / instance** and must
display the **required attribution** — details in
[`docs/datenquellen.md`](docs/datenquellen.md).

### Running a public instance? (imprint / privacy policy)

If you deploy this app on a **public domain**, you are its **operator** — under German law
that means providing your **own imprint (§ 5 DDG)** and a **privacy policy (Art. 13 GDPR)**
that reflects the third-party data flows above (weather / map / currency / RSS IP
transfers, plus the API token kept in `localStorage`). These are an **operator**
obligation, **not** part of the code: the repo ships **no** legal pages and no hard-wired
legal link. The optional menu links in [`admin/legal-links.js`](admin/legal-links.js) are
**host-gated** — they render only on a deployment domain you register there, never on a
fork. See [`docs/datenquellen.md`](docs/datenquellen.md) → *Betreiberpflichten*.

---

## 🤝 Contributing & security

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to set up, test, and submit changes.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community expectations.
- [SECURITY.md](SECURITY.md) — how to report a vulnerability.

---

## 📄 License

MIT — see [`LICENSE`](LICENSE). Third-party components keep their own licenses; see
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

### Trademarks

The MIT license covers the **source code only**.

"agentView", the agentView logo, and related marks are brand assets of Rafael Kocurek,
operator of the agentView platform ([agentview.de](https://agentview.de)). They are
**not** licensed under MIT — the MIT grant covers the code, not the branding.

You may use, modify and redistribute the code under the MIT terms, but this does **not**
grant any right to use the "agentView" name or logo — for example to imply endorsement,
or to present a fork or derivative as the official "agentView" product. **If you fork or
redistribute, use your own branding.**
