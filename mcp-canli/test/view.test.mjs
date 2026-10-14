// The result viewer (MCP Apps): its page is served as ui://canli/view with the MCP App type, run_tool
// names it, and its rendering draws tables, charts, statements, guidance ranges and verdicts with
// every string from a result escaped.
import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import { registerAll } from "../src/server.mjs";
import { chart, claims, esc, fmt, ranges, releaseTable, renderResult, renderRunResult, seriesFromTable, table } from "../src/view/render.js";
import { VIEW_MIME, VIEW_URI, viewHtml } from "../src/view.mjs";

test("the page is one self-contained file: no network, no external script, the protocol in it", () => {
  const html = viewHtml();
  assert.ok(html.startsWith("<!doctype html>"));
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!www\.w3\.org)[a-z]/i, "no external resource");
  assert.doesNotMatch(html, /^export\s/m, "render.js's exports are made plain");
  for (const method of ["ui/initialize", "ui/notifications/initialized", "ui/notifications/tool-input", "ui/notifications/tool-result", "ui/notifications/tool-cancelled", "ui/notifications/size-changed", "ui/notifications/host-context-changed", "ui/resource-teardown"]) assert.ok(html.includes(method), method);
  assert.ok(html.includes("protocolVersion: \"2026-01-26\""), "the MCP Apps version the official package calls latest");
  assert.ok(Buffer.byteLength(html) < 40000, `${Buffer.byteLength(html)} bytes`);
});

test("run_tool names the viewer, and the viewer is served as an MCP App", async (t) => {
  const server = new McpServer({ name: "t", version: "0" });
  registerAll(server, ["quant", "validation"]);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(b);
  t.after(async () => { await client.close(); await server.close(); });
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.find((x) => x.name === "run_tool")._meta, { ui: { resourceUri: VIEW_URI } });
  assert.equal(tools.find((x) => x.name === "find_tool")._meta, undefined, "only run_tool draws results");
  const res = await client.readResource({ uri: VIEW_URI });
  assert.equal(res.contents[0].mimeType, VIEW_MIME);
  assert.equal(res.contents[0].text, viewHtml());
  assert.deepEqual(res.contents[0]._meta, { ui: { prefersBorder: true } });
});

