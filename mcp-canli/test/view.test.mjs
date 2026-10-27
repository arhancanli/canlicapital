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
import { againInput } from "../src/view/studio.js";

test("the page is one self-contained file: no network, no external script, the protocol in it", () => {
  const html = viewHtml();
  assert.ok(html.startsWith("<!doctype html>"));
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!www\.w3\.org)[a-z]/i, "no external resource");
  assert.doesNotMatch(html, /^export\s/m, "render.js's exports are made plain");
  for (const method of ["ui/initialize", "ui/notifications/initialized", "ui/notifications/tool-input", "ui/notifications/tool-result", "ui/notifications/tool-cancelled", "ui/notifications/size-changed", "ui/notifications/host-context-changed", "ui/resource-teardown"]) assert.ok(html.includes(method), method);
  assert.ok(html.includes("protocolVersion: \"2026-01-26\""), "the MCP Apps version the official package calls latest");
  assert.ok(html.includes("if (event.source !== window.parent) return;") && html.includes("if (hostOrigin !== null && event.origin !== hostOrigin) return;"), "only the framing host, at the origin of its handshake answer, is heard");
  assert.ok(Buffer.byteLength(html) < 180000, `${Buffer.byteLength(html)} bytes`);
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
  const income = { title: "INCOME STATEMENTS", units: "USD ($) shares in Millions, $ in Millions", columns: ["line", "concept", "12 months to 2026-06-30", "12 months to 2025-06-30"], rows: [["Revenue", "us-gaap:Revenues", 331839, 281724], ["Earnings per share:", "us-gaap:EarningsPerShareAbstract", null, null], ["Basic", "us-gaap:EarningsPerShareBasic", 18, 13.7]] };
  assert.match(renderResult({ company: { name: "MICROSOFT CORP" }, income }), /data-kind="statements"/, "drawn by the statements view");
  const html = table({ columns: income.columns, rows: income.rows, title: `${income.title} (${income.units})` });
  assert.ok(html.includes("<h3>INCOME STATEMENTS (USD ($) shares in Millions, $ in Millions)</h3>"));
  assert.ok(html.includes("<td class=\"num\" data-v=\"331839\">331,839</td>"));
  assert.ok(html.includes("<td title=\"us-gaap:Revenues\">Revenue</td><td class=\"num\" data-v=\"331839\">331,839</td>"), "the concept is the line's tooltip, the figure beside the label");
  assert.doesNotMatch(html, /<th>concept<\/th>/);
  assert.ok(html.includes("<tr class=\"heading\">"));
  assert.doesNotMatch(html, /sortable/, "a statement keeps its order");
  assert.ok(html.includes("<td class=\"num\" data-v=\"18\">18.00</td><td class=\"num\" data-v=\"13.7\">13.70</td>"), "18 beside 13.7 reads as 18.00 and 13.70");
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

test("what a result is about heads it; its grouped figures are drawn as figures, the tables inside them as tables", () => {
  const lido = {
    protocol: { name: "Lido", slug: "lido", category: "Liquid Staking", chains: ["Solana", "Ethereum"], url: "https://lido.fi/" },
    tvl: { usd: 22870668284, date: "2026-10-15", change_7d_pct: -4.91, by_chain: { columns: ["chain", "tvl_usd"], rows: [["Ethereum", 22865379517], ["Solana", 5288767]] } },
    fees_usd: { last_24h: 1631285, last_30d: 52119324, source: "https://api.llama.fi/summary/fees/lido?dataType=dailyFees" },
    dates: ["2026-10-13", "2026-10-14", "2026-10-15"], values: [23.4e9, 23.1e9, 22.87e9], series: "TVL, USD", source: "https://api.llama.fi/protocol/lido",
  };
  const html = renderResult(lido);
  assert.ok(html.startsWith("<p class=\"lead\">Lido · TVL, USD<span class=\"sub line\">category Liquid Staking · chains Solana, Ethereum · url <a href=\"https://lido.fi/\""), "the subject's name, then its other identifiers (not its slug)");
  assert.ok(html.includes("<h3>tvl</h3><dl class=\"facts\"><div><dt>usd</dt><dd>22,870,668,284</dd></div><div><dt>date</dt><dd>2026-10-15</dd></div>"));
  assert.ok(html.includes("<h3>tvl · by chain</h3>") && html.includes("<td class=\"num\" data-v=\"22865379517\">22,865,379,517</td>"), "a table two levels down");
  assert.ok(html.includes("<dt>source</dt><dd><a href=\"https://api.llama.fi/summary/fees/lido?dataType=dailyFees\" target=\"_blank\" rel=\"noopener noreferrer\">api.llama.fi/<wbr>…/<wbr>lido</a></dd>"), "a link reads as its host and last part, breaking at slashes");
  assert.ok(html.indexOf("<h3>fees usd</h3>") < html.indexOf("<svg"), "figures before the chart");
  assert.match(html, /class="axis" text-anchor="end">22\.87B<\/text>/, "axis labels in billions");
  assert.doesNotMatch(html, /<dt>series<\/dt>/, "what heads the page is not repeated");
  const report = renderResult({ company: { name: "MICROSOFT CORP", ticker: "MSFT" }, earnings: { expected: "2026-10-29", year_on_year_moves_days: [0, 1, -1] }, summary: { open_market_sales: { transactions: 1, value: 938419.17 } }, snapshot: { sha256: "73a86c6aedc31f77cac2ea4df5f80f0b3bd7e6eb58bb4e01444fbedf3afb9c43" } });
  assert.ok(report.includes("<dt>year on year moves days</dt><dd>0, 1, -1</dd>"));
  assert.ok(report.includes("<dt>open market sales</dt><dd>transactions 1 · value 938,419</dd>"), "a small group on one line");
  assert.ok(report.includes("<span title=\"73a86c6aedc31f77cac2ea4df5f80f0b3bd7e6eb58bb4e01444fbedf3afb9c43\">73a86c6aedc31f77…</span>"), "a hash shortened, whole on hover");
  const fomc = renderResult({ projections: { meeting: "2026-09-16", columns: ["variable", "2026", "2027"], median: [["Federal funds rate", 4.1, 4.1]], previous_median: [["Federal funds rate", 3.8, 3.6]] } });
  assert.ok(fomc.includes("<h3>projections · median</h3>") && fomc.includes("<h3>projections · previous median</h3>") && fomc.includes("<dt>meeting</dt>"));
  const segments = renderResult({ total_revenue: { columns: ["2025-09-27", "2024-09-28"], values: [416161000000, 391035000000] } });
  assert.ok(segments.includes("<h3>total revenue</h3>") && segments.includes("<td class=\"num\" data-v=\"416161000000\">416,161,000,000</td>"), "one row of values is a table");
});

