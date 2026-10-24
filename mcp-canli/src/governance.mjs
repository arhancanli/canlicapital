// Controls for a firm that runs canli-mcp: a policy file saying which tools may run and how often,
// and a tamper-evident audit log of every tool call.
//
// Both are off unless CANLI_POLICY names a policy file (JSON):
//   { "tools": { "allow": ["markets:*", "history"], "deny": ["news"] },
//     "orders": "off",            // "off" refuses every tool that sends orders (paper trading)
//     "calls_per_minute": 120,
//     "audit": { "arguments": "hash" } }   // "hash" (default) or "full"; omit audit for no log
// A tool is named by itself ("history") or by pack ("markets:*"). With an allow list only listed tools
// run; deny wins over allow.
//
// The audit log is one JSONL file per server process under CANLI_HOME/audit (or audit.dir). Each
// record holds the call's tool, time, outcome and the SHA-256 of its arguments and result (the
// arguments themselves only with "full"), and the hash of the record before it, so removing or
// editing a record breaks every hash after it. Every CHECKPOINT_EVERY records (and on request) a
// checkpoint record is signed with an Ed25519 key and, on Node 24.7 or later, also with an ML-DSA-65
// key (FIPS 204, a post-quantum signature): both must verify. The keys are made on this machine the
// first time (mode 0600) and never leave it; their public halves (*.pub.pem beside them) are what
// the firm gives an auditor. `canli-mcp audit verify <file or directory>` checks a log.
//
// Records after the last checkpoint are chained but not yet signed; a log cut short after a
// checkpoint loses its unsigned tail without a trace, so verify reports how many records are
// unsigned.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

export const CHECKPOINT_EVERY = 20;
const ZERO = "0".repeat(64);
const NAME = /^(?:[a-z]+:\*|[a-z][a-z0-9_]{1,63})$/;

export const POLICY = z.object({
  tools: z.object({
    allow: z.array(z.string().regex(NAME, "a tool name (history) or a pack (markets:*)")).max(500).optional(),
    deny: z.array(z.string().regex(NAME, "a tool name (history) or a pack (markets:*)")).max(500).optional(),
  }).strict().optional(),
  orders: z.enum(["off", "on"]).optional(),
  calls_per_minute: z.number().int().min(1).max(100000).optional(),
  audit: z.object({
    arguments: z.enum(["hash", "full"]).optional(),
    dir: z.string().min(1).max(500).optional(),
  }).strict().optional(),
}).strict();

export const canonical = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) ?? "null" : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const hashOf = (v) => sha256(canonical(v ?? null));

// CANLI_POLICY is a policy file's path, or the policy itself as JSON (a value starting with "{"), which
// suits a desktop app's config where a file is one more thing to manage.
export function loadPolicy(env = process.env) {
  if (!env.CANLI_POLICY) return null;
  const inline = env.CANLI_POLICY.trim().startsWith("{"), label = inline ? "CANLI_POLICY (inline)" : `CANLI_POLICY ${env.CANLI_POLICY}`;
  let raw;
  try { raw = JSON.parse(inline ? env.CANLI_POLICY : readFileSync(env.CANLI_POLICY, "utf8")); } catch (e) { throw new Error(`${label}: ${e.message}`); }
  const parsed = POLICY.safeParse(raw);
  if (!parsed.success) throw new Error(`${label}: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "policy"}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

const matches = (list, entry) => (list ?? []).some((p) => p === entry.name || p === `${entry.pack}:*`);
// Why a policy refuses a call, or null when it allows it.
export function refusal(policy, entry, { destructive = false } = {}) {
  if (!policy) return null;
  if (matches(policy.tools?.deny, entry)) return `${entry.name} is denied by this server's policy (CANLI_POLICY).`;
  if (policy.tools?.allow && !matches(policy.tools.allow, entry)) return `${entry.name} is not on this server's allow list (CANLI_POLICY).`;
  if (destructive && policy.orders === "off") return `${entry.name} sends orders, which this server's policy turns off (CANLI_POLICY orders: "off").`;
  return null;
}

// Signing keys, made once and never overwritten: read first, created exclusively ("wx") only when
// missing, so two processes starting together end up with one key.
const ALGORITHMS = [["ed25519", "ed25519"], ["ml_dsa_65", "ml-dsa-65"]];
export function signingKeys(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keys = {};
  for (const [id, alg] of ALGORITHMS) {
    const priv = join(dir, `audit-${alg}.pem`), pub = join(dir, `audit-${alg}.pub.pem`);
    let pem;
    try { pem = readFileSync(priv); } catch (e) {
      if (e.code !== "ENOENT") throw e;
      let pair;
      try { pair = generateKeyPairSync(alg); } catch { continue; } // ML-DSA needs Node 24.7+
      try { writeFileSync(priv, pair.privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 }); } catch (w) { if (w.code !== "EEXIST") throw w; }
      pem = readFileSync(priv);
    }
    const key = createPrivateKey(pem), publicPem = createPublicKey(key).export({ type: "spki", format: "pem" });
    writeFileSync(pub, publicPem, { mode: 0o644 });
    keys[id] = { key, publicPem, keyId: sha256(publicPem).slice(0, 16), publicPath: pub };
  }
  return keys;
}

