// Cirrun receipts into the books. The receipts in fixtures/cirrun were signed and written by Cirrun's own code
// (receipts.sign and store.put_json): sample/ is the receipt cirrun.com/verify shows, the rest were made for these
// tests with one key (A, fingerprint below) except other-key/. A check here that passes is a check of the bytes
// Python signed, floats such as 0.0 and 1.2e-05 and an escaped "Zürich" included.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { pyNum, readCirrunReceipt } from "../src/cirrun.mjs";

const SERVER = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
const FIXTURES = fileURLToPath(new URL("./fixtures/cirrun/", import.meta.url));
const at = (name) => join(FIXTURES, name);
const A = "bb7299f3c72cad9394f683d7c5eae1d357245b75a44eba63a2693ec07e53d5cf"; // printed by Cirrun's fingerprint()

test("a Cirrun receipt is checked on the bytes Python signed", () => {
  for (const [text, python] of [["0.0", "0.0"], ["1.2e-05", "1.2e-05"], ["2.5", "2.5"], ["1793015692.172548", "1793015692.172548"], ["7200.0", "7200.0"], ["1e+16", "1e+16"], ["0.0001", "0.0001"], ["3", "3"]]) assert.equal(pyNum(text), python, text);

  const sample = readCirrunReceipt(at("sample"), { publicKeyPem: readFileSync(at("sample/signer.pem"), "utf8") });
  assert.equal(sample.run_id, "20261026-155439-f04977");
  assert.ok(sample.key.startsWith("a408bf3a6c5cfe42"), "the fingerprint's first 16 digits are the key id Cirrun wrote");
  assert.deepEqual([sample.wholesale_usd, sample.fee_usd, sample.usd], ["0", "0", "0"]);

  const zurich = readCirrunReceipt(at("zurich"), { fingerprint: A });
  assert.deepEqual([zurich.finished, zurich.provider, zurich.gpu, zurich.wholesale_usd, zurich.fee_usd, zurich.usd], ["2026-11-06T16:03:00.000Z", "runpod", "A100", "2.5", "0.000012", "2.500012"]);
  assert.equal(readCirrunReceipt(at("h100"), { fingerprint: A.toUpperCase() }).usd, "0.793275");

  const dir = mkdtempSync(join(tmpdir(), "canli-cirrun-"));
  const copy = (name) => {
    cpSync(at(name), join(dir, name), { recursive: true });
    return join(dir, name);
  };
  const indented = copy("h100");
  writeFileSync(join(indented, "receipt.json"), readFileSync(join(indented, "receipt.json"), "utf8").replace(/\n/g, "\n  "));
  assert.equal(readCirrunReceipt(indented, { fingerprint: A }).usd, "0.793275", "spacing is not signed");
  const moved = copy("october");
  const sorted = readFileSync(join(moved, "receipt.json"), "utf8");
  const unsorted = sorted.replace('\n  "all_confirmed_gone": true,', "").replace(/\n}$/, ',\n  "all_confirmed_gone": true\n}');
  assert.notEqual(unsorted, sorted);
  writeFileSync(join(moved, "receipt.json"), unsorted);
  assert.equal(readCirrunReceipt(moved, { fingerprint: A }).usd, "0.216", "key order is not signed");
  // Quotes, a tab, a backslash, a newline, a control character, an emoji, and keys "￿" and "😀", which Python
  // sorts by code point and JavaScript's own sort the other way round.
  assert.equal(readCirrunReceipt(at("escapes"), { fingerprint: "21f3e2950be3db1be8d8822426597cb76db5ef7275463522968223f2fc98a03e" }).usd, "0.108");
  const cheaper = copy("zurich");
  writeFileSync(join(cheaper, "receipt.json"), readFileSync(join(cheaper, "receipt.json"), "utf8").replace('"wholesale_cost": 2.5', '"wholesale_cost": 0.5'));
  assert.throws(() => readCirrunReceipt(cheaper, { fingerprint: A }), /signature does not match/);
  assert.throws(() => readCirrunReceipt(at("other-key"), { fingerprint: A }), /not the key with that fingerprint/);
  assert.throws(() => readCirrunReceipt(at("other-key"), { publicKeyPem: readFileSync(at("signer-a.pem"), "utf8") }), /signature does not match/);
  assert.throws(() => readCirrunReceipt(dir, { fingerprint: A }), /has no receipt\.json/);
});

