// Share counts reconciled filing by filing: the cover page's count, the balance sheet's shares outstanding and
// issued at the period's end, and the weighted averages behind basic and diluted earnings per share. They count
// different things on different dates, so they differ, often by a lot (treasury shares, several classes). What
// cannot be ordinary is flagged: a count about a thousand or a million times the others in the same filing (a
// scale slip, like the shares authorized and issued Apple filed in thousands in an April 2014 10-Q), fewer shares
// issued than outstanding, or a diluted average below the basic one.
import { z } from "zod";

export const sharesInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  filings: z.number().int().min(1).max(80).optional().describe("How many filings, newest first; default 12."),
}).strict();

export const SHARES_TOOL = Object.freeze({
  name: "reconcile_shares", pack: "desk", toolset: "desk", title: "Reconcile a filing's shares: cover page, balance sheet, EPS", input: sharesInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  description: "The share counts in each filing side by side (cover page, outstanding and issued at the period's end, the basic and diluted weighted averages behind EPS), with what cannot be ordinary flagged: a count about a thousand or a million times the others (a scale slip), fewer shares issued than outstanding, or a diluted average below the basic one.",
  keywords: "reconcile reconciliation cover page issued weighted average diluted basic eps denominator scale slip filed in thousands mismatch data quality",
  args: "company: string, filings?: integer",
});

const CONCEPTS = { cover: "dei:EntityCommonStockSharesOutstanding", outstanding: "CommonStockSharesOutstanding", issued: "CommonStockSharesIssued", basic: "WeightedAverageNumberOfSharesOutstandingBasic", diluted: "WeightedAverageNumberOfDilutedSharesOutstanding" };
const FACTORS = [[1e3, "a thousand"], [1e6, "a million"]];

// About f times, or 1/f, within 30%.
const scaleOf = (x, ref) => {
  if (!(x > 0 && ref > 0)) return null;
  const r = x / ref;
  for (const [f, words] of FACTORS) {
    if (Math.abs(r / f - 1) < 0.3) return `about ${words} times`;
    if (Math.abs(r * f - 1) < 0.3) return `about a ${words.replace(/^a /, "")}th of`;
  }
  return null;
};

export async function runShares(ctx, args) {
  const a = sharesInput.parse(args ?? {});
  // One read a count: a company that does not tag one of them (Alphabet has no total on its cover page) still has
  // the others.
  const read = await Promise.all(Object.entries(CONCEPTS).map(([key, concept]) => ctx.call("history", { company: a.company, concept, periods: "all", basis: "first_reported", limit: 200 }).then((r) => [key, r], () => [key, null])));
  const r = read.find(([, x]) => x)?.[1] ?? null;
  if (!r) throw new Error(`${a.company} tags none of these share counts: ${Object.values(CONCEPTS).join(", ")}.`);
  const filings = new Map();
  for (const [key, series] of read) {
    if (!series) continue;
    for (const row of series.rows ?? []) {
      const o = Object.fromEntries(series.columns.map((c, i) => [c, row[i]]));
      if (typeof o.accn !== "string" || typeof o.val !== "number") continue;
      const f = filings.get(o.accn) ?? { accn: o.accn, filed: o.filed, form: o.form, end: null, counts: {} };
      if (key !== "cover") f.end = !f.end || o.end > f.end ? o.end : f.end;
      // For each count, the period that ends latest; of the weighted averages, the shortest one (the quarter).
      const had = f.counts[key];
      const span = o.start ? Date.parse(o.end) - Date.parse(o.start) : 0;
      if (!had || o.end > had.end || (o.end === had.end && span < had.span)) f.counts[key] = { val: o.val, end: o.end, span };
      filings.set(o.accn, f);
    }
  }
  const rows = [...filings.values()].sort((x, y) => String(y.filed).localeCompare(String(x.filed))).slice(0, a.filings ?? 12).map((f) => {
    const c = Object.fromEntries(Object.entries(f.counts).map(([k, v]) => [k, v.val]));
    // Each count against the middle of the filing's counts, so the one that slipped is the one named.
    const sorted = Object.values(c).filter((x) => x > 0).sort((x, y) => x - y);
    const middle = sorted.length >= 3 ? sorted[Math.floor(sorted.length / 2)] : null;
    const flags = [];
    for (const k of ["cover", "outstanding", "issued", "basic", "diluted"]) {
      const s = c[k] !== undefined && middle ? scaleOf(c[k], middle) : null;
      if (s) flags.push(`${k} is ${s} the filing's other counts: a scale slip`);
    }
    if (c.issued !== undefined && c.outstanding !== undefined && c.issued < c.outstanding * 0.99 && !flags.length) flags.push("fewer shares issued than outstanding");
    if (c.diluted !== undefined && c.basic !== undefined && f.counts.diluted.end === f.counts.basic.end && f.counts.diluted.span === f.counts.basic.span && c.diluted < c.basic * 0.999) flags.push("the diluted average is below the basic one");
    return [f.filed, f.form, f.accn, f.end, c.cover ?? null, c.outstanding ?? null, c.issued ?? null, c.basic ?? null, c.diluted ?? null, flags.length ? flags : null];
  });
  const flagged = rows.filter((x) => x[9]);
  return {
    company: r.company ?? { name: a.company },
    filings: rows.length,
    flagged: flagged.length,
    columns: ["filed", "form", "accession", "period_end", "cover_page", "outstanding", "issued", "basic_weighted", "diluted_weighted", "flags"],
    rows,
    reading: flagged.length ? `${flagged.length} of ${rows.length} filings have a share count that cannot be ordinary; read the flagged filing (accession) and the count it names.` : `Nothing in ${rows.length} filings that cannot be ordinary.`,
    limits: [
      "Each count is the value as the filing first reported it, for the latest period it gives; the weighted averages are the shortest period (the quarter).",
      "Counts that differ by treasury shares, several share classes or the days between the period's end and the cover page's date are not flagged: only a count about a thousand or a million times another, fewer shares issued than outstanding, or a diluted average below the basic one.",
      "A count the company tags only by share class is not in these figures.",
    ],
  };
}
