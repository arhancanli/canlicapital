// =============================================================================
// home-status.js
// -----------------------------------------------------------------------------
// The program status the homepage states in words. It used to print the engine's
// internal letter grade ("Self-grade C+"), which told a reader nothing about what
// had been tested or what was still open. These functions say it plainly.
//
// js/home.js renders them in the browser and scripts/build-hero-fallbacks.mjs
// writes the same strings into the static HTML at build time, so the text a
// crawler reads and the text a person sees cannot drift
// (scripts/audit-homepage.py compares the two in a real browser).
// =============================================================================

const integer = new Intl.NumberFormat("en-GB");

// An engine status code as a sentence-case phrase: TARGETS_NOT_YET_ACHIEVED -> "Targets not yet achieved".
export function humanizeStatus(value) {
  return String(value || "Not available")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

// The forward goals stay open while the engine reports any NOT_YET status.
export function goalsRemainOpen(status) {
  return String(status).includes("NOT_YET");
}

export function recordDays(days) {
  const count = Number(days);
  return `${integer.format(count)} ${count === 1 ? "day" : "days"}`;
}

export function strategiesText(current, target) {
  return `${integer.format(Number(current))} running · goal ${integer.format(Number(target))}`;
}

export function validationLabel(brokerPasses, goalsRemainOpen, humanStatus) {
  return brokerPasses && goalsRemainOpen ? "Broker check passed · goals not met yet" : humanStatus;
}

export function validationReason(brokerPasses, goalsRemainOpen, sharpeGoal, observations) {
  if (!brokerPasses) return "Broker reconciliation is open, so the public status remains fail-closed.";
  if (goalsRemainOpen) {
    return `Broker reconciliation passes. The Sharpe ratio goal (above ${Number(sharpeGoal).toFixed(2)}) is not established yet; ` +
      `the paper record has ${integer.format(Number(observations))} daily returns.`;
  }
  return "Broker reconciliation passes. The program status page shows how each goal was judged.";
}
