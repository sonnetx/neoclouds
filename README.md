# The Neocloud Guide

A field guide to the companies that rent GPUs and other AI accelerators, with a supply network of who sells compute to whom, a timeline, H100 rental prices and sourced profiles of 97 providers. [Live site](https://sonnetx.github.io/neoclouds/).

Every profile sentence and key figure links to the source that supports it. Profiles reflect public information through October 2026.

## Development

The page is static. GitHub Pages serves the repository root, so `index.html`, `guide.js`, `guide.css` and the data files are deployed as committed.

```sh
python3 -m http.server 8000         # preview at http://localhost:8000/
python3 tests/check_build.py        # providers.js is current and the research passes lint
python3 tests/browser.py            # interaction checks in Chromium (needs Playwright)
```

Provider profiles are generated. Edit the research or the overrides, then rebuild.

```sh
python3 scripts/build_providers.py --write   # research/ + overrides/ -> providers.js
python3 scripts/fetch_sources.py             # cache the text of every cited page in srccache/
python3 scripts/match_sources.py             # match each sentence to its sources -> citations.js
```

`match_sources.py` reads `srccache/`, which holds full copies of fetched articles and filings and so stays out of git. Run `fetch_sources.py` first on a fresh clone. Pages that block automated fetching are pinned by hand in `overrides/forced_cites.json`.

| Path | Holds |
|---|---|
| `index.html`, `guide.js`, `guide.css` | The page: network, directory, timeline, prices, guide text and profiles |
| `providers.js` | Generated provider profiles. Never edit by hand |
| `citations.js` | Generated sentence-to-source matches for each profile |
| `background.js` | Timeline events, scale table, section sources and network settings, including buyer websites |
| `logos/`, `logos.js` | One 128px icon per company and the list of available icons |
| `research/` | Researched profiles as JSON, one file per batch, and `SPEC.md`, the brief and style rules researchers follow |
| `overrides/` | Corrections layered on the research: patches, removals, added sources and pinned citations |
| `scripts/` | Build, source fetching, citation matching and logo fetching |

## Corrections

Send corrections to [sonnet@stanford.edu](mailto:sonnet@stanford.edu) or open a pull request. Include a supporting source and the claim that needs updating.

## License

MIT. See [LICENSE](LICENSE). Company names, logos and quoted figures belong to their owners and sources.
