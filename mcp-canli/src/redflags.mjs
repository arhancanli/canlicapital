// Red flags to look at before believing a stock someone is promoting: what the company itself filed that careful
// readers check first. Late-filing notices, auditor changes, delisting notices, notices that earlier statements can
// no longer be relied on, shares sold outside a registered offering, changes in control, going-concern language,
// name changes, reverse splits, and the forensic screens. Each line says what was found, with dates and links, or
// that nothing was, or that it could not be checked. Flags to look at, not accusations, and not investment advice.
import { z } from "zod";

export const redFlagsInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  years: z.number().int().min(1).max(10).optional().describe("How far back; default 3."),
}).strict();

export const RED_FLAGS_TOOL = Object.freeze({
  name: "red_flags", pack: "desk", toolset: "desk", title: "Red flags in what a company filed", input: redFlagsInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  description: "What careful readers check before believing a promoted stock, from the company's own filings: late-filing notices, auditor changes, delisting notices, non-reliance notices, unregistered share sales, changes in control, going-concern language, name changes, reverse splits and the forensic screens. Each with dates and links, nothing found, or not checked. Flags to look at, not accusations.",
  keywords: "red flags pump and dump promoted stock penny stock warning signs late filing nt 10-k auditor resigned delisting going concern reverse split shell due diligence fraud risk",
  args: "company: string, years?: integer",
});

// The 8-K items that are flags, in the order a reader would weigh them.
const ITEMS = [["4.02", "Earlier statements can no longer be relied on (8-K Item 4.02)"], ["4.01", "The auditor changed (8-K Item 4.01)"], ["3.01", "A delisting notice or a listing standard missed (8-K Item 3.01)"], ["1.03", "Bankruptcy or receivership (8-K Item 1.03)"], ["2.04", "Debt accelerated (8-K Item 2.04)"], ["5.01", "A change in control (8-K Item 5.01)"], ["3.02", "Shares sold outside a registered offering (8-K Item 3.02)"]];
const tableOf = (r) => (r && Array.isArray(r.columns) && Array.isArray(r.rows) ? r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))) : []);

export async function runRedFlags(ctx, args, { now = Date.now() } = {}) {
  const a = redFlagsInput.parse(args ?? {});
  const since = new Date(now - (a.years ?? 3) * 365.25 * 86400000).toISOString().slice(0, 10);
  // A source that answers "none" is an answer; one that fails is not checked, never "no".
  const read = (name, args) => ctx.call(name, args).then((r) => ({ r }), (e) => (/filed no |no .* found|found no /i.test(String(e?.message ?? e)) ? { r: { columns: [], rows: [] } } : { error: String(e?.message ?? e).slice(0, 160) }));
  const [events, late, concern, profile, splits, forensic] = await Promise.all([
    read("company_events", { company: a.company, since, limit: 40 }),
    read("list_filings", { company: a.company, forms: ["NT 10-K", "NT 10-Q", "NT 20-F"], since, limit: 20 }),
    read("search_filings", { query: "\"substantial doubt\" \"going concern\"", company: a.company, since, limit: 10 }),
    read("company_profile", { company: a.company }),
    read("history", { company: a.company, concept: "StockholdersEquityNoteStockSplitConversionRatio1", periods: "all", limit: 20 }),
    read("forensic_scores", { company: a.company }),
  ]);
  const rows = [];
  const line = (flag, found, evidence, meaning) => rows.push([flag, found, evidence, meaning]);
  const notChecked = (x) => `not checked: ${x.error}`;
  const filings = (list) => list.slice(0, 5).map((f) => `${f.filed} ${f.form ?? ""} ${f.url ?? f.accession ?? ""}`.replace(/\s+/g, " ").trim());

  const lateRows = tableOf(late.r);
  line("Late-filing notices (NT 10-K, NT 10-Q)", late.error ? null : lateRows.length > 0, late.error ? notChecked(late) : filings(lateRows), "A company that cannot file its report on time; repeated, it often goes with accounting trouble.");
  const eventRows = tableOf(events.r);
  for (const [code, flag] of ITEMS) {
    const hits = eventRows.filter((e) => Array.isArray(e.items) && e.items.includes(code));
    line(flag, events.error ? null : hits.length > 0, events.error ? notChecked(events) : filings(hits), code === "3.02" ? "Shares issued privately; many of them, or often, dilute holders." : code === "4.01" ? "Read whether the auditor resigned or was dismissed, and any disagreements the 8-K reports." : "Read the 8-K for what it says.");
  }
  const concernRows = tableOf(concern.r);
  line("Going-concern language (\"substantial doubt\")", concern.error ? null : concernRows.length > 0, concern.error ? notChecked(concern) : filings(concernRows), "The auditor or management doubts the company can keep operating a year without more money.");
  const formers = Array.isArray(profile.r?.former_names) ? profile.r.former_names : [];
  // company_profile gives each former name with the day it was last used (until).
  const recentNames = formers.filter((n) => typeof n?.until === "string" && n.until >= since);
  line("Name changes", profile.error ? null : recentNames.length > 0, profile.error ? notChecked(profile) : recentNames.slice(0, 5).map((n) => `${n.name} (until ${n.until})`), "A new name, often with a new business, is common before a promotion.");
  const reverse = tableOf(splits.r).filter((s) => typeof s.val === "number" && s.val > 0 && s.val < 1 && String(s.end ?? s.filed) >= since);
  line("Reverse splits", splits.error ? (/no concept/i.test(splits.error) ? false : null) : reverse.length > 0, splits.error ? (/no concept/i.test(splits.error) ? [] : notChecked(splits)) : reverse.slice(0, 5).map((s) => `${s.end}: 1 for ${Math.round(1 / s.val)} (${s.form ?? ""} filed ${s.filed})`), "Shares merged to lift the price, often to keep a listing.");
  const f = forensic.r ?? null;
  const beneish = f?.beneish?.m_score ?? f?.m_score ?? null, altman = f?.altman?.z_score ?? f?.z_score ?? null;
  line("Forensic screens (Beneish M-score, Altman Z-score)", forensic.error ? null : (beneish !== null && beneish > -1.78) || (altman !== null && altman < 1.81), forensic.error ? notChecked(forensic) : [`M-score ${beneish ?? "n/a"} (above -1.78 resembles past manipulators)`, `Z-score ${altman ?? "n/a"} (below 1.81 is the distress zone)`], "Screens from two years of annual figures; they point at where to look.");

  const found = rows.filter((r) => r[1] === true).length, unchecked = rows.filter((r) => r[1] === null).length;
  return {
    company: profile.r?.name ?? profile.r?.company?.name ?? a.company,
    since,
    flags_found: found,
    not_checked: unchecked,
    columns: ["flag", "found", "evidence", "meaning"],
    rows,
    reading: `${found} of ${rows.length} flags found since ${since}${unchecked ? `; ${unchecked} could not be checked` : ""}. Flags to look at in the filings named, not accusations and not investment advice.`,
    limits: ["It reads what the company filed with the SEC; promotions themselves (messages, ads, social media) are not read.", "found null means the source could not be read, never that nothing is there."],
  };
}
