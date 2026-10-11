// The Federal Reserve's own record of its rate decisions: the FOMC calendar (past and scheduled
// meetings), each statement's decision, target range and vote, and the median projections (the
// "dot plot") from the latest Summary of Economic Projections. No key.
import { z } from "zod";

import { decodeEntities } from "./html.mjs";
import { getText, NotFound } from "./sources.mjs";

const FED = "https://www.federalreserve.gov";
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
// Statements write "3‑1/2" with a non-breaking hyphen; every dash becomes "-".
const text = (html) => decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, " ").trim();

// "3-3/4" -> 3.75, "4" -> 4, "1/4" -> 0.25.
export function fedNumber(s) {
  const m = String(s).trim().match(/^(\d+)?(?:-?(\d)\/(\d))?$/);
  if (!m || (m[1] == null && m[2] == null)) return null;
  return (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
}

// Meetings by year from the calendar page: dates, whether projections came with it, and links.
export function parseCalendar(html) {
  const out = [];
  const panels = html.split(/(?=<h4[^>]*>\s*(?:<a[^>]*>)?\s*\d{4} FOMC Meetings)/);
  for (const panel of panels) {
    const year = Number(panel.match(/(\d{4}) FOMC Meetings/)?.[1]);
    if (!year) continue;
    // One block per meeting: the div whose class is fomc-meeting itself, not its __month or __date parts.
    for (const block of panel.split(/(?=<div class="[^"]*\bfomc-meeting(?![_\w-])[^"]*")/).slice(1)) {
      const month = text(block.match(/fomc-meeting__month[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "");
      const days = text(block.match(/fomc-meeting__date[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "");
      if (!month || !days) continue;
      const [m1, m2] = month.toLowerCase().split("/").map((m) => MONTHS.findIndex((x) => x.startsWith(m.slice(0, 3))) + 1);
      const d = days.replace(/[*\s]|\(.*?\)/g, "").split("-");
      if (!m1 || !d[0]) continue;
      const iso = (mm, dd) => `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      const end = iso(m2 || m1, d[d.length - 1]);
      const stamp = end.replace(/-/g, "");
      const link = (re) => block.match(re)?.[1] ?? null;
      out.push({
        start: iso(m1, d[0]), end, projections: days.includes("*"), note: days.match(/\(([^)]+)\)/)?.[1] ?? null,
        statement: link(new RegExp(`href="(/newsevents/pressreleases/monetary${stamp}a\\.htm)"`)),
        minutes: link(new RegExp(`href="(/monetarypolicy/fomcminutes${stamp}\\.htm)"`)),
        projection_tables: link(new RegExp(`href="(/monetarypolicy/fomcprojtabl${stamp}\\.htm)"`)),
      });
    }
  }
  return out.sort((a, b) => a.end.localeCompare(b.end));
}

// The decision in a statement: the action, the change, the target range and the vote.
export function parseStatement(html) {
  const t = text(html.match(/<div[^>]*id="article"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? html);
  // The sentence that says it: from the end of the one before (". " or ": ") to its own period.
  const at = t.search(/decided to (raise|lower|maintain|keep|reduce|increase)[^.]*target range for the federal funds rate/i);
  const from = at < 0 ? -1 : Math.max(t.lastIndexOf(". ", at), t.lastIndexOf(": ", at)) + 2;
  const decision = at < 0 ? null : t.slice(from, t.indexOf(".", at) + 1).trim();
  const range = decision?.match(/(\d+(?:-\d\/\d)?|\d\/\d) to (\d+(?:-\d\/\d)?) percent/);
  const change = decision?.match(/by (\d+(?:-\d\/\d)?|\d\/\d) percentage point/);
  // The vote: "by a 12 - 0 vote", or name lists ("Voting for ... were A, Chair; B; and C. Voting against
  // this action were D and E, who preferred ..."). Initials have periods, so lists end at the next clause.
  const byCount = t.match(/by an? (\d+)\s*-\s*(\d+) vote/i);
  const forList = t.match(/Voting for (?:the|this) (?:monetary policy )?action were (.+?)\.(?= Voting against| For media| Implementation Note|$)/i)?.[1] ?? null;
  const againstRaw = t.match(/Voting against (?:the|this) action (?:were|was):? (.+?)(?= For media| Implementation Note| Voting for|$)/i)?.[1] ?? null;
  const names = (list) => list.split(/;\s*(?:and\s+)?|,\s*and\s+|,\s+|\s+and\s+/).map((x) => x.replace(/^(Vice )?Chair$/, "").replace(/\.$/, "").trim()).filter(Boolean);
  // Dissents come in groups, each with its reason: "A, who preferred ...; and B and C, who ...".
  const dissents = againstRaw ? againstRaw.replace(/\.$/, "").split(/;\s*(?:and\s+)?/).map((g) => {
    const at = g.search(/,? who /);
    return { names: names(at < 0 ? g : g.slice(0, at)), reason: at < 0 ? null : g.slice(at).replace(/^,? /, "") };
  }).filter((d) => d.names.length) : [];
  const against = dissents.length ? dissents.flatMap((d) => d.names).join("; ") : null;
  const vote = byCount ? [byCount[1], byCount[2]] : forList ? [String(names(forList.replace(/, (Vice )?Chair/g, "")).length), String(dissents.reduce((k, d) => k + d.names.length, 0))] : null;
  const action = /decided to (raise|increase)/i.test(decision ?? "") ? "raised" : /decided to (lower|reduce)/i.test(decision ?? "") ? "lowered" : decision ? "held" : null;
  const bp = change ? Math.round(fedNumber(change[1]) * 100) : 0;
  return {
    action, change_bp: action === "raised" ? bp : action === "lowered" ? -bp : action ? 0 : null,
    target_low: range ? fedNumber(range[1]) : null, target_high: range ? fedNumber(range[2]) : null,
    vote: vote ? `${vote[0]}-${vote[1]}` : null, voting_against: against, ...(dissents.some((d) => d.reason) ? { dissents } : {}),
    decision, text: t,
  };
}

// The Summary of Economic Projections' first table: medians by year, and the previous projection.
export function parseProjections(html) {
  const table = html.match(/<table[\s\S]*?<\/table>/)?.[0];
  if (!table) return null;
  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => text(c[1])));
  const header = rows.find((r) => r.includes("Longer run"));
  if (!header) return null;
  const n = header.indexOf("Longer run") + 1;
  const years = header.slice(0, n).map((h) => (h === "Longer run" ? "longer_run" : h));
  const now = [], before = [];
  let last = null;
  for (const r of rows) {
    const label = (r[0] ?? "").replace(/\s*\d+$/, "");
    if (!label || r.length < n || label === "Variable") continue;
    const vals = r.slice(1, 1 + n).map((v) => (v === "" ? null : Number(v)));
    if (/projection$/i.test(label)) before.push([last, ...vals]);
    else { last = label; now.push([label, ...vals]); }
  }
  return { columns: ["variable", ...years], median: now, previous_median: before };
}

export const fomcInput = z.object({
  year: z.number().int().min(2011).max(2100).optional().describe("Meetings and decisions of this year; default this year."),
}).strict();

export async function fomc(session, args) {
  const a = fomcInput.parse(args);
  const year = a.year ?? new Date(session.now()).getUTCFullYear();
  const today = new Date(session.now()).toISOString().slice(0, 10);
  const calUrl = `${FED}/monetarypolicy/fomccalendars.htm`;
  const meetings = parseCalendar(await getText(session, calUrl, { maxBytes: 4 * 1024 * 1024 }));
  const ofYear = meetings.filter((m) => m.end.startsWith(String(year)));
  if (!ofYear.length) throw new NotFound(`The FOMC calendar page lists no ${year} meetings; it covers the current year and the four before it (older ones are in the Fed's historical materials).`);
  const rows = [];
  let latest = null;
  for (const m of ofYear) {
    let s = null;
    if (m.statement && m.end <= today) {
      try { s = parseStatement(await getText(session, `${FED}${m.statement}`, { maxBytes: 2 * 1024 * 1024 })); } catch (err) { if (!(err instanceof NotFound)) throw err; }
      if (s) latest = { meeting: m.end, ...s };
    }
    rows.push([m.start, m.end, m.note ?? (m.end > today ? "scheduled" : "held"), m.projections, s?.action ?? null, s?.change_bp ?? null, s?.target_low ?? null, s?.target_high ?? null, s?.vote ?? null, s?.voting_against ?? null, m.statement ? `${FED}${m.statement}` : null, m.minutes ? `${FED}${m.minutes}` : null]);
  }
  const withSep = meetings.filter((m) => m.projection_tables && m.end <= today).pop();
  let projections = null;
  if (withSep) {
    const p = parseProjections(await getText(session, `${FED}${withSep.projection_tables}`, { maxBytes: 4 * 1024 * 1024 }));
    if (p) projections = { meeting: withSep.end, units: "percent (Q4 to Q4 change for GDP and inflation; Q4 level for unemployment; year-end level for the federal funds rate)", ...p, url: `${FED}${withSep.projection_tables}` };
  }
  return {
    year, as_of: today,
    columns: ["start", "end", "status", "projections", "action", "change_bp", "target_low", "target_high", "vote", "voting_against", "statement_url", "minutes_url"],
    rows,
    ...(latest ? { latest_statement: { meeting: latest.meeting, decision: latest.decision, ...(latest.dissents ? { dissents: latest.dissents } : {}), text: latest.text.slice(0, 2500) + (latest.text.length > 2500 ? "…" : "") } } : {}),
    ...(projections ? { projections } : {}),
    source: calUrl,
    limits: [
      "From the Federal Reserve's FOMC calendar, statements and Summary of Economic Projections as published; the target range is in percent, the change in basis points, and the vote is for the statement.",
      "Projections are FOMC participants' medians, not a Committee forecast, and change at every projection meeting.",
      "Not investment advice.",
    ],
  };
}
