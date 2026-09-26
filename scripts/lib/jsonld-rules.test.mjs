import assert from "node:assert/strict";
import test from "node:test";

import { jsonLdProblems } from "./jsonld-rules.mjs";

const page = (...blocks) => `<html><head>${blocks.map((b) => `<script type="application/ld+json">${typeof b === "string" ? b : JSON.stringify(b)}</script>`).join("")}</head></html>`;

test("a hub that lists its children as name-and-URL Datasets fails, once per block, counting each", () => {
  const hub = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Trials", description: "All trials", hasPart: [1, 2, 3].map((n) => ({ "@type": "Dataset", name: `Packet ${n}`, url: `https://canlicapital.com/trials/${n}` })) };
  assert.deepEqual(jsonLdProblems(page(hub)), ["JSON-LD block 1 has 3 Dataset nodes without a name and description (Google marks each one invalid)"]);
});

test("the same hub listing WebPages passes, and a complete Dataset passes", () => {
  const hub = { "@type": "CollectionPage", name: "Trials", hasPart: [{ "@type": "WebPage", name: "Packet 1", url: "https://canlicapital.com/trials/1" }] };
  const leaf = { "@type": "Dataset", name: "Packet 1", description: "The evidence packet for one trial." };
  assert.deepEqual(jsonLdProblems(page(hub, leaf)), []);
});

test("an array @type, an empty description and unparseable JSON-LD are all caught", () => {
  assert.equal(jsonLdProblems(page({ "@type": ["Dataset", "CreativeWork"], name: "x" })).length, 1);
  assert.equal(jsonLdProblems(page({ "@type": "Dataset", name: "x", description: "  " })).length, 1);
  assert.deepEqual(jsonLdProblems(page("{not json")), ["JSON-LD block 1 does not parse"]);
  assert.deepEqual(jsonLdProblems("<html><body>no structured data</body></html>"), []);
});
