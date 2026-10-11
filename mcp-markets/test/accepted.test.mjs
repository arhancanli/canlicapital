// When EDGAR accepted a filing. The submissions files' acceptanceDateTime is right in some files and
// shifted by one US Eastern offset in others (measured 2026-10-11; see acceptanceTimes in
// src/sources.mjs). The times below are real: Apple's director Form 4s of 2026-02-26 read 04:34:19Z in
// Apple's file and 23:34:19Z in the director's own; the index page says 18:34:19 Eastern.
import assert from "node:assert/strict";
import test from "node:test";

import { sessionAfter } from "../src/research.mjs";
import { acceptanceTimes, acceptedOnIndex, createSession, easternToMs, fileShift, unshift } from "../src/sources.mjs";
import { NOW } from "./replay.mjs";

const at = (iso) => Date.parse(iso);

test("Eastern wall-clock times, in daylight and standard time", () => {
  assert.equal(easternToMs("2026-07-14 06:30:38"), at("2026-07-14T10:30:38Z"));
  assert.equal(easternToMs("2026-02-26 18:34:19"), at("2026-02-26T23:34:19Z"));
  assert.equal(acceptedOnIndex('<div class="infoHead">Accepted</div>\n<div class="info">2026-02-26 18:34:19</div>'), "2026-02-26 18:34:19");
  assert.equal(acceptedOnIndex("<html>none</html>"), null);
});

test("a file's error is -1, 0 or +1 Eastern offset, and is undone", () => {
  const truth = at("2026-02-26T23:34:19Z");
  assert.equal(fileShift(at("2026-02-27T04:34:19Z"), truth), 1, "Apple's file");
  assert.equal(fileShift(at("2026-02-26T23:34:19Z"), truth), 0, "the director's file");
  assert.equal(fileShift(at("2026-02-26T18:34:19Z"), truth), -1, "Eastern time labelled UTC");
  assert.ok(Number.isNaN(fileShift(at("2026-02-27T02:34:19Z"), truth)));
  assert.equal(unshift(at("2026-02-27T04:34:19Z"), 1), truth);
  assert.equal(unshift(at("2026-07-14T14:30:38Z"), 1), at("2026-07-14T10:30:38Z"), "JPMorgan's 06:30 ET results 8-K");
  assert.equal(unshift(at("2026-07-14T06:30:38Z"), -1), at("2026-07-14T10:30:38Z"));
});

test("the shift moves day 0: a Form 4 accepted at 13:05 ET reads as after the close", () => {
  const days = ["2026-07-14", "2026-07-15"];
  assert.equal(sessionAfter("2026-07-14T21:05:00.000Z", days), "2026-07-15", "13:05 ET + 4 h, as a shifted file gives it");
  assert.equal(sessionAfter(new Date(unshift(at("2026-07-14T21:05:00Z"), 1)).toISOString(), days), "2026-07-14");
});

const CIK = 320193;
const index = (acc) => `https://www.sec.gov/Archives/edgar/data/${CIK}/${acc.replace(/-/g, "")}/${acc}-index.htm`;
const page = (wall) => `<div class="infoHead">Accepted</div>\n<div class="info">${wall}</div>`;
const sub = (times) => ({ filings: { recent: { accessionNumber: Object.keys(times), acceptanceDateTime: Object.values(times) } } });
function session(pages) {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return pages[url] ? new Response(pages[url], { status: 200 }) : new Response("not found", { status: 404 }); };
  return { calls, s: createSession({ fetchImpl, env: {}, now: () => NOW, sleep: async () => {} }) };
}

test("acceptanceTimes: two index pages calibrate a shifted file; the rest are corrected without a request", async () => {
  const file = sub({ "0000000001-26-000003": "2026-09-01T21:05:00.000Z", "0000000001-26-000002": "2026-07-14T14:30:38.000Z", "0000000001-26-000001": "2026-02-27T04:34:19.000Z" });
  const { calls, s } = session({ [index("0000000001-26-000003")]: page("2026-09-01 13:05:00"), [index("0000000001-26-000001")]: page("2026-02-26 18:34:19") });
  const r = await acceptanceTimes(s, CIK, file, ["0000000001-26-000001", "0000000001-26-000002", "0000000001-26-000003"]);
  assert.equal(r.shift, 1);
  assert.deepEqual(Object.fromEntries([...r.times].map(([k, v]) => [k, new Date(v).toISOString()])), {
    "0000000001-26-000003": "2026-09-01T17:05:00.000Z", "0000000001-26-000001": "2026-02-26T23:34:19.000Z", "0000000001-26-000002": "2026-07-14T10:30:38.000Z",
  });
  assert.equal(calls.length, 2, "only the newest and the oldest were read");
});

test("acceptanceTimes: a right file is kept; probes that disagree send every filing to its index page", async () => {
  const right = sub({ "0000000001-26-000002": "2026-09-01T17:05:00.000Z", "0000000001-26-000001": "2026-02-26T23:34:19.000Z" });
  const pages = { [index("0000000001-26-000002")]: page("2026-09-01 13:05:00"), [index("0000000001-26-000001")]: page("2026-02-26 18:34:19") };
  const a = session(pages);
  const ok = await acceptanceTimes(a.s, CIK, right, ["0000000001-26-000001", "0000000001-26-000002"]);
  assert.equal(ok.shift, 0);
  assert.equal(new Date(ok.times.get("0000000001-26-000002")).toISOString(), "2026-09-01T17:05:00.000Z");
  const mixed = sub({ "0000000001-26-000003": "2026-09-01T21:05:00.000Z", "0000000001-26-000002": "2026-08-03T20:00:00.000Z", "0000000001-26-000001": "2026-02-26T23:34:19.000Z" });
  const b = session({ ...pages, [index("0000000001-26-000003")]: page("2026-09-01 13:05:00"), [index("0000000001-26-000002")]: page("2026-08-03 16:00:00") });
  const r = await acceptanceTimes(b.s, CIK, mixed, ["0000000001-26-000001", "0000000001-26-000002", "0000000001-26-000003"]);
  assert.equal(r.shift, null);
  assert.equal(new Date(r.times.get("0000000001-26-000002")).toISOString(), "2026-08-03T20:00:00.000Z", "read from its own index page");
  assert.equal(b.calls.length, 3);
});
