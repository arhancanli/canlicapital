// Simulated markets for the placebo study. Null markets have nothing a strategy can predict: every
// period's returns are drawn afresh, so a pipeline's result is luck. They differ in what the
// placebo must not mistake for skill: fat tails, skew, volatility clustering (GARCH, regimes), a
// constant drift, and, across assets, a common factor and assets with different constant means.
// Trend markets plant a persistent, predictable component, so the study measures power too.
//
// Each market is a panel of daily returns: an array of columns (one per asset), deterministic given
// its generator. Volatility is 1% a day before any drift or trend.
import { drawSearch } from "../../null-zoo/families.mjs";

export const NULL_FAMILIES = Object.freeze(["iid_normal", "student_t4", "skew_negative", "garch", "regimes"]);
export const VOL = 0.01;
// An annualized Sharpe of 0.5, about the equity premium's: the drift a long-only rule earns for free.
export const DRIFT = (0.5 / Math.sqrt(252)) * VOL;
export const ASSETS = 20;
// Every pair of assets shares a common factor with correlation 0.3.
export const FACTOR_SHARE = 0.3;

const draw = (family, n, observations, r) => drawSearch(family, { trials: n, observations, periodsPerYear: 252 }, r);

/** One asset: `variant` "flat" (mean zero) or "drift" (DRIFT a day). */
export function singleAsset(family, variant, observations, r) {
  const [x] = draw(family, 1, observations, r);
  const mean = variant === "drift" ? DRIFT : 0;
  return [Array.from(x, (v) => VOL * v + mean)];
}

/**
 * ASSETS assets sharing one factor, every series from `family`. variant "flat": every mean zero;
 * "dispersed": each asset's own constant mean, with an annualized Sharpe drawn from a normal with
 * standard deviation 0.5, so past winners keep winning on average without anything being timed.
 */
export function crossSection(family, variant, observations, r) {
  const series = draw(family, ASSETS + 1, observations, r);
  const factor = series[ASSETS];
  const a = Math.sqrt(FACTOR_SHARE), b = Math.sqrt(1 - FACTOR_SHARE);
  const columns = [];
  for (let i = 0; i < ASSETS; i++) {
    const mean = variant === "dispersed" ? r.gauss() * DRIFT : 0;
    columns.push(Array.from(series[i], (e, t) => VOL * (a * factor[t] + b * e) + mean));
  }
  return columns;
}

/**
 * One asset with a planted trend: r_t = VOL * e_t + m_t, where m_t = rho * m_(t-1) + innovation
 * is a slowly moving mean with stationary standard deviation `strength` * VOL. Holding the sign of
 * m_t would earn an annualized Sharpe of about strength * sqrt(2/pi) * sqrt(252).
 */
export function trendingAsset(strength, observations, r, rho = 0.98) {
  const sd = strength * VOL;
  const step = sd * Math.sqrt(1 - rho * rho);
  let m = sd * r.gauss();
  const out = new Array(observations);
  for (let t = 0; t < observations; t++) {
    m = rho * m + step * r.gauss();
    out[t] = VOL * r.gauss() + m;
  }
  return [out];
}

/**
 * ASSETS assets, each with its own slowly moving mean (rho 0.99, stationary standard deviation
 * `strength` * VOL) on top of the common factor: relative performance persists, so ranking assets
 * by past return predicts the next month.
 */
export function trendingCrossSection(strength, observations, r, rho = 0.99) {
  const series = draw("iid_normal", ASSETS + 1, observations, r);
  const factor = series[ASSETS];
  const a = Math.sqrt(FACTOR_SHARE), b = Math.sqrt(1 - FACTOR_SHARE);
  const sd = strength * VOL;
  const step = sd * Math.sqrt(1 - rho * rho);
  const columns = [];
  for (let i = 0; i < ASSETS; i++) {
    let m = sd * r.gauss();
    columns.push(Array.from(series[i], (e, t) => {
      m = rho * m + step * r.gauss();
      return VOL * (a * factor[t] + b * e) + m;
    }));
  }
  return columns;
}

/** The oracle Sharpe of a planted single-asset trend of this strength (holding the sign of m_t). */
export const trendOracleSharpe = (strength) => strength * Math.sqrt(2 / Math.PI) * Math.sqrt(252);
