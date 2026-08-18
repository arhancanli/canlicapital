# canlicapital.com

The public site for **Canli Capital**, and the surface where **ALPHAC** — a four-sleeve
cross-asset quant book — publishes its record while it is still small enough to be embarrassing.

**Created and maintained by [Arhan Canli](https://github.com/arhancanli) for Canli Capital.**
Development uses reviewed AI-assisted tooling, while project ownership, research decisions,
published claims, and release responsibility remain with Arhan Canli.

The engine that produces every number here is open too:
**[github.com/arhancanli/alphac](https://github.com/arhancanli/alphac)**.

Live: **[canlicapital.com](https://canlicapital.com)**

## Why this repo is public

The site's whole claim is *"a quant fund proving itself in public before it asks you to trust
it."* — the tagline in `config/brand.js`. A site that makes that claim and hides its own source
is asking for a trust it hasn't earned. So: this is the source, including the parts that enforce
honesty on us.

The load-bearing one is **`docs/retracted_claims.txt` in the engine repo**. When a number is
withdrawn it goes on a blocklist, and `check_retracted_claims.py` scans `dist/` and `public/` for
it before each deploy. It cannot be satisfied by deleting the number — a retracted figure must
still be quotable *inside its own retraction*, so a match counts only when the explanation is
absent from the surrounding window.

That check exists because the retraction here had already failed twice: a withdrawn DSR of 0.83
stayed on the homepage and in the social-unfurl card for six days after the signed chain formally
withdrew it. The pipeline was publishing the correction and the error in the same run.

**Stated precisely, because this repo is the wrong place to flatter ourselves: the gate currently
`WARN`s, it does not block.** `scripts/live_tick.sh` runs it with `|| echo "WARN: ..."` so a
republished retraction is loud in the cron log but still ships. It was written non-fatal so a
cosmetic web check could never halt trading — the right instinct, wrong blast radius, since the
deploy is the thing it should stop. Tightening it to fail the deploy while staying non-fatal to
trading is open work.

## The six pages

| page | what it is |
|---|---|
| `index.html` | the landing: thesis, systems teaser, live record |
| `systems.html` | how the four sleeves work |
| `research.html` | the research programme, literature reviews, feasibility protocols |
| `performance.html` | the methodology and the honest numbers |
| `progress.html` | the build log |
| `open.html` | proven in the open: the kill log, the signed chain, glass-box artifacts |

`public/paper-state.json` and `public/glassbox/*` are written by the engine's publish job, not by
hand. They are the machine-readable form of every claim the pages make.

## Build and run

```sh
npm install
npm run build      # Vite multi-page build -> dist/
npm run preview    # serve the built dist
npm run dev        # dev server with hot reload
```

Three.js, GSAP + ScrollTrigger and Lenis are self-hosted — they install from npm and Vite
fingerprints them into `dist`. **Nothing is fetched from a CDN at runtime.** The build must stay
green, and source plus `dist` must contain zero em dashes (U+2014); both are audited before deploy.

## Brand and facts are single-sourced

`config/brand.js` is the one place names and numbers live. `js/shell.js` renders the nav and footer
from it so every page ships byte-identical chrome, and `js/main.js` binds `data-brand`,
`data-flagship`, `data-tagline` and `data-fact` nodes from it.

**`STATS` and `FACTS` are the only numeric claims permitted on the page,** and each was confirmed
against the engine. Do not add one without verifying it against a run.

## Not investment advice

Nothing on this site or in this repo is investment advice, an offer, or a solicitation. The record
published here is **paper trading** — no real capital has been deployed. Simulated and past
performance do not indicate future results. See `LICENSE`: provided "as is", without warranty.
