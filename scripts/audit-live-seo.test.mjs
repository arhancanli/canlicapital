import assert from "node:assert/strict";
import test from "node:test";

import { inspectHtml } from "./audit-live-seo.mjs";

test("inspectHtml binds canonical metadata, graph schema, and markdown leaks", () => {
  const url = "https://canlicapital.com/trials/example";
  const html = `<!doctype html><html><head>
    <title>Evidence example / Canli Capital</title>
    <meta name="description" content="An evidence record with an explicit boundary and source." />
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="noindex, follow" />
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Dataset"},{"@type":"Person"}]}</script>
    </head><body><h1>Evidence example</h1><a href="/research/example.md">raw paper</a></body></html>`;

  const result = inspectHtml(html, url);

  assert.equal(result.canonical, url);
  assert.equal(result.robots, "noindex, follow");
  assert.deepEqual(result.h1, ["Evidence example"]);
  assert.deepEqual(result.schema_types, ["Dataset", "Person"]);
  assert.equal(result.invalid_json_ld_blocks, 0);
  assert.deepEqual(result.raw_markdown_internal_links, ["/research/example.md"]);
  assert.match(result.body_sha256, /^[0-9a-f]{64}$/);
});

test("inspectHtml reports malformed JSON-LD without inventing a type", () => {
  const result = inspectHtml(
    '<html><head><script type="application/ld+json">{bad}</script></head><body></body></html>',
    "https://canlicapital.com/bad",
  );

  assert.equal(result.invalid_json_ld_blocks, 1);
  assert.deepEqual(result.schema_types, []);
});
