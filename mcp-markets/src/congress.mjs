// congress_trades: the stock and bond trades members of the House report, from the reports themselves. The
// Clerk's yearly index of financial disclosures names every periodic transaction report (who filed, when,
// its document number); each report is a PDF, read here line by line (pdf.mjs) into its transactions: the
// owner, the asset and its ticker, purchase or sale, the trade date, the date the member was told of it, and
// the amount range the law asks for. A report filed on paper is a scanned image with no text, and says so.
import { z } from "zod";

import { pdfLines } from "./pdf.mjs";
import { getZipText, NotFound } from "./sources.mjs";

const CLERK = "https://disclosures-clerk.house.gov/public_disc";
const OWNERS = Object.freeze({ SP: "spouse", JT: "joint", DC: "dependent child" });
const TYPES = Object.freeze({ P: "purchase", S: "sale", "S (partial)": "partial sale", E: "exchange" });

export const congressInput = z.object({
  member: z.string().min(2).max(60).optional().describe("Part of a member's name: \"Pelosi\", \"Kevin Hern\"."),
  district: z.string().regex(/^[A-Za-z]{2}(\d{2})?$/, "a state (CA) or a district (CA11)").optional().describe("A state's members (\"TX\") or one district (\"CA11\")."),
  ticker: z.string().min(1).max(10).optional().describe("Only trades in this ticker, among the reports read."),
  year: z.number().int().min(2008).max(2100).optional().describe("The year the reports were filed; default this year."),
  reports: z.number().int().min(1).max(40).optional().describe("How many reports to read, newest first; default 10."),
}).strict();

// The index: one line per filing, tab-separated, with a header (Prefix, Last, First, Suffix, FilingType,
// StateDst, Year, FilingDate as M/D/YYYY, DocID).
export function parseIndex(text) {
  const [head, ...lines] = String(text).split(/\r?\n/).filter(Boolean);
  const cols = head.split("\t");
  return lines.map((l) => Object.fromEntries(l.split("\t").map((v, i) => [cols[i], v.trim()]))).map((r) => {
    const [m, d, y] = String(r.FilingDate ?? "").split("/");
    return { name: [r.Prefix, r.First, r.Last, r.Suffix].filter(Boolean).join(" "), district: r.StateDst, type: r.FilingType, filed: y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : null, doc: r.DocID, year: r.Year };
  });
}

const AMOUNT = /^(?:(?:Spouse\/DC )?Over )?\$[\d,]+(?: - (?:\$[\d,]+)?)?$/;
const money = (s) => Number(String(s).replace(/[$,]/g, ""));
function amountRange(s) {
  const t = String(s ?? "").trim();
  if (/Over \$/.test(t)) return [money(t.split("Over ")[1]) + 1, null];
  const [lo, hi] = t.split(" - ");
  return [lo ? money(lo) : null, hi ? money(hi) : null];
}
// A transaction's first line: owner, asset, type with its date, the date the filer was notified, the amount.
const MAIN = /^(?:(SP|JT|DC)\t)?(.+?)\t(S \(partial\)|P|S|E)\t?(\d{2}\/\d{2}\/\d{4})\t(\d{2}\/\d{2}\/\d{4})(?:\t(.*))?$/;
// A label line of the report's own (Filing Status, Subholding Of, Description, Comments) ends a transaction.
const LABEL = /^[A-Z][^\t:]{0,40}:/;
const iso = (mdy) => { const [m, d, y] = mdy.split("/"); return `${y}-${m}-${d}`; };

