# Growth plan: indexing, research, launches, stars, reviews, annotation (2026-09-26)

Owner, 2026-09-26: "850k pages submitted on Google, find a much faster way for Google to actually
integrate them ... dramatically speed up to 10M; get active in research papers by inventing things;
Hacker News and related places; Product Hunt launch; stars, canlicapital huge; data annotation;
MCP servers much higher reviewed; external reviews by students, devs, professors; best quality."

Measured baseline (2026-09-26): Google 3,027 indexed / ~916k submitted, ~546 crawls/day, host
status healthy (demand-bound); 32 clicks and 7.68K impressions in 90 days, average position 4.9.
Glama grades canli-validation-mcp A license / A quality / A maintenance. Stars: 0 on canlicapital,
alphac and the MCP repos. npm: 750 downloads in 30 days. Five awesome-list PRs open (09-25).

Ruled out, because they risk the whole domain: Google Indexing API for non-job pages (against its
terms), paid "indexing"/link services, link schemes, auto-generated thin pages.

## A. Indexing speed (Google and everything else)

| step | who | status |
|---|---|---|
| A1. Bing Webmaster Tools: import the site from Search Console (one click), then the URL Submission API (about 10,000 URLs/day) on top of IndexNow. Bing feeds ChatGPT search, Copilot and DuckDuckGo. | owner signs in; I wire the API key via an env var he sets | todo |
| A2. Spend Google's ~10 daily "request indexing" on HUB pages (directory pages each link 50 companies, filing lists link every filing), not leaf pages | me, daily | from 09-27 |
| A3. Flat directory: every company within 3 clicks (#296) | me | merged 09-26 |
| A4. Distinct company pages (YoY, CAGR, rank among peers, fewer sibling links) so Google values the family | me | next |
| A5. Topic hubs as data tables (72 concept hubs, form/year hubs) | me | after A4 |
| A6. Per-family indexed share sampled weekly (URL Inspection API needs a service account the owner creates) | owner + me | todo |
| A7. Outside links: B, C, D, F below (the binding constraint) | both | in progress |

Gate before adding page families toward 10M (unchanged): a family's indexed share >= 30% within 60
days of shipping, crawl requests >= 2x baseline.

## B. Research: invent, then publish

1. Luck-equivalent trials + Null Zoo preprint (LaTeX), figures generated from the study JSON; the
   owner reads and approves every claim; SSRN (open) and Zenodo DOI now, arXiv when an endorser is found.
2. Invention in progress: a best-of-N test calibrated under every Null Zoo family (block-bootstrap
   calibration of the luck-equivalent statistic); publish whatever the zoo says, including failure.
3. FilingFacts benchmark note (dataset paper) with the closed-book vs tool baseline.

## C. Launches (owner posts from his own accounts; drafts in LAUNCH_DRAFTS.md)

Show HN, Quantocracy, r/algotrading, r/quant, r/MachineLearning (dataset), Product Hunt (kit below),
spaced over two weeks. Each links a page that stands on its own (Null Zoo, the MCP server, FilingFacts).

## D. GitHub stars (earned, never bought)

README first screens that show the value in 10 seconds (one line, a demo GIF, a copy-paste quickstart),
topics, social preview images (owner uploads in repo settings), five awesome-list PRs open,
"good first issue"s that are real, and the launches above.

## E. MCP reviews and ratings

Glama A/A/A done; awesome-mcp-servers PR has the Glama badge. Remaining listings need owner logins:
Smithery, PulseMCP, mcp.so, MCP Market; Anthropic's connector directory needs the Team plan.
Ask real users for reviews only after they use it; never seed fake reviews.

## F. External review by students, developers and professors

A public review program: three tracks (replicate a published number; review a method; audit the
code or MCP server), a GitHub issue template per track, reviewer credit on the site with consent,
and outreach templates the owner sends himself to university quant clubs, course instructors and
MCP developers. Reviews count only when a named person did them.

## G. Data annotation (Pillar 3)

FilingFacts v0 is public with a 50-item gold packet and guidelines. Next: a browser annotation page
where volunteers check items against the filing, two labels per item, agreement scored by the
published script, annotators credited. Recruitment rides on F.
