// =============================================================================
// breadth-core.js
// -----------------------------------------------------------------------------
// The arithmetic behind /tools/breadth: what a book of N sleeves is worth, and
// why adding sleeves stops helping.
//
// For N equally weighted sleeves, each with per-period Sharpe s and identical
// pairwise correlation rho:
//
//     portfolio mean      = s * sigma
//     portfolio variance  = sigma^2 * (1 + (N-1) * rho) / N
//     BOOK SHARPE         = s * sqrt( N / (1 + (N-1) * rho) )
//
// The limit as N grows without bound is the part worth staring at:
//
//     ceiling = s / sqrt(rho)          for rho > 0
//
// It does not depend on N at all. Past a certain point, breadth is not the lever;
// correlation is. A project that answers a disappointing Sharpe by adding sleeves
// is working on the wrong number, and this file exists so that is visible rather
// than argued about.
//
// The assumptions are strong and stated everywhere they are used: equal weights,
// equal Sharpe, one shared pairwise correlation. Real books have none of those.
// The lab is for the SHAPE of the constraint, not for forecasting a book.
// =============================================================================

/** Book Sharpe for N equally weighted sleeves at shared correlation rho. */
export function bookSharpe({ sleeveSharpe, sleeves, correlation }) {
  if (!Number.isInteger(sleeves) || sleeves < 1) throw new Error("sleeves must be a positive integer");
  if (!Number.isFinite(sleeveSharpe)) throw new Error("sleeveSharpe must be finite");
  if (!Number.isFinite(correlation)) throw new Error("correlation must be finite");
  // The single condition, stated once. `1 + (N-1)*rho` IS the portfolio variance in
  // units of a sleeve's variance, so it must be strictly positive:
  //
  //   rho <  -1/(N-1)  the covariance matrix is not positive semidefinite and no
  //                    set of real return series can produce it;
  //   rho == -1/(N-1)  the matrix is PSD but singular, and the equally weighted
  //                    portfolio has exactly zero variance, so its Sharpe is
  //                    infinite. Mathematically real, financially a fantasy, and
  //                    returning a spectacular number for it is precisely the
  //                    failure mode this tool argues against.
  //
  // Both are refused, and the boundary case is named separately because a caller
  // who lands on it exactly has done something interesting rather than careless.
  const denominator = 1 + (sleeves - 1) * correlation;
  if (denominator <= 0) {
    const floor = sleeves > 1 ? -1 / (sleeves - 1) : -1;
    throw new Error(
      denominator === 0
        ? `a shared correlation of exactly ${correlation} across ${sleeves} sleeves gives the ` +
          "equally weighted book zero variance and an infinite Sharpe. That is a degenerate " +
          "case, not an opportunity."
        : `a shared correlation of ${correlation} is impossible for ${sleeves} sleeves: below ` +
          `${floor.toFixed(4)} the covariance matrix is not positive semidefinite`,
    );
  }
  return sleeveSharpe * Math.sqrt(sleeves / denominator);
}

/** The value no amount of breadth can exceed. Infinite only when rho <= 0. */
export function breadthCeiling({ sleeveSharpe, correlation }) {
  if (correlation <= 0) return Number.POSITIVE_INFINITY;
  return sleeveSharpe / Math.sqrt(correlation);
}

/** The smallest N reaching `target`, or null when the ceiling forbids it. */
export function sleevesRequired({ sleeveSharpe, correlation, target, maxSleeves = 500 }) {
  const ceiling = breadthCeiling({ sleeveSharpe, correlation });
  if (target > ceiling) return { sleeves: null, ceiling, reachable: false };
  for (let n = 1; n <= maxSleeves; n += 1) {
    if (bookSharpe({ sleeveSharpe, sleeves: n, correlation }) >= target) {
      return { sleeves: n, ceiling, reachable: true };
    }
  }
  return { sleeves: null, ceiling, reachable: false };
}

/** The curve of book Sharpe against N, for plotting. */
export function breadthCurve({ sleeveSharpe, correlation, maxSleeves }) {
  const points = [];
  for (let n = 1; n <= maxSleeves; n += 1) {
    // Stop at the last N the correlation can actually support, rather than at the
    // last one that does not throw: those differ by exactly the degenerate case.
    if (1 + (n - 1) * correlation <= 0) break;
    points.push({ sleeves: n, sharpe: bookSharpe({ sleeveSharpe, sleeves: n, correlation }) });
  }
  return points;
}

/** How much of the distance to the ceiling N sleeves have actually captured. */
export function ceilingCaptured({ sleeveSharpe, sleeves, correlation }) {
  const ceiling = breadthCeiling({ sleeveSharpe, correlation });
  if (!Number.isFinite(ceiling)) return null;
  return bookSharpe({ sleeveSharpe, sleeves, correlation }) / ceiling;
}