test("odds read as percentages; records, empty columns and labels as a reader needs them", () => {
  const odds = { query: "recession", columns: ["venue", "event", "outcome", "probability", "bid", "volume_usd", "revised"], rows: [["Polymarket", "US recession by end of 2026?", "Yes", 0.075, 0.07, 2300532, null], ["Kalshi", "Recession this year?", "Yes", 0.045, 0.04, null, null]], events: [{ venue: "Polymarket", event: "US recession by end of 2026?", resolution: "This market will resolve to Yes if ...", url: "https://polymarket.com/event/us-recession-by-end-of-2026" }] };
  const html = renderResult(odds);
  assert.ok(html.startsWith("<p class=\"lead\">“recession”</p>"));
  assert.ok(html.includes("<td class=\"num\" data-v=\"0.075\">7.5%</td><td class=\"num\" data-v=\"0.07\">0.07</td>") && html.includes("<td class=\"num\" data-v=\"0.045\">4.5%</td>"), "a probability as a percentage; prices stay prices");
  assert.doesNotMatch(html, /<th>revised<\/th>/, "a column no row fills is left out");
  assert.ok(html.includes("<th class=\"num\">probability</th>") && html.includes("<th>venue</th>"), "number columns are headed on the right");
  assert.ok(html.includes("<h3>events</h3>") && html.includes("<th>resolution</th>"), "a list of records is a table");
  assert.equal(table({ columns: ["chance"], rows: [[0.5]] }).includes("50%"), false, "only a column named probability");
  assert.equal(table({ columns: ["probability"], rows: [[45]] }).includes("<td class=\"num\" data-v=\"45\">45</td>"), true, "a probability already in percent is left alone");
  const facts = table({ columns: ["measure", "concept", "period", "value", "decimals"], rows: [["eps_basic", "ifrs-full:BasicEarningsLossPerShare", "2025-01-01 to 2025-12-31", 26.29, 2]] });
  assert.ok(facts.includes("<td title=\"ifrs-full:BasicEarningsLossPerShare\">eps basic</td>") || facts.includes(">eps basic</td>"), "a measure's id reads as words");
  assert.ok(facts.includes("<td class=\"num\" data-v=\"26.29\">26.29</td><td class=\"num\" data-v=\"2\">2</td>"), "decimals is a count, not a figure with cents");
});

