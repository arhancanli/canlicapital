# Story drafts, 2026-09-06

Drafts only, not posts. Nobody posts anything from this file. The owner reads it, edits
whatever he wants, and posts on his own yes, one channel at a time. Nothing here is sent
anywhere by this session.

Every numeral in every draft below is sourced. The "Numbers used" table under each draft
gives the exact artifact path and field for each one, so a reviewer can open the file and
check it before anything goes out. No performance is claimed anywhere in this file: nothing
says a strategy is good, nothing forecasts a return, nothing recommends a trade. All trading
figures describe a paper-traded book and say so explicitly. No draft claims a DOI, peer
review, or independent replication, because the project has none of those yet
(`docs/superpowers/plans/2026-09-06-launch-kit-and-deposits.md` section 1: every sleeve paper
is `BUNDLE_INCOMPLETE`).

Two numbers withdrawn from the public record appear nowhere in these drafts, bare or
otherwise, because leaving them out entirely is simpler than threading the retraction rule
correctly in short-form copy: the AlphaTrend DSR of 0.83 that was called "cleared" and was
not (`~/alphaforge/docs/retracted_claims.txt` rule 24; `public/paper-state.json` transparency
entry 24), and the "0.7 to 1.0 forward Sharpe" band that was overstated on a since-replaced
social card (`~/alphaforge/docs/retracted_claims.txt` rule 21; `public/paper-state.json`
transparency entry 21). Where a draft below refers to either event, it describes what
happened ("I once claimed a strategy had cleared my own bar for surviving multiple testing;
it had not") without repeating the specific withdrawn digits. This is a stricter reading of
the "withdrawn numbers appear only inside their own retraction sentence" rule than the
minimum: it avoids the digits rather than relying on nearby retraction language to excuse
them.

The site's own rule that a count is not a duration (`~/alphaforge/docs/retracted_claims.txt`,
the `entries` vs `days` comment) is followed throughout: every mention of the signed chain
below states entries and days as two separate numbers, never one for the other.

---

## 1. Hacker News story post (not Show HN)

**Title** (67 characters):

> A quant fund that publishes every strategy it killed, signs the log

**Body** (339 words in prose, 350 including the three link lines; both inside the 250-350
word target):

> I run a small cross-asset paper-trading book and publish the ideas that failed, not just the ones that survived.
>
> The kill log lists 9 strategies that died on the full walk-forward engine and 37 more that died earlier, on a cheaper prototype screen, all measured against one fixed floor: net Sharpe 0.40 after costs. Three survived that bar. Every kill gets a name, the real numbers, and a written reason it failed, not a footnote.
>
> The harder habit was admitting the record itself had bugs. In the ten weeks since the signed history began, it has carried a dozen public corrections against things I had already published. A reverse split once got mismarked, fabricated a loss that never happened, and tripped a drawdown brake for a week of half-size trading. I once wrote that a strategy had cleared my own statistical bar for surviving multiple testing; it had not, and that claim is now formally withdrawn. A database bug wrote a fake 300 percent one-day gain that sat on the site, live, for three days before I found it and corrected it in the open.
>
> Every one of those corrections is appended to a hash-chained, Ed25519-signed log, never edited in place. 61 of its checkpoints are already confirmed on the Bitcoin blockchain through OpenTimestamps, so the history cannot be quietly rewritten later, including by me.
>
> One incident I wrote up at length: a position that lost 99 percent of its value in 24 days, and the argument for why I did not add a rule against it afterward. One bad day is not enough data to justify a new parameter, however tempting the parameter feels.
>
> All of this is paper money. The current live book started August 7, 2026, and two earlier configurations were superseded before it, not deleted, both still visible in the same chain. If the arithmetic behind it is useful to you (deflated Sharpe, overfitting probability), it is also exposed as a free API, the least interesting part of this and the last thing I'll mention.
>
> Kill log: https://canlicapital.com/open
> Signed chain: https://canlicapital.com/verify
> The 99 percent trade: https://canlicapital.com/notes/the-trade-that-lost-99-percent

