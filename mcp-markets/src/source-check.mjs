// source_check: whether the documents behind an answer are still the bytes it was read from. Every answer this
// pack gives names its documents (evidence: the URL, the first 16 hex digits of the SHA-256 of the exact text
// received, and when), and canli-mcp's receipts carry them. This reads each one again, past every cache, and
// says which are the same, which changed since, and which could not be read. Only documents from the sources
// this pack reads are fetched, so it never becomes a way to reach any address.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { z } from "zod";

import { getText } from "./sources.mjs";

// The hosts this pack reads (test/source-check.test.mjs checks every address in src/ is here), and the Canli
// reference's snapshots, which canli-mcp's receipts name too.
export const HOSTS = new Set([
  "www.sec.gov", "data.sec.gov", "efts.sec.gov", "adviserinfo.sec.gov", "reports.adviserinfo.sec.gov", "files.adviserinfo.sec.gov", "api.adviserinfo.sec.gov",
  "query1.finance.yahoo.com", "finance.yahoo.com", "fc.yahoo.com", "api.llama.fi", "stablecoins.llama.fi", "www.cboe.com", "cdn-api.cboe.com",
  "data-api.ecb.europa.eu", "www.finra.org", "api.finra.org", "fred.stlouisfed.org", "alfred.stlouisfed.org", "esmis.nal.usda.gov", "ticdata.treasury.gov", "ir.eia.gov", "www.eia.gov", "www.clevelandfed.org", "raw.githubusercontent.com", "files.zillowstatic.com", "econdata.s3-us-west-2.amazonaws.com", "www.ssga.com", "www.federalreserve.gov", "markets.newyorkfed.org",
  "www.bankofengland.co.uk", "www.bankofcanada.ca", "www.mof.go.jp", "stats.bis.org", "sdmx.oecd.org", "data-explorer.oecd.org",
  "sanctionslistservice.ofac.treas.gov", "home.treasury.gov", "fiscaldata.treasury.gov", "api.fiscaldata.treasury.gov", "publicreporting.cftc.gov",
  "en.wikipedia.org", "wikimedia.org", "data.alpaca.markets", "clinicaltrials.gov", "api.fda.gov", "api.nhtsa.gov", "www.usaspending.gov", "api.usaspending.gov",
  "www.federalregister.gov", "www.consumerfinance.gov", "www.census.gov", "www.bls.gov", "www.bea.gov", "data.worldbank.org", "api.worldbank.org",
  "banks.data.fdic.gov", "api.fdic.gov", "api.gleif.org", "api.openfigi.com", "api.gdeltproject.org", "api.coingecko.com", "api.kraken.com", "comtradeapi.un.org", "www.okx.com",
  "polymarket.com", "gamma-api.polymarket.com", "api.elections.kalshi.com", "portwatch.imf.org", "services9.arcgis.com", "filings.xbrl.org", "sourcify.dev",
  "api.tiingo.com", "cirrun.com", "canlicapital.com", "mba.tuck.dartmouth.edu", "www.deribit.com", "www.nyse.com", "disclosures-clerk.house.gov", "api.nasdaq.com", "www.nasdaq.com", "www.coingecko.com", "data.epa.gov", "ghgdata.epa.gov",
  "api.bcb.gov.br", "api.beta.ons.gov.uk", "api.imf.org", "api.riksbank.se", "api.scb.se", "api.statistiken.bundesbank.de", "apisidra.ibge.gov.br", "app.norges-bank.no", "data.api.abs.gov.au", "data.bis.org", "data.ecb.europa.eu", "data.imf.org", "data.norges-bank.no", "data.snb.ch", "data.ssb.no", "dataexplorer.abs.gov.au", "ec.europa.eu", "edge.boi.gov.il", "ilostat.ilo.org", "sdmx.ilo.org", "sidra.ibge.gov.br", "www.boi.org.il", "www.bundesbank.de", "www.ons.gov.uk", "www.rba.gov.au", "www.riksbank.se", "www.ssb.no", "www.stat-search.boj.or.jp", "www.statistikdatabasen.scb.se", "www150.statcan.gc.ca", "www3.bcb.gov.br",
]);
// An address that carries a key is the caller's, not a document's; it is never fetched.
const KEYED = /[?&](api_?key|apikey|token|key|access_token|secret)=/i;

export const sourceCheckInput = z.object({
  sources: z.array(z.object({
    url: z.string().max(2000).describe("The document's address, as the evidence or the receipt gives it."),
    sha256_16: z.string().regex(/^[0-9a-f]{16}$/).optional().describe("The first 16 hex digits recorded."),
    sha256: z.string().regex(/^[0-9a-f]{64}$/).optional().describe("The whole SHA-256 recorded."),
    retrieved_at: z.string().max(40).optional(),
  }).strict()).min(1).max(25).describe("The documents to check: evidence rows, or a receipt's sources."),
}).strict();

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function readAgain(session, url) {
  // A Canli reference snapshot is gzipped JSON, recorded by the hash of the JSON inside.
  if (/^https:\/\/canlicapital\.com\/company-data\/sources\/[0-9a-f]{64}\.json\.gz$/.test(url)) {
    const res = await session.fetchImpl(url, { signal: AbortSignal.timeout(30000), redirect: "error" });
    if (!res.ok) throw new Error(`returned HTTP ${res.status}`);
    return sha(gunzipSync(Buffer.from(await res.arrayBuffer()), { maxOutputLength: 512 * 1024 * 1024 }));
  }
  return sha(await getText(session, url, { fresh: true, maxBytes: 64 * 1024 * 1024 }));
}

export async function sourceCheck(session, args) {
  const a = sourceCheckInput.parse(args);
  const checkedAt = new Date(session.now()).toISOString();
  const rows = [];
  for (const src of a.sources) {
    const recorded = src.sha256 ?? src.sha256_16 ?? null;
    let host = null;
    try { const u = new URL(src.url); host = u.protocol === "https:" ? u.hostname : null; } catch { /* not an address */ }
    const say = (status, now = null) => rows.push([src.url, recorded ? recorded.slice(0, 16) : null, now, status, src.retrieved_at ?? null]);
    if (!host) { say("not checked: not an https address (a query sent as a POST body is named, not fetched)"); continue; }
    if (!HOSTS.has(host)) { say(`not checked: ${host} is not a source this server reads`); continue; }
    if (KEYED.test(src.url)) { say("not checked: the address carries a key"); continue; }
    if (!recorded) { say("not checked: no hash was recorded to compare with"); continue; }
    try {
      const now = await readAgain(session, src.url);
      say(now.startsWith(recorded) ? "same" : "changed", now.slice(0, 16));
    } catch (e) {
      say(`unreachable: ${String(e?.message ?? e).slice(0, 160)}`);
    }
  }
  const count = (s) => rows.filter((r) => r[3] === s).length;
  const changed = count("changed"), same = count("same");
  return {
    checked_at: checkedAt,
    same,
    changed,
    not_checked: rows.length - same - changed,
    columns: ["url", "recorded_sha256_16", "now_sha256_16", "status", "retrieved_at"],
    rows,
    reading: changed ? `${changed} of the documents changed since they were read: an answer built on them may no longer hold. Ask again to read them as they are now.` : same === rows.length ? "Every document is the same as when it was read." : `${same} the same, none changed, ${rows.length - same} not checked.`,
    limits: [
      "A document that changes by itself (a live price page, a feed, a list of the latest filings) reads as changed on every check; a filing in EDGAR's archive does not change.",
      "It compares the whole text, so a change anywhere counts, not only in the figures an answer used.",
    ],
  };
}
