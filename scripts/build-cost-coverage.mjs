// =============================================================================
// build-cost-coverage.mjs  ->  /costs
// -----------------------------------------------------------------------------
// Every cost that can reach a return, whether this engine charges it, and which
// way the answer is wrong when it does not.
//
// WHY THIS EXISTS AS ITS OWN SURFACE. A cost model is usually described by what it
// includes. That framing is structurally misleading, because the reader cannot
// tell the difference between a cost that was considered and judged immaterial and
// one that nobody thought of. Both appear as silence.
//
// The uncomfortable property, stated on the page: almost every omission below
// pushes the SAME WAY. Unmodelled costs make a strategy look better, so a cost
// model's gaps are not noise around the truth, they are a bias with a known sign.
// =============================================================================

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderProductShellFooter, renderProductShellHeader, renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const SOURCE_NAME = "cost_coverage.json";

const esc = (v) =>
  String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
};

//: status vocabulary, deliberately small so a row cannot hide in a qualifier.
//   CHARGED            the engine deducts it, and the parameter is named.
//   CHARGED_UNVERIFIED it is deducted, but nothing in the live record can check it.
//   WRONG_KIND         it is deducted as the wrong sort of quantity. Worse than a
//                      wrong number, because the error does not shrink with care.
//   NOT_CHARGED        the engine does not deduct it at all.
const COSTS = [
  // --- charged at trade time -------------------------------------------------
  { group: "At trade time", name: "Venue commission", status: "CHARGED",
    detail: "Fee schedule by market type. Crypto taker 5 bps, equity 1 bps.",
    bias: "none", verified: "Crypto commission MEASURED at exactly the modelled 5 bps across 24 fills." },
  { group: "At trade time", name: "Half-spread", status: "CHARGED",
    detail: "Per-instrument override where observed, otherwise a deliberately conservative 2.5 bps default (equity 3 bps).",
    bias: "conservative", verified: "Default chosen above the ~0.5 to 1 bp that liquid perps actually run." },
  { group: "At trade time", name: "Market impact", status: "CHARGED",
    detail: "Square-root law, Y = 1.0. Hard-fails above 5% of ADV rather than extrapolating outside the regime it was fitted in.",
    bias: "none", verified: "Never exercised at size: the book has not traded near the participation cap." },
  { group: "At trade time", name: "Decision-to-fill latency", status: "WRONG_KIND",
    detail: "Charged as a flat 2 bps add-on. Measured median submit-to-fill on the equity sleeves is about 5.5 HOURS: orders are submitted after the close and fill at the next open.",
    bias: "unknown sign, fat tail",
    verified: "An overnight gap is not a spread. It is unhedged exposure whose cost is a distribution, not a constant, and the sign on any single trade is not predictable." },
  { group: "At trade time", name: "Equity slippage against the decision price", status: "CHARGED_UNVERIFIED",
    detail: "Modelled, but not checkable: the equity fills record a PADDED marketable limit price, so a fill that beats it is beating the padding, not the decision.",
    bias: "unknown", verified: "Not measurable from what the broker records today." },
  { group: "At trade time", name: "Partial fills and queue position", status: "NOT_CHARGED",
    detail: "Every fill is modelled as complete at the next open. No queue model, no partial-fill schedule.",
    bias: "flatters", verified: "Defensible at this frequency and size; it would not be for an intraday book." },
  { group: "At trade time", name: "Tick and lot rounding", status: "NOT_CHARGED",
    detail: "Positions are continuous. No minimum tick, lot size or share-rounding cost.",
    bias: "flatters", verified: "Small at these notionals, unbounded at small ones." },
  { group: "At trade time", name: "Minimum commission floors", status: "NOT_CHARGED",
    detail: "Commission is purely proportional. No per-order minimum.",
    bias: "flatters", verified: "Immaterial at current notional, material for a small account." },

  // --- charged while holding -------------------------------------------------
  { group: "While holding", name: "Perpetual funding, the crypto swap cost", status: "CHARGED",
    detail: "Replayed from the STORED funding-events table, each event carrying its own timestamp, so 8h/4h/1h schedules are honoured rather than assumed. There is no funding clock in the engine.",
    bias: "none",
    verified: "This is the cost that was silently NOT booked for 44 days in an earlier incident. It is now charged and pinned by a test on the path that actually runs." },
  { group: "While holding", name: "Short borrow", status: "CHARGED",
    detail: "Explicit availability, quantity, fee, locate expiry and recall deadlines. 50 bps annual default. Fills are not fabricated after a recall.",
    bias: "none", verified: "General-collateral assumptions are explicitly rejected as insufficient." },
  { group: "While holding", name: "Cash and margin-debit financing", status: "CHARGED",
    detail: "Point-in-time cash, margin-debit and short-collateral accrual with an explicit day-count basis.",
    bias: "none", verified: "" },
  { group: "While holding", name: "Margin interest above the financing model", status: "NOT_CHARGED",
    detail: "No separate broker margin-interest schedule, tiering or minimum balance.",
    bias: "flatters", verified: "" },
  { group: "While holding", name: "Custody, platform and market-data fees", status: "NOT_CHARGED",
    detail: "No account-level fee of any kind is deducted.",
    bias: "flatters", verified: "Fixed costs do not scale with notional, so they matter most at small size." },

  // --- corporate and jurisdictional ------------------------------------------
  { group: "Corporate and jurisdictional", name: "Splits and cash dividends", status: "CHARGED",
    detail: "Replayed from the point-in-time corporate-actions table before ex-date fills. Splits transform held AND queued quantities; dividends accrue against the signed position entering the ex date.",
    bias: "none", verified: "Filtered on when the action became knowable, never on ex-date." },
  { group: "Corporate and jurisdictional", name: "Dividend withholding tax", status: "NOT_CHARGED",
    detail: "Dividends accrue gross. No withholding is applied at any rate.",
    bias: "flatters", verified: "Material for a dividend-exposed book; the current sleeves are not dividend strategies." },
  { group: "Corporate and jurisdictional", name: "Regulatory fees (SEC Section 31, FINRA TAF)", status: "NOT_CHARGED",
    detail: "No US regulatory sale fee is deducted. These apply to sales, not purchases.",
    bias: "flatters", verified: "Small per trade and strictly one-directional." },
  { group: "Corporate and jurisdictional", name: "Transaction taxes and stamp duty", status: "NOT_CHARGED",
    detail: "No UK stamp duty, French or Italian FTT, or equivalent.",
    bias: "flatters", verified: "Currently immaterial: the universe is US-listed. It would become material on any European extension." },
  { group: "Corporate and jurisdictional", name: "Capital gains and income tax", status: "NOT_CHARGED",
    detail: "Every figure published is pre-tax.",
    bias: "flatters", verified: "Standard for a strategy record, and stated rather than assumed." },
  { group: "Corporate and jurisdictional", name: "Currency conversion", status: "NOT_CHARGED",
    detail: "No FX conversion spread or fee. Crypto settles in USDT and equities in USD, both treated as the quote currency.",
    bias: "flatters", verified: "Zero today because nothing is traded outside its quote currency." },
  { group: "Corporate and jurisdictional", name: "Delisting and halt losses", status: "NOT_CHARGED",
    detail: "No forced-liquidation haircut on a delisting or a permanent halt. Venue state is tracked, but a delisting is not priced as a loss event.",
    bias: "flatters",
    verified: "The book has already seen one delisting-adjacent collapse, written up in full, and its loss was realised through ordinary fills rather than a haircut.",
    link: { href: "/notes/the-trade-that-lost-99-percent", text: "Read the post-mortem" } },
];

