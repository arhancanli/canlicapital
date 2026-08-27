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
const CHAIN = resolve(ROOT, "public", "glassbox", "transparency_log.json");
const BROKER = resolve(ROOT, "public", "glassbox", "alpaca_broker_reconciliation.json");
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

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function heroFallbacks(claimsPayload, chainPayload, brokerPayload) {
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

  // The signed head moves every publish. A fallback is therefore the head AS OF
  // PUBLICATION, which is exactly what a static page should say: the site
  // redeploys hourly, so it is never far behind, and a real timestamp an hour old
  // is worth incomparably more to a reader than the word "Loading" forever.
  const head = chainPayload?.head ?? chainPayload?.entries?.at(-1);
  const signedAt = head?.signed_at ?? head?.timestamp ?? head?.date;
  const signedDate = signedAt ? new Date(signedAt) : new Date(Number.NaN);
  const signedText = Number.isNaN(signedDate.valueOf())
    ? "Signed head unavailable"
    : dateTime.format(signedDate);

  return {
    "hero-record-basis": "Observed paper",
    "hero-broker-execution":
      `${integer.format(Number(value("broker.reconciled-alpaca-sleeves")))} Alpaca paper sleeves`,
    "hero-paper-since": `Since ${fullDate.format(firstMark)}`,
    "hero-grade": `Self-grade ${value("validation.internal-grade")}`,
    // The rest of the page carried the same placeholders below the fold. Same
    // rule, same source: whatever JavaScript is about to render, rendered here.
    "console-book":
      `${integer.format(Number(value("broker.open-positions")))} positions` +
      ` \u00b7 ${integer.format(Number(value("broker.open-orders")))} orders`,
    "evidence-status": value("broker.reconciliation-passes") === true ? "Broker pass" : "Broker check open",
    "evidence-signed-time": signedText,
    "console-time": signedText === "Signed head unavailable" ? signedText : `Signed ${signedText}`,
    // Per-sleeve broker state, from the same reconciliation artifact js/home.js
    // fetches. Spread last so a sleeve appearing or disappearing upstream changes
    // this map rather than being quietly dropped.
    ...Object.fromEntries(
      Object.entries(brokerPayload?.sleeves ?? {}).map(([key, sleeve]) => [
        `sleeve-${key}-state`,
        sleeve.passes
          ? `${compactCurrency.format(Number(sleeve.current_equity))} equity` +
            ` \u00b7 ${integer.format(Number(sleeve.open_position_count || 0))} positions`
          : "Latest reconciliation open",
      ]),
    ),
  };
}

function main() {
  const claims = JSON.parse(readFileSync(CLAIMS, "utf8"));
  const chain = JSON.parse(readFileSync(CHAIN, "utf8"));
  const broker = JSON.parse(readFileSync(BROKER, "utf8"));
  const fallbacks = heroFallbacks(claims, chain, broker);
  let html = readFileSync(PAGE, "utf8");

  for (const [id, text] of Object.entries(fallbacks)) {
    // The elements are a mix of strong, small and time, so match on the id rather
    // than assuming a tag. Anchored to a single element so a stray id elsewhere
    // cannot be silently rewritten.
    const pattern = new RegExp(`(<(?:strong|small|time) id="${id}"[^>]*>)([^<]*)(</(?:strong|small|time)>)`);
    const found = html.match(pattern);
    if (!found) throw new Error(`hero fallbacks: no element with id="${id}" on the homepage`);
    // A REPLACER FUNCTION, not a replacement string. Compact currency renders
    // "$1.0M", and in a replacement string "$1" is a backreference: it silently
    // substituted the captured opening tag and produced a broken element that
    // looked merely empty. A function treats the text literally.
    html = html.replace(pattern, (_, open, __, close) => `${open}${text}${close}`);
  }
  writeFileSync(PAGE, html);
  // The broker rows address their cells by attribute rather than by id, so they
  // need their own pass. Same source, same formatters, same rule.
  for (const [key, sleeve] of Object.entries(broker?.sleeves ?? {})) {
    const observedAt = new Date(sleeve.current_equity_as_of);
    const positions = integer.format(Number(sleeve.open_position_count || 0));
    const text = Number.isNaN(observedAt.valueOf())
      ? `${positions} open positions`
      : `${positions} positions / ${dateTime.format(observedAt)}`;
    const pattern = new RegExp(
      `(<div data-broker-row="${key}"[\\s\\S]{0,400}?<span data-broker-observation>)([^<]*)(</span>)`,
    );
    if (!pattern.test(html)) {
      throw new Error(`hero fallbacks: no broker observation cell for sleeve ${key}`);
    }
    // A REPLACER FUNCTION, not a replacement string. Compact currency renders
    // "$1.0M", and in a replacement string "$1" is a backreference: it silently
    // substituted the captured opening tag and produced a broken element that
    // looked merely empty. A function treats the text literally.
    html = html.replace(pattern, (_, open, __, close) => `${open}${text}${close}`);
  }
  writeFileSync(PAGE, html);

  const remaining = (html.match(/>[^<]*Loading[^<]*</g) || []).length;
  // The whole point was to leave none. A future element added with a placeholder
  // should fail this build rather than quietly become the site's opening line.
  if (remaining > 0) {
      const shown = (html.match(/.{0,70}Loading.{0,20}/g) || []).slice(0, 6);
    throw new Error(
      `hero fallbacks: ${remaining} loading placeholder(s) remain on the homepage, ` +
        `which is what a crawler will read:\n  ${shown.join("\n  ")}`,
    );
  }
  console.log(`  homepage fallbacks written: ${Object.keys(fallbacks).length} element(s)`);
  console.log(`  loading placeholders still in index.html: ${remaining}`);
}

main();
