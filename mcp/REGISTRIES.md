# Registry listings for canli-validation-mcp

Release checkpoint, September 20, 2026: `canli-validation-mcp@0.1.2` is published
on npm and is the latest version. The downloaded registry tarball matches the
exact tested release (SHA256 `7975bf2827b5a46cb6593ab2211cf2643c9d3dd4dba3e5bb42bfb1979b95acf0`).
Publication evidence: `artifacts/platform/mcp-publication-20260920.json`.
Official MCP registry publication is also verified:0.1.2 is active and latest
under io.github.arhancanli/canli-validation-mcp. Receipt:
`artifacts/platform/mcp-registry-publication-20260920.json`.
Smithery and Glama publication remain unverified. Do not repeat the npm publication commands below for this version.

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
