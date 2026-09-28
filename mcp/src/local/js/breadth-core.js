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

/**
 * The most sleeves a shared correlation admits: `1 + (N-1)*rho` must stay positive, so a negative
 * rho allows only N < 1 - 1/rho (rho = -0.3 allows 4). Infinite when rho >= 0, and when rho is so
 * close to zero (above about -1e-16) that the cap passes 2^53 sleeves.
 */
export function maxSleeves(correlation) {
  if (!(correlation < 0)) return Number.POSITIVE_INFINITY;
  const bound = 1 - 1 / correlation;
  if (!(bound < Number.MAX_SAFE_INTEGER)) return Number.POSITIVE_INFINITY;
  let n = Math.max(1, Math.ceil(bound) - 1);
  // The closed form, then one step either way against floating-point rounding at the boundary.
  while (n > 1 && 1 + (n - 1) * correlation <= 0) n -= 1;
  while (1 + n * correlation > 0) n += 1;
  return n;
}

/**
 * The most a book of these sleeves can be worth. For rho > 0 it is the limit s / sqrt(rho), which
 * no finite book reaches. For rho < 0 it is the book at maxSleeves, which is reached: a negative
 * shared correlation caps the count, so it caps the Sharpe too. Infinite when rho is 0 (and, in
 * practice, within about 1e-16 below it).
 */
export function breadthCeiling({ sleeveSharpe, correlation }) {
  if (correlation > 0) return sleeveSharpe / Math.sqrt(correlation);
  const cap = maxSleeves(correlation);
  if (!Number.isFinite(cap)) return Number.POSITIVE_INFINITY;
  return bookSharpe({ sleeveSharpe, sleeves: cap, correlation });
}

/**
 * The smallest N reaching `target`, or null when no admissible N does. Exact at any size: from
 * s * sqrt(N / (1 + (N-1)*rho)) >= T, with k = (T/s)^2, N * (1 - k*rho) >= k * (1 - rho). A target
 * of 50 from sleeves of Sharpe 1 at rho = 0.0001 needs 3,333 sleeves; a search that stopped at 500
 * called it unreachable.
 */
export function sleevesRequired({ sleeveSharpe, correlation, target }) {
  const ceiling = breadthCeiling({ sleeveSharpe, correlation });
  const unreachable = { sleeves: null, ceiling, reachable: false };
  if (!(sleeveSharpe > 0) || !(target > 0)) return unreachable;
  if (target <= sleeveSharpe) return { sleeves: 1, ceiling, reachable: true };
  // For rho > 0 the ceiling is a limit no book attains; for rho < 0 it is attained at maxSleeves.
  if (correlation > 0 ? target >= ceiling : target > ceiling) return unreachable;
  const k = (target / sleeveSharpe) ** 2;
  const book = (n) => bookSharpe({ sleeveSharpe, sleeves: n, correlation });
  let n = Math.max(1, Math.ceil((k * (1 - correlation)) / (1 - k * correlation)));
  if (!Number.isSafeInteger(n)) return unreachable;
  const cap = maxSleeves(correlation);
  if (n > cap) n = cap;
  while (n > 1 && book(n - 1) >= target) n -= 1;
  while (book(n) < target) {
    if (n >= cap || !Number.isSafeInteger(n + 1)) return unreachable;
    n += 1;
  }
  return { sleeves: n, ceiling, reachable: true };
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
