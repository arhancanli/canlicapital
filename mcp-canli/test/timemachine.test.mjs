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

test("tools with their own date rules are held to them: years for world_economy", () => {
  assert.deepEqual([tm.admit("world_economy", "markets", { countries: ["US"], indicator: "gdp", end: 2024 }).end, tm.admit("world_economy", "markets", { countries: ["US"], indicator: "gdp" }).start], [2020, 2010]);
});

test("provenance fields do not say what today is", () => {
  const r = tm.seal("known_as_of", { snapshot: { fetched_at: "2026-09-19T00:00:00Z" }, company: { name: "x" } });
  assert.equal(r.snapshot, undefined);
  assert.equal(tm.seal("find_company", { tickers_as_of: "2026-09-19", rows: [] }).tickers_as_of, "2026-09-19", "the date of a name list is not a claim about the market");
});

test("a tool that cannot be held to the date is off, and says why", () => {
  for (const [name, pack] of [["company_profile", "markets"], ["company_report", "markets"], ["verify_claims", "markets"], ["market_overview", "markets"], ["latest_filings", "markets"], ["options_chain", "markets"], ["send_paper_orders", "paper"], ["screen_companies", "markets"]]) {
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

// ---------------------------------------------------------------------------------------------
test("signed trial count: different arguments count once each, others are not counted, a tampered log shows", async () => {
  const { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createAudit, publicKeys, signingKeys } = await import("../src/governance.mjs");
  const { signedTrialCount } = await import("../src/trials.mjs");
  const home = mkdtempSync(join(tmpdir(), "trials-")), dir = join(home, "audit");
  assert.equal(signedTrialCount({}, { dir }).log_on, false);
  const audit = createAudit({ dir, keys: signingKeys(join(home, "audit-keys")) });
  for (const args of [{ a: 1 }, { a: 2 }, { a: 2 }, { a: 3 }]) audit.record({ tool: "backtest_momentum", pack: "quant", args, result: { sharpe: 1 } });
  audit.record({ tool: "cpcv", pack: "backtest", args: { a: 1 }, result: {} });
  audit.record({ tool: "price_history", pack: "markets", args: { symbol: "AAPL" }, result: {} });
  audit.record({ tool: "backtest_momentum", pack: "quant", args: { a: 9 }, error: "bad" });
  audit.close();
  const keys = publicKeys(home);
  const r = signedTrialCount({}, { dir, keys });
  assert.equal(r.trials, 4, "three different momentum runs and one cpcv; the repeat, the price read and the failure do not count");
  assert.equal(r.calls, 6);
  assert.equal(r.failed_calls, 1);
  assert.equal(r.log_checks_out, true);
  assert.deepEqual(r.rows[0], ["backtest_momentum", 3]);
  assert.match(r.next, /Pass 4 as the number of trials/);
  assert.equal(signedTrialCount({ since: "2999-01-01" }, { dir, keys }).trials, 0);
  // Removing a run from the log to lower the count breaks the chain.
  const file = join(dir, readdirSync(dir)[0]);
  writeFileSync(file, readFileSync(file, "utf8").split("\n").filter((l) => !l.includes('"tool":"cpcv"')).join("\n"));
  assert.equal(signedTrialCount({}, { dir, keys }).log_checks_out, false);
  rmSync(home, { recursive: true, force: true });
});

test("my_week: moves, filings and next report in plain words, and a broken source costs only its part", async () => {
  const { runWeek } = await import("../src/week.mjs");
  const NOW = Date.parse("2026-11-02T12:00:00Z");
  const ctx = { call: async (name, args) => {
    if (args.symbol === "BROKEN" || args.company === "BROKEN") throw new Error("down");
    if (name === "price_history") return { dates: ["2026-10-20", "2026-10-26", "2026-10-30", "2026-11-02"], close: [100, 100, 95, 90] };
    if (name === "company_events") return { columns: ["filed", "company", "items", "events"], rows: [["2026-10-30", "NVIDIA CORP", ["2.02"], ["earnings"]], ["2026-10-29", "NVIDIA CORP", ["8.01"], ["other_event", "new_thing"]]] };
    if (name === "earnings_calendar") return { next: { expected: "2026-11-19", status: "upcoming" } };
    throw new Error(name);
  } };
  const r = await runWeek(ctx, { holdings: ["nvda", "BROKEN"] }, { now: NOW });
  assert.equal(r.summary[0], "NVDA: down 10%; told the SEC about its results, other news, new thing; expected to report around 2026-11-19.");
  assert.equal(r.summary[1], "BROKEN: no price to hand.");
  assert.deepEqual(r.biggest_move, { symbol: "NVDA", change_percent: -10 });
  assert.match(r.limits[0], /no view on what to do/);
});

