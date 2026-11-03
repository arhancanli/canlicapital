"""Independent reference values for js/snooping-core.js.

For each case (a CSV of excess returns, one column per variant, benchmark zero):
- arch 8.0's SPA, RealityCheck and StepM, which do not studentize the statistic: they check the
  JavaScript core run with studentize=false, and White's Reality Check exactly as published;
- the bootstrap-t SPA and StepM, transcribed here with numpy from the definitions below, not from the
  JavaScript. Draws come from numpy, so they agree with the JavaScript core within Monte Carlo error.

Bootstrap-t definitions (Hansen 2005 for the statistic and the three recentrings; Romano and Wolf
2005, footnote 22, for re-estimating the standard error in every resample; the tie rule as in the
Null Zoo v2 study's spa_c_boot_t_ge):
  m_k, s_k   sample mean and standard deviation (divisor n - 1) of column k
  w_k^2      Politis-Romano variance of sqrt(n) m_k at mean block length b, which sets the threshold
  T          max(0, max_k sqrt(n) m_k / s_k)
  g_k        lower max(m_k, 0); consistent m_k if m_k >= -sqrt(w_k^2 / n * 2 ln ln n), else 0; upper m_k
  T*         max(0, max_k sqrt(n) (m*_k - g_k) / s*_k), s*_k the resample's own standard deviation
             (divisor n - 1), or s_k where the resample is constant (s*_k^2 <= eps s_k^2)
  p          #{T* >= T} / B, ties counted, so p = 1 when T = 0
  StepM      c = max(0, the 1 - alpha quantile (numpy's linear) of max over live k of the consistent
             sqrt(n) (m*_k - g_k) / s*_k); reject the live k with sqrt(n) m_k / s_k > c; repeat on the
             rest until none is rejected
Usage: python reference.py <csv dir> <reps> <seed> <name:block> ...
"""
import json
import sys

import numpy as np

ALPHA = 0.05


def politis_romano(d, b):
    n = d.shape[0]
    x = d - d.mean(axis=0)
    q = 1.0 - 1.0 / b
    out = (x * x).sum(axis=0) / n
    for i in range(1, n):
        kappa = (1.0 - i / n) * q ** i + (i / n) * q ** (n - i)
        if kappa == 0.0:
            continue
        out = out + 2.0 * kappa * (x[:-i] * x[i:]).sum(axis=0) / n
    return out


def resample_indices(n, b, size, rng):
    """`size` circular stationary-bootstrap resamples of n periods, shape (size, n)."""
    new_block = rng.random((size, n)) < 1.0 / b
    new_block[:, 0] = True
    start = rng.integers(0, n, size=(size, n))
    t = np.arange(n)
    opened = np.maximum.accumulate(np.where(new_block, t, 0), axis=1)
    return (np.take_along_axis(start, opened, axis=1) + t - opened) % n


def bootstrap_t(d, b, reps, seed, alpha=ALPHA, chunk=50):
    n, k = d.shape
    root = np.sqrt(n)
    m = d.mean(axis=0)
    s2 = d.var(axis=0, ddof=1)
    s = np.sqrt(s2)
    w2 = politis_romano(d, b)
    t_obs = root * m / s
    T = max(0.0, float(t_obs.max()))
    cut = -np.sqrt(w2 / n * 2.0 * np.log(np.log(n)))
    g = {"lower": np.maximum(m, 0.0), "consistent": np.where(m >= cut, m, 0.0), "upper": m}
    rng = np.random.default_rng(seed)
    hits = {name: 0 for name in g}
    t_cons = np.empty((reps, k))
    done = 0
    while done < reps:
        size = min(chunk, reps - done)
        x = d[resample_indices(n, b, size, rng)]          # (size, n, k)
        ms = x.mean(axis=1)
        vs = x.var(axis=1, ddof=1)
        ss = np.where(vs > np.finfo(float).eps * s2, np.sqrt(np.maximum(vs, 0.0)), s)
        for name, centre in g.items():
            stat = np.maximum(0.0, (root * (ms - centre) / ss).max(axis=1))
            hits[name] += int((stat >= T).sum())
        t_cons[done:done + size] = root * (ms - g["consistent"]) / ss
        done += size
    live = list(range(k))
    superior = []
    while live:
        crit = max(0.0, float(np.quantile(t_cons[:, live].max(axis=1), 1.0 - alpha)))
        now = [j for j in live if t_obs[j] > crit]
        if not now:
            break
        superior += now
        live = [j for j in live if j not in now]
    spa = {"lower": hits["lower"] / reps, "consistent": hits["consistent"] / reps, "upper": hits["upper"] / reps, "statistic": T}
    return spa, sorted(superior)


def main():
    from arch.bootstrap import SPA, RealityCheck, StepM

    folder, reps, seed = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    out = {}
    for spec in sys.argv[4:]:
        name, block = spec.split(":")
        block = int(block)
        d = np.loadtxt(f"{folder}/{name}.csv", delimiter=",")
        zeros = np.zeros(d.shape[0])
        spa = SPA(zeros, -d, block_size=block, reps=reps, bootstrap="stationary", seed=np.random.default_rng(seed))
        spa.compute()
        rc = RealityCheck(zeros, -d, block_size=block, reps=reps, bootstrap="stationary", seed=np.random.default_rng(seed + 1))
        rc.compute()
        stepm = StepM(zeros, -d, size=ALPHA, block_size=block, reps=reps, bootstrap="stationary", seed=np.random.default_rng(seed + 2))
        stepm.compute()
        boot_spa, boot_superior = bootstrap_t(d, block, reps, seed + 3)
        out[name] = {
            "arch_spa_unstudentized": {k: float(v) for k, v in spa.pvalues.items()},
            "arch_reality_check": float(rc.pvalues["upper"]),
            "arch_stepm_superior": [int(i) for i in stepm.superior_models],
            "bootstrap_t_spa_studentized": boot_spa,
            "bootstrap_t_stepm_superior": boot_superior,
        }
    print(json.dumps(out))


if __name__ == "__main__":
    main()
