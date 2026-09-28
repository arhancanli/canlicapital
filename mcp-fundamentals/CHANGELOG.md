# Changelog

## 0.4.0

- `known_as_of` with `ratios: true` adds ratios computed only from values filed by `as_of`, for the
  latest period whose revenue (or, with none, net income) had been filed: gross, operating and net
  margin, return on equity and on assets (averaging the balances at the period's start and end,
  annual periods only), liabilities to equity, free cash flow and its margin. Each ratio lists its
  inputs with their period end, filed date and accession number, and `changed_after` says a later
  filing changed one of them. A balance restated after `as_of` is not used: before the restatement
  is filed, the ratio reads the balance as first reported. Apple's fiscal 2019, as of 2020-01-01:
  net margin 0.2124, return on equity 0.5592, free cash flow $58.9B, from the figures in its 10-K.
- New plain name `capex` (PaymentsToAcquirePropertyPlantAndEquipment, the IFRS purchase of
  property, plant and equipment, PaymentsToAcquireProductiveAssets); `capital_expenditures` works too.

## 0.3.0

Find any company, faster, in less memory:

- `find_company` searches the 12,738 companies in the Canli company reference by name, ticker or
  CIK, best match first. Every other tool also takes a name as `company` (`Exxon Mobil`, `Alphabet`,
  `Goldman Sachs`) and says how it resolved it in `company.matched`. A name is used only when one
  company is clearly meant; otherwise the error lists the candidates with their CIKs. Looked up by
  its own name, each of the 12,738 companies resolves to itself (12,446), to another company with
  the same name (125) or to a list to choose from (167), and never to a different company.
- A ticker the SEC now gives to a company outside the reference is followed to the covered filer
  with the same name, and the result says so: `XOM` names ExxonMobil Holdings Corp (CIK 2115436), a
  new holding company, and Exxon Mobil Corporation (CIK 34088) is read. Former tickers are not
  listed; search by name (`Twitter`).
- The ticker list, the name index and company records are cached on disk (owner-only files, like
  snapshots), used for six hours without asking and then revalidated by ETag. A stale copy is used
  when the site cannot be reached. The first call for a company in a new process, with the disk
  warm, took 38 to 72 ms (AAPL, JPM, MSFT; 384 to 431 ms in 0.2.0).
- Heap after garbage collection with nine large filers loaded is 60 MB (172 MB in 0.2.0):
  `list_concepts` and a full `restatements` scan no longer keep a series for every concept, and an
  index keeps one copy of each filing's accession number, date and form.
- Results are capped at 10,000 characters of rows (14,000 in 0.2.0). `list_concepts` and
  `restatements` page with `offset`, and say `next_offset` while rows remain.

## 0.2.0

Point-in-time fixes from an outside audit of 0.1.0, each with a test that fails without it:

- `as_of` now applies to every basis in `history`, and alone selects the `as_of` basis. In 0.1.0,
  `as_of` without `basis` was ignored and later filings leaked into the answer.
- Quarters of 12 to 17 weeks (80 to 125 days) are quarterly. 0.1.0 classed 16- and 17-week quarters
  (Kroger's first, Costco's fourth) as "other", so quarterly answers skipped them.
- Companies that moved to IFRS are followed: the default measures include the ifrs-full tags, and
  an XBRL tag present in two taxonomies is read from both. Toyota and Sony now return their current
  figures instead of 2020 ones.
- `known_as_of` flags `stale` measures and says when `as_of` is later than the snapshot; every
  result gives the snapshot's `age_days`.

New:

- Plain names (`revenue`, `net_income`, `eps_diluted`, `assets`, `cash` and more) for every tool.
  They follow a measure across tag changes, so a first report under an old tag is found (Apple's
  fiscal 2017 revenue, first reported on 2017-11-03 as SalesRevenueNet). Each value names its tag.
- Suggestions that fold plurals and split CamelCase, current tags first, and `newer_series` on a tag
  the company stopped using.
- `restatements` gives a cause: `split` (matched to a split ratio the company reported),
  `split_likely`, `tag_change` or none. Splits are left out unless `include_splits` is set.
  Values that changed and went back to the first report are counted, not listed. A change from zero
  is kept when `min_change_pct` is set.
- Filing-fee exhibits (`ffd`) and registration statements (424B, S-, F- forms) no longer enter
  vintage chains.
- Results are capped at about 14,000 characters of rows (`truncated`), and memory keeps the eight
  most recently used companies.
- `initialize` returns a title, the documentation page and icons in `serverInfo`, and the registry
  entry carries the same title, website and icons.
- Hosted at https://canlicapital.com/mcp/fundamentals over MCP Streamable HTTP (stateless, no key), declared
  as a remote in the registry entry.
- Server instructions in `initialize`: which tool to call first, byte-stable.

## 0.1.0

First release. Five read-only tools over SEC XBRL company facts, point in time:

- `known_as_of`: what a company had reported as of a date, per concept, flagged if later restated.
- `history`: one concept as first reported, as latest filed, or as known on a date.
- `restatements`: periods whose value changed in a later filing.
- `vintages`: every filing that reported one period.
- `list_concepts`: what a company reports.

Data comes from the SEC companyfacts snapshot canlicapital.com serves for each company, accepted
only when its SHA-256 matches the company record, and cached on disk by that hash.
