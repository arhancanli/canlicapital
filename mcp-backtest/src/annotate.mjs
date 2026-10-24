// Annotation: turn figures into a labelled dataset that people have checked against the filings.
//
// annotation_packet takes figures (company, measure, period, value), labels each one by machine
// against the company's XBRL filings (verify_claims: confirmed, contradicted, not reported or not
// checkable, with the filed figure and its source), and writes one packet per annotator as a CSV a
// person fills in, a key with the machine labels, and the guidelines. Packets are blind by default:
// they carry the source link, not the machine's verdict or the filed figure, so a person's label is
// their own and can be compared with the machine's afterwards.
// annotation_agreement reads the filled packets: agreement and Cohen's kappa between annotators,
// and between the people and the machine, with every disagreement listed.
// annotation_gold merges them into a gold set (unanimous labels, then a reviewer's decisions),
// writes it as JSONL with a datasheet, and hashes every input so the set can be traced.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { createSession as marketsSession } from "canli-markets-mcp/src/sources.mjs";
import { verifyClaims } from "canli-markets-mcp/src/verify.mjs";

export const LABELS = Object.freeze(["confirmed", "contradicted", "not_reported", "cannot_find"]);
const COLUMNS = ["item_id", "company", "measure", "period", "claimed", "unit", "source", "label", "correct_value", "note"];
const sha = (x) => createHash("sha256").update(x).digest("hex");
const filePath = z.string().min(1).max(1000).refine((s) => !s.includes("\0"), "a file path cannot contain a NUL character");

const item = z.object({
  company: z.string().min(1).max(120),
  measure: z.string().min(2).max(80),
  period: z.string().min(2).max(60),
  value: z.number(),
  unit: z.string().max(30).optional(),
  note: z.string().max(500).optional(),
}).strict();

export const packetInput = z.object({
  task: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/).describe("A name for the task, e.g. q3-revenue-check: the folder the files go in."),
  items: z.array(item).min(1).max(200).optional().describe("Figures to label: company, measure, period, value (and unit), as for verify_claims."),
  items_file: filePath.optional().describe("Or a JSONL file of the same objects, up to 2,000."),
  text: z.string().min(10).max(6000).optional().describe("Or a draft about one company (an AI's answer, say): every figure in it with a measure and a period becomes an item. Needs company."),
  company: z.string().min(1).max(120).optional().describe("With text: the company the draft is about."),
  annotators: z.number().int().min(1).max(5).optional().describe("Packets to write, one per person. Default 2: two people label every item independently."),
  assisted: z.boolean().optional().describe("Show the machine's label and the filed figure in the packets. Default false (blind), so agreement with the machine means something."),
  out_dir: filePath.optional().describe("Folder for the task folder. Default: a new temporary folder."),
}).strict();
export const agreementInput = z.object({ task_dir: filePath.describe("The folder annotation_packet wrote, with the filled packets in it.") }).strict();
export const goldInput = z.object({
  task_dir: filePath.describe("The folder annotation_packet wrote, with the filled packets in it."),
  reviews: z.array(z.object({ item_id: z.string().max(40), label: z.enum(LABELS), correct_value: z.number().optional(), note: z.string().max(500).optional() }).strict()).max(2000).optional()
    .describe("A reviewer's decisions on items the annotators disagreed on."),
}).strict();

// ---- CSV ---------------------------------------------------------------------------------------------
const quote = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows) => rows.map((r) => r.map(quote).join(",")).join("\n") + "\n";
export function parseCsv(text) {
  const rows = [], s = text.replace(/^﻿/, "");
  let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i += 1; row.push(cell); cell = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some((x) => x !== "")) rows.push(row); }
  return rows;
}

const GUIDELINES = `# Labelling guidelines (canli.annotation.v1)

Work alone. Do not compare labels with anyone until every packet is in.

For each row, open the link in \`source\` (the filing, or SEC's record of the company's XBRL facts),
find the figure for the company, measure and period, and set \`label\` to one of:

- \`confirmed\`: the filing reports this figure for this period, after its own scaling ("in
  millions") and to the precision the claim is written in (416.2 billion matches 416,161 million).
- \`contradicted\`: the filing reports a different figure. Put the filed figure, in the claim's unit,
  in \`correct_value\`.
- \`not_reported\`: the company's filings do not report this measure for this period.
- \`cannot_find\`: you could not settle it. Say where you looked in \`note\`.

A restated figure: label against the latest filing and say in \`note\` that it was restated.
Non-GAAP or adjusted figures are judged against the company's own reconciliation; say so in \`note\`.
`;