const contract = {
  schema: "canli.alphac-cost-coverage.v1",
  generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  author: "Arhan Canli",
  claim_boundary:
    "A statement of what this engine charges and what it does not. It is not a measurement of " +
    "how large the missing costs would be, and no figure here adjusts any published return.",
  the_uncomfortable_property:
    "Every cost this engine does not charge makes results look BETTER, with one exception whose " +
    "sign is genuinely unknown. A cost model's gaps are therefore not noise around the truth. " +
    "They are a bias with a known direction, and the honest reading of any figure on this site is " +
    "that it is an upper bound on what the same strategy would have returned net of everything.",
  status_vocabulary: {
    CHARGED: "the engine deducts it and the parameter is named",
    CHARGED_UNVERIFIED: "deducted, but nothing in the live record can check it",
    WRONG_KIND: "deducted as the wrong sort of quantity, which care alone does not fix",
    NOT_CHARGED: "not deducted at all",
  },
  costs: COSTS,
  totals: {
    charged: COSTS.filter((c) => c.status === "CHARGED").length,
    charged_unverified: COSTS.filter((c) => c.status === "CHARGED_UNVERIFIED").length,
    wrong_kind: COSTS.filter((c) => c.status === "WRONG_KIND").length,
    not_charged: COSTS.filter((c) => c.status === "NOT_CHARGED").length,
    total: COSTS.length,
    omissions_that_flatter: COSTS.filter((c) => c.bias === "flatters").length,
  },
};
contract.content_hash = `sha256:${createHash("sha256").update(canonical(contract)).digest("hex")}`;
mkdirSync(resolve(ROOT, "public/glassbox"), { recursive: true });
writeFileSync(resolve(ROOT, "public/glassbox", SOURCE_NAME), `${JSON.stringify(contract, null, 2)}\n`);

