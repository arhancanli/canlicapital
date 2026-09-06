# CITATION.cff updates, to apply once a DOI exists

Nothing here has been applied to either repository. This file exists so the owner can paste the
exact text into each `CITATION.cff` and each `README.md` the day a DOI is minted, rather than
drafting it under time pressure.

There is one placeholder in this whole file: `10.5281/zenodo.PLACEHOLDER`. It appears exactly
where a DOI value goes and nowhere else. Do not fill it in before Zenodo has actually minted the
DOI; do not use it as a real identifier for any purpose.

## arhancanli/canli-backtest

Add this block to `CITATION.cff`, as a top-level key alongside the existing `authors:`, `license:`
and `abstract:` keys (CFF 1.2.0 supports multiple identifiers; add to an existing `identifiers:`
list if one is already present instead of duplicating the key):

```yaml
identifiers:
  - type: doi
    value: 10.5281/zenodo.PLACEHOLDER
    description: "Zenodo archival record for the extracted backtester and multiple-testing engine"
```

Two-line addition for `README.md` (place near the existing citation or licence section):

```
Archived on Zenodo: https://doi.org/10.5281/zenodo.PLACEHOLDER
Cite this software using the metadata in CITATION.cff, or the DOI above.
```

## arhancanli/canli-pit-lake

Add this block to `CITATION.cff`, same placement rule as above:

```yaml
identifiers:
  - type: doi
    value: 10.5281/zenodo.PLACEHOLDER
    description: "Zenodo archival record for the point-in-time data lake reader"
```

Two-line addition for `README.md`:

```
Archived on Zenodo: https://doi.org/10.5281/zenodo.PLACEHOLDER
Cite this software using the metadata in CITATION.cff, or the DOI above.
```

## Notes for whoever applies this

- Each repository gets its own DOI from its own Zenodo upload; do not reuse one DOI value across
  both `identifiers:` blocks above. The placeholder is repeated in this file only because the
  exact text is identical in shape, not because the value should be.
- If a repository's `CITATION.cff` does not yet have an `identifiers:` key, add it as a new
  top-level key. If it already has one (for example, an existing DOI for the whole `alphac`
  monorepo), append a new list item rather than replacing the key.
- After editing, validate with the `cffconvert` tool or GitHub's own CITATION.cff parser (a
  repository's citation widget on GitHub will simply stop rendering if the YAML is invalid, which
  is the easiest way to notice a mistake here).
- This deposit's own `deposits/zenodo/paper-evidence-v0/zenodo.json` and
  `deposits/zenodo/notes-2026-09/zenodo.json` list both repositories under `related_identifiers`
  by URL, not by DOI, because neither DOI exists yet. Once minted, those two files can be updated
  to add a `related_identifiers` entry of relation `isSupplementTo` and identifier
  `https://doi.org/10.5281/zenodo.<the real DOI>` for each repository, on the next Zenodo version
  bump; that is a separate, later action and is not part of this preparation.
