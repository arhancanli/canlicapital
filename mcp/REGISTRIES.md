# Registry listings for canli-validation-mcp

Release checkpoint, September 20, 2026: `canli-validation-mcp@0.1.2` is published
on npm and is the latest version. The downloaded registry tarball matches the
exact tested release (SHA256 `7975bf2827b5a46cb6593ab2211cf2643c9d3dd4dba3e5bb42bfb1979b95acf0`).
Publication evidence: `artifacts/platform/mcp-publication-20260920.json`.
Official MCP registry publication is also verified:0.1.2 is active and latest
under io.github.arhancanli/canli-validation-mcp. Receipt:
`artifacts/platform/mcp-registry-publication-20260920.json`.
Smithery and Glama publication remain unverified. Do not repeat the npm publication commands below for this version.

Release checkpoint, September 22, 2026: `canli-validation-mcp@0.2.0` (adds the
`company_financial_history` tool over the public company reference, no key) is published on npm
and is the latest version. Registry shasum `cd1b0d344f13a8fa72b097d7c0394b323d0bb15d`; the
downloaded registry tarball hashes to SHA256
`f780bf651e7818daf54b06adbc3de8aafb6403a5a3dd20f4f0a518ca0be6ebb9` and its integrity matches the
tested package (`artifacts/platform/mcp-publication-20260922.json`). Published from a clean
checkout of main at f90682f7 with the owner's web-auth second factor. Official MCP registry
publication verified the same day: 0.2.0 listed under io.github.arhancanli/canli-validation-mcp
via mcp-publisher 1.8.1 (release checksum verified) after the owner's GitHub device login
(`artifacts/platform/mcp-registry-publication-20260922.json`). Do not repeat the publication
commands for this version.

Release checkpoint, September 25, 2026: `canli-validation-mcp@0.3.0` (compact context: minified
results and columnar company histories; a breaking change to `history.observations`) is published
on npm by the owner with the npm second factor, and listed on the official MCP registry as 0.3.0
via mcp-publisher 1.8.1 (verified the same day against
`registry.modelcontextprotocol.io/v0/servers`). It is also on cursor.directory and served at
https://canlicapital.com/mcp.

