// =============================================================================
// format.js
// -----------------------------------------------------------------------------
// Formatters shared by the browser (js/home.js) and the static build
// (scripts/build-hero-fallbacks.mjs), so the text a crawler reads and the text a
// browser renders are produced by one function rather than by two that agree
// until someone edits one of them.
//
// WHY COMPACT CURRENCY IS HAND-ROLLED. Intl's `notation: "compact"` is not
// portable: the identical options object renders "$1.0M" under Node's ICU and
// "$1M" in Chrome. The static page and the hydrated page therefore disagreed on
// every broker equity cell, with no bug in either file. A formatter whose output
// depends on which engine ran it cannot be used to make the two match.
// =============================================================================

const COMPACT_TIERS = [
  { limit: 1e12, suffix: "T" },
  { limit: 1e9, suffix: "B" },
  { limit: 1e6, suffix: "M" },
  { limit: 1e3, suffix: "K" },
];

export function formatCompactCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Not available";
  const sign = number < 0 ? "-" : "";
  const magnitude = Math.abs(number);
  for (const { limit, suffix } of COMPACT_TIERS) {
    if (magnitude >= limit) {
      const scaled = magnitude / limit;
      // One decimal, and a trailing ".0" dropped: 1_000_000 reads "$1M", not
      // "$1.0M", which is what Chrome produced and what readers expect.
      const text = scaled.toFixed(1).replace(/\.0$/, "");
      return `${sign}$${text}${suffix}`;
    }
  }
  return `${sign}$${magnitude.toFixed(0)}`;
}
