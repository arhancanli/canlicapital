# Two engineering notes, 2026-09

**PREPRINT. NOT PEER REVIEWED.** Two short engineering notes, deposited together as Markdown.

## Contents

- `deflating-a-sharpe-ratio.md` -- "The arithmetic of not fooling yourself." Derives the
  Probabilistic and Deflated Sharpe Ratio (Bailey and Lopez de Prado) and Probability of Backtest
  Overfitting (Bailey, Borwein, Lopez de Prado, Zhu) from first principles. **RESEARCH
  SIMULATION**: the worked example is a synthetic series used only to demonstrate how the
  correction responds to trial count. No strategy, sleeve or book is named or evidenced, and no
  number in the note is a performance claim about any real trading. The note also keeps its own
  earlier mistake on the record: a first published version used the wrong variance parameter and
  reported a demonstration figure that argued against its own thesis while appearing to confirm
  it.
- `seventy-files.md` -- "Seventy files that were never meant to be public." A parity post-mortem
  about an extraction tool that was structurally incapable of failing, because it compared each
  published file against the very folder it had copied it from rather than against the public
  GitHub history. It contains no Sharpe, CAGR, drawdown or equity curve of any kind; it is an
  account of a software defect and its fix, not a performance record.

## PDF

No PDF is included. This deposit was prepared without adding a new dependency, and no PDF
renderer was already available locally: this project's `package.json` does not install a
Markdown-to-PDF tool, and the two system utilities checked (`textutil`, `cupsfilter`) either
cannot target PDF from HTML at all in this environment or do not convert Markdown headings and
emphasis correctly. Zenodo accepts Markdown files directly, so the two `.md` files are deposited
as they are. A PDF can be added later without disturbing this record's identity if a renderer
becomes available.

## Sources

- Live versions: https://canlicapital.com/notes/deflating-a-sharpe-ratio and
  https://canlicapital.com/notes/seventy-files
- Referenced source repositories: https://github.com/arhancanli/canli-backtest and
  https://github.com/arhancanli/canli-pit-lake

## Licence

CC BY 4.0 (Creative Commons Attribution 4.0 International). Prose, not code; attribute Arhan
Canli / Canli Capital.

## Authorship and AI-assistance disclosure

Created and maintained by Arhan Canli for Canli Capital. Development uses reviewed AI-assisted
tooling, but project ownership, research decisions, methodology, claims, and publication
responsibility remain with Arhan Canli.

## What this deposit does not establish

- Any performance claim about any strategy, sleeve or book. Neither note contains one.
- That the demonstration in `deflating-a-sharpe-ratio.md` describes any real trading; it is a
  synthetic series chosen to illustrate the arithmetic.
- Peer review, external replication, or endorsement of either note.
