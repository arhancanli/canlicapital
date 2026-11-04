// share_counts: a filing's share counts side by side, flagging only what cannot be ordinary: a count about a
// thousand times off the others (Apple's April 2014 10-Q), issued below outstanding, diluted below basic; treasury
// shares and a concept the company does not tag are ordinary.
import assert from "node:assert/strict";
import test from "node:test";

import { runShares } from "../src/shares.mjs";

const COLUMNS = ["end", "start", "val", "filed", "form", "accn"];
const fake = (by) => ({ call: async (_name, args) => { const rows = by[args.concept]; if (!rows) throw new Error(`X reports no concept named ${args.concept}.`); return { company: { name: "X" }, columns: COLUMNS, rows }; } });
const filing = (accn, filed, { cover, outstanding, issued, basic, diluted }) => ({
  "dei:EntityCommonStockSharesOutstanding": cover === undefined ? undefined : [["2014-04-11", null, cover, filed, "10-Q", accn]],
  CommonStockSharesOutstanding: outstanding === undefined ? undefined : [["2014-03-29", null, outstanding, filed, "10-Q", accn]],
  CommonStockSharesIssued: issued === undefined ? undefined : [["2014-03-29", null, issued, filed, "10-Q", accn]],
  WeightedAverageNumberOfSharesOutstandingBasic: basic === undefined ? undefined : [["2014-03-29", "2013-12-29", basic, filed, "10-Q", accn], ["2014-03-29", "2013-09-29", basic * 1.01, filed, "10-Q", accn]],
  WeightedAverageNumberOfDilutedSharesOutstanding: diluted === undefined ? undefined : [["2014-03-29", "2013-12-29", diluted, filed, "10-Q", accn]],
});
const merge = (...fs) => { const out = {}; for (const f of fs) for (const [k, v] of Object.entries(f)) if (v) out[k] = [...(out[k] ?? []), ...v]; return out; };

test("only what cannot be ordinary is flagged, and the count that slipped is the one named", async () => {
  const out = await runShares(fake(merge(
    filing("A", "2014-04-24", { cover: 861381000, outstanding: 861745, issued: 861745, basic: 874757000, diluted: 879528000 }),
    filing("B", "2014-07-23", { cover: 5.9e9, outstanding: 2.7e9, issued: 4.1e9, basic: 2.75e9, diluted: 2.76e9 }),
    filing("C", "2014-10-27", { outstanding: 1e9, issued: 0.9e9, basic: 1e9, diluted: 0.98e9 }),
  )), { company: "X" });
  const flags = Object.fromEntries(out.rows.map((r) => [r[2], r[9]]));
  assert.deepEqual(flags.A, ["outstanding is about a thousandth of the filing's other counts: a scale slip", "issued is about a thousandth of the filing's other counts: a scale slip"]);
  assert.equal(flags.B, null, "treasury shares and a cover page counting every class are ordinary");
  assert.deepEqual(flags.C, ["fewer shares issued than outstanding", "the diluted average is below the basic one"]);
  assert.equal(out.flagged, 2);
  assert.deepEqual(out.rows.map((r) => r[2]), ["C", "B", "A"], "newest first");
  assert.equal(out.rows[2][7], 874757000, "the quarter's average, not the year to date");
});

test("a count the company does not tag leaves the others; none at all is an error", async () => {
  const out = await runShares(fake(filing("A", "2014-04-24", { outstanding: 1e9, basic: 1e9, diluted: 1.01e9 })), { company: "X" });
  assert.deepEqual(out.rows[0].slice(4, 9), [null, 1e9, null, 1e9, 1.01e9]);
  await assert.rejects(runShares(fake({}), { company: "X" }), /tags none of these share counts/);
});
