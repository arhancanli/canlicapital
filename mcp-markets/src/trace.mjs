// figure_trace: how a reported figure is built, from the filing itself. The calculation linkbase a
// company files states which lines add up to which; the XBRL instance holds each line's value. The
// tree follows those arcs down from the figure, with each sum recomputed and checked, and shows what
// the figure feeds into and how the filing splits it by segment, product or region. A figure nothing
// adds up to (Apple's net sales) is a line the company reports directly, and the tree says so.
import { z } from "zod";

import { decodeEntities } from "./html.mjs";
import { archiveBase, filings, getJson, getText, NotFound, resolveEntity } from "./sources.mjs";
import { all, child, children, parseXml } from "./xml.mjs";

const MEASURES = Object.freeze({
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "RevenuesNetOfInterestExpense"],
  net_income: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
  operating_income: ["OperatingIncomeLoss"],
  gross_profit: ["GrossProfit"],
  cost_of_revenue: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
  operating_expenses: ["OperatingExpenses", "CostsAndExpenses"],
  pretax_income: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"],
  total_assets: ["Assets"],
  current_assets: ["AssetsCurrent"],
  total_liabilities: ["Liabilities"],
  current_liabilities: ["LiabilitiesCurrent"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  operating_cash_flow: ["NetCashProvidedByUsedInOperatingActivities"],
});

export const traceInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  measure: z.string().min(2).max(160).describe(`${Object.keys(MEASURES).join(", ")}, or any tag the filing uses (NetCashProvidedByUsedInInvestingActivities, or us-gaap:Assets).`),
  form: z.enum(["10-K", "10-Q"]).optional().describe("Annual (default) or quarterly."),
  year: z.number().int().min(2009).max(2100).optional().describe("The calendar year the report's period ends in. Default the latest filed."),
}).strict();

export const TRACE_LIMITS_TEXT = Object.freeze([
  "This follows the arithmetic the company itself filed. A sum that adds up shows the filing is consistent with itself; it does not show the figures are right.",
  "Lines nothing adds up to are as the company reports them; how it arrived at them is outside the XBRL.",
  "Breakdowns can overlap (Products beside iPhone and Mac), so each one's sum is checked, not assumed.",
]);

const attr = (s, name) => s.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
const localOf = (href) => { const f = href.split("#").pop(); return f.includes("_") ? f.slice(f.indexOf("_") + 1) : f; };
const humanize = (c) => c.replace(/Member$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

// Every calculation in the linkbase (or the schema some filers embed it in), by the report it belongs to.
export function parseCalculations(xml) {
  const links = [];
  for (const block of xml.matchAll(/<(?:[\w-]+:)?calculationLink\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?calculationLink>/g)) {
    const locs = new Map();
    for (const m of block[2].matchAll(/<(?:[\w-]+:)?loc\b([^>]*?)\/?>/g)) locs.set(attr(m[1], "xlink:label"), localOf(attr(m[1], "xlink:href")));
    const arcs = [];
    for (const m of block[2].matchAll(/<(?:[\w-]+:)?calculationArc\b([^>]*?)\/?>/g)) {
      const parent = locs.get(attr(m[1], "xlink:from")), line = locs.get(attr(m[1], "xlink:to"));
      if (parent && line) arcs.push({ parent, child: line, weight: Number(attr(m[1], "weight")) || 1, order: Number(attr(m[1], "order")) || 0 });
    }
    if (arcs.length) links.push({ role: attr(block[1], "xlink:role").split("/").pop(), arcs });
  }
  return links;
}

// Labels for every line: the filing's own words, terse where it has them.
export function parseLabels(xml) {
  const rank = { terseLabel: 3, label: 2, verboseLabel: 1 };
  const texts = new Map(), locs = new Map(), best = new Map();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?label\b([^>]*)>([^<]*)<\/(?:[\w-]+:)?label>/g)) {
    const id = attr(m[1], "xlink:label"), role = attr(m[1], "xlink:role").split("/").pop();
    if (rank[role]) (texts.get(id) ?? texts.set(id, []).get(id)).push({ role, text: decodeEntities(m[2]).replace(/\s*\[(?:Member|Abstract|Axis|Domain)\]$/, "").trim() });
  }
  for (const m of xml.matchAll(/<(?:[\w-]+:)?loc\b([^>]*?)\/?>/g)) locs.set(attr(m[1], "xlink:label"), localOf(attr(m[1], "xlink:href")));
  for (const m of xml.matchAll(/<(?:[\w-]+:)?labelArc\b([^>]*?)\/?>/g)) {
    const concept = locs.get(attr(m[1], "xlink:from"));
    for (const t of texts.get(attr(m[1], "xlink:to")) ?? []) if (concept && (!best.has(concept) || rank[t.role] > best.get(concept).r)) best.set(concept, { r: rank[t.role], text: t.text });
  }
  return new Map([...best].map(([k, v]) => [k, v.text]));
}

