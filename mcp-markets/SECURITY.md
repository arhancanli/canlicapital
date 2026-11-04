# Security and privacy

## Reporting a vulnerability

Use GitHub private vulnerability reporting on
[arhancanli/canlicapital](https://github.com/arhancanli/canlicapital/security/advisories/new),
not a public issue. Do not include credentials or private data in a report. The current `main`
branch and the latest npm release are supported.

## What the server does on your machine

`npx -y canli-markets-mcp` runs `src/server.mjs` over stdio. It:

- reads its own `package.json`, to report its version, and no other file of yours;
- sends GET requests (and to `api.finra.org` and `api.usaspending.gov`, whose query APIs take their filters only in a request body,
  read-only POST queries), only when a tool is called, and only to these hosts: `www.sec.gov`,
  `data.sec.gov` and `efts.sec.gov` (SEC EDGAR), `home.treasury.gov` (Treasury rates),
  `api.fiscaldata.treasury.gov` (Treasury auctions, the federal debt, the Daily and Monthly Treasury Statements),
  `mba.tuck.dartmouth.edu` (Kenneth French's data library, for `factor_returns`), `www.deribit.com` (Deribit's public
  option data and DVOL, for `crypto_options`), `disclosures-clerk.house.gov` (the House's yearly index of financial
  disclosures and its members' transaction reports, for `congress_trades`), `api.nasdaq.com` (Nasdaq's public
  earnings, dividend and split calendars, for `market_calendar`; its pages on `www.nasdaq.com` are linked, never read),
  `data.epa.gov` (EPA's Envirofacts greenhouse-gas reports, for `company_emissions`; `ghgdata.epa.gov` is linked, never read),
  `api.worldbank.org`
  (World Bank indicators), `sdmx.oecd.org` (OECD Economic Outlook), `api.finra.org` (short interest), `publicreporting.cftc.gov` (Commitments of
  Traders), `fc.yahoo.com` and `finance.yahoo.com` (the free cookie Yahoo Finance's quote summary asks for, and the link to the quote page), `services9.arcgis.com` (the IMF's PortWatch shipping data, described at `portwatch.imf.org`), `wikimedia.org` and `en.wikipedia.org` (page views), `www.federalreserve.gov` (FOMC calendar, statements and projections), `www.bls.gov`, `www.bea.gov` and `www.census.gov` (release schedules), `api.adviserinfo.sec.gov` (investment advisers), `ethereum-rpc.publicnode.com`, `base-rpc.publicnode.com`, `arbitrum-one-rpc.publicnode.com`, `optimism-rpc.publicnode.com`, `polygon-bor-rpc.publicnode.com` and `bsc-rpc.publicnode.com` (public chain reads for `token_check`, which send the contract address asked about; `CANLI_RPC_<CHAIN>` points them at your own node), `sourcify.dev` (whether a contract's source is verified), `api.coingecko.com` (circulating supply estimate), `api.kraken.com` (Kraken's public trade history, for `trade_ticks`), `comtradeapi.un.org` (UN Comtrade's trade statistics and country lists, for `trade_flows`), `www.consumerfinance.gov` (CFPB complaints), `api.fda.gov` and `api.nhtsa.gov` (recalls), `sanctionslistservice.ofac.treas.gov` (the Treasury's sanctions lists, one redirect to its storage host, `*.s3.us-gov-west-1.amazonaws.com`), `www.federalregister.gov`, `api.gleif.org` (the LEI register), `api.openfigi.com` (security identifiers), `data-api.ecb.europa.eu`, `www.bankofengland.co.uk`, `www.mof.go.jp` and `www.bankofcanada.ca` (government yields), `stats.bis.org` (the credit gap), `cdn-api.cboe.com` and `www.cboe.com` (Cboe's delayed option quotes and futures settlements; `CANLI_KEYLESS_OPTIONS=0` turns them off), `fred.stlouisfed.org` (FRED), `alfred.stlouisfed.org` (FRED's past releases, for `economic_series` as_of), `esmis.nal.usda.gov` (the USDA's WASDE reports, for `crop_outlook`), `ticdata.treasury.gov` (the Treasury's table of major foreign holders, for `treasury_holders`), `markets.newyorkfed.org` (New York Fed reference rates), `data-api.ecb.europa.eu` (ECB rates), `www.bankofengland.co.uk` (Bank of England rates), `stats.bis.org` (central banks' policy rates), `api.bcb.gov.br`, `api.beta.ons.gov.uk`, `api.imf.org`, `api.riksbank.se`, `api.scb.se`, `api.statistiken.bundesbank.de`, `apisidra.ibge.gov.br`, `app.norges-bank.no`, `data.api.abs.gov.au`, `data.bis.org`, `data.ecb.europa.eu`, `data.imf.org`, `data.norges-bank.no`, `data.snb.ch`, `data.ssb.no`, `dataexplorer.abs.gov.au`, `ec.europa.eu`, `edge.boi.gov.il`, `ilostat.ilo.org`, `sdmx.ilo.org`, `sidra.ibge.gov.br`, `www.boi.org.il`, `www.bundesbank.de`, `www.ons.gov.uk`, `www.rba.gov.au`, `www.riksbank.se`, `www.ssb.no`, `www.stat-search.boj.or.jp`, `www.statistikdatabasen.scb.se`, `www150.statcan.gc.ca` and `www3.bcb.gov.br` (each country's statistics office and central bank, the IMF, OECD and ILO, for `world_series`), `filings.xbrl.org` (ESEF annual reports), `gamma-api.polymarket.com` and `api.elections.kalshi.com` (prediction market prices), `api.llama.fi` and `stablecoins.llama.fi` (DefiLlama's crypto data), `api.gdeltproject.org` (the GDELT Project's news index, for `news`), `www.okx.com` (perpetual funding rates, for `funding_rates`), `api.usaspending.gov` (federal contracts), `clinicaltrials.gov` (clinical trials), `api.fda.gov` (Drugs@FDA approvals), `api.fdic.gov` (bank call reports and failures) and `cirrun.com` (the Cirrun GPU price index, for `compute_prices`), and, for `price_history` only, `query1.finance.yahoo.com` (Yahoo
  Finance's public chart data) for currencies, futures, indices, crypto and stocks listed abroad,
  and for US stocks unless you set a key, in which case `data.alpaca.markets` or `api.tiingo.com`
  (`CANLI_KEYLESS_PRICES=0` turns Yahoo off). Nothing goes to Canli Capital;
- sends what the tool needs and nothing else: the company, form, dates, search words or series
  asked for. Results link to the publishers' own pages (`www.usaspending.gov`, `banks.data.fdic.gov`, `fiscaldata.treasury.gov`, `data.worldbank.org`, `data-explorer.oecd.org`, `adviserinfo.sec.gov`, `files.adviserinfo.sec.gov`, `reports.adviserinfo.sec.gov`, `polymarket.com`, `www.nyse.com` for `market_hours`, which reads nothing, `www.coingecko.com` for `crypto_markets`, which reads `api.coingecko.com`),
  which the server never requests, nor `www.finra.org`. SEC requests carry a User-Agent naming this package (or `SEC_USER_AGENT`, which SEC
  asks for: your name and email); other hosts get `canli-markets-mcp`;
- keeps SEC requests at most 8 a second (SEC's limit is 10), refuses redirects, gives every
  request a 20 second deadline and discards responses above a size cap;
- keeps responses in memory for 10 minutes, and keeps public SEC, FRED and Treasury responses compressed in
  `~/.cache/canli-markets` (at most 512 MB, oldest out first) so later sessions answer at once. Prices, news and
  anything sent with a key are never written. It writes no other files. The folder shows which companies you looked
  up, on your own machine; `CANLI_DISK_CACHE=0` turns it off and `CANLI_CACHE_DIR` moves it;
- reads `ALPACA_API_KEY_ID`/`ALPACA_API_SECRET_KEY` (or the paper pair `ALPACA_PAPER_KEY_ID`/
  `ALPACA_PAPER_SECRET_KEY`) or `TIINGO_API_KEY` only for `price_history`; keys travel only in
  request headers, never in URLs or error messages;
- sends no telemetry and logs nothing; stdout carries only the MCP protocol.

The published package contains `LICENSE`, `README.md`, `CHANGELOG.md`, `package.json` and `src/`.
Dependencies are pinned to exact versions with a lockfile; there are no install scripts.

## What the data is not

Filings are shown as filed; Canli Capital does not edit or verify them. 13F and Form 4 data have
the gaps their forms have (each result lists them). Nothing here is investment advice.

## Optional local models

`canli-mcp models install` is the only thing that installs them, and no tool does. It runs npm for one pinned package, `@huggingface/transformers`, into its own folder in the cache, and that package fetches two pinned models from `huggingface.co` on first use. Once they are there, text is read on your machine and sent nowhere. Vectors for `filing_memory` are written under the same cache folder, by the disk cache.
