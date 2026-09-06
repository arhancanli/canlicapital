# Owner checklist before any Zenodo upload

Nothing under `deposits/` has been uploaded anywhere. This is the list to work through before
that happens, and the last section says what to paste back afterwards.

## 1. Confirm or override the defaults

Every file under `deposits/zenodo/` was written with these defaults. Change them before upload if
any is wrong; nothing here is final until you say so.

- **Creator name:** Arhan Canli
- **Affiliation:** Canli Capital
- **Licence, code** (`schema.json`, `paper-evidence-core.js`, the conformance vectors): MIT, the
  same licence as this repository's `LICENSE`.
- **Licence, prose** (the two notes in `notes-2026-09`): CC BY 4.0.
- **Visibility:** public / open access on Zenodo (`access_right: open` in both `zenodo.json`
  files).
- **AI-assistance disclosure:** "Development uses reviewed AI-assisted tooling, but project
  ownership, research decisions, methodology, claims, and publication responsibility remain with
  Arhan Canli." This sentence is quoted verbatim from `~/alphaforge/README.md` and appears in both
  package descriptions and both package READMEs.

If any of these should be different, edit the `creators`, `license`, `access_right` and
description fields in the relevant `zenodo.json`, and the matching prose in the package's
`README.md`, before uploading.

## 2. Confirm the labels

Both descriptions carry **PREPRINT** and **NOT PEER REVIEWED** unconditionally. The
`paper-evidence-v0` package additionally discloses that its bundled example record is **ALPACA
PAPER** (three sleeves) mixed with **RESEARCH SIMULATION** (the crypto sleeve), because that is
what the record itself says. The `notes-2026-09` package labels `deflating-a-sharpe-ratio.md` as
**RESEARCH SIMULATION** because its worked example is synthetic; `seventy-files.md` carries no
performance label because it contains no performance content. Read both `zenodo.json`
descriptions and both READMEs and confirm these are the labels you want attached before upload.

## 3. Run the deposit gate one more time, right before uploading

```
node scripts/check-deposit-claims.mjs deposits/zenodo/paper-evidence-v0
node scripts/check-deposit-claims.mjs deposits/zenodo/notes-2026-09
```

Both must print `ALL PACKAGES PASS` and exit 0. If either fails, do not upload; fix the flagged
file or, if the finding is wrong, fix the gate script and re-run this checklist, per
`scripts/check-deposit-claims.mjs`'s own comment: the fix is to remove the claim, never to narrow
a rule to let it through.

## 4. Upload steps on zenodo.org

Repeat once per package (`paper-evidence-v0`, then `notes-2026-09`).

1. Log in to zenodo.org (GitHub or ORCID login is simplest for a creator-linked record).
2. **New upload** -> **New upload**.
3. Upload every file in the package directory except `zenodo.json` itself (that file is a record
   of the metadata to enter, not a file Zenodo ingests). For `paper-evidence-v0`, that is
   `schema.json`, `paper-evidence-core.js`, `MANIFEST.sha256`, `README.md`, and everything under
   `vectors/` (Zenodo accepts a directory structure inside a single upload; if it does not accept
   nested paths in your Zenodo instance, zip the `vectors/` folder and upload the zip alongside the
   loose files, noting that in the description). For `notes-2026-09`, that is the two `.md` files
   and `README.md`.
4. Fill in the metadata form using the corresponding field in `zenodo.json`: **Upload type**,
   **Title**, **Creators** (name and affiliation), **Description** (paste the HTML from the
   `description` field), **License**, **Keywords**, **Version**, and **Related/alternate
   identifiers** (one row per entry in `related_identifiers`, same relation and identifier).
5. Set **Access right** to Open, matching `access_right` in `zenodo.json`.
6. Use **Save** to keep it as an unpublished draft and reread it once, cold, before publishing.
   Zenodo drafts can be edited freely; a published record's files cannot be changed, only
   versioned.
7. **Publish**. Zenodo assigns a DOI immediately on publish.

## 5. After publishing: what to paste back

Paste the two DOIs (one per package) back into this project. They are used to:

- Fill in `deposits/CITATION_UPDATES.md`'s placeholder and apply those blocks to
  `arhancanli/canli-backtest` and `arhancanli/canli-pit-lake`'s `CITATION.cff` and `README.md`.
- Add the DOI as a `related_identifiers` entry (relation `isSupplementTo`) in the other package's
  `zenodo.json`, and in a future site update, on `/standards/paper-evidence` and in
  `public/llms.txt`, once that update goes through the normal build.
- Update this repository's own `CITATION.cff` if you want the top-level `canlicapital` record to
  point at these sub-records too (optional; not required for either DOI to be valid on its own).

Paste both DOIs in the form `10.5281/zenodo.<number>` (the numeric Zenodo record id, not the full
URL) so they drop straight into the YAML blocks in `CITATION_UPDATES.md`.
