// Checks cross_section against an independent Python selection over the same SEC snapshots:
// 20 companies x 3 dates, exact tag NetIncomeLoss, annual. Reads the live site (the snapshots are
// hash-checked and cached on disk), so it is a research check, not a CI test.
//   node scripts/research/fundamentals-pit-check/run.mjs [cache dir]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createSession, resolveCompany, toolCrossSection } from "../../../mcp-fundamentals/src/server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPANIES = ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "JPM", "0000034088", "WMT", "KR", "JNJ", "PG", "KO", "PEP", "INTC", "CSCO", "ORCL", "NKE", "COST", "DIS", "MCD"];
const DATES = ["2012-06-30", "2018-03-15", "2023-11-01"];
const cacheDir = process.argv[2] ?? mkdtempSync(join(tmpdir(), "canli-pit-"));
const session = createSession({ cacheDir });

const ours = [];
for (const asOf of DATES) {
  const r = (await toolCrossSection(session, { companies: COMPANIES, concept: "NetIncomeLoss", as_of: asOf })).structuredContent;
  const col = Object.fromEntries(r.columns.map((c, i) => [c, i]));
  for (const row of r.rows) ours.push({ cik: row[col.cik], as_of: asOf, pick: { end: row[col.end], start: row[col.start], val: row[col.val], filed: row[col.filed], accn: row[col.accn], changed_after: row[col.changed_after] } });
  // A company with no value is compared too: the reference must also find none.
  const found = new Set(r.rows.map((row) => row[col.company]));
  for (const company of COMPANIES.filter((c) => !found.has(c))) {
    const { cik } = await resolveCompany(session, company);
    ours.push({ cik, as_of: asOf, pick: null });
  }
}
const cases = ours.filter((o) => o.cik).map((o) => {
  const record = JSON.parse(readFileSync(join(cacheDir, `company-${o.cik}.json`), "utf8")).body;
  return { cik: o.cik, as_of: o.as_of, snapshot: join(cacheDir, `${record.source_sha256}.json.gz`) };
});
const file = join(mkdtempSync(join(tmpdir(), "canli-pit-cases-")), "cases.json");
writeFileSync(file, JSON.stringify(cases));
const ref = JSON.parse(execFileSync("uv", ["run", "-q", "python", join(HERE, "reference.py"), file], { encoding: "utf8", maxBuffer: 1 << 24 }));
let match = 0;
const diffs = [];
for (const o of ours.filter((x) => x.cik)) {
  const r = ref.find((x) => x.cik === o.cik && x.as_of === o.as_of);
  if (JSON.stringify(r.pick) === JSON.stringify(o.pick)) match += 1;
  else diffs.push({ cik: o.cik, as_of: o.as_of, ours: o.pick, reference: r.pick });
}
const none = ours.filter((o) => o.pick === null).length;
console.log(JSON.stringify({ compared: match + diffs.length, match, of_which_no_value_on_both_sides: none - diffs.filter((d) => d.ours === null).length, diffs: diffs.slice(0, 5) }, null, 1));