// The transactions in a report's text.
export function parseReport(text) {
  const lines = String(text).split(/\n|\f/), out = [];
  let cur = null;
  const close = () => { if (cur) out.push(cur); cur = null; };
  for (const line of lines) {
    const m = MAIN.exec(line);
    if (m) {
      close();
      cur = { owner: OWNERS[m[1]] ?? "self", asset: m[2].replace(/\t/g, " "), type: TYPES[m[3]] ?? m[3], date: iso(m[4]), notified: iso(m[5]), amount: (m[6] ?? "").replace(/\t/g, " ").trim() };
      continue;
    }
    if (!cur) continue;
    if (LABEL.test(line) || /^\* For the complete list/.test(line)) { close(); continue; }
    const parts = line.split("\t").map((s) => s.trim()).filter(Boolean);
    if (parts.length && /^\$[\d,]+$/.test(parts[parts.length - 1]) && /-$/.test(cur.amount)) cur.amount = `${cur.amount} ${parts.pop()}`;
    if (parts.length) cur.asset = `${cur.asset} ${parts.join(" ")}`;
  }
  close();
  return out.map((t) => {
    const ticker = /\(([A-Z][A-Z0-9.\-]{0,9})\)/.exec(t.asset)?.[1] ?? null, kind = /\[([A-Z]{2})\]/.exec(t.asset)?.[1] ?? null;
    const [low, high] = AMOUNT.test(t.amount) ? amountRange(t.amount) : [null, null];
    return { ...t, asset: t.asset.replace(/\s*\[[A-Z]{2}\]\s*/, " ").trim(), ticker, asset_type: kind, amount_low: low, amount_high: high };
  });
}

const pdfText = (bytes) => pdfLines(bytes).map((page) => page.join("\n")).join("\f");

export async function congressTrades(session, args) {
  const a = congressInput.parse(args ?? {});
  const year = a.year ?? new Date(session.now()).getUTCFullYear();
  const index = parseIndex(await getZipText(session, `${CLERK}/financial-pdfs/${year}FD.zip`));
  const who = a.member?.toLowerCase(), where = a.district?.toUpperCase();
  const reports = index.filter((r) => r.type === "P" && r.doc && (!who || r.name.toLowerCase().includes(who)) && (!where || r.district?.startsWith(where)))
    .sort((x, y) => String(y.filed).localeCompare(String(x.filed)) || y.doc.localeCompare(x.doc));
  if (!reports.length) throw new NotFound(`No periodic transaction reports filed in ${year}${a.member ? ` by a member named like "${a.member}"` : ""}${a.district ? ` from ${where}` : ""}.`);
  const read = reports.slice(0, a.reports ?? 10);
  const ticker = a.ticker?.toUpperCase();
  const rows = [], table = [];
  for (const r of read) {
    const url = `${CLERK}/ptr-pdfs/${year}/${r.doc}.pdf`;
    let trades = null;
    try { trades = parseReport(await getZipText(session, url, { decode: pdfText })); } catch { trades = null; }
    // A paper report is a scanned image: no text to read.
    rows.push([r.filed, r.name, r.district, r.doc, trades ? trades.length : null, url]);
    for (const t of trades ?? []) if (!ticker || t.ticker === ticker) table.push([r.filed, r.name, r.district, t.owner, t.asset, t.ticker, t.asset_type, t.type, t.date, t.notified, t.amount_low, t.amount_high, url]);
  }
  return {
    year, reports_matching: reports.length, reports_read: read.length,
    reports: { columns: ["filed", "member", "district", "document", "transactions", "url"], rows, note: "transactions is null for a report filed on paper (a scanned image): read it at its url." },
    transactions: { columns: ["filed", "member", "district", "owner", "asset", "ticker", "asset_type", "type", "date", "notified", "amount_low", "amount_high", "report"], rows: table },
    source: "https://disclosures-clerk.house.gov/FinancialDisclosure",
    limits: [
      "Members of the House, from the Clerk's reports; Senate reports are not read (the Senate's site asks each visitor to accept its terms first).",
      "Amounts are the ranges the STOCK Act asks for, not exact values; asset_type is the report's own code (ST stock, GS government security, OP option, HN hedge fund...).",
      "The Ethics in Government Act makes it unlawful to obtain or use these reports for a commercial purpose other than by news and communications media, to establish anyone's credit rating, or to solicit money.",
      "Not investment advice.",
    ],
  };
}
