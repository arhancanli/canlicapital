// The proof ledger: an append-only file where each line carries the hash of the line before it and
// each batch ends in a seal signed with Ed25519. Into it go what companies filed (each figure with
// its filing, and a restatement line whenever a later filing changes one) and the hash of any file,
// a backtest's result or a league entry, so anyone can later check it existed unchanged.
//
// What this proves is narrow and worth stating: the lines have not been altered since they were
// sealed. It does not prove a figure is right or a strategy is good, and an absent record proves
// nothing about whatever is missing. Whoever holds the key could rewrite the whole chain, unless a
// head was copied somewhere else first, so heads should be published and passed back as anchors.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

import { getJson, pad10, resolveEntity } from "canli-markets-mcp/src/sources.mjs";

export const SCHEMA = "canli.proof-ledger.v1";
export const PROOF_LIMITS_TEXT = Object.freeze([
  "A ledger shows these lines have not changed since they were sealed. It does not show a figure is right or a strategy is any good.",
  "No record means no record. It says nothing about the filing, file or strategy that is missing.",
  "Whoever holds the signing key could rewrite the whole chain unless a head was copied elsewhere first: publish heads, and check them with anchors.",
]);

export const canonical = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`);
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const entryHash = (e) => sha256(canonical({ seq: e.seq, at: e.at, kind: e.kind, body: e.body, prev: e.prev }));
const defaultKeyFile = () => join(process.env.CANLI_HOME || join(homedir(), ".canli"), "proof-key.pem");

export function loadKey(file = defaultKeyFile()) {
  let pem;
  try { pem = readFileSync(file, "utf8"); } catch (err) {
    if (err.code !== "ENOENT") throw err;
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });
    // wx: if another process made the key first, that one is the key, and this one is dropped.
    try { writeFileSync(file, pem, { flag: "wx", mode: 0o600 }); } catch (e) { if (e.code !== "EEXIST") throw e; pem = readFileSync(file, "utf8"); }
  }
  const key = createPrivateKey(pem);
  return { key, publicPem: createPublicKey(key).export({ type: "spki", format: "pem" }) };
}

export function readLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l, i) => {
    try { return JSON.parse(l); } catch { throw new RangeError(`line ${i + 1} of the ledger is not JSON`); }
  });
}

// Add records to the ledger and seal them. Records already there (by their id) are left out.
export function appendRecords(file, records, { keyFile, now = () => new Date() } = {}) {
  const { key, publicPem } = loadKey(keyFile);
  const lines = readLines(file), at = now().toISOString();
  mkdirSync(dirname(file), { recursive: true });
  let head = lines.at(-1) ?? null;
  const add = (kind, body) => {
    const e = { seq: head ? head.seq + 1 : 0, at, kind, body, prev: head ? head.hash : null };
    e.hash = entryHash(e);
    head = e;
    return e;
  };
  const out = [];
  if (!lines.length) out.push(add("header", { schema: SCHEMA, public_key: publicPem }));
  else if (lines[0].body?.public_key !== publicPem) throw new RangeError("this key did not start this ledger; use the key it was started with");
  const known = new Set(lines.filter((l) => l.body?.id).map((l) => l.body.id));
  let added = 0;
  for (const r of records) {
    if (r.body.id && known.has(r.body.id)) continue;
    if (r.body.id) known.add(r.body.id);
    out.push(add(r.kind, r.body));
    added += 1;
  }
  if (added) {
    const seal = add("seal", { over: head.hash });
    seal.signature = sign(null, Buffer.from(seal.hash, "hex"), key).toString("base64");
    out.push(seal);
  }
  if (out.length) appendFileSync(file, `${out.map((e) => JSON.stringify(e)).join("\n")}\n`);
  return { added, skipped: records.length - added, head: head ? { seq: head.seq, hash: head.hash } : null };
}

// Recompute the chain from the file alone. Stops at the first line that does not hold.
export function verifyLedger(file, anchors = []) {
  const lines = readLines(file), problems = [];
  if (!lines.length) return { valid: false, entries: 0, problems: ["The ledger is empty or missing."] };
  const header = lines[0];
  if (header.kind !== "header" || header.body?.schema !== SCHEMA) problems.push("The first line is not this ledger's header.");
  let publicKey = null;
  try { publicKey = createPublicKey(header.body.public_key); } catch { problems.push("The header's public key cannot be read."); }
  let prev = null, seals = 0, sealedTo = -1;
  for (const [i, e] of lines.entries()) {
    if (e.seq !== i) { problems.push(`Line ${i + 1} has sequence ${e.seq}: a line was added, removed or moved.`); break; }
    if (e.prev !== prev) { problems.push(`Line ${i + 1} does not follow the one before it.`); break; }
    if (entryHash(e) !== e.hash) { problems.push(`Line ${i + 1} was changed: its hash does not match its content.`); break; }
    if (e.kind === "seal") {
      if (!publicKey || !e.signature || !verify(null, Buffer.from(e.hash, "hex"), publicKey, Buffer.from(e.signature, "base64"))) { problems.push(`Line ${i + 1} is a seal whose signature does not verify.`); break; }
      seals += 1; sealedTo = i;
    }
    prev = e.hash;
  }
  for (const a of anchors) if (lines[a.seq]?.hash !== a.hash) problems.push(`The published head at line ${a.seq + 1} does not match this file, so history was rewritten or cut.`);
  const tail = lines.length - 1 - sealedTo;
  if (!problems.length && tail > 0) problems.push(`${tail} ${tail === 1 ? "line comes" : "lines come"} after the last seal and ${tail === 1 ? "is" : "are"} unsigned.`);
  const head = lines.at(-1);
  return {
    valid: problems.length === 0, entries: lines.length, seals, anchors_checked: anchors.length,
    head: { seq: head.seq, hash: head.hash, at: head.at }, key_fingerprint: publicKey ? sha256(publicKey.export({ type: "spki", format: "der" })).slice(0, 16) : null,
    problems, limits: PROOF_LIMITS_TEXT,
  };
}

// ---------------------------------------------------------------------------------------------
// What companies filed, and what later filings changed
// ---------------------------------------------------------------------------------------------
const CONCEPTS = Object.freeze(["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "NetIncomeLoss", "OperatingIncomeLoss", "GrossProfit", "Assets", "Liabilities", "StockholdersEquity", "CashAndCashEquivalentsAtCarryingValue", "NetCashProvidedByUsedInOperatingActivities", "EarningsPerShareDiluted"]);

// Rows from a concept's facts: one record per value per filing, and a restatement where a period's value changes.
export function filingRecords(cik, name, concept, unit, rows) {
  const byPeriod = new Map();
  for (const r of rows) if (r.accn && Number.isFinite(r.val)) { const p = `${r.start ?? ""}|${r.end}`; (byPeriod.get(p) ?? byPeriod.set(p, []).get(p)).push(r); }
  const out = [];
  for (const list of byPeriod.values()) {
    list.sort((a, b) => String(a.filed).localeCompare(String(b.filed)) || String(a.accn).localeCompare(String(b.accn)));
    let last = null;
    for (const r of list) {
      if (last === null || r.val !== last.val) {
        const period = { ...(r.start ? { start: r.start } : {}), end: r.end };
        const base = { cik, company: name, concept, unit, ...period };
        out.push({ kind: "figure", body: { id: `figure|${cik}|${concept}|${unit}|${r.start ?? ""}|${r.end}|${r.val}|${r.accn}`, ...base, value: r.val, form: r.form, accession: r.accn, filed: r.filed } });
        if (last !== null) out.push({ kind: "restatement", body: { id: `restatement|${cik}|${concept}|${unit}|${r.start ?? ""}|${r.end}|${last.accn}|${r.accn}`, ...base, from: { value: last.val, accession: last.accn, filed: last.filed }, to: { value: r.val, accession: r.accn, filed: r.filed }, change: last.val !== 0 ? (r.val - last.val) / Math.abs(last.val) : null } });
        last = r;
      }
    }
  }
  return out;
}

export const proofFilingsInput = z.object({
  ledger_file: z.string().min(1).max(1000).describe("The ledger file; started if new."),
  companies: z.array(z.string().min(1).max(120)).min(1).max(600).describe("Tickers, CIKs or names."),
  key_file: z.string().min(1).max(1000).optional().describe("Signing key (PEM); created if new. Default ~/.canli/proof-key.pem."),
}).strict();
export async function proofFilings(session, args) {
  const a = proofFilingsInput.parse(args);
  const records = [], read = [], failed = [];
  for (const c of a.companies) {
    try {
      const e = await resolveEntity(session, c);
      const facts = await getJson(session, `https://data.sec.gov/api/xbrl/companyfacts/CIK${pad10(e.cik)}.json`, { maxBytes: 96 * 1024 * 1024 });
      for (const concept of CONCEPTS) for (const [unit, rows] of Object.entries(facts?.facts?.["us-gaap"]?.[concept]?.units ?? {})) records.push(...filingRecords(e.cik, e.name ?? facts.entityName ?? c, concept, unit, rows));
      read.push(c);
    } catch (err) { failed.push({ company: c, why: String(err.message).slice(0, 200) }); }
  }
  const r = appendRecords(a.ledger_file, records, { keyFile: a.key_file });
  const restatements = records.filter((x) => x.kind === "restatement").length;
  return { ledger_file: a.ledger_file, companies_read: read.length, ...(failed.length ? { failed } : {}), figures_and_restatements_read: records.length, restatements_seen: restatements, ...r, plain_reading: `Read ${read.length} ${read.length === 1 ? "company" : "companies"}: ${r.added} new lines sealed, ${r.skipped} already in the ledger. ${restatements} changes between filings seen. A change can be a correction, a reclassification or a new way of reporting; the lines do not say which.`, limits: PROOF_LIMITS_TEXT };
}

