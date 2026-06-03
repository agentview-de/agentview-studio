# Third-party notices

agentView Studio is released under the [MIT License](LICENSE). It **vendors
(self-hosts) all of its client-side runtime libraries and web fonts** — listed
below — so that **no third-party CDN is contacted at runtime**. This keeps
display/viewer IP addresses out of third-party CDN logs (DSGVO/GDPR). It also
**reads from the runtime data services** listed further down; those are live data
feeds, not bundled code. Their respective licenses and terms apply to those
components, not the MIT license of this project.

Each bundled library's full license text is included under
[`shared/vendor/LICENSES/`](shared/vendor/LICENSES/). This file is provided for
attribution and license-compliance and is maintained by hand — when you add or
remove a dependency or data source, update it here and add/remove the matching
license file.

## Vendored client-side libraries (bundled in the repository)

All of these are served from [`shared/vendor/`](shared/vendor/) — there is **no
CDN request at runtime**. The bytes match what was previously pinned via
Subresource Integrity; each download was verified against its SHA-512 hash.

| Component | License | Version | Location (`shared/vendor/…`) | License text | Project / source |
|---|---|---|---|---|---|
| marked | MIT | 9.1.2 | `marked.min.js` | `LICENSES/marked.LICENSE` | https://github.com/markedjs/marked |
| PDF.js (pdf.js) | Apache-2.0 | 3.11.174 | `pdf.min.js` + `pdf.worker.min.js` | `LICENSES/pdfjs.LICENSE` | https://github.com/mozilla/pdf.js |
| Prism | MIT | 1.29.0 | `prism.min.js` + `prism-tomorrow.min.css` | `LICENSES/prism.LICENSE` | https://github.com/PrismJS/prism |
| Leaflet | BSD-2-Clause | 1.9.4 | `leaflet/` (js, css, `images/`) | `LICENSES/leaflet.LICENSE` | https://github.com/Leaflet/Leaflet |
| hls.js | Apache-2.0 | 1.5.20 | `hls.min.js` | `LICENSES/hlsjs.LICENSE` | https://github.com/video-dev/hls.js |
| Mammoth (mammoth.js) | BSD-2-Clause | 1.6.0 | `mammoth.browser.min.js` | `LICENSES/mammoth.LICENSE` | https://github.com/mwilliamson/mammoth.js |
| JSZip | MIT (dual MIT/GPLv3 — MIT chosen) | 3.10.1 | `jszip.min.js` | `LICENSES/jszip.LICENSE` | https://github.com/Stuk/jszip |
| SheetJS Community (xlsx) | Apache-2.0 | 0.18.5 | `xlsx.full.min.js` | `LICENSES/sheetjs.LICENSE` | https://github.com/SheetJS/sheetjs |
| qrcode-generator (Kazuhiko Arase) | MIT | 1.4.4 (ESM-wrapped) | `qrcode.js` | license header in file | http://www.d-project.com/ |

Notes:
- **marked, PDF.js, Prism** load eagerly in `index.html` / `display.html`.
- **Leaflet, hls.js, Mammoth, JSZip, SheetJS** load lazily the first time a
  widget or importer that needs them is used.
- **PDF.js** reads its worker same-origin from `shared/vendor/pdf.worker.min.js`
  (no CDN fetch / blob workaround needed any more).
- **Leaflet's** marker/layer PNGs live in `shared/vendor/leaflet/images/`; the
  loader points `L.Icon.Default.imagePath` at them so markers render locally.
- **JSZip** is dual-licensed (MIT or GPLv3); this project uses it under the **MIT**
  option. It is loaded by the PowerPoint (`.pptx`) importer path.
