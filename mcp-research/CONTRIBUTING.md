# Contributing to canli-research-mcp

This package is developed in the `mcp-research/` directory of
[arhancanli/canlicapital](https://github.com/arhancanli/canlicapital/tree/main/mcp-research). The
standalone repository
[arhancanli/canli-research-mcp](https://github.com/arhancanli/canli-research-mcp) is imported from
it at each release, so open issues and pull requests on canlicapital.

## Reporting

- Bugs and feature requests: a GitHub issue on canlicapital, with the tool name, the arguments, what
  you expected and what happened.
- Security problems: never a public issue. Follow [SECURITY.md](SECURITY.md) and use GitHub
  private vulnerability reporting.

## Making a change

1. Fork canlicapital and branch from `main`.
2. Change the code under `mcp-research/`.
3. Run, from `mcp-research/`:

   ```bash
   npm ci
   npm test
   npm audit --audit-level=high
   ```

4. Open a pull request against `main`. Continuous integration runs the same checks, CodeQL and the
   site build; a pull request merges only when they pass, and only as a squash merge of signed
   commits.

## Releases

A release is a substantial step, not a single change: developers pin versions, and a stream of small
releases reads as churn. Feature pull requests do not bump the version in `package.json`,
`server.json` or the bundle manifest; they add their entry under `## Unreleased` in `CHANGELOG.md`.
A release gathers those entries into one version, one changelog section, one npm publish, one
registry entry and one GitHub release, once the batch is worth upgrading for. The one exception is
a fix for an answer that was wrong without warning, which ships as a patch as soon as it is ready.

## Test policy

Every change in behaviour comes with a test that fails without it:

- a new tool, argument or output field gets tests in `test/` for success, error results and
  argument validation, and its result must pass the output schema the tool lists;
- a bug fix gets a regression test that reproduces the bug.

Tests use only local stubs; none calls canlicapital.com.

## What a change must keep

- Every result carries `RESEARCH_LIMITS` beside its source's own limits.
- The server reads only published static files and writes no files.
- The tool list stays small and byte-identical across launches (a test checks both).
- Runtime dependencies stay pinned to exact versions, with the lockfile committed.
- No shipped file contains an em dash (a test checks).