export function createAudit({ dir, keys, now = () => new Date(), args: mode = "hash" }) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const started = now().toISOString();
  const path = join(dir, `${started.replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}.jsonl`);
  let seq = 0, prev = ZERO, sinceCheckpoint = 0;
  const append = (body) => {
    const record = { v: 1, seq: ++seq, at: now().toISOString(), ...body, prev };
    record.hash = hashOf(record);
    appendFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    prev = record.hash;
    return record;
  };
  const checkpoint = () => {
    const body = { type: "checkpoint", head: prev, records: seq, keys: Object.fromEntries(Object.entries(keys).map(([id, k]) => [id, k.keyId])) };
    const signed = { v: 1, seq: seq + 1, at: now().toISOString(), ...body, prev };
    const sig = Object.fromEntries(Object.entries(keys).map(([id, k]) => [id, sign(null, Buffer.from(canonical(signed)), k.key).toString("base64")]));
    seq += 1;
    const record = { ...signed, sig };
    record.hash = hashOf(record);
    appendFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    prev = record.hash;
    sinceCheckpoint = 0;
    return record;
  };
  append({ type: "start", keys: Object.fromEntries(Object.entries(keys).map(([id, k]) => [id, k.keyId])), arguments: mode });
  return {
    path,
    record({ tool, pack, args, result, error }) {
      append({ type: "call", tool, pack, ok: !error, ...(error ? { error: String(error).slice(0, 300) } : {}), args_sha256: hashOf(args), ...(mode === "full" ? { args } : {}), result_sha256: error ? null : hashOf(result) });
      if (++sinceCheckpoint >= CHECKPOINT_EVERY) checkpoint();
    },
    checkpoint,
    // Signs what is still unsigned, so a log that ends cleanly ends on a checkpoint.
    close() { if (sinceCheckpoint > 0) checkpoint(); },
    status: () => ({ file: path, records: seq, unsigned: sinceCheckpoint, head: prev, keys: Object.fromEntries(Object.entries(keys).map(([id, k]) => [id, { key_id: k.keyId, public_key: k.publicPath }])) }),
  };
}

// Checks a log (a file, or every .jsonl file in a directory): each record's hash, the chain, the
// sequence, and each checkpoint's signatures against the given public keys (default: the ones
// beside the log's keys in CANLI_HOME). Every signature a checkpoint carries must verify, and a key
// a checkpoint names must be supplied.
export function verifyAudit(target, publicPems = {}) {
  let isDir;
  try { isDir = statSync(target).isDirectory(); } catch { return { valid: false, files: [], error: `no audit log at ${target}` }; }
  const files = isDir ? readdirSync(target).filter((f) => f.endsWith(".jsonl")).sort().map((f) => join(target, f)) : [target];
  const pubs = Object.fromEntries(Object.entries(publicPems).filter(([, pem]) => pem).map(([id, pem]) => { const k = createPublicKey(pem); return [id, { key: k, keyId: sha256(k.export({ type: "spki", format: "pem" })).slice(0, 16) }]; }));
  const out = files.map((file) => verifyFile(file, pubs));
  return { valid: out.length > 0 && out.every((f) => f.valid), files: out };
}

