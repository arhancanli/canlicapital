# Canli Capital: inspectable research infrastructure

The owner's direction is an open-source, glass-box algorithmic research platform that developers can inspect, reproduce and extend through API keys and MCP servers. The ambition is category leadership and, ultimately, a real fund. "First", "biggest" and "best" are ambitions, not verified public claims. Search growth must earn repeated developer use, not substitute for it.

## Product contract

One useful path connects the platform: inspect a source, formulate a hypothesis, register the experiment, reproduce the result net of costs, inspect failed tests, validate a return series, and retain its evidence. Website pages, the engine, the API and MCP must describe the same capabilities and evidence. A validation receipt does not establish the provenance of user data or certify a strategy.

Both collections matter:

- Research and evidence: methods, registered experiments, failure reports, measurement histories, reproducible examples and corrections.
- Company and market reference: substantive source-backed histories, definitions, availability dates, filing provenance and machine-readable downloads. The initial company collection supplies accounting facts, not market prices or a point-in-time backtest feed.

## Measured baseline and this change

The production sitemap returned 263 URLs on 19 September 2026. Claude's latest website commits fixed the forward-trial identity union and publication failures, preserved the redesigned site, and distinguished closed accounting records from indexable evidence. Those boundaries remain in force.

The new local candidate contains 312 indexable pages: the original 263 plus a directory, five company pages and 43 financial-history pages. It covers Apple, Microsoft, NVIDIA, JPMorgan Chase and Exxon Mobil. Each financial history has original units, period boundaries, filing dates, accession links, concept-specific interpretation, a downloadable selection and a compressed original SEC response verified by SHA-256. The selected history can contain restatements; it cannot be passed off as historical information availability.

The sitemap writer passes a one-million-URL synthetic test using 20 shards. This is only a sitemap capacity test. It does not mean one million real pages exist, have been deployed, have been crawled or have been indexed. The candidate is prepared in an isolated worktree; production remains unchanged.

Run `npm run seo:inventory` after building. `node scripts/seo-inventory.mjs --require-target` deliberately fails while fewer than one million canonical pages exist. Never include test URLs in the content inventory.

## Quality required before a page enters search

1. Answer a distinct, useful question with entity-specific or experiment-specific evidence. Renaming a template, splitting one observation into multiple pages, or multiplying ticker/keyword combinations is not new information.
2. Bind every numeric claim to a published source. Expose original units, reporting and availability dates, revision policy and missing coverage. Keep the original source snapshot retrievable.
3. Provide self-canonical server-rendered HTML, unique metadata, useful internal links, an accessible reading layout, working source links, and a meaningful machine-readable representation.
4. Keep source downloads and redundant or incomplete evidence out of search while preserving public access. Do not remove `noindex` to inflate counts.
5. Rebuild deterministically from captured inputs. Check the original bytes, transformation, generated output and runtime behavior. Retain negative findings and corrections.
6. Review accounting semantics, units, entity identity, taxonomy transitions, availability timing and comparisons before enlarging a page family. Mechanical tests cannot certify editorial excellence.

The pilot requires at least four usable concepts per company and three distinct reporting dates per history. These are minimum integrity checks, not a complete editorial quality score. Current coverage is intentionally limited and US-GAAP-focused. IFRS, custom tags, other asset classes and genuinely point-in-time reconstruction require separate source and semantics work.

## Path to approximately one million qualified pages

| Stage | Work | Exit evidence |
| --- | --- | --- |
| Pilot | Review the 49 new company pages and retain the existing research corpus | Build, publication/number audits, browser checks and source-snapshot reproduction pass |
| Broader source coverage | Import the SEC nightly bulk corpus into immutable storage; add reviewed concepts and issuer coverage incrementally | Actual eligible entity/concept counts, provenance coverage, duplicate/empty history rejection, source rights and freshness records |
| Serving scale | Move large collections off Vite's one-entry-per-page build into cached server rendering or incremental generation, backed by a durable catalog | Unknown routes return 404; missing sources do not emit empty indexable pages; measured cold/warm latency, concurrency, failure behavior and cost |
| Discovery scale | Expose paginated entity/subject directories, bounded sitemap shards and change-based notifications | Every eligible canonical is discoverable; sampled and full-corpus integrity checks agree; no parameter crawl traps |
| Research expansion | Publish reproducible, registered research and useful developer examples as evidence becomes available | Complete provenance, trial accounting, independent replication where required, and source-bound API/MCP examples |
| Count target | Publish approximately one million independently useful documents only if the source collection supports them | Inventory meets the target; separate deployed, crawlable and Search Console indexed counts; monitor exclusions and quality by family |