The API is mentioned exactly once, in the last paragraph, and unnamed (called only "a free
API").

**Numbers used:**

| Number | Source |
|---|---|
| 9 (strategies killed, full engine) | `public/glassbox/kill_log.json` field `killed_count` |
| 37 (strategies killed, cheap screen) | `public/glassbox/kill_log.json` field `screen_killed_count` |
| 3 (strategies survived) | `public/glassbox/kill_log.json` field `survived_count` |
| net Sharpe 0.40 (gate) | `public/glassbox/kill_log.json` field `gate_minimum_sharpe` |
| ten weeks / a dozen corrections | `public/glassbox/transparency_log.json` fields `first_date` (2026-06-27) and `last_date` (2026-09-05), 70 calendar days; `public/paper-state.json` field `transparency`, 12 of 36 entries prefixed `CORRECTION` (counted directly: entries 11, 16, 20, 21, 23, 24, 28, 31, 33, plus three more in the same array) |
| reverse split, brake, week of half-size trading | `public/paper-state.json` transparency entry 11 (no specific digit repeated; the entry's own -7.1% and -2.49% figures are not used here) |
| withdrawn multiple-testing claim | `public/paper-state.json` transparency entry 24 (digits deliberately omitted, see note above) |
| 300 percent one-day gain, three days | `public/paper-state.json` transparency entry 28 ("this site published a 300% one-day gain that never happened, and it stood for three days") |
| Ed25519-signed, hash-chained, append-only | `public/glassbox/transparency_log.json` field `algorithm` ("Ed25519 over sha256(prev_chain_hash \| payload_sha256 \| date \| seq)") |
| 61 (Bitcoin-confirmed checkpoints) | `public/glassbox/ots/anchors.json` field `bitcoin_confirmed_count` |
| 99 percent, 24 days | `notes/the-trade-that-lost-99-percent.md` ("-99.0384 percent", "Twenty-four days") |
| August 7, 2026 (current live book start) | `public/paper-state.json` field `go_live_date` |
| two earlier configurations superseded | `public/paper-state.json` field `rebaseline` (keys `v1`, `v2`, both marked superseded, not deleted, in transparency entry 1) |

---

## 2. X (Twitter) thread, 10 posts

Each post is under 280 characters (checked by character count, not by Twitter's own
weighting, so treat 280 as a hard ceiling with margin already used). Post 1 stands alone as
the hook. Post 10 carries the only link. A screenshot suggestion accompanies each post,
naming the live page and section to capture; where no single rendered page shows a number
cleanly, the raw JSON artifact is named instead, because it is itself a live, public URL.

**1/10** (214 chars)
> My quant fund's homepage has a page that only lists the strategies I killed. 9 died on the full backtest, 37 more died earlier and cheaper, 3 survived. That page exists so nobody has to take the survivors on faith.

Screenshot: `canlicapital.com` (homepage) hero HUD strip, the four-stat row reading "Trial
identities / Killed or screened / Active sleeves / Signed entries" (`index.html`, elements
`core-trial-count`, `core-kill-count`, `core-sleeve-count`, `core-signed-count`).

**2/10** (182 chars)
> The bar was fixed before any of them ran: net Sharpe 0.40 after costs, no exceptions for a strategy I liked. Every kill gets a name and a written reason it failed, not just a number.

Screenshot: `canlicapital.com/open`, the "Kill Log" section (`open.html` id `killlog`), a
ledger card showing one strategy's name, Sharpe, and reason.

**3/10** (227 chars)
> The harder discipline isn't killing bad ideas. It's admitting the record itself is sometimes wrong. The signed log holds 743 entries across 63 days, and 12 of them are public corrections against numbers I had already published.

Screenshot: `canlicapital.com/performance`, the ALPHAC flagship book block, the visible
sentence "We used to call that decorrelation 'the edge' and we withdrew the claim."

**4/10** (178 chars)
> One correction: a reverse split got mismarked, fabricated a loss that never happened, and tripped a drawdown brake for a week of half-size trading. Real money, real week, my bug.

Screenshot: the raw artifact `canlicapital.com/paper-state.json`, transparency array entry
11 (opened directly in a browser and highlighted; no prettier page renders this entry's
prose today).

**5/10** (157 chars)
> Another: a carry sleeve went live and had never once booked the funding payments it exists to collect, for weeks, before I caught it and disclosed it myself.

Screenshot: same artifact, `canlicapital.com/paper-state.json`, transparency array entry 16.

**6/10** (180 chars)
> One I'm not proud of: I wrote that a strategy had cleared my own bar for surviving multiple testing. It had not. That claim is now formally withdrawn, in the same log, not deleted.

Screenshot: `canlicapital.com/performance`, same ALPHAC flagship block as post 3 (the
withdrawal sentence is the visible proof; do not screenshot the withdrawn number itself).

**7/10** (174 chars)
> A database bug once wrote a fake 300 percent one-day gain into the flagship curve. It sat on the live site for 3 days before I found it and published the real number instead.

Screenshot: same artifact, `canlicapital.com/paper-state.json`, transparency array entry 28.

**8/10** (216 chars)
> Every one of those is appended to a hash-chained, signed log, never edited in place. 61 of its checkpoints are already confirmed on the Bitcoin blockchain, so I can't quietly rewrite this history later, including me.

Screenshot: `canlicapital.com/open`, the "Reproduce" section (`open.html` id `reproduce`),
the fact row labelled "External anchor (Bitcoin)".

**9/10** (195 chars)
> I also wrote up the day a position lost 99% of its value in 24 days, and argued for why I did NOT add a rule to stop it happening again. One bad day is not enough data to justify a new parameter.

Screenshot: `canlicapital.com/notes/the-trade-that-lost-99-percent`, the pull-quote at the
top of the article.

**10/10** (169 chars, the link post)
> All of this is paper money, no live capital, and I say so on every page. The deflated-Sharpe math behind it is also a free API. Start here: https://canlicapital.com/open

Screenshot: optional; the `/open` hero if one is wanted, otherwise none needed since this
post exists to carry the link.

**Numbers used:**

| Number | Source |
|---|---|
| 9, 37, 3 | `public/glassbox/kill_log.json` (`killed_count`, `screen_killed_count`, `survived_count`) |
| net Sharpe 0.40 | `public/glassbox/kill_log.json` field `gate_minimum_sharpe` |
| 743 entries, 63 days, 12 corrections | `public/glassbox/transparency_log.json` fields `entry_count` (743) and `distinct_days` (63), stated separately per the site's own entries-are-not-days rule; `public/paper-state.json` field `transparency` (12 of 36 entries prefixed `CORRECTION`) |
| week of half-size trading | `public/paper-state.json` transparency entry 11 |
| 300 percent, 3 days | `public/paper-state.json` transparency entry 28 |
| 61 (Bitcoin-confirmed) | `public/glassbox/ots/anchors.json` field `bitcoin_confirmed_count` |
| 99%, 24 days | `notes/the-trade-that-lost-99-percent.md` |

---

## 3. r/algotrading post, built around the Selection Risk Lab

**Title:**

> I built a lab where you "discover" a great Sharpe ratio on a series that provably has zero edge, then it deflates it in front of you

**Body:**

> The series is a driftless geometric random walk, 750 bars, seeded so you can share the exact scenario. Its true Sharpe ratio is 0 by construction, no drift, no signal. You get a moving-average crossover with a fast and slow window and you're free to search: the sweep grid covers 820 fast/slow combinations. Trades decide at the close of a bar and hold from the next bar's open to the one after that, the same no-lookahead rule the real backtest engine enforces.
>
> Go find the best-looking curve. You will find one. Then run it through the deflated Sharpe ratio (Bailey and Lopez de Prado) using how many combinations you actually tried as the trial count, and watch the significance you thought you had evaporate. That is the whole lesson: a Sharpe ratio without a trial count next to it is not a result, it is a screenshot.
>
> Try it here: canlicapital.com/tools/selection-risk
>
> Then, if you want the real test, take your own best backtest's Sharpe ratio and however many parameter combinations, filters, or entry rules you actually tried before landing on it, and run those two numbers through the deflated Sharpe calculator at canlicapital.com/tools/deflated-sharpe. Most people have never counted the second number honestly. I run a small paper-traded book that publishes this same math against its own strategies, including the ones it killed, at canlicapital.com/open, so this isn't a hypothetical for me either.
>
> Three things this thread always says, answered in advance:
>
> "Survivorship bias, though, what about all the backtests that failed before you built this?" Agreed, and it's why the demonstration uses a random walk instead of real market data: on a true zero-edge series, every "good" result you can find IS survivorship, with nothing else mixed in. My own public kill log lists every strategy I've killed on a real engine or an early screen (46, against 3 that survived), specifically so you don't have to take my survivors on faith either.
>
> "Sure, but my strategy is different, it has a real economic reason to work." It might. But "having a reason" doesn't exempt a result from search costs, it's exactly the story every overfit strategy tells itself. Across a real research ledger I publish, of 228 recorded trial identities (real hypotheses, not random walks, 224 of them actually measured), the median first-look Sharpe was 0.02 and only 5.4 percent ever cleared 1.0. A reasonable-sounding thesis is the average case, not the exception.
>
> "DSR isn't everything, though." Correct, and I'd rather say that than let the tool oversell itself. A deflated Sharpe only tells you whether your in-sample result survives the search you're honest about. It says nothing about costs, capacity, execution slippage, regime change, or a search you didn't disclose, including to yourself. It's a filter for one specific kind of self-deception, not a certificate.

**Numbers used:**

| Number | Source |
|---|---|
| 750 bars | `public/glassbox/selection_risk_lab_contract.json` field `generator.bars` |
| true Sharpe 0 | `public/glassbox/selection_risk_lab_contract.json` field `generator.true_sharpe` |
| 820 combinations | `public/glassbox/selection_risk_lab_contract.json` field `sweep_grid.combinations` |
| decide-at-close / hold-to-next-open rule | `public/glassbox/selection_risk_lab_contract.json` field `execution.rule` |
| 46 killed or screened, 3 survived | `public/glassbox/kill_log.json` (`killed_count` 9 + `screen_killed_count` 37 = 46; `survived_count` 3); the combined 46 also matches the live homepage HUD stat "Killed or screened" |
| 228 recorded trial identities, 224 measured | `public/glassbox/trial_sharpe_distribution.json` fields `trials_total` and `trials_measured` |
| median Sharpe 0.02 | `public/glassbox/trial_sharpe_distribution.json` field `summary.median` (0.0247, rounded) |
| 5.4 percent cleared 1.0 | `public/glassbox/trial_sharpe_distribution.json` field `summary.share_above_one_pct` |

Note on a number not used: `public/glassbox/trial_ledger.json` reports a slightly different
distinct-hypothesis count (229, against a budget of 400, 171 remaining) from the same date.
The two files are separate snapshots of overlapping but not identical accounting (the ledger
counts hypothesis identities, the distribution counts measured trial rows). Rather than
average or reconcile them here, the post cites only `trial_sharpe_distribution.json` and
names that file, so a reader who opens it sees exactly 228 and 224, not a number this draft
invented by combining two artifacts.

---

## 4. About paragraph and owner bio

**About paragraph, for podcast and newsletter pitches** (120 words):

> Canli Capital is a small, one-person quant research house that publishes its own failures. Its public kill log lists every strategy that died on a backtest or an early screen, next to the handful that survived a fixed statistical bar. Its live record is signed, hash-chained, and checkpointed to the Bitcoin blockchain, so a published number cannot be quietly changed later. When the record itself has been wrong, including a fake 300 percent one-day gain from a database bug and a validated-strategy claim that never cleared its bar, the correction is published in place, not edited away. Everything trading-related is paper money, disclosed as such. The underlying arithmetic, deflated Sharpe ratios and overfitting probability, is free through a public API.

**Owner bio, in his own voice** (40 words):

> I'm Arhan Canli. I built and run Canli Capital alone from Dubai, and publish what fails. My README states it exactly: "Development uses reviewed AI-assisted tooling, while project ownership, research decisions, published claims, and release responsibility remain with Arhan Canli."

**Numbers used:**

| Number | Source |
|---|---|
| 300 percent one-day gain | `public/paper-state.json` transparency entry 28 |
| "never cleared its bar" (no digit stated) | `public/paper-state.json` transparency entry 24, digits deliberately omitted |
| AI-assistance disclosure sentence (quoted verbatim) | `README.md` lines 7-8 |

---

## 5. Pre-posting checklist

Run this in full before the owner posts any single item above. Nothing here authorizes
posting by itself; it only tells the owner whether a "yes" would be safe to give.

1. **Every number traced.** For each of the four drafts, open the "Numbers used" table above
   and confirm each source file still contains the cited field with the cited value. The
   underlying JSON artifacts regenerate on every build (`generated_at` and `content_hash`
   fields change), so a number correct on 2026-09-06 can drift; re-pull each field the same
   morning the post goes out, not from this document's memory of it.

2. **No withdrawn number appears bare.** Check `~/alphaforge/docs/retracted_claims.txt`
   against the final posted text of all four drafts (paste the literal text you are about to
   publish, not this file, since editing during review can reintroduce a blocked phrase).
   Specifically confirm: no bare "DSR 0.83", no bare "0.7 to 1.0" forward-Sharpe band, no bare
   "decorrelation is the edge", no "fixed 40/40/20" without a superseding qualifier, and no
   instance of "743 entries" (or any entry count) relabelled as a day count. This draft avoids
   all of these by construction (see the note at the top of this file), so this step should
   find nothing; it exists to catch an edit made after this file was written, not to catch
   this file itself.

3. **Links resolve.** Load every URL below in a browser the morning of posting and confirm a
   200, not a redirect to a 404 or a stale cached page:
   - `https://canlicapital.com/open`
   - `https://canlicapital.com/verify`
   - `https://canlicapital.com/performance`
   - `https://canlicapital.com/notes/the-trade-that-lost-99-percent`
   - `https://canlicapital.com/tools/selection-risk`
   - `https://canlicapital.com/tools/deflated-sharpe`
   - `https://canlicapital.com` (homepage, for the X-thread screenshot)
   - `https://canlicapital.com/paper-state.json` (raw artifact, for two X-thread screenshots)
   - `https://canlicapital.com/glassbox/kill_log.json`

4. **Baseline recorded.** Run `npm run arrivals` that same morning, before the first post
   goes out, and record its output (unique keys issued, unique (key, day) validating pairs,
   by referer and label) somewhere durable. This is the trailing baseline the launch kit plan
   calls for (`docs/superpowers/plans/2026-09-06-launch-kit-and-deposits.md`, section 4:
   "Record the trailing baseline of key issuance and validations by referer and label BEFORE
   the first post, so the launch has a same-period control"). Without this reading, any bump
   after posting is a story, not a measurement.

---

## Numbers I could not source (left out rather than guessed)

- An exact per-post attribution of API signups to the Hacker News, X, or Reddit post
  individually does not exist yet; nothing in the checked artifacts breaks out referer by
  channel before a post happens; only after (see checklist item 4). No such split-by-channel
  figure appears in any draft.
- `notes/deflating-a-sharpe-ratio.md`'s worked DSR table (for example, DSR 0.9596 at N=2
  trials, or the PBO test returning 0.569 against an expected ~0.5) was read in full and is
  accurate to the file, but no draft above uses it: the r/algotrading post cites the
  Selection Risk Lab's own contract numbers instead, since that is the specific tool the post
  is built around, and mixing both files' trial-math examples in one short post seemed more
  likely to confuse a reader than help one. It is here in case the owner wants a follow-up
  post built on that note instead.
