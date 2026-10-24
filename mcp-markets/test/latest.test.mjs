// latest_filings against a captured page of EDGAR's latest-filings feed (100 8-Ks, accepted
// 2026-10-22 17:20 to 2026-10-23 14:09 Eastern).
import assert from "node:assert/strict";
import test from "node:test";

import { latestFilings, parseEntry, sinceMs } from "../src/latest.mjs";
import { createSession, NotFound } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// The second page stands for the end of the feed.
const PAGE2 = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&start=100&count=100&output=atom";
const session = () => createSession({ fetchImpl: replayFetch({ [PAGE2]: "<feed></feed>" }).fetchImpl, now: () => NOW, env: {} });
const byCol = (r) => r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));

test("an 8-K entry gives its form, filer, CIK, role, accession, items and link", () => {
  const e = parseEntry(`<title>8-K - Oak Valley Bancorp (0001431567) (Filer)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1431567/000143774926033387/0001437749-26-033387-index.htm"/>
<summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2026-10-23 &lt;b&gt;AccNo:&lt;/b&gt; 0001437749-26-033387 &lt;b&gt;Size:&lt;/b&gt; 523 KB
&lt;br&gt;Item 2.02: Results of Operations and Financial Condition
&lt;br&gt;Item 9.01: Financial Statements and Exhibits</summary>
<updated>2026-10-23T14:09:31-04:00</updated>`);
  assert.deepEqual(e, { accepted: "2026-10-23T14:09:31-04:00", form: "8-K", company: "Oak Valley Bancorp", cik: "0001431567", role: "Filer", accession: "0001437749-26-033387",
    items: ["2.02", "9.01"], url: "https://www.sec.gov/Archives/edgar/data/1431567/000143774926033387/0001437749-26-033387-index.htm" });
});

test("8-Ks by event, newest first, with the item names; a since time cuts older ones", async () => {
  const r = await latestFilings(session(), { forms: ["8-K"], event: "earnings", limit: 200 });
  const rows = byCol(r);
  assert.equal(rows.length, 30);
  assert.ok(rows.every((x) => x.items.includes("2.02") && x.events.includes("earnings")));
  assert.ok(rows.every((x, i) => i === 0 || Date.parse(rows[i - 1].accepted) >= Date.parse(x.accepted)), "newest first");
  assert.equal(rows[0].company, "Oak Valley Bancorp");
  const late = byCol(await latestFilings(session(), { forms: ["8-K"], since: "2026-10-23T09:00:00-04:00", limit: 200 }));
  assert.ok(late.length > 0 && late.every((x) => Date.parse(x.accepted) >= Date.parse("2026-10-23T13:00:00Z")));
  assert.ok(late.length < 100);
  const all = await latestFilings(session(), { forms: ["8-K"], limit: 200 });
  assert.match(all.note, /holds only about the last few business days/, "a feed that ends says so");
  assert.equal(all.feed_reaches_back_to, "2026-10-22T21:20:15.000Z");
});

test("words in the filer's name filter; nothing found says how far the feed reaches", async () => {
  const r = byCol(await latestFilings(session(), { forms: ["8-K"], company: "oak valley" }));
  assert.deepEqual(r.map((x) => x.cik), ["0001431567"]);
  await assert.rejects(latestFilings(session(), { forms: ["8-K"], company: "no such filer anywhere" }), (e) => e instanceof NotFound && /last few business days/.test(e.message));
  await assert.rejects(latestFilings(session(), { forms: ["8-K; DROP"] }), /a form type/);
});

test("a date alone is midnight in New York, with daylight saving from the time-zone database", () => {
  assert.equal(new Date(sinceMs("2026-10-23")).toISOString(), "2026-10-23T04:00:00.000Z");
  assert.equal(new Date(sinceMs("2026-11-03")).toISOString(), "2026-11-03T05:00:00.000Z");
  assert.equal(new Date(sinceMs("2026-10-23T14:00")).toISOString(), "2026-10-23T18:00:00.000Z");
  assert.equal(sinceMs("2026-10-23T14:00:00Z"), Date.parse("2026-10-23T14:00:00Z"));
});
