// =============================================================================
// CANLI CAPITAL / scripts/describe-provenance-url.mjs
// -----------------------------------------------------------------------------
// Turns a raw provenance URL (a Yahoo Finance chart endpoint, a CFTC dataset
// resource, a Sharadar documentation page, an SEC filing) into descriptive
// prose a reader would actually choose to click, while the exact URL stays in
// the href it links to.
//
// WHY THIS EXISTS. Several generated pages printed these URLs as their own
// visible text: a query string full of timestamps and encoded parameters,
// standing in for a sentence a person could read. The href was correct and
// exact; the label was an accident of "the value happened to be a string that
// starts with http". This function is the one place that turns a URL into a
// name, so every generator that renders provenance gets the same names for
// the same sources rather than inventing its own.
//
// SCOPE, DELIBERATELY NARROW. This only relabels DATA-PROVENANCE endpoints:
// exchange/vendor APIs, regulator datasets and filing archives, government
// statistical releases. Academic citation links (doi.org, nber.org, ssrn.com,
// bis.org and similar) are left alone: showing the reference URL itself is
// the citation convention in a literature review, not an accident.
// =============================================================================

const CITATION_HOSTS = new Set([
  "doi.org",
  "nber.org",
  "users.nber.org",
  "www.nber.org",
  "ssrn.com",
  "papers.ssrn.com",
  "bis.org",
  "www.bis.org",
  "storage.fasb.org",
  "jstor.org",
  "arxiv.org",
]);

function symbolFromYahooPath(pathname) {
  const match = pathname.match(/\/(?:chart|download)\/([A-Z.]+)/i);
  return match ? match[1].toUpperCase() : null;
}

function cftcDatasetCode(pathname) {
  const match = pathname.match(/\/resource\/([a-z0-9]{4}-[a-z0-9]{4})\.json$/i);
  return match ? match[1] : null;
}

/**
 * Return descriptive prose for `url`, or null when the URL is a citation
 * (already correct as its own visible text) rather than a provenance
 * endpoint. The href is never touched; only the label a reader sees changes.
 */
export function describeProvenanceUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null; // not a real URL (a shell command, a path template); leave it as typed.
  }
  const host = parsed.hostname.replace(/^www\./, "");
  if (CITATION_HOSTS.has(host) || CITATION_HOSTS.has(parsed.hostname)) return null;

  if (host === "127.0.0.1" || host === "localhost") {
    return `local development server route (${parsed.pathname || "/"})`;
  }
  if (host === "query1.finance.yahoo.com" || host === "query2.finance.yahoo.com") {
    const symbol = symbolFromYahooPath(parsed.pathname);
    return symbol ? `Yahoo Finance chart endpoint for ${symbol}` : "Yahoo Finance chart endpoint";
  }
  if (host === "publicreporting.cftc.gov") {
    const code = cftcDatasetCode(parsed.pathname);
    return code
      ? `CFTC Disaggregated Futures Only dataset (${code})`
      : "CFTC public reporting dataset";
  }
  if (host === "cftc.gov") {
    if (parsed.pathname.includes("HistoricalSpecialAnnouncements")) {
      return "CFTC Commitments of Traders special announcements page";
    }
    if (parsed.pathname.includes("CommitmentsofTraders")) {
      return "CFTC Commitments of Traders documentation";
    }
    return "CFTC market reports page";
  }
  if (host === "sharadar.com") {
    if (parsed.pathname.includes("/docs/actions")) return "Sharadar corporate actions documentation";
    if (parsed.pathname.includes("/docs/stocks")) return "Sharadar stock price documentation";
    return "Sharadar documentation";
  }
  if (host === "sec.gov") {
    return parsed.pathname.includes("/Archives/edgar/") ? "SEC EDGAR filing record" : "SEC.gov record";
  }
  if (host === "philadelphiafed.org") {
    if (parsed.pathname.toLowerCase().includes("pcpix")) return "Philadelphia Fed real-time core CPI vintage file";
    if (parsed.pathname.toLowerCase().includes("pcpi")) return "Philadelphia Fed real-time CPI vintage file";
    return "Philadelphia Fed real-time data page";
  }
  if (host === "docs.alpaca.markets") return "Alpaca Markets API documentation";
  if (host === "data.alpaca.markets") return "Alpaca Markets corporate actions endpoint";
  if (host === "files.alpaca.markets") return "Alpaca Markets data file";
  if (host === "api.polygon.io") return "Polygon.io API reference";
  if (host === "investor.apple.com") return "Apple investor relations dividend history page";
  if (host === "chartexchange.com") return "ChartExchange market data page";
  if (host === "phemex.com") return "Phemex exchange announcement";
  if (host === "data.nasdaq.com") return "Nasdaq Data Link terms page";
  if (host === "eia.gov" || host === "ir.eia.gov" || host === "api.eia.gov") {
    if (parsed.pathname.includes("/electricity/gridmonitor")) return "EIA electricity grid monitor documentation";
    if (parsed.pathname.includes("/opendata/bulk")) return "EIA open data bulk manifest";
    if (parsed.pathname.includes("/opendata/")) return "EIA open data API documentation";
    if (host === "ir.eia.gov") return "EIA natural gas storage data page";
    return "EIA data page";
  }
  if (host === "federalreserve.gov") return "Federal Reserve research page";
  if (host === "treasury.gov" || host === "fiscaldata.treasury.gov") return "U.S. Treasury data page";
  if (host === "binance.com") return "Binance exchange page";

  // Anything else: an honest, generic label naming the source rather than leaking its query
  // string. Never returns null here, because the alternative is the raw URL as prose.
  return `${host} record`;
}
