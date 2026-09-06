// =============================================================================
// CANLI CAPITAL / scripts/draft-recurring-post.mjs
// -----------------------------------------------------------------------------
// A recurring-content DRAFT generator. It reads this repo's own published
// glass-box artifacts (the kill log, the trial ledger, the signed transparency
// chain, the OpenTimestamps anchors, the paper-trading state, the program
// status, and the site's own paper-evidence conformance record) and writes a
// Markdown draft under drafts/. Nothing here posts anywhere, tweets anything,
// or touches a live account. A human reads every draft and decides whether it
// is worth publishing, edits it by hand, or throws it away.
//
// TWO MODES:
//   weekly  -> drafts/YYYY-MM-DD-what-died-this-week.md   (what changed in the
//              last seven days: transparency corrections/updates, new signed
//              chain entries, new OpenTimestamps anchors, new trial-ledger
//              records, and the arrivals reading, if that instrumentation is
//              present in this checkout)
//   monthly -> drafts/YYYY-MM-the-record-so-far.md         (the state of the
//              record: its length in days, the chain's size, the anchors, the
//              sleeves and their paper state, corrections issued, trials
//              counted, and a verbatim quote of what the record itself says
//              it does not establish)
//
// HOUSE RULES ENFORCED HERE, NOT JUST DESCRIBED:
//   - Every numeral in a draft carries its source path in a trailing bracket,
//     e.g. "63 distinct days [public/glassbox/transparency_log.json]", so the
//     owner can check it. Enforced by assertNumeralsCited() before a draft is
//     written.
//   - A withdrawn number may appear ONLY inside a retraction sentence. This is
//     checked against config/retracted-claims.txt (a local mirror of the
//     engine repo's blocklist format) by assertNoRetractedViolations(), which
//     refuses to write a draft that fails it.
//   - No em dashes. Any that arrive via quoted source text are normalised out
//     before a draft is written (sanitizeDashes()), then asserted absent.
//   - Dates that describe the RECORD (the reporting window, "as of") are
//     derived from the artifacts themselves, never from the system clock. The
//     only place the clock is used is the output file NAME.
//   - No performance figures (Sharpe, return, drawdown) are asserted as
//     claims. This generator only reports process facts: counts, dates,
//     weights, capital kind, and the site's own verbatim disclaimers.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..");
const RETRACTED_CLAIMS_PATH = resolve(HERE, "..", "config", "retracted-claims.txt");

export const BOUNDARY_PARAGRAPH =
  "This is a paper record. No real capital is deployed here, and nothing in this draft is a " +
  "performance claim or a forecast. Every number above is a measurement taken from the " +
  "repository's own glass-box artifacts and cited in brackets beside it. This draft is a " +
  "proposal for the owner to read, edit, or discard; it is never posted anywhere automatically.";

export const CHECKLIST_LINE = "- [ ] every number above cites its artifact";

const cite = (path) => `[${path}]`;
const plural = (n, singular, pluralForm = `${singular}s`) => (n === 1 ? singular : pluralForm);

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

