# agentView Studio

A complete, in-browser digital-signage **studio** for the
[agentView](https://agentview.de) platform.

Design 4K-ready slideshows on a **Keynote-style free canvas** — 33 widget
types, drag-and-drop positioning, day-parting, one-click office-file imports —
then deploy them to your screens by display or by Group, all from a single-file
HTML app. A built-in **Verwaltung** console runs the org behind the screens —
approvals, audit, webhooks, members, licenses. No build step, no install.

> **Lineage:** Studio is the v2 redesign of an earlier in-house "Bulletin Board"
> prototype (a fixed-zone signage editor). This repository is the standalone
> Studio rewrite; the old prototype is not part of it. The agentView API surface
> (session login, pair-by-code, asset upload, data slots, SSE, broadcast) is
> unchanged from that prototype.

---

## ✨ Highlights

| | |
|---|---|
| **🎨 Free-canvas editor** | A 3-column Keynote-style shell: slide rail · zoomable canvas · inspector/library. Drop widgets anywhere, drag/resize with snap guides, live previews. |
| **🧩 33 widget types** | Text · Markdown · Quote · Code · Ticker · Icon · Greeting · Image · Gallery · Video · YouTube/Vimeo · PDF · Audio Visualizer · iframe · **Embed/Web** · Stream/IP-Camera · Weather · Clock · World Clock · Countdown · Days-Since · Calendar · RSS · News with Photos · Chart · KPI Cards · Live JSON · Data Table · Progress · Currency · Map · Menu · QR Code |
| **▦ Designs, not fixed zones** | Six layouts (Vollbild · Split 50/50 · Split 70/30 · Haupt+Ticker · 2×2 Raster · Kopf+Haupt) **stamp editable widgets** onto the canvas — then move them freely. |
| **📺 Displays dashboard** | Screens grouped by native agentView **Groups** (categories), each card showing online state + the slideshow currently running. |
| **🚀 Veröffentlichen** | Deploy to one display, a whole Group (one broadcast-by-category call), or a hand-picked set. The playlist is bundled into a self-contained player and pushed live. |
| **🛠 Verwaltung console** | A third view beside Editor & Displays — a 9-tab owner console: approvals · audit log · webhooks · API keys · members · licenses · connectivity · brand-kit · version history. Studio *manages* these over agentView's owner API; the platform does the delivery. |
| **⏰ Day-parting + scheduling** | Per slide: days of week · time windows · date ranges. The player skips slides outside their window. |
| **🪄 Drop ANY file → slideshow** | PDF, multi-image, .csv, .xlsx, .docx, .ics, .json, .mp4, .mp3 — auto-detected and imported as the right widgets. |
| **⌨️ Command palette + shortcuts** | ⌘/Ctrl+K runs every action by name · undo/redo · J/K navigate slides · D duplicate · Del remove. |
| **🌗 Themes** | 10 slide themes + light/dark admin. |
| **🎬 Motion** | 9 slide transitions (fade · slide · zoom · zoom-blur · push · wipe · flip …), per-widget entrance **builds** (fade-up · pop · reveal · blur · rise …) with delay + duration, and continuous ambient **loops** (float · pulse · sway · Ken Burns · glow · spin). All pure-CSS and `prefers-reduced-motion`-aware. |
| **🎯 Plugin architecture** | Every widget type is a small ES-module plugin with a declarative `schema()` and a `render()` that handles its own `dispose()`. The **same** plugin renders the editor preview and the live screen. |

---

## 🚀 Use it

**Hosted — nothing to install:** open
**[studio.agentview.de](https://studio.agentview.de)**. The studio runs without
an account — connect only when you want to publish to your screens.

**Live demo — no account:** the player runs fully client-side, so the sample
playlist plays immediately with no backend:
[studio.agentview.de/display.html?slot=./sample/presentation.json](https://studio.agentview.de/display.html?slot=./sample/presentation.json).

**Install it as a desktop app (no download, no admin rights):** in **Edge** open
**⋯ → Apps → Install this site as an app**; in **Chrome** open **⋯ → Cast, save,
and share → Install page as app**. You get a Start-menu/desktop icon that launches
the studio in its own window — ideal for non-technical users. It is still the
hosted site, so there is nothing to update and no security prompts.

## 🛠 Self-host / run locally

The app is **pure static files — no build, no npm.** Serve the folder with any
static web server and open `index.html`:

```bash
npx -y http-server ./ -p 8080      # any OS
# or:  python -m http.server 8080
```

To call the agentView API from your **own** origin, that origin must be allowed
by the API's CORS policy. For local development the bundled dev server does both
— it serves the app **and** proxies `/api`, `/data`, `/send`, `/oauth`,
`/.well-known` and the SSE event stream to `agentview.de` same-origin:

```bash
node server.mjs      # http://localhost:8080 (any OS, Node 20+) · --help for options
```

On **Windows** you can also just **double-click `run-windows.cmd`** — a one-line
shortcut that runs `node server.mjs` (and tells you where to get Node if it's
missing).

---

## 🗺️ Architecture

```
agentview-studio/              ← this repository (standalone, no build, no npm)
├── index.html               admin shell (loads /admin/main.js)
├── display.html             player shell (loads /player/runtime.js)
├── sample/                  offline-only demo data (presentation.json)
├── admin/
│   ├── main.js              bootstrap + three-view shell (Editor / Displays / Verwaltung)
│   ├── store.js             reactive Proxy store + JSON-snapshot undo/redo
│   ├── api.js               agentView REST client
│   ├── sse.js               event stream consumer
│   ├── publish.js           self-contained-player bundler (UNCHANGED in v2)
│   ├── publish-flow.js      Veröffentlichen flow — single / group / multiple
│   ├── shortcuts.js         keyboard binding
│   ├── i18n.js + locales/   English + German
│   ├── importers/           file-type → slide(s) dispatch (PDF, DOCX, XLSX, CSV, ICS, JSON, image-batch, URL paste)
│   ├── ai/                  smart-split (text → slides)
│   ├── canvas/              zoomable canvas + widget-frame (drag · resize · snap)
│   ├── panels/              slide-rail · library · inspector (slide settings + widget form)
│   ├── views/               editor (3-column shell) · displays (dashboard) · admin (9-tab Verwaltung console)
│   └── ui/                  command palette · modal · toast · drag-drop · inspector (schema→form) · asset library · schedule-editor · data-slot inspector · public-API browser
├── player/
│   ├── runtime.js           polls slot · day-parting · renders slide.widgets[] · plays builds · 6h reload
│   ├── transitions.js       9 slide transitions (fade · zoom · push · wipe · flip …)
│   └── debug-hud.js         ?debug=1 → state HUD
├── shared/                  imported by BOTH admin + player — single source of truth
│   ├── plugin-contract.js   { type, label, group, icon, defaults, schema, render } + helpers
│   ├── slide-schema.js      schema v2: Playlist / Slide / Widget + v1→v2 migration
│   ├── animations.js        transition · build · loop catalogs + apply helpers (admin + player)
│   ├── designs.js           the 6 designs, as widget generators
│   ├── scheduler-core.js    isSlideVisible(slide, now)
│   └── plugins/             ONE file per widget type (33) + registry + all.js barrel
├── styles/
│   ├── tokens.css           design tokens (admin)
│   ├── components.css       shared UI components
│   ├── studio.css           the v2 shell · 3-column editor · canvas · dashboard
│   └── slide-themes.css     player/widget themes
├── server.mjs              local dev server + CORS/SSE proxy (Node, optional)
└── docs/
    └── datenquellen.md      external data sources + operator (Impressum/GDPR) duties
```

### Why this shape?

* **Free-canvas widget model.** A slide is a container; every element is a
  positioned widget with a percent rect (`slide.widgets[]`). Designs are just
  generators that stamp widgets — so the player has **one** render path
  (`render widgets[]`) and there is no separate layout engine.
* **Plugins over a megaswitch.** Each of the 33 widget types is a tiny plugin
  with a declarative schema (the inspector auto-builds the form) and one
  `render()`/`dispose()`. Adding a 34th means a single new file in
  `shared/plugins/`.
* **Same render in editor and screen.** A `widgetAsSlide()` adapter feeds each
  widget to its plugin, so editor previews and the live player share the exact
  same code — no drift.
* **Publish-bundler instead of a build step.** Locally the player is clean ES
  modules. At publish time `admin/publish.js` walks the import graph and emits
  one self-contained HTML string — agentView's CDN host receives a file that
  needs nothing else.
* **Memory-safe player.** Every plugin returns a `dispose()`; the player calls
  it before each transition, and a scheduled 6 h hard reload keeps long-running
  screens honest.

---

## 🧰 What you can do

### Build a slideshow on the canvas

1. Add a slide in the left **rail**.
2. From the **Library** (right column) pick a widget, or apply a **Design** to
   stamp a starting arrangement.
3. Drag and resize widgets on the **canvas** — snap guides align them. Scroll to
   pan, ⌘/Ctrl+scroll to zoom, **Einpassen** to fit.
4. Select a widget to open its **Inspector** (auto-generated form); the preview
   updates as you type.

### Import an existing file

Drop a file anywhere on the window. Studio detects the type and creates the
right slide(s):

| Dropped | Becomes |
|---|---|
| `.pdf`               | PDF widget cycling pages |
| `.docx`              | Markdown slides — one per heading |
| `.xlsx` / `.xls`     | Chart widget per sheet (or table fallback) |
| `.csv` / `.tsv`      | Chart widget |
| `.ics`               | Calendar widget with the next 20 events |
| `.json`              | Chart if it looks like data; Live-JSON viewer otherwise |
| Multiple images      | Single Ken-Burns gallery widget |
| Single image / video | Standalone slide |
| A URL (paste)        | YouTube → video · RSS-XML → feed · .pdf URL → PDF · OG-image → image · else → iframe |

### Designs

Apply a design from the Library (or the ⌘K palette) — `Vollbild`,
`Split 50/50`, `Split 70/30`, `Haupt + Ticker`, `2×2 Raster`, `Kopf + Haupt`.
It re-flows your existing widgets into the design's slots and fills the rest
with placeholders. Afterwards everything is an ordinary widget you can move and
resize freely — there are no locked zones.

### Day-parting

Open a slide's **Schedule**. Set days of week (Mon–Sun), one or more time
windows (`09:00–17:00`), and an optional date range
(`2026-12-01 → 2026-12-26`). The player evaluates visibility every minute and
silently skips slides outside their window.

### Deploy (Veröffentlichen)

Switch to the **Displays** view, or hit the topbar **Veröffentlichen** button
(or press `P`). Screens are shown as cards grouped by **Group** (your native
agentView categories), each card showing online state and the slideshow it's
currently running. Pick a target mode:

* **Display** — push to one screen.
* **Group** — one *broadcast-by-category* call deploys to every screen in the
  Group.
* **Mehrere** — tick a hand-picked set of screens.

Either path uploads your playlist JSON to a data slot, bundles the player into
one self-contained HTML string, and ships it. Screens refresh within seconds.

### Watch what a screen sees

On a display card, click the 👁 icon → a new tab opens with agentView's official
preview-link URL. Edit in the studio; the preview updates as the slot updates.

### Discover free data feeds

The overflow menu (⋯) and ⌘K palette open **Public APIs** — agentView's curated
list of free, no-auth, CORS-OK APIs. One click adds a Live-JSON widget pointing
at the endpoint.

### Administer the organization (Verwaltung)

The third view — beside **Editor** and **Displays** — is a 9-tab owner console
for everything *around* the screens, so you don't need a separate portal:

| Tab | What it does |
|---|---|
| **Approvals** | Review pending content submissions per display — accept, reject, or roll back. |
| **Audit log** | Filter the org activity audit by display, actor, action, and date range; cursor-paginated. |
| **Webhooks** | Register HMAC-SHA256-signed event subscriptions (`display.*`, `data.*`) pointing at **your own** URL. agentView delivers the callbacks; Studio only creates/tests/pauses/deletes the subscriptions — it never receives them itself. |
| **API keys** | Create scoped keys (`admin` / `content_only`), revoke, hide revoked. |
| **Members** | Invite members, change roles, remove — owners can't eject themselves. |
| **Licenses** | Pool / allocated / used overview, add slots (delta), per-display assign/unassign, plan comparison. |
| **Connectivity** | Org default URL policy: `full-access` · `whitelist-only` · `isolated`. |
| **Brand-Kit** | Org-wide colors + font, stored in a sidecar data slot. |
| **Versions** | Per-playlist publish history with one-click restore. |

Because every tab is just a thin client over agentView's `/owner/*` and
`/agent/*` REST surface (same pattern as the editor and displays views), the
console needs **no backend of its own** — consistent with the single-file,
no-install model.

---

## 🔌 agentView API usage

| Endpoint | Used for |
|---|---|
| `POST /api/v1/agent/session/request` + `GET .../status` | Session login |
| `GET  /api/v1/agent/me`                                 | Profile + plan |
| `GET  /api/v1/agent/license-info`                       | Plan badge |
| `GET  /api/v1/agent/displays`                           | Displays list (also via SSE delta) |
| `GET  /api/v1/owner/display-categories`                 | Groups (categories) on the dashboard |
| `POST /api/v1/agent/displays/pair-by-code`              | Pair a TV/tablet |
| `POST /api/v1/agent/displays/{id}/content`              | Push the bundled player to one display |
| `POST /api/v1/owner/displays/broadcast-by-category`     | Deploy to every display in a Group |
| `POST /api/v1/agent/displays/{id}/preview-link`         | Live preview tab |
| `POST /api/v1/agent/displays/{id}/configure`            | Permissions (cam/mic/geo) |
| `POST /api/v1/agent/displays/{id}/lock` / `unlock`      | Lock/unlock |
| `PATCH .../privacy-mode`                                | Toggle Private/Public share-TTL |
| `POST /api/v1/assets` + quota                           | Upload images/PDFs/videos |
| `PUT  /api/v1/data/{slug}` + `GET`                      | Playlist data slot |
| `GET  /api/v1/agent/public-apis`                        | Public-API browser |
| `GET  /api/v1/agent/events` (SSE)                       | Live display status |
| `GET/POST/DELETE /api/v1/owner/webhooks` (+ `/{id}/active`, `/{id}/test`) | Verwaltung → Webhooks (HMAC-signed event subscriptions) |
| `GET  /api/v1/owner/activity-audit`                     | Verwaltung → Audit log (filtered, cursor-paginated) |
| `PUT/GET .../owner/displays/{id}/approval-mode`·`approval-state` + `pending/accept`·`reject` + `rollback` | Verwaltung → Approvals |
| `GET/POST/DELETE /api/v1/agent/api-keys`                | Verwaltung → API keys |
| `GET/POST /api/v1/agent/organizations` (list/create) + `GET …/{id}` + `invite` (→ link) + `members/{u}/role` + `DELETE members/{u}` | Verwaltung → Members |
| `POST .../organizations/{id}/slots` + `displays/{id}/(un)assign-license` + `GET /api/v1/pricing` | Verwaltung → Licenses |
| `POST /api/v1/agent/organizations/{id}/connectivity`    | Verwaltung → Connectivity policy |
| `PUT  /api/v1/data/{slug}` (sidecar slots)              | Verwaltung → Brand-Kit + version history |

---

## ⌨️ Keyboard shortcuts

| Combo | Action |
|---|---|
| `Ctrl/⌘ + K` or `/` | Open command palette (run any action) |
| `Ctrl/⌘ + Z`        | Undo |
| `Ctrl/⌘ + Shift + Z`| Redo |
| `J` / `K`           | Navigate slides |
| `D`                 | Duplicate selected widget |
| `Delete`            | Remove selected widget |
| `P`                 | Veröffentlichen (publish) |
| `Esc`               | Close modal / palette |

---

## 📦 Bundled libraries (self-hosted / vendored — no CDN)

| Library | Purpose | Loaded |
|---|---|---|
| marked.js     | Markdown → HTML        | eagerly |
| pdf.js        | PDF rendering          | eagerly |
| Prism         | Code syntax highlight  | eagerly |
| Leaflet       | Map widget             | lazy (when used) |
| SheetJS       | XLSX import            | lazy |
| Mammoth       | DOCX import            | lazy |
| JSZip         | PPTX/Office unzip (importer) | lazy |
| hls.js        | HLS livestream         | lazy |

No npm install required. Serve it from any static server (or `node server.mjs`)
and you're shipping.

> All of these are **vendored under [`shared/vendor/`](shared/vendor/) and served
> locally — no third-party CDN is contacted at runtime**, so display/viewer IP
> addresses stay out of CDN logs (DSGVO/GDPR). Versions, license texts and the
> full attribution list live in
> [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) and
> [`shared/vendor/LICENSES/`](shared/vendor/LICENSES/).

---

## 🌐 Datenquellen & Nutzungsbedingungen (privat vs. geschäftlich)

Several widgets read **live data straight from external services in the
browser**. These are **not** part of agentView and have their **own** terms; the
defaults target **light, private** use. The central reference (with a German
table, attribution, and what a business user must do) is
[`docs/datenquellen.md`](docs/datenquellen.md).

| Dienst / Service | Widget | Standard: privat / geschäftlich | Attribution |
|---|---|---|---|
| **Open-Meteo** | Weather | Privat ✓ · geschäftlich: Anbieter-Bedingungen / eigener Zugang | „Wetterdaten von Open-Meteo.com" (CC-BY 4.0) |
| **OpenStreetMap-Kacheln** | Map (`osm`) | Privat ✓ · geschäftlich: **eigener Tile-Anbieter** | „© OpenStreetMap contributors" — Pflicht |
| **CARTO Basemaps** | Map (`carto-*`) | Privat ✓ · geschäftlich: CARTO-Bedingungen | „© OpenStreetMap contributors © CARTO" — Pflicht |
| **Nominatim** (OSM) | Map geocoding | Privat ✓ (≤1 req/s) · geschäftlich: **eigene Instanz / komm. Geocoder** | „© OpenStreetMap contributors" — Pflicht |
| **ExchangeRate-API** (`open.er-api.com`) | Currency | Privat ✓ · geschäftlich: **eigener API-Schlüssel** | Link auf exchangerate-api.com — Pflicht |
| **QR-Codes** (lokal erzeugt) | QR Code | Privat ✓ · geschäftlich ✓ — kein externer Dienst | — |
| **RSS-/Atom-Feeds** | RSS / News | Inhalte gehören dem Verlag · Feed-Bedingungen prüfen | je Verlag |
| **Schriftarten** (selbst gehostet, `fonts/`) | UI + Themes | Privat ✓ · geschäftlich ✓ — keine externen Anfragen (SIL OFL 1.1) | — |

**Kurz:** Wetter-, Karten- und Geocoding-Standards sind für den **privaten**
Gebrauch. Für den **geschäftlichen** Einsatz brauchst du in der Regel einen
**eigenen Anbieter / API-Schlüssel / eine eigene Instanz** und musst die
**vorgeschriebene Quellenangabe** anzeigen — Details in
[`docs/datenquellen.md`](docs/datenquellen.md).

### Running a public instance? (Impressum / Datenschutz)

If you deploy this app on a **public domain**, you are its **operator** — under
German law that means providing your **own Impressum (§ 5 DDG)** and a **privacy
policy (Art. 13 GDPR)** that reflects the third-party data flows above
(weather/map/currency/RSS IP transfers, plus the API token kept in
`localStorage`). These are an **operator** obligation, **not** part of the code:
the repo ships **no** legal pages and no hard-wired legal link. The optional
menu links in [`admin/legal-links.js`](admin/legal-links.js) are **host-gated** —
they render only on a deployment domain you register there, never on a fork. See
[`docs/datenquellen.md`](docs/datenquellen.md) → *Betreiberpflichten*.

---

## 🛠 Roadmap (post-v2)

* PowerPoint (.pptx) importer
* Headless HEIC conversion
* Lottie widget type

> Shipped since this list was first written: the **Brand-Kit editor** and the
> **Audit-log viewer** now live in the Verwaltung console (see above).

---

## License

MIT — see [`LICENSE`](LICENSE) in the repo root. Third-party components keep
their own licenses; see [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

### Trademarks

The MIT license covers the **source code only**.

"agentView", the agentView logo, and related marks are brand assets of Rafael
Kocurek, the operator of the agentView platform (agentview.de). They are **not**
licensed under MIT — the MIT grant covers the code, not the branding.

You may use, modify and redistribute the code under the MIT terms, but this does
**not** grant any right to use the "agentView" name or logo — for example to
imply endorsement, or to present a fork or derivative as the official "agentView"
product or service. **If you fork or redistribute, use your own branding.**