// The instance's numeric facts: whole-company ones by line, and ones split along one axis.
export function parseFacts(xml) {
  const doc = child(parseXml(xml), "xbrl");
  if (!doc) throw new Error("not an XBRL instance");
  const contexts = new Map(), units = new Map(), plain = new Map(), split = [];
  for (const c of children(doc, "context")) {
    const p = child(c, "period");
    contexts.set(c.attrs.id, { start: child(p, "startDate")?.text.trim() ?? null, end: child(p, "endDate")?.text.trim() ?? null, instant: child(p, "instant")?.text.trim() ?? null, dims: [...all(c, "explicitMember").map((m) => ({ axis: (m.attrs.dimension ?? "").replace(/^.*:/, ""), member: m.text.trim().replace(/^.*:/, "") })), ...all(c, "typedMember").map((m) => ({ axis: (m.attrs.dimension ?? "").replace(/^.*:/, ""), member: null }))] });
  }
  for (const u of children(doc, "unit")) {
    const measures = all(u, "measure").map((m) => m.text.trim().replace(/^.*:/, ""));
    units.set(u.attrs.id, measures.length === 2 ? `${measures[0]}/${measures[1]}` : measures[0] ?? null);
  }
  for (const el of doc.children) {
    const ctx = contexts.get(el.attrs?.contextRef);
    const raw = el.text?.trim();
    if (!ctx || !el.attrs.unitRef || !raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const fact = { line: el.name, value, unit: units.get(el.attrs.unitRef) ?? null, decimals: el.attrs.decimals === "INF" || el.attrs.decimals === undefined ? null : Number(el.attrs.decimals), start: ctx.start, end: ctx.end, instant: ctx.instant };
    if (!ctx.dims.length) (plain.get(el.name) ?? plain.set(el.name, []).get(el.name)).push(fact);
    else if (ctx.dims.length === 1 && ctx.dims[0].member) split.push({ ...fact, axis: ctx.dims[0].axis, member: ctx.dims[0].member });
  }
  return { plain, split };
}

const samePeriod = (f, p) => (p.instant ? f.instant === p.instant : f.start === p.start && f.end === p.end);
const halfUnit = (d) => (d === null || !Number.isFinite(d) ? 0.005 : 0.5 * 10 ** -d);

// The tree under a line. Where several reports state a calculation for it, the one whose lines come
// closest to the filed value is used (the income statement rather than a note, usually).
// A filing's linkbase is the filer's text, so the walk is bounded: lines repeated down many paths
// could otherwise grow it exponentially. A tree cut short says so.
export const MAX_TREE_NODES = 2000, MAX_TREE_DEPTH = 16;
export function buildTree(line, period, { links, plain, label, weight = null, seen = new Set(), budget = { nodes: MAX_TREE_NODES, cut: false } }) {
  budget.nodes -= 1;
  const fact = (plain.get(line) ?? []).find((f) => samePeriod(f, period)) ?? null;
  const node = { concept: line, label: label(line), value: fact?.value ?? null, unit: fact?.unit ?? null, weight, children: [] };
  if (fact?.decimals !== undefined) node.decimals = fact.decimals;
  if (seen.has(line)) return node;
  if (budget.nodes <= 0 || seen.size >= MAX_TREE_DEPTH) { budget.cut = true; node.cut_short = true; return node; }
  const next = new Set(seen).add(line);
  const options = links.map((l) => ({ role: l.role, arcs: l.arcs.filter((a) => a.parent === line).sort((a, b) => a.order - b.order) })).filter((o) => o.arcs.length);
  let best = null;
  for (const o of options) {
    const vals = o.arcs.map((a) => [(plain.get(a.child) ?? []).find((f) => samePeriod(f, period)), a.weight]).filter(([f]) => f);
    if (!vals.length) continue;
    const sum = vals.reduce((s, [f, w]) => s + f.value * w, 0), gap = fact ? Math.abs(sum - fact.value) : Infinity;
    if (!best || gap < best.gap || (gap === best.gap && vals.length > best.count)) best = { ...o, gap, count: vals.length };
  }
  if (!best) return node;
  node.report = best.role;
  node.children = best.arcs.map((a) => buildTree(a.child, period, { links, plain, label, weight: a.weight, seen: next, budget }));
  const held = node.children.filter((c) => c.value !== null);
  node.lines_without_a_value = node.children.length - held.length;
  if (fact) {
    const sum = held.reduce((s, c) => s + c.value * c.weight, 0);
    const tolerance = held.reduce((t, c) => t + halfUnit(c.decimals ?? null), halfUnit(fact.decimals ?? null));
    const adds = Math.abs(sum - fact.value) <= tolerance;
    // A gap with a line missing its whole-company value is a sum not completed, not a filing that disagrees.
    node.check = { sum, difference: sum - fact.value, adds_up: adds, status: adds ? "adds_up" : node.lines_without_a_value ? "incomplete" : "does_not_add_up" };
  }
  return node;
}

function tally(node, out = { sums: 0, adding_up: 0, incomplete: 0, not_adding_up: [] }) {
  if (node.check) {
    out.sums += 1;
    if (node.check.status === "adds_up") out.adding_up += 1;
    else if (node.check.status === "incomplete") out.incomplete += 1;
    else out.not_adding_up.push({ concept: node.concept, label: node.label, filed: node.value, lines_sum: node.check.sum, difference: node.check.difference });
  }
  for (const c of node.children) tally(c, out);
  return out;
}

const AXIS_WORDS = { StatementBusinessSegmentsAxis: "business segment", ProductOrServiceAxis: "product or service", StatementGeographicalAxis: "region" };
// Axes that restate or relabel the same figure rather than split it.
const NOT_A_SPLIT = new Set(["ConsolidationItemsAxis", "StatementEquityComponentsAxis", "ConsolidatedEntitiesAxis", "LegalEntityAxis", "StatementScenarioAxis", "RestatementAxis", "RevisionOfPriorPeriodAxis", "AdjustmentsForNewAccountingPronouncementsAxis", "CumulativeEffectPeriodOfAdoptionAxis", "ChangeInAccountingEstimateByTypeAxis", "ErrorCorrectionsAndPriorPeriodAdjustmentsRestatementByRestatementPeriodAndAmountAxis"]);

// The largest set of lines that sums to the total, when members overlap (Products beside iPhone and
// Mac): which lines partition it. Null when none does, or there are too many lines to try.
export function partition(values, total, tolerance) {
  const n = values.length;
  if (n > 16) return null;
  let best = null, bestCount = 0;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    let sum = 0, count = 0;
    for (let i = 0; i < n; i += 1) if (mask & (1 << i)) { sum += values[i]; count += 1; }
    if (count > bestCount && Math.abs(sum - total) <= tolerance) { best = mask; bestCount = count; }
  }
  return best === null ? null : values.map((_, i) => Boolean(best & (1 << i)));
}