export const proofFileInput = z.object({
  ledger_file: z.string().min(1).max(1000).describe("The ledger file; started if new."),
  file: z.string().min(1).max(1000).describe("The file to record: a backtest's result, a returns file, a league entry. Only its hash goes in the ledger."),
  label: z.string().min(1).max(200).describe("What this file is."),
  kind: z.enum(["backtest", "returns", "league_entry", "other"]).optional().describe("Default other."),
  key_file: z.string().min(1).max(1000).optional().describe("Signing key (PEM); created if new."),
}).strict();
export function proofFile(args) {
  const a = proofFileInput.parse(args);
  const digest = sha256(readFileSync(a.file));
  const r = appendRecords(a.ledger_file, [{ kind: "file", body: { id: `file|${digest}`, sha256: digest, label: a.label, kind: a.kind ?? "other" } }], { keyFile: a.key_file });
  return { ledger_file: a.ledger_file, sha256: digest, ...r, plain_reading: r.added ? `Recorded the hash of ${a.file}: this exact file existed when this line was sealed. Nothing else about it is claimed.` : "This exact file is already in the ledger.", limits: PROOF_LIMITS_TEXT };
}

export const proofVerifyInput = z.object({
  ledger_file: z.string().min(1).max(1000),
  anchors: z.array(z.object({ seq: z.number().int().min(0), hash: z.string().regex(/^[0-9a-f]{64}$/) }).strict()).max(1000).optional().describe("Heads published elsewhere: each must still be in the file."),
}).strict();

