# canli-markets-mcp

Public market data for AI agents, read from the sources themselves: SEC EDGAR, the US Treasury,
FRED, the World Bank and prices for stocks, currencies, futures, indices and crypto, with no key and no account. Every
request goes from your machine straight to the source, and every result names the URL it came
from, so an agent can cite it.

```json
{ "mcpServers": { "canli-markets": { "command": "npx", "args": ["-y", "canli-markets-mcp"] } } }
```

Set `SEC_USER_AGENT` to your name and email (`"Jane Doe jane@example.com"`), as SEC's fair-access
policy asks. Prices need no key: they come from Yahoo Finance's public chart data, which is
unofficial and for personal use under Yahoo's terms. To use your own account instead, set
`ALPACA_API_KEY_ID` and `ALPACA_API_SECRET_KEY` (paper keys work) or `TIINGO_API_KEY`;
`CANLI_KEYLESS_PRICES=0` turns the keyless source off.

## Research across the whole market

Other finance servers answer one company at a time. These answer questions about the market:

| Tool | What it answers | Source |
| --- | --- | --- |
| `screen_companies` | Rank every US-listed company (about 3,800 with FY2025 data) on revenue, growth, margins, ROE, ROA, free cash flow, R&D intensity or leverage, with filters and valuation for the shortlist | SEC XBRL frames, prices |
| `company_report` | Everything about one company in one call: five years of financials, valuation, a year of price and risk, insider buying and selling, recent filings | SEC, prices |
| `event_study` | How the stock reacted to earnings releases, insider purchases or sales, or any dates: abnormal returns against a market model, with a t test across events | SEC filing times, prices |
| `mentions_trend` | How often filings mention a phrase, by month, quarter or year | EDGAR full-text search |

Examples: "Which large companies grew revenue fastest in 2025, and what do they trade at?", "Rank
companies over $50 billion of revenue by R&D intensity", "Does NVIDIA's stock rise after its
earnings releases?", "How fast are filings adopting the phrase 'agentic AI'?".

Figures no real company reports (one 2026 filing tagged $1.157 billion of net income as $1,157
billion) are held out of rankings and listed apart, with the reason.

Every result also carries `evidence`: the documents read, with the SHA-256 of the exact bytes
received and when, so any figure can be checked against the same document later.

## Tools

| Tool | What it answers | Source |
| --- | --- | --- |
| `company_profile` | Who is this company or fund: tickers, industry, fiscal year, latest 10-K/10-Q/8-K/13F | SEC |
| `list_filings` | What has it filed: by form and date, with links | SEC |
| `read_filing` | What does the filing say: one 10-K/10-Q item ("risk factors", "md&a"), an 8-K press release (`EX-99.1`), paged | SEC |
| `search_filings` | Which filings mention a phrase, since 2001 | EDGAR full-text search |
| `company_events` | A company's news from its 8-Ks (earnings, deals, executive changes, restatements, bankruptcies, cyber incidents) in the filing's own words; or one kind of event across the market | Form 8-K |
| `segment_revenue` | Where revenue comes from: by segment (with operating income), product and region, three years, checked against total revenue | 10-K/10-Q XBRL |
| `insider_trades` | Who inside bought or sold, at what price, under a 10b5-1 plan or not | Form 4 |
| `fund_holdings` | What a fund manager holds, its weights, and what it bought and sold last quarter | 13F |
| `large_holders` | Who owns more than 5 percent, passive (13G) or activist (13D, with its stated purpose); or the week's new activist stakes across the market | Schedules 13D and 13G |
| `private_offerings` | Who is raising private money (startups, private equity, hedge and real estate funds): amount sold, investors, exemption, people | Form D |
| `fails_to_deliver` | Shares that failed to settle for a stock over the last month, or the largest fails across the market | SEC fails-to-deliver data |
| `off_exchange_volume` | How much of a stock trades in dark pools and with other off-exchange dealers each week, and where | FINRA OTC transparency |
| `short_interest` | How heavily a stock is shorted (shares short, days to cover, share of shares outstanding), or the market's most shorted | FINRA |
| `futures_positioning` | Who is long and short in a futures market (managed money, dealers, asset managers, leveraged funds) and how crowded | CFTC Commitments of Traders |
| `executive_pay` | What executives are paid against how the company did (reported and actually-paid pay, TSR vs peers), five years; or CEO pay ranked across the market | Proxy pay-versus-performance XBRL |
| `index_constituents` | The members of the S&P 500, Nasdaq 100, Russell 2000 and other indexes, with weights | N-PORT of a tracking ETF |
| `fund_portfolio` | What a mutual fund or ETF holds (VOO, IVV, AGG): every position, exposures, a bond fund's coupon and maturity, monthly returns and money in and out | Form N-PORT |
| `fomc` | The Fed's decisions for a year (action, target range, vote and dissenters), the latest statement and the dot-plot medians | Federal Reserve |
| `treasury_yields` | The Treasury curve (nominal, real, bills) for a day or a range | US Treasury |
| `economic_series` | Any FRED series by id or words ("core inflation"), as levels, changes or year-over-year | FRED |
| `price_history` | Daily to monthly bars for stocks in the US and abroad, currencies, futures, indices and crypto, adjusted, with dividends and splits, as columns | Yahoo Finance (no key), or Alpaca or Tiingo (your key) for US stocks |
| `treasury_auctions` | How each Treasury auction went (yield, bid-to-cover, who bought) and which auctions come next | US Treasury Fiscal Data |
| `federal_debt` | The US debt each business day, and the average rate the Treasury pays on it | US Treasury Fiscal Data |
| `world_economy` | Any country's economy: GDP and growth, inflation, unemployment, debt, deficits, trade, reserves, for 200+ countries and regions | World Bank (CC BY 4.0) |

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
- Keyless prices are Yahoo Finance's unofficial chart data, for personal use; they can change or
  stop without notice. Alpaca's free IEX feed reports IEX volume only.
- Not investment advice.

See [SECURITY.md](SECURITY.md) for exactly what is sent where.