function verifyFile(file, pubs) {
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  const problems = [];
  let prev = ZERO, calls = 0, checkpoints = 0, lastSigned = 0;
  lines.forEach((line, i) => {
    let r;
    try { r = JSON.parse(line); } catch { problems.push(`line ${i + 1}: not JSON`); return; }
    const { hash, ...body } = r;
    if (r.seq !== i + 1) problems.push(`line ${i + 1}: sequence ${r.seq}, expected ${i + 1}`);
    if (r.prev !== prev) problems.push(`record ${r.seq}: does not follow the record before it (a record was removed, inserted or edited)`);
    if (hashOf(body) !== hash) problems.push(`record ${r.seq}: its contents do not match its hash (edited)`);
    if (r.type === "call") calls += 1;
    if (r.type === "checkpoint") {
      checkpoints += 1;
      const { sig, ...signed } = body;
      if (r.head !== prev) problems.push(`checkpoint ${r.seq}: head is not the record before it`);
      for (const [id, keyId] of Object.entries(r.keys ?? {})) {
        const pub = pubs[id];
        if (!pub) { problems.push(`checkpoint ${r.seq}: no ${id} public key given to check it`); continue; }
        if (pub.keyId !== keyId) { problems.push(`checkpoint ${r.seq}: signed by ${id} key ${keyId}, not the key given (${pub.keyId})`); continue; }
        if (!sig?.[id] || !verify(null, Buffer.from(canonical(signed)), pub.key, Buffer.from(sig[id], "base64"))) problems.push(`checkpoint ${r.seq}: ${id} signature does not verify`);
      }
      if (!Object.keys(r.keys ?? {}).length) problems.push(`checkpoint ${r.seq}: names no keys`);
      lastSigned = r.seq;
    }
    prev = hash;
  });
  return { file, valid: problems.length === 0, records: lines.length, calls, checkpoints, unsigned_tail: lines.length - lastSigned, ...(problems.length ? { problems: problems.slice(0, 20) } : {}) };
}

// The policy and audit log for this process, or nothing when CANLI_POLICY is unset.
export function governance(env = process.env, home) {
  const policy = loadPolicy(env);
  if (!policy) return { policy: null, audit: null, check: () => {}, record: () => {}, close: () => {} };
  const keyDir = join(home, "audit-keys");
  const audit = policy.audit ? createAudit({ dir: policy.audit.dir ?? join(home, "audit"), keys: signingKeys(keyDir), args: policy.audit.arguments ?? "hash" }) : null;
  const window = [];
  return {
    policy, audit,
    check(entry, opts) {
      const why = refusal(policy, entry, opts);
      if (why) throw new Error(why);
      if (policy.calls_per_minute) {
        const t = Date.now();
        while (window.length && window[0] <= t - 60000) window.shift();
        if (window.length >= policy.calls_per_minute) throw new Error(`This server's policy allows ${policy.calls_per_minute} tool calls a minute (CANLI_POLICY); try again in ${Math.ceil((window[0] + 60000 - t) / 1000)} s.`);
        window.push(t);
      }
    },
    record: (call) => audit?.record(call),
    close: () => audit?.close(),
  };
}

export function publicKeys(home) {
  const read = (alg) => { try { return readFileSync(join(home, "audit-keys", `audit-${alg}.pub.pem`), "utf8"); } catch { return null; } };
  return { ed25519: read("ed25519"), ml_dsa_65: read("ml-dsa-65") };
}
