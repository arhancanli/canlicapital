# Contributing to canli-validation-mcp

This package is developed in the `mcp/` directory of
[arhancanli/canlicapital](https://github.com/arhancanli/canlicapital/tree/main/mcp). The standalone
repository [arhancanli/canli-validation-mcp](https://github.com/arhancanli/canli-validation-mcp)
is imported from it at each release, so open issues and pull requests on canlicapital.

## Reporting

- Bugs and feature requests: a GitHub issue on canlicapital, with the tool name, the arguments
  (with any private data removed), what you expected and what happened.
- Security problems: never a public issue. Follow [SECURITY.md](SECURITY.md) and use GitHub
  private vulnerability reporting.

## Making a change

1. Fork canlicapital and branch from `main`.
2. Change the code under `mcp/`. The validators' arithmetic lives in the repository's `js/`
   directory and is mirrored byte for byte into `mcp/src/local` by `node mcp/scripts/sync-local.mjs`;
   change `js/` and re-run the sync, never `src/local` by hand.
3. Run, from `mcp/`:

   ```bash
   npm ci
   npm test
   npm run test:package
   npm audit --audit-level=high
   ```

4. Open a pull request against `main`. Continuous integration runs the same checks, CodeQL and the
   site build; a pull request merges only when they pass, and only as a squash merge of signed
   commits.

## Test policy

Every change in behaviour comes with a test that fails without it:

- a new tool, argument or output field gets tests in `test/` for success, error envelopes and
  argument validation;
- a change to a validator's arithmetic gets a check against an independent reference (a paper's
  worked example, a reference implementation such as CRAN `pbo`, or a property in
  `test/properties.test.mjs`);
- a bug fix gets a regression test that reproduces the bug.

Tests use only local stubs; none calls the production API or issues a real key.

## What a change must keep

- Every tool result carries the full API envelope, including the boundary sentences that say what
  a number does not establish. Tool descriptions state one of them (`src/schemas.mjs`,
  `LIMITS_SENTENCES`); a test pins them to the API's own text.
- Runtime dependencies stay pinned to exact versions, with the lockfile committed.
- No shipped file contains an em dash (a test checks).
- A published number comes from a file the repository can regenerate, never typed by hand.