export async function figureTrace(session, args) {
  const a = traceInput.parse(args);
  const form = a.form ?? "10-K";
  const e = await resolveEntity(session, a.company);
  const { sub, rows } = await filings(session, e.cik, a.year ? { since: `${a.year}-01-01` } : {});
  const filing = rows.find((r) => r.form === form && (!a.year || String(r.reportDate ?? "").startsWith(String(a.year))));
  if (!filing) throw new NotFound(`${sub.name} has no ${form}${a.year ? ` for a period ending in ${a.year}` : ""}${sub.category?.includes("foreign") ? " (foreign private issuers file 20-F or 40-F)" : ""}.`);
  const base = archiveBase(e.cik, filing.accessionNumber);
  const items = (await getJson(session, `${base}/index.json`))?.directory?.item ?? [];
  const inst = items.find((i) => /_htm\.xml$/i.test(i.name)) ?? items.find((i) => /\.xml$/i.test(i.name) && !/_(cal|def|lab|pre)\.xml$/i.test(i.name) && !/FilingSummary/i.test(i.name));
  if (!inst) throw new NotFound(`${sub.name}'s ${form} ${filing.accessionNumber} has no XBRL to read.`);
  const xsd = items.find((i) => /\.xsd$/i.test(i.name));
  const calFile = items.find((i) => /_cal\.xml$/i.test(i.name)), labFile = items.find((i) => /_lab\.xml$/i.test(i.name));
  const read = (it) => (it ? getText(session, `${base}/${it.name}`, { maxBytes: 64 * 1024 * 1024 }) : Promise.resolve(""));
  const [xml, cal, lab, schema] = await Promise.all([read(inst), read(calFile), read(labFile), calFile && labFile ? Promise.resolve("") : read(xsd)]);
  const { plain, split } = parseFacts(xml);
  const links = parseCalculations(`${cal}${schema}`), labels = parseLabels(`${lab}${schema}`);
  const label = (c) => labels.get(c) ?? humanize(c);
  const asked = a.measure.replace(/^.*:/, "");
  const candidates = Object.hasOwn(MEASURES, asked) ? MEASURES[asked] : [asked];
  const line = candidates.find((c) => plain.has(c));
  if (!line) throw new NotFound(`${sub.name}'s ${form} of ${filing.reportDate ?? filing.filingDate} reports no whole-company ${asked}${Object.hasOwn(MEASURES, asked) ? ` under ${candidates.join(" or ")}` : ""}.`);
  // The figure's own period: the longest span of the right length, or the latest balance, newest first.
  const days = (f) => (Date.parse(f.end) - Date.parse(f.start)) / 86400000;
  const [lo, hi] = form === "10-K" ? [350, 380] : [80, 100];
  const facts = plain.get(line);
  const dur = facts.filter((f) => f.start && days(f) >= lo && days(f) <= hi).sort((x, y) => y.end.localeCompare(x.end))[0];
  const inst1 = facts.filter((f) => f.instant).sort((x, y) => y.instant.localeCompare(x.instant))[0];
  const fact = dur ?? inst1;
  if (!fact) throw new NotFound(`${sub.name}'s ${form} reports ${line} for no ${form === "10-K" ? "year" : "quarter"}.`);
  const period = fact.instant ? { instant: fact.instant } : { start: fact.start, end: fact.end };
  const budget = { nodes: MAX_TREE_NODES, cut: false };
  const tree = buildTree(line, period, { links, plain, label, budget });
  const parents = [];
  for (const l of links) for (const arc of l.arcs) if (arc.child === line && !parents.some((p) => p.concept === arc.parent)) parents.push({ concept: arc.parent, label: label(arc.parent), value: (plain.get(arc.parent) ?? []).find((f) => samePeriod(f, period))?.value ?? null, weight: arc.weight, report: l.role });
  const axes = {};
  for (const f of split) if (f.line === line && samePeriod(f, period)) (axes[f.axis] ??= []).push(f);
  // At most a dozen axes, each at most 16 lines for the overlap search: the filing sets how many there are.
  const breakdowns = Object.entries(axes).filter(([axis]) => !NOT_A_SPLIT.has(axis)).slice(0, 12).map(([axis, list]) => {
    // Two members can carry one label and value (a standard member and the filer's own).
    const seen = new Set(), lines = [];
    for (const f of list.slice().sort((x, y) => Math.abs(y.value) - Math.abs(x.value))) {
      const member = labels.get(f.member) ?? humanize(f.member), key = `${member}|${f.value}`;
      if (!seen.has(key)) { seen.add(key); lines.push({ member, value: f.value }); }
    }
    const tolerance = (lines.length + 1) * halfUnit(fact.decimals), parts = partition(lines.map((l) => l.value), fact.value, tolerance);
    if (parts) lines.forEach((l, i) => { l.in_the_sum = parts[i]; });
    return { axis, by: AXIS_WORDS[axis] ?? humanize(axis.replace(/Axis$/, "")).toLowerCase(), lines, adds_up: Boolean(parts), ...(parts && parts.some((p) => !p) ? { note: "Some lines overlap; those marked in the sum add up to the total." } : {}) };
  }).filter((b) => b.lines.length >= 2).sort((x, y) => Number(y.adds_up) - Number(x.adds_up) || y.lines.length - x.lines.length);
  const checks = tally(tree);
  const reading = tree.children.length
    ? `${tree.label} of ${fact.value.toLocaleString("en-US")} ${fact.unit ?? ""} is built from ${tree.children.length} lines in the filing's own calculation. ${checks.adding_up} of ${checks.sums} sums in the tree add up to what is filed${checks.incomplete ? `; ${checks.incomplete} could not be completed because a line is filed only split by member` : ""}${checks.not_adding_up.length ? `; ${checks.not_adding_up.length} did not add up` : ""}.${budget.cut ? " The tree is cut short: this filing's calculation is unusually large." : ""}`
    : `${tree.label} of ${fact.value.toLocaleString("en-US")} ${fact.unit ?? ""} has no lines adding up to it in the filing's calculation: the company reports it directly${breakdowns.length ? `, and splits it by ${breakdowns.map((b) => b.by).join(", ")}` : ""}.`;
  return {
    company: { cik: e.cik, name: e.name ?? sub.name ?? null, ticker: e.ticker ?? null },
    filing: { form: filing.form, accession: filing.accessionNumber, filed: filing.filingDate, report_date: filing.reportDate ?? null, url: `${base}/${filing.primaryDocument ?? ""}`, instance: `${base}/${inst.name}`, calculation: calFile ? `${base}/${calFile.name}` : xsd ? `${base}/${xsd.name}` : null },
    measure: asked, concept: line, period, tree, ...(budget.cut ? { cut_short: true } : {}), feeds_into: parents.slice(0, 40), breakdowns, checks, plain_reading: reading.trim(), limits: TRACE_LIMITS_TEXT,
  };
}
