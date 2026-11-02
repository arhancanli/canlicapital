import assert from "node:assert/strict";
import test from "node:test";

import { createTimeMachine, parseAsOf } from "../src/timemachine.mjs";

const D = "2020-03-01", tm = createTimeMachine(D);

test("a date must be a real past date", () => {
  assert.throws(() => parseAsOf("March 2020"), /YYYY-MM-DD/);
  assert.throws(() => parseAsOf("2999-01-01"), /future/);
  assert.equal(parseAsOf(D), D);
});

test("arguments are held to the date, however they are asked for", () => {
  assert.equal(tm.admit("known_as_of", "fundamentals", { company: "AAPL", as_of: "2024-01-01" }).as_of, D, "a later date is pulled back");
  assert.equal(tm.admit("known_as_of", "fundamentals", { company: "AAPL", as_of: "2019-01-01" }).as_of, "2019-01-01", "an earlier one stands");
  assert.deepEqual(tm.admit("history", "fundamentals", { company: "AAPL", basis: "latest" }).basis, "as_of", "latest values would hold later restatements");
  assert.equal(tm.admit("read_filing", "markets", { company: "AAPL" }).filed_before, D);
  const p = tm.admit("price_history", "markets", { symbol: "AAPL", end: "2026-01-01" });
  assert.equal(p.end, D);
  assert.equal(p.start, "2019-03-02", "the default start comes from the date, not from today");
  assert.equal(tm.admit("search_filings", "markets", { query: "tariffs" }).until, D);
  assert.equal(tm.admit("insider_trades", "markets", { company: "AAPL", until: "2025-01-01", since: "2019-01-01" }).until, D);
  assert.equal(tm.admit("treasury_yields", "markets", { date: "2024-05-01" }).date, D);
  const n = tm.admit("news", "markets", { company: "AAPL", days: 7 });
  assert.equal(n.end, D);
  assert.equal(n.days, undefined, "days counts back from today");
  assert.equal(tm.admit("filing_memory", "markets", { company: "AAPL", query: "x", correlate_with: "gross_margin" }).correlate_with, undefined, "margins come from later filings");
});

test("a tool that cannot be held to the date is off, and says why", () => {
  for (const [name, pack] of [["company_report", "markets"], ["verify_claims", "markets"], ["market_overview", "markets"], ["latest_filings", "markets"], ["options_chain", "markets"], ["send_paper_orders", "paper"], ["screen_companies", "markets"]]) {
    assert.throws(() => tm.admit(name, pack, {}), /cannot be held to 2020-03-01/, name);
  }
  assert.equal(tm.selfAllowed("brief"), false);
  assert.equal(tm.selfAllowed("sentinel_add"), false);
  assert.equal(tm.selfAllowed("find_tool"), true);
});

test("tools that only work on what they are given stay on, and pass untouched", () => {
  const args = { returns: [0.01, -0.02] };
  assert.equal(tm.admit("return_stats", "quant", args), args);
  assert.equal(tm.admit("validate_deflated_sharpe", "validation", args), args);
  assert.equal(tm.admit("league_commit", "backtest", args), args);
  const out = { when: "2026-01-01" };
  assert.equal(tm.seal("return_stats", out), out);
});

test("a later row is dropped, and counted", () => {
  const r = tm.seal("list_filings", { columns: ["filed", "form"], rows: [["2019-10-30", "10-K"], ["2021-10-29", "10-K"]] });
  assert.deepEqual(r.rows, [["2019-10-30", "10-K"]]);
  assert.equal(r.time_machine.later_rows_hidden, 1);
  assert.equal(r.time_machine.as_of, D);
});

test("any other later date stops the answer: it fails closed", () => {
  assert.throws(() => tm.seal("read_filing", { filing: { filed: "2021-10-29" }, text: "x" }), /dated after 2020-03-01 \(filing\.filed is 2021-10-29\)/);
  assert.throws(() => tm.seal("price_history", { dates: ["2020-02-28", "2020-03-02"], close: [1, 2] }), /dates\[1\]/);
});

test("where a figure came from is not a claim about the date, and today's date does not leak", () => {
  const r = tm.seal("read_filing", { filing: { filed: "2019-10-30" }, text: "Notes due 2030-01-01", limits: ["seen 2026-11-02"], evidence: { rows: [["u", "h", "2026-11-02T00:00:00Z"]] } });
  assert.equal(r.evidence, undefined);
  assert.equal(r.text, "Notes due 2030-01-01");
});

test("warnings travel with what they warn about", () => {
  assert.match(tm.seal("economic_series", { dates: ["2020-01-01"] }).time_machine.warning, /revised/);
  assert.match(tm.seal("price_history", { dates: ["2020-01-02"] }).time_machine.warning, /splits/);
});

test("what a model is told names the date and the limit of the lock", () => {
  assert.match(tm.instructions, /running as of 2020-03-01/);
  assert.match(tm.instructions, /training may include later events/);
});
