import assert from "node:assert/strict";
import test from "node:test";

import { atomDate, renderAtomFeed } from "./atom-feed.mjs";

const options = { origin: "https://example.com", title: "T & co", subtitle: "S", author: "A", authorUri: "https://example.com/a", alternate: "https://example.com/r" };

test("entries are newest first, dated from their own lastmod, and escaped", () => {
  const xml = renderAtomFeed([
    { url: "https://example.com/old", title: "Old", summary: "one", updated: "2026-09-01" },
    { url: "https://example.com/new", title: "New <b>", summary: "two & three", updated: "2026-09-20", category: "note" },
  ], options);
  assert.ok(xml.indexOf("/new") < xml.indexOf("/old"), "newest first");
  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(xml, /<updated>2026-09-20T00:00:00Z<\/updated>\n  <author>/, "the feed is as new as its newest entry");
  assert.match(xml, /<title>New &lt;b&gt;<\/title>/);
  assert.match(xml, /<summary>two &amp; three<\/summary>/);
  assert.match(xml, /<title>T &amp; co<\/title>/);
  assert.match(xml, /<category term="note"\/>/);
});

test("an undated page is left out, never given a date", () => {
  const xml = renderAtomFeed([
    { url: "https://example.com/dated", title: "Dated", summary: "s", updated: "2026-09-01" },
    { url: "https://example.com/undated", title: "Undated", summary: "s", updated: undefined },
  ], options);
  assert.doesNotMatch(xml, /undated/);
  assert.throws(() => renderAtomFeed([{ url: "u", title: "t", summary: "s" }], options), /at least one dated entry/);
});

test("calendar days and timestamps both become RFC 3339", () => {
  assert.equal(atomDate("2026-09-26"), "2026-09-26T00:00:00Z");
  assert.equal(atomDate("2026-09-26T10:11:12.345Z"), "2026-09-26T10:11:12Z");
  assert.throws(() => atomDate("yesterday"), /not a date/);
});
