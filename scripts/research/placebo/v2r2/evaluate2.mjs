// Placebo study v2, round 2: applies the registered decision rules (config/research/placebo-v2r2-prereg.json,
// decision_rules D1-D9) to the round-2 result files, next to round 1's.
//   node evaluate2.mjs <prereg1> <evaluation1> <sim1> <prereg2> <calib> <power> <real> > evaluation.json
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { holm } from "../v2/evaluate.mjs";

const round = (x) => (x === null || x === undefined ? null : Number(x.toFixed(6)));

/** The size bar for a cell of n tests (bars.size_max_rule). */
export const sizeBar = (n) => Number((0.05 + 2.2 * Math.sqrt((0.05 * 0.95) / n)).toFixed(3));

/** Placebos as good as the real result that still give p <= alpha with K placebos. */
const maxAsGood = (alpha, K) => Math.floor(alpha * (K + 1) + 1e-9) - 1;
const placeboRate = (counts, K, alpha, tests) => counts.slice(0, maxAsGood(alpha, K) + 1).reduce((a, x) => a + x, 0) / tests;

const PIPE = { tsfm: "ts_momentum", csfm: "cs_momentum", vmf: "vol_managed", indmom: "cs_momentum", osap_tsfm: "ts_momentum", osap_csfm: "cs_momentum" };

/** Every method's rejection rate in one summarized cell. */
function rates(cell, K, B, alpha) {
  const out = { permute: placeboRate(cell.perm_rank_counts, K, alpha, cell.tests) };
  B.forEach((b, i) => { out[`block${b}`] = placeboRate(cell.block_rank_counts[i], K, alpha, cell.tests); });
  for (const [bm, r] of Object.entries(cell.boot)) {
    out[`rc_${bm}`] = r.rc_rejections / cell.tests;
    out[`spa_${bm}`] = r.spa_rejections / cell.tests;
    out[`stepm_${bm}`] = r.stepm_rejections / cell.tests;
  }
  out.naive = cell.naive_rejections === null ? null : cell.naive_rejections / cell.tests;
  out.bonferroni = cell.bonferroni_rejections === null ? null : cell.bonferroni_rejections / cell.tests;
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, round(v)]));
}

