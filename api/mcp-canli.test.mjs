// The hosted flagship (canlicapital.com/mcp/canli), exercised over real HTTP the way a URL-only
// client meets it: the published package's three tools and result viewer, a computation, and the
// hosted rules (no files, no paper trading, no prices, nothing kept, a per-caller rate), and the
// signature on every answer's receipt. Nothing here reaches the network.
import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";

import { keyIdFor } from "../js/receipt-statement.js";
import { canonicalJson } from "../scripts/canonical-json.mjs";
import { ANSWER_RECEIPT_KEY, ANSWER_SIGNATURE_SCHEMA, answerStatement, signAnswerReceipt, verifyAnswerReceipt } from "./_lib/answer-receipts.js";
import { createCanliHandler, createLimiter, HOSTED_ENDPOINT, HOSTED_NOTE, MAX_FLAGSHIP_BODY_BYTES, namesAFile } from "./mcp-canli.js";

const INIT = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } };

async function withHandler(handler, fn) {
  const server = createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}/mcp/canli`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function rpc(url, method, params, { id = 1, raw } = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Protocol-Version": "2025-06-18" },
    body: raw ?? JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return { status: res.status, headers: res.headers, body: await res.json() };
}
const call = (url, name, args) => rpc(url, "tools/call", { name: "run_tool", arguments: { name, arguments: args } });
const text = (r) => r.body.result.content[0].text;

test("the published flagship answers by URL: three tools, the viewer, the hosted rules in its instructions", async () => {
  await withHandler(createCanliHandler(), async (url) => {
    const init = await rpc(url, "initialize", INIT);
    assert.equal(init.status, 200);
    assert.equal(init.body.result.serverInfo.name, "canli-mcp");
    assert.ok(init.body.result.instructions.endsWith(HOSTED_NOTE));
    const tools = (await rpc(url, "tools/list", {})).body.result.tools;
    assert.deepEqual(tools.map((t) => t.name), ["find_tool", "describe_tool", "run_tool"]);
    assert.equal(tools.find((t) => t.name === "run_tool")._meta.ui.resourceUri, "ui://canli/view");
    const view = (await rpc(url, "resources/read", { uri: "ui://canli/view" })).body.result.contents[0];
    assert.equal(view.mimeType, "text/html;profile=mcp-app");
    assert.match(view.text, /^<!doctype html>/);
  });
});

test("a computation runs; paper trading, prices and Yahoo's data stay with the local server", async () => {
  await withHandler(createCanliHandler(), async (url) => {
    const stats = await call(url, "return_stats", { returns: [0.01, -0.02, 0.015, 0.003, -0.004, 0.012] });
    assert.equal(stats.body.result.isError ?? false, false, text(stats));
    assert.match(text(stats), /mean|sharpe/i);
    const paper = await call(url, "paper_account", {});
    assert.equal(paper.body.result.isError, true, "the paper pack is not served");
    const found = (await rpc(url, "tools/call", { name: "find_tool", arguments: { query: "paper trading account orders" } })).body.result;
    assert.doesNotMatch(found.content[0].text, /"pack":\s*"paper"|paper_account/);
    const price = await call(url, "price_history", { symbol: "SPY" });
    assert.equal(price.body.result.isError, true);
    assert.match(text(price), /Prices are off on this server/, "no request to Yahoo is made");
    const snapshot = await call(url, "stock_snapshot", { symbol: "AAPL" });
    assert.equal(snapshot.body.result.isError, true);
    assert.match(text(snapshot), /Yahoo Finance's data is off on this server/, "no request to Yahoo's quote summary is made");
    assert.match(HOSTED_NOTE, /Yahoo's data/);
  });
});

test("a request naming a file is refused before any tool, with its own id; a body over the limit is refused", async () => {
  assert.equal(namesAFile({ name: "deflated_sharpe", arguments: { returns: { $file: "/etc/passwd", column: "x" } } }), true);
  assert.equal(namesAFile({ calls: [{ name: "a", arguments: { x: [1, 2, { $file: "a.csv" }] } }] }), true);
  assert.equal(namesAFile({ name: "run_tool", arguments: { name: "effective_bets", arguments: { returns_file: "/proc/self/environ" } } }), true, "a tool's own path argument");
  assert.equal(namesAFile({ arguments: { calls: [{ name: "proof_file", arguments: { file: "/etc/passwd", ledger_file: "/tmp/x" } }] } }), true);
  assert.equal(namesAFile({ arguments: { name: "league_new", arguments: { league_dir: "/tmp/x" } } }), true);
  assert.equal(namesAFile({ arguments: { name: "cpcv", arguments: { merge_files: ["/tmp/a"] } } }), true);
  assert.equal(namesAFile({ arguments: { calls: [{ name: "a" }, { name: "effective_bets", arguments: { returns_file: { $result: 0 } } }] } }), true, "nor a path passed on from an earlier call");
  assert.equal(namesAFile({ arguments: { name: "fails_to_deliver", arguments: { files: 6 } } }), false, "a count of files is not a file");
  assert.equal(namesAFile({ arguments: { name: "read_filing", arguments: { company: "AAPL", filed_before: "2020-01-01" } } }), false);
  let deep = { x: 1 };
  for (let i = 0; i < 80; i += 1) deep = { deep };
  assert.equal(namesAFile(deep), true, "too deep to read is refused");
  assert.equal(namesAFile({ name: "a", arguments: { note: "$file" } }), false, "the words alone are not a file argument");
  await withHandler(createCanliHandler(), async (url) => {
    const r = await rpc(url, "tools/call", { name: "run_tool", arguments: { name: "return_stats", arguments: { returns: { $file: "/etc/passwd", column: "x" } } } }, { id: 7 });
    assert.equal(r.status, 200);
    assert.equal(r.body.id, 7);
    assert.equal(r.body.error.code, -32602);
    assert.match(r.body.error.message, /reads no files/);
    const big = await rpc(url, "tools/call", null, { raw: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "run_tool", arguments: { name: "return_stats", arguments: { returns: Array(MAX_FLAGSHIP_BODY_BYTES / 4).fill(0.001) } } } }) });
    assert.equal(big.status, 413);
  });
});

test("each caller gets a bounded number of requests a minute", async () => {
  let t = 0;
  const limiter = createLimiter({ perMinute: 2, now: () => t });
  assert.deepEqual([limiter("a"), limiter("a"), limiter("b")], [0, 0, 0]);
  assert.equal(limiter("a"), 60, "the third in a minute waits for the first to age out");
  t = 60_001;
  assert.equal(limiter("a"), 0);
  await withHandler(createCanliHandler({ limiter: createLimiter({ perMinute: 1 }) }), async (url) => {
    assert.equal((await rpc(url, "initialize", INIT)).status, 200);
    const again = await rpc(url, "tools/list", {});
    assert.equal(again.status, 429);
    assert.ok(Number(again.headers.get("retry-after")) >= 1);
    assert.match(again.body.error.message, /60 a minute/);
  });
});

test("paid keys: the tier sets the rate and the size, counted per key; unknown and revoked keys are refused; free requests never read the store", async () => {
  const PRO = "ck_live_" + "p".repeat(43), GONE = "ck_live_" + "r".repeat(43), NOPE = "ck_live_" + "n".repeat(43), DOWN = "ck_live_" + "d".repeat(43);
  const { hashKey } = await import("./_lib/auth.js");
  const reads = [];
  const tierOf = async (h) => {
    reads.push(h);
    if (h === hashKey(PRO)) return { known: true, revoked: false, tier: "pro" };
    if (h === hashKey(GONE)) return { known: true, revoked: true, tier: null };
    if (h === hashKey(DOWN)) throw new Error("store 503");
    return { known: false, revoked: false, tier: null };
  };
  const keyed = (url, key, method, params, raw) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Protocol-Version": "2025-06-18", ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: raw ?? JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  await withHandler(createCanliHandler({ limiter: createLimiter({ perMinute: 1 }), tierOf }), async (url) => {
    assert.equal((await keyed(url, null, "initialize", INIT)).status, 200);
    assert.equal((await keyed(url, null, "tools/list", {})).status, 429, "free: one a minute here");
    assert.equal(reads.length, 0, "a request with no key never reads the store");
    for (let i = 0; i < 5; i += 1) assert.equal((await keyed(url, PRO, "tools/list", {})).status, 200, "pro: 600 a minute, its own count");
    const gone = await keyed(url, GONE, "tools/list", {});
    assert.equal(gone.status, 401); assert.match(gone.body.error.message, /revoked/);
    const nope = await keyed(url, NOPE, "tools/list", {});
    assert.equal(nope.status, 401); assert.match(nope.body.error.message, /Unknown key/);
    assert.equal((await keyed(url, DOWN, "tools/list", {})).status, 200, "store down: served at the free tier");
    assert.equal((await keyed(url, DOWN, "tools/list", {})).status, 429, "at the free tier's rate, per key");
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "run_tool", arguments: { name: "return_stats", arguments: { returns: Array(Math.ceil((MAX_FLAGSHIP_BODY_BYTES * 1.5) / 6)).fill(0.001) } } } });
    assert.ok(body.length > MAX_FLAGSHIP_BODY_BYTES);
    assert.equal((await keyed(url, PRO, null, null, body)).status, 200, "pro takes a larger request");
  });
});

test("a key's tier is read once a minute per key", async () => {
  const { createTierResolver } = await import("./mcp-canli.js");
  let t = 0, n = 0;
  const resolve = createTierResolver({ store: { keyTier: async () => { n += 1; return { known: true, revoked: false, tier: "pro" }; } }, now: () => t });
  await resolve("h"); await resolve("h");
  assert.equal(n, 1);
  t = 60_001; await resolve("h");
  assert.equal(n, 2);
});

test("every path argument of every tool in the catalog is caught by the gate", () => {
  const { tools } = JSON.parse(readFileSync(new URL("../mcp-canli/src/index.json", import.meta.url), "utf8"));
  const notPaths = new Set(["filed_before", "paths", "profile"]);
  const missed = [];
  for (const t of tools) for (const [, name] of t[6].matchAll(/\b([a-z_]*(?:file|dir|path|folder)[a-z_]*)\??:/g)) {
    if (!notPaths.has(name) && !namesAFile({ [name]: "/etc/passwd" })) missed.push(`${t[0]}.${name}`);
  }
  assert.deepEqual(missed, []);
});

test("the hosted server never waits on a question to the person: a name that matches several filers keeps the best match, with the others listed", () => {
  // Each request builds a fresh stateless server, so there is no stream an elicitation answer could come back on.
  assert.equal(process.env.CANLI_ASK, "0");
});

// A receipt key as canli-receipt-keys.json publishes one, and the environment that signs with it.
function receiptKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const x = publicKey.export({ format: "jwk" }).x;
  return {
    env: { CANLI_RECEIPT_SIGNING_KEY: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") },
    published: { key_id: keyIdFor(Buffer.from(x, "base64url")), alg: "Ed25519", x, status: "active" },
  };
}
const RETURNS = [0.01, -0.02, 0.015, 0.003, -0.004, 0.012];

test("every answer's receipt leaves signed with the published receipt key, naming this endpoint, and any change to it fails the check", async () => {
  const key = receiptKey();
  await withHandler(createCanliHandler({ env: key.env }), async (url) => {
    const res = await call(url, "return_stats", { returns: RETURNS });
    assert.equal(res.body.result.isError ?? false, false, text(res));
    const receipt = res.body.result._meta[ANSWER_RECEIPT_KEY];
    assert.equal(receipt.endpoint, HOSTED_ENDPOINT);
    assert.match(receipt.output_sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual([receipt.signature.alg, receipt.signature.schema, receipt.signature.key_id], ["Ed25519", ANSWER_SIGNATURE_SCHEMA, key.published.key_id]);
    assert.deepEqual(verifyAnswerReceipt(receipt, [key.published]), { valid: true, checks: { signed: true, key_published: true, signature_valid: true }, key_id: key.published.key_id });
    // What a verifier with no code of ours checks: Ed25519 over the canonical JSON of {schema, receipt}, the receipt
    // without its signature, against the published key.
    const { signature, ...content } = receipt;
    const publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: key.published.x }, format: "jwk" });
    assert.equal(verify(null, Buffer.from(canonicalJson({ schema: ANSWER_SIGNATURE_SCHEMA, receipt: content }), "utf8"), publicKey, Buffer.from(signature.value, "base64url")), true);
    // A field JSON leaves out (undefined) is not in what the client receives, so it is not in what is signed.
    assert.equal(answerStatement({ ...content, dropped: undefined }), answerStatement(content));
    // Ed25519 is deterministic: signed again, the receipt gives the same bytes, so nothing about it is stored.
    assert.equal(signAnswerReceipt(receipt, key.env).value, signature.value);
    // Kept by a client in another key order, it still checks: the content is signed, not its layout.
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(receipt).reverse())));
    assert.equal(verifyAnswerReceipt(reordered, [key.published]).valid, true);

    const holds = (edit) => verifyAnswerReceipt({ ...receipt, ...edit }, [key.published]).checks.signature_valid;
    assert.equal(holds({ output_sha256: "0".repeat(64) }), false, "another answer");
    assert.equal(holds({ at: "2026-01-01T00:00:00.000Z" }), false, "another time");
    assert.equal(holds({ endpoint: "example.com/mcp" }), false, "another endpoint");
    assert.equal(holds({ sources: [{ url: "https://www.sec.gov/x.htm", sha256: "0".repeat(64) }] }), false, "a source added");
    assert.equal(holds({ server: "canli-mcp@9.9.9" }), false, "another version");
    assert.equal(holds({ signature: { ...signature, schema: "canli.receipt-signature.v1" } }), false, "a validation receipt's schema");
    const other = receiptKey();
    assert.deepEqual(verifyAnswerReceipt(receipt, [other.published]).checks, { signed: true, key_published: false, signature_valid: false }, "a key canlicapital.com does not publish");
    assert.equal(verifyAnswerReceipt(receipt, [{ ...other.published, key_id: key.published.key_id }]).checks.signature_valid, false, "a published entry whose key is not its key id");

    // An answer with no receipt (find_tool, describe_tool) passes through as it was.
    const found = (await rpc(url, "tools/call", { name: "find_tool", arguments: { query: "sharpe ratio" } })).body.result;
    assert.equal(found.isError ?? false, false);
    assert.equal(found._meta?.[ANSWER_RECEIPT_KEY], undefined);
  });
});

test("without the signing key (a preview or a local run) the receipt is served with signature null, and does not check", async () => {
  await withHandler(createCanliHandler({ env: {} }), async (url) => {
    const receipt = (await call(url, "return_stats", { returns: RETURNS })).body.result._meta[ANSWER_RECEIPT_KEY];
    assert.equal(receipt.endpoint, HOSTED_ENDPOINT);
    assert.equal(receipt.signature, null);
    assert.deepEqual(verifyAnswerReceipt(receipt, [receiptKey().published]), { valid: false, checks: { signed: false, key_published: false, signature_valid: false }, key_id: null });
  });
});
