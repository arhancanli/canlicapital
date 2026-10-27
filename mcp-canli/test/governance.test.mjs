// The policy file and audit log (CANLI_POLICY), and the live filings feed.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { CHECKPOINT_EVERY, createAudit, loadPolicy, publicKeys, refusal, signingKeys, verifyAudit } from "../src/governance.mjs";
import { watchFilings } from "../src/watch.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, "src", "server.mjs");
const tmp = (p) => mkdtempSync(path.join(tmpdir(), `canli-${p}-`));

test("policy: deny wins, allow lists and packs, orders off, and a bad file is named", () => {
  const p = { tools: { allow: ["markets:*", "history"], deny: ["news"] }, orders: "off" };
  assert.equal(refusal(p, { name: "price_history", pack: "markets" }), null);
  assert.equal(refusal(p, { name: "history", pack: "fundamentals" }), null);
  assert.match(refusal(p, { name: "news", pack: "markets" }), /denied/);
  assert.match(refusal(p, { name: "sharpe_ratio", pack: "quant" }), /allow list/);
  assert.match(refusal({ orders: "off" }, { name: "send_orders", pack: "paper" }, { destructive: true }), /sends orders/);
  assert.equal(refusal(null, { name: "news", pack: "markets" }), null);
  const dir = tmp("policy"), f = path.join(dir, "policy.json");
  writeFileSync(f, JSON.stringify({ tools: { allow: ["rm -rf"] } }));
  assert.throws(() => loadPolicy({ CANLI_POLICY: f }), /tools\.allow\.0/);
  writeFileSync(f, JSON.stringify({ orders: "maybe" }));
  assert.throws(() => loadPolicy({ CANLI_POLICY: f }), /orders/);
  assert.equal(loadPolicy({}), null);
  // The policy itself, inline, for a desktop app's config.
  assert.deepEqual(loadPolicy({ CANLI_POLICY: ' {"orders":"off"}' }), { orders: "off" });
  assert.throws(() => loadPolicy({ CANLI_POLICY: '{"orders":"maybe"}' }), /CANLI_POLICY \(inline\): orders/);
  assert.throws(() => loadPolicy({ CANLI_POLICY: "{orders" }), /CANLI_POLICY \(inline\)/);
});

test("audit log: chained, signed at checkpoints with Ed25519 and ML-DSA-65, and any edit is caught", () => {
  const home = tmp("audit"), keys = signingKeys(path.join(home, "audit-keys"));
  assert.ok(keys.ed25519);
  const audit = createAudit({ dir: path.join(home, "audit"), keys });
  for (let i = 0; i < CHECKPOINT_EVERY * 2 + 3; i += 1) audit.record({ tool: "history", pack: "fundamentals", args: { company: "AAPL", i }, result: { rows: [i] } });
  audit.record({ tool: "news", pack: "markets", args: {}, error: "denied" });
  const pubs = publicKeys(home);
  const ok = verifyAudit(audit.path, pubs);
  assert.equal(ok.valid, true, JSON.stringify(ok));
  assert.equal(ok.files[0].checkpoints, 2);
  assert.equal(ok.files[0].calls, CHECKPOINT_EVERY * 2 + 4);
  assert.equal(ok.files[0].unsigned_tail, 4);
  const lines = readFileSync(audit.path, "utf8").trim().split("\n");
  const cp = JSON.parse(lines.find((l) => l.includes('"checkpoint"')));
  if (Number(process.versions.node.split(".")[0]) >= 25 || (process.versions.node.startsWith("24.") && Number(process.versions.node.split(".")[1]) >= 7)) assert.ok(cp.sig.ml_dsa_65 && cp.keys.ml_dsa_65, "post-quantum signature present");
  // Arguments are hashed, not kept. (Signatures and keys are base64, which can spell AAPL by chance.)
  const unsigned = lines.map((l) => { const { sig, keys: k, ...rest } = JSON.parse(l); return JSON.stringify(rest); }).join("\n");
  assert.doesNotMatch(unsigned, /AAPL/);
  const check = (text) => { const f = path.join(tmp("tamper"), "log.jsonl"); writeFileSync(f, text); return verifyAudit(f, pubs); };
  assert.equal(check(lines.join("\n")).valid, true);
  const edited = lines.map((l, i) => (i === 5 ? l.replace('"history"', '"news"') : l));
  assert.match(check(edited.join("\n")).files[0].problems.join(" "), /do not match its hash/);
  const dropped = lines.filter((_, i) => i !== 7);
  assert.equal(check(dropped.join("\n")).valid, false);
  // A rehashed edit still breaks the chain to the next record and the checkpoint's signature.
  const forged = lines.map((l) => JSON.parse(l));
  forged[3].tool = "other";
  assert.equal(check(forged.map((r) => JSON.stringify(r)).join("\n")).valid, false);
  // Another key does not verify.
  const other = publicKeys((() => { const h = tmp("other"); signingKeys(path.join(h, "audit-keys")); return h; })());
  assert.match(verifyAudit(audit.path, other).files[0].problems.join(" "), /not the key given/);
  // With a post-quantum key (Node 24.7+), checking needs it too; without one, Ed25519 alone is the whole check.
  const edOnly = verifyAudit(audit.path, { ed25519: pubs.ed25519 });
  if (pubs.ml_dsa_65) assert.match(edOnly.files[0].problems.join(" "), /no ml_dsa_65 public key/);
  else assert.equal(edOnly.valid, true);
  // Keys are made once: a second call reads the same ones.
  assert.equal(signingKeys(path.join(home, "audit-keys")).ed25519.keyId, keys.ed25519.keyId);
  // The command line checks a log and exits 1 on a bad one.
  const bad = path.join(tmp("cli"), "log.jsonl");
  writeFileSync(bad, edited.join("\n"));
  assert.equal(JSON.parse(execFileSync(process.execPath, [SERVER, "audit", "verify", audit.path], { env: { ...process.env, CANLI_HOME: home } }).toString()).valid, true);
  assert.equal(spawnSync(process.execPath, [SERVER, "audit", "verify", bad], { env: { ...process.env, CANLI_HOME: home } }).status, 1);
  // A log checked from another CANLI_HOME finds the keys beside it (its home's audit-keys).
  const elsewhere = { ...process.env, CANLI_HOME: tmp("elsewhere") };
  for (const target of [path.dirname(audit.path), audit.path]) assert.equal(JSON.parse(execFileSync(process.execPath, [SERVER, "audit", "verify", target], { env: elsewhere }).toString()).valid, true, target);
});

