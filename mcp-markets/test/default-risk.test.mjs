// default_risk: a 10-K's own figures read (its fiscal year, flows over a year, last year's income as it restated it,
// amendments ignored), the ratios and the two published benchmarks worked by hand, the fitter recovering known weights,
// the model card equal to the validation it came from, and the tool on replayed SEC documents: a distressed company
// ranks riskier than a sound one, as_of reads the report of the time, a bank is told the ratios mean something else.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { defaultRisk, fit, model, ohlsonO, ratios, reportsOf, zDoublePrime } from "../src/default-risk.mjs";
import { createSession } from "../src/sources.mjs";

const at = (val, end, accn, filed, start, form = "10-K") => ({ val, end, accn, filed, form, ...(start ? { start } : {}) });
// Two years of a small company's 10-Ks, an amendment, and a 10-Q that must not be read as a report.
function facts({ assets = 1000, liabilities = 500, ni = 80, niPrior = 60, re = 300, ca = 400, cl = 200, cfo = 90, ebit = 120, revenue = 1000 } = {}) {
  const k1 = "0000000001-24-000001", k2 = "0000000001-25-000001", ka = "0000000001-25-000009", q = "0000000001-25-000005";
  const usd = (list) => ({ units: { USD: list } });
  return { cik: 1234, entityName: "Test Co", facts: { "us-gaap": {
    Assets: usd([at(900, "2023-12-31", k1, "2024-02-20"), at(assets, "2024-12-31", k2, "2025-02-20"), at(950, "2023-12-31", k2, "2025-02-20"), at(1, "2024-12-31", ka, "2025-06-01", null, "10-K/A"), at(5, "2025-03-31", q, "2025-05-01", null, "10-Q")]),
    LiabilitiesAndStockholdersEquity: usd([at(assets, "2024-12-31", k2, "2025-02-20")]),
    StockholdersEquity: usd([at(assets - liabilities, "2024-12-31", k2, "2025-02-20")]),
    AssetsCurrent: usd([at(ca, "2024-12-31", k2, "2025-02-20")]), LiabilitiesCurrent: usd([at(cl, "2024-12-31", k2, "2025-02-20")]),
    RetainedEarningsAccumulatedDeficit: usd([at(re, "2024-12-31", k2, "2025-02-20")]),
    // A quarter's income in the same report is not the year's.
    NetIncomeLoss: usd([at(ni, "2024-12-31", k2, "2025-02-20", "2024-01-01"), at(7, "2024-12-31", k2, "2025-02-20", "2024-10-01"), at(niPrior, "2023-12-31", k2, "2025-02-20", "2023-01-01"), at(50, "2023-12-31", k1, "2024-02-20", "2023-01-01")]),
    OperatingIncomeLoss: usd([at(ebit, "2024-12-31", k2, "2025-02-20", "2024-01-01")]),
    NetCashProvidedByUsedInOperatingActivities: usd([at(cfo, "2024-12-31", k2, "2025-02-20", "2024-01-01")]),
    RevenueFromContractWithCustomerExcludingAssessedTax: usd([at(revenue, "2024-12-31", k2, "2025-02-20", "2024-01-01")]),
  } } };
}

test("a 10-K's own figures: its year, flows over the year, last year's income as restated, amendments and 10-Qs ignored", () => {
  const reps = reportsOf(facts());
  assert.deepEqual(reps.map((r) => [r.accn, r.filed, r.fy_end]), [["0000000001-24-000001", "2024-02-20", "2023-12-31"], ["0000000001-25-000001", "2025-02-20", "2024-12-31"]]);
  const r = reps[1];
  assert.deepEqual([r.total_assets, r.total_liabilities, r.equity, r.net_income, r.net_income_prior, r.revenue, r.tags.revenue], [1000, null, 500, 80, 60, 1000, "RevenueFromContractWithCustomerExcludingAssessedTax"]);
  assert.equal(reps[0].net_income, 50);
});

