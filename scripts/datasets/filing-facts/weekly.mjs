// FilingFacts weekly: a new question set every week from the annual reports filed that week. Every item
// cites at least one XBRL fact first reported during the week, so a model whose training data ends more
// than a few weeks before it cannot hold the answer (an earnings release can give a figure some days
// before the annual report; the release has no XBRL data), and a tool that reads the filings can. Same templates, checker and item
// schema as v1 (generate-v1.mjs); each company record is built by scripts/lib/company-reference.mjs from
// the filer's live companyfacts, as the site builds its company pages.
//   node scripts/datasets/filing-facts/weekly.mjs --week 2026-W44 --out <dir> [--companies 40]
//     [--per-company 3] [--seed 20261105]
// <dir> receives items.jsonl, manifest.json and sources/<cik>.raw.json.gz, the companyfacts each record
// was built from (manifest.json names their sha256, so the set rebuilds offline from them).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { companyReference } from "../../lib/company-reference.mjs";
import { checkItem } from "./check.mjs";
import { mulberry32 } from "./generate.mjs";
import { SCHEMA_V1 } from "./generate-v1.mjs";
import { TEMPLATES, annualFacts } from "./templates.mjs";

export const WEEKLY_SCHEMA = "canli.filing-facts-weekly.v1";
// Original annual reports only: an amendment re-files figures that were first reported earlier.
export const WEEKLY_FORMS = new Set(["10-K", "20-F", "40-F"]);
// "unanswerable" asks about a period before the company's earliest XBRL fact, which is never new.
export const WEEKLY_TEMPLATES = Object.freeze(Object.keys(TEMPLATES).filter((t) => t !== "unanswerable"));
export const FRESH_RULE = "Each item cites at least one fact whose first XBRL report was filed during the week (no earlier filing's XBRL data has the same taxonomy, concept, unit and period) and no fact filed after the week. An earnings release can give a figure some days before the annual report; releases carry no XBRL data. Unanswerable items are left out.";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const mondayOf = (t) => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

// ISO 8601 week label of a UTC time: the year of its Thursday, counted from the week holding 4 January.
export function weekOf(t) {
  const year = new Date(mondayOf(t) + 3 * DAY).getUTCFullYear();
  const n = 1 + Math.round((mondayOf(t) - mondayOf(Date.UTC(year, 0, 4))) / (7 * DAY));
  return `${year}-W${String(n).padStart(2, "0")}`;
}

// The week's first and last dates (Monday to Sunday, UTC) and its weekdays: EDGAR has no weekend index.
export function isoWeek(week) {
  const m = /^(\d{4})-W(\d{2})$/.exec(week ?? "");
  if (!m) throw new RangeError("a week looks like 2026-W44");
  const monday = mondayOf(Date.UTC(Number(m[1]), 0, 4)) + (Number(m[2]) - 1) * 7 * DAY;
  if (Number(m[2]) < 1 || weekOf(monday) !== week) throw new RangeError(`${week} is not an ISO week`);
  return { start: iso(monday), end: iso(monday + 6 * DAY), weekdays: [0, 1, 2, 3, 4].map((i) => iso(monday + i * DAY)) };
}

export const dailyIndexUrl = (date) =>
  `https://www.sec.gov/Archives/edgar/daily-index/${date.slice(0, 4)}/QTR${Math.ceil(Number(date.slice(5, 7)) / 3)}/form.${date.replaceAll("-", "")}.idx`;

// A line of EDGAR's daily form index: form type, company name, CIK, date filed and the filing's path, in
// columns separated by two or more spaces (a form type such as "SC 13D" holds a single space).
const INDEX_LINE = /^(\S+(?: \S+)*?) {2,}(\S.*?) {2,}(\d{1,10}) {2,}(\d{8}) {2,}(edgar\/data\/\d+\/(\d{10}-\d{2}-\d{6})\.txt)\s*$/;