// ---- packets ------------------------------------------------------------------------------------------
// session: a canli-markets-mcp session (SEC requests, cache, clock); one is made when none is given.
export async function annotationPacket(session, args) {
  session ??= marketsSession();
  const a = packetInput.parse(args);
  let items = a.items ?? [];
  if (a.items_file) items = items.concat(readFileSync(a.items_file, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
    try { return item.parse(JSON.parse(l)); } catch (e) { throw new RangeError(`items_file line ${i + 1}: ${e.message}`); }
  }));
  // A draft: verify_claims finds its figures and labels them in the same pass.
  let fromText = null;
  if (a.text) {
    if (!a.company) throw new RangeError("text needs company: the company the draft is about.");
    const r = await verifyClaims(session, { company: a.company, text: a.text });
    const col = (name) => r.columns.indexOf(name);
    fromText = r.rows.map((row) => ({ item: { company: a.company, measure: String(row[col("measure")]), period: String(row[col("period")]), value: Number(row[col("claimed")]), ...(row[col("unit")] ? { unit: String(row[col("unit")]) } : {}), note: String(row[col("claim")] ?? "").slice(0, 500) },
      machine: { verdict: row[col("verdict")] ?? null, filed: row[col("filed")] ?? null, note: row[col("note")] ?? null, source: row[col("source")] ?? null } })).filter((x) => Number.isFinite(x.item.value));
    items = items.concat(fromText.map((x) => x.item));
  }
  if (!items.length) throw new RangeError(a.text ? "The draft has no figure with a measure and a period to label." : "Send items, items_file or text.");
  if (items.length > 2000) throw new RangeError("At most 2,000 items in one task.");
  // Machine labels: verify_claims per company, 25 claims a call.
  const machine = new Array(items.length);
  const byCompany = new Map();
  items.forEach((it, i) => { if (!byCompany.has(it.company)) byCompany.set(it.company, []); byCompany.get(it.company).push(i); });
  // Items from a draft already carry their machine labels.
  const preset = items.length - (fromText?.length ?? 0);
  fromText?.forEach((x, k) => { machine[preset + k] = x.machine; });
  for (const [company, allIdx] of byCompany) {
    const idx = allIdx.filter((i) => i < preset);
    for (let k = 0; k < idx.length; k += 25) {
      const part = idx.slice(k, k + 25);
      try {
        const r = await verifyClaims(session, { company, claims: part.map((i) => ({ measure: items[i].measure, period: items[i].period, value: items[i].value, ...(items[i].unit ? { unit: items[i].unit } : {}) })) });
        const col = (name) => r.columns.indexOf(name);
        part.forEach((i, j) => { const row = r.rows[j] ?? []; machine[i] = { verdict: row[col("verdict")] ?? null, filed: row[col("filed")] ?? null, note: row[col("note")] ?? null, source: row[col("source")] ?? null }; });
      } catch (e) {
        for (const i of part) machine[i] = { verdict: "not_checkable", filed: null, note: `machine check failed: ${String(e.message).slice(0, 200)}`, source: null };
      }
    }
  }
  const ids = items.map((it) => sha(JSON.stringify([it.company, it.measure, it.period, it.value, it.unit ?? null])).slice(0, 12));
  const dir = join(a.out_dir ?? mkdtempSync(join(tmpdir(), "canli-annotation-")), a.task);
  mkdirSync(dir, { recursive: true });
  const n = a.annotators ?? 2, assisted = a.assisted ?? false;
  const packets = [];
  for (let p = 1; p <= n; p += 1) {
    const cols = assisted ? [...COLUMNS.slice(0, 7), "machine_label", "machine_filed", ...COLUMNS.slice(7)] : COLUMNS;
    const rows = items.map((it, i) => [ids[i], it.company, it.measure, it.period, it.value, it.unit ?? "", machine[i].source ?? "", ...(assisted ? [machine[i].verdict, machine[i].filed] : []), "", "", ""]);
    const file = join(dir, `annotator-${p}.csv`);
    writeFileSync(file, toCsv([cols, ...rows]));
    packets.push(file);
  }
  const key = { schema: "canli.annotation-key.v1", task: a.task, created_at: new Date(session.now?.() ?? Date.now()).toISOString(), assisted, annotators: n, labels: LABELS,
    items: items.map((it, i) => ({ item_id: ids[i], ...it, machine: machine[i] })) };
  writeFileSync(join(dir, "key.json"), JSON.stringify(key, null, 1));
  writeFileSync(join(dir, "GUIDELINES.md"), GUIDELINES);
  const counts = {};
  for (const m of machine) counts[m.verdict] = (counts[m.verdict] ?? 0) + 1;
  return {
    task: a.task, task_dir: dir, items: items.length, packets, key: join(dir, "key.json"), guidelines: join(dir, "GUIDELINES.md"),
    machine_labels: counts, blind: !assisted,
    next: `Each person fills the label column of one packet (GUIDELINES.md says how), then annotation_agreement with task_dir ${dir}, then annotation_gold.`,
  };
}

