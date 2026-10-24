// A drug company's pipeline: the clinical trials it sponsors that are still running, by phase, with
// the primary completion dates that are the next readouts, from ClinicalTrials.gov; and the drugs
// FDA has approved for it, from openFDA's Drugs@FDA. Both public, no key. Sponsors are matched by
// name: ClinicalTrials.gov by the lead sponsor's name, Drugs@FDA by the first word of it, since FDA
// abbreviates sponsors ("VERTEX PHARMS").
import { z } from "zod";

import { getJson, NotFound, resolveEntity } from "./sources.mjs";

const CTGOV = "https://clinicaltrials.gov/api/v2/studies";
const FDA = "https://api.fda.gov/drug/drugsfda.json";
const ACTIVE = ["RECRUITING", "ACTIVE_NOT_RECRUITING", "NOT_YET_RECRUITING", "ENROLLING_BY_INVITATION"];
const FIELDS = ["NCTId", "BriefTitle", "Phase", "OverallStatus", "Condition", "InterventionName", "PrimaryCompletionDate", "LeadSponsorName", "StudyType", "EnrollmentCount"];

export const pipelineInput = z.object({
  company: z.string().min(1).max(120).optional().describe("Ticker, CIK or name; its SEC name is searched."),
  sponsor: z.string().min(2).max(80).optional().describe("Or the sponsor name as trials list it, e.g. \"Vertex Pharmaceuticals\"."),
  months: z.number().int().min(1).max(36).optional().describe("Readouts: primary completions due within this many months; default 12."),
}).strict();

