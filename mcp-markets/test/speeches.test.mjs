import assert from "node:assert/strict";
import { test } from "node:test";

import { feedItems, fedSpeeches } from "../src/speeches.mjs";
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