- **SheetJS** is pinned at 0.18.5 — the newest build published to npm/jsDelivr
  (the 0.20.x line ships only from SheetJS's own CDN).
- The **Apache-2.0** components (PDF.js, hls.js, SheetJS) ship **no `NOTICE`**
  file in their npm distributions, so Apache-2.0 §4(d) imposes no obligation
  beyond the bundled `LICENSE` texts under `shared/vendor/LICENSES/`.
- The **qrcode-generator** widget generates codes **on-device**, so QR payloads
  (including Wi-Fi passwords and vCard data) never leave the player.

> Note: "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

## Fonts (self-hosted)

The UI and slide themes use the typefaces below. They are **self-hosted** as
`woff2` files under [`fonts/`](fonts/) and declared in
[`styles/fonts.css`](styles/fonts.css) — **no external font host (e.g. Google
Fonts) is contacted**, which keeps display IPs out of third-party logs (GDPR-
friendly). Each font is licensed under the **SIL Open Font License, Version 1.1**
(https://scripts.sil.org/OFL); the license text ships in
[`fonts/OFL.txt`](fonts/OFL.txt).

| Font | License | Source |
|---|---|---|
| Inter | SIL OFL 1.1 | https://github.com/rsms/inter |
| Inter Tight | SIL OFL 1.1 | https://fonts.google.com/specimen/Inter+Tight |
| JetBrains Mono | SIL OFL 1.1 | https://github.com/JetBrains/JetBrainsMono |
| Playfair Display | SIL OFL 1.1 | https://github.com/clauseggers/Playfair-Display |

## Runtime data services

These services are queried directly from the browser by individual widgets. They
are not bundled; their data licenses and usage terms apply. A user-facing German
summary (private vs. business use, attribution, provider terms) lives in
[`docs/datenquellen.md`](docs/datenquellen.md).

| Service | Used by | Data license / terms | Attribution | Source |
|---|---|---|---|---|
| Open-Meteo | Weather widget | Data CC-BY 4.0; free tier non-commercial, see provider terms | "Weather data by Open-Meteo.com" | https://open-meteo.com |
| OpenStreetMap data | Map widget (OSM tiles) | ODbL 1.0 (data) | "© OpenStreetMap contributors" — **required** | https://www.openstreetmap.org/copyright |
| OSM standard tiles | Map widget (`osm` style) | OSMF Tile Usage Policy | as above | https://operations.osmfoundation.org/policies/tiles/ |
| Nominatim (OSM) | Map geocoding (forward/reverse) | ODbL data; Nominatim Usage Policy (≤1 req/s, identify your app) | "© OpenStreetMap contributors" | https://operations.osmfoundation.org/policies/nominatim/ |
| CARTO basemaps | Map widget (`carto-dark` / `carto-light`) | CARTO basemap terms; built on OSM data | "© OpenStreetMap contributors © CARTO" | https://carto.com/legal/ |
| ExchangeRate-API (open endpoint) | Currency widget (`open.er-api.com`) | Free open endpoint; attribution required | Link back to https://www.exchangerate-api.com | https://www.exchangerate-api.com/docs/free |
| Publisher RSS/Atom feeds | RSS / News widgets | Each feed's own terms (publisher-owned) | per publisher | configured per widget |

### Important for commercial / business use

- **OpenStreetMap / Nominatim / CARTO and Open-Meteo defaults are intended for
  light, private use.** Their public endpoints have usage policies (rate limits,
  bulk-use restrictions, non-commercial framing). A business deployment should
  use its own provider, API key, or self-hosted instance and honour the required
  attribution. See [`docs/datenquellen.md`](docs/datenquellen.md).
- **ExchangeRate-API's open endpoint requires attribution** (a visible link back
  to exchangerate-api.com) and is rate-limited; commercial use should obtain a key.
- **RSS feeds are owned by their publishers** — verify each feed's terms before
  using its content on public screens.

> **Note on map tiles (DSGVO):** the Leaflet *library* is now self-hosted, but
> the **map tiles and geocoding** (OSM / CARTO / Nominatim) are still fetched
> live from their providers when a Map widget renders — that is inherent to a
> live map and transmits the viewer's IP to the tile provider. For a fully
> CDN-free / self-hosted deployment, point the Map widget at your own tile server.
