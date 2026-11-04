// receipt_check: a receipt's documents and those of the receipts it was built from, once each, read again by the
// markets pack's source_check; a receipt that names no documents says nothing can have changed under it.
import assert from "node:assert/strict";
import test from "node:test";

import { documentsOf, runReceiptCheck } from "../src/receipt-check.mjs";

const doc = (url, extra = {}) => ({ url, sha256_16: "0123456789abcdef", retrieved_at: "2026-11-04T06:00:00.000Z", ...extra });

test("a receipt's documents and its parents', once each", () => {
  const receipt = { input_sha256: "a".repeat(64), output_sha256: "b".repeat(64), at: "2026-11-04T08:00:00.000Z", sources: [doc("https://www.sec.gov/a.htm")], from: [{ ref: "r1", sources: [doc("https://www.sec.gov/a.htm"), doc("https://canlicapital.com/company-data/sources/x.json.gz", { sha256: "c".repeat(64), sha256_16: undefined })], from: [{ ref: "r0", input_sha256: "d".repeat(64) }] }] };
  assert.deepEqual(documentsOf(receipt).map((d) => d.url), ["https://www.sec.gov/a.htm", "https://canlicapital.com/company-data/sources/x.json.gz"]);
  assert.equal(documentsOf(receipt)[1].sha256, "c".repeat(64));
});

test("the documents go to source_check; none means nothing can have changed", async () => {
  const calls = [];
  const ctx = { call: async (name, args) => { calls.push([name, args]); return { same: 1, changed: 0, not_checked: 0, rows: [] }; } };
  const out = await runReceiptCheck(ctx, { receipt: { output_sha256: "b".repeat(64), sources: [doc("https://www.sec.gov/a.htm")] } });
  assert.deepEqual(calls, [["source_check", { sources: [doc("https://www.sec.gov/a.htm")] }]]);
  assert.equal(out.same, 1);
  assert.equal(out.answer.output_sha256, "b".repeat(64));
  const none = await runReceiptCheck(ctx, { receipt: { sources: [] } });
  assert.match(none.reading, /names no documents/);
  assert.equal(calls.length, 1);
});