export function annualFilings(indexText) {
  const out = [];
  for (const line of indexText.split(/\r?\n/)) {
    const m = INDEX_LINE.exec(line);
    if (!m || !WEEKLY_FORMS.has(m[1])) continue;
    out.push({ form: m[1], name: m[2].trim(), cik: m[3].padStart(10, "0"), filed: `${m[4].slice(0, 4)}-${m[4].slice(4, 6)}-${m[4].slice(6)}`, accn: m[6] });
  }
  return out;
}

const factKey = (taxonomy, tag, unit, start, end) => `${taxonomy}|${tag}|${unit}|${start ?? ""}|${end}`;

// When each fact was first reported, over every filing of the raw companyfacts (quarterly reports and
// amendments included): a figure a 10-Q or an earlier 10-K already gave is not new in this week's 10-K.
export function firstReported(source) {
  const first = new Map();
  for (const [taxonomy, concepts] of Object.entries(source?.facts ?? {})) {
    for (const [tag, fact] of Object.entries(concepts ?? {})) {
      for (const [unit, rows] of Object.entries(fact?.units ?? {})) {
        for (const r of Array.isArray(rows) ? rows : []) {
          if (typeof r?.filed !== "string" || typeof r?.end !== "string") continue;
          const key = factKey(taxonomy, tag, unit, r.start, r.end);
          if (!first.has(key) || r.filed < first.get(key)) first.set(key, r.filed);
        }
      }
    }
  }
  return first;
}

const within = (date, window) => typeof date === "string" && date >= window.start && date <= window.end;

// For each concept, its periods up to the last one first reported during the week, and the period
// before that (a change needs a base). Templates draw from these; newFacts still checks every item.
function weekPeriods(facts, first, window) {
  const out = new Map();
  for (const [tag, entry] of facts) {
    const usable = entry.facts.filter((f) => f.filed <= window.end);
    const last = usable.findLastIndex((f) => within(first.get(factKey(entry.concept.taxonomy, tag, f.unit, f.start, f.end)), window));
    if (last >= 0) out.set(tag, { ...entry, facts: usable.slice(0, last + 2) });
  }
  return out;
}

// The facts an item cites that were first reported during the week; none when any is filed after it.
export function newFacts(item, record, first, window) {
  if (item.facts.some((f) => f.filed > window.end)) return [];
  return item.facts.flatMap((f) => {
    const o = record.concepts.find((c) => c.tag === f.concept)?.observations.find((x) => x.end === f.end && x.unit === f.unit && x.accn === f.accn);
    const when = o && first.get(factKey(f.taxonomy, f.concept, f.unit, o.start, f.end));
    return within(when, window) ? [{ concept: f.concept, end: f.end, unit: f.unit, first_reported: when }] : [];
  });
}

// Up to perCompany new items for one company, deterministic given the seed. Each passes check.mjs
// against the full record; rejected counts the items the checker refused.
export function weeklyItemsForCompany(record, source, window, { perCompany, seed, week }) {
  const first = firstReported(source);
  const facts = weekPeriods(annualFacts(record), first, window);
  const items = [];
  let rejected = 0;
  if (!facts.size) return { items, rejected };
  const rng = mulberry32(seed ^ Number(record.cik));
  const seen = new Set();
  for (let attempt = 0; items.length < perCompany && attempt < perCompany * 12; attempt++) {
    const template = WEEKLY_TEMPLATES[attempt % WEEKLY_TEMPLATES.length];
    const made = TEMPLATES[template](record, facts, rng);
    if (!made || seen.has(made.question)) continue;
    seen.add(made.question);
    const item = { schema: SCHEMA_V1, template, company: { cik: record.cik, name: record.name }, ...made };
    const fresh = newFacts(item, record, first, window);
    if (!fresh.length) continue;
    if (checkItem(item, record).length) { rejected++; continue; }
    item.id = createHash("sha256").update(JSON.stringify([item.company.cik, item.template, item.question])).digest("hex").slice(0, 16);
    items.push({ ...item, split: `week-${week}`, fresh });
  }
  return { items, rejected };
}

