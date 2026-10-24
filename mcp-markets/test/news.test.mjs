// news against replayed GDELT answers: articles, the tone series, a refused tone request, and names.
import assert from "node:assert/strict";
import test from "node:test";

import { news, plainName } from "../src/news.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const Q = "query=%22rate+cut%22+sourcelang%3Aenglish";
const LIST = `https://api.gdeltproject.org/api/v2/doc/doc?${Q}&mode=artlist&maxrecords=25&timespan=7d&sort=datedesc&format=json`;
const TONE = `https://api.gdeltproject.org/api/v2/doc/doc?${Q}&mode=timelinetone&timespan=7d&format=json`;
const articles = { articles: [
  { url: "https://example.com/a", title: "Fed signals a rate cut .", seendate: "20261022T140000Z", domain: "example.com", language: "English", sourcecountry: "United States" },
  { url: "https://example.org/b", title: "Markets rally", seendate: "20261021T090000Z", domain: "example.org", language: "English", sourcecountry: "United Kingdom" },
] };
const tone = { timeline: [{ series: "Average Tone", data: [{ date: "20261020T000000Z", value: -1.2 }, { date: "20261021T000000Z", value: -0.4 }, { date: "20261022T000000Z", value: 0.6 }, { date: "20261023T000000Z", value: 1.0 }] }] };
const session = (extra) => createSession({ fetchImpl: replayFetch(extra).fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });

test("articles newest first with outlet and country, and the tone by day", async () => {
  const r = await news(session({ [LIST]: articles, [TONE]: tone }), { query: "\"rate cut\"" });
  assert.deepEqual(r.articles.rows[0].slice(0, 4), ["2026-10-22T14:00:00Z", "Fed signals a rate cut.", "example.com", "United States"]);
  assert.deepEqual(r.tone.rows.map((x) => x[1]), [-1.2, -0.4, 0.6, 1]);
  assert.equal(r.tone.first_half, -0.8); assert.equal(r.tone.second_half, 0.8);
  assert.equal(r.sources.length, 2);
});

test("a refused tone request still returns the articles, with a note", async () => {
  const r = await news(session({ [LIST]: articles }), { query: "\"rate cut\"" });
  assert.equal(r.articles.rows.length, 2);
  assert.match(r.tone.note, /did not return the tone series/);
  await assert.rejects(news(session({}), {}), /needs query or company/);
});

test("company names as the press writes them", () => {
  assert.deepEqual(["NVIDIA CORP", "Apple Inc.", "JPMORGAN CHASE & CO", "BERKSHIRE HATHAWAY INC", "Meta Platforms, Inc."].map(plainName), ["Nvidia", "Apple", "Jpmorgan Chase", "Berkshire Hathaway", "Meta Platforms"]);
});
