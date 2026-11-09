// A page per canli-mcp tool: arguments read as the server declares them, related tools by shared words, each page dated
// by its own content (a template change re-dates none), every released tool given a page, and the page itself.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ENTRIES } from "canli-mcp/src/server.mjs";
import { contentOf, datePages, parseArgs, relatedTools, toolRoute, toolRows } from "./lib/mcp-tool-pages.mjs";
import { toolPage } from "./build-mcp-pages.mjs";

const index = JSON.parse(readFileSync(new URL("../mcp-canli/src/index.json", import.meta.url), "utf8"));

test("arguments: required and optional, nested types kept whole", () => {
  assert.deepEqual(parseArgs("company: string, rows?: {a: number, b: string}[], measure?: eps|revenue"), [
    { name: "company", required: true, type: "string" },
    { name: "rows", required: false, type: "{a: number, b: string}[]" },
    { name: "measure", required: false, type: "eps|revenue" },
  ]);
  assert.deepEqual(parseArgs(""), []);
});

test("every released tool has a row: the index's and the desk's", () => {
  const rows = toolRows(index, ENTRIES), names = new Set(rows.map((r) => r[0]));
  for (const e of ENTRIES) assert.ok(names.has(e.name), e.name);
  assert.equal(names.size, rows.length, "no tool twice");
  assert.ok(rows.some((r) => r[0] === "brief" && r[1] === "desk"));
  assert.equal(toolRoute("portfolio_rules"), "/mcp-servers/tools/portfolio-rules");
});

test("related tools share words and never include the tool itself", () => {
  const rows = toolRows(index, ENTRIES), row = rows.find((r) => r[0] === "deflated_sharpe_ratio") ?? rows[0];
  const near = relatedTools(row, rows);
  assert.ok(near.length > 0 && near.length <= 6);
  assert.ok(near.every((t) => t[0] !== row[0]));
});

test("dates: unchanged content keeps its day, changed content moves it, a deployment never invents one", () => {
  const a = contentOf(["x", "desk", "desk", "X", "does x", "", ""], [], []), b = contentOf(["x", "desk", "desk", "X", "does x better", "", ""], [], []);
  const first = datePages(null, [["x", a]], { today: "2026-11-08", refresh: true });
  assert.deepEqual([first.record.tools.x.first, first.record.tools.x.changed, first.changed], ["2026-11-08", "2026-11-08", ["x"]]);
  const same = datePages(first.record, [["x", a]], { today: "2026-12-01", refresh: true });
  assert.equal(same.record.tools.x.changed, "2026-11-08", "the same content keeps its date");
  const moved = datePages(first.record, [["x", b]], { today: "2026-12-01", refresh: true });
  assert.deepEqual([moved.record.tools.x.first, moved.record.tools.x.changed], ["2026-11-08", "2026-12-01"]);
  const deployed = datePages(first.record, [["x", b], ["y", a]], { today: "2026-12-01", refresh: false });
  assert.equal(deployed.record.tools.x.changed, "2026-11-08", "a deployment keeps the recorded date");
  assert.equal(deployed.record.tools.y.changed, null, "and gives a new tool none rather than the build day");
});

test("a tool's page: its name, arguments, the call's shape, its own canonical and date", () => {
  const rows = toolRows(index, ENTRIES), row = rows.find((r) => r[0] === "portfolio_rules");
  const packs = [{ id: "markets", label: "Markets", package: "canli-markets-mcp", covers: "" }];
  const flagship = { ...JSON.parse(readFileSync(new URL("../public/benchmarks/finance-mcp-servers.json", import.meta.url), "utf8")).flagship, views: [] };
  const html = toolPage(row, { rows, questions: [{ route: "/mcp-servers/answers/x", question: "A recorded question?" }], packs, flagship, version: "9.9.9", modified: "2026-11-08" });
  assert.match(html, /<link rel="canonical" href="https:\/\/canlicapital.com\/mcp-servers\/tools\/portfolio-rules" \/>/);
  assert.match(html, /<h1>Ownership lines, Form 13F and diversification<\/h1>/);
  assert.match(html, /"dateModified":"2026-11-08"/);
  assert.match(html, /A recorded question\?/);
  assert.match(html, /&quot;name&quot;: &quot;portfolio_rules&quot;/);
  for (const p of parseArgs(row[6])) assert.ok(html.includes(`<code>${p.name}</code>`), p.name);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.ok(ld.some((x) => x["@type"] === "SoftwareApplication" && x.name.startsWith("portfolio_rules")));
  assert.ok(ld.some((x) => x["@type"] === "BreadcrumbList" && x.itemListElement.some((i) => i.name === "Every tool")));
});
