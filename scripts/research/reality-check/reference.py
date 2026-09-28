"""Independent reference values for js/snooping-core.js.

For each case (a CSV of excess returns, one column per variant, benchmark zero):
- arch 8.0's SPA, RealityCheck and StepM, which do not studentize the statistic: they check the
  JavaScript core run with studentize=false, and White's Reality Check exactly as published;
- Hansen's (2005) studentized SPA, transcribed here from the paper with numpy, not from the
  JavaScript: the Politis-Romano variance, the three recentrings and T = max(0, max_k sqrt(n) d_k / w_k).
Draws come from numpy, so they agree with the JavaScript core within Monte Carlo error only.
Usage: python reference.py <csv dir> <reps> <seed> <name:block> ...
"""
import json
import sys

import numpy as np
from arch.bootstrap import SPA, RealityCheck, StepM


def pr_variance(d, block):
    n = d.shape[0]
    p = 1.0 / block
    x = d - d.mean(0)
    v = (x ** 2).sum(0) / n
    for i in range(1, n):
        kappa = (1 - i / n) * (1 - p) ** i + (i / n) * (1 - p) ** (n - i)
        if kappa == 0:
            continue
        v += 2 * kappa * (x[: n - i] * x[i:]).sum(0) / n
    return v


def stationary(n, block, rng):
    p = 1.0 / block
    idx = np.empty(n, dtype=np.int64)
    idx[0] = rng.integers(n)
    for t in range(1, n):
        idx[t] = rng.integers(n) if rng.random() < p else (idx[t - 1] + 1) % n
    return idx


def hansen_spa(d, block, reps, seed):
    n, k = d.shape
    mean = d.mean(0)
    w = np.sqrt(pr_variance(d, block))
    stat = max(0.0, float(np.max(np.sqrt(n) * mean / w)))
    thresh = -np.sqrt(w ** 2 / n * 2 * np.log(np.log(n)))
    g = [np.maximum(mean, 0.0), np.where(mean >= thresh, mean, 0.0), mean]
    rng = np.random.default_rng(seed)
    above = np.zeros(3)
    for _ in range(reps):
        m = d[stationary(n, block, rng)].mean(0)
        for c in range(3):
            above[c] += max(0.0, float(np.max(np.sqrt(n) * (m - g[c]) / w))) > stat
    return {"lower": above[0] / reps, "consistent": above[1] / reps, "upper": above[2] / reps, "statistic": stat}


def main():
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
        stepm = StepM(zeros, -d, size=0.05, block_size=block, reps=reps, bootstrap="stationary", seed=np.random.default_rng(seed + 2))
        stepm.compute()
        out[name] = {
            "arch_spa_unstudentized": {k: float(v) for k, v in spa.pvalues.items()},
            "arch_reality_check": float(rc.pvalues["upper"]),
            "arch_stepm_superior": [int(i) for i in stepm.superior_models],
            "hansen_spa_studentized": hansen_spa(d, block, reps, seed + 3),
        }
    print(json.dumps(out))


main()
