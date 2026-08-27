// =============================================================================
// build-hero-fallbacks.mjs
// -----------------------------------------------------------------------------
// The homepage's status strip is the FIRST text in the document, and it shipped
// as four "Loading..." placeholders. JavaScript replaces them a moment later, so
// a person with a browser never notices. A crawler without JS, a reader with
// scripts blocked, and every social-card and search-snippet generator sees
// "Record basis Loading... Broker execution Loading..." as the opening line of
// the site.
//
// This writes the real values into that markup at build time, computed from the
// SAME public-claims contract js/home.js reads, with the SAME formatters, so the
// static text and the hydrated text are identical rather than merely similar.
//
// The site already enforces this discipline for brand facts through data-fact
// spans, whose static text verify-papers checks against config/brand.js. This is
// the same rule applied to the claim contract, and audit-homepage.py asserts the
// two agree in a real browser.
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLAIMS = resolve(ROOT, "public", "contracts", "public-claims.json");
const PAGE = resolve(ROOT, "index.html");

// Mirrors js/home.js exactly. If either side changes, audit-homepage.py catches
// it in a browser, because it compares the static text against the hydrated text.
const integer = new Intl.NumberFormat("en-GB");
const fullDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function heroFallbacks(claimsPayload) {
  const value = (id) => {
    const claim = claimsPayload.claims.find((c) => c.id === id);
    if (!claim) throw new Error(`hero fallbacks: the claim contract has no ${id}`);
    return claim.value;
  };
  const capitalKind = value("forward.capital-kind");
  if (capitalKind !== "PAPER_ONLY") {
    // Not a formatting concern. If the record ever stops being paper-only, the
    // homepage's opening line is a capital claim and must be written by a person.
    throw new Error(
      `hero fallbacks: capital kind is ${capitalKind}, not PAPER_ONLY. The static ` +
        "hero text states the record's basis and may not be generated for a funded record.",
    );
  }
  const firstMark = new Date(`${value("forward.first-mark")}T00:00:00Z`);
  if (Number.isNaN(firstMark.valueOf())) throw new Error("hero fallbacks: unparseable first mark");

  return {
    "hero-record-basis": "Observed paper",
    "hero-broker-execution":
      `${integer.format(Number(value("broker.reconciled-alpaca-sleeves")))} Alpaca paper sleeves`,
    "hero-paper-since": `Since ${fullDate.format(firstMark)}`,
    "hero-grade": `Self-grade ${value("validation.internal-grade")}`,
  };
}

function main() {
  const claims = JSON.parse(readFileSync(CLAIMS, "utf8"));
  const fallbacks = heroFallbacks(claims);
  let html = readFileSync(PAGE, "utf8");

  for (const [id, text] of Object.entries(fallbacks)) {
    const pattern = new RegExp(`(<strong id="${id}"[^>]*>)([^<]*)(</strong>)`);
    const found = html.match(pattern);
    if (!found) throw new Error(`hero fallbacks: no <strong id="${id}"> on the homepage`);
    html = html.replace(pattern, `$1${text}$3`);
  }
  writeFileSync(PAGE, html);
  const shown = Object.entries(fallbacks).map(([id, t]) => `${id.replace("hero-", "")}="${t}"`);
  console.log(`  hero fallbacks written: ${shown.join(", ")}`);
}

main();
