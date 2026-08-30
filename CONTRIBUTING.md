# Contributing

Thanks for improving **agentView Studio**. This is a dependency-free,
no-build app: plain vanilla JS over native ES modules. The **shipped code**
has **no bundler, no transpiler, no runtime dependencies** — what you see in
the repo is what runs in the browser. (A small, optional **dev-only** toolchain
for linting and automated browser tests lives in `devDependencies` — see
[Dev tooling](#dev-tooling-optional-dev-only).) Keep contributions small,
readable, and self-contained.

## Project shape (the 30-second version)

- `index.html` → admin console (`admin/`).
- `display.html` → player (`player/`).
- `shared/` → widget **Plugins** and helpers imported by **both** sides.
- `styles/`, `docs/`, `test/`, `tools/`, `server.mjs` → styling, docs, tests,
  the import-graph checker, and the local dev/proxy server.

See the [README](README.md) for the full architecture walkthrough and the
project's vocabulary (Verwaltung, Tab, Widget, Plugin …).

## Running it

No install step. Serve the folder with any static server and open it:

```bash
npx -y http-server ./ -p 8080   # any OS; without a proxy you need the API to allow your origin's CORS
```

Or use the bundled dev server, which also proxies the agentView API
(`/api`, `/data`, `/send`, `/oauth`, `/.well-known`) — including its SSE event
stream — to `agentview.de` same-origin (any OS, Node 20+):

```bash
node server.mjs    # picks a free port, opens the browser; --help for options
```

The player also runs fully offline — open
`display.html?slot=./sample/presentation.json` directly.

## Tests

The **app** needs no npm. There are two ways to run the suites:

- **Headless (fast, no install):** the DOM-free, pure-function suites run
  directly under Node:

  ```bash
  node test/run-node.mjs
  ```

  Exit code `0` = pass, `1` = fail.

- **Full (source of truth):** the browser suites. `npm run test:browser`
  drives **all four pages** headlessly; opening one in a browser runs just that
  page, which is the fast way to work on it:

  | Page | What it holds |
  |---|---|
  | [`test/index.html`](test/index.html) | every suite the Node runner has, plus the DOM-only ones it skips (HTML escaping/sanitising, the plugin/schema round-trips) |
  | [`test/canvas-zorder.test.html`](test/canvas-zorder.test.html) | canvas z-order and hit-testing — needs the real editor stylesheet |
  | [`test/publish-e2e.test.html`](test/publish-e2e.test.html) | builds the real publish bundle and boots it in an iframe |
  | [`test/plugin-resilience.test.html`](test/plugin-resilience.test.html) | all 38 plugins against hostile input, and every widget's inspector form built and torn down |

  The last two are on their own pages because they are slow and because they
  produce console output of their own (a missing vendor library, demo assets
  that 404 under `/test/`) — `run-browser.mjs` declares per page which output is
  expected, so the console stays a signal everywhere else.

When you add a pure-function suite, register it in **both** the `suites` list in
[`test/run-node.mjs`](test/run-node.mjs) and the one in
[`test/index.html`](test/index.html). DOM-bound suites go in the browser
harnesses only.

**Regression tests earn their name the hard way:** run the new test once against
the *reverted* fix and watch it fail. Three tests in this repo were green in
both states before that check caught them — a sweep that never mounted what it
was measuring, one that waited past the window it was testing, and one that put
its payload in a field the code does not read.

You can also sanity-check the module graph (orphans / broken imports) without
running anything:

```bash
node tools/import-graph.mjs .
```

### Looking at the template catalog

Three dev pages render the slide-set templates for real — open them from the dev
server (`node server.mjs`), they are not part of the app:

| Page | What it answers |
|---|---|
| `/tools/template-sheet.html` | *Does the catalog look right?* Every slide of every template as a contact sheet. `?t=<id>` for one set, `?skip=&take=` to page, `?lang=de`, `?w=` for cell width. |
| `/tools/template-audit.html` | *Is anything clipped or too small?* Renders each slide at 1920×1080 and reports the biggest type as a share of slide height, plus overflow. `?lang=de`. |
| `/tools/template-calibrate.html` | *What size SHOULD this be?* Binary-searches the largest `textScale` that still fits each widget's box — in **both** languages — capped at a per-widget-type target, and prints the patch table. |
| `/tools/widget-audit.html` | *Is the WIDGET itself sound?* Mounts every registered widget with its own `defaults()` at three box sizes and reports three things: whether its type actually grows with the box (a `cq` coefficient that never clears its `clamp` floor renders the same pixel size everywhere), whether it overflows, and the worst contrast ratio on any ground it paints itself. `?theme=` to check another theme. |

Signage type is not a matter of taste you can settle by squinting at a 40 % zoom:
the catalog was once tuned by eye and most of it landed near 3 % of the slide
height, which is a laptop size. `test/template-legibility.test.html` is the gate
that keeps it honest. It runs two suites, both on real renders:

- **templates** — fails if any slide clips in either language, if a ticker sets
  type taller than its own strip, or if a slide's largest type drops below 4 %
  of the slide height.
- **widgets** — fails if any widget overflows a quarter tile or a half slide on
  its own `defaults()`, or if text on a ground the widget paints itself falls
  below WCAG AA. A widget you have just dragged onto a slide, before typing a
  character, must not already be broken.

## Dev tooling (optional, dev-only)

The shipped app stays dependency-free — but the repo carries a small **dev**
toolchain (ESLint + a headless-browser test driver) in `devDependencies`. These
never reach shipped code; they only guard contributions. CI runs all of them.

```bash
npm ci                                       # install the dev toolchain
npm run lint                                 # ESLint flat config (eslint.config.js)
npm test                                     # == node test/run-node.mjs
npx playwright install --with-deps chromium  # one-time, for the browser runner
npm run test:browser                         # drives every browser page headlessly in CI
npm run i18n                                 # every t() key present in both dictionaries
npm run check                                # lint + i18n + headless tests in one shot
```

The ESLint config is deliberately low-noise: it catches a real bug class (dead
imports, unused vars, `==` traps, unreachable code) but does **not** enforce
formatting — match the surrounding style by hand (see below). Vendored libraries
under `shared/vendor/` are never linted.

## Code style

- **Vanilla ES modules only.** No new runtime dependencies, no build tooling.
  Heavy libraries (pdf.js, Leaflet, SheetJS, Mammoth, hls.js, JSZip) are
  **self-hosted (vendored) under `shared/vendor/`** and loaded from there
  (eagerly, or lazily at the point of use). **Do not add CDN-loaded
  dependencies:** a third-party CDN call leaks viewer/display IP addresses and
  breaks the project's DSGVO/GDPR posture. Vendor any new library locally, keep
  its license with it — a file under `shared/vendor/LICENSES/`, or the original
  header retained in a single-file lib (as `qrcode.js` does) — and record it in
  [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
- **Escape everything untrusted.** Reuse the existing helpers — do not reinvent:
  - `escapeHtml` / `escapeAttr` from `shared/utils/escape.js`
  - `sanitizeHtml` from `shared/sanitize-html.js` for rich text
  - `isSafeImgUrl` / `cssUrl` from `shared/safe-url.js` for URLs
- **Match the surrounding style.** Same indentation, comment density, and naming
  as the file you are editing. Comments explain *why*, not *what*.
- **Mind the vocabulary.** The admin console is branded **Verwaltung** and keeps
  that name in every locale (see `cg.adminTitle` in
  [`admin/locales/en.js`](admin/locales/en.js)). Everything else is fully
  localised — e.g. *Veröffentlichen → Publish*, *Folie → Slide*, *Einpassen →
  Fit*, *Vollbild → Fullscreen* — so a stray German string left untranslated in
  the English locale is a localisation bug.

## Adding a widget Plugin

Every widget type is one small ES-module file in `shared/plugins/`. The **same**
Plugin renders both the editor preview and the live screen — there is no second
code path.

1. Create `shared/plugins/<your-type>.js`. The smallest useful template:

   ```js
   import { register } from './registry.js';
   import { composeDispose } from '../plugin-contract.js';
   import { escapeHtml } from '../utils/escape.js';

   export default register({
     type: 'my-widget',          // unique id
     label: 'My Widget',
     group: 'basic',             // tab grouping in the Library
     icon: '✨',
     schemaVersion: 1,
     defaults: () => ({ text: 'Hello' }),
     schema: () => ({
       fields: [
         { key: 'text', type: 'text', label: 'Text' },
       ],
     }),
     render(slide, container) {
       const c = slide.content ?? {};
       const root = document.createElement('div');
       root.className = 'bb-slide bb-slide-my-widget';
       root.innerHTML = `<div>${escapeHtml(c.text ?? '')}</div>`;
       container.appendChild(root);
       return composeDispose(() => root.remove());  // free timers/listeners here
     },
   });
   ```

2. Register it by adding one import line to the barrel
   [`shared/plugins/all.js`](shared/plugins/all.js). Its position there drives
   the tab order in the Library.
3. The inspector auto-builds the edit form from your `schema()` — no UI code
   needed. Use the existing field-control types (`text`, `rich-text`, `select`,
   `asset`, `theme`, …) and look at a neighbouring plugin for examples.
4. `render()` **must** return a `dispose()` (via `composeDispose`) that tears
   down anything it created — intervals, `requestAnimationFrame`, event
   listeners, fetch aborts. The player calls it before every transition; a leak
   here breaks long-running screens.
5. If the widget reads an external API, route it through
   `shared/live-source.js` (in-flight dedupe + caching) so rapid editor
   re-renders don't flood the provider, and add the service to
   [`docs/datenquellen.md`](docs/datenquellen.md).

Add or extend a test under `test/` for any non-trivial pure logic
(payload building, parsing, migration), and update the widget list in the
[README](README.md) when you add a widget type.

## Pull requests

- One focused change per PR. Small PRs get reviewed.
- Keep `git status` clean — no build artefacts, no local state
  (`.chrome-profile/`, `.claude/`, etc. are git-ignored; do not work around it).
- **No secrets, ever.** No API keys, tokens, cookies, `.env` files, or real
  account data — not in code, not in screenshots.
- Before pushing: run `npm run lint` and `node test/run-node.mjs`, and check the
  browser suites (open `test/index.html`, or run `npm run test:browser`). All
  three are CI gates.
- Describe what you changed and why in the PR body.
- **Sign off every commit (DCO).** By contributing you certify the Developer
  Certificate of Origin below and agree your work is licensed under the repo's
  [MIT license](LICENSE). Add the sign-off automatically with `git commit -s`,
  which appends a `Signed-off-by: Your Name <you@example.com>` line.

## Developer Certificate of Origin (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/)
instead of a CLA. It is a lightweight, per-commit attestation that you have the
right to submit your contribution under the project's MIT license. By adding a
`Signed-off-by` line (`git commit -s`) you certify the following:

```
Developer Certificate of Origin
Version 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

If you contribute as part of your employment, make sure you are authorised to do
so — in Germany the economic rights to software written by employees in the
course of their duties rest with the employer (§ 69b UrhG), so contribute under
the right account/identity.

## Security

Never open a public issue for a security problem — follow
[`SECURITY.md`](SECURITY.md).
