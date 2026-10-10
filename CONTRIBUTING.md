# Contributing to Canli Capital

Thanks for helping. This repository holds the canlicapital.com site, the validation API and three
MCP servers: [`mcp/`](mcp/README.md) (canli-validation-mcp),
[`mcp-fundamentals/`](mcp-fundamentals/README.md) and [`mcp-research/`](mcp-research/README.md).
Useful contributions make a result easier to check: a reproducible bug fix, a clearer limitation, a
verified source correction, an accessible interaction, or a working API or MCP integration.

Contributors are rewarded with access and credit, never money. See
[Rewards: Contributor access](#rewards-contributor-access).

## Pick something to work on

- **[Good first issues](https://github.com/arhancanli/canlicapital/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22+-label%3A%22review+task%22)**:
  small, real tasks. Each one lists the files involved, what done looks like and how to test it.
- **[Review tasks](https://github.com/arhancanli/canlicapital/issues?q=is%3Aissue+is%3Aopen+label%3A%22review+task%22)**
  (15 to 60 minutes, no code needed): recompute a published number, check filings against a
  dataset, or try to break the MCP server, then post what you found on the issue. Completed reviews
  are credited on [/review](https://canlicapital.com/review) with your consent.
- **Your own idea**: open an issue first for anything bigger than a small fix, so the scope is
  agreed before you write code.

To take an issue, comment on it to say you are working on it. Review tasks need no assignment:
several people can do the same one.

## Rewards: Contributor access

After a merged contribution (a pull request merged into `main`), you can claim Contributor access
for your API key:

1. **A higher daily quota.** 10,000 validations per UTC day on the hosted validation API, instead
   of the standard 1,000 (`LIMITS.validations_per_key_per_day` in
   [`api/_lib/limits.js`](api/_lib/limits.js)).
2. **Early access.** New tools and servers reach a beta endpoint for contributor keys before their
   public release.
3. **Priority.** Your issues and feature requests are looked at first.
4. **Credit by name** in the [contributors list](README.md#contributors), in the changelog and
   release notes, and, for research contributions, as an author in [`CITATION.cff`](CITATION.cff).
   See [How credit works](#how-credit-works).

There are no cash rewards, bounties or prizes.

### How to claim it

1. After your pull request is merged, open an issue with the
   [Contributor access form](https://github.com/arhancanli/canlicapital/issues/new?template=contributor-access.yml).
   Its title is "Contributor access".
2. Link the merged pull request, and name your key by its label or its SHA-256 fingerprint.
   **Never post the key itself.** This prints the fingerprint:

   ```bash
   printf '%s' "$CANLI_KEY" | shasum -a 256
   ```

   No key yet? Issue one with a label you will recognise (no signup; the key is shown once):

   ```bash
   curl -X POST https://canlicapital.com/api/v1/keys -H "Content-Type: application/json" -d '{"label":"your-github-handle"}'
   ```

3. A maintainer grants the tier to that key and replies on the issue.

If a key leaks, revoke it with `POST /api/v1/keys/revoke` (see
[/developers](https://canlicapital.com/developers)) and open a new Contributor access issue for its
replacement.

### How credit works

- **Contributors list.** The README names everyone whose contribution was merged, with a link to
  what they did.
- **Changelog and release notes.** A change to an MCP package adds a line under `## Unreleased` in
  that package's `CHANGELOG.md`, ending with your name or GitHub handle. The GitHub release that
  ships it names you too.
- **CITATION.cff.** A research contribution adds you to `authors` in [`CITATION.cff`](CITATION.cff),
  and in the package's own `CITATION.cff` when the work ships in an MCP package, so anyone citing
  the software cites you as well. Research means new or corrected methods, analysis or data that a
  published result depends on: for example a new validator, a replication that changes a published
  number, or reviewed dataset labels. Whether a contribution counts is agreed on its pull request.
  Give your name as you want it cited, and your ORCID if you have one.
- **Your choice.** Say in the pull request how you want to be named, or that you prefer no public
  credit.

## Set up

Use Node 22 (the `engines` field in `package.json`) and Python 3.9 or newer.

```sh
git clone https://github.com/arhancanli/canlicapital.git
cd canlicapital
npm ci
```

### Work on an MCP server

Each server is its own npm package with its own lockfile and tests, so an MCP-only change does not
need the website build:

```sh
cd mcp          # or mcp-fundamentals, or mcp-research
npm ci
npm test
```

In `mcp/`, also run `npm run test:package`: it packs the real tarball, installs it in a temporary
directory and runs the stdio test against it. Each package's own `CONTRIBUTING.md` lists what a
change must keep, such as the boundary sentences on every result and no em dashes in shipped files.
The validators' arithmetic lives in `js/` and is mirrored into `mcp/src/local` by
`node mcp/scripts/sync-local.mjs`; change `js/`, never `mcp/src/local` by hand.

### Work on the website

```sh
npx playwright install chromium
npm run build
npm run verify
npm run test:corpus
npm run test:indexnow
```

Edit the generator when changing a generated page; rebuild and include the resulting
HTML. See `scripts/build-*.mjs` and `scripts/product-shell.mjs`. Review generated diffs:
a shared-footer edit can legitimately update many files, but unrelated data should not change.

## Make a pull request

1. Fork the repository and branch from `main`.
2. Keep the change focused: one fix or feature per pull request.
3. Add a test that fails without your change, for any bug fix or change in behaviour.
4. Run the checks above for the part you changed.
5. Open the pull request and fill in the template, including how you want to be credited.

Continuous integration runs the site build and `npm run verify`, every MCP package's tests and
CodeQL. A pull request is squash-merged once its checks pass and a maintainer has reviewed it.

## Evidence and content changes

Preserve paper-trading and risk disclosures. Do not contribute credentials, account
data, restricted licensed data or proprietary research inputs.

State the question being answered, the original source, its capture date, and how the
published result reproduces. Keep rejected cases and missing coverage visible. Never
replace missing values with zeros, imply a latest-filed history is point-in-time data,
or label local/sitemap counts as indexed pages.

A number in a page or README comes from a file the repository can regenerate, never typed by
hand. Changes to numerical claims require their supporting artifact.

New search targets need a distinct useful answer and a canonical owner in
`config/search-intents.json`. Synonyms belong on the same page. The query map is an
editorial hypothesis until search measurements support it.

For a company-data contribution, retain original bytes, hash them, reproduce selection,
and review units, reporting periods, filing chronology and taxonomy semantics. Bulk
eligibility is not editorial approval; see [the corpus audit](docs/COMPANY-CORPUS-AUDIT.md).

## Report or propose a change

Use the issue forms for MCP and API bugs, site bugs, source corrections and developer
integrations. Include a minimal reproduction, expected behavior and relevant versions. Remove API
keys and private data before sharing logs. Report security vulnerabilities through
[private security reporting](https://github.com/arhancanli/canlicapital/security/advisories/new).

A pull request should explain the user-visible change, validation performed and any
remaining limitation. No contribution can establish a financial outcome simply by improving a
backtest.

## More

- [ALPHAC](https://github.com/arhancanli/alphac) contains the research engine and governed strategy
  pipeline.
- [The developer guide](https://canlicapital.com/developers) has API-key onboarding and runnable
  examples.
- [The active roadmap](docs/goal/PHASES.md) separates implemented work from open outcomes.
- Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