There is no evidence yet that the eligible corpus contains one million such documents. Measure it before promising a page allocation. If the quality-filtered count falls short, acquire additional useful sources or revise the count target; do not fabricate coverage.

The current Vite/static publishing system is adequate for this pilot, not validated for a million pages. Vercel documents a 15,000 source-file upload limit and a 45-minute build limit, and recommends incremental generation for large outputs. A million checked-in HTML files is not the serving plan. Infrastructure selection needs actual storage, refresh-frequency, traffic and cost measurements.

## Algorithm goals and research priorities

The authoritative engine goals are in `AlphaForge/config/owner_goals.json`: combined forward Sharpe above 2 net of costs, at least 14 economically distinct qualified sleeves, and realized maximum drawdown at most 10%. These are combined-book goals, not promises for an individual sleeve.

The 19 September engine report has four sleeves, four current-epoch daily returns, 248 more returns required before a Sharpe estimate and 752 more before the observation-count establishment gate. The drawdown brake's activation on 15 September started a new epoch. Prior returns cannot be pooled to shorten the wait. The statistical probability gate and provenance requirements still apply after the minimum observation count.

The latest reported whole-record realized drawdown is approximately 3.8964%; that does not bound future losses. The research model's current-composition conservative tail drawdown is approximately 16.4514%, and its crisis coverage, constituent/ladder replay and execution-gap modeling remain incomplete. Modeled expected drawdown and realized drawdown are different statistics.

Priority work:

- Keep the current configuration's forward record continuous, cost-bound and broker-reconciled. Frequent retuning restarts evidence and makes the target harder to establish.
- Measure submission-reference prices before claiming arrival slippage is charged. Wire a defensible financing rate source before claiming margin costs are complete. Current equity cost records explicitly omit these categories.
- Replay risk with constituent instruments, actual ladder state and crisis/liquidity scenarios. The declared brake can overshoot during a day.
- Use the governed sleeve pipeline to add distinct mechanisms, with registered hypotheses, untouched evaluation periods, full trial accounting and incremental portfolio contribution. Ten extra names or parameter variants do not establish ten new qualified sleeves.
- Investigate negative research-window marginal contributions without retroactively treating exploratory results as admission evidence. Do not delete adverse results or tune the live book solely to maximize a reported backtest Sharpe.

The engine review fixes an invalid negative-return assumption in a maturity test and a stale drawdown-activation projection. It does not improve a measured Sharpe ratio, admit sleeves, alter live sizing or establish the targets.

## Sources and implementation references

- [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces): company facts, concept semantics and nightly bulk sources.
- [Google sitemap requirements](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): 50,000 URLs and 50 MB per sitemap; submission is a hint, not an indexing guarantee.
- [Google crawl-budget guidance](https://developers.google.com/crawling/docs/crawl-budget): discovery and crawling for large collections.
- [Vercel limits](https://vercel.com/docs/limits): source upload and build limits; incremental generation guidance.
- [IndexNow documentation](https://www.indexnow.org/documentation): batches of at most 10,000 URLs; acceptance is not indexing.
- Local engine evidence: `artifacts/engineering/forward_evidence_maturity.json`, `config/owner_goals.json`, `config/drawdown_control_contract.json`, `config/cost_realism_contract.json`.
- Local website checks: `scripts/sitemaps.test.mjs`, `scripts/company-reference.test.mjs`, `scripts/seo-inventory.mjs` and the existing full verification suite.