test("text from a result is escaped everywhere it is drawn", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const html = renderRunResult({ results: [{ name: evil, ref: evil, result: { company: { name: evil }, columns: [evil, "verdict"], rows: [[evil, evil]], note: evil, limits: [evil] } }, { name: "x", error: evil }] });
  assert.doesNotMatch(html, /<img/);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.doesNotMatch(table({ columns: ["u"], rows: [["javascript:alert(1)"]] }), /href="javascript/, "only http(s) links become links");
  const checked = claims({ columns: ["claim", "measure", "verdict", "filed", "source"], rows: [[evil, evil, "confirmed", 1, "javascript:alert(1)"]] });
  assert.doesNotMatch(checked, /<img|href="javascript/);
  assert.equal(esc(`"'&`), "&quot;&#39;&amp;");
});

test("numbers read as people read them; a table of dates and values gets a chart", () => {
  assert.equal(fmt(45183036), "45,183,036");
  assert.equal(fmt(-0.12345), "-0.1235");
  assert.equal(fmt(17.95), "17.95");
  assert.equal(fmt(13.7, 2), "13.70");
  assert.equal(fmt(7429, 2), "7,429.00");
  const t = { columns: ["date", "close", "note"], rows: [["2026-01-02", 10, "a"], ["2026-01-05", 11, "b"], ["2026-01-06", 10.5, "c"]] };
  assert.deepEqual(seriesFromTable(t), { dates: ["2026-01-02", "2026-01-05", "2026-01-06"], lines: [{ name: "close", values: [10, 11, 10.5] }] });
  assert.equal(seriesFromTable({ columns: ["line", "2025"], rows: [["Revenue", 1], ["Cost", 2], ["Profit", 3]] }), null, "a statement is not a time series");
  const svg = chart(seriesFromTable(t), "Price");
  assert.match(svg, /<svg viewBox="0 0 640 220"/);
  assert.match(svg, /<path d="M[\d.]+,[\d.]+L/);
});

test("statements keep their title, units and headings, with cents shown across a line", () => {
  const html = renderResult({ company: { name: "MICROSOFT CORP" }, income: { title: "INCOME STATEMENTS", units: "USD ($) shares in Millions, $ in Millions", columns: ["line", "concept", "12 months to 2026-06-30", "12 months to 2025-06-30"], rows: [["Revenue", "us-gaap:Revenues", 331839, 281724], ["Earnings per share:", "us-gaap:EarningsPerShareAbstract", null, null], ["Basic", "us-gaap:EarningsPerShareBasic", 18, 13.7]] } });
  assert.ok(html.includes("<h3>INCOME STATEMENTS (USD ($) shares in Millions, $ in Millions)</h3>"));
  assert.ok(html.includes("<td class=\"num\">331,839</td>"));
  assert.ok(html.includes("<td title=\"us-gaap:Revenues\">Revenue</td><td class=\"num\">331,839</td>"), "the concept is the line's tooltip, the figure beside the label");
  assert.doesNotMatch(html, /<th>concept<\/th>/);
  assert.ok(html.includes("<tr class=\"heading\">"));
  assert.ok(html.includes("<td class=\"num\">18.00</td><td class=\"num\">13.70</td>"), "18 beside 13.7 reads as 18.00 and 13.70");
});

test("checked claims sit under their sentence, verdict first, the filed figure linked to its filing", () => {
  const src = "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/0000320193-25-000079-index.htm";
  const said = "In fiscal 2025 Apple had revenue of $416.2 billion and net income of $93.7 billion.";
  const result = { company: { name: "Apple Inc." }, summary: { claims: 3, confirmed: 1, contradicted: 1, not_reported: 1, not_checkable: 0 }, columns: ["claim", "measure", "period", "claimed", "unit", "verdict", "filed", "difference", "note", "source"], rows: [[said, "revenue", "fiscal 2025", 416.2, "USD billion", "confirmed", 416.161, null, null, src], [said, "net_income", "fiscal 2025", 93.7, "USD billion", "contradicted", 112.01, -18.31, "matches fiscal 2024 instead", src], ["Margin was 47%.", "gross_margin", "fiscal 2025", 47, "%", "not reported", null, null, null, null]], note: "Confirmed means the filed figure rounds to the claim.", ref: "r1" };
  const html = renderRunResult(result, { name: "verify_claims" });
  assert.equal(html.split(said).length - 1, 1, "the sentence once for its two checks");
  assert.ok(html.includes("3 claims checked: <span class=\"badge ok\">1 confirmed</span> <span class=\"badge bad\">1 contradicted</span> <span class=\"badge warn\">1 not reported</span>"), "zero counts are left out");
  assert.ok(html.includes("<td><span class=\"badge bad\">contradicted</span></td><td>net income<span class=\"sub line\">fiscal 2025</span></td>"));
  assert.ok(html.includes(`<td class="num" title="difference -18.31"><a href="${src}" target="_blank" rel="noopener noreferrer">112.01</a></td><td class="text">matches fiscal 2024 instead</td>`));
  assert.ok(html.includes("<td class=\"num\">47%</td>"));
  const quote = "Revenue of $96.2 billion, up 106% from a year ago, and up 6% from the previous quarter.";
  assert.ok(table({ columns: ["quote"], rows: [[quote]] }).includes(`<td class="text" title="${quote}"><div class="clamp">${quote}</div></td>`), "long text wraps to three lines, the whole on hover");
  assert.equal(html.split("Confirmed means the filed figure rounds").length - 1, 1, "the note is drawn once");
  assert.doesNotMatch(html, /<dt>ref<\/dt>/, "the ref is in the heading only");
});

test("earlier guidance is drawn as its range with the actual marked; positions stay neutral", () => {
  const g = { columns: ["measure", "basis", "period_guided", "unit", "guided_low", "guided_high", "actual", "position"], rows: [["revenue", null, "second quarter", "USD billion", 89.18, 92.82, 96.2, "above the range"], ["gross_margin", "GAAP", "second quarter", "%", 74.4, 75.4, 75, "within the range"], ["eps", null, "second quarter", "USD per share", 1.1, 1.2, null, "not placed: no result"]] };
  const html = ranges(g, "Guided and actual");
  assert.equal((html.match(/class="range"/g) ?? []).length, 2, "a range without an actual is not drawn");
  assert.ok(html.includes("guided 89.18 to 92.82, actual 96.2 <span class=\"sub\">USD billion</span> <span class=\"badge info\">above the range</span>"));
  assert.ok(html.includes("guided 74.4 to 75.4, actual 75% <span class=\"badge info\">within the range</span>"));
  const dot = (h) => Number(/class="dot" style="left:([\d.]+)%"/.exec(h)[1]), bar = (h) => /class="bar" style="left:([\d.]+)%;width:([\d.]+)%"/.exec(h).slice(1).map(Number);
  const first = html.slice(0, html.indexOf("gross margin"));
  assert.ok(dot(first) > bar(first)[0] + bar(first)[1], "a beat sits right of its range");
  assert.equal(ranges({ columns: ["measure", "low", "high", "unit"], rows: [["revenue", 1, 2, "USD"]] }), "", "current guidance has no actual to place");
  assert.ok(table({ columns: ["position"], rows: [["below the range"], ["not placed: rounded"]] }).includes("<span class=\"badge info\">below the range</span></td></tr><tr><td><span class=\"badge muted\">not placed: rounded</span>"));
  const release = renderResult({ release: { headline: "Q2" }, previous_guidance_vs_results: g });
  assert.ok(release.indexOf("Guided and actual") < release.indexOf("previous guidance vs results"), "the drawing comes before its table");
});

test("a result shortened for the model says so", () => {
  const html = renderResult({ symbol: "SPY", dates: { list_of: 900, first: [], last: [] }, preview_only: { chars: 250000, note: "This result is 250000 characters." } });
  assert.ok(html.includes("<p class=\"note\">This result is 250000 characters.</p>"));
});

test("a price series, a batch, and an error each draw", () => {
  assert.match(renderResult({ symbol: "SPY", dates: ["2026-01-02", "2026-01-05", "2026-01-06"], close: [600, 610, 605] }), /<svg/);
  const batch = renderRunResult({ results: [{ name: "return_stats", ref: "r1", result: { sharpe: 1.2 } }, { name: "bad_tool", error: "No tool bad_tool." }] });
  assert.ok(batch.includes("<h2>return_stats <small>r1</small></h2>") && batch.includes("<p class=\"error\">No tool bad_tool.</p>"));
  assert.ok(renderRunResult({ sharpe: 1.2 }, { name: "sharpe_ratio" }).includes("<h2>sharpe_ratio</h2>"));
});

test("a results release reads compactly: segment under the measure, unit under the figure, the sentence on hover", () => {
  const quote = "•Second-quarter revenue was $89.0 billion, up 18% from the previous quarter.";
  const results = { columns: ["measure", "value", "unit", "basis", "change", "versus", "section", "quote"], rows: [["revenue", 89, "USD billion", null, null, null, "Data Center", quote], ["revenue", 18, "%", null, "growth", "quarter over quarter", "Data Center", quote], ["eps", 2.22, "USD per share", "non-GAAP", null, null, null, "x"]] };
  const html = releaseTable(results, "results");
  assert.ok(html.includes(`<td title="${esc(quote)}">revenue<span class="sub line">Data Center</span></td><td class="num">89<span class="sub line">USD billion</span></td>`));
  assert.ok(html.includes("<td class=\"num\">18%</td><td></td><td>growth, quarter over quarter</td>"));
  assert.doesNotMatch(html, /<th>quote<\/th>|<th>section<\/th>/, "the sentence and the segment are not columns of their own");
  const guidance = releaseTable({ columns: ["measure", "basis", "period", "low", "high", "mid", "unit", "approximate", "change_or_words", "width_pct_of_mid", "quote"], rows: [["revenue", null, "third quarter of fiscal 2027", 105.84, 110.16, 108, "USD billion", null, null, 4, "q"], ["operating_expenses", "GAAP", "third quarter of fiscal 2027", 9.2, 9.2, 9.2, "USD billion", true, null, null, "q"]] }, "guidance");
  assert.ok(guidance.includes("<td class=\"num\">105.84 to 110.16<span class=\"sub line\">USD billion</span></td>") && guidance.includes("<td class=\"num\">about 9.2<span class=\"sub line\">USD billion</span></td>"));
  assert.doesNotMatch(guidance, /<th>words<\/th>/, "a column no row fills is left out");
  const prior = releaseTable({ columns: ["measure", "basis", "period_guided", "unit", "guided_low", "guided_high", "actual", "vs_low", "vs_high", "vs_low_bps", "vs_high_bps", "position", "guidance_quote", "result_quote"], rows: [["gross_margin", "GAAP", "second quarter", "%", 74.4, 75.4, 75, 0.6, -0.4, 60, -40, "within the range", "g", "r"]] }, "previous guidance vs results");
  assert.ok(prior.includes("<td title=\"g | r\">gross margin<span class=\"sub line\">GAAP, second quarter</span></td><td class=\"num\">74.4 to 75.4%</td><td class=\"num\">75%</td><td><span class=\"badge info\">within the range</span></td>"));
});
