# Changelog

## 0.1.0

First release. Five read-only tools over SEC XBRL company facts, point in time:

- `known_as_of`: what a company had reported as of a date, per concept, flagged if later restated.
- `history`: one concept as first reported, as latest filed, or as known on a date.
- `restatements`: periods whose value changed in a later filing.
- `vintages`: every filing that reported one period.
- `list_concepts`: what a company reports.

Data comes from the SEC companyfacts snapshot canlicapital.com serves for each company, accepted
only when its SHA-256 matches the company record, and cached on disk by that hash.