// ---- reading filled packets ----------------------------------------------------------------------------
function readTask(dir) {
  const key = JSON.parse(readFileSync(join(dir, "key.json"), "utf8"));
  const packets = [];
  for (let p = 1; p <= key.annotators; p += 1) {
    const file = join(dir, `annotator-${p}.csv`), text = readFileSync(file, "utf8"), rows = parseCsv(text);
    const head = rows[0], at = (name) => head.indexOf(name);
    if (at("item_id") < 0 || at("label") < 0) throw new RangeError(`${file}: the header must keep item_id and label`);
    const labels = new Map();
    for (const [r, row] of rows.slice(1).entries()) {
      const label = (row[at("label")] ?? "").trim().toLowerCase();
      if (label && !LABELS.includes(label)) throw new RangeError(`${file} row ${r + 2}: label "${label}" is not one of ${LABELS.join(", ")}`);
      const cv = (row[at("correct_value")] ?? "").trim();
      labels.set(row[at("item_id")], { label: label || null, correct_value: cv === "" ? null : Number(cv), note: (row[at("note")] ?? "").trim() || null });
    }
    packets.push({ file, sha256: sha(text), labels });
  }
  return { key, packets };
}

// The machine's verdict on the annotation scale: not_checkable has no human counterpart.
const MACHINE = { confirmed: "confirmed", "confirmed as first reported": "confirmed", contradicted: "contradicted", "not reported": "not_reported" };
const machineLabel = (m) => MACHINE[m?.verdict] ?? null;

export function kappa(pairs) {
  const n = pairs.length;
  if (!n) return { items: 0, agreement: null, kappa: null };
  const agree = pairs.filter(([x, y]) => x === y).length / n;
  let pe = 0;
  for (const l of LABELS) pe += (pairs.filter(([x]) => x === l).length / n) * (pairs.filter(([, y]) => y === l).length / n);
  return { items: n, agreement: Math.round(agree * 1e4) / 1e4, kappa: pe < 1 ? Math.round(((agree - pe) / (1 - pe)) * 1e4) / 1e4 : null };
}

export function annotationAgreement(args) {
  const { task_dir } = agreementInput.parse(args);
  const { key, packets } = readTask(task_dir);
  const ids = key.items.map((x) => x.item_id);
  const done = packets.map((p) => ids.filter((id) => p.labels.get(id)?.label).length);
  const pairs = [];
  for (let a = 0; a < packets.length; a += 1) for (let b = a + 1; b < packets.length; b += 1) {
    const both = ids.filter((id) => packets[a].labels.get(id)?.label && packets[b].labels.get(id)?.label).map((id) => [packets[a].labels.get(id).label, packets[b].labels.get(id).label]);
    pairs.push({ annotators: [a + 1, b + 1], ...kappa(both) });
  }
  // The people's majority (a tie has none) against the machine.
  const majority = (id) => {
    const votes = packets.map((p) => p.labels.get(id)?.label).filter(Boolean), c = {};
    for (const v of votes) c[v] = (c[v] ?? 0) + 1;
    const top = Object.entries(c).sort((x, y) => y[1] - x[1]);
    return top.length && (top.length === 1 || top[0][1] > top[1][1]) ? top[0][0] : null;
  };
  const vsMachine = kappa(key.items.map((x) => [majority(x.item_id), machineLabel(x.machine)]).filter(([h, m]) => h && m));
  const disagreements = key.items.filter((x) => new Set(packets.map((p) => p.labels.get(x.item_id)?.label).filter(Boolean)).size > 1)
    .map((x) => [x.item_id, x.company, x.measure, x.period, x.value, ...packets.map((p) => p.labels.get(x.item_id)?.label ?? null), machineLabel(x.machine)]);
  return {
    task: key.task, items: ids.length, labelled: done, between_annotators: pairs, people_vs_machine: vsMachine,
    disagreements: { columns: ["item_id", "company", "measure", "period", "claimed", ...packets.map((_, i) => `annotator_${i + 1}`), "machine"], rows: disagreements.slice(0, 200), count: disagreements.length },
    meaning: "kappa is Cohen's: agreement beyond what the labels' frequencies give by chance (1 perfect, 0 chance; above 0.8 is usually read as strong). people_vs_machine compares the annotators' majority label with the machine's where both exist.",
    next: disagreements.length ? "A reviewer decides the disagreements; pass them to annotation_gold as reviews." : "annotation_gold writes the gold set.",
  };
}

