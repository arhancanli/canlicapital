# Changelog

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

## 0.1.0

First release. Five read-only tools over SEC XBRL company facts, point in time:

- `known_as_of`: what a company had reported as of a date, per concept, flagged if later restated.
- `history`: one concept as first reported, as latest filed, or as known on a date.
- `restatements`: periods whose value changed in a later filing.
- `vintages`: every filing that reported one period.
- `list_concepts`: what a company reports.

Data comes from the SEC companyfacts snapshot canlicapital.com serves for each company, accepted
only when its SHA-256 matches the company record, and cached on disk by that hash.