test("Cirrun runs are recorded once, at their cost in the book's currency, through the MCP server", async () => {
  const dir = mkdtempSync(join(tmpdir(), "canli-books-cirrun-"));
  const client = new Client({ name: "books-cirrun-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER] }));
  const call = async (name, args) => {
    const res = await client.callTool({ name, arguments: args });
    assert.ok(!res.isError, `${name}: ${JSON.stringify(res.content)}`);
    return res.structuredContent;
  };
  const refused = async (name, args) => {
    const res = await client.callTool({ name, arguments: args });
    assert.equal(res.isError, true, `${name} should refuse`);
    return res.content[0].text;
  };
  const open = async (name, currency) => {
    const file = join(dir, `${name}.jsonl`);
    await call("books_open", { file, name, currency });
    return file;
  };
  try {
    assert.ok((await client.listTools()).tools.some((t) => t.name === "books_record_cirrun"));
    const file = await open("Canli Capital", "AED");
    const both = [at("h100"), at("zurich")];

    // (0.734514 + 0.058761 + 2.5 + 0.000012) USD at the dirham's peg: 12.0945965075 AED.
    const size = statSync(file).size;
    const plan = await call("books_record_cirrun", { file, receipts: both, fingerprint: A });
    assert.equal(plan.posted, null);
    assert.deepEqual(plan.proposed.lines, [{ account: "6300", debit: "12.09" }, { account: "2000", credit: "12.09" }]);
    assert.equal(plan.proposed.date, "2026-11-06");
    assert.deepEqual(plan.totals, { runs: 2, usd: "3.293287", rate: "3.6725", amount: "12.09", currency: "AED" });
    assert.equal(statSync(file).size, size, "nothing is written unless post is true");

    const done = await call("books_record_cirrun", { file, receipts: both, public_key_file: at("signer-a.pem"), post: true });
    assert.deepEqual(done.posted.lines, [{ account: "6300", debit: "12.09" }, { account: "2000", credit: "12.09" }]);
    assert.match(done.posted.memo, /^Cirrun: 2 runs, 20261105-091512-a1b2c3 to 20261106-140300-d4e5f6, 3\.293287 USD at 3\.6725 AED per USD$/);
    assert.deepEqual(done.posted.source.cirrun.runs.map((r) => [r.run_id, r.usd]), [["20261105-091512-a1b2c3", "0.793275"], ["20261106-140300-d4e5f6", "2.500012"]]);
    assert.equal(done.posted.source.cirrun.key, A);
    assert.equal((await call("books_verify", { file })).ok, true, "the entry and its source are under the hash chain");

    const again = await call("books_record_cirrun", { file, receipts: [...both, at("october")], fingerprint: A, post: true });
    assert.deepEqual(again.already, ["20261105-091512-a1b2c3", "20261106-140300-d4e5f6"]);
    assert.deepEqual([again.posted.date, again.posted.lines[0].debit], ["2026-10-30", "0.79"], "only the run not yet recorded: 0.216 USD, 0.79326 AED");
    const twice = await call("books_record_cirrun", { file, receipts: both, fingerprint: A, post: true });
    assert.deepEqual([twice.posted, twice.reason], [null, "every run is already in the book"]);

    // A reversed entry no longer records its runs, so they can be recorded again (here to another account).
    await call("books_reverse", { file, seq: done.posted.seq });
    const redone = await call("books_record_cirrun", { file, receipts: both, fingerprint: A, account: "6200", post: true });
    assert.equal(redone.posted.lines[0].account, "6200");

    const sizeNow = statSync(file).size;
    const tampered = join(dir, "tampered");
    cpSync(at("zurich"), tampered, { recursive: true });
    writeFileSync(join(tampered, "receipt.json"), readFileSync(join(tampered, "receipt.json"), "utf8").replace('"fee": 1.2e-05', '"fee": 1.2e-06'));
    assert.match(await refused("books_record_cirrun", { file, receipts: [at("october"), tampered], fingerprint: A, post: true }), /signature does not match/);
    assert.match(await refused("books_record_cirrun", { file, receipts: [at("other-key")], fingerprint: A, post: true }), /not the key with that fingerprint/);
    assert.match(await refused("books_record_cirrun", { file, receipts: both, post: true }), /public_key_file or fingerprint/);
    assert.match(await refused("books_record_cirrun", { file, receipts: both, fingerprint: A, public_key_file: at("signer-a.pem") }), /public_key_file or fingerprint/);
    assert.match(await refused("books_record_cirrun", { file, receipts: both, fingerprint: A, pay_from: "2999", post: true }), /no account 2999/);
    assert.equal(statSync(file).size, sizeNow, "a refused record wrote nothing");

    const fresh = await open("Two months", "AED");
    assert.match(await refused("books_record_cirrun", { file: fresh, receipts: [at("october"), at("zurich")], fingerprint: A }), /finished in 2026-10 and 2026-11/);
    assert.equal((await call("books_record_cirrun", { file: fresh, receipts: [at("october"), at("zurich")], fingerprint: A, date: "2026-11-06" })).proposed.lines[0].debit, "9.97", "2.716012 USD at the peg");

    const usd = await open("Dollars", "USD");
    assert.equal((await call("books_record_cirrun", { file: usd, receipts: [at("h100")], fingerprint: A })).proposed.lines[0].debit, "0.79");
    assert.match(await refused("books_record_cirrun", { file: usd, receipts: [at("h100")], fingerprint: A, rate: "3.6725" }), /takes no rate/);
    const free = await call("books_record_cirrun", { file: usd, receipts: [at("sample")], public_key_file: at("sample/signer.pem"), post: true });
    assert.deepEqual([free.posted, free.reason], [null, "the runs cost 0 US dollars, which is 0.00 USD"]);

    const euros = await open("Euros", "EUR");
    assert.match(await refused("books_record_cirrun", { file: euros, receipts: both, fingerprint: A }), /Give the rate: EUR per US dollar/);
    assert.equal((await call("books_record_cirrun", { file: euros, receipts: both, fingerprint: A, rate: "0.8650" })).proposed.lines[0].debit, "2.85", "2.8486932550 EUR");
  } finally {
    await client.close();
  }
});
