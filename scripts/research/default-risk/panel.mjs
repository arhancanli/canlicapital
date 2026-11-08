// The panel default_risk v1 is validated on: one row per original annual report (form 10-K) in the SEC's bulk
// companyfacts archive, with the figures that report gave for its own fiscal year (balances at the year's end, flows
// over the year ending then, last year's net income as the same report restated it), and the day it was filed. Only
// what the report itself said: later amendments and restatements are other filings and are not read.
// Run: node scripts/research/default-risk/panel.mjs companyfacts.zip > panel.csv
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

function readAt(fd, length, position) {
  const buf = Buffer.alloc(length);
  for (let n = 0; n < length;) { const got = readSync(fd, buf, n, length - n, position + n); if (!got) throw new Error("The zip file ends early"); n += got; }
  return buf;
}
// The zip's entries one at a time (as mcp-books/scripts/sec-sweep.mjs reads them); zip64 refused.
function* zipEntries(path) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size, tail = readAt(fd, Math.min(size, 22 + 0xffff), Math.max(0, size - 22 - 0xffff));
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) throw new Error(`${path} is not a zip file`);
    const [count, dirSize, dirOffset] = [tail.readUInt16LE(end + 10), tail.readUInt32LE(end + 12), tail.readUInt32LE(end + 16)];
    if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) throw new Error("zip64 is not read");
    const dir = readAt(fd, dirSize, dirOffset);
    for (let i = 0, at = 0; i < count; i++) {
      const method = dir.readUInt16LE(at + 10), compressed = dir.readUInt32LE(at + 20), local = dir.readUInt32LE(at + 42), nameLength = dir.readUInt16LE(at + 28);
      const name = dir.toString("utf8", at + 46, at + 46 + nameLength);
      at += 46 + nameLength + dir.readUInt16LE(at + 30) + dir.readUInt16LE(at + 32);
      const header = readAt(fd, 30, local), data = readAt(fd, compressed, local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28));
      yield { name, bytes: method === 8 ? inflateRawSync(data) : data };
    }
  } finally { closeSync(fd); }
}

// Each figure: the concepts tried in order (the first the report used wins).
export const CONCEPTS = {
  total_assets: ["Assets"],
  total_liabilities: ["Liabilities"],
  liabilities_and_equity: ["LiabilitiesAndStockholdersEquity"],
  current_assets: ["AssetsCurrent"],
  current_liabilities: ["LiabilitiesCurrent"],
  retained_earnings: ["RetainedEarningsAccumulatedDeficit"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash"],
  net_income: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
  operating_income: ["OperatingIncomeLoss"],
  operating_cash_flow: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"],
  interest_expense: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestPaidNet", "InterestPaid"],
  long_term_debt: ["LongTermDebtNoncurrent", "LongTermDebt"],
};
const FLOWS = new Set(["net_income", "operating_income", "operating_cash_flow", "revenue", "interest_expense"]);
const FIELDS = Object.keys(CONCEPTS);
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

export function reportsOf(json, cik = json.cik) {
  const gaap = json.facts?.["us-gaap"];
  if (!gaap?.Assets) return [];
  const usd = (c) => gaap[c]?.units?.USD ?? [];
  // The original 10-Ks: their accession, filing day and own fiscal year end (the latest Assets balance they report).
  const reports = new Map();
  for (const f of usd("Assets")) {
    if (f.form !== "10-K") continue;
    const r = reports.get(f.accn);
    if (!r) reports.set(f.accn, { accn: f.accn, filed: f.filed, end: f.end });
    else if (f.end > r.end) r.end = f.end;
  }
  const out = [];
  for (const r of reports.values()) {
    const row = { cik: Number(cik), accn: r.accn, filed: r.filed, fy_end: r.end };
    if (days(r.end, r.filed) > 400 || days(r.end, r.filed) < 0) continue;
    for (const field of FIELDS) {
      row[field] = null;
      for (const c of CONCEPTS[field]) {
        const hit = usd(c).find((f) => f.accn === r.accn && f.end === r.end && (FLOWS.has(field) ? f.start && Math.abs(days(f.start, f.end) - 365) <= 20 : !f.start));
        if (hit) { row[field] = hit.val; break; }
      }
    }
    row.net_income_prior = null;
    for (const c of CONCEPTS.net_income) {
      const hit = usd(c).find((f) => f.accn === r.accn && f.start && Math.abs(days(f.end, r.end) - 365) <= 20 && Math.abs(days(f.start, f.end) - 365) <= 20);
      if (hit) { row.net_income_prior = hit.val; break; }
    }
    out.push(row);
  }
  return out;
}

if (process.argv[2]) {
  const cols = ["cik", "accn", "filed", "fy_end", ...FIELDS, "net_income_prior"];
  process.stdout.write(`${cols.join(",")}\n`);
  let companies = 0, rows = 0, unread = 0;
  for (const { name, bytes } of zipEntries(process.argv[2])) {
    if (!name.endsWith(".json")) continue;
    let json; try { json = JSON.parse(bytes.toString("utf8")); } catch { unread += 1; continue; }
    const reps = reportsOf(json, json.cik ?? Number(name.replace(/\D/g, "")));
    if (reps.length) companies += 1;
    for (const r of reps) { process.stdout.write(`${cols.map((c) => r[c] ?? "").join(",")}\n`); rows += 1; }
    if (companies % 2000 === 1 && reps.length) process.stderr.write(`${companies} companies, ${rows} reports\n`);
  }
  process.stderr.write(`done: ${companies} companies, ${rows} reports, ${unread} unreadable\n`);
}
