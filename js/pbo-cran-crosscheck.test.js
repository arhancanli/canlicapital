// pboCscv against an independent implementation: the CRAN package pbo 1.3.5 (R 4.6.1), which
// implements the same paper, Bailey, Borwein, López de Prado and Zhu, "The Probability of Backtest
// Overfitting" (Journal of Computational Finance 20(4), 2017). The paper illustrates CSCV with
// simulations rather than a fixed worked example, so an independent implementation is the check.
//
// The two differ in one documented convention. The paper (preprint
// https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf, page 12, step f) defines the relative
// rank as omega = rank / (N + 1), in (0, 1); pboCscv follows it. The R package uses rank / N and
// substitutes 6 for the infinite logit at rank N. The fixture therefore stores the ranks recovered
// from R's logits, and every one of our logits must equal the paper's logit of R's rank. PBO must
// match exactly. Fixture: js/fixtures/pbo-cran-reference.json, from scripts/reference/pbo-cran.R.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { referenceMatrix } from "../scripts/reference/pbo-matrices.mjs";
import { pboCscv } from "./pbo-core.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/pbo-cran-reference.json", import.meta.url), "utf8"));

for (const c of fixture.cases) {
  test(`${c.name}: PBO and every logit agree with the CRAN pbo package`, () => {
    const matrix = referenceMatrix({ rows: c.rows, cols: c.cols, seed: c.seed, driftColumn: c.drift === "column 3" ? 3 : null });
    const ours = pboCscv(matrix, { nSplits: c.n_splits, maxCombinations: Number.MAX_SAFE_INTEGER });
    assert.equal(ours.exhaustive, true);
    assert.equal(ours.lambdas.length, c.r_ranks.length);
    assert.ok(Math.abs(ours.pbo - c.r_pbo) < 1e-12, `PBO ${ours.pbo} vs R ${c.r_pbo}`);
    let worst = 0;
    ours.lambdas.forEach((lambda, i) => {
      const rank = c.r_ranks[i];
      worst = Math.max(worst, Math.abs(lambda - Math.log(rank / (c.cols + 1 - rank))));
    });
    assert.ok(worst < 1e-9, `largest logit difference ${worst}`);
  });
}
