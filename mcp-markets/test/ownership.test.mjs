// ownership_breadth: filing windows, and counts read from replayed EDGAR full-text search answers.
import assert from "node:assert/strict";
import test from "node:test";

import { filingQuarters, ownershipBreadth } from "../src/breadth.mjs";
import { createSession } from "../src/sources.mjs";
import { replayFetch } from "./replay.mjs";

test("13F filing windows: each calendar quarter of filings reports the quarter before", () => {
  assert.deepEqual(filingQuarters(Date.parse("2026-10-24T00:00:00Z"), 3), [
    { filed_from: "2026-07-01", filed_to: "2026-09-30", holdings_quarter: "2026Q2" },
    { filed_from: "2026-04-01", filed_to: "2026-06-30", holdings_quarter: "2026Q1" },
    { filed_from: "2026-01-01", filed_to: "2026-03-31", holdings_quarter: "2025Q4" },
  ]);
  assert.equal(filingQuarters(Date.parse("2026-02-10T00:00:00Z"), 1)[0].holdings_quarter, "2025Q3");
});

test("counts per quarter and the change, for a CUSIP given", async () => {
  const url = (from, to) => `https://efts.sec.gov/LATEST/search-index?q=%22037833100%22&forms=13F-HR&dateRange=custom&startdt=${from}&enddt=${to}`;
  const hit = (name, cik) => ({ _id: `000000000${cik}-26-000001:infotable.xml`, _source: { display_names: [`${name}  (CIK 000${cik})`], ciks: [`000${cik}`], file_date: "2026-08-14" } });
  const extra = {
    [url("2026-07-01", "2026-09-30")]: { hits: { total: { value: 6776, relation: "eq" }, hits: [hit("BERKSHIRE HATHAWAY INC", 1067983)] } },
    [url("2026-04-01", "2026-06-30")]: { hits: { total: { value: 6652, relation: "eq" }, hits: [] } },
  };
  const s = createSession({ fetchImpl: replayFetch(extra).fetchImpl, env: {}, now: () => Date.parse("2026-10-24T00:00:00Z"), sleep: async () => {} });
  const r = await ownershipBreadth(s, { cusip: "037833100", quarters: 2, holders: 5 });
  assert.deepEqual(r.rows.map((x) => [x[0], x[3]]), [["2026Q2", 6776], ["2026Q1", 6652]]);
  assert.equal(r.change_latest_vs_prior, 0.0186);
  assert.deepEqual(r.holders_sample.rows[0].slice(0, 2), ["BERKSHIRE HATHAWAY INC", 1067983]);
  await assert.rejects(ownershipBreadth(s, {}), /needs company or cusip/);
});

test("the CUSIP from a company's name: abbreviated issuer names match, the check digit is checked, the company's own 13F is skipped, and a CUSIP new in recent quarters is flagged", async () => {
  const { cusipValid, sameIssuer } = await import("../src/breadth.mjs");
  assert.equal(sameIssuer("COSTCO WHSL CORP NEW", "COSTCO WHOLESALE CORP /NEW"), true);
  assert.equal(sameIssuer("JPMORGAN CHASE &amp; CO.", "JPMORGAN CHASE & CO"), true);
  assert.equal(sameIssuer("BANK OF AMER CORP COM", "BANK OF AMERICA CORP /DE/"), true);
  assert.equal(sameIssuer("APPLE HOSPITALITY REIT INC", "Apple Inc."), false);
  assert.equal(sameIssuer("JPMORGAN ACTIVE BOND ETF", "JPMORGAN CHASE & CO"), false);
  assert.deepEqual(["22160K105", "037833100", "02079K305", "037833101", "22160K10X"].map(cusipValid), [true, true, true, false, false]);

  const table = (rows) => `<informationTable>${rows.map(([n, c]) => `<infoTable><nameOfIssuer>${n}</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>${c}</cusip></infoTable>`).join("")}</informationTable>`;
  const hit = (id, name, cik) => ({ _id: id, _source: { display_names: [`${name}  (CIK ${cik})`], ciks: [String(cik)], file_date: "2026-08-14" } });
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    const u = new URL(url);
    if (u.pathname.endsWith("company_tickers.json")) return Response.json({ 0: { cik_str: 909832, ticker: "COST", title: "COSTCO WHOLESALE CORP /NEW" } });
    if (u.hostname === "efts.sec.gov") {
      const q = u.searchParams.get("q");
      if (q === '"COSTCO WHOLESALE"') return Response.json({ hits: { total: { value: 1 }, hits: [hit("0000909832-26-000001:self.xml", "COSTCO WHOLESALE CORP /NEW", 909832)] } });
      if (q === '"COSTCO"') return Response.json({ hits: { total: { value: 3 }, hits: [hit("0000000001-26-000001:old.txt", "OLD FILER", 1), hit("0000000002-26-000001:a.xml", "FUND A", 2), hit("0000000003-26-000001:b.xml", "FUND B", 3)] } });
      if (q === '"22160K105"') return Response.json({ hits: { total: { value: u.searchParams.get("startdt") >= "2026-07-01" ? 40 : 0 }, hits: [] } });
      return Response.json({ hits: { total: { value: 0 }, hits: [] } });
    }
    if (url.includes("/2/")) return new Response(table([["COSTCO WHSL CORP NEW", "22160K105"], ["COSTCO WHSL CORP NEW", "22160K105"], ["COSTCO WHSL CORP NEW", "22160K10X"]]));
    if (url.includes("/3/")) return new Response(table([["COSTCO WHSL CORP NEW", "22160K105"], ["APPLE INC", "037833100"]]));
    return new Response("not here", { status: 404 });
  };
  const s = createSession({ fetchImpl, env: {}, now: () => Date.parse("2026-10-24T00:00:00Z"), sleep: async () => {} });
  const r = await ownershipBreadth(s, { company: "COST", quarters: 2, holders: 0 });
  assert.equal(r.cusip, "22160K105");
  assert.equal(r.other_cusips, undefined, "an invalid check digit is not a second class");
  assert.ok(!urls.some((x) => x.includes("/909832/")), "the company's own 13F is not read");
  assert.ok(!urls.some((x) => x.endsWith("old.txt")), "only XML information tables are read");
  assert.match(r.warning, /No 13F lists 22160K105 before 2026Q2/);
});
