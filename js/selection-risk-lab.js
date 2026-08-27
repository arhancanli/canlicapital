// =============================================================================
// selection-risk-lab.js
// -----------------------------------------------------------------------------
// The interactive layer for /tools/selection-risk.
//
// The tool's argument is made by the TRIAL LEDGER, not by the equity curve. Every
// distinct parameter set the visitor evaluates is recorded, and the best result so
// far is deflated against that count with the dispersion measured across their own
// search. So the number that matters gets worse the more the visitor looks, which
// is the entire lesson and the reason the ledger cannot be cleared without also
// resetting the best result.
//
// Sandbox safety contract:
//   - every input lives in the URL, so a scenario is shareable and reproducible;
//   - nothing here writes to any ledger, artifact, broker or published record;
//   - the result is labelled a user-generated scenario, never research evidence.
// =============================================================================

import { calculateDsr } from "./dsr-tool.js";
import {
  assertNoLookahead,
  generateSeries,
  runCrossover,
  sharpeVariance,
} from "./selection-risk-core.js";

const BARS = 750;
const PERIODS_PER_YEAR = 252;
const GATE = 0.95;

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");

/** Every distinct parameter set this visitor has evaluated, on the CURRENT series. */
const ledger = new Map();

/**
 * The series the ledger belongs to.
 *
 * Trials are only comparable within one series. Deflating a best result found on
 * series A against a trial count accumulated on series B reports a number about
 * nothing, and the tool would be committing the exact error it is built to expose.
 * So the ledger is bound to a seed and cleared whenever the seed moves, however it
 * moves: by the button, by typing, or by a shared URL.
 */
let ledgerSeed = null;

function syncLedgerToSeed(seed) {
  if (ledgerSeed !== seed) {
    ledger.clear();
    ledgerSeed = seed;
  }
}

function readControls() {
  return {
    seed: Number($("sr-seed").value),
    fast: Number($("sr-fast").value),
    slow: Number($("sr-slow").value),
    costBps: Number($("sr-cost").value),
  };
}

function writeUrl(params) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  window.history.replaceState(null, "", url);
}

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  const set = (id, key) => {
    const v = p.get(key);
    if (v !== null && v !== "" && Number.isFinite(Number(v))) $(id).value = v;
  };
  set("sr-seed", "seed");
  set("sr-fast", "fast");
  set("sr-slow", "slow");
  set("sr-cost", "cost");
}

function drawCurve(curve) {
  const svg = $("sr-chart");
  const width = 760;
  const height = 260;
  if (curve.length < 2) return;
  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const span = max - min || 1;
  const x = (i) => (i / (curve.length - 1)) * width;
  const y = (v) => height - ((v - min) / span) * (height - 16) - 8;
  const path = curve.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  $("sr-path").setAttribute("d", path);
  // The flat line at 1.0 is where a strategy with no edge belongs, drawn so the
  // visitor's curve is always read against it rather than on its own.
  $("sr-base").setAttribute("d", `M0 ${y(1).toFixed(1)}L${width} ${y(1).toFixed(1)}`);
  svg.setAttribute("aria-label", `Equity curve ending at ${curve[curve.length - 1].toFixed(3)}`);
}

