// earnings_calendar against real EDGAR responses (scripts/capture-earnings-fixtures.mjs): Apple's
// results 8-Ks with the acceptance times printed on their filing indexes, and a quiet September
// week across the market. The tests' clock is 2026-10-09 12:00 UTC.
import assert from "node:assert/strict";
import test from "node:test";

import { acceptedEastern, earningsCalendar, nextRelease, releasesFrom, timing } from "../src/earnings.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

function session(extra) {
  const r = replayFetch(extra);
  return createSession({ fetchImpl: r.fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
}

test("earnings_calendar: Apple's releases after the close, the quarter each covered, and the next one 52 weeks after last year's", async () => {
  const r = await earningsCalendar(session(), { company: "AAPL" });
  assert.equal(r.company.ticker, "AAPL");
  assert.deepEqual(r.releases.columns, ["date", "weekday", "accepted_et", "timing", "quarter_ended", "accession", "url"]);
  assert.equal(r.releases.rows.length, 8);
  assert.deepEqual(r.releases.rows[0].slice(0, 5), ["2026-07-30", "Thursday", "16:30", "after the close", "2026-06-27"]);
  assert.deepEqual(r.releases.rows.at(-1).slice(0, 5), ["2024-10-31", "Thursday", "16:30", "after the close", "2024-09-28"]);
  assert.equal(r.next.expected, "2026-10-29");
  assert.equal(r.next.weekday, "Thursday");
  assert.equal(r.next.based_on, "2025-10-30");
  assert.equal(r.next.status, "upcoming");
  assert.equal(r.next.last_year_timing, "after the close");
  assert.ok(r.next.window_days >= 3 && r.next.window_days <= 7, `window ${r.next.window_days}`);
});

const WEEK = {
  147: { cik_str: 927653, ticker: "MCK", title: "MCKESSON CORP" }, 253: { cik_str: 1048911, ticker: "FDX", title: "FEDEX CORP" }, 383: { cik_str: 2011641, ticker: "FERG", title: "Ferguson Enterprises Inc. /DE/" },
  572: { cik_str: 940944, ticker: "DRI", title: "DARDEN RESTAURANTS INC" }, 655: { cik_str: 920760, ticker: "LEN", title: "LENNAR CORP /NEW/" }, 683: { cik_str: 40704, ticker: "GIS", title: "GENERAL MILLS INC" },
  879: { cik_str: 7536, ticker: "ARW", title: "ARROW ELECTRONICS, INC." }, 960: { cik_str: 1013237, ticker: "FDS", title: "FACTSET RESEARCH SYSTEMS INC" }, 1404: { cik_str: 1866175, ticker: "CRGY", title: "Crescent Energy Co" },
  1495: { cik_str: 1069878, ticker: "TREX", title: "TREX CO INC" }, 2290: { cik_str: 319654, ticker: "PBT", title: "PERMIAN BASIN ROYALTY TRUST" }, 2321: { cik_str: 1362004, ticker: "ICFI", title: "ICF International, Inc." },
};

test("earnings_calendar: a September week across the market, from the same week last year, marked once reported", async () => {
  const r = await earningsCalendar(session({ "https://www.sec.gov/files/company_tickers.json": WEEK }), { since: "2026-09-14", until: "2026-09-18" });
  assert.equal(r.companies, 38, "every company with a results 8-K in the same week of 2025");
  assert.equal(r.shown, 12, "the listed ones the ticker file names");
  assert.deepEqual(r.columns, ["expected", "company", "ticker", "status", "reported_on", "last_year", "cik"]);
  const by = Object.fromEntries(r.rows.map((x) => [x[2], x]));
  assert.deepEqual(by.LEN.slice(3, 6), ["reported", "2026-09-16", "2025-09-19"]);
  assert.deepEqual(by.GIS.slice(0, 6), ["2026-09-16", "GENERAL MILLS INC", "GIS", "reported", "2026-09-23", "2025-09-17"], "reported a week after the window, within three weeks");
  assert.deepEqual(by.TREX.slice(3, 5), ["reported", "2026-09-02"], "reported early, within three weeks");
  assert.deepEqual(by.FDX.slice(3, 5), ["expected (date passed, not yet filed)", null], "FedEx has filed no results 8-K near its date");
  assert.deepEqual(r.rows.map((x) => x[0]), [...r.rows.map((x) => x[0])].sort(), "in order of expected date");
});

test("acceptance times read from the filing index; before the open, after the close, in between", () => {
  assert.deepEqual(acceptedEastern('<div class="infoHead">Accepted</div>\n<div class="info">2026-07-14 06:30:38</div>'), { date: "2026-07-14", time: "06:30", minutes: 390 });
  assert.equal(acceptedEastern("<html>no accepted time</html>"), null);
  assert.equal(timing(9 * 60 + 29), "before the open");
  assert.equal(timing(9 * 60 + 30), "during market hours");
  assert.equal(timing(16 * 60), "after the close");
  assert.equal(timing(null), null);
});

test("a correction filed within 20 days is the same release; with under a year of history the usual gap is used, and a missed date is late", () => {
  const row = (filingDate, items = "2.02,9.01", form = "8-K") => ({ filingDate, items, form, accessionNumber: `a-${filingDate}`, primaryDocument: "x.htm" });
  const rel = releasesFrom([row("2026-01-28"), row("2026-02-05"), row("2026-04-29"), row("2026-07-29"), row("2026-03-01", "5.02"), row("2026-05-01", "2.02", "8-K/A")]);
  assert.deepEqual(rel.map((r) => r.date), ["2026-01-28", "2026-04-29", "2026-07-29"]);
  assert.deepEqual(rel[0].also, ["a-2026-02-05"]);
  const n = nextRelease(rel, "2026-08-15");
  assert.equal(n.expected, "2026-10-28", "91 days after the last, the median gap");
  assert.equal(n.based_on, null);
  assert.equal(n.status, "upcoming");
  assert.equal(nextRelease(rel, "2026-11-30").status, "late: no release filed yet");
});