const SUFFIX = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LLC|PLC|AG|SA|NV|HOLDINGS?|GROUP|THE|NEW|DEL|DE)\b\.?/gi;
export const sponsorName = (name) => String(name).replace(/\s*\/\s*[A-Z]{2}\s*\/?\s*$/, "").replace(/[.,/&]+/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
const PHASE = { NA: "Not applicable", EARLY_PHASE1: "Early phase 1", PHASE1: "Phase 1", PHASE2: "Phase 2", PHASE3: "Phase 3", PHASE4: "Phase 4" };
export const phaseOf = (phases) => (phases?.length ? phases.map((p) => PHASE[p] ?? p).join("/") : "Not applicable");
const RANK = (p) => (p.includes("Phase 3") ? 0 : p.includes("Phase 2") ? 1 : p.includes("Phase 1") ? 2 : 3);
const ymd = (s) => (/^\d{8}$/.test(s ?? "") ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s ?? null);

// Every page of a sponsor's active interventional trials (up to 1,000): by the lead sponsor field,
// or, when that finds none (Moderna's trials are ModernaTX's), by full text, keeping only trials
// whose lead sponsor begins with the name's first word.
async function trials(session, sponsor) {
  const lead = await trialPages(session, "query.lead", sponsor);
  if (lead.length) return lead;
  const first = sponsor.split(" ")[0].toLowerCase();
  return (await trialPages(session, "query.term", sponsor)).filter((t) => String(t.sponsor ?? "").toLowerCase().startsWith(first));
}

async function trialPages(session, field, sponsor) {
  const out = [];
  let token = null;
  for (let page = 0; page < 10; page += 1) {
    const p = new URLSearchParams({ [field]: sponsor, "filter.overallStatus": ACTIVE.join("|"), fields: FIELDS.join(","), pageSize: "100", countTotal: "true" });
    if (token) p.set("pageToken", token);
    const r = await getJson(session, `${CTGOV}?${p}`);
    for (const s of r.studies ?? []) {
      const ps = s.protocolSection ?? {};
      if (ps.designModule?.studyType !== "INTERVENTIONAL") continue;
      out.push({
        nct: ps.identificationModule?.nctId, title: ps.identificationModule?.briefTitle, phase: phaseOf(ps.designModule?.phases),
        status: ps.statusModule?.overallStatus, conditions: ps.conditionsModule?.conditions ?? [],
        interventions: (ps.armsInterventionsModule?.interventions ?? []).map((i) => i.name).filter((n) => !/^placebo$/i.test(n ?? "")),
        primary_completion: ps.statusModule?.primaryCompletionDateStruct?.date ?? null, enrollment: ps.designModule?.enrollmentInfo?.count ?? null,
        sponsor: ps.sponsorCollaboratorsModule?.leadSponsor?.name ?? null,
      });
    }
    token = r.nextPageToken;
    if (!token) break;
  }
  return out;
}

// Drugs@FDA applications whose sponsor starts with the first word of the name, with each original
// approval (submission type ORIG, status AP).
async function approvals(session, sponsor) {
  const word = sponsor.split(" ")[0].toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (word.length < 3) return { word, rows: [] };
  const url = `${FDA}?${new URLSearchParams({ search: `sponsor_name:${word}*`, limit: "100" })}`;
  let r;
  try { r = await getJson(session, url); } catch (err) { if (err instanceof NotFound) return { word, url, rows: [] }; throw err; }
  const rows = [];
  for (const app of r.results ?? []) {
    const orig = (app.submissions ?? []).find((s) => s.submission_type === "ORIG" && s.submission_status === "AP");
    const product = (app.products ?? [])[0] ?? {};
    rows.push([app.application_number, product.brand_name ?? null, (product.active_ingredients ?? []).map((x) => x.name).join(", ") || null, app.sponsor_name, ymd(orig?.submission_status_date), orig?.submission_class_code_description ?? null, product.marketing_status ?? null]);
  }
  rows.sort((x, y) => String(y[4] ?? "").localeCompare(String(x[4] ?? "")));
  return { word, url, rows };
}

export async function drugPipeline(session, args) {
  const a = pipelineInput.parse(args);
  if (!a.company && !a.sponsor) throw new Error("drug_pipeline needs company or sponsor.");
  let who = null, sponsor = a.sponsor;
  if (!sponsor) {
    const e = await resolveEntity(session, a.company);
    if (!e.name) throw new Error(`${a.company} has no SEC name to search; pass sponsor (the name its trials list).`);
    who = { cik: e.cik, name: e.name, ticker: e.ticker ?? null };
    sponsor = sponsorName(e.name);
  }
  const [list, fda] = await Promise.all([trials(session, sponsor), approvals(session, sponsor)]);
  if (!list.length && !fda.rows.length) throw new Error(`Neither ClinicalTrials.gov nor Drugs@FDA lists a sponsor matching "${sponsor}"; pass sponsor as the trials name it (e.g. "Vertex Pharmaceuticals").`);
  const byPhase = {};
  for (const t of list) byPhase[t.phase] = (byPhase[t.phase] ?? 0) + 1;
  const today = new Date(session.now()).toISOString().slice(0, 10);
  const horizon = new Date(session.now() + (a.months ?? 12) * 30.44 * 86400000).toISOString().slice(0, 10);
  const row = (t) => [t.nct, t.phase, t.status, t.title, t.conditions.slice(0, 3).join("; "), t.interventions.slice(0, 3).join("; "), t.primary_completion, t.enrollment];
  const columns = ["nct_id", "phase", "status", "title", "conditions", "interventions", "primary_completion", "enrollment"];
  const readouts = list.filter((t) => t.primary_completion && t.primary_completion >= today && t.primary_completion <= horizon).sort((x, y) => x.primary_completion.localeCompare(y.primary_completion));
  const late = list.filter((t) => RANK(t.phase) <= 1).sort((x, y) => RANK(x.phase) - RANK(y.phase) || String(x.primary_completion).localeCompare(String(y.primary_completion)));
  return {
    ...(who ? { company: who } : {}), sponsor_searched: sponsor, sponsors_matched: [...new Set(list.map((t) => t.sponsor))].slice(0, 8),
    active_trials: list.length, by_phase: Object.entries(byPhase).sort((x, y) => RANK(x[0]) - RANK(y[0])),
    readouts: { note: `Active trials whose primary completion (the date the main result is measured) falls by ${horizon}; sponsors often report results months later, and dates slip.`, columns, rows: readouts.map(row) },
    late_stage: { note: "Active phase 2 and phase 3 trials.", columns, rows: late.slice(0, 40).map(row) },
    fda_approvals: { note: `Drugs@FDA applications whose sponsor begins "${fda.word}", newest original approval first; biologics licensed outside the drug database and partners' approvals are not here.`, columns: ["application", "brand", "active_ingredients", "sponsor", "approved", "type", "marketing_status"], rows: fda.rows.slice(0, 30) },
    links: { trials: `https://clinicaltrials.gov/search?lead=${encodeURIComponent(sponsor)}`, ...(fda.url ? { fda: fda.url } : {}) },
    sources: [CTGOV, FDA],
    limits: ["Trials are matched on the lead sponsor's name: trials run by a partner, or listed under a subsidiary's name, are missed (pass sponsor).", "ClinicalTrials.gov dates are the sponsor's estimates until results are posted.", "openFDA's data is not for medical decisions; nor is this investment advice."],
  };
}
