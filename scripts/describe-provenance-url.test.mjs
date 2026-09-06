import test from "node:test";
import assert from "node:assert/strict";

import { describeProvenanceUrl } from "./describe-provenance-url.mjs";

test("Yahoo Finance chart endpoint names the symbol from the path", () => {
  assert.equal(
    describeProvenanceUrl(
      "https://query1.finance.yahoo.com/v8/finance/chart/SPY?period1=993600000&period2=1787356800",
    ),
    "Yahoo Finance chart endpoint for SPY",
  );
});

test("Yahoo Finance chart endpoint without a recognisable symbol still gets a real label", () => {
  assert.equal(
    describeProvenanceUrl("https://query1.finance.yahoo.com/v8/finance/chart/"),
    "Yahoo Finance chart endpoint",
  );
});

test("CFTC public reporting resource names the dataset code", () => {
  assert.equal(
    describeProvenanceUrl("https://publicreporting.cftc.gov/resource/72hh-3qpy.json"),
    "CFTC Disaggregated Futures Only dataset (72hh-3qpy)",
  );
});

test("CFTC historical special announcements page gets its own label", () => {
  assert.equal(
    describeProvenanceUrl(
      "https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalSpecialAnnouncements/index.htm",
    ),
    "CFTC Commitments of Traders special announcements page",
  );
});

test("Sharadar documentation pages are distinguished by path", () => {
  assert.equal(describeProvenanceUrl("https://sharadar.com/docs/actions"), "Sharadar corporate actions documentation");
  assert.equal(describeProvenanceUrl("https://sharadar.com/docs/stocks"), "Sharadar stock price documentation");
});

test("SEC EDGAR filings are named distinctly from the bare domain", () => {
  assert.equal(
    describeProvenanceUrl("https://www.sec.gov/Archives/edgar/data/320193/000032019320000050/a8-k.htm"),
    "SEC EDGAR filing record",
  );
});

test("citation hosts (doi, nber, ssrn, bis) are left alone (return null)", () => {
  assert.equal(describeProvenanceUrl("https://doi.org/10.1111/jofi.12196"), null);
  assert.equal(describeProvenanceUrl("https://www.nber.org/papers/w25201"), null);
  assert.equal(describeProvenanceUrl("https://papers.ssrn.com/sol3/papers.cfm?id=1"), null);
  assert.equal(describeProvenanceUrl("https://www.bis.org/publ/work975.htm"), null);
});

test("a local development URL is named as a route, not leaked as an address", () => {
  assert.equal(
    describeProvenanceUrl("http://127.0.0.1:3000/dashboard"),
    "local development server route (/dashboard)",
  );
});

test("a malformed or non-URL string (a shell command, a path template) is left alone", () => {
  assert.equal(
    describeProvenanceUrl("npx --no-install lighthouse http://127.0.0.1:3000{route} --output=json"),
    null,
  );
});

test("EIA endpoints are distinguished by path rather than collapsing to one generic label", () => {
  assert.equal(
    describeProvenanceUrl("https://www.eia.gov/electricity/gridmonitor/about"),
    "EIA electricity grid monitor documentation",
  );
  assert.equal(describeProvenanceUrl("https://www.eia.gov/opendata/bulk/manifest.txt"), "EIA open data bulk manifest");
  assert.equal(describeProvenanceUrl("https://www.eia.gov/opendata/documentation.php"), "EIA open data API documentation");
  assert.equal(describeProvenanceUrl("https://ir.eia.gov/ngs/ngs.html"), "EIA natural gas storage data page");
});

test("an unrecognised but well-formed provenance host still gets a generic, honest label", () => {
  assert.equal(describeProvenanceUrl("https://api.example-vendor.com/v1/data?x=1"), "api.example-vendor.com record");
});

test("the generic fallback never leaks the query string", () => {
  const label = describeProvenanceUrl("https://api.example-vendor.com/v1/data?token=abc123&x=99999");
  assert.ok(!label.includes("abc123"));
  assert.ok(!label.includes("99999"));
});
