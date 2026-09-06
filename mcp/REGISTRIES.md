# Registry listings for canli-validation-mcp

This file is the exact sequence for the three MCP registries research turned up
(`docs/superpowers/plans/2026-09-06-earned-mentions.md`, section 3). Status on 2026-09-06: the
owner published `canli-validation-mcp@0.1.1` to npm and `mcp-publisher publish` listed
`io.github.arhancanli/canli-validation-mcp` 0.1.1 as active in the official registry (the search
URL in step 4 returns it). Smithery and Glama below have not been submitted. The file exists so
the owner can copy commands rather than re-derive them, and so the honest blockers are written
down before they turn into a confusing CLI error.

## Official registry (registry.modelcontextprotocol.io)

Still explicitly "preview." The manifest for this registry is `mcp/server.json`; the commands
below run from `mcp/`.

### Step 0: the registry will refuse the package until it can verify ownership

The registry checks that the npm package it is pointed at carries a matching `mcpName` field
inside its own `package.json`. The package already published, `canli-validation-mcp@0.1.0`, does
not carry that field, because it did not exist yet when 0.1.0 was published. npm versions are
immutable, so this cannot be patched onto 0.1.0; version 0.1.1 in this repository carries it and
must be published (`npm publish --access public` from mcp/, in a real terminal for the 2FA prompt)
before the registry publish below.

```bash
cd mcp
# package.json already carries "mcpName": "io.github.arhancanli/canli-validation-mcp"
# and version 0.1.1; publish it as canli-validation-mcp@0.1.1 (2FA prompt, so a real terminal):
npm publish --access public
npm version patch
npm publish --access public
```

Until that runs, `mcp-publisher publish` below will fail with "Registry validation failed for
package," not because `server.json` is wrong, but because the npm package it names cannot yet
prove who owns it. After it runs, update the `version` fields in `mcp/server.json` (both the
top-level one and `packages[0].version`) to match the new npm version before publishing.
The registry also caps the top-level `description` at 100 characters (a 422 reading
"expected length <= 100"); the guard test pins that cap and the limits clause it must carry.

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
