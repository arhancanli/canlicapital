// api/_lib/badge.js
// The receipt badge: an SVG a README can embed, showing only the formula version and the receipt
// id prefix, rendered from the stored receipt's own fields. Never one of the banned verdict
// words, never a pass/fail mark: a badge that read as "verified" or "approved" would be the exact
// overclaim the envelope's limits text exists to prevent (docs/superpowers/plans/
// 2026-09-06-launch-kit-and-deposits.md section 3).
export const BANNED_BADGE_WORDS = Object.freeze(["verified", "approved", "passed", "certified", "profitable"]);

export function hasBannedWord(text) {
  const lower = String(text).toLowerCase();
  return BANNED_BADGE_WORDS.some((word) => lower.includes(word));
}

const API_VERSION = "v1";
const PREFIX_LENGTH = 12;

// A short, human name for each validator, used only to label the badge; the version number next
// to it is the API's own, the same "v1" every response's schema and endpoint fields already carry.
const SHORT_LABEL = Object.freeze({
  "validate/deflated-sharpe": "DSR",
  "validate/overfitting": "PBO",
  "validate/paper-evidence": "Paper Evidence",
  "validate/breadth": "Breadth",
});

function shortLabel(endpoint) {
  return SHORT_LABEL[endpoint] ?? String(endpoint).replace(/^validate\//, "");
}

// The one countable fact each validator's own output records: a sample size for deflated-sharpe, a
// trial (combination) count for overfitting. An endpoint with neither still states a fact rather
// than a fabricated number, so the alt text never implies a count the receipt does not carry.
function limitsFact(endpoint, output) {
  if (endpoint === "validate/deflated-sharpe") {
    const n = output?.derived_inputs?.observations;
    return Number.isFinite(n) ? `sample size ${n} observations` : "sample size not recorded in this receipt";
  }
  if (endpoint === "validate/overfitting") {
    const n = output?.n_combinations;
    return Number.isFinite(n) ? `trial count ${n} combinations evaluated` : "trial count not recorded in this receipt";
  }
  if (endpoint === "validate/breadth") {
    const n = output?.book?.sleeves;
    return Number.isFinite(n) ? `sleeve count ${n}` : "no sleeve count in this receipt";
  }
  if (endpoint === "validate/paper-evidence") {
    const n = (output?.structural?.length ?? 0) + (output?.semantic?.length ?? 0);
    return `${n} conformance finding${n === 1 ? "" : "s"}`;
  }
  return "no sample size or trial count recorded for this validator";
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// One flat rect and one text run, always. No second segment, no colour keyed to any pass/fail
// state: a two-tone shields.io-style badge would itself read as a verdict, which is the one thing
// this badge must never be.
function badgeSvg({ text, title, fill }) {
  const width = Math.round(text.length * 6.4 + 20);
  const height = 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)}"><title>${escapeXml(title)}</title><rect width="${width}" height="${height}" rx="3" fill="${fill}"/><text x="${width / 2}" y="14" font-family="Verdana,Geneva,sans-serif" font-size="11" fill="#ffffff" text-anchor="middle">${escapeXml(text)}</text></svg>\n`;
}

export function renderReceiptBadge({ id, endpoint, output }) {
  const prefix = String(id).slice(0, PREFIX_LENGTH);
  const text = `${shortLabel(endpoint)} ${API_VERSION} · receipt ${prefix}`;
  const title = `${text}. ${limitsFact(endpoint, output)}.`;
  if (hasBannedWord(text) || hasBannedWord(title)) {
    // Should be unreachable: SHORT_LABEL and limitsFact() never emit a banned word. Left in as a
    // guard that actually fires (see api/_lib/badge.test.mjs) rather than a comment that trusts it.
    throw new Error("badge: rendered text would contain a banned word");
  }
  return badgeSvg({ text, title, fill: "#2b3a55" });
}

export function renderNotFoundBadge() {
  const text = "receipt not found";
  return badgeSvg({ text, title: text, fill: "#9e9e9e" });
}