export function evaluate2(pre1, ev1, sim1, pre2, calib, power, real) {
  const alpha = pre2.bars.alpha;
  const B = pre2.block.lengths;
  const deviations = [];

  // ---- calibration (D1, D2, D3, D5) ----
  const cells = calib.cells.map((c) => ({
    claim: c.claim, family: c.family, tests: c.tests, bar: sizeBar(c.tests),
    role: pre2.calibration.roles[c.claim][c.family],
    rates: rates(c, calib.placebos, B, alpha),
  }));
  const D1 = cells.filter((c) => c.role === "exchangeable").flatMap((c) => B.filter((b) => c.rates[`block${b}`] > c.bar).map((b) => ({ claim: c.claim, family: c.family, block: b, rate: c.rates[`block${b}`] })));
  const D2 = calib.cells.filter((c) => sim1.cells.some((s) => s.claim === c.claim && s.family === c.family)).map((c) => {
    const s = sim1.cells.find((x) => x.claim === c.claim && x.family === c.family);
    return { claim: c.claim, family: c.family, identical: JSON.stringify(s.rank_counts) === JSON.stringify(c.perm_rank_counts) };
  });
  const D3 = {};
  for (const claim of pre2.calibration.claims) {
    D3[claim] = {};
    for (const b of B) {
      const cf = cells.filter((c) => c.claim === claim && c.role === "claim_false");
      D3[claim][b] = { keeps_size: cf.every((c) => c.rates[`block${b}`] <= c.bar), cells: Object.fromEntries(cf.map((c) => [c.family, c.rates[`block${b}`]])) };
    }
  }
  const D5 = cells.filter((c) => c.role === "exchangeable" || c.role === "claim_false").map((c) => ({
    claim: c.claim, family: c.family, role: c.role,
    keeps_size: Object.fromEntries(Object.entries(c.rates).filter(([, v]) => v !== null).map(([m, v]) => [m, v <= c.bar])),
  }));

  // ---- power (D6, D7) ----
  const pcells = power.cells.map((c) => (c.unreachable ? { claim: c.claim, effect: c.effect, window: c.window, unreachable: true } : {
    claim: c.claim, effect: c.effect, window: c.window, strength: c.strength, tests: c.tests, bar: sizeBar(c.tests),
    rates: rates(c, power.placebos, B, alpha),
  }));
  const D6 = {};
  for (const c of pcells.filter((x) => x.effect === 0 && !x.unreachable)) {
    D6[`${c.claim}|${c.window}`] = Object.fromEntries(Object.entries(c.rates).filter(([, v]) => v !== null).map(([m, v]) => [m, v <= c.bar]));
  }
  const se = (p, n) => Math.sqrt((p * (1 - p)) / n);
  const D7 = [];
  for (const claim of pre2.power.claims) for (const window of pre2.power.windows) {
    const sizeOk = D6[`${claim}|${window}`] ?? {};
    const calOk = (m) => {
      if (window !== "in_sample" || !pre2.calibration.claims.includes(claim)) return true;
      return cells.filter((c) => c.claim === claim && c.role === "claim_false").every((c) => c.rates[m] === undefined || c.rates[m] === null || c.rates[m] <= c.bar);
    };
    const at = pcells.find((c) => c.claim === claim && c.window === window && c.effect === 0.3);
    if (!at || at.unreachable) { D7.push({ claim, window, recommended: null, note: "effect 0.3 unreachable" }); continue; }
    const eligible = Object.keys(at.rates).filter((m) => at.rates[m] !== null && m !== "naive" && m !== "bonferroni" && sizeOk[m] && calOk(m));
    eligible.sort((a, b) => at.rates[b] - at.rates[a]);
    const best = eligible[0] ?? null;
    const tied = best ? eligible.filter((m) => m !== best && at.rates[best] - at.rates[m] <= 2 * Math.sqrt(se(at.rates[best], at.tests) ** 2 + se(at.rates[m], at.tests) ** 2)) : [];
    D7.push({ claim, window, recommended: best, rate: best ? at.rates[best] : null, not_significantly_below: tied, eligible, excluded_for_size: Object.keys(at.rates).filter((m) => at.rates[m] !== null && m !== "naive" && m !== "bonferroni" && !eligible.includes(m)) });
  }

  // ---- real data (D4, D8, D9) ----
  const r1 = ev1.real;
  const familyOf = (t) => (pre1.claims[t.claim]?.family === "primary" && pre1.families.primary_tests.includes(t.test) ? "primary" : pre1.claims[t.claim] ? "secondary" : ["in_sample_search", "oos_published"].includes(t.test) ? "osap" : "osap_secondary");
  const res = real.results.map((r) => ({ ...r, family: familyOf(r) }));
  const methods = [];
  for (const r of res) {
    if (r.method === "permute") methods.push({ ...r, key: "permute", p: r.p_value });
    else if (r.method === "block") methods.push({ ...r, key: `block${r.block}`, p: r.p_value });
    else {
      const bms = pre2.bootstrap.benchmarks[PIPE[r.claim] ?? (r.claim.startsWith("vmf") ? "vol_managed" : null)];
      bms.forEach((bm, i) => {
        const tag = i === 0 ? "" : `_${bm}`;
        const b = r.boot[bm];
        methods.push({ ...r, key: `rc${tag}_mb${r.mean_block}`, p: b.rc_p, boot: undefined, best_rule: b.best_rule });
        methods.push({ ...r, key: `spa${tag}_mb${r.mean_block}`, p: b.spa_p, boot: undefined, best_rule: b.best_rule });
        methods.push({ ...r, key: `stepm${tag}_mb${r.mean_block}`, p: null, stepm_reject: b.stepm_reject, boot: undefined, best_rule: b.best_rule });
      });
    }
  }
  // Holm within each family, separately for each method.
  const keys = [...new Set(methods.map((m) => m.key))];
  for (const key of keys) for (const fam of ["primary", "secondary", "osap", "osap_secondary"]) {
    const mine = methods.filter((m) => m.key === key && m.family === fam && m.p !== null);
    holm(mine.map((m) => m.p)).forEach((p, i) => { mine[i].holm_p = round(p); });
  }
  const verdictOf = (m) => (!m ? "not run" : m.p === null ? (m.stepm_reject ? "rejects (unadjusted)" : "does not reject (unadjusted)") : m.holm_p < alpha ? "below" : "not below");
  const find = (claim, test, key) => methods.find((m) => m.claim === claim && m.test === test && m.key === key);
  const r1Verdict = Object.fromEntries(ev1.claims.map((c) => [c.claim, { in_sample: c.in_sample, out_of_sample: c.out_of_sample }]));
  const D4 = ev1.claims.map((c) => {
    const row = { claim: c.claim, round_1: r1Verdict[c.claim], by_block: {} };
    for (const b of B) {
      const is = verdictOf(find(c.claim, "in_sample_search", `block${b}`)), oos = verdictOf(find(c.claim, "oos_published", `block${b}`));
      const caveat = D3[c.claim]?.[b]?.keeps_size === false && (is === "below" || oos === "below");
      row.by_block[b] = { in_sample: is, out_of_sample: oos, in_sample_changed: is !== c.in_sample, out_of_sample_changed: oos !== c.out_of_sample, caveat_time_series_structure_only: caveat };
    }
    row.robust_in_sample = B.every((b) => !row.by_block[b].in_sample_changed);
    row.robust_out_of_sample = B.every((b) => !row.by_block[b].out_of_sample_changed);
    if (c.claim === "csfm") row.round_1_caveat_lifted_at = B.filter((b) => row.by_block[b].in_sample === "below" && D3.csfm[b].keeps_size);
    return row;
  });
  const mb = pre2.bootstrap.mean_block_primary;
  const D8 = ev1.claims.map((c) => {
    const row = { claim: c.claim, placebo_round_1: r1Verdict[c.claim] };
    for (const m of ["rc", "spa", "stepm", ...(PIPE[c.claim] === "ts_momentum" ? ["rc_zero", "spa_zero", "stepm_zero"] : [])]) {
      const key = `${m}_mb${mb}`;
      const is = verdictOf(find(c.claim, "in_sample_search", key)), oos = verdictOf(find(c.claim, "oos_published", key));
      row[m] = { in_sample: is, out_of_sample: oos, agrees_in_sample: m.startsWith("stepm") ? null : is === c.in_sample, agrees_out_of_sample: m.startsWith("stepm") ? null : oos === c.out_of_sample };
    }
    return row;
  });
  const sensitivity = ev1.claims.map((c) => ({ claim: c.claim, ...Object.fromEntries(["rc", "spa"].map((m) => [m, { in_sample: verdictOf(find(c.claim, "in_sample_search", `${m}_mb12`)), out_of_sample: verdictOf(find(c.claim, "oos_published", `${m}_mb12`)) }])) }));
  const D9 = Object.keys(pre2.claims).map((claim) => {
    const r1claim = claim.replace("osap_", "");
    const is = verdictOf(find(claim, "in_sample_search", "permute")), oos = verdictOf(find(claim, "oos_published", "permute"));
    return {
      claim, in_sample: is, out_of_sample: oos,
      round_1_french: r1Verdict[r1claim], agrees_in_sample: is === r1Verdict[r1claim].in_sample, agrees_out_of_sample: oos === r1Verdict[r1claim].out_of_sample,
      other_methods: Object.fromEntries(keys.filter((k) => k !== "permute").map((k) => [k, { in_sample: verdictOf(find(claim, "in_sample_search", k)), out_of_sample: verdictOf(find(claim, "oos_published", k)) }])),
    };
  });

  return {
    schema: "canli.placebo-evaluation.v2r2",
    bars: { ...pre2.bars, size_max_calibration: sizeBar(calib.cells[0].tests) },
    deviations,
    calibration: { cells, D1_block_exactness_failures: D1, D2_reproduction: D2, D3_block_size: D3, D5_method_size: D5 },
    power: { effects: power.effects, cells: pcells, D6_size_in_real_shaped_null: D6, D7_recommended: D7 },
    real: methods.map(({ view, ...m }) => m),
    D4_block_verdicts: D4,
    D8_bootstrap_verdicts: D8,
    bootstrap_mean_block_12: sensitivity,
    D9_osap: D9,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const [p1, e1, s1, p2, c, pw, r] = process.argv.slice(2).map(read);
  process.stdout.write(`${JSON.stringify(evaluate2(p1, e1, s1, p2, c, pw, r), null, 1)}\n`);
}
