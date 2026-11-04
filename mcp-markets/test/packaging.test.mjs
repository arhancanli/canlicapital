// What ships: pinned dependencies, no install scripts, versions in step, and only the hosts
// SECURITY.md names.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8"));
const server = JSON.parse(readFileSync(new URL("server.json", ROOT), "utf8"));

test("pinned dependencies and no lifecycle scripts", () => {
  for (const v of Object.values(pkg.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/);
  for (const hook of ["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly", "prepack", "postpack"]) assert.equal(pkg.scripts?.[hook], undefined, hook);
});

test("package.json, server.json and the changelog agree on the version", () => {
  assert.equal(server.version, pkg.version);
  assert.equal(server.packages[0].version, pkg.version);
  assert.equal(server.packages[0].identifier, pkg.name);
  assert.equal(server.name, pkg.mcpName);
  assert.ok(server.description.length <= 100);
  assert.ok(readFileSync(new URL("CHANGELOG.md", ROOT), "utf8").split("\n").includes(`## ${pkg.version}`), "CHANGELOG.md has a heading for the version");
});

test("the code reaches only the hosts SECURITY.md lists", () => {
  const allowed = ["api.kraken.com", "comtradeapi.un.org", "fc.yahoo.com", "finance.yahoo.com", "services9.arcgis.com", "portwatch.imf.org", "wikimedia.org", "en.wikipedia.org", "ethereum-rpc.publicnode.com", "base-rpc.publicnode.com", "arbitrum-one-rpc.publicnode.com", "optimism-rpc.publicnode.com", "polygon-bor-rpc.publicnode.com", "bsc-rpc.publicnode.com", "sourcify.dev", "api.coingecko.com", "www.consumerfinance.gov", "api.nhtsa.gov", "sanctionslistservice.ofac.treas.gov", "www.federalregister.gov", "api.gleif.org", "api.openfigi.com", "data-api.ecb.europa.eu", "www.bankofengland.co.uk", "www.mof.go.jp", "www.bankofcanada.ca", "stats.bis.org", "api.usaspending.gov", "www.usaspending.gov", "clinicaltrials.gov", "api.fda.gov", "api.fdic.gov", "banks.data.fdic.gov", "www.sec.gov", "data.sec.gov", "efts.sec.gov", "home.treasury.gov", "fred.stlouisfed.org", "alfred.stlouisfed.org", "esmis.nal.usda.gov", "ticdata.treasury.gov", "ir.eia.gov", "www.eia.gov", "www.clevelandfed.org", "raw.githubusercontent.com", "files.zillowstatic.com", "econdata.s3-us-west-2.amazonaws.com", "www.ssga.com", "www.atlantafed.org", "data.alpaca.markets", "api.tiingo.com", "query1.finance.yahoo.com", "api.fiscaldata.treasury.gov", "fiscaldata.treasury.gov", "api.worldbank.org", "data.worldbank.org", "sdmx.oecd.org", "data-explorer.oecd.org", "api.finra.org", "www.finra.org", "publicreporting.cftc.gov", "www.federalreserve.gov", "www.bls.gov", "www.bea.gov", "www.census.gov", "api.adviserinfo.sec.gov", "cdn-api.cboe.com", "www.cboe.com", "adviserinfo.sec.gov", "files.adviserinfo.sec.gov", "reports.adviserinfo.sec.gov", "canlicapital.com", "static.modelcontextprotocol.io", "markets.newyorkfed.org", "data-api.ecb.europa.eu", "www.bankofengland.co.uk", "stats.bis.org", "filings.xbrl.org", "gamma-api.polymarket.com", "polymarket.com", "api.elections.kalshi.com", "api.llama.fi", "stablecoins.llama.fi", "api.gdeltproject.org", "www.okx.com", "cirrun.com", "mba.tuck.dartmouth.edu", "www.deribit.com", "www.nyse.com", "disclosures-clerk.house.gov", "api.nasdaq.com", "www.nasdaq.com", "www.coingecko.com", "data.epa.gov", "ghgdata.epa.gov", "api.bcb.gov.br", "api.beta.ons.gov.uk", "api.imf.org", "api.riksbank.se", "api.scb.se", "api.statistiken.bundesbank.de", "apisidra.ibge.gov.br", "app.norges-bank.no", "data.api.abs.gov.au", "data.bis.org", "data.ecb.europa.eu", "data.imf.org", "data.norges-bank.no", "data.snb.ch", "data.ssb.no", "dataexplorer.abs.gov.au", "ec.europa.eu", "edge.boi.gov.il", "ilostat.ilo.org", "sdmx.ilo.org", "sidra.ibge.gov.br", "www.boi.org.il", "www.bundesbank.de", "www.ons.gov.uk", "www.rba.gov.au", "www.riksbank.se", "www.ssb.no", "www.stat-search.boj.or.jp", "www.statistikdatabasen.scb.se", "www150.statcan.gc.ca", "www3.bcb.gov.br"];
  const security = readFileSync(new URL("SECURITY.md", ROOT), "utf8");
  for (const f of readdirSync(new URL("src/", ROOT))) {
    const text = readFileSync(new URL(`src/${f}`, ROOT), "utf8");
    for (const m of text.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]+)/g)) {
      assert.ok(allowed.includes(m[1]), `${f} reaches ${m[1]}`);
      if (m[1] !== "canlicapital.com") assert.ok(security.includes(m[1]), `SECURITY.md does not name ${m[1]}`);
    }
    // Only the disk cache writes files, and only in its own folder.
    assert.doesNotMatch(text, f === "disk-cache.mjs" ? /child_process|\beval\s*\(|new Function|console\.log/ : /writeFile|appendFile|createWriteStream|child_process|\beval\s*\(|new Function|console\.log/, f);
  }
});
