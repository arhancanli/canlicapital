import assert from "node:assert/strict";
import { test } from "node:test";

import { bisSpeaker, centralBankSpeeches, feedItems, fedSpeeches } from "../src/speeches.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-speeches-fixtures.mjs on 2026-11-05: the Board's three feeds and one speech.
const run = (args) => fedSpeeches(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("a feed's items: the speaker the title begins with, the venue without its repeat, entities escaped twice decoded", () => {
  const xml = "<item><title>Waller, The Signaling Value of the Summary of Economic Projections</title><link>https://www.federalreserve.gov/newsevents/speech/waller20261008a.htm</link><pubDate>Thu, 8 Oct 2026 08:30:00 GMT</pubDate><description><![CDATA[Speech At the Istanbul Economic Forum, T&amp;uuml;rkiye]]></description></item>";
  assert.deepEqual(feedItems(xml, "speech"), [{ kind: "speech", date: "2026-10-08", speaker: "Waller", title: "The Signaling Value of the Summary of Economic Projections", venue: "At the Istanbul Economic Forum, Türkiye", link: "https://www.federalreserve.gov/newsevents/speech/waller20261008a.htm" }]);
});

test("the latest speeches, testimony and releases, one member's, and one speech's passages on policy", async () => {
  const r = await run({ limit: 4 });
  assert.equal(r.summary[0], "The latest from the Federal Reserve Board: \"Federal Reserve issues FOMC statement\" (policy, 2026-10-28).");
  assert.deepEqual(r.rows[3].slice(0, 4), ["2026-10-08", "speech", "Waller", "The Signaling Value of the Summary of Economic Projections"]);
  assert.ok((await run({ speaker: "Bowman" })).rows.every((x) => x[2] === "Bowman"));
  const sp = await run({ read: "https://www.federalreserve.gov/newsevents/speech/waller20261008a.htm" });
  assert.deepEqual([sp.date, sp.speaker], ["October 08, 2026", "Governor Christopher J. Waller"]);
  assert.match(sp.rows[0][0], /^As you know, in September the Federal Open Market Committee \(FOMC\) voted to raise our policy rate 25 basis points to 3\.75 percent to 4 percent/);
  await assert.rejects(run({ read: "https://example.com/speech" }), /takes a speech or testimony page on www\.federalreserve\.gov/);
});

// Captured by scripts/capture-bis-speeches-fixtures.mjs on 2026-11-05: the BIS's feed and one speech.
const runBis = (args) => centralBankSpeeches(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("a BIS speech's speaker and role from its description", () => {
  assert.deepEqual(bisSpeaker("Speech by Dr Joachim Nagel, President of the Deutsche Bundesbank, at the conference for the 40th anniversary"), { form: "Speech", speaker: "Joachim Nagel", role: "President of the Deutsche Bundesbank" });
  assert.deepEqual(bisSpeaker("Dinner speech by Mr Tuomas Välimäki, Board Member of the Bank of Finland, on the outlook for the euro area economy and inflation, Helsinki, 2 November 2026."), { form: "Dinner speech", speaker: "Tuomas Välimäki", role: "Board Member of the Bank of Finland" });
});

test("central bankers' latest speeches, one bank's, and one speech in brief excerpts", async () => {
  const r = await runBis({ limit: 3 });
  assert.equal(r.rows.length, 3);
  assert.equal(r.rows[0][0], "2026-11-03");
  const b = await runBis({ bank: "Bundesbank" });
  assert.ok(b.rows.length >= 1 && b.rows.every((x) => /Deutsche Bundesbank/.test(x[2])));
  const rd = await runBis({ read: "https://www.bis.org/speeches/20261103-path-back-2-has-become-less-comfortable" });
  assert.deepEqual([rd.title, rd.speaker], ["The path back to 2 % has become less comfortable", "Tuomas Välimäki"]);
  assert.ok(rd.rows.length <= 5 && rd.rows.every(([p]) => p.length <= 400));
  assert.match(rd.rows[1][0], /^If I had to sum up my main takeaway from last week’s ECB Governing Council meeting in one sentence/);
  await assert.rejects(runBis({ bank: "Atlantis Central Bank" }), /None of the BIS's latest fifty speeches/);
});