function render() {
  const controls = readControls();
  if (controls.fast >= controls.slow) {
    $("sr-warning").textContent = "The fast window has to be shorter than the slow one.";
    $("sr-warning").hidden = false;
    return;
  }
  $("sr-warning").hidden = true;
  writeUrl({ seed: controls.seed, fast: controls.fast, slow: controls.slow, cost: controls.costBps });

  syncLedgerToSeed(controls.seed);
  const series = generateSeries({ seed: controls.seed, bars: BARS });
  const result = runCrossover({ series, ...controls });

  // Causality is re-checked on every run, in front of the visitor, rather than
  // being a claim made once in prose.
  const causal = assertNoLookahead(result);
  $("sr-causal").textContent = causal.ok
    ? "no-lookahead: every decision priced at a strictly later bar"
    : "no-lookahead: VIOLATED";
  $("sr-causal").dataset.ok = String(causal.ok);

  $("sr-sharpe").textContent = fmt(result.sharpeAnnualised, 3);
  $("sr-drawdown").textContent = `${fmt(result.maxDrawdown * 100, 2)}%`;
  $("sr-total").textContent = `${fmt(result.totalReturn * 100, 2)}%`;
  $("sr-trades").textContent = String(result.trades);
  drawCurve(result.curve);

  // The ledger: one entry per distinct parameter set, on this series.
  const key = `${controls.seed}:${controls.fast}:${controls.slow}:${controls.costBps}`;
  if (!ledger.has(key)) ledger.set(key, result.sharpeAnnualised);
  const sharpes = [...ledger.values()];
  const best = Math.max(...sharpes);
  const trials = sharpes.length;

  $("sr-trials").textContent = String(trials);
  $("sr-best").textContent = fmt(best, 3);

  const verdict = $("sr-verdict");
  if (trials < 2) {
    $("sr-dsr").textContent = "n/a";
    $("sr-luckbar").textContent = "n/a";
    // Clear the attribution too. Leaving the previous series' winning parameters on
    // screen next to a fresh series is a small lie of exactly the kind this page
    // is about.
    $("sr-bestparams").textContent = "nothing yet";
    verdict.textContent =
      "Deflation needs at least two trials to have anything to deflate against. Try another setting.";
    verdict.dataset.state = "idle";
    return;
  }

  const bestEntry = [...ledger.entries()].find(([, s]) => s === best);
  const [bestSeed, bestFast, bestSlow, bestCost] = bestEntry[0].split(":").map(Number);
  if (bestSeed !== controls.seed) throw new Error("ledger holds a trial from another series");
  const bestResult = runCrossover({
    series: generateSeries({ seed: bestSeed, bars: BARS }),
    fast: bestFast,
    slow: bestSlow,
    costBps: bestCost,
  });

  const dispersionAnnualised = Math.sqrt(sharpeVariance(sharpes));
  let report;
  try {
    report = calculateDsr({
      observed_sharpe_annualized: best,
      observations: bestResult.observations,
      periods_per_year: PERIODS_PER_YEAR,
      skew: bestResult.skew,
      non_excess_kurtosis: bestResult.nonExcessKurtosis,
      effective_independent_trials: trials,
      cross_trial_sharpe_sd_annualized: dispersionAnnualised,
    });
  } catch (error) {
    $("sr-dsr").textContent = "n/a";
    verdict.textContent = `Deflation unavailable: ${error.message}`;
    verdict.dataset.state = "idle";
    return;
  }

  $("sr-dsr").textContent = fmt(report.deflated_sharpe_ratio, 4);
  // The expected maximum, not the haircut. "Observed minus expected max" goes
  // negative whenever the search found nothing good, and a negative haircut reads
  // as nonsense to someone meeting the idea for the first time. The bar that luck
  // alone sets is always meaningful and is the number the argument turns on.
  $("sr-luckbar").textContent = fmt(report.expected_max_sharpe_annualized, 3);
  $("sr-bestparams").textContent = `seed ${bestSeed}, fast ${bestFast}, slow ${bestSlow}, ${bestCost} bps`;

  const admissible = report.deflated_sharpe_ratio >= GATE;
  verdict.dataset.state = admissible ? "pass" : "fail";
  const luckBar = fmt(report.expected_max_sharpe_annualized, 2);
  verdict.textContent = admissible
    ? `Your best Sharpe of ${fmt(best, 2)} clears the ${GATE} gate at ${fmt(report.deflated_sharpe_ratio, 4)} ` +
      `after ${trials} trials. On a series whose true Sharpe is zero, that is a false positive, and ` +
      `it is the one this instrument exists to let you produce. Keep searching: it will not hold.`
    : `Your best Sharpe of ${fmt(best, 2)} does not survive ${trials} trials. Searching that many ` +
      `settings, luck alone would be expected to turn up ${luckBar}, so your result had to beat ` +
      `that rather than beat zero. Deflated it reads ${fmt(report.deflated_sharpe_ratio, 4)} against ` +
      `a gate of ${GATE}. The true value here is zero, because the series has no edge to find.`;
}

/**
 * Search the space on the visitor's behalf.
 *
 * A hand search of thirty settings often finds nothing good, and then the tool
 * teaches nothing: the point is not that searching fails, it is that searching
 * SUCCEEDS on a series with no edge and the success is worthless. Sweeping a real
 * grid reliably produces the flattering number the deflation then has to kill.
 * Every setting evaluated is recorded as a trial, which is exactly the honesty the
 * instrument is arguing for.
 */
function sweep() {
  const { seed, costBps } = readControls();
  syncLedgerToSeed(seed);
  const series = generateSeries({ seed, bars: BARS });
  let best = { sharpe: -Infinity, fast: null, slow: null };
  for (let fast = 2; fast <= 24; fast += 1) {
    for (let slow = fast + 2; slow <= 120; slow += 3) {
      const key = `${seed}:${fast}:${slow}:${costBps}`;
      if (!ledger.has(key)) {
        ledger.set(key, runCrossover({ series, fast, slow, costBps }).sharpeAnnualised);
      }
      const sharpe = ledger.get(key);
      if (sharpe > best.sharpe) best = { sharpe, fast, slow };
    }
  }
  if (best.fast !== null) {
    $("sr-fast").value = String(best.fast);
    $("sr-slow").value = String(best.slow);
  }
  render();
}

function wire() {
  readUrl();
  for (const id of ["sr-seed", "sr-fast", "sr-slow", "sr-cost"]) {
    $(id).addEventListener("input", render);
  }
  $("sr-sweep").addEventListener("click", sweep);
  $("sr-new-series").addEventListener("click", () => {
    // render() clears the ledger through syncLedgerToSeed, so a new series always
    // starts from zero trials no matter which route changed the seed.
    $("sr-seed").value = String(Math.floor(Math.random() * 100000));
    render();
  });
  $("sr-reset-ledger").addEventListener("click", () => {
    ledger.clear();
    ledgerSeed = null;
    render();
  });
  render();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
}
