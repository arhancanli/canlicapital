import test from "node:test";
import assert from "node:assert/strict";

import { buildTree, figureTrace, MAX_TREE_NODES, parseCalculations, parseFacts, parseLabels, partition } from "../src/trace.mjs";
import { createSession } from "../src/sources.mjs";

const context = (id, period, member = "") => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier>${member ? `<xbrli:segment><xbrldi:explicitMember dimension="${member.split("=")[0]}">${member.split("=")[1]}</xbrldi:explicitMember></xbrli:segment>` : ""}</xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context>`;
const Y = "<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>";
const PY = "<xbrli:startDate>2023-01-01</xbrli:startDate><xbrli:endDate>2023-12-31</xbrli:endDate>";
const fact = (tag, ctx, v, extra = 'decimals="-6"') => `<${tag} contextRef="${ctx}" unitRef="usd" ${extra}>${v}</${tag}>`;
const INSTANCE = `<?xml version="1.0"?><xbrli:xbrl xmlns:xbrli="x">
${context("y", Y)}${context("py", PY)}${context("iphone", Y, "us-gaap:ProductOrServiceAxis=aapl:IPhoneMember")}${context("mac", Y, "us-gaap:ProductOrServiceAxis=aapl:MacMember")}${context("products", Y, "us-gaap:ProductOrServiceAxis=us-gaap:ProductMember")}${context("services", Y, "us-gaap:ProductOrServiceAxis=us-gaap:ServiceMember")}${context("re", Y, "us-gaap:StatementEquityComponentsAxis=us-gaap:RetainedEarningsMember")}
<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
${fact("us-gaap:Revenues", "y", "1000000000")}${fact("us-gaap:Revenues", "py", "900000000")}
${fact("us-gaap:CostOfRevenue", "y", "600000000")}${fact("us-gaap:GrossProfit", "y", "400000000")}
${fact("us-gaap:OperatingExpenses", "y", "150000000")}${fact("us-gaap:OperatingIncomeLoss", "y", "250000000")}
${fact("us-gaap:Assets", "y", "999000000")}
${fact("us-gaap:Revenues", "iphone", "500000000")}${fact("us-gaap:Revenues", "mac", "200000000")}${fact("us-gaap:Revenues", "products", "700000000")}${fact("us-gaap:Revenues", "services", "300000000")}${fact("us-gaap:Revenues", "re", "1000000000")}
<us-gaap:Assets contextRef="y" unitRef="usd" xsi:nil="true"></us-gaap:Assets>
</xbrli:xbrl>`;
const CAL = `<link:linkbase><link:calculationLink xlink:role="http://x/role/Income" xlink:type="extended">
<link:loc xlink:href="x.xsd#us-gaap_OperatingIncomeLoss" xlink:label="a"/><link:loc xlink:href="x.xsd#us-gaap_GrossProfit" xlink:label="b"/><link:loc xlink:href="x.xsd#us-gaap_OperatingExpenses" xlink:label="c"/><link:loc xlink:href="x.xsd#us-gaap_Revenues" xlink:label="d"/><link:loc xlink:href="x.xsd#us-gaap_CostOfRevenue" xlink:label="e"/>
<link:calculationArc xlink:from="a" xlink:to="b" weight="1.0" order="1"/><link:calculationArc xlink:from="a" xlink:to="c" weight="-1.0" order="2"/><link:calculationArc xlink:from="b" xlink:to="d" weight="1.0" order="1"/><link:calculationArc xlink:from="b" xlink:to="e" weight="-1.0" order="2"/>
</link:calculationLink><link:calculationLink xlink:role="http://x/role/Assets" xlink:type="extended"><link:loc xlink:href="x.xsd#us-gaap_Assets" xlink:label="p"/><link:loc xlink:href="x.xsd#us-gaap_Goodwill" xlink:label="q"/><link:loc xlink:href="x.xsd#us-gaap_InventoryNet" xlink:label="r"/><link:calculationArc xlink:from="p" xlink:to="q" weight="1" order="1"/><link:calculationArc xlink:from="p" xlink:to="r" weight="1" order="2"/></link:calculationLink></link:linkbase>`;
const LAB = `<link:linkbase><link:labelLink><link:loc xlink:href="x.xsd#us-gaap_Revenues" xlink:label="l1"/><link:loc xlink:href="x.xsd#aapl_IPhoneMember" xlink:label="l2"/><link:label xlink:label="t1" xlink:role="http://www.xbrl.org/2003/role/label">Revenues [Abstract]</link:label><link:label xlink:label="t1" xlink:role="http://www.xbrl.org/2003/role/terseLabel">Net sales &amp; fees</link:label><link:label xlink:label="t1" xlink:role="http://www.xbrl.org/2003/role/documentation">Long words</link:label><link:label xlink:label="t2" xlink:role="http://www.xbrl.org/2003/role/label">iPhone [Member]</link:label><link:labelArc xlink:from="l1" xlink:to="t1"/><link:labelArc xlink:from="l2" xlink:to="t2"/></link:labelLink></link:linkbase>`;

test("the calculation linkbase, the labels and the facts are read as filed", () => {
  const links = parseCalculations(CAL);
  assert.deepEqual(links.map((l) => [l.role, l.arcs.length]), [["Income", 4], ["Assets", 2]]);
  assert.deepEqual(links[0].arcs[1], { parent: "OperatingIncomeLoss", child: "OperatingExpenses", weight: -1, order: 2 });
  const labels = parseLabels(LAB);
  assert.equal(labels.get("Revenues"), "Net sales & fees", "terse wins, documentation never");
  assert.equal(labels.get("IPhoneMember"), "iPhone");
  const { plain, split } = parseFacts(INSTANCE);
  assert.equal(plain.get("Revenues").length, 2);
  assert.equal(plain.get("Assets").length, 1, "a nil fact is not a zero");
  assert.equal(split.filter((f) => f.axis === "ProductOrServiceAxis").length, 4);
});

test("the tree recomputes every sum, signs included, in the figure's own period", () => {
  const { plain } = parseFacts(INSTANCE);
  const t = buildTree("OperatingIncomeLoss", { start: "2024-01-01", end: "2024-12-31" }, { links: parseCalculations(CAL), plain, label: (c) => c });
  assert.equal(t.check.status, "adds_up");
  assert.deepEqual(t.children.map((c) => [c.concept, c.weight, c.value]), [["GrossProfit", 1, 400000000], ["OperatingExpenses", -1, 150000000]]);
  assert.equal(t.children[0].check.sum, 400000000);
  assert.deepEqual(t.children[0].children.map((c) => c.concept), ["Revenues", "CostOfRevenue"]);
});

test("a filed sum that disagrees is said to disagree; a line with no value makes it incomplete, not wrong", () => {
  const { plain } = parseFacts(INSTANCE);
  const links = parseCalculations(CAL);
  const period = { start: "2024-01-01", end: "2024-12-31" }, opts = { links, plain, label: (c) => c };
  const wrong = new Map(plain);
  wrong.set("GrossProfit", [{ line: "GrossProfit", value: 450000000, decimals: -6, unit: "USD", ...period, instant: null }]);
  assert.equal(buildTree("GrossProfit", period, { ...opts, plain: wrong }).check.status, "does_not_add_up");
  const held = new Map(plain);
  held.set("Goodwill", [{ line: "Goodwill", value: 500000000, decimals: -6, unit: "USD", start: null, end: null, instant: "2024-12-31" }]);
  held.set("Assets", [{ line: "Assets", value: 999000000, decimals: -6, unit: "USD", start: null, end: null, instant: "2024-12-31" }]);
  const t = buildTree("Assets", { instant: "2024-12-31" }, { ...opts, plain: held });
  assert.equal(t.lines_without_a_value, 1);
  assert.equal(t.check.status, "incomplete");
});

test("overlapping members: the largest set of lines that adds up is the one marked", () => {
  assert.deepEqual(partition([700, 500, 300, 200], 1000, 1), [false, true, true, true]);
  assert.equal(partition([700, 500], 1000, 1), null);
  assert.equal(partition(Array(17).fill(1), 17, 1), null, "too many lines to try");
});

test("a cycle in a calculation cannot hang the tree", () => {
  const links = [{ role: "r", arcs: [{ parent: "A", child: "B", weight: 1, order: 1 }, { parent: "B", child: "A", weight: 1, order: 1 }] }];
  const fact1 = (line) => ({ line, value: 1, decimals: 0, unit: "USD", start: "2024-01-01", end: "2024-12-31", instant: null });
  const t = buildTree("A", { start: "2024-01-01", end: "2024-12-31" }, { links, plain: new Map([["A", [fact1("A")]], ["B", [fact1("B")]]]), label: (c) => c });
  assert.equal(t.children[0].children[0].children.length, 0);
});

test("a hostile calculation cannot blow up the walk: each level repeated down two paths stays bounded", () => {
  const arcs = [];
  for (let i = 0; i < 60; i += 1) for (const side of ["a", "b"]) { arcs.push({ parent: `N${i}`, child: `${side}${i}`, weight: 1, order: 1 }, { parent: `${side}${i}`, child: `N${i + 1}`, weight: 1, order: 1 }); }
  const fact1 = (line) => ({ line, value: 1, decimals: 0, unit: "USD", start: "2024-01-01", end: "2024-12-31", instant: null });
  const plain = new Map(arcs.flatMap((a) => [a.parent, a.child]).map((c) => [c, [fact1(c)]]));
  const began = Date.now(), budget = { nodes: MAX_TREE_NODES, cut: false };
  const t = buildTree("N0", { start: "2024-01-01", end: "2024-12-31" }, { links: [{ role: "r", arcs }], plain, label: (c) => c, budget });
  assert.equal(budget.cut, true);
  assert.ok(Date.now() - began < 5000, `${Date.now() - began} ms`);
  let nodes = 0;
  const walk = (n) => { nodes += 1; n.children.forEach(walk); };
  walk(t);
  assert.ok(nodes <= MAX_TREE_NODES + 2, `${nodes} nodes`);
});

test("figure_trace end to end against a stand-in SEC: tree, what it feeds, breakdown, and the refusals", async () => {
  const dir = "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123";
  const files = {
    "https://www.sec.gov/files/company_tickers.json": JSON.stringify({ 0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." } }),
    "https://data.sec.gov/submissions/CIK0000320193.json": JSON.stringify({ name: "Apple Inc.", filings: { recent: { accessionNumber: ["0000320193-24-000123"], form: ["10-K"], filingDate: ["2025-01-31"], reportDate: ["2024-12-31"], primaryDocument: ["a.htm"] }, files: [] } }),
    [`${dir}/index.json`]: JSON.stringify({ directory: { item: [{ name: "a_htm.xml" }, { name: "a_cal.xml" }, { name: "a_lab.xml" }, { name: "a.xsd" }] } }),
    [`${dir}/a_htm.xml`]: INSTANCE, [`${dir}/a_cal.xml`]: CAL, [`${dir}/a_lab.xml`]: LAB, [`${dir}/a.xsd`]: "<schema/>",
  };
  const fetchImpl = async (url) => {
    const body = files[String(url)];
    return body === undefined ? new Response("{}", { status: 404 }) : new Response(body, { status: 200, headers: { "content-type": "text/plain" } });
  };
  const s = createSession({ fetchImpl, env: { CANLI_SEC_USER_AGENT: "t t@example.com" } });
  const up = await figureTrace(s, { company: "AAPL", measure: "operating_income" });
  assert.equal(up.concept, "OperatingIncomeLoss");
  assert.deepEqual(up.checks, { sums: 2, adding_up: 2, incomplete: 0, not_adding_up: [] });
  assert.match(up.plain_reading, /2 of 2 sums/);
  assert.equal(up.filing.url, `${dir}/a.htm`);
  const rev = await figureTrace(s, { company: "AAPL", measure: "revenue" });
  assert.equal(rev.tree.label, "Net sales & fees");
  assert.equal(rev.tree.children.length, 0);
  assert.match(rev.plain_reading, /reports it directly/);
  assert.deepEqual(rev.feeds_into.map((p) => [p.concept, p.weight]), [["GrossProfit", 1]]);
  assert.equal(rev.breakdowns.length, 1, "the equity components axis relabels the figure; it does not split it");
  assert.equal(rev.breakdowns[0].by, "product or service");
  assert.equal(rev.breakdowns[0].adds_up, true);
  assert.deepEqual(rev.breakdowns[0].lines.filter((l) => l.in_the_sum).reduce((n, l) => n + l.value, 0), 1000000000);
  assert.equal(rev.period.end, "2024-12-31", "the newest year");
  await assert.rejects(() => figureTrace(s, { company: "AAPL", measure: "Goodwill" }), /reports no whole-company/);
  await assert.rejects(() => figureTrace(s, { company: "AAPL", measure: "revenue", form: "10-Q" }), /no 10-Q/);
});
