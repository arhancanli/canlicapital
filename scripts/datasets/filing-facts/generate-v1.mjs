// FilingFacts v1 generator. Adds to v0 (generate.mjs, kept byte-identical because every run record
// binds its bytes) two kinds of item a model cannot answer from memory:
// - fresh: only facts filed after --filed-after, i.e. after a model's training data ends;
// - restatement: the first-reported value of a figure a later annual filing revised, from the raw
//   SEC snapshot (restatements.mjs), checked by its own independent path.
//   node scripts/datasets/filing-facts/generate-v1.mjs <sources-dir> <out.jsonl> [--per-company 5]
//     [--seed 20261007] [--filed-after YYYY-MM-DD] [--no-restatements]
// <sources-dir> holds <cik>.json records and <cik>.raw.json.gz snapshots (fetch-sources.mjs).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { checkItem } from "./check.mjs";
import { mulberry32 } from "./generate.mjs";
import { checkRestatement, restatementItem } from "./restatements.mjs";
import { TEMPLATES, annualFacts } from "./templates.mjs";

export const SCHEMA_V1 = "canli.filing-facts-item.v1";

// filedAfter keeps only facts filed after that date. A comparative year re-reported in a newer annual
// report carries that report's filing date, so year-over-year templates still have two periods.
export function freshFacts(facts, filedAfter) {
  if (!filedAfter) return facts;
  const out = new Map();
  for (const [tag, entry] of facts) {
    const kept = entry.facts.filter((f) => f.filed > filedAfter);
    if (kept.length) out.set(tag, { ...entry, facts: kept });
  }
  return out;
}

// v0's round-robin over its templates, on the (optionally fresh) facts.
export function v1ItemsForCompany(record, { perCompany, seed, filedAfter }) {
  const facts = freshFacts(annualFacts(record), filedAfter);
  if (!facts.size) return [];
  const rng = mulberry32(seed ^ Number(record.cik));
  const names = Object.keys(TEMPLATES);
  const items = [];
  const seen = new Set();
  for (let attempt = 0; items.length < perCompany && attempt < perCompany * 8; attempt++) {
    const template = names[items.length % names.length];
    const made = TEMPLATES[template](record, facts, rng);
    if (!made || seen.has(made.question)) continue;
    seen.add(made.question);
    const item = { schema: SCHEMA_V1, template, company: { cik: record.cik, name: record.name }, ...made };
    item.id = createHash("sha256").update(JSON.stringify([item.company.cik, item.template, item.question])).digest("hex").slice(0, 16);
    items.push(item);
  }
  return items;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, out] = process.argv.slice(2);
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const perCompany = Number(arg("per-company") ?? 5), seed = Number(arg("seed") ?? 20261007), filedAfter = arg("filed-after");
  const restatements = !process.argv.includes("--no-restatements");
  if (filedAfter && !/^\d{4}-\d{2}-\d{2}$/.test(filedAfter)) throw new RangeError("--filed-after must be YYYY-MM-DD");
  const split = filedAfter ? `filed-after-${filedAfter}` : "all";
  const files = readdirSync(dir).filter((f) => /^\d{10}\.json$/.test(f)).sort();
  const items = [], failures = [];
  for (const f of files) {
    const record = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const item of v1ItemsForCompany(record, { perCompany, seed, filedAfter })) {
      const problems = checkItem(item, record);
      if (problems.length) failures.push({ id: item.id, template: item.template, problems }); else items.push({ ...item, split });
    }
    const rawPath = join(dir, `${record.cik}.raw.json.gz`);
    if (restatements && existsSync(rawPath)) {
      const raw = JSON.parse(gunzipSync(readFileSync(rawPath)));
      const item = restatementItem(record, raw, mulberry32(seed ^ Number(record.cik) ^ 0x5e57), { filedAfter });
      if (item) { const problems = checkRestatement(item, raw); if (problems.length) failures.push({ id: item.id, template: item.template, problems }); else items.push({ ...item, split }); }
    }
  }
  writeFileSync(out, items.map((i) => JSON.stringify(i)).join("\n") + "\n");
  const byTemplate = items.reduce((m, i) => ({ ...m, [i.template]: (m[i.template] ?? 0) + 1 }), {});
  console.log(JSON.stringify({ companies: files.length, items: items.length, rejected_by_checker: failures.length, by_template: byTemplate, seed, per_company: perCompany, split, restatements }));
  if (failures.length) console.log(JSON.stringify(failures.slice(0, 5)));
}
