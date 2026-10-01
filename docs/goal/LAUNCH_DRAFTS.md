# Launch drafts (for the owner to post under his own name)

Every figure below is copied from a published record; the source is named beside it. Post from your
own accounts, one venue at a time, and reply to comments yourself. Do not post the same text twice.

---

## 1. Show HN (news.ycombinator.com/submit)

**Title (under 80 characters):**
Show HN: Null Zoo – backtest-overfitting corrections scored where the truth is known

**URL:** https://canlicapital.com/research/null-zoo-v0

**Text (leave empty when you give a URL; paste this as your first comment instead):**

I build Canli Capital, an open quant research site where every published number traces to a file
you can download. Before trusting my own backtests I wanted to know whether the standard fixes for
"I tried many strategies and kept the best one" actually keep their promise.

So I built a zoo of synthetic research searches where the truth is known: 20 strategies over 504
daily returns, 2,000 searches per cell, every strategy skill-less except in the power arm. Then I
counted how often each correction calls noise skilled.

What surprised me:
- With autocorrelated returns, every best-of-N test that ignores autocorrelation breaks: my own
  statistic rejected 20.0% of skill-less searches at a 5% level, the Bonferroni haircut 13.2%.
  Lo's (2002) autocorrelation correction brings mine back to 5.9%.
- The deflated Sharpe ratio read as a test at 0.95 almost never calls noise skilled (0.0%), but it
  also found a strategy with a true Sharpe of 2 in only 9.1% of searches, against 53.4% for the
  luck-equivalent trials statistic.

Seeds, generators and results are public; the checks run in CI. The validators are free as an API
and an MCP server (npm: canli-validation-mcp). Happy to be told where the design is wrong.

(Sources: config/research/null-zoo-v0.json, published at /glassbox/research/null-zoo-v0.json.)

---

## 2. r/algotrading (text post)

**Title:** I scored backtest-overfitting corrections on synthetic searches where the answer is known

**Body:**

Most of us correct for data snooping with a deflated Sharpe ratio or a haircut and move on. I wanted
to see how those corrections behave when the truth is known, so I generated research searches (20
strategies, 504 daily returns, 2,000 searches per setting) from eight return shapes: normal, fat
tails, both skews, GARCH, AR(1), two volatility regimes and correlated trials.

Two results worth knowing before you trust a best-of-N backtest:
1. Autocorrelated returns make noise look skilled. At a 5% level, a best-of-N test that ignores
   autocorrelation rejected 20.0% of skill-less searches. Lo's correction fixes it (5.9%).
2. DSR at 0.95 is conservative to the point of rarely finding real skill: 9.1% power against a true
   Sharpe of 2, versus 53.4% for a test calibrated at its level.

Full tables, seeds and code: https://canlicapital.com/research/null-zoo-v0
The statistic itself: https://canlicapital.com/research/luck-equivalent-trials

If you want to run the checks on your own backtest, the validators are free (API key or the
canli-validation-mcp server). No signup is needed for the first call.

---

## 3. r/quant (text post; keep it methodological)

**Title:** Size and power of DSR, haircut Sharpe and a best-of-N test on eight synthetic return families

**Body:** Same content as the r/algotrading post, but lead with the design (families, N, T, reps,
level) and the two tables, and ask a direct question at the end: "Which return shapes should v1 add?"
Link: https://canlicapital.com/research/null-zoo-v0

---

## 4. Quantocracy (quantocracy.com, "Submit a link")

**Title:** Null Zoo v0: backtest-overfitting corrections scored on ground truth
**URL:** https://canlicapital.com/research/null-zoo-v0

---

## 5. A dataset post (Hugging Face community, r/MachineLearning "[D]" or "[R]")

**Title:** FilingFacts v0: 1,882 SEC-filing questions with machine-checked answers (CC BY 4.0)

**Body:**

I released a small benchmark of financial questions whose answers are computed from companies' SEC
XBRL filings and re-derived by an independent checker. Every item cites the filing accession it
depends on, and some items are unanswerable on purpose.

Baseline (gpt-5.4-mini, 150 items): on answerable questions it got 0.8% right from memory and 65.8%
with a tool that reads the filings; 98.7% of the numbers it gave from memory were wrong.

Items, run records, the annotator packet and the generator:
https://canlicapital.com/research/filing-facts-v0
No item has been checked by a person yet; the gold packet and guidelines are there if you want to
help.

(Sources: /glassbox/datasets/filing-facts-v0.json, generated from the published files.)

---

## Timing

Space them out: Show HN first (a weekday morning US Eastern), Quantocracy the same day, the Reddit
posts two or three days later, the dataset post after that. Each independent link that stays up is
what raises Google's crawl rate for the whole site.

---

## 6. Product Hunt (producthunt.com/posts/new; launch day 00:01 Pacific, a Tuesday to Thursday)

**Product:** Canli Validation (the MCP server plus the free API)

**Name:** Canli Validation
**Tagline (60 characters max):** Check whether a backtest is real before you trust it
**Topics:** Developer Tools, Artificial Intelligence, Fintech, Open Source

**Description (260 characters max):**
Free validators for trading backtests: deflated Sharpe, overfitting probability (CSCV), minimum
track record, luck-equivalent trials. Use it from Claude, Cursor or any MCP client, or as an API.
Every result comes with a signed receipt anyone can recompute.

**Links:** https://canlicapital.com/developers (main), https://github.com/arhancanli/canli-validation-mcp,
https://www.npmjs.com/package/canli-validation-mcp

**Gallery (1270x760, in this order):**
1. One sentence on a dark card: "Your best backtest is the one most likely to be luck." with the
   Sharpe before and after deflation from a real receipt.
2. Screenshot: an MCP client calling validate_backtest and the reply.
3. Screenshot: a receipt page with its recompute command.
4. The Null Zoo size table (autocorrelation row highlighted).
5. The /developers quickstart (three commands).
A 30 to 45 second screen recording of steps 2 and 3 is worth more than any image.

Rendered 2026-09-26 (2540x1520, the 1270x760 ratio at 2x) in docs/goal/launch/producthunt/:
01-luck.png and 02-mcp-call.png are drawn from a real local call of validate_deflated_sharpe on the
/developers quickstart example (mcp_call.json: Sharpe 1.50, 229 trials; best-by-luck 1.60; 98.1% ->
44.4%). 03 is the live /tools/deflated-sharpe result (no public receipt exists to screenshot; a
receipt page needs a key, so the calculator stands in), 04 the live Null Zoo size table, 05 the live
/developers quickstart. Rebuild: node gallery.mjs <dir with mcp_call.json> <out dir>.

**First comment (maker, post it the minute the launch goes live):**
Hi Product Hunt, I'm Arhan. I build Canli Capital, an open quant research project that publishes
every number with the file behind it, including the strategies that failed. The most common way to
fool yourself in trading is to try many ideas and keep the best one; its Sharpe ratio looks great
because you picked it. Canli Validation corrects for that: tell it how many things you tried and it
tells you how much of the result is luck. It runs as an MCP server, so you can ask Claude or Cursor
"is this backtest real?", or as a plain API with a free key. Results come with a signed receipt anyone
can recompute. I tested the corrections themselves on a zoo of synthetic searches where the truth is
known, and published where they break (https://canlicapital.com/research/null-zoo-v0). I'd love to
hear where it's wrong.

**Before launch day (owner):** create the Product Hunt account now (new accounts cannot launch at
once), follow and comment on a few launches in the same topics over the week, and line up a few
people who genuinely used it to leave honest reviews. Do not ask for upvotes (against PH rules).
