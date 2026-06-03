# Self-hosted fonts

These `*.woff2` files are bundled so agentView Studio loads **no Google Fonts
CDN** (DSGVO/GDPR: no third-party request, no IP leak to Google). They back the
`--bb-font` / `--bb-display` / `--bb-mono` / `--bb-serif` tokens in
`styles/tokens.css` via the `@font-face` rules in `styles/fonts.css`. Every one
of those token stacks also lists a system-font fallback, so the UI stays legible
even if a file here is missing.

## What's here

One `woff2` per **used** weight, latin subset:

| Family            | File pattern               | Weights           |
|-------------------|----------------------------|-------------------|
| Inter             | `inter-<wght>.woff2`            | 400 500 600 700 800 |
| Inter Tight       | `inter-tight-<wght>.woff2`      | 400 500 600 700 800 900 |
| JetBrains Mono    | `jetbrains-mono-<wght>.woff2`   | 400 500 600 |
| Playfair Display  | `playfair-display-<wght>.woff2` | 400 600 800 |

Weight sets mirror the families/weights the old Google Fonts `<link>` requested
in `index.html` (Inter, JetBrains Mono) and `display.html` (all four).

## Re-fetching / updating

Run the bundled script from this directory:

```bash
bash _fetch.sh
```

It pulls each woff2 from `fonts.gstatic.com` (the same files Google Fonts
serves, licensed OFL). The exact per-weight URLs come from the Google Webfonts
Helper API, e.g.:

```bash
# discover the current woff2 URL for a family/subset:
curl -sL "https://gwfh.mranftl.com/api/fonts/inter?subsets=latin"
curl -sL "https://gwfh.mranftl.com/api/fonts/inter-tight?subsets=latin"
curl -sL "https://gwfh.mranftl.com/api/fonts/jetbrains-mono?subsets=latin"
curl -sL "https://gwfh.mranftl.com/api/fonts/playfair-display?subsets=latin"
```

Pick the `normal`-style entry for each weight and download its `woff2` to the
matching `*-<wght>.woff2` filename above. If you add a weight, add a matching
`@font-face` block in `styles/fonts.css`.

## Licensing

All four families are licensed under the **SIL Open Font License 1.1** — full
text in [`OFL.txt`](./OFL.txt). Copyright holders:

- **Inter** / **Inter Tight** — © The Inter Project Authors (https://github.com/rsms/inter)
- **JetBrains Mono** — © 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)
- **Playfair Display** — © 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display)
