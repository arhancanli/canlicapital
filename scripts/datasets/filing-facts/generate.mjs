// Builds a filing-facts item set from a directory of company records (canli.company-reference.v1),
// checks every item with check.mjs, and writes JSONL plus a summary.
//   node scripts/datasets/filing-facts/generate.mjs <records-dir> <out.jsonl> [--per-company 5] [--seed 20260926]
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { checkItem } from "./check.mjs";
import { TEMPLATES, annualFacts } from "./templates.mjs";

export const SCHEMA = "canli.filing-facts-item.v0";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function itemsForCompany(record, { perCompany, seed }) {
  const facts = annualFacts(record);
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
    const item = { schema: SCHEMA, template, company: { cik: record.cik, name: record.name }, ...made };
    item.id = createHash("sha256").update(JSON.stringify([item.company.cik, item.template, item.question])).digest("hex").slice(0, 16);
    items.push(item);
  }
  return items;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, out] = process.argv.slice(2);
  const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const perCompany = flag("per-company", 5), seed = flag("seed", 20260926);
  const files = readdirSync(dir).filter((f) => /^\d{10}\.json$/.test(f)).sort();
  const items = [];
  const failures = [];
  for (const f of files) {
    const record = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const item of itemsForCompany(record, { perCompany, seed })) {
      const problems = checkItem(item, record);
      if (problems.length) failures.push({ id: item.id, template: item.template, problems });
      else items.push(item);
    }
  }
  writeFileSync(out, items.map((i) => JSON.stringify(i)).join("\n") + "\n");
  const byTemplate = items.reduce((m, i) => ({ ...m, [i.template]: (m[i.template] ?? 0) + 1 }), {});
  console.log(JSON.stringify({ companies: files.length, items: items.length, rejected_by_checker: failures.length, by_template: byTemplate, seed, per_company: perCompany }));
  if (failures.length) console.log(JSON.stringify(failures.slice(0, 5)));
}