test("server: without CANLI_POLICY nothing is written; with one, refusals and calls are logged and verify", async (t) => {
  const run = async (env) => {
    const c = new Client({ name: "gov", version: "0" });
    await c.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_OFFLINE: "1", CANLI_PACKS: "all", ...env } }));
    t.after(() => c.close());
    return c;
  };
  const plain = tmp("plain"), c1 = await run({ CANLI_HOME: plain });
  const r1 = await c1.callTool({ name: "run_tool", arguments: { name: "sharpe_ratio", arguments: { returns: [0.01, -0.02, 0.015, 0.003, -0.004] } } });
  assert.ok(!r1.isError, r1.content?.[0]?.text);
  assert.deepEqual(readdirSync(plain), []);
  assert.match(JSON.parse((await c1.readResource({ uri: "canli://privacy" })).contents[0].text).policy, /^none/);

  const home = tmp("gov"), policy = path.join(home, "policy.json");
  writeFileSync(policy, JSON.stringify({ tools: { deny: ["sortino_ratio"] }, calls_per_minute: 50, audit: {} }));
  const c = await run({ CANLI_HOME: home, CANLI_POLICY: policy });
  const denied = await c.callTool({ name: "run_tool", arguments: { name: "sortino_ratio", arguments: { returns: [0.01, -0.02, 0.015] } } });
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /denied by this server's policy/);
  const fine = await c.callTool({ name: "run_tool", arguments: { name: "sharpe_ratio", arguments: { returns: [0.01, -0.02, 0.015, 0.003, -0.004] } } });
  assert.ok(!fine.isError, fine.content?.[0]?.text);
  const v = await c.callTool({ name: "run_tool", arguments: { name: "audit_log", arguments: { action: "verify" } } });
  assert.ok(!v.isError, v.content?.[0]?.text);
  assert.equal(v.structuredContent.valid, true);
  assert.equal(v.structuredContent.files[0].calls, 2);
  const priv = JSON.parse((await c.readResource({ uri: "canli://privacy" })).contents[0].text);
  assert.equal(priv.policy.calls_per_minute, 50);
  assert.deepEqual(readdirSync(home).sort(), ["audit", "audit-keys", "policy.json"]);
});

test("watch: the first read marks what is there, then each new filing comes once, oldest first", async () => {
  const feeds = [
    { columns: ["accepted", "form", "accession"], rows: [["10:02", "8-K", "a2"], ["10:01", "8-K", "a1"]] },
    { columns: ["accepted", "form", "accession"], rows: [["10:04", "8-K", "a4"], ["10:03", "4", "a3"], ["10:02", "8-K", "a2"]] },
    new Error("EDGAR busy"),
    { columns: ["accepted", "form", "accession"], rows: [["10:05", "8-K", "a5"], ["10:04", "8-K", "a4"]] },
  ];
  const out = [], asked = [];
  let i = 0;
  await watchFilings(async (args) => { asked.push(args); const f = feeds[i++]; if (f instanceof Error) throw f; return f; }, { forms: ["8-K"], every: 1, rounds: 4, sleep: async () => {} }, (l) => out.push(JSON.parse(l)));
  assert.deepEqual(out.map((o) => o.type), ["watching", "filing", "filing", "error", "filing"]);
  assert.deepEqual(out.filter((o) => o.type === "filing").map((o) => o.accession), ["a3", "a4", "a5"]);
  assert.equal(out[0].already_filed, 2);
  assert.equal(out[0].every_seconds, 15);
  assert.deepEqual(asked[0], { forms: ["8-K"], limit: 100 });
});

test("a log that ends cleanly ends signed: the server signs its unsigned calls as it exits", async () => {
  const home = tmp("close");
  const c = new Client({ name: "gov", version: "0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_OFFLINE: "1", CANLI_PACKS: "all", CANLI_HOME: home, CANLI_POLICY: JSON.stringify({ audit: {} }) } });
  await c.connect(transport);
  for (let i = 0; i < 3; i += 1) assert.ok(!(await c.callTool({ name: "run_tool", arguments: { name: "sharpe_ratio", arguments: { returns: [0.01, -0.02, 0.015, i / 1000] } } })).isError);
  await c.close();
  let out;
  for (let i = 0; i < 50; i += 1) { out = verifyAudit(path.join(home, "audit"), publicKeys(home)); if (out.files[0]?.unsigned_tail === 0) break; await new Promise((r) => setTimeout(r, 100)); }
  assert.equal(out.valid, true, JSON.stringify(out));
  assert.deepEqual([out.files[0].calls, out.files[0].checkpoints, out.files[0].unsigned_tail], [3, 1, 0]);
  // A missing log is a plain answer, not a crash.
  assert.deepEqual(verifyAudit(path.join(home, "nothing-here")), { valid: false, files: [], error: `no audit log at ${path.join(home, "nothing-here")}` });
});
