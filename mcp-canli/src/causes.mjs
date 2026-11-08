// Why a company's figures were restated, from what it filed. The fundamentals pack lists every period whose value
// a later filing changed; here those changes are grouped by the filing that made them, and each group is set
// against the company's own notices: an 8-K under Item 4.02, which a company files when its earlier statements can
// no longer be relied on (an error), an amended 10-K or 10-Q filed that day, a stock split, or a value moved to
// another tag. What none of those explains is said to be broad (many values in one filing: a new accounting
// standard, discontinued operations, new segments) or narrow (a few values: a reclassification or a correction),
// with the filing to read. It reports what the filings show and stops there.
import { z } from "zod";

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
export const causesInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  periods: z.enum(["annual", "quarterly", "all"]).optional().describe("Default annual."),
  since: DAY.optional().describe("Restatements filed from this date; default 2009-01-01."),
}).strict();

export const CAUSES_TOOL = Object.freeze({
  name: "restatement_causes", pack: "desk", toolset: "desk", title: "Why a company's figures were restated", input: causesInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  description: "A company's restated figures grouped by the filing that changed them, each set against its own notices: an 8-K non-reliance notice (Item 4.02, an error), an amended 10-K or 10-Q, a stock split, or a value moved to another tag; otherwise broad (many values: a new standard, discontinued operations, new segments) or narrow (a reclassification or a correction), with the filing to read.",
  keywords: "restatement cause why restated error non-reliance 4.02 amended 10-K/A reclassification restated financials accounting change revision",
  args: "company: string, periods?: annual|quarterly|all, since?: date",
});

// Values one filing changed at or above this are a broad recast. Pages of restatements read at most.
const BROAD = 10, PAGES = 20;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
const tableOf = (r) => (r && Array.isArray(r.columns) && Array.isArray(r.rows) ? r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))) : []);

export async function runCauses(ctx, args) {
  const a = causesInput.parse(args ?? {});
  const since = a.since ?? "2009-01-01";
  // A company that filed no such notice or amendment is an answer, not a failure; anything else is unavailable.
  const quiet = (name, args) => ctx.call(name, args).catch((e) => (/filed no /.test(String(e?.message ?? e)) ? { columns: [], rows: [] } : null));
  // The restatements come in pages cut to a size; every page is read, up to PAGES of them.
  const pages = async () => {
    const out = [];
    for (let offset = 0, i = 0; i < PAGES; i++) {
      const r = await ctx.call("restatements", { company: a.company, periods: a.periods ?? "annual", include_splits: true, limit: 400, offset });
      out.push(r);
      if (!Number.isInteger(r?.next_offset)) break;
      offset = r.next_offset;
    }
    return out;
  };
  const [read, notices, amended] = await Promise.all([
    pages(),
    quiet("company_events", { company: a.company, event: "restatement", since, limit: 40 }),
    quiet("list_filings", { company: a.company, forms: ["10-K/A", "10-Q/A", "20-F/A"], since, limit: 50 }),
  ]);
  const restated = read[0];
  const rows = read.flatMap(tableOf).filter((r) => typeof r.latest_filed === "string" && r.latest_filed >= since);
  const fourOhTwo = tableOf(notices).filter((n) => Array.isArray(n.items) && n.items.includes("4.02"));
  const amendments = tableOf(amended);
  const groups = new Map();
  for (const r of rows) groups.set(r.latest_filed, [...(groups.get(r.latest_filed) ?? []), r]);
  const out = [...groups].sort((x, y) => y[0].localeCompare(x[0])).map(([on, list]) => {
    const notice = fourOhTwo.filter((n) => n.filed <= on && days(n.filed, on) <= 400).sort((x, y) => y.filed.localeCompare(x.filed))[0];
    const amendment = amendments.find((f) => f.filed === on);
    const all = (cause) => list.every((r) => r.cause === cause || (cause === "split" && r.cause === "split_likely"));
    const [cause, evidence] = notice
      ? ["error: non-reliance notice", `8-K Item 4.02 filed ${notice.filed} (${notice.accession}): the company said earlier statements could no longer be relied on`]
      : amendment
        ? ["amended report", `${amendment.form} filed ${on} (${amendment.accession}) for the period ending ${amendment.period ?? "?"}`]
        : all("split")
          ? ["stock split", "every change is a share count or per-share figure scaled by a split"]
          : all("tag_change")
            ? ["moved to another tag", "the value is now reported under a different XBRL tag"]
            : list.length >= BROAD
              ? ["broad recast", `${list.length} values changed in one filing: a new accounting standard, discontinued operations or new segments; read the filing`]
              : ["narrow change", "a few values changed: a reclassification or a correction; read the filing"];
    const examples = [...list].sort((x, y) => Math.abs(y.change_pct ?? 0) - Math.abs(x.change_pct ?? 0)).slice(0, 3).map((r) => `${r.concept} ${r.end}: ${r.first_val} to ${r.latest_val}${r.change_pct == null ? "" : ` (${r.change_pct > 0 ? "+" : ""}${r.change_pct}%)`}`);
    return [on, list.length, cause, evidence, examples];
  });
  const counts = {};
  for (const [, n, cause] of out) counts[cause] = (counts[cause] ?? 0) + n;
  return {
    company: restated?.company ?? { name: a.company },
    since,
    periods: a.periods ?? "annual",
    restating_filings: out.length,
    values: rows.length,
    ...(Number.isInteger(read.at(-1)?.next_offset) ? { more: `only the first ${PAGES} pages of restatements were read` } : {}),
    values_by_cause: counts,
    columns: ["restated_on", "values", "cause", "evidence", "largest_changes"],
    rows: out,
    ...(notices ? {} : { unavailable: ["8-K notices could not be read, so no change is set against a non-reliance notice"] }),
    ...(amended ? {} : { unavailable_filings: "the list of amended reports could not be read" }),
    limits: [
      "A filing is matched to a non-reliance notice when the notice came in the 400 days before it; the notice says an error was found, not which figures it touched.",
      "Broad and narrow are counts, not causes: read the filing (restated_on, then list_filings) for what the company says changed.",
      "Restatements lists each period's latest change only, so a period changed twice is counted once, under the later filing.",
    ],
  };
}
