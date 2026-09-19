# Contributing to CanliCapital

Useful contributions improve a result a reader or developer can inspect: a reproducible
bug fix, a clearer limitation, a verified source correction, an accessible interaction,
or a working API/MCP integration. Start with a small change and explain its evidence.

## Find the right project

- This repository serves the website, public evidence, validation API and [MCP server](mcp/README.md).
- [ALPHAC](https://github.com/arhancanli/alphac) contains the research engine and governed strategy pipeline.
- [The developer guide](https://canlicapital.com/developers) has API-key onboarding and runnable examples.
- [The active roadmap](docs/goal/PHASES.md) distinguishes implemented work from open outcomes.

If the project helps your work, a GitHub star helps others discover it. A reproduction,
useful issue or contribution gives the project evidence it can improve from.

## Run the website checks

Use Node 22 and Python 3.9 or newer.

```sh
npm ci
npx playwright install chromium
npm run build
npm run verify
npm run test:corpus
npm run test:indexnow
```

For MCP changes, install its separate lockfile and run its tests:

```sh
cd mcp
npm ci
npm test
```

Edit the generator when changing a generated page; rebuild and include the resulting
HTML. See `scripts/build-*.mjs` and `scripts/product-shell.mjs`. Review generated diffs:
a shared-footer edit can legitimately update many files, but unrelated data should not change.

## Evidence and content changes

Preserve paper-trading and risk disclosures. Do not contribute credentials, account
data, restricted licensed data or proprietary research inputs.

State the question being answered, the original source, its capture date, and how the
published result reproduces. Keep rejected cases and missing coverage visible. Never
replace missing values with zeros, imply a latest-filed history is point-in-time data,
or label local/sitemap counts as indexed pages.

New search targets need a distinct useful answer and a canonical owner in
`config/search-intents.json`. Synonyms belong on the same page. The query map is an
editorial hypothesis until search measurements support it.

For a company-data contribution, retain original bytes, hash them, reproduce selection,
and review units, reporting periods, filing chronology and taxonomy semantics. Bulk
eligibility is not editorial approval; see [the corpus audit](docs/COMPANY-CORPUS-AUDIT.md).

## Report or propose a change

Use the issue templates for site bugs, source corrections and developer integrations.
Include a minimal reproduction, expected behavior and relevant versions. Remove API
keys and private data before sharing logs. Report security vulnerabilities through
[private security reporting](https://github.com/arhancanli/canlicapital/security/advisories/new).

A pull request should explain the user-visible change, validation performed and any
remaining limitation. Changes to numerical claims require their supporting artifact.
No contribution can establish a financial outcome simply by improving a backtest.
