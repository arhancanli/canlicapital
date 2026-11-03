// The Canli Books MCP server end to end over stdio: a book opened, posted to, reconciled, checked and locked
// through tools; each Canli company's tool run on it; its head signed and checked; and a book file edited by
// hand refused before anything more is written to it.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const SERVER = fileURLToPath(new URL("../src/server.mjs", import.meta.url));

test("every Canli company's tools work on one book through the MCP server", async () => {
  const dir = mkdtempSync(join(tmpdir(), "canli-books-"));
  const file = join(dir, "example.jsonl");
  const client = new Client({ name: "books-test", version: "0" });
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
  try {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    for (const name of ["books_post", "close_reconcile", "close_consolidate", "report_check", "audit_journal", "planning_runway", "data_pack", "data_pack_sec_first_filed", "books_sign"]) assert.ok(tools.includes(name), name);

    await call("books_open", { file, name: "Example Trading LLC", currency: "AED" });
    assert.match(await refused("books_open", { file, name: "Again", currency: "AED" }), /never overwrites/);
    assert.match(await refused("books_open", { file: join(dir, "notes.txt"), name: "Notes", currency: "AED" }), /must end in \.jsonl/);
    await call("books_post", { file, date: "2026-01-02", memo: "Share capital paid in", lines: [{ account: "1000", debit: "50000" }, { account: "3000", credit: "50000" }] });
    await call("books_post", { file, date: "2026-01-10", memo: "Invoice 1", lines: [{ account: "1100", debit: "1050" }, { account: "4000", credit: "1000" }, { account: "2100", credit: "50" }] });
    const rent = await call("books_post", { file, date: "2026-01-15", memo: "January rent", lines: [{ account: "6100", debit: "3000" }, { account: "1000", credit: "3000" }] });
    assert.equal(rent.posted.lines[0].debit, "3000.00");
    assert.match(await refused("books_post", { file, date: "2026-01-16", lines: [{ account: "6100", debit: "10" }, { account: "1000", credit: "9" }] }), /differ by 1\.00/);

    const st = await call("books_statements", { file, from: "2026-01-01", to: "2026-01-31" });
    assert.deepEqual([st.income_statement.netIncome, st.balance_sheet.totalAssets, st.balance_sheet.balanced], ["-2000.00", "48050.00", true]);
    assert.equal((await call("books_explain", { file, account: "1000" })).closing, "47000.00");

    const statement = join(dir, "bank.csv");
    writeFileSync(statement, "date,description,amount\n2026-01-02,Capital,50000\n2026-01-17,Landlord,-3000\n2026-01-31,Bank fee,-25\n");
    const rec = await call("close_reconcile", { file, statement_file: statement });
    assert.deepEqual([rec.matched.length, rec.unmatchedStatement.length, rec.difference], [2, 1, "-25.00"]);
    const rules = [{ contains: "fee", account: "6500", direction: "out" }];
    const proposed = await call("close_bank_entries", { file, statement_file: statement, rules });
    assert.deepEqual([proposed.entries[0].lines, proposed.posted], [[{ account: "6500", debit: "25.00" }, { account: "1000", credit: "25.00" }], []], "nothing is written without post: true");
    assert.deepEqual((await call("close_bank_entries", { file, statement_file: statement, rules, post: true })).posted, [28]);
    assert.deepEqual((await call("close_bank_entries", { file, statement_file: statement, rules, post: true })).posted, [], "the same statement again posts nothing");
    assert.equal((await call("close_checklist", { file, through: "2026-01-31", statement_file: statement })).readyToLock, true);

    // A German subsidiary in euros, consolidated into dirhams: the ECB has no AED, so it is pegged to the dollar.
    const sub = join(dir, "sub.jsonl");
    await call("books_open", { file: sub, name: "Example GmbH", currency: "EUR" });
    await call("books_post", { file: sub, date: "2026-01-02", memo: "Share capital paid in", lines: [{ account: "1000", debit: "10000" }, { account: "3000", credit: "10000" }] });
    const ecb = join(dir, "eurofxref-hist.xml");
    writeFileSync(ecb, "<Cube><Cube time='2026-01-02'><Cube currency='USD' rate='1.10'/></Cube><Cube time='2026-01-30'><Cube currency='USD' rate='1.20'/></Cube></Cube>");
    const group = await call("close_consolidate", { companies: [{ name: "Example Trading LLC", file }, { name: "Example GmbH", file: sub }], currency: "AED", as_of: "2026-01-31", rates_file: ecb, pegs: { AED: { base: "USD", rate: "3.6725" } } });
    assert.deepEqual([group.companies[1].closingRate.perEuro.AED, group.balanceSheet.translationReserve, group.balanceSheet.balanced], ["4.407", "3672.50", true], "EUR 10,000 in at 4.03975 and held at 4.407");

    const report = await call("report_check", { file, as_of: "2026-01-31", from: "2026-01-01", to: "2026-01-31" });
    assert.deepEqual([report.ok, report.unmapped.length], [true, 0]);
    // The same checks on a company's SEC filings, from the companyfacts JSON: last year's shares filed in thousands.
    const companyfacts = join(dir, "CIK0001234567.json");
    const shares = (accn, filed, val) => ({ end: "2024-12-31", val, accn, fy: Number(filed.slice(0, 4)), fp: "FY", form: "10-K", filed });
    writeFileSync(companyfacts, JSON.stringify({ cik: 1234567, entityName: "Example Holdings Inc.", facts: { "us-gaap": { CommonStockSharesAuthorized: { units: { shares: [shares("A1", "2025-02-14", 1800000000), shares("A2", "2026-02-13", 1800000)] } } } } }));
    const sec = await call("report_check_sec", { companyfacts_file: companyfacts });
    assert.deepEqual([sec.checked, sec.withFindings, sec.counts], [2, 1, { scale: 1 }]);
    // The same file packed as first filed: one period, filed twice with two values, the input named by its SHA-256.
    const firstPack = await call("data_pack_sec_first_filed", { companyfacts_files: [companyfacts], out_dir: join(dir, "first-filed"), name: "sec-first-filed", license: "cc-by-4.0" });
    assert.deepEqual([firstPack.rows, firstPack.changed, firstPack.companies], [1, 1, 1]);
    assert.match(readFileSync(join(dir, "first-filed", "README.md"), "utf8"), /1 of 1 changed[\s\S]*Example Holdings Inc\. \(CIK 1234567\): companyfacts saved \d{4}-\d{2}-\d{2}, SHA-256 [0-9a-f]{64}/);
    assert.deepEqual((await call("audit_journal", { file, limit: "5000" })).weekend, [26, 28], "10 and 31 January 2026 were Saturdays");
    assert.equal((await call("planning_runway", { file, through: "2026-01-31", months: 1 })).burning, false);
    assert.ok(Math.abs((await call("planning_dcf", { cash_flows: [100, 100, 100], rate: 0.1 })).value - 1000) < 1e-9);
    const budget = await call("planning_budget", { file, budget: { 6100: "3000" }, from: "2026-01-01", to: "2026-01-31" });
    assert.equal(budget.rows[0].variance, "0.00");

    const pack = await call("data_pack", { out_dir: join(dir, "pack"), name: "example-pack", source: "a test", license: "cc0-1.0", columns: [{ name: "a" }], rows: [{ a: 1 }] });
    assert.ok(existsSync(join(dir, "pack", "README.md")) && pack.sha256.length === 64);

    const keys = { private_key_file: join(dir, "books.key.pem"), public_key_file: join(dir, "books.pub.pem") };
    await call("books_new_keys", keys);
    await call("books_sign", { file, private_key_file: keys.private_key_file });
    assert.equal((await call("books_check_signature", { file, public_key_file: keys.public_key_file })).ok, true);

    // One entry shown to a lender without the book: a proof against the signed root, checked with the public key.
    const proved = await call("books_prove", { file, seqs: [rent.posted.seq] });
    assert.deepEqual([proved.readable[0].lines[0].debit, proved.opening.record.currency], ["3000.00", "AED"]);
    const check = (proofs) => call("books_check_proof", { proofs, signature_file: `${file}.sig.json`, public_key_file: keys.public_key_file });
    const checkedProof = await check(proved);
    assert.deepEqual([checkedProof.ok, checkedProof.book], [true, { name: "Example Trading LLC", currency: "AED" }]);
    const forged = structuredClone(proved);
    forged.proofs[0].record.lines[0].debit = 30000;
    assert.equal((await check(forged)).ok, false, "a changed amount fails");

    await call("books_lock", { file, through: "2026-01-31" });
    const afterLock = await call("books_prove", { file, seqs: [rent.posted.seq] });
    assert.deepEqual([afterLock.size, (await check(afterLock)).ok], [proved.size, true], "proofs stay with the records the signature covers");
    assert.match(await refused("books_post", { file, date: "2026-01-20", lines: [{ account: "6100", debit: "10" }, { account: "1000", credit: "10" }] }), /locked through 2026-01-31/);

    const lines = readFileSync(file, "utf8");
    writeFileSync(file, lines.replace(/"debit":300000/, '"debit":30000').replace(/"credit":300000/, '"credit":30000'));
    const checked = await call("books_verify", { file });
    assert.equal(checked.ok, false);
    const before = readFileSync(file, "utf8");
    assert.match(await refused("books_post", { file, date: "2026-02-02", lines: [{ account: "6100", debit: "10" }, { account: "1000", credit: "10" }] }), /does not verify.*Nothing was written/);
    assert.equal(readFileSync(file, "utf8"), before, "nothing was appended to a book that does not verify");
  } finally {
    await client.close();
  }
});