test("ratios and the published benchmarks, worked by hand", () => {
  const q = ratios(reportsOf(facts())[1]);
  // Liabilities as liabilities-and-equity less equity: 500; WC/TA 0.2, RE/TA 0.3, EBIT/TA 0.12, BV/TL 1.
  assert.deepEqual([q.tl_ta, q.wc_ta, q.re_ta, q.ebit_ta, q.bv_tl, q.chin, q.two_losses, q.neg_equity], [0.5, 0.2, 0.3, 0.12, 1, 20 / 140, 0, 0]);
  // Z'' = 6.56(0.2) + 3.26(0.3) + 6.72(0.12) + 1.05(1) = 1.312 + 0.978 + 0.8064 + 1.05 = 4.1464, signed riskier-is-higher.
  assert.ok(Math.abs(zDoublePrime(q) + 4.1464) < 1e-9);
  const o = -1.32 - 0.407 * Math.log(1000 / 1e6) + 6.03 * 0.5 - 1.43 * 0.2 + 0.0757 * 0.5 - 2.37 * 0.08 - 1.83 * 0.18 - 0.521 * (20 / 140);
  assert.ok(Math.abs(ohlsonO(q) - o) < 1e-9);
  assert.equal(zDoublePrime({ ...q, re_ta: null }), null);
});

test("the fitter recovers known weights", () => {
  let s = 3; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  const X = [], y = [];
  for (let i = 0; i < 4000; i += 1) { const a = r(), b = r(); X.push([a, b]); y.push(r() + 0.5 < 1 / (1 + Math.exp(-(-1 + 3 * a - 2 * b))) ? 1 : 0); }
  const w = fit(X, y, 1e-4);
  assert.ok(Math.abs(w[0] + 1) < 0.15 && Math.abs(w[1] - 3) < 0.4 && Math.abs(w[2] + 2) < 0.4, String(w));
});

test("the model card is the validation it came from", () => {
  const m = model(), v = JSON.parse(readFileSync(new URL("../../config/research/default-risk-v1/validation.json", import.meta.url), "utf8"));
  for (const k of ["all_reports", "assets_at_least_10m"]) {
    assert.equal(m.validation[k].auc, v[k].auc.model);
    assert.deepEqual(m.validation[k].against_benchmarks.gain_over, v[k].on_reports_every_benchmark_can_score.gain_over);
  }
  assert.equal(m.weights.length, 1 + m.design.features.length + m.design.flags.length);
  assert.equal(m.reference.cutpoints.length, 99);
});

test("the tool on replayed documents: distress ranks riskier, as_of reads the old report, a bank is cautioned", async () => {
  const run = async (doc, sic, args) => {
    const fetchImpl = async (url) => new Response(JSON.stringify(String(url).includes("companyfacts") ? doc : { sic: String(sic), sicDescription: sic === 6022 ? "State commercial banks" : "Retail" }));
    return defaultRisk(createSession({ fetchImpl, env: {}, sleep: async () => {} }), { company: "1234", ...args });
  };
  const sound = await run(facts(), 5331);
  const weak = await run(facts({ liabilities: 1300, ni: -300, niPrior: -200, re: -900, ca: 100, cl: 400, cfo: -150, ebit: -250, revenue: 300 }), 5331);
  assert.ok(weak.chance_of_bankruptcy_filing_within_a_year > 5 * sound.chance_of_bankruptcy_filing_within_a_year, `${weak.chance_of_bankruptcy_filing_within_a_year} vs ${sound.chance_of_bankruptcy_filing_within_a_year}`);
  assert.ok(weak.riskier_than.share > sound.riskier_than.share && weak.riskier_than.share <= 0.99);
  assert.equal(weak.report.accession, "0000000001-25-000001");
  assert.match(weak.reading, /chance of reporting a bankruptcy within a year/);
  assert.ok(weak.cross_checks.ohlson_o.score > sound.cross_checks.ohlson_o.score);
  assert.ok(weak.limits.some((l) => /both benchmarks ranked .*Ohlson's O \(AUC 0\.83\) and Altman's Z'' \(0\.82\) against 0\.81/.test(l)));
  const then = await run(facts(), 5331, { as_of: "2025-01-01" });
  assert.equal(then.report.filed, "2024-02-20");
  assert.match((await run(facts(), 6022)).reading, /State commercial banks: the ratios mean something else/);
  await assert.rejects(run(facts(), 5331, { as_of: "2024-01-01" }), /no original 10-K/);
});