Release checkpoint, September 25, 2026: `canli-validation-mcp@0.3.1` (tool annotations; an empty or
unsubstituted `CANLI_KEY` is no key) is the first release published from CI. Pushing the signed tag
`mcp-v0.3.1` ran `.github/workflows/mcp-publish.yml` (run 36135804565), which published to npm with a
provenance attestation (SLSA v1, `registry.npmjs.org/-/npm/v1/attestations/canli-validation-mcp@0.3.1`)
through npm trusted publishing. Its MCP Registry step failed because the registry looked the version up
on npm before npm served it; the registry entry was then published from the tagged checkout with
mcp-publisher 1.8.1 after the owner's GitHub device login, and the listing shows 0.3.1. The workflow now
waits for npm before the registry step. The Claude Desktop bundle for 0.3.1 is attached to
[the v0.3.1 release](https://github.com/arhancanli/canli-validation-mcp/releases/tag/v0.3.1).

Release checkpoint, September 25, 2026: `canli-validation-mcp@0.4.0` (adds `validate_track_record`)
published entirely from CI: the signed tag `mcp-v0.4.0` ran `mcp-publish.yml` (run 36140775920), which
published to npm with a provenance attestation
(`registry.npmjs.org/-/npm/v1/attestations/canli-validation-mcp@0.4.0`) and then to the official MCP
Registry, where 0.4.0 is listed as latest.

Release checkpoint, September 25, 2026: `canli-validation-mcp@0.5.0` (prompts, resources, structured
results, ticker lookup, private local mode, full-precision normal CDF) published entirely from CI: the
signed tag `mcp-v0.5.0` ran `mcp-publish.yml` (run 36171586114), to npm with a provenance attestation and
then to the official MCP Registry, where 0.5.0 is listed as latest.

Release checkpoint, September 26, 2026: `canli-validation-mcp@0.6.0` (audit_backtest with file
input, minimum backtest length, haircut Sharpe, luck-equivalent trials, signed receipts and
verify_receipt, compact results) published entirely from CI: the signed tag `mcp-v0.6.0` ran
`mcp-publish.yml` (run 36234498851), to npm with a provenance attestation and then to the official MCP
Registry, where 0.6.0 is listed as latest. The standalone repository's `v0.6.0` release carries the
signed Claude Desktop bundle.

Release checkpoint, September 26, 2026: `canli-validation-mcp@0.7.0` (toolsets; citation metadata
so each release of the standalone repository gets a DOI) published from CI: the tag `mcp-v0.7.0` ran
`mcp-publish.yml` (run 36257888022) to npm with a provenance attestation and to the official MCP
Registry, where 0.7.0 is listed as latest.

Release checkpoint, September 27, 2026: `canli-validation-mcp@0.7.1` (hosted shared-quota fallback;
the stdio server issues the free key itself on first use; README first screen) published from CI:
the tag `mcp-v0.7.1` ran `mcp-publish.yml` (run 36300300720) to npm with a provenance attestation
and to the official MCP Registry, where 0.7.1 is listed as latest.

Release checkpoint, September 27, 2026: `canli-validation-mcp@0.8.0` (MCP SDK v2 server package,
about 95 installed packages down to 4; open output schemas on every tool; usage guidance in the tool
descriptions) published from CI: the tag `mcp-v0.8.0` ran `mcp-publish.yml` (run 36302867139) to npm
and to the official MCP Registry, where 0.8.0 is listed as latest.

Release checkpoint, September 27, 2026: `canli-validation-mcp@0.8.1` (fixes from the 2026-09-27
audit) published from CI: the tag `mcp-v0.8.1` ran `mcp-publish.yml` (run 36327331341) to npm with
a provenance attestation and to the official MCP Registry; the mirror's v0.8.1 release carries the
signed Claude Desktop bundle.

Release checkpoint, September 27, 2026: `canli-validation-mcp@0.8.2` (registry metadata: the hosted
endpoint as a remote, title, website, icons and environment variables; npm keywords) published from
CI: the tag `mcp-v0.8.2` ran `mcp-publish.yml` (run 36331874195) to npm and to the official MCP
Registry.

Release checkpoint, September 27, 2026: `canli-validation-mcp@0.9.0` (server instructions; a 9%
smaller tool list) published from CI: the tag `mcp-v0.9.0` ran `mcp-publish.yml` (run 36341749959)
to npm with provenance and to the official MCP Registry; the mirror's v0.9.0 release carries the
signed Claude Desktop bundle.

Release checkpoint, September 28, 2026: `canli-validation-mcp@0.9.1` (exact breadth answers)
published from CI: the tag `mcp-v0.9.1` ran `mcp-publish.yml` (run 36394585306) to npm with
provenance and to the official MCP Registry.

Release checkpoint, September 28, 2026: `canli-validation-mcp@0.10.1` (data-snooping tests; missing
values refused instead of read as zero) published from CI on the tag `mcp-v0.10.1`.

Release checkpoint, October 3, 2026: `canli-validation-mcp@0.11.0` (the lab: grid backtests
validated with the number of variants actually run, series summaries, stress tests and broker
feasibility; code-generation resources and prompts) published from CI: the tag `mcp-v0.11.0` ran
`mcp-publish.yml` (run 37140838081) to npm with provenance and to the official MCP Registry, where
0.11.0 is listed as latest.

Release checkpoint, October 4, 2026: `canli-validation-mcp@0.12.0` (audit_backtest opens with a
headline test whose false-positive rate Null Zoo measured before it was chosen, adds fix_next,
counted trials and out-of-sample decay; a smaller default tool list) published from CI: the tag
`mcp-v0.12.0` ran `mcp-publish.yml` (run 37187236871) to npm with provenance and to the official MCP
Registry, where 0.12.0 is listed as latest.

`canli-research-mcp` (the `mcp-research/` directory) publishes from `mcp-research-publish.yml` on a tag
`research-mcp-v<version>`, the same way. Its 0.1.0 was published to npm by hand on September 26, 2026,
to create the package; npm trusted publishing for later versions needs the package's Trusted Publisher
setting on npmjs.com (workflow `mcp-research-publish.yml`, environment `mcp-research-release`).

`canli-fundamentals-mcp` (the `mcp-fundamentals/` directory) publishes from
`mcp-fundamentals-publish.yml` on a tag `fundamentals-mcp-v<version>`, the same way. npm attaches a
trusted publisher only to a package that exists, so its 0.1.0 is published to npm by hand once
(`npm publish --access public` in `mcp-fundamentals/`); then its Trusted Publisher setting on
npmjs.com (workflow `mcp-fundamentals-publish.yml`, environment `mcp-fundamentals-release`) lets the
tag publish every later version, and the `fundamentals-mcp-v0.1.0` tag publishes the registry entry.

`canli-validation-mcp@0.13.0` (check_leakage, placebo_test, leaner listed schemas) was published on
October 4, 2026 from the tag `mcp-v0.13.0`. On October 6, 2026 the owner set up the Trusted
Publisher for `canli-research-mcp` and `canli-fundamentals-mcp`, and the tags `research-mcp-v0.2.0` and
`fundamentals-mcp-v0.5.0` published both to npm with provenance and to the official registry.

`canli-validation-mcp@0.13.1` (MCP SDK 2.3.1; corrected `audit_backtest` description) was published on
October 7, 2026 from the tag `mcp-v0.13.1`.

Next release, not yet published: `canli-validation-mcp@0.14.0`, the trial ledger (opt-in toolset
`ledger`: `ledger_record_trial`, `ledger_summary`, `ledger_export`). It publishes from
`mcp-publish.yml` on the tag `mcp-v0.14.0`.

## Official registry (registry.modelcontextprotocol.io)

The manifest is `mcp/server.json`. Its top-level and npm package versions must match
`mcp/package.json`, and the npm package must include the matching `mcpName`.
The description must fit the registry's 100-character contract checked by tests.

### Prepare and verify the candidate before publication

```bash
cd mcp
npm ci
npm test
npm run test:package
npm audit --audit-level=high
```

The package, lockfile and registry manifest all describe 0.1.2. The package test
installs a local tarball and calls a local HTTP stub; it proves neither publication
nor live API compatibility. Confirm the intended release version is still unused
and review the resulting tarball before the release decision. Publish npm first,
then the matching registry manifest. Authentication and any required 2FA must be
available in the owner's terminal. Do not run `npm version patch` after publishing
and immediately publish a second, unreviewed version.

Authorized npm publication, after those checks:

```bash
npm publish --access public
npm view canli-validation-mcp@0.1.2 version dist.integrity
```

### Steps 1 to 4: install, log in, publish, verify

```bash
# 1. install the CLI (macOS, via Homebrew)
brew install mcp-publisher

# 2. authenticate as the GitHub account that owns the io.github.arhancanli namespace
mcp-publisher login github
# follow the printed device-code flow: open https://github.com/login/device,
# enter the code shown, and authorize

# 3. publish mcp/server.json
cd mcp
mcp-publisher publish

# 4. verify the listing exists
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.arhancanli/canli-validation-mcp"
```

A successful step 4 returns a `servers` array containing an entry named
`io.github.arhancanli/canli-validation-mcp` whose `packages[0].version` matches the npm version
just published.

## Smithery (smithery.ai)

The manifest is `mcp/smithery.yaml`. Two honest caveats before the owner submits.

**It does not need to sit at the repository root.** Smithery's server-repository-connection
settings take a repo owner, repo name, branch and a base directory, so a monorepo entry works by
pointing that base directory at `mcp` rather than moving anything. Steps:

1. Go to smithery.ai/new (the "Add Server" flow) and sign in with GitHub.
2. Connect the repository `https://github.com/arhancanli/canlicapital`.
3. Set the connection's base directory to `mcp`. That is what makes Smithery read
   `mcp/smithery.yaml` and `mcp/package.json` instead of the repo root, which has neither.

**This only reaches Smithery's local/CLI install path, not its hosted Playground.** Smithery
retired hosting a raw stdio process for its interactive Playground and managed HTTP endpoint on
2025-09-07 in favor of Streamable HTTP; only a `runtime: container` deployment speaking HTTP on
the port Smithery injects gets that. `mcp/smithery.yaml` as written describes the stdio
`startCommand` that Smithery's search index and its CLI (`npx -y @smithery/cli install
canli-validation-mcp`) still read and run directly, which is the same command Claude Desktop or
Claude Code runs (see `mcp/README.md`). It will list and install; it will not get a hosted,
click-to-try page. Adding that later means writing a Dockerfile that wraps this same npm binary
with a stdio-to-HTTP bridge (for example `supergateway`) and a second, HTTP-flavored
`startCommand`, which is a separate piece of work from what ships here.

## Glama (glama.ai/mcp/servers)

Glama indexes from a GitHub repository URL, cloning and syncing its git history, and separately
lets an owner claim a listing once it exists.

1. Sign in to glama.ai with GitHub.
2. Choose "Add Server" and submit `https://github.com/arhancanli/canlicapital`. If Glama's crawl
   does not find `mcp/package.json` from the repo root (its monorepo support is not documented
   anywhere this research reached), submit the subdirectory URL instead:
   `https://github.com/arhancanli/canlicapital/tree/main/mcp`.
3. Once the listing appears, open it and choose "Claim ownership," then sign in. If the official
   registry entry above already exists, the GitHub method is the direct path: link the
   `arhancanli` GitHub account and choose "Claim with GitHub." Otherwise, Glama's claim screen
   also offers an HTTP challenge (publish a token it shows at `/.well-known/glama.json` on a
   domain reachable at the connector's origin) or a DNS challenge, for a listing whose namespace
   does not yet map to a GitHub account.
