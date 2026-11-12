// Placebo study v2: simulated monthly panels for the calibration run. Each panel has `assets` return
// columns and, for each, a realized-variance column built as if from 21 daily returns: the month's
// true variance times a chi-square(21)/21 draw. The families:
//
//   iid_normal      independent months; each asset a constant mean (annual Sharpe drawn from a normal
//                   with mean 0.3 and standard deviation 0.3), monthly volatility 4%, one common
//                   factor giving pairwise correlation 0.3. Exchangeable: the placebo is exact.
//   student_t4      as iid_normal with Student-t(4) shocks scaled to unit variance. Exchangeable.
//   garch_const     one market-wide GARCH(1,1) variance (a 0.10, b 0.85) scaling every asset; means
//                   constant. Not exchangeable, but nothing predicts a return's sign: the null for
//                   the momentum claims. For volatility management it is a power case: variance is
//                   predictable and the mean does not rise with it.
//   garch_meanvar   as garch_const with each mean proportional to the month's variance (the same
//                   unconditional mean). The best weight, mean over variance, is then constant, so
//                   scaling by past variance should not help: the null for volatility management.
//   trend_s         each asset's mean plus its own AR(1) component (rho 0.95) whose stationary standard
//                   deviation is s times the asset's monthly volatility: a power case for momentum.
import { xoshiro } from "../../null-zoo/xoshiro.mjs";

export const SIM = Object.freeze({ vol: 0.04, sharpeMean: 0.3, sharpeSd: 0.3, corr: 0.3, garchA: 0.1, garchB: 0.85, trendRho: 0.95, days: 21 });

function chiSquare(df, r) {
  let s = 0;
  for (let i = 0; i < df; i++) { const z = r.gauss(); s += z * z; }
  return s;
}

/** A unit-variance Student-t(4) draw. */
function studentT4(r) {
  const z = r.gauss();
  const v = chiSquare(4, r);
  return (z / Math.sqrt(v / 4)) / Math.SQRT2;
}

/**
 * One simulated panel: { returns: [Float64Array], variance: [Float64Array] } over `months` rows.
 * family: iid_normal | student_t4 | garch_const | garch_meanvar | trend; strength for trend.
 */
export function simulatePanel(family, assets, months, r, strength = 0) {
  const s = SIM;
  const loading = Math.sqrt(s.corr), idio = Math.sqrt(1 - s.corr);
  const means = Array.from({ length: assets }, () => ((s.sharpeMean + s.sharpeSd * r.gauss()) / Math.sqrt(12)) * s.vol);
  const returns = Array.from({ length: assets }, () => new Float64Array(months));
  const variance = Array.from({ length: assets }, () => new Float64Array(months));
  const garch = family === "garch_const" || family === "garch_meanvar";
  const omega = 1 - s.garchA - s.garchB; // unconditional variance multiplier 1
  let h = 1, shockPrev = 0;
  const trend = new Float64Array(assets);
  const trendSd = strength * s.vol, trendInnov = trendSd * Math.sqrt(1 - s.trendRho ** 2);
  if (family === "trend") for (let i = 0; i < assets; i++) trend[i] = trendSd * r.gauss();
  // Burn in the variance process so the first month is drawn from (close to) its stationary law.
  if (garch) for (let b = 0; b < 200; b++) { const z = r.gauss(); h = omega + s.garchA * h * z * z + s.garchB * h; }
  for (let t = 0; t < months; t++) {
    if (garch && t > 0) h = omega + s.garchA * shockPrev * shockPrev + s.garchB * h;
    const scale = garch ? Math.sqrt(h) : 1;
    const draw = () => (family === "student_t4" ? studentT4(r) : r.gauss());
    const common = draw();
    shockPrev = scale * common;
    for (let i = 0; i < assets; i++) {
      if (family === "trend") trend[i] = s.trendRho * trend[i] + trendInnov * r.gauss();
      const mean = family === "garch_meanvar" ? means[i] * h : means[i] + trend[i];
      const sd = s.vol * scale;
      returns[i][t] = mean + sd * (loading * common + idio * draw());
      variance[i][t] = (sd * sd * chiSquare(s.days, r)) / s.days;
    }
  }
  return { returns, variance };
}

export { xoshiro };
