import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { appendRecords, canonical, filingRecords, proofFile, proofFind, proofFilings, verifyLedger } from "../src/proof.mjs";
import { createSession } from "canli-markets-mcp/src/sources.mjs";

const tempDir = (t) => { const d = mkdtempSync(path.join(tmpdir(), "canli-proof-")); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const paths = (d) => ({ file: path.join(d, "ledger.jsonl"), keyFile: path.join(d, "key.pem") });
const rec = (n) => ({ kind: "file", body: { id: `file|${n}`, sha256: String(n).repeat(64).slice(0, 64), label: `f${n}`, kind: "other" } });
const edit = (file, fn) => { const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l)); fn(lines); writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`); };

test("canonical form ignores key order, so a hash does not depend on how JSON was written", () => {
  assert.equal(canonical({ b: 1, a: [1, { d: 2, c: null }] }), canonical({ a: [1, { c: null, d: 2 }], b: 1 }));
});

test("a sealed ledger verifies, repeats are not added twice, and the key file is private", (t) => {
  const d = tempDir(t), { file, keyFile } = paths(d);
  assert.equal(appendRecords(file, [rec(1), rec(2)], { keyFile }).added, 2);
  const again = appendRecords(file, [rec(1), rec(3)], { keyFile });
  assert.equal(again.added, 1);
  assert.equal(again.skipped, 1);
  assert.equal(appendRecords(file, [rec(1)], { keyFile }).added, 0, "nothing new: no new seal");
  const v = verifyLedger(file);
  assert.equal(v.valid, true, JSON.stringify(v.problems));
  assert.equal(v.seals, 2);
  assert.equal(statSync(keyFile).mode & 0o777, 0o600);
  assert.ok(v.key_fingerprint);
});

test("any change is caught, and says where: a value, a removed line, a moved line, a forged seal, a resealed chain", (t) => {
  const d = tempDir(t), { file, keyFile } = paths(d);
  appendRecords(file, [rec(1), rec(2), rec(3)], { keyFile });
  const good = readFileSync(file, "utf8"), reset = () => writeFileSync(file, good);
  edit(file, (l) => { l[2].body.label = "changed"; });
  assert.match(verifyLedger(file).problems[0], /Line 3 was changed/);
  reset();
  edit(file, (l) => { l.splice(1, 1); });
  assert.match(verifyLedger(file).problems[0], /Line 2 has sequence 2/);
  reset();
  edit(file, (l) => { [l[1], l[2]] = [l[2], l[1]]; });
  assert.equal(verifyLedger(file).valid, false);
  reset();
  edit(file, (l) => { l.at(-1).signature = Buffer.from("x".repeat(64)).toString("base64"); });
  assert.match(verifyLedger(file).problems[0], /signature does not verify/);
  reset();
  const anchor = { seq: JSON.parse(good.trim().split("\n").at(-1)).seq, hash: JSON.parse(good.trim().split("\n").at(-1)).hash };
  assert.equal(verifyLedger(file, [anchor]).valid, true);
  // Someone with the key rewrites everything: the chain and seals are fine, and only an anchor shows it.
  rmSync(file);
  appendRecords(file, [rec(7)], { keyFile });
  assert.equal(verifyLedger(file).valid, true, "a rewrite by the key holder passes alone");
  assert.equal(verifyLedger(file, [anchor]).valid, false);
});

test("another key cannot continue a ledger", (t) => {
  const d = tempDir(t), { file, keyFile } = paths(d);
  appendRecords(file, [rec(1)], { keyFile });
  assert.throws(() => appendRecords(file, [rec(2)], { keyFile: path.join(d, "other.pem") }), /did not start this ledger/);
});

test("figures become one record per value per filing; a change between filings is a restatement line", () => {
  const rows = [
    { val: 100, accn: "a-1", form: "10-K", filed: "2023-02-01", start: "2022-01-01", end: "2022-12-31" },
    { val: 100, accn: "a-2", form: "10-K", filed: "2024-02-01", start: "2022-01-01", end: "2022-12-31" },
    { val: 90, accn: "a-3", form: "10-K", filed: "2025-02-01", start: "2022-01-01", end: "2022-12-31" },
    { val: 500, accn: "a-3", form: "10-K", filed: "2025-02-01", end: "2024-12-31" },
  ];
  const out = filingRecords(1, "Co", "Revenues", "USD", rows);
  assert.deepEqual(out.map((r) => r.kind), ["figure", "figure", "restatement", "figure"]);
  const r = out[2].body;
  assert.equal(r.from.value, 100);
  assert.equal(r.to.value, 90);
  assert.equal(r.change, -0.1);
  assert.equal(r.from.accession, "a-1");
});

test("the filings route over a stand-in SEC, and looking up finds a record or says what no record means", async (t) => {
  const d = tempDir(t), { file, keyFile } = paths(d);
  const facts = { entityName: "Apple Inc.", facts: { "us-gaap": { Revenues: { units: { USD: [{ val: 100, accn: "a-1", form: "10-K", filed: "2023-02-01", start: "2022-01-01", end: "2022-12-31" }, { val: 90, accn: "a-2", form: "10-K", filed: "2024-02-01", start: "2022-01-01", end: "2022-12-31" }] } } } } };
  const fetchImpl = async (url) => {
    if (String(url).includes("company_tickers")) return new Response(JSON.stringify({ 0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." } }), { status: 200 });
    if (String(url).includes("companyfacts")) return new Response(JSON.stringify(facts), { status: 200 });
    return new Response("{}", { status: 404 });
  };
  const s = createSession({ fetchImpl, env: {} });
  const first = await proofFilings(s, { ledger_file: file, companies: ["AAPL"], key_file: keyFile });
  assert.equal(first.added, 3);
  assert.equal(first.restatements_seen, 1);
  assert.equal((await proofFilings(s, { ledger_file: file, companies: ["AAPL"], key_file: keyFile })).added, 0);
  assert.equal(verifyLedger(file).valid, true);
  const found = proofFind({ ledger_file: file, company: "apple", kind: "restatement" });
  assert.equal(found.found, 1);
  assert.equal(found.records[0].to.value, 90);
  const none = proofFind({ ledger_file: file, company: "Nobody Inc" });
  assert.equal(none.found, 0);
  assert.match(none.plain_reading, /does not mean the file, figure or strategy is wrong/);
  const some = path.join(d, "result.json");
  writeFileSync(some, "{\"sharpe\":1}");
  const noted = proofFile({ ledger_file: file, file: some, label: "a backtest result", kind: "backtest", key_file: keyFile });
  assert.equal(noted.added, 1);
  assert.equal(proofFile({ ledger_file: file, file: some, label: "again", key_file: keyFile }).added, 0);
  assert.equal(proofFind({ ledger_file: file, file: some }).found, 1);
  writeFileSync(some, "{\"sharpe\":2}");
  assert.equal(proofFind({ ledger_file: file, file: some }).found, 0, "one changed byte is another file");
});