export function annotationGold(args) {
  const { task_dir, reviews = [] } = goldInput.parse(args);
  const { key, packets } = readTask(task_dir);
  const review = new Map(reviews.map((r) => [r.item_id, r]));
  const gold = [], open = [];
  for (const x of key.items) {
    const labels = packets.map((p) => p.labels.get(x.item_id)).filter((l) => l?.label);
    const set = new Set(labels.map((l) => l.label));
    const decided = review.get(x.item_id);
    let final = null, how = null;
    if (decided) { final = decided; how = "reviewer"; }
    else if (labels.length === packets.length && set.size === 1) { final = labels[0]; how = "unanimous"; }
    if (!final) { open.push(x.item_id); continue; }
    const values = labels.map((l) => l.correct_value).filter((v) => v !== null);
    gold.push({ item_id: x.item_id, company: x.company, measure: x.measure, period: x.period, claimed: x.value, unit: x.unit ?? null,
      label: final.label, correct_value: final.correct_value ?? (values.length ? values[0] : null), decided_by: how, annotator_labels: packets.map((p) => p.labels.get(x.item_id)?.label ?? null),
      machine: x.machine, agrees_with_machine: machineLabel(x.machine) ? machineLabel(x.machine) === final.label : null });
  }
  const out = join(task_dir, "gold.jsonl");
  const body = gold.map((g) => JSON.stringify(g)).join("\n") + (gold.length ? "\n" : "");
  writeFileSync(out, body);
  const between = packets.length > 1 ? kappa(key.items.map((x) => [packets[0].labels.get(x.item_id)?.label, packets[1].labels.get(x.item_id)?.label]).filter(([p, q]) => p && q)) : null;
  const datasheet = {
    schema: "canli.annotation-datasheet.v1", task: key.task, items: key.items.length, gold: gold.length, open: open.length,
    labels: Object.fromEntries(LABELS.map((l) => [l, gold.filter((g) => g.label === l).length])),
    decided_by: { unanimous: gold.filter((g) => g.decided_by === "unanimous").length, reviewer: gold.filter((g) => g.decided_by === "reviewer").length },
    agreement_first_two: between, machine_agreement_on_gold: gold.filter((g) => g.agrees_with_machine !== null).length ? Math.round((gold.filter((g) => g.agrees_with_machine).length / gold.filter((g) => g.agrees_with_machine !== null).length) * 1e4) / 1e4 : null,
    blind: !key.assisted, guidelines: "canli.annotation.v1",
    inputs: { key_sha256: sha(readFileSync(join(task_dir, "key.json"))), packets: packets.map((p) => ({ file: p.file, sha256: p.sha256 })), reviews_sha256: sha(JSON.stringify(reviews)) },
    gold_sha256: sha(body),
  };
  writeFileSync(join(task_dir, "datasheet.json"), JSON.stringify(datasheet, null, 1));
  return { gold_file: out, datasheet_file: join(task_dir, "datasheet.json"), ...datasheet, open_items: open.slice(0, 200),
    next: open.length ? `${open.length} items still need a reviewer's decision: pass them as reviews.` : "Every item has a gold label." };
}
