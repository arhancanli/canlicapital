// Tests for the breadth arithmetic. The known-answer cases are the point: this
// formula is easy to write plausibly and wrong, and every downstream conclusion
// about whether an objective is reachable rests on it.

import assert from "node:assert/strict";
import test from "node:test";

import { bookSharpe, breadthCeiling, breadthCurve, ceilingCaptured, maxSleeves, sleevesRequired } from "./breadth-core.js";

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

test("zero correlation has no ceiling; a negative one caps the count, and the ceiling is the book at the cap", () => {
  assert.equal(breadthCeiling({ sleeveSharpe: 0.5, correlation: 0 }), Number.POSITIVE_INFINITY);
  // The 2026-09-27 audit's case: rho = -0.3 admits 4 sleeves, worth sqrt(40) = 6.32 at a sleeve Sharpe of 1.
  assert.equal(maxSleeves(-0.3), 4);
  assert.ok(Math.abs(breadthCeiling({ sleeveSharpe: 1, correlation: -0.3 }) / Math.sqrt(40) - 1) < 1e-12);
  assert.equal(maxSleeves(-0.1), 10, "rho = -0.1 is degenerate at 11 sleeves");
  assert.equal(maxSleeves(-0.25), 4, "rho = -0.25 is degenerate at 5 sleeves");
  assert.equal(maxSleeves(-1), 1);
  assert.equal(breadthCeiling({ sleeveSharpe: 0.5, correlation: -0.02 }), bookSharpe({ sleeveSharpe: 0.5, sleeves: 50, correlation: -0.02 }));
  assert.equal(maxSleeves(-1e-17), Number.POSITIVE_INFINITY, "a cap beyond 2^53 sleeves is treated as none");
});

test("sleevesRequired is exact at any size: the audit's 3,333 sleeves, and a brute-force search agrees", () => {
  assert.deepEqual(sleevesRequired({ sleeveSharpe: 1, correlation: 0.0001, target: 50 }), { sleeves: 3333, ceiling: 100, reachable: true });
  const top = breadthCeiling({ sleeveSharpe: 1, correlation: -0.3 });
  assert.equal(sleevesRequired({ sleeveSharpe: 1, correlation: -0.3, target: top }).sleeves, 4, "a maximum is reached");
  assert.equal(sleevesRequired({ sleeveSharpe: 1, correlation: -0.3, target: 6.33 }).reachable, false);
  assert.equal(sleevesRequired({ sleeveSharpe: 1, correlation: 0.25, target: 2 }).reachable, false, "a positive-rho ceiling is a limit no book reaches");
  for (const s of [0.3, 0.5, 1.2]) {
    for (const rho of [-0.02, 0, 0.001, 0.05, 0.3]) {
      for (const target of [0.2, 0.9, 1.5, 2.5, 4]) {
        const got = sleevesRequired({ sleeveSharpe: s, correlation: rho, target });
        let brute = null;
        for (let n = 1; n <= Math.min(maxSleeves(rho), 20000); n += 1) {
          if (bookSharpe({ sleeveSharpe: s, sleeves: n, correlation: rho }) >= target) { brute = n; break; }
        }
        if (brute !== null) assert.equal(got.sleeves, brute, `s ${s} rho ${rho} target ${target}`);
        else if (got.reachable) assert.ok(got.sleeves > 20000, `s ${s} rho ${rho} target ${target}: ${got.sleeves}`);
      }
    }
  }
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
