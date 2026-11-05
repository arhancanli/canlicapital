# FilingFacts weekly: questions from the annual reports filed last week

A new question set every week, built from the annual reports (10-K, 20-F, 40-F) filed that week.
Every item cites at least one figure whose first XBRL report was filed during the week, so a model
whose training data ends more than a few weeks earlier cannot know the answer: it has to read the
filing. Same templates (lookup, change, ratio, net_assets), independent checker (`check.mjs`) and
item schema as v1. The unanswerable template is left out, because a period before a company's
earliest XBRL fact is never new.

## How a week is built (`weekly.mjs`)

1. EDGAR's daily form indexes for the week's five weekdays list the original annual reports filed
   (amendments are left out: they re-file figures first reported earlier).
2. The week's filers are tried in a fixed shuffle of the week and seed until `--companies` of them
   have new items.
3. Each filer's companyfacts (data.sec.gov) becomes a company record through
   `scripts/lib/company-reference.mjs`, the code that builds the site's company pages. A filer
   without at least four concepts that each have three annual periods is skipped.
4. For each concept the generator keeps the periods up to the last one first reported during the
   week, and the period before it, which a change question needs as its base. "First reported" is
   read from every filing in the raw companyfacts, quarterly reports and amendments included.
5. An item is kept when it cites at least one figure first reported in the week, cites nothing
   filed after the week, and passes `check.mjs` against the full record.

```bash
node scripts/datasets/filing-facts/weekly.mjs --week 2026-W44 --out <dir> [--companies 40] [--per-company 3] [--seed 20261105]
```

`<dir>` receives `items.jsonl` (v1 items plus `split: "week-<week>"` and `fresh`, each new
figure's concept, period end, unit and first-report date), `manifest.json` (the rule, the week,
each index read with its sha256, every company used with the sha256 of its companyfacts, every
skip with its reason, the counts and the sha256 of `items.jsonl`) and
`sources/<cik>.raw.json.gz`, the companyfacts each record was built from.

## Limits

- Run it soon after the week ends. A company record keeps the latest filing of each figure, so an
  amendment filed after the week takes that figure out of the set (it is never cited), and next
  year's annual report re-files the figure as a comparative, which hides this week's filing. An
  old week cannot be rebuilt from live data; its saved `sources/` can rebuild it.
- "First reported" means first in XBRL data. An earnings release (an 8-K exhibit, with no XBRL
  data) can give a figure some days before the annual report.
- Annual reports only, as in v1, so a question never mixes a quarter with a year.

## 2026-W44 (26 October to 1 November 2026)

Released in `public/datasets/filing-facts/weekly/2026-W44/` (CC BY 4.0, `SHA256SUMS`): 93 items
from 31 companies (17 filed a 10-K, 14 a 20-F): change 32, lookup 28, ratio 20, net_assets 13. The
week's indexes listed 45 original annual reports; 14 filers were skipped for too little XBRL
history, and the checker refused no item. Five figures were read in the filed documents themselves
on 5 November: WD-40's total assets ($494,377 thousand), Greenbrier's revenue for the two years
($2,461.1 and $3,240.2 million) and net earnings ($79.0 million), and Rafael Holdings' total assets
and total liabilities ($83,055 and $11,085 thousand). Each matched the item's figure.

### First scored run (5 November 2026)

gpt-6.1-terra through OpenAI's Responses API at its default reasoning effort, at most six turns,
on 91 of the 93 items (`eval.mjs`'s stratified sample: at most 30 a template, seed 20260926). The
records are in `runs/2026-11-05/`; each binds the sha256 of `items.jsonl`.

| | answered correctly | wrong numbers | other | mean tokens a question |
|---|---|---|---|---|
| the model alone | 0 of 91 | 0 | "not reported" 88, "unable to verify" 1, no answer line 2 | 456 |
| with canli-mcp 0.20.0 (from npm, with its server instructions) | 89 of 91 | 0 | stopped at the six-turn limit 2 | 6,769 |

By template with canli-mcp: change 30 of 30, lookup 28 of 28, ratio 19 of 20, net_assets 12 of 13;
130 tool calls in all, 1.43 a question. The model alone gave no number at all, so it never
invented one. The two misses are one company: Here Group Limited (CIK 1932770) has a new name,
which its companyfacts carries, while canli-mcp's company index still names it QuantaSing Group
Limited. Searching the new name matched 14 other companies; the model found the CIK through
full-text search on its fifth call and ran out of turns on the sixth. Company search should know
new and former names (EDGAR lists both); that fix belongs to the next canli-mcp release.
