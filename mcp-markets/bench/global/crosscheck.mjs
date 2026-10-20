// The global tools against sources they do not read (node bench/global/crosscheck.mjs, live):
// - european_filings against the same companies' annual reports on Form 20-F at the SEC (IFRS facts
//   from SEC's companyfacts API: a different filing, filed with a different regulator);
// - the ECB's and the Bank of England's own policy rates against the policy rates the BIS collects
//   for the euro area and the UK, and the New York Fed's target range against the BIS's US rate.
// Writes results-YYYY-MM-DD.json beside this file.
import { writeFileSync } from "node:fs";

import { europeanFilings } from "../../src/esef.mjs";
import { referenceRates } from "../../src/rates.mjs";
import { createSession, getJson } from "../../src/sources.mjs";

const s = createSession();
const checks = [];
const add = (name, expected, got, source) => { const pass = expected !== null && got !== null && Math.abs(expected - got) <= Math.abs(expected) * 1e-9 + 1e-9; checks.push({ name, expected, got, pass, source }); };

// IFRS figures a foreign issuer files on Form 20-F, by fiscal year.
async function secIfrs(cik, concept, year) {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`;
  const facts = await getJson(s, url);
  const units = facts?.facts?.["ifrs-full"]?.[concept]?.units ?? {};
  for (const rows of Object.values(units)) {
    const hit = rows.filter((r) => r.form === "20-F" && r.start?.startsWith(`${year}-`) && r.end?.startsWith(`${year}-`)).at(-1);
    if (hit) return { value: hit.val, url };
  }
  return { value: null, url };
}

const COMPANIES = [
  { name: "TotalEnergies", lei: "529900S21EQ1BO4ESM68", cik: 879764, years: [2024, 2025] },
  { name: "Novo Nordisk", lei: "549300DAQ1CVT6CXN342", cik: 353278, years: [2024, 2025] },
  { name: "Shell", lei: "21380068P1DRHMJ8KU70", cik: 1306965, years: [2024, 2025] },
];
for (const c of COMPANIES) {
  for (const year of c.years) {
    let esef;
    try { esef = await europeanFilings(s, { company: c.lei, year }); } catch (e) { checks.push({ name: `${c.name} ${year}`, error: e.message }); continue; }
    for (const [measure, concepts] of [["revenue", ["Revenue", "RevenueFromContractsWithCustomers"]], ["net_income", ["ProfitLoss"]]]) {
      const row = esef.facts.rows.find((r) => r[0] === measure && r[2].startsWith(`${year}-`));
      let sec = { value: null };
      for (const concept of concepts) { sec = await secIfrs(c.cik, concept, year); if (sec.value !== null) break; }
      add(`${c.name} ${year} ${measure}: ESEF against 20-F`, sec.value, row ? row[3] : null, sec.url);
    }
  }
}

// The rate in effect on a date from a series of dated rows (the last row on or before it).
const onDate = (rows, date) => rows.filter((r) => r[0] <= date).at(-1)?.[1] ?? null;
const DATES = ["2026-03-31", "2026-06-30", "2026-09-30"];
const pairs = [
  ["ECB deposit facility rate against the BIS euro-area policy rate", "ecb_deposit", "policy:XM"],
  ["Bank of England Bank Rate against the BIS UK policy rate", "bank_rate", "policy:GB"],
];
for (const [name, own, bis] of pairs) {
  const a = await referenceRates(s, { rate: own, start: "2026-01-01", end: "2026-10-06" });
  const b = await referenceRates(s, { rate: bis, start: "2026-01-01", end: "2026-10-06" });
  for (const d of DATES) add(`${name} on ${d}`, onDate(b.rows, d), onDate(a.rows, d), b.source);
}
const effr = await referenceRates(s, { rate: "effr", start: "2026-01-01", end: "2026-10-06" });
const us = await referenceRates(s, { rate: "policy:US", start: "2026-01-01", end: "2026-10-06" });
for (const d of DATES) {
  const row = effr.rows.filter((r) => r[0] <= d).at(-1);
  const from = row?.[effr.columns.indexOf("target_from")], to = row?.[effr.columns.indexOf("target_to")];
  const bis = onDate(us.rows, d);
  checks.push({ name: `New York Fed target range against the BIS US policy rate on ${d}`, expected: bis, got: [from, to], pass: bis !== null && from !== undefined && bis >= from && bis <= to, source: us.source });
}

const summary = { passed: checks.filter((c) => c.pass).length, of: checks.length };
console.log(JSON.stringify({ summary, failed: checks.filter((c) => !c.pass) }, null, 1));
writeFileSync(new URL(`results-${new Date().toISOString().slice(0, 10)}.json`, import.meta.url), JSON.stringify({ ran: new Date().toISOString(), node: process.version, summary, checks }, null, 1) + "\n");
