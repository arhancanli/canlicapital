// Tests for the breadth arithmetic. The known-answer cases are the point: this
// formula is easy to write plausibly and wrong, and every downstream conclusion
// about whether an objective is reachable rests on it.

import assert from "node:assert/strict";
import test from "node:test";

import { bookSharpe, breadthCeiling, breadthCurve, ceilingCaptured, sleevesRequired } from "./breadth-core.js";

const close = (a, b, tol = 1e-12) => Math.abs(a - b) < tol;

test("one sleeve is its own book", () => {
  for (const rho of [-0.9, 0, 0.3, 1]) {
    assert.ok(close(bookSharpe({ sleeveSharpe: 0.7, sleeves: 1, correlation: rho }), 0.7));
  }
});

test("uncorrelated sleeves give the square-root-of-N law", () => {
  for (const n of [2, 5, 16, 100]) {
    assert.ok(
      close(bookSharpe({ sleeveSharpe: 0.4, sleeves: n, correlation: 0 }), 0.4 * Math.sqrt(n)),
      `N=${n} does not follow sqrt(N) at zero correlation`,
    );
  }
});

test("perfectly correlated sleeves are one sleeve, however many you add", () => {
  for (const n of [2, 10, 400]) {
    assert.ok(
      close(bookSharpe({ sleeveSharpe: 0.9, sleeves: n, correlation: 1 }), 0.9),
      `N=${n} at rho=1 should still be 0.9: perfectly correlated sleeves diversify nothing`,
    );
  }
});

test("THE CEILING: breadth cannot beat s over root rho", () => {
  const sleeveSharpe = 0.5;
  for (const rho of [0.05, 0.15, 0.4]) {
    const ceiling = breadthCeiling({ sleeveSharpe, correlation: rho });
    assert.ok(close(ceiling, sleeveSharpe / Math.sqrt(rho)));
    // Approached from below and never crossed, at any N.
    for (const n of [2, 50, 500, 5000]) {
      const book = bookSharpe({ sleeveSharpe, sleeves: n, correlation: rho });
      assert.ok(book < ceiling, `N=${n} at rho=${rho} exceeded its own ceiling`);
    }
    assert.ok(
      bookSharpe({ sleeveSharpe, sleeves: 100000, correlation: rho }) > ceiling * 0.999,
      "the limit should be approached, not merely bounded",
    );
  }
});

test("zero or negative correlation has no ceiling", () => {
  assert.equal(breadthCeiling({ sleeveSharpe: 0.5, correlation: 0 }), Number.POSITIVE_INFINITY);
  assert.equal(breadthCeiling({ sleeveSharpe: 0.5, correlation: -0.02 }), Number.POSITIVE_INFINITY);
});

test("an impossible correlation is refused, not computed", () => {
  // Below -1/(N-1) no set of real series can produce the matrix. Returning a
  // spectacular number here is exactly the failure this tool argues against.
  assert.throws(
    () => bookSharpe({ sleeveSharpe: 0.5, sleeves: 4, correlation: -0.4 }),
    /not positive semidefinite/,
  );
  assert.doesNotThrow(() => bookSharpe({ sleeveSharpe: 0.5, sleeves: 4, correlation: -1 / 3 + 1e-9 }));
});

test("a target above the ceiling is reported unreachable, not approximated", () => {
  const r = sleevesRequired({ sleeveSharpe: 0.5, correlation: 0.15, target: 2.0 });
  assert.equal(r.reachable, false);
  assert.equal(r.sleeves, null);
  assert.ok(r.ceiling < 2.0);
});

test("a reachable target reports the smallest N that reaches it", () => {
  const target = 1.0;
  const r = sleevesRequired({ sleeveSharpe: 0.5, correlation: 0.05, target });
  assert.equal(r.reachable, true);
  assert.ok(bookSharpe({ sleeveSharpe: 0.5, sleeves: r.sleeves, correlation: 0.05 }) >= target);
  assert.ok(
    r.sleeves === 1 || bookSharpe({ sleeveSharpe: 0.5, sleeves: r.sleeves - 1, correlation: 0.05 }) < target,
    "a smaller N already reached the target, so this is not the smallest",
  );
});

test("the curve is monotone in N for non-negative correlation", () => {
  const points = breadthCurve({ sleeveSharpe: 0.5, correlation: 0.1, maxSleeves: 60 });
  assert.equal(points.length, 60);
  for (let i = 1; i < points.length; i += 1) {
    assert.ok(points[i].sharpe > points[i - 1].sharpe, `not monotone at N=${points[i].sleeves}`);
  }
});

test("the curve stops before the correlation becomes degenerate", () => {
  // At rho = -0.2, N = 6 gives 1 + 5*(-0.2) = 0 exactly: the equally weighted book
  // has zero variance and an infinite Sharpe. The last SUPPORTABLE N is therefore
  // 5, and the off-by-one between "does not throw" and "is meaningful" is the
  // whole point of the check.
  const points = breadthCurve({ sleeveSharpe: 0.5, correlation: -0.2, maxSleeves: 40 });
  assert.equal(points.at(-1).sleeves, 5, "the curve ran into the degenerate case");
  assert.throws(
    () => bookSharpe({ sleeveSharpe: 0.5, sleeves: 6, correlation: -0.2 }),
    /degenerate case, not an opportunity/,
  );
  assert.throws(
    () => bookSharpe({ sleeveSharpe: 0.5, sleeves: 7, correlation: -0.2 }),
    /not positive semidefinite/,
  );
});

test("ceiling capture reports the fraction of the reachable distance taken", () => {
  const captured = ceilingCaptured({ sleeveSharpe: 0.5, sleeves: 14, correlation: 0.15 });
  assert.ok(captured > 0 && captured < 1);
  assert.equal(ceilingCaptured({ sleeveSharpe: 0.5, sleeves: 14, correlation: 0 }), null);
});
