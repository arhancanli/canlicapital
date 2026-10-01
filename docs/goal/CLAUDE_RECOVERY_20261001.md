# Claude continuity recovery, 2026-10-01

The owner asked Codex to recover where Claude stopped, launch the goal, preserve all earlier
instructions, and specifically retain the annotation goals and the whole MCP/goal structure.
The goal was launched in this Codex task. No outcome goal is marked achieved.

## Sources recovered

- The original continuity folder: README, REQUIREMENTS, STATUS, PHASES, LOG, VISION,
  PILLAR3, MCP_PLAN, MCP_BEST_IN_CLASS_PLAN, MCP_NEXT_MAJORS_PLAN, MCP_TRADING_DESIGN,
  RESEARCH_METHODS, INDEXING_PLAN, GROWTH_PLAN, LAUNCH_DRAFTS and MARKETING_CHANNELS.
  These include local uncommitted records absent from origin/main; preserved in this checkout.
- Local Claude history and the main CanliCapital session
  `23a151e2-78b0-4b29-a06d-3b79c64689a7`, including its owner messages, latest assistant
  handoff and relevant memory records. Supplemental CanliCapital, MCP, ALPHAC and community
  session records were used for context. Private transcripts/credentials are not copied here.
- Git worktrees, live GitHub PR state, npm registry latest metadata, production checkout and
  initialize/tools-list responses from all three hosted MCP endpoints.
- The published FilingFacts bundle, generation/checker/annotation code and ALPHAC's recorded
  implementation-shortfall analysis at engine commit 8633f954725afda8244563239a56627c075ade29.

## Verified stopping point

Origin/main and the production checkout are 607e0a1c, the merged execution PR #335.
The execution source is private/unreleased: size_position, check_orders and journal head/verify.
Shortfall, journal export and paper broker tools were explicitly left unfinished. #333's stale
quarter fix and #334's hosted released-copy mechanism have merged. Claude's later MCP memory
still called them open; that memory is stale.

Live 2026-10-01: validation 0.10.1 (15 tools), fundamentals 0.5.0 (7), research 0.2.0 (6).
Npm latest: validation 0.10.1, fundamentals 0.1.0, research 0.1.0; execution returns 404.
The hosted/npm versions differ for two packages. Verify publisher configuration and CI before
releasing their corrections; do not repeat the old blanket parity claim.

Open website PRs: #336 social/structured metadata, #337 font/performance and #338 dependency
update. They have not been merged merely because Claude's local checks passed.

FilingFacts v0: 1,882 generated items, 50 blank gold items, published CC BY 4.0. Its browser
annotation page and agreement script exist. No human submissions/adjudication artifacts were
found in the published bundle. PILLAR3's statements that v0 external release/license are pending
are superseded by that published release, while expert recruitment and human review stay open.

Claude's last main-session event (2026-09-29) was a failed Show HN submission due to the site's
new-account restriction; no post exists. Separate community/X sessions are not this task, and
their session-only schedules are not assumed to have restarted.

## Owner instructions retained

The four Sovereign Pillars; 10M actually indexed quality pages; every supportable finance/quant
search intent; top-tier design/understandability and analyzers; open glass-box API/MCP/repository
adoption and external reviews; novel rigorously checked research; and all ALPHAC performance,
cost, risk and sleeve goals. For MCP specifically: expand a distinct family, make each far more
useful, minimize measured latency/token cost, retain truth and developer trust, batch substantial
releases, and add real trading utility with the existing paper/live boundaries.

MASTER_PLAN.md makes that structure explicit. REQUIREMENTS.md and VISION.md preserve the
owner's detailed wording. Read the historical plans as plans and verify the work behind them.
