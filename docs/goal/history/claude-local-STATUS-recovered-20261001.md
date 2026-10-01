# Current state

Updated September 27, 2026, 15:30 Dubai (11:30Z). Goal ACTIVE, NOT ACHIEVED. All objectives
and publication authorization remain in REQUIREMENTS.md. Everything in this section was
checked live at the time stated; the September 21 record below is kept as history.

## Verified 2026-09-27

- **Production:** origin/main is 41cbb863 (#311, SDK v2 servers). No canlicapital PRs open. The
  hourly deploy last succeeded at 10:35Z; IndexNow reports 916,476 canonical URLs, none new since
  the last accepted submission. The live sitemap index lists 22 child sitemaps.
- **Google** (Search Console, 2026-09-27 baseline): about 3,030 indexed, 74,452 discovered but not
  indexed. The limit is crawl demand and authority, not page count (see the 2026-09-25 sections
  below). Bing: 146 indexed, 1 backlink.
- **MCP family:** canli-validation-mcp 0.8.0 is on npm and in the MCP Registry, with the hosted
  /mcp endpoint verified. canli-research-mcp is 0.1.0 on npm; 0.2.0 is built and merged (#311),
  but publishing it needs the owner's npm sign-in to set its trusted publisher.
- **Ratings:** Glama A (tool definitions A, maintenance A). Socket for 0.8.0: supply chain 78,
  vulnerability 100, quality 100, maintenance 94, license 100; each dependency alone scores 100,
  so the 78 is the package's own alerts, whose detail needs a Socket org login. OpenSSF Scorecard
  7.2 (canlicapital) and 7.4 (MCP mirror); the ceiling for a new solo repo is about 8 until late
  December.
- **Adoption:** npm weekly downloads of canli-validation-mcp were 991 on 2026-09-27. Stars: 0 on
  canlicapital, canli-validation-mcp, alphac, canli-backtest and canli-pit-lake.
- **Distribution live:**
  - Hugging Face dataset filing-facts-v0;
  - Zenodo DOI;
  - dev.to cross-post (canonical to the site);
  - X thread plus three replies on 10k to 45k-view threads;
  - QuantConnect forum post;
  - Google Scholar profile.
- **Distribution scheduled:** Show HN on Tuesday 29 Sep, 18:57 Dubai (runs from this session's
  cron); Product Hunt on Thursday 1 Oct.
- **Distribution open:** directory PRs on awesome-mcp-servers and awesome-quant.
- **Waiting on the owner:**
  - QuantNet (awaiting admin approval);
  - Smithery sign-in;
  - an email for MCP Market;
  - the $39 decision for mcp.so.
- **Helper sessions** (owner-started, separate from this one): `~/canli-x` runs the X account and
  `~/canli-community` answers people on GitHub, dev.to, QuantConnect, Hugging Face and the launch
  sites. Each follows its own CLAUDE.md and keeps its own LOG.md.
- **Engine:** alphac #117 (publish order, v4 diversification test) and #118 (suspended-sleeve
  naming) are merged; ~/alphaforge is at 8633f95. The v4 book (alphavintage_live, k30_dn_63,
  managed_futures) has been live since 2026-09-25, and crypto_carry_wk is suspended.
  - The last health report (26 Sep 23:32Z, at 30028a0) predates both fixes.
  - The Frankfurt host checks (hosts match, glass-box match) stay red until an SSH preflight is
    possible, and that is blocked from these sessions.
  - Sharpe, sleeve and drawdown goals remain immature.

## Next phase (started 2026-09-27)

canli-fundamentals, server 3 of the MCP family plan in VISION.md: SEC fundamentals point-in-time,
meaning each value as first reported. Compact output, local compute by default and static-first
reads. It is scoped from the existing company reference pipeline, not built in parallel to it.

# State on September 21, 2026 (superseded, kept as history)

Earlier versions of this file are in the repository's git history.
Recorded states are not live telemetry.

## Latest verified transition: v22 clean set live in production

PR169 merged as 28f6e944 and PR170 as f6d37926 (all four CI checks passed on
both; the merged PR170 tree 73da6f09 equals the tested preview tree). The
production checkout (the hourly deploy's design source) moved to f6d37926. The
scheduled hourly deploy published it at 15:33Z: landing deployment
meridian-8c5ag8pvq aliased to production.

Owner release decision (2026-09-21, "clean set"), in `config/company-admission-v22.json`:

- Indexable: 77,359 company URLs, made up of 3,308 overviews, 73,984 histories
  without a selected-quality flag, and 67 directory pages.
- Served noindex but reachable: 12,959 flagged histories, plus all 414 pages of
  the 15 companies with a pending accounting-scope review.
- Downloads stay noindex.

Verified live on canlicapital.com (September 21):

- Admitted directory, overview and history pages return 200 with no
  X-Robots-Tag, meta `index, follow` and a self-canonical.
- Flagged histories, pending-review companies and downloads return 200 with
  `X-Robots-Tag: noindex`. An unknown company returns 404.
- `/sitemap.xml` is a sitemap index with two shards, 50,000 + 27,622 =
  77,622 URLs (263 site pages plus the 77,359 admitted company URLs).
- All 64 previously live company URLs return 200. 58 stay indexable; six are now
  noindex because v22 flags them historical-only (for example Apple Revenues
  ends in 2018 and Microsoft Revenues in 2010).
- Server time, from connect to first byte, was at most 1.73 s across those 64
  at six parallel requests.
- IndexNow accepted 77,622 canonical URLs at 15:33Z.

## Counts (keep separate)

- Built candidate URLs: 90,732.
- Live indexable company URLs: 77,359.
- Live sitemap URLs: 77,622.
- Submitted to IndexNow: 77,622.
- Submitted to Google: sitemap resubmission pending (owner action in Search Console).
- Confirmed indexed: 262 as of September 14; no new measurement yet.
- Goal: 800,000 indexed, target 1,000,000.

## Editorial scope

Batch1: 1,148 reviewed, 28 withdrawn, none pending. Batch2 scope-v31: 672
reviewed, 128 pending. The 15 companies holding those pending observations are
withheld from indexing until resolved. The 12,959 flagged histories are
withheld until reviewed under COMPANY_EDITORIAL_POLICY.md.

## Other objectives

- Developer adoption: 0 stars on both repos; MCP 0.1.2 had 33 npm downloads
  (September 13–19).
- Engine: live forward-evidence report `IMMATURE_RECORD_TOO_SHORT` (paper only).
- ALPHAC nightly health check: red since September 16 on the Wave 1 data-rights
  test. PR #56 moved the policy review date to 2026-09-15, which invalidated the
  five sources reviewed on 2026-08-26. Current terms re-review is in progress.

## Progress log, September 21 (evening)

Everything below is verified against live files, PRs or logs, not planned.

| Area | Done | Evidence |
| --- | --- | --- |
| Release | v22 clean set live: 77,359 indexable company URLs, 13,373 withheld noindex | PR170 f6d37926; live header/canonical checks |
| Sitemaps | Index now lists stable children: sitemap-site.xml (263), sitemap-companies-1.xml (50,000), sitemap-companies-2.xml (27,359) | PR174 6820607a; deployed 16:23Z; all four files 200 as Googlebot; 563 sampled pages 200, indexable, self-canonical |
| IndexNow | Only new or updated URLs are submitted; state kept outside the deploy snapshot | PR172 51bd9d70; 16:29Z deploy logged "skipped: none of 77622 URLs is new or updated" |
| Records | Goal folder brought current | PR171 6437c062 |
| Capacity | SEC bulk companyfacts inventoried: 7,281 active filers, 375,915 current-concept histories, 413,535 filings | PR173 061c49a3; SOURCE_CAPACITY.md |
| Repository | GitHub release v0.2.0 with notes; 8 topics added (mcp, mcp-server, sec-edgar, xbrl, financial-data, backtesting, api, model-context-protocol) | github.com/arhancanli/canlicapital/releases/tag/v0.2.0 |
| MCP | 0.2.0 candidate adds company_financial_history over the company reference; 53 tests, package smoke, live check pass | PR175 (open); npm publish still needs the owner |
| Engine | Wave 1 data-rights terms re-reviewed (6/6); running checkout fast-forwarded to 025dd27; live config fingerprint unchanged (553aff51); stale test counts fixed | alphac PR72 merged 025dd27e; PR73 open |

Not done, in the owner's hands: Search Console resubmission of sitemap.xml
(a "Couldn't fetch" on sitemap-companies-1.xml predates the 16:23Z deploy);
npm publish of canli-validation-mcp 0.2.0; alphac PR73 merge after CI.

Not yet measured: Google indexed count (baseline 262 as of September 14);
npm downloads of 0.1.2 were 174 for September 14 to 20; both repositories
still have 0 stars.

## Next actions

1. Owner resubmits https://canlicapital.com/sitemap.xml in Search Console. Then
   measure crawl, index and exclusion counts by page family.
2. Growth beyond v22 toward 800,000 indexed: sixth cohort of active SEC filers
   from the bulk companyfacts archive (runbook being prepared from the five-cohort
   scripts), curated additional concepts, review of the 12,959 flagged histories,
   and a filing-level page family only after its own reader task and editorial rules.
3. Developer adoption: publish MCP 0.2.0, keep releases substantive, measure stars
   and npm downloads weekly.
4. Engine: merge PR73; the nightly publish regenerates the audits and the health
   check should turn green on the next run. Sharpe, sleeve and drawdown goals
   remain immature (six current-epoch returns, four sleeves).

## 2026-09-25: first measured Google index (Search Console)
- Indexed: 3,030. Discovered, currently not indexed: 74,452. Crawled, not indexed: 166. noindex: 52. Redirect: 3.
- Sitemap index last read 2026-09-23: 748,228 URLs discovered.
- Last 28 days: 12 clicks, 2.54k impressions, average position 5.3.
- Implication: the 10M goal is limited by crawl budget and authority, not by URL supply. Priority moves from adding families to authority, page quality and crawl prioritisation, re-measured weekly.

## 2026-09-25: why Google is not indexing more (measured)
- Company sitemap shard 1 (50,000 URLs): 2,230 indexed, 47,642 "discovered, currently not indexed", only 126 "crawled, not indexed". Pages Google fetches are indexed about 95% of the time, so crawl volume is the limit, not page quality.
- Crawl stats, 90 days: 39.5k requests, 100% 200, average response 407 ms, 61% discovery / 39% refresh.
- Cause found: company pages render in a function running in iad1 while release storage is in eu-central-1 (Frankfurt), with several sequential reads per page; uncached TTFB was 0.80–0.91 s (edge HIT 0.20 s). Fix: canlicapital PR225 (functions in fra1). Re-measure the TTFB, then the crawl stats trend.
- Next levers: authority (repo/list/launch links), internal links into company pages from strong hubs, and sitemap ordering.
- PR225 LIVE 2026-09-25 08:59Z: functions in fra1 (x-vercel-id bom1::fra1). Uncached company pages, server time (TTFB minus connect) measured from Dubai: median about 0.55 s over 12 fresh URLs (0.38–0.87), against about 0.80 s before (0.77–0.86, bom1::iad1). About 30% faster. Hourly deploys reset the edge cache, so the uncached path is what Googlebot mostly sees. Watch the Search Console crawl-stats average (407 ms baseline) over the coming weeks.

## 2026-09-25: MCP server, trust and accuracy (measured)
- Hosted endpoint https://canlicapital.com/mcp live and verified with the SDK client; nine tools with safety annotations; a real validate_track_record call returned 2.73 years (receipt c8e346c6dd6f06066c901722).
- canli-validation-mcp 0.4.0 published end to end from CI (run 36140775920): npm with SLSA provenance, official MCP Registry; the GitHub release v0.4.0 on arhancanli/canli-validation-mcp carries the Claude Desktop bundle.
- Listings live: npm, MCP Registry, cursor.directory. In review: Glama, mcpservers.org, awesome-mcp-servers. Anthropic's connectors directory needs a Team/Enterprise org (owner decision).
- Accuracy: DSR and MinTRL reproduce their papers' worked examples (JPM 2014 pp. 9-10; J. Risk 2012 p. 11); CSCV agrees with CRAN pbo 1.3.5 on PBO and all 13,010 logits (convention per paper p. 12). All three in CI.
