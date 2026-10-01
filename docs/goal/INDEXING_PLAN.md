# Indexing plan toward 10M (merged 2026-09-26)

Source: workflow wf_2fc609a6-cd1 (5 investigators + quality-first and scale-first planners; the
judge failed on the account's weekly usage limit, so this merge was done by hand from the two plans).
Full findings: ~/.claude/projects/-Users-arhancanli/23a151e2-78b0-4b29-a06d-3b79c64689a7/subagents/workflows/wf_2fc609a6-cd1/journal.jsonl

## What limits indexing (measured)

- Google indexes ~95% of what it crawls (3,027 indexed vs 166 crawled-not-indexed) but crawls ~546
  URLs/day; 74,452 URLs wait as "discovered, not indexed". One pass over 916,471 URLs ≈ 4.6+ years.
- Crawl DEMAND (popularity) is the binding limit: no independent followed backlink found; absent from
  three 2026 Common Crawl indexes; Tranco unranked; all inbound links nofollow/ugc or owner-run.
- Crawl waste: 53% of filing pages link to history pages that 404 or are noindex (~1 broken link per
  filing page, ~370k instances est.); ~16k withheld pages linked internally; noindex JSON downloads
  crawlable; /api extensionless paths lack X-Robots-Tag.
- Structure: 90.6% of company URLs sit 5–6 clicks deep; filing pages (the family ranking at
  positions 1–2) get 1 inbound link each; concept pages cite filings via sec.gov, not our pages;
  no main-site page links any company; no cross-company links.
- Quality: concept histories (54% of URLs) thin/near-duplicate (same-company 5-gram Jaccard 0.72);
  38% of company titles have a stray ",:"; no tickers in titles.
- Sitemaps: index has no <lastmod>; chunked by count not family (no per-family GSC reporting);
  263k filing-page lastmods predate the filing family.
- Speed: cold company pages ~120–180 ms server (storage-bound); every deploy purges the edge cache
  (confirmed 2026-09-26); long-tail pages get evicted anyway. Capacity vs demand verdict pending
  GSC Host status.
- Supply toward 10M: clean source-backed on-topic families total ~6.5M (upper bound incl. today's
  916k). Past that only thin units (Form 4 per-filing 5.0M, metadata-only accessions 18.8M) that
  duplicate sec.gov and should never be indexable.

## Realistic trajectory (estimates)

Straight line at ~230 new indexed/day: ~25k by 2026-12-31, ~85–110k by 2027-09. With phases 0–4
done AND crawl demand up 2–3x (needs independent links/clicks): ~30–80k by 2026-12-31,
80–250k by 2027-03, 150–500k by 2027-09. 10M indexed is not reachable in 12 months under any
defensible plan; the goal is recorded as a long-range ceiling behind measured gates.

## Merged phases

**Phase 0 – instrument (week of 09-27).** Split company sitemaps by family with stable names
(directory, overviews, histories-N, filing-indexes, filings-N); <lastmod> on every sitemap-index
entry; honest filing-family dates; per-family indexed-share sampler via the URL Inspection API
(needs a service account on the GSC property); baseline in INDEXING_BASELINE.md; 10M recorded in
config/search-growth-goal.json as a stretch stage. DONE 09-26: sitemap resubmitted, Datasets
validation started, 317 invalid items fixed (#281).

**Phase 1 – stop crawl waste, fix what searchers see.** Filing pages link a concept only when
activation.isAdmitted(cik, tag) (in-memory bitset, no storage read); no links to withheld pages;
meta robots noindex whenever the header says noindex; X-Robots-Tag noindex on /api/*;
robots.txt Disallow /company-data/ (owner OK: robots comment states everything-crawlable);
titles: strip ", Inc." style suffixes cleanly, tickers + fiscal years in titles/h1; og:site_name;
developer block (npm/registry/GitHub) on company pages. Gate: 0 internal 404/noindex links on a
60-filing-page sample; 0 titles with ",:".

**Phase 2 – internal link graph toward value.** Concept tables link accessions to our filing pages
(SEC link secondary); filing prev/next + same-fiscal-year; overviews list latest 5 filings; 72
concept hubs (data tables, not link lists) + form/year hubs; home/developers/research link the
companies that already earn impressions; CI link-graph audit on the production graph. Gate: ≥95%
of company URLs within 4 clicks (today 9.4%); filing pages median ≥3 inbound links (today 1).

**Phase 3 – speed only if capacity-bound** (verdict from Host status / URL Inspection
"hostload exceeded"). Else only: ETag stability across deploys. If capacity-bound: separate Vercel
project for /companies (no hourly purge), one object per company, then US replica + iad1.

**Phase 4 – make concept pages distinct.** Derived content (YoY, CAGR, 5-yr range, share of
assets/revenue, rank in concept hub/peers); cut the 60+ sibling list to 5–8 related measures.
Owner decision later: consolidate historical-only histories if they index far worse than filings.

**Phase 5 – authority (starts now; the biggest lever).** Engineer: canonical, citable pages for
luck-equivalent trials, Null Zoo v0, filing-facts benchmark (numbers generated from configs);
websiteUrl + streamable-http remotes in mcp/server.json and mcp-research/server.json; sameAs.
Owner: Zenodo (DOIs), ORCID, arXiv/SSRN preprint (luck trials + Null Zoo; endorser needed),
dataset licence + Hugging Face/Kaggle, Show HN / r/algotrading / r/quant / Quantocracy under own
name, MCP directories (Smithery, PulseMCP, mcp.so), GitHub profile website. Gate by 2026-12-31:
≥10 independent referring domains; Common Crawl capture; GSC crawl requests/day ≥2× baseline.

**Phase 6 – volume only where demand is proven, one family at a time, own sitemap each.** Entry:
filings family sampled indexed share ≥30% (or known/submitted ≥50%), crawl ≥2× baseline. Order:
hubs (~10k), Family A equal-vector reps (+6,990), filing lists for filers without overviews
(31,583), remaining XBRL filings (≤31,138), distinct annual-period pages (~39k), segment/geo
revenue, then concept-history tranches (+~0.9M), accounting-note pages (~120k+, rights decision),
annual frame rankings (~26k), then Form D / insider-relationship / 13F / fund pages (naming
individuals needs owner decision), then FDIC/BLS/EIA/Treasury (rights receipts; never FRED).
Per-family gate: ≥30% indexed of its sitemap within 60 days before the next ships.

## Owner items

1. Read GSC Crawl stats > Host status (or let me) — decides Phase 3.
2. Service account on the GSC property for the URL Inspection sampler.
3. OK for robots.txt Disallow /company-data/.
4. Authority actions (Phase 5 owner list); dataset licence.
5. www → apex single-hop redirect in Vercel domain settings.