export function readJSON(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function dateOnly(iso) {
  return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : null;
}

function toUTCms(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(dateStr, n) {
  return new Date(toUTCms(dateStr) + n * 86400000).toISOString().slice(0, 10);
}

const EM_DASH = "\u2014";

export function sanitizeDashes(text) {
  return text.split(EM_DASH).join(" - ");
}

function formatFileDate(now, precision) {
  const iso = now.toISOString();
  return precision === "month" ? iso.slice(0, 7) : iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Numeral-citation self-check: every line with a digit must carry a [bracket].
// ---------------------------------------------------------------------------

export function assertNumeralsCited(markdown) {
  const offenders = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) continue; // headings are written to carry no numerals
    if (!/\d/.test(line)) continue;
    if (!/\[[^[\]]*]/.test(line)) offenders.push(line);
  }
  if (offenders.length) {
    throw new Error(`numeral(s) without a trailing citation bracket:\n${offenders.join("\n")}`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Retracted-claims self-check (config/retracted-claims.txt format)
// ---------------------------------------------------------------------------

export function parseRetractedClaims(text) {
  const rules = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("::").map((p) => p.trim());
    if (parts.length < 3) continue;
    const [seq, blocked, retraction, exemption] = parts;
    if (!blocked) continue;
    rules.push({ seq, blocked, retraction: retraction || null, exemption: exemption || null });
  }
  return rules;
}

function safeTest(pattern, str) {
  try {
    return new RegExp(pattern).test(str);
  } catch {
    return false;
  }
}

export function findRetractedViolations(text, rules, wideWindowChars = 400) {
  const violations = [];
  for (const rule of rules) {
    let re;
    try {
      re = new RegExp(rule.blocked, "g");
    } catch {
      continue;
    }
    let m;
    while ((m = re.exec(text))) {
      const idx = m.index;
      const matchLen = m[0].length || 1;
      const localWindow = text.slice(Math.max(0, idx - 80), Math.min(text.length, idx + matchLen + 80));
      const exempt = rule.exemption ? safeTest(rule.exemption, localWindow) : false;
      if (!exempt) {
        const wideWindow = text.slice(
          Math.max(0, idx - wideWindowChars),
          Math.min(text.length, idx + matchLen + wideWindowChars),
        );
        const retracted = rule.retraction ? safeTest(rule.retraction, wideWindow) : false;
        if (!retracted) violations.push({ seq: rule.seq, blocked: rule.blocked, match: m[0], index: idx });
      }
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }
  return violations;
}

export function assertNoRetractedViolations(text, rules) {
  const violations = findRetractedViolations(text, rules);
  if (violations.length) {
    const details = violations
      .map((v) => `seq ${v.seq}: "${v.match}" at index ${v.index} (blocked pattern /${v.blocked}/, no retraction or exemption found nearby)`)
      .join("\n");
    throw new Error(`refusing to write draft: blocked claim pattern(s) found without retraction or exemption:\n${details}`);
  }
}

function loadRetractedClaimsRules() {
  return parseRetractedClaims(readFileSync(RETRACTED_CLAIMS_PATH, "utf8"));
}

// ---------------------------------------------------------------------------
// Artifact loading
// ---------------------------------------------------------------------------

const EVENT_RE =
  /^(CORRECTION|UPDATE|DISCLOSURE|CHANGE|ADDED|FIXED|RE-DERIVATION|GATE AUDIT|PRESENTATION|OPEN INCIDENT|STRUCTURAL VERDICT|CURRENT EXECUTION PROVENANCE|RE-BASELINE)\s+(\d{4}-\d{2}-\d{2})\s*(?:\([a-z]+\)\s*)?[\u2014-]*\s*([\s\S]*)$/;

export function parseTransparencyEvents(transparency) {
  if (!Array.isArray(transparency)) return [];
  const events = [];
  transparency.forEach((text, index) => {
    if (typeof text !== "string") return;
    const m = EVENT_RE.exec(text);
    if (!m) return;
    events.push({ index, kind: m[1], date: m[2], rest: m[3] || "", text });
  });
  return events;
}

function summarizeEvent(event, limit = 160) {
  const oneLine = event.rest.replace(/\s+/g, " ").trim();
  if (oneLine.length <= limit) return oneLine;
  const slice = oneLine.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${trimmed.trim()}...`;
}

export function loadArtifacts(root = DEFAULT_ROOT) {
  const glassbox = (...parts) => resolve(root, "public", "glassbox", ...parts);
  const killLog = readJSON(glassbox("kill_log.json"));
  const trialLedger = readJSON(glassbox("trial_ledger.json"));
  const trialSharpeDistribution = readJSON(glassbox("trial_sharpe_distribution.json"));
  const transparencyLog = readJSON(glassbox("transparency_log.json"));
  const otsAnchors = readJSON(glassbox("ots", "anchors.json"));
  const paperState = readJSON(resolve(root, "public", "paper-state.json"));
  const programStatus = readJSON(glassbox("program_status.json"));

  let doesNotEstablishSource = "public/api/v1/record.json";
  let record = readJSON(resolve(root, "public", "api", "v1", "record.json"));
  if (!record?.claim_maturity?.does_not_establish) {
    doesNotEstablishSource = "public/standards/paper-evidence/v0/vectors/valid-alphac-book.json";
    record = readJSON(resolve(root, "public", "standards", "paper-evidence", "v0", "vectors", "valid-alphac-book.json"));
  }

  return {
    root,
    killLog,
    trialLedger,
    trialSharpeDistribution,
    transparencyLog,
    otsAnchors,
    paperState,
    programStatus,
    record,
    doesNotEstablishSource,
  };
}

// ---------------------------------------------------------------------------
// "As of" derivation: the most recent date found across every artifact, with
// the path that produced it, so a citation is always attributable.
// ---------------------------------------------------------------------------

export function collectDatedFacts(artifacts) {
  const facts = [];
  const push = (date, source) => {
    if (date) facts.push({ date, source });
  };
  push(artifacts.transparencyLog?.last_date, "public/glassbox/transparency_log.json#last_date");
  push(dateOnly(artifacts.killLog?.generated_at), "public/glassbox/kill_log.json#generated_at");
  push(dateOnly(artifacts.trialLedger?.generated_at), "public/glassbox/trial_ledger.json#generated_at");
  push(artifacts.otsAnchors?.head_anchor?.date, "public/glassbox/ots/anchors.json#head_anchor.date");
  push(dateOnly(artifacts.paperState?.generated_at), "public/paper-state.json#generated_at");
  push(dateOnly(artifacts.programStatus?.generated_at), "public/glassbox/program_status.json#generated_at");
  for (const e of parseTransparencyEvents(artifacts.paperState?.transparency)) {
    push(e.date, "public/paper-state.json#transparency");
  }
  return facts;
}

export function computeAsOf(artifacts) {
  const facts = collectDatedFacts(artifacts);
  if (!facts.length) return null;
  return facts.reduce((best, f) => (f.date > best.date ? f : best));
}

// ---------------------------------------------------------------------------
// Weekly: "what died this week"
// ---------------------------------------------------------------------------

export function computeWeeklyChanges(artifacts, asOfFact, windowDays = 7) {
  const windowStart = addDays(asOfFact.date, -(windowDays - 1));
  const windowEnd = asOfFact.date;
  const inWindow = (d) => Boolean(d) && d >= windowStart && d <= windowEnd;

  const transparencyEvents = parseTransparencyEvents(artifacts.paperState?.transparency).filter(
    (e) => (e.kind === "CORRECTION" || e.kind === "UPDATE") && inWindow(e.date),
  );

  const chainEntries = (artifacts.transparencyLog?.entries || []).filter((e) => inWindow(e.date));

  const anchors = (artifacts.otsAnchors?.anchors || []).filter((a) => inWindow(a.date));

  const newTrialRecords = (artifacts.trialLedger?.recent_hypothesis_identities || []).filter((r) =>
    inWindow(dateOnly(r.first_recorded_at)),
  );

  const hasChanges =
    transparencyEvents.length > 0 || chainEntries.length > 0 || anchors.length > 0 || newTrialRecords.length > 0;

  return { windowStart, windowEnd, asOfSource: asOfFact.source, transparencyEvents, chainEntries, anchors, newTrialRecords, hasChanges };
}

function renderWeeklyNoChanges(changes) {
  return sanitizeDashes(
    `No changes to the kill/trial record, transparency chain, corrections, updates, or chain anchors were found ` +
      `in the seven days ending ${changes.windowEnd} ${cite(changes.asOfSource)}. This is a paper record; nothing ` +
      `above is a performance claim or a forecast.\n`,
  );
}

function renderArrivalsSection(arrivals) {
  const lines = ["## Arrivals reading", ""];
  if (arrivals.available) {
    for (const l of arrivals.lines) lines.push(`- ${l} ${cite(arrivals.source)}`);
  } else {
    lines.push(`Arrivals reading unavailable: ${arrivals.reason}.`);
  }
  return lines;
}

export function renderWeekly(artifacts, changes, arrivals) {
  const lines = [];
  lines.push("# What Died This Week");
  lines.push("");
  lines.push(`Covering the seven days ending ${changes.windowEnd} ${cite(changes.asOfSource)}.`);
  lines.push("");

  lines.push("## Transparency chain");
  lines.push("");
  if (changes.chainEntries.length > 0) {
    const seqs = changes.chainEntries.map((e) => e.seq);
    const dates = [...new Set(changes.chainEntries.map((e) => e.date))];
    lines.push(
      `${changes.chainEntries.length} new signed entries were appended in this window, sequence ` +
        `${Math.min(...seqs)} through ${Math.max(...seqs)}, dated ${dates.join(", ")} ` +
        `${cite("public/glassbox/transparency_log.json#entries")}.`,
    );
  } else {
    lines.push(`No new signed transparency entries were appended in this window ${cite("public/glassbox/transparency_log.json#entries")}.`);
  }
  lines.push("");
  if (changes.anchors.length > 0) {
    const described = changes.anchors
      .map((a) => `seq ${a.seq} (${a.status}${a.bitcoin_block_height ? `, block ${a.bitcoin_block_height}` : ""})`)
      .join(", ");
    const noun = plural(changes.anchors.length, "anchor");
    const verb = plural(changes.anchors.length, "was", "were");
    lines.push(
      `${changes.anchors.length} OpenTimestamps ${noun} ${verb} checkpointed in this window: ${described} ` +
        `${cite("public/glassbox/ots/anchors.json#anchors")}.`,
    );
  } else {
    lines.push(`No new OpenTimestamps anchors were checkpointed in this window ${cite("public/glassbox/ots/anchors.json#anchors")}.`);
  }
  lines.push("");

  lines.push("## Corrections and updates");
  lines.push("");
  if (changes.transparencyEvents.length > 0) {
    for (const e of changes.transparencyEvents) {
      lines.push(`- ${e.kind} ${e.date}: ${summarizeEvent(e)} ${cite("public/paper-state.json#transparency")}`);
    }
  } else {
    lines.push(`No new CORRECTION or UPDATE entries were added to the transparency list in this window ${cite("public/paper-state.json#transparency")}.`);
  }
  lines.push("");

  lines.push("## Trial ledger");
  lines.push("");
  if (changes.newTrialRecords.length > 0) {
    const noun = changes.newTrialRecords.length === 1 ? "identity was" : "identities were";
    const labels = changes.newTrialRecords.map((r) => `${r.label} (recorded ${dateOnly(r.first_recorded_at)})`).join(", ");
    lines.push(
      `${changes.newTrialRecords.length} new hypothesis ${noun} recorded in the trial ledger in this window: ${labels} ` +
        `${cite("public/glassbox/trial_ledger.json#recent_hypothesis_identities")}.`,
    );
  } else {
    lines.push(`No new hypothesis identities were recorded in the trial ledger in this window ${cite("public/glassbox/trial_ledger.json#recent_hypothesis_identities")}.`);
  }
  lines.push("");
  if (artifacts.killLog) {
    const survivorNoun = plural(artifacts.killLog.survived_count, "survivor");
    lines.push(
      `For reference, the kill log currently totals ${artifacts.killLog.killed_count} killed at the deployed ` +
        `gauntlet, ${artifacts.killLog.screen_killed_count} killed at screen, and ${artifacts.killLog.survived_count} ` +
        `${survivorNoun} ${cite("public/glassbox/kill_log.json")}. kill_log.json carries no per-kill date, so this ` +
        `generator cannot establish which, if any, of these are new to this window.`,
    );
    lines.push("");
  }

  lines.push(...renderArrivalsSection(arrivals));
  lines.push("");

  lines.push("## This is a paper record");
  lines.push("");
  lines.push(BOUNDARY_PARAGRAPH);
  lines.push("");
  lines.push(CHECKLIST_LINE);
  lines.push("");

  return sanitizeDashes(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Arrivals reading: reuse scripts/report-arrivals.mjs + config/arrivals-baseline.json
// if this checkout has them. If not, say so plainly rather than fabricate.
// ---------------------------------------------------------------------------

export async function loadArrivalsReading(root, { fetchImpl, baseUrl = "https://canlicapital.com" } = {}) {
  const scriptPath = resolve(root, "scripts", "report-arrivals.mjs");
  const baselinePath = resolve(root, "config", "arrivals-baseline.json");
  if (!existsSync(scriptPath)) {
    return { available: false, reason: "scripts/report-arrivals.mjs is not present in this checkout", source: "scripts/report-arrivals.mjs" };
  }
  if (!existsSync(baselinePath)) {
    return { available: false, reason: "config/arrivals-baseline.json is not present in this checkout", source: "config/arrivals-baseline.json" };
  }
  try {
    const mod = await import(pathToFileURL(scriptPath).href);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    const result = await mod.report(baseUrl, fetchImpl, baseline);
    return { available: true, lines: result.lines, source: "config/arrivals-baseline.json" };
  } catch (err) {
    return { available: false, reason: `the live status endpoint was unreachable (${err.message})`, source: "config/arrivals-baseline.json" };
  }
}

export async function buildWeeklyDraft(root = DEFAULT_ROOT, { fetchImpl, baseUrl, now = new Date() } = {}) {
  const artifacts = loadArtifacts(root);
  const asOfFact = computeAsOf(artifacts);
  if (!asOfFact) throw new Error("no dated artifacts were found; cannot compute a reporting window");
  const changes = computeWeeklyChanges(artifacts, asOfFact);

  let content;
  if (!changes.hasChanges) {
    content = renderWeeklyNoChanges(changes);
  } else {
    const arrivals = await loadArrivalsReading(root, { fetchImpl, baseUrl });
    content = renderWeekly(artifacts, changes, arrivals);
  }

  assertNumeralsCited(content);
  assertNoRetractedViolations(content, loadRetractedClaimsRules());

  const outPath = resolve(root, "drafts", `${formatFileDate(now, "day")}-what-died-this-week.md`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, "utf8");
  return { path: outPath, content };
}

// ---------------------------------------------------------------------------
// Monthly: "the record so far"
// ---------------------------------------------------------------------------

export function computeMonthlySummary(artifacts) {
  const forward = artifacts.programStatus?.forward_record || {};
  const t = artifacts.transparencyLog || {};
  const a = artifacts.otsAnchors || {};
  const sleeves = artifacts.paperState?.book?.sleeves || [];
  const correctionsCount = parseTransparencyEvents(artifacts.paperState?.transparency).filter((e) => e.kind === "CORRECTION").length;
  const doesNotEstablish = artifacts.record?.claim_maturity?.does_not_establish || [];

  return {
    liveDays: forward.live_days,
    firstMark: forward.first_mark,
    lastMark: forward.last_mark,
    capitalKind: forward.capital_kind,
    entryCount: t.entry_count,
    distinctDays: t.distinct_days,
    firstDate: t.first_date,
    lastDate: t.last_date,
    anchorCount: a.anchor_count,
    bitcoinConfirmed: a.bitcoin_confirmed_count,
    calendarPending: a.calendar_pending_count,
    sleeves,
    correctionsCount,
    immutableRecords: artifacts.trialLedger?.immutable_execution_records,
    distinctHypotheses: artifacts.trialLedger?.distinct_hypothesis_identities,
    doesNotEstablish,
    asOfDate: dateOnly(artifacts.programStatus?.generated_at),
  };
}

export function renderMonthly(artifacts, summary) {
  const lines = [];
  lines.push("# The Record So Far");
  lines.push("");
  lines.push(`As of ${summary.asOfDate || "an unknown date"} ${cite("public/glassbox/program_status.json#generated_at")}.`);
  lines.push("");

  lines.push("## Forward record length");
  lines.push("");
  lines.push(
    `The paper forward record has run ${summary.liveDays} days, from ${summary.firstMark} to ${summary.lastMark}, ` +
      `capital kind ${summary.capitalKind} ${cite("public/glassbox/program_status.json#forward_record")}.`,
  );
  lines.push("");

  lines.push("## Transparency chain");
  lines.push("");
  lines.push(
    `The signed transparency chain holds ${summary.entryCount} entries across ${summary.distinctDays} distinct ` +
      `days, from ${summary.firstDate} to ${summary.lastDate} ${cite("public/glassbox/transparency_log.json")}.`,
  );
  lines.push("");

  lines.push("## Anchors");
  lines.push("");
  lines.push(
    `${summary.anchorCount} chain heads have been checkpointed with OpenTimestamps: ${summary.bitcoinConfirmed} ` +
      `confirmed on the Bitcoin blockchain and ${summary.calendarPending} still calendar-pending ` +
      `${cite("public/glassbox/ots/anchors.json")}.`,
  );
  lines.push("");

  lines.push("## Sleeves and paper state");
  lines.push("");
  for (const s of summary.sleeves) {
    lines.push(`- ${s.name}, weight ${s.weight} ${cite("public/paper-state.json#book.sleeves")}`);
  }
  lines.push("");
  lines.push(`All sleeves above are ${summary.capitalKind} ${cite("public/glassbox/program_status.json#forward_record.capital_kind")}.`);
  lines.push("");

  lines.push("## Corrections issued");
  lines.push("");
  lines.push(`${summary.correctionsCount} CORRECTION entries have been added to the transparency list to date ${cite("public/paper-state.json#transparency")}.`);
  lines.push("");

  lines.push("## Trials counted");
  lines.push("");
  lines.push(
    `The trial ledger counts ${summary.immutableRecords} immutable execution records, reducing to ` +
      `${summary.distinctHypotheses} distinct hypothesis identities after removing window-only remeasurements ` +
      `${cite("public/glassbox/trial_ledger.json")}.`,
  );
  lines.push("");

  lines.push("## What this record does not establish");
  lines.push("");
  lines.push(`Quoted directly from the site's own paper-evidence record ${cite(artifacts.doesNotEstablishSource)}:`);
  lines.push("");
  for (const item of summary.doesNotEstablish) {
    lines.push(`- ${item} ${cite(artifacts.doesNotEstablishSource)}`);
  }
  lines.push("");

  lines.push("## This is a paper record");
  lines.push("");
  lines.push(BOUNDARY_PARAGRAPH);
  lines.push("");
  lines.push(CHECKLIST_LINE);
  lines.push("");

  return sanitizeDashes(lines.join("\n"));
}

export function buildMonthlyDraft(root = DEFAULT_ROOT, { now = new Date() } = {}) {
  const artifacts = loadArtifacts(root);
  const summary = computeMonthlySummary(artifacts);
  const content = renderMonthly(artifacts, summary);

  assertNumeralsCited(content);
  assertNoRetractedViolations(content, loadRetractedClaimsRules());

  const outPath = resolve(root, "drafts", `${formatFileDate(now, "month")}-the-record-so-far.md`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, "utf8");
  return { path: outPath, content };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const mode = process.argv[2];
  if (mode === "weekly") {
    const { path } = await buildWeeklyDraft(DEFAULT_ROOT);
    console.log(`wrote ${path}`);
  } else if (mode === "monthly") {
    const { path } = buildMonthlyDraft(DEFAULT_ROOT);
    console.log(`wrote ${path}`);
  } else {
    console.error("usage: node scripts/draft-recurring-post.mjs <weekly|monthly>");
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err.stack || String(err));
    process.exitCode = 1;
  });
}
