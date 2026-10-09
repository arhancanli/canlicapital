# canli-markets-mcp

Public market data for AI agents, read from the sources themselves: SEC EDGAR, the US Treasury and
FRED, with no key and no account. Prices come from your own free Alpaca or Tiingo key. Every
request goes from your machine straight to the source, and every result names the URL it came
from, so an agent can cite it.

```json
{ "mcpServers": { "canli-markets": { "command": "npx", "args": ["-y", "canli-markets-mcp"] } } }
```

Set `SEC_USER_AGENT` to your name and email (`"Jane Doe jane@example.com"`), as SEC's fair-access
policy asks. For prices, set `ALPACA_API_KEY_ID` and `ALPACA_API_SECRET_KEY` (paper keys work) or
`TIINGO_API_KEY`.

## Tools

| Tool | What it answers | Source |
| --- | --- | --- |
| `company_profile` | Who is this company or fund: tickers, industry, fiscal year, latest 10-K/10-Q/8-K/13F | SEC |
| `list_filings` | What has it filed: by form and date, with links | SEC |
| `read_filing` | What does the filing say: one 10-K/10-Q item ("risk factors", "md&a"), an 8-K press release (`EX-99.1`), paged | SEC |
| `search_filings` | Which filings mention a phrase, since 2001 | EDGAR full-text search |
| `insider_trades` | Who inside bought or sold, at what price, under a 10b5-1 plan or not | Form 4 |
| `fund_holdings` | What a fund holds, its weights, and what it bought and sold last quarter | 13F |
| `treasury_yields` | The Treasury curve (nominal, real, bills) for a day or a range | US Treasury |
| `economic_series` | Any FRED series by id or words ("core inflation"), as levels, changes or year-over-year | FRED |
| `price_history` | Daily to monthly bars, adjusted, as columns | Alpaca or Tiingo (your key) |

Examples an agent can now answer in one or two calls: "What are the new risk factors in Nvidia's
latest 10-K?", "Did any Tesla insider buy shares on the open market this year?", "What did
Berkshire Hathaway sell last quarter?", "Where is the 2s10s spread today?", "What is core PCE
inflation year over year?".

Results are columns and rows, so a series feeds straight into analysis: with
[canli-mcp](https://www.npmjs.com/package/canli-mcp), `economic_series` or `price_history` output
goes into any of its 235 quant tools in the same batch.

## Checked against the source

The tests replay real SEC, Treasury and FRED responses and check values read off the documents:
Berkshire Hathaway's 13F for the quarter ending 30 June 2026 totals $299,253,556,246 over 89
entries, exactly the figures on its cover page; Apple's 10-K risk factors come back as Item 1A
alone; a Tesla Form 4 sale reads 2,605.75 shares at $360.134.

## Limits

- Filings are shown as filed; nothing is edited or verified.
- Form 4 is due two business days after a trade; Form 5 filings are not read.
- A 13F lists long US-listed equity and option positions at quarter end, filed up to 45 days
  later; it omits shorts, cash and confidential positions. Amendments are not merged.
- FRED revises recent values of many series; some series are copyrighted by their sources.
- Alpaca's free IEX feed reports IEX volume only.
- Not investment advice.

See [SECURITY.md](SECURITY.md) for exactly what is sent where.