test("charts: one scale, outer percentiles or a target range, steps for decisions, series only", () => {
  const rates = { columns: ["date", "rate", "percentile_1", "percentile_25", "percentile_99", "volume_usd_billion"], rows: [["2026-09-01", 3.66, 3.61, 3.63, 3.74, 2912], ["2026-09-02", 3.65, 3.6, 3.63, 3.73, 2882], ["2026-09-03", 3.66, 3.6, 3.64, 3.74, 2949]] };
  assert.deepEqual(seriesFromTable(rates).lines.map((l) => l.name), ["rate", "percentile_1", "percentile_99"], "the outer pair; the volume is on another scale");
  const effr = { columns: ["date", "rate", "percentile_1", "percentile_99", "target_from", "target_to"], rows: [["2026-09-01", 3.63, 3.61, 3.65, 3.5, 3.75], ["2026-09-02", 3.63, 3.6, 3.65, 3.5, 3.75], ["2026-09-17", 3.88, 3.85, 3.9, 3.75, 4]] };
  assert.deepEqual(seriesFromTable(effr).lines.map((l) => l.name), ["rate", "target_from", "target_to"], "beside a target range, the range");
  const fomc = { columns: ["start", "change_bp", "target_low", "target_high"], rows: [["2026-06-16", 0, 3.5, 3.75], ["2026-07-28", 0, 3.5, 3.75], ["2026-09-15", 25, 3.75, 4]] };
  assert.deepEqual(seriesFromTable(fomc).lines.map((l) => l.name), ["target_low", "target_high"], "basis points are not drawn beside percent");
  assert.equal(seriesFromTable({ columns: ["date", "insider", "shares"], rows: [["2026-09-05", "a", 1], ["2026-09-05", "b", 2], ["2026-09-08", "c", 3]] }), null, "trades on a shared day are not a series");
  const curve = seriesFromTable({ columns: ["contract", "expiration", "settlement"], rows: [["VX/V6", "2026-10-21", 17.66], ["VX/X6", "2026-11-18", 18.08], ["VX/Z6", "2026-12-16", 18.4]] });
  assert.deepEqual(curve, { dates: ["2026-10-21", "2026-11-18", "2026-12-16"], lines: [{ name: "settlement", values: [17.66, 18.08, 18.4] }] }, "a futures curve by expiration");
  const ecb = renderResult({ rate: { id: "ecb_deposit", name: "ECB deposit facility rate", publisher: "European Central Bank" }, start: "2026-01-01", end: "2026-10-08", columns: ["date", "rate", "event"], rows: [["2026-01-01", 2, "in effect since 2025-06-11"], ["2026-06-17", 2.25, "change"], ["2026-09-16", 2.5, "change"]] });
  assert.ok(ecb.startsWith("<p class=\"lead\">ECB deposit facility rate<span class=\"sub line\">publisher European Central Bank</span></p>"));
  const path = /<path d="([^"]+)" class="line s0"\/>/.exec(ecb)[1];
  assert.match(path, /^M[\d.]+,[\d.]+H[\d.]+V[\d.]+H[\d.]+V[\d.]+H[\d.]+V[\d.]+$/, "level until each change, then on to the last day asked for");
  assert.ok(ecb.includes(">2026-10-08</text>"));
  const yields = renderResult({ yields: { "1 Mo": 4.11, "3 Mo": 4.28, "2 Yr": 4.82, "10 Yr": 5.19, "30 Yr": 5.52 } });
  assert.ok(yields.includes("<h3>yields</h3><svg") && yields.includes("<title>10 Yr: 5.19</title>") && yields.includes(">30y</text>"), "a curve over maturities");
});

test("the page carries the code without its comment lines, and the code still parses", () => {
  const html = viewHtml();
  assert.doesNotMatch(html, /^[ \t]*\/\/.*$/m);
  const script = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  assert.doesNotThrow(() => new Function(script));
});

test("view: true draws the whole result for the person and gives the model a summary, only where the host draws apps", async (t) => {
  const prices = Array.from({ length: 400 }, (_, i) => 100 * Math.exp(0.0004 * i + 0.05 * Math.sin(i / 17)));
  const call = { name: "run_tool", arguments: { name: "backtest_ma_crossover", arguments: { prices, fast: 10, slow: 40 }, view: true } };
  const connect = async (capabilities) => {
    const server = new McpServer({ name: "t", version: "0" });
    registerAll(server, ["quant", "validation"]);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "t", version: "0" }, { capabilities });
    await client.connect(b);
    t.after(async () => { await client.close(); await server.close(); });
    return client;
  };
  const apps = await connect({ extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [VIEW_MIME] } } });
  const r = await apps.callTool(call);
  assert.equal(r.structuredContent.curve.rows.length, 400, "the view gets the whole curve");
  assert.ok(r.structuredContent.trades.rows.length > 0);
  const model = JSON.parse(r.content[0].text);
  assert.match(model.viewed, /interactive view.*show_result with ref r\d+/);
  assert.deepEqual(model.curve.columns, ["period", "strategy", "buy_and_hold", "drawdown", "exposure"], "labels stay whole");
  assert.equal(model.curve.rows.items, 400);
  assert.equal(model.sharpe, r.structuredContent.sharpe, "the figures are all there");
  assert.ok(r.content[0].text.length * 10 < JSON.stringify(r.structuredContent).length, `${r.content[0].text.length} vs ${JSON.stringify(r.structuredContent).length}`);
  const plain = await connect({});
  const p = await plain.callTool(call);
  assert.equal(JSON.parse(p.content[0].text).curve.rows.length, 400, "without apps the model gets the whole result");
  assert.equal(JSON.parse(p.content[0].text).viewed, undefined);
  // A view's own follow-up (againInput) comes back whole even when it is above the model's limit.
  const long = Array.from({ length: 30000 }, (_, i) => 100 + Math.sin(i / 9));
  const again = await apps.callTool({ name: "run_tool", arguments: againInput({ input: {}, call: null }, { values: long, from: "prices", to: "simple" }, "convert_returns") });
  assert.equal(again.structuredContent.values.length, 29999, "the view gets every value");
  assert.equal(again.structuredContent.preview_only, undefined);
});