const UA = "CanliCapital research reference canlicapital.com";

// One request at a time, well under the SEC's ten a second; null for a 404 (a holiday has no index).
async function get(url) {
  for (let attempt = 0; ; attempt++) {
    await new Promise((r) => setTimeout(r, 150));
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 404) return null;
    if (res.ok) return res.text();
    if (attempt >= 3 || ![429, 500, 502, 503, 504].includes(res.status)) throw new Error(`${url}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
  const week = arg("week"), out = arg("out");
  const companies = Number(arg("companies", 40)), perCompany = Number(arg("per-company", 3)), seed = Number(arg("seed", 20261105));
  if (!out) throw new RangeError("--out <dir> is required");
  const window = isoWeek(week);
  if (Date.now() <= Date.parse(`${window.end}T23:59:59Z`)) throw new RangeError(`${week} has not ended`);
  const generatedAt = new Date().toISOString();
  const indexes = [], filers = new Map();
  for (const date of window.weekdays) {
    const url = dailyIndexUrl(date);
    const text = await get(url);
    if (text === null) { indexes.push({ date, url, missing: true }); continue; }
    const rows = annualFilings(text).filter((r) => within(r.filed, window));
    indexes.push({ date, url, sha256: sha256(text), annual_reports: rows.length });
    for (const r of rows) if (!filers.has(r.cik)) filers.set(r.cik, r);
  }
  // A fixed shuffle of the week's filers: the same week and seed always try the same companies first.
  const order = [...filers.values()].sort((a, b) => (sha256(`${seed}|${week}|${a.cik}`) < sha256(`${seed}|${week}|${b.cik}`) ? -1 : 1));
  mkdirSync(join(out, "sources"), { recursive: true });
  const items = [], used = [], skipped = [];
  let rejected = 0;
  for (const filing of order) {
    if (used.length >= companies) break;
    const raw = await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${filing.cik}.json`);
    if (raw === null) { skipped.push({ cik: filing.cik, form: filing.form, reason: "no XBRL company facts" }); continue; }
    const fetchedAt = new Date().toISOString();
    let record;
    try { record = companyReference(raw, { fetchedAt, expectedCik: filing.cik }); }
    catch (e) { skipped.push({ cik: filing.cik, form: filing.form, reason: e.code ?? e.message }); continue; }
    const made = weeklyItemsForCompany(record, JSON.parse(raw), window, { perCompany, seed, week });
    rejected += made.rejected;
    if (!made.items.length) { skipped.push({ cik: filing.cik, form: filing.form, reason: "no new fact among the record's concepts" }); continue; }
    writeFileSync(join(out, "sources", `${filing.cik}.raw.json.gz`), gzipSync(raw));
    used.push({ ...filing, name: record.name, source_url: record.source_url, source_sha256: record.source_sha256, fetched_at: fetchedAt, items: made.items.length });
    items.push(...made.items);
  }
  writeFileSync(join(out, "items.jsonl"), items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : ""));
  const byTemplate = items.reduce((m, i) => ({ ...m, [i.template]: (m[i.template] ?? 0) + 1 }), {});
  const manifest = {
    schema: WEEKLY_SCHEMA, week, window: { start: window.start, end: window.end }, generated_at: generatedAt,
    rule: FRESH_RULE, seed, companies_wanted: companies, per_company: perCompany, forms: [...WEEKLY_FORMS],
    indexes, annual_filers: filers.size, companies: used, skipped, items: items.length, by_template: byTemplate, rejected_by_checker: rejected,
    items_sha256: sha256(items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : "")),
  };
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  console.log(JSON.stringify({ week, annual_filers: filers.size, companies: used.length, items: items.length, by_template: byTemplate, rejected_by_checker: rejected, skipped: skipped.length }));
}
