# canli-fundamentals-mcp

SEC company fundamentals **point in time**, as an MCP server. For any value a company reported in
XBRL, it tells your AI assistant three things: what was **first reported**, what the **latest**
filing says, and what was **known on a given date**. Every value comes with the filing behind it.

That difference matters. Apple's diluted EPS for fiscal 2018 was 11.91 in the annual reports of
2018 and 2019, and 2.98 in the 2020 report, after its 4-for-1 split. A backtest that reads today's
data for a 2018 decision uses a number nobody saw in 2018. Apple's accounts payable at the end of
fiscal 2017 was first reported as $49.05B and changed to $44.24B a year later. Across Apple's annual
figures, 232 reported periods changed after their first report.

```bash
npx -y canli-fundamentals-mcp
```

Claude Code:

```bash
claude mcp add canli-fundamentals -- npx -y canli-fundamentals-mcp
```

Claude Desktop, Cursor or any MCP client (`mcpServers` in its config):

```json
{
  "mcpServers": {
    "canli-fundamentals": { "command": "npx", "args": ["-y", "canli-fundamentals-mcp"] }
  }
}
```

Then ask things like "What did Apple report as of 31 December 2018?", "Which of Microsoft's annual
numbers were restated?" or "Show every filing that reported Apple's 2017 accounts payable".

## Tools

| Tool | What it returns |
|---|---|
| `known_as_of` | For each concept, the most recent period filed on or before a date and its value as it stood then, flagged if later restated. Defaults to ten common concepts. The point-in-time primitive for backtests. |
| `history` | One concept over time, newest first: `first_reported` (default), `latest`, or `as_of` a date. Annual, quarterly or all periods. |
| `restatements` | Periods whose value changed in a later filing, with first and latest values and the percent change. Scans every concept when none is given. |
| `vintages` | Every filing that reported one period of one concept, oldest first. |
| `list_concepts` | The concepts a company reports, with units, period counts, date range and how many periods changed. |

Companies are named by ticker (`AAPL`) or SEC CIK (`320193`). Concepts are XBRL names (`Revenues`,
`NetIncomeLoss`, `Assets`), us-gaap by default; prefix another taxonomy, for example
`dei:EntityCommonStockSharesOutstanding`. All five tools are read-only.

## Where the numbers come from, and how you can check them

For every company in its reference, [canlicapital.com](https://canlicapital.com/companies) serves
the SEC's XBRL companyfacts response byte for byte, as a gzip snapshot, and names the snapshot's
SHA-256 in the company's record. This server:

1. resolves the ticker from `https://canlicapital.com/api/v1/company-tickers.json`;
2. reads the company record at `/company-data/{CIK}.json`;
3. downloads the snapshot it names and refuses it unless its SHA-256 matches;
4. computes everything else on your machine.

Those GETs are the only network traffic. Each result names the snapshot (its date, hash, URL and the
SEC URL it came from), so you can fetch the same file from the SEC and compare.

How periods are handled:

- A period is its start and end date. A quarter and a year-to-date figure that end on the same day
  are different periods, and values are never merged across them.
- Durations of 350 to 380 days are annual (52- and 53-week years included), 80 to 100 days
  quarterly, and anything else (six- and nine-month year-to-date figures) appears only under
  `periods: "all"`.
- A balance (an instant) takes the kind of the report that first carried it: year-end balances are
  first reported in annual reports, quarter-end balances in 10-Qs.
- `first_reported` is the earliest filing by filed date, then accession number. `as_of` counts only
  filings made on or before the date.

## Limits

- Values are as the SEC's companyfacts API reports them in the snapshot named with each result.
  Filings made after the snapshot date are missing, so check `snapshot.fetched_at`.
- `filed` is the date a filing reached EDGAR. To avoid lookahead, treat a value as known from the
  next trading day after it was filed.
- A changed value can be a restatement, a reclassification or a correction; the accession number
  names the filing to read.
- Coverage is the SEC filers in the Canli company reference (6,415 tickers). A company outside it
  returns an error naming its CIK.
- Company-reported data. Not investment advice.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `CANLI_CACHE_DIR` | `~/.cache/canli-fundamentals` | Where snapshots are cached, named by their SHA-256, so a cached file can never go stale. Set it to an empty value to keep nothing on disk. |
| `CANLI_API_BASE` | `https://canlicapital.com` | The site to read from. |

## Part of the Canli MCP family

- [canli-validation-mcp](https://github.com/arhancanli/canli-validation-mcp): checks whether a
  backtest is real (deflated Sharpe, probability of overfitting, minimum track record).
- [canli-research-mcp](https://github.com/arhancanli/canlicapital/tree/main/mcp-research): Canli
  Capital's open research record.

Code MIT. The SEC filings and XBRL facts are U.S. government works in the public domain; Canli
Capital's selection and derived data are CC BY 4.0 (credit "Canli Capital (canlicapital.com)").
