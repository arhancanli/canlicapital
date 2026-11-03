// mcp-books/src/data.mjs
//
// Canli Data: a table packed as a dataset others can check. The rows as CSV, the SHA-256 of that CSV, and a
// dataset card in Hugging Face's README format (YAML front matter, then what the data is, where it came from,
// its columns and its licence). The card carries the source and the checksum, so anyone can confirm the file
// is the one described.
//
// The first pack: SEC facts as first filed. From a company's companyfacts JSON (data.sec.gov), one row per
// concept, unit and period, with the value in the first filing that reported it, the value in the latest, and
// how many different values the filings gave in between.
import { createHash } from "node:crypto";

import { SEC_FORMS, secTaxonomy } from "./report.mjs";

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

// columns: [{ name, description }]; rows: objects with a value for every column (null for an empty cell).
export function packDataset({ name, title, description = "", source, license, columns, rows } = {}) {
  if (!/^[a-z0-9][a-z0-9-]{1,95}$/.test(name ?? "")) throw new Error("name must be lower-case letters, digits and dashes, as a dataset id");
  if (!source) throw new Error("A dataset needs its source");
  if (!license) throw new Error("A dataset needs a licence, such as cc0-1.0 or mit");
  if (!Array.isArray(columns) || !columns.length) throw new Error("columns must name each column");
  if (!Array.isArray(rows)) throw new Error("rows must be a list");
  rows.forEach((row, i) => {
    const missing = columns.filter((c) => !(c.name in row)).map((c) => c.name);
    if (missing.length) throw new Error(`Row ${i + 1} has no ${missing.join(", ")}`);
  });
  const csv = `${[columns.map((c) => cell(c.name)).join(","), ...rows.map((row) => columns.map((c) => cell(row[c.name])).join(","))].join("\n")}\n`;
  const sha256 = createHash("sha256").update(csv).digest("hex");
  const card = [
    "---",
    `license: ${license}`,
    `pretty_name: ${JSON.stringify(title ?? name)}`,
    "configs:",
    "- config_name: default",
    "  data_files:",
    "  - split: train",
    "    path: data.csv",
    "---",
    "",
    `# ${title ?? name}`,
    "",
    description,
    "",
    `Source: ${source}`,
    "",
    `${rows.length} rows in data.csv, SHA-256 ${sha256}.`,
    "",
    "| Column | Meaning |",
    "| --- | --- |",
    ...columns.map((c) => `| ${c.name} | ${String(c.description ?? "").replaceAll("|", "\\|")} |`),
    "",
  ].join("\n");
  return { name, rows: rows.length, csv, sha256, card };
}

// Annual and quarterly reports and their amendments, where restated figures are filed.
export const FIRST_FILED_FORMS = SEC_FORMS.flatMap((form) => [form, `${form}/A`]);

const filing = (prefix) => [
  { name: `${prefix}_value`, description: `The value in the ${prefix} filing that reported it, in whole units as filed` },
  { name: `${prefix}_accession`, description: "That filing's accession number, which names it on EDGAR" },
  { name: `${prefix}_form`, description: "That filing's form, such as 10-K or 10-Q/A" },
  { name: `${prefix}_filed`, description: "The date that filing reached EDGAR" },
];
export const FIRST_FILED_COLUMNS = [
  { name: "cik", description: "The company's SEC Central Index Key" },
  { name: "entity", description: "The company's name as the SEC gives it" },
  { name: "taxonomy", description: "us-gaap or ifrs-full" },
  { name: "concept", description: "The XBRL concept, such as Revenues" },
  { name: "unit", description: "The unit, such as USD, shares or USD/shares" },
  { name: "start", description: "The first day of the period; empty for a balance at a date" },
  { name: "end", description: "The last day of the period, or the date of a balance" },
  ...filing("first"),
  ...filing("latest"),
  { name: "filings", description: "How many filings reported a value for it" },
  { name: "values", description: "How many different values those filings gave; above 1, it changed after it was first filed (a restatement, a reclassification or a correction: read the filings named)" },
];

const byFiling = (a, b) => (a.filed !== b.filed ? (a.filed < b.filed ? -1 : 1) : a.accn < b.accn ? -1 : a.accn > b.accn ? 1 : 0);
const byPeriod = (a, b) => {
  for (const k of ["concept", "unit", "end", "start"]) {
    const [x, y] = [a[k] ?? "", b[k] ?? ""];
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

// One company's facts as first filed, in the rows of FIRST_FILED_COLUMNS, sorted by concept, unit and period.
export function firstFiled(companyfacts, { taxonomy, forms = FIRST_FILED_FORMS } = {}) {
  const tax = taxonomy ?? secTaxonomy(companyfacts);
  const rows = [];
  for (const [concept, body] of Object.entries(companyfacts.facts[tax] ?? {})) {
    for (const [unit, list] of Object.entries(body?.units ?? {})) {
      const periods = new Map();
      for (const fact of list) {
        if (!forms.includes(fact.form)) continue;
        const key = `${fact.start ?? ""}|${fact.end}`;
        if (!periods.has(key)) periods.set(key, []);
        periods.get(key).push(fact);
      }
      for (const facts of periods.values()) {
        facts.sort(byFiling);
        const [first, latest] = [facts[0], facts.at(-1)];
        const side = (prefix, f) => ({ [`${prefix}_value`]: f.val, [`${prefix}_accession`]: f.accn, [`${prefix}_form`]: f.form, [`${prefix}_filed`]: f.filed });
        rows.push({ cik: companyfacts.cik ?? null, entity: companyfacts.entityName ?? null, taxonomy: tax, concept, unit, start: first.start ?? null, end: first.end, ...side("first", first), ...side("latest", latest), filings: new Set(facts.map((f) => f.accn)).size, values: new Set(facts.map((f) => f.val)).size });
      }
    }
  }
  return rows.sort(byPeriod);
}