const t = contract.totals;
const groups = [...new Set(COSTS.map((c) => c.group))];
const row = (c) => `<tr data-status="${c.status}">
        <th scope="row">${esc(c.name)}</th>
        <td><span class="cost-pill" data-status="${esc(c.status)}">${esc(c.status.replace(/_/g, " ").toLowerCase())}</span></td>
        <td>${esc(c.detail)}${c.verified ? ` <span class="cost-verified">${esc(c.verified)}${c.link ? ` <a href="${esc(c.link.href)}">${esc(c.link.text)}</a>.` : ""}</span>` : ""}</td>
        <td class="cost-bias" data-bias="${esc(c.bias)}">${esc(c.bias)}</td>
      </tr>`;

const description =
  "Every cost that can reach a return, whether this engine charges it, and which way the answer " +
  "is wrong when it does not.";

const html = `<!doctype html>
<html lang="en" data-page="costs">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>What the costs actually are | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}/costs" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${SOURCE_NAME} cost_model_realism.json" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="What the costs actually are" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}/costs" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="What the costs actually are" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/developers.css" />
<link rel="stylesheet" href="/css/costs.css" />
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@type": "TechArticle",
  headline: "What the costs actually are", description, url: `${ORIGIN}/costs`,
  author: { "@id": `${ORIGIN}/#arhan-canli` },
})}</script>
</head>
<body class="dev-page">
<a class="dev-skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "" })}
<main id="content">
  <section class="dev-hero">
    <p class="dev-kicker"><span>Cost coverage</span><span>${t.total} categories</span></p>
    <h1>Every cost this engine does not charge makes it look better.</h1>
    <p class="dev-lead">A cost model is usually described by what it includes, which is
      structurally misleading: a reader cannot tell a cost that was considered and judged
      immaterial from one nobody thought of. Both appear as silence. So this lists
      <strong>every</strong> category that can reach a return, including the ones that are not
      charged at all.</p>
    <p class="dev-boundary"><strong>The uncomfortable property.</strong>
      ${esc(contract.the_uncomfortable_property)}</p>
  </section>

  <section class="dev-section">
    <h2>The ledger</h2>
    <p class="dev-note">${t.charged} charged, ${t.charged_unverified} charged but unverifiable,
      ${t.wrong_kind} charged as the wrong kind of quantity, ${t.not_charged} not charged at all.
      ${t.omissions_that_flatter} of these push the result in the same direction.</p>
    ${groups.map((g) => `<h3 class="cost-group">${esc(g)}</h3>
    <table class="dev-table cost-table">
      <thead><tr><th>Cost</th><th>Status</th><th>What that means</th><th>Bias</th></tr></thead>
      <tbody>
      ${COSTS.filter((c) => c.group === g).map(row).join("\n      ")}
      </tbody>
    </table>`).join("\n    ")}
  </section>

  <section class="dev-section">
    <h2>The one that is not a number problem</h2>
    <div class="dev-grid">
      <article class="dev-grid__wide"><h3>Latency is charged as the wrong kind of thing</h3>
        <p>The model deducts a flat 2 basis points for the gap between deciding and filling.
          Measured median submit-to-fill across the equity sleeves is about <strong>5.5 hours</strong>:
          orders are submitted after the close and fill at the next open. An overnight gap is not a
          spread. It is unhedged exposure to whatever happens overnight, and its cost is a
          distribution with a fat tail rather than a constant.</p>
        <p>This matters more than a mis-set parameter, because a wrong number shrinks with care and
          a wrong <em>kind</em> does not. The
          <a href="/tools/execution">Execution Reality Lab</a> shows the general form of this
          independently: a cost scales with its parameter and is negative on every series, while a
          re-timing does neither. Latency here is the second kind being charged as the first.</p>
        <p>No cost parameter moves on this evidence. The schema should.</p>
      </article>
    </div>
  </section>

  <section class="dev-section dev-section--tail">
    <h2>How to read any return on this site</h2>
    <ul class="dev-list">
      <li>Every published figure is <strong>pre-tax</strong> and before any account-level fee.</li>
      <li>The omissions are <strong>one-directional</strong>. Treat any return here as an upper
        bound on what the same strategy would have returned net of everything.</li>
      <li>The one component whose sign is genuinely unknown is latency, and it is the one being
        modelled incorrectly.</li>
      <li>The only cost component ever checked against a live fill is crypto commission, which
        <strong>matched the model exactly</strong>. Everything else is unverifiable from what the
        brokers currently record, which is a gap in the recording, not a claim that the model is right.</li>
    </ul>
    <p class="dev-note">Sources:
      <a href="/glassbox/${SOURCE_NAME}"><code>${SOURCE_NAME}</code></a> and
      <a href="/glassbox/cost_model_realism.json"><code>cost_model_realism.json</code></a>, the
      audit that measured the live fills. Related:
      <a href="/tools/execution">Execution Reality Lab</a>,
      <a href="/methodology">methodology</a>.</p>
  </section>
</main>
${renderProductShellFooter()}
</body>
</html>
`;
writeFileSync(resolve(ROOT, "costs.html"), html);
console.log(`  /costs built: ${t.total} categories, ${t.not_charged} not charged, ${t.omissions_that_flatter} flatter`);
