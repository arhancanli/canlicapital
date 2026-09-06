// =============================================================================
// curve-stats.js
// -----------------------------------------------------------------------------
// One definition of the headline curve statistics, imported by BOTH the browser
// (js/home.js) and the static build (scripts/build-hero-fallbacks.mjs).
//
// WHY IT IS SHARED RATHER THAN WRITTEN TWICE. The homepage promises that the
// text a crawler reads is the text a browser renders. If the build computed
// these figures with its own copy of the arithmetic, the two would agree until
// the day one of them was edited, and the divergence would appear only to
// readers without JavaScript -- which is to say, only to search engines and
// language models, the readers least able to report the problem.
// =============================================================================

export function curveStatistics(curve) {
  if (!Array.isArray(curve) || curve.length < 2) return null;
  const values = curve.map((point) => Number(point.equity)).filter(Number.isFinite);
  if (values.length < 2 || values[0] === 0) return null;

  let high = values[0];
  let maxDrawdown = 0;
  const returns = [];
  values.forEach((value, index) => {
    high = Math.max(high, value);
    maxDrawdown = Math.min(maxDrawdown, value / high - 1);
    if (index > 0 && values[index - 1] !== 0) {
      returns.push(value / values[index - 1] - 1);
    }
  });
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.length > 1
    ? returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (returns.length - 1)
    : 0;
  return {
    returnPercent: (values.at(-1) / values[0] - 1) * 100,
    drawdownPercent: maxDrawdown * 100,
    // Daily marks, so 365 rather than 252: the composite includes a crypto sleeve
    // that trades every calendar day.
    annualizedVolatilityPercent: Math.sqrt(variance) * Math.sqrt(365) * 100,
  };
}
