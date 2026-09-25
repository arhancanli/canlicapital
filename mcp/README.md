# canli-validation-mcp

An MCP (Model Context Protocol) server over canlicapital.com's free, keyed validation API. It
gives a coding agent nine tools: issue a free key, run the five validators (deflated Sharpe,
CSCV overfitting, paper-evidence conformance, breadth ceiling, minimum track record length),
fetch a stored receipt, read service status, and read a company's reported financial history
from SEC filings. Every tool returns the full API envelope as its result text, success or error,
so the agent cannot see a number without the sentences beside it that say what the number does
not establish.

This package is published to npm as [`canli-validation-mcp`](https://www.npmjs.com/package/canli-validation-mcp).
Also listed on the official MCP Registry (`io.github.arhancanli/canli-validation-mcp`) and
[cursor.directory](https://cursor.directory/plugins/canli-validation-mcp-1). Run it with `npx`, no install step, as shown below. A local checkout is only needed to develop or
test this package itself; see "Local checkout" near the bottom.

This README describes the version in `package.json`. Unversioned `npx` runs npm's latest
release; `npx -y canli-validation-mcp@<version>` pins one.

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
| `validate_track_record` | `POST /api/v1/validate/track-record` | yes |
| `get_receipt` | `GET /api/v1/receipts/{id}` | no |
| `service_status` | `GET /api/v1/validate/status` | no |
| `company_financial_history` | `GET /company-data/{cik}.json` (a ticker resolves through `GET /api/v1/company-tickers.json`) | no |

`validate_deflated_sharpe` accepts exactly one of two input shapes, never a mix of both:

- the seven contract fields: `observed_sharpe_annualized`, `observations`, `periods_per_year`,
  `skew`, `non_excess_kurtosis`, `effective_independent_trials`,
  `cross_trial_sharpe_sd_annualized`;
- or a return series plus the trials behind it: `returns`, `periods_per_year`,
  `effective_independent_trials`, `cross_trial_sharpe_sd_annualized`.

Sending fields from both shapes, or from neither, is rejected before any request leaves the
process; see `src/schemas.mjs`.

`company_financial_history` is different from the other tools: it reads the public company
reference at canlicapital.com, not the validation API. Give it a CIK (1 to 10 digits) to list a
company's available financial histories, or a CIK and a us-gaap concept such as `Revenues` to
get the observations, newest first (`limit` defaults to 40, maximum 200). Every observation
keeps its filing accession, form, filed date and unit, and the result carries the SHA-256 of the
original SEC response and the record's own boundary sentence: these are accounting values as
reported to the SEC, not market prices, returns or a recommendation. Companies and concepts
outside the current release return an error with the available concepts listed.

## Compact context (0.3.0)

An agent pays for every token a tool returns, including whitespace it never reads. Since 0.3.0
every result is minified JSON, and a company history returns its observations as one `columns`
header and one row per observation, with a unit shared by every row stated once. No field is
dropped: every boundary sentence, accession number, form, filed date and source hash is still in
the result, and `columns` + `rows` rebuild each observation exactly.

Measured with `bench/token_cost.py` on live records (tokenizer: tiktoken `o200k_base`; other
tokenizers give different absolute counts), 20 observations each:

| Record | 0.2.0 (indented) | minified | 0.3.0 (minified, columnar) |
| --- | ---: | ---: | ---: |
| Apple, StockholdersEquity | 2,214 | 1,560 (−29.5%) | 1,060 (−52.1%) |
| Microsoft, CashAndCashEquivalentsAtCarryingValue | 2,231 | 1,574 (−29.4%) | 1,065 (−52.3%) |

The validation tools gain the minification only: the live `service_status` envelope measured 593
tokens indented and 475 minified (−19.9%); their boundary sentences are kept word for word. These
are measurements of these results, not a claim about any other server.

**Breaking change from 0.2.0:** `history.observations` is now `{unit?, columns, rows}` instead of
an array of objects.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CANLI_API_BASE` | `https://canlicapital.com` | Where the API lives. Point it at a preview deployment for testing. |
| `CANLI_KEY` | unset | A key already issued from `POST /api/v1/keys`. When set, `get_key` sends no request and reports the key is already configured; every other tool sends it as `Authorization: Bearer <key>`. |
| `CANLI_LOCAL` | unset | `1` or `true` runs the five validators on this machine (private local mode, below): no key, no network, no receipt. |

If `CANLI_KEY` is not set and local mode is off, call `get_key` once per session before the validators. The key it
returns lives only in this process's memory for the life of the session; it is not written to
disk.

HTTP failures and API error envelopes are marked as MCP tool errors while preserving
the complete JSON envelope. A successful validation with a negative verdict remains
a normal result. Requests have a 30-second deadline covering headers and body, reject
redirects, and are never retried automatically. A timeout may occur after the service
has processed a request; check service status before deciding to submit again.
Non-JSON response bodies and raw network errors are omitted from tool errors.

## Install

No install step. `npx` fetches the published package on first run, so every client config below
just spawns `npx -y canli-validation-mcp`. See "Local checkout" near the bottom to develop or test
this package itself instead of running the published one.

## Hosted endpoint (no install)

The same tools are served at `https://canlicapital.com/mcp` over MCP Streamable HTTP, for clients
that connect to a URL instead of spawning a process (Claude.ai connectors, ChatGPT, Cursor's remote
servers). Nothing to install, and no Node.js on your machine.

```bash
claude mcp add --transport http canli https://canlicapital.com/mcp
```

Without a key, requests run under a shared anonymous key, so the daily validation quota is shared
by every hosted caller. For your own quota, issue a free key (see
[/developers](https://canlicapital.com/developers#quickstart)) and send it as a header:

```bash
claude mcp add --transport http canli https://canlicapital.com/mcp --header "Authorization: Bearer $CANLI_KEY"
```

The endpoint is stateless. On it, `get_key` issues nothing and says which key is in use, because a
key issued there would not reach the next request. A malformed Authorization header is refused
rather than replaced with the shared key.

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

## Private local mode

Set `CANLI_LOCAL=1` and the five validators run on your machine: nothing about the series you
submit is sent to canlicapital.com, no key is needed, and no receipt is stored. The computation is
the API's own, shipped byte for byte in `src/local` (a test fails if it drifts), so a local result
equals the hosted one; it names no receipt id because none was made.

```bash
claude mcp add canli-local --env CANLI_LOCAL=1 -- npx -y canli-validation-mcp
```

`get_receipt`, `service_status` and `company_financial_history` still read from canlicapital.com;
they send no series. In the Claude Desktop extension this is the "Private local mode" setting.

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
if (keyResult.isError) throw new Error("Key setup failed; inspect the error privately.");
// The session retains the issued key. Avoid printing its envelope into logs.

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
npm run test:package
```

Runs `node --test` over `test/*.test.mjs`: schema round-trips against the API's own OpenAPI and
manifest examples, one success, error-envelope and quota-429 case per keyed tool (a fake `fetch`
stands in for the network), a check that every tool description carries a limits sentence, a
check that those sentences have not drifted from `api/_lib/limits.js`, a check that no shipped
file contains an em dash, and one test that spawns the actual server binary and performs a real
MCP `tools/list` and `callTool` handshake over stdio against a local HTTP stub, so the wiring is
proven rather than assumed.

`test:package` creates the actual npm tarball, checks its exact file list and license,
installs it in a temporary consumer directory, and runs the stdio test against that
installed entry. Dependency installation contacts npm; tool calls use only the local
HTTP stub. It neither publishes a package nor issues a production API key.

## Dependencies

Only `@modelcontextprotocol/sdk` (pinned exact) and `zod` (pinned exact). No other runtime
dependency is added, and nothing in this package touches the site's root `package.json`,
`.vercelignore`, `api/`, `scripts/`, `js/`, or `public/`.
