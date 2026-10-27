// shareholder_returns: the split adjustment and dividend record, and Apple's years from replayed XBRL.
import assert from "node:assert/strict";
import test from "node:test";

import { raisedYears, shareholderReturns, splitAdjusted } from "../src/payouts.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

test("a split is a step in the share count with the dividend per share falling by about as much, not a cut", () => {
  const dps = new Map([["2018", 2.72], ["2019", 3.0], ["2020", 0.795], ["2021", 0.85]]);
  const shares = new Map([["2018", 5.0e9], ["2019", 4.7e9], ["2020", 17.5e9], ["2021", 16.9e9]]);
  const adj = splitAdjusted(dps, shares);
  assert.deepEqual(adj.splits, [{ fiscal_year_end: "2020", factor: 4 }]);
  assert.deepEqual([...adj.values.values()], [0.68, 0.75, 0.795, 0.85]);
  assert.equal(raisedYears(adj.values), 3);
  // A real cut, with no change in shares, stays a cut.
  const cut = splitAdjusted(new Map([["2019", 2.0], ["2020", 1.0]]), new Map([["2019", 1e9], ["2020", 1e9]]));
  assert.deepEqual(cut.splits, []);
  assert.equal(raisedYears(cut.values), 0);
  assert.equal(raisedYears(new Map([["a", 1], ["b", 1], ["c", 2]])), 1, "a flat year ends the run");
});

test("Apple: dividends, buybacks and the share count by fiscal year, each figure with its tag", async () => {
  const s = createSession({ fetchImpl: replayFetch().fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
  const r = await shareholderReturns(s, { company: "AAPL", years: 4, price: false });
  assert.equal(r.company.cik, 320193);
  assert.equal(r.rows.length, 4);
  assert.ok(r.rows.every((row, i) => i === 0 || row[0] < r.rows[i - 1][0]), "newest first");
  const [end, dps, div, back, , payout, , shares] = r.rows[0];
  assert.match(end, /^\d{4}-09-\d\d$/);
  assert.ok(dps > 0.9 && dps < 1.2 && div > 1.4e10 && back > 7e10 && shares > 1.4e10, JSON.stringify(r.rows[0]));
  assert.ok(payout > 0.1 && payout < 0.25);
  assert.equal(r.tags.buybacks, "PaymentsForRepurchaseOfCommonStock");
  assert.ok(r.dividends.raised_years_in_a_row >= 10, JSON.stringify(r.dividends));
  assert.deepEqual(r.dividends.splits_adjusted?.map((x) => x.factor), [4]);
  assert.equal(r.yields, undefined);
  await assert.rejects(shareholderReturns(s, { company: "AAPL", years: 1 }), /years/);
});
