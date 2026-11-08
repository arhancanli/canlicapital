// The probability of backtest overfitting by combinatorially symmetric cross-validation (Bailey, Borwein,
// Lopez de Prado and Zhu 2017), shared by sleeve_tournament and strategy_sweep. The sample is cut into S equal
// chunks; for every way to pick half of them, the variant with the best Sharpe on that half is ranked among
// all variants on the other half. The probability is how often the in-sample winner lands in the bottom half
// out of sample.
import { mean, quantile } from "./math.mjs";

function* combinations(n, k) {
  const c = [...Array(k).keys()];
  for (;;) {
    yield c;
    let i = k - 1;
    while (i >= 0 && c[i] === n - k + i) i--;
    if (i < 0) return;
    c[i]++;
    for (let j = i + 1; j < k; j++) c[j] = c[j - 1] + 1;
  }
}

// Each variant's period returns, in the order of the answer's every_trial Sharpes (one series for one strategy), under
// a symbol key: JSON leaves it out, so a client never reads them, while a server that runs this package in its own
// process (canli-mcp) can measure overfitting across everything a session tried on the same data.
export const TRIAL_RETURNS = Symbol.for("canli.trial_returns");

// The default number of chunks for n periods: 16 when each chunk has 40 periods or more, else fewer, at least 4.
export const defaultSplits = (n) => (n >= 16 * 40 ? 16 : Math.max(4, 2 * Math.floor(n / 80)));

// R: one return series per variant, all of the same length. S: an even number of chunks.
export function pbo(R, S) {
  const K = R.length, n = R[0].length, m = Math.floor(n / S), off = n - S * m, half = S / 2;
  const sums = R.map((x) => { const s = new Float64Array(S), q = new Float64Array(S); for (let c = 0; c < S; c++) for (let t = off + c * m; t < off + (c + 1) * m; t++) { s[c] += x[t]; q[c] += x[t] * x[t]; } return [s, q]; });
  const sharpeOf = (k, chunks) => { let s = 0, q = 0; for (const c of chunks) { s += sums[k][0][c]; q += sums[k][1][c]; } const len = chunks.length * m, mu = s / len, v = (q - s * s / len) / (len - 1); return v > 0 ? mu / Math.sqrt(v) : 0; };
  const logits = [], isB = [], oosB = [];
  for (const IS of combinations(S, half)) {
    const OOS = [...Array(S).keys()].filter((c) => !IS.includes(c));
    let best = 0, bestV = -Infinity;
    for (let k = 0; k < K; k++) { const v = sharpeOf(k, IS); if (v > bestV) { bestV = v; best = k; } }
    const oos = Array.from({ length: K }, (_, k) => sharpeOf(k, OOS)), mine = oos[best];
    let less = 0, eq = 0; for (let k = 0; k < K; k++) { if (oos[k] < mine) less++; else if (oos[k] === mine && k !== best) eq++; }
    const w = (1 + less + 0.5 * eq) / (K + 1);
    logits.push(Math.log(w / (1 - w))); isB.push(bestV); oosB.push(mine);
  }
  const mx = mean(isB), my = mean(oosB);
  let sxy = 0, sxx = 0; for (let i = 0; i < isB.length; i++) { sxy += (isB[i] - mx) * (oosB[i] - my); sxx += (isB[i] - mx) ** 2; }
  return { probability: logits.filter((l) => l <= 0).length / logits.length, splits: S, combinations: logits.length, median_logit: quantile(Float64Array.from(logits).sort(), 0.5), probability_oos_loss: oosB.filter((v) => v < 0).length / oosB.length, degradation_slope: sxx > 0 ? sxy / sxx : null };
}
