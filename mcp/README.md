# canli-validation-mcp

An MCP (Model Context Protocol) server over canlicapital.com's free, keyed validation API. It
gives a coding agent seven tools: issue a free key, run the four validators (deflated Sharpe,
CSCV overfitting, paper-evidence conformance, breadth ceiling), fetch a stored receipt, and read
service status. Every tool returns the full API envelope as its result text, success or error,
so the agent cannot see a number without the sentences beside it that say what the number does
not establish.

This package is published to npm as [`canli-validation-mcp`](https://www.npmjs.com/package/canli-validation-mcp).
Run it with `npx`, no install step, as shown below. A local checkout is only needed to develop or
test this package itself; see "Local checkout" near the bottom.

## What the API is (and is not)

The engine is the product. The service runs your submitted numbers through the same honesty
arithmetic canlicapital.com's own paper record runs on itself and hands back a verdict anyone can
recompute from the receipt. It does not accept market data, does not sign receipts, does not
grade a strategy, and never saw your data source, its costs, or any lookahead in how a series was
built. See `docs/superpowers/specs/2026-09-05-developer-key-validation-api-design.md` in the main
repository for the full design.

## Tools

| Tool | Calls | Key required |
|---|---|---|
| `get_key` | `POST /api/v1/keys` | no |
| `validate_deflated_sharpe` | `POST /api/v1/validate/deflated-sharpe` | yes |
| `validate_overfitting` | `POST /api/v1/validate/overfitting` | yes |
| `validate_paper_evidence` | `POST /api/v1/validate/paper-evidence` | yes |
| `validate_breadth` | `POST /api/v1/validate/breadth` | yes |
| `get_receipt` | `GET /api/v1/receipts/{id}` | no |
| `service_status` | `GET /api/v1/validate/status` | no |

`validate_deflated_sharpe` accepts exactly one of two input shapes, never a mix of both:

- the seven contract fields: `observed_sharpe_annualized`, `observations`, `periods_per_year`,
  `skew`, `non_excess_kurtosis`, `effective_independent_trials`,
  `cross_trial_sharpe_sd_annualized`;
- or a return series plus the trials behind it: `returns`, `periods_per_year`,
  `effective_independent_trials`, `cross_trial_sharpe_sd_annualized`.

Sending fields from both shapes, or from neither, is rejected before any request leaves the
process; see `src/schemas.mjs`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CANLI_API_BASE` | `https://canlicapital.com` | Where the API lives. Point it at a preview deployment for testing. |
| `CANLI_KEY` | unset | A key already issued from `POST /api/v1/keys`. When set, `get_key` sends no request and reports the key is already configured; every other tool sends it as `Authorization: Bearer <key>`. |

If `CANLI_KEY` is not set, call `get_key` once per session before the four validators. The key it
returns lives only in this process's memory for the life of the session; it is not written to
disk.

## Install

No install step. `npx` fetches the published package on first run, so every client config below
just spawns `npx -y canli-validation-mcp`. See "Local checkout" near the bottom to develop or test
this package itself instead of running the published one.

## Claude Desktop

Add to `claude_desktop_config.json` (Settings, Developer, Edit Config):

```json
{
  "mcpServers": {
    "canli": {
      "command": "npx",
      "args": ["-y", "canli-validation-mcp"]
    }
  }
}
```

Restart Claude Desktop afterward. Add an `"env"` object with `CANLI_API_BASE` to point this at a
preview deployment instead of the default.

## Claude Code

```bash
claude mcp add canli -- npx -y canli-validation-mcp
```

Run `claude mcp list` to confirm it is registered, and `claude mcp remove canli` to remove it.

## Generic stdio client

Any MCP client that can spawn a process and speak stdio will work. Using the official SDK
directly, from Node:

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "canli-validation-mcp"],
  env: { ...process.env, CANLI_API_BASE: "https://canlicapital.com" },
});

const client = new Client({ name: "my-agent", version: "0.1.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(tools.map((t) => t.name));

const keyResult = await client.callTool({ name: "get_key", arguments: { label: "my-agent" } });
console.log(keyResult.content[0].text); // the full envelope, key included

const result = await client.callTool({
  name: "validate_deflated_sharpe",
  arguments: {
    returns: [0.004, -0.002, 0.007, 0.001, -0.003, 0.005, 0.002, -0.001],
    periods_per_year: 252,
    effective_independent_trials: 30,
    cross_trial_sharpe_sd_annualized: 0.5,
  },
});
console.log(result.content[0].text); // the full envelope, including limits and receipt.url

await client.close();
```

## What a result does not establish (boundary language)

Every envelope this server returns carries these sentences, verbatim, from the API itself
(`api/_lib/limits.js`):

- This verdict is about the series exactly as submitted. The service never saw the data source,
  its costs, survivorship, or any lookahead in how the series was built.
- A deflated Sharpe or overfitting probability above or below any threshold is not admission to
  anything and is not a forecast.
- The receipt is content-hashed and reproducible from the open-source core it names. It is not
  signed.
- Quotas: 1000 validations per key per UTC day, 5 keys per client per UTC day, 1048576 bytes per
  request, 20000 observations per series, 200 variants per matrix.

Each tool's description also states one of these sentences, so an agent sees the boundary before
it calls the tool, not only after. No tool in this server strips `limits` or `receipt.url` from
a response; the full envelope is always the result text.

## Local checkout

Only needed to develop or test this package itself, not to run the published one.

```bash
cd mcp
npm ci
node src/server.mjs
```

Point a client at the checkout instead of npm by spawning `node /absolute/path/to/meridian/mcp/src/server.mjs`
in place of `npx -y canli-validation-mcp` in any config above.

## Testing

```bash
npm test
```

Runs `node --test` over `test/*.test.mjs`: schema round-trips against the API's own OpenAPI and
manifest examples, one success, error-envelope and quota-429 case per keyed tool (a fake `fetch`
stands in for the network), a check that every tool description carries a limits sentence, a
check that those sentences have not drifted from `api/_lib/limits.js`, a check that no shipped
file contains an em dash, and one test that spawns the actual server binary and performs a real
MCP `tools/list` and `callTool` handshake over stdio against a local HTTP stub, so the wiring is
proven rather than assumed.

## Dependencies

Only `@modelcontextprotocol/sdk` (pinned exact) and `zod` (pinned exact). No other runtime
dependency is added, and nothing in this package touches the site's root `package.json`,
`.vercelignore`, `api/`, `scripts/`, `js/`, or `public/`.