export const proofFindInput = z.object({
  ledger_file: z.string().min(1).max(1000),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional().describe("A file's hash."),
  file: z.string().min(1).max(1000).optional().describe("Or the file itself, hashed here."),
  company: z.string().min(1).max(120).optional().describe("Company name or CIK as recorded."),
  concept: z.string().min(1).max(160).optional(),
  kind: z.enum(["figure", "restatement", "file"]).optional(),
  limit: z.number().int().min(1).max(500).optional().describe("Default 50."),
}).strict();
export function proofFind(args) {
  const a = proofFindInput.parse(args);
  const want = a.file ? sha256(readFileSync(a.file)) : a.sha256;
  const who = a.company?.toLowerCase();
  const hits = readLines(a.ledger_file).filter((e) => {
    if (!["figure", "restatement", "file"].includes(e.kind)) return false;
    if (a.kind && e.kind !== a.kind) return false;
    if (want && e.body.sha256 !== want) return false;
    if (who && !(String(e.body.company ?? "").toLowerCase().includes(who) || String(e.body.cik) === a.company)) return false;
    return !(a.concept && e.body.concept !== a.concept);
  });
  const limit = a.limit ?? 50;
  return { found: hits.length, records: hits.slice(-limit).map((e) => ({ seq: e.seq, at: e.at, kind: e.kind, ...e.body, id: undefined, hash: e.hash })), plain_reading: hits.length ? `${hits.length} ${hits.length === 1 ? "record" : "records"} found.` : "No record found. That says only that this ledger holds none: it does not mean the file, figure or strategy is wrong or made up.", limits: PROOF_LIMITS_TEXT };
}
