// =============================================================================
// build-execution.mjs  ->  /tools/execution
// Publishes the Execution Reality Lab and the contract it renders from.
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
const SOURCE_NAME = "execution_lab_contract.json";
const OUT = resolve(ROOT, "tools", "execution.html");

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

const contract = {
  schema: "canli.alphac-execution-lab-contract.v1",
  status: "EDUCATIONAL_INSTRUMENT_NOT_RESEARCH_EVIDENCE",
  author: "Arhan Canli",
  published_on: "2026-08-27",
  claim_boundary:
    "A synthetic demonstration of how execution assumptions behave. It spends no research " +
    "hypothesis, writes to no ledger, and produces no ALPHAC performance claim.",
  method: {
    series: "driftless geometric random walk with an overnight gap, 750 bars",
    gap_volatility: 0.004,
    gap_rationale:
      "Without a gap the next open IS the decision close, so the single most important " +
      "comparison on this page collapses to a tie that looks like a finding. The core refuses " +
      "a series with no gap rather than reporting one.",
    strategy: "a fixed moving-average crossover, identical across every variant",
    comparability:
      "Every variant prices the SAME decision bars. A delayed variant needs an extra bar of " +
      "runway, so left to itself it would price one fewer decision and its Sharpe would be " +
      "computed over a different sample.",
  },
  classification: {
    rule:
      "Each assumption is measured ALONE against the honest baseline across many independent " +
      "series. |t| below 2 is indistinguishable from no effect; a worse-share at or above 98 " +
      "percent is a cost; anything else is a re-timing.",
    why_isolated:
      "Measured cumulatively, market impact inherits the delay's variance and is misclassified " +
      "as a re-timing when it is a pure cost.",
    kinds: {
      COST: "reduces the result on essentially every series; small variance, enormous t",
      RE_TIMING: "changes WHICH prices you get; hurts on average, sign per series close to a coin flip",
      INDISTINGUISHABLE: "no systematic effect on a series with no edge",
    },
  },
  defaults: { fast: 14, slow: 34, spread_bps: 5, delay_bars: 1, impact_bps: 8, outage_rate: 0.05, seeds: 200 },
  // A sharper test than the t-statistic, measured over 300 series per setting.
  // A COST scales with its parameter: double the basis points, double the damage.
  // A RE-TIMING does not, because it is not paying for anything. These are the
  // observed numbers, not an illustration.
  parameter_scaling: {
    method: "each control varied alone, 300 independent series per setting, mean change in annualised Sharpe",
    cost_example: {
      control: "spread_bps",
      readings: [{ setting: 5, mean: -0.0326 }, { setting: 10, mean: -0.0652 }],
      note: "doubles when the parameter doubles, which is what paying for something looks like",
    },
    re_timing_example: {
      control: "delay_bars",
      readings: [
        { setting: 1, mean: -0.0184, t: -1.9 },
        { setting: 2, mean: -0.0362, t: -2.9 },
        { setting: 3, mean: -0.0286, t: -2.0 },
        { setting: 5, mean: -0.0112, t: -0.6 },
      ],
      note: "does not scale, and peaks in the middle. A longer delay is not a bigger cost, it is a different bet.",
    },
  },
  sandbox_safety: [
    "every input is stored in the URL, so a scenario is shareable and reproducible",
    "no write path to any ledger, artifact, broker or published record exists",
    "outputs describe a synthetic series, never an ALPHAC result",
  ],
};
contract.content_hash = `sha256:${createHash("sha256").update(canonical(contract)).digest("hex")}`;
mkdirSync(resolve(ROOT, "public/glassbox"), { recursive: true });
writeFileSync(resolve(ROOT, "public/glassbox", SOURCE_NAME), `${JSON.stringify(contract, null, 2)}\n`);

const d = contract.defaults;
const field = (id, label, value, min, max, step, note) => `<label class="lab-field" for="${id}">
    <span class="lab-field__label">${esc(label)}</span>
    <input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" inputmode="decimal" />
    <span class="lab-field__note">${esc(note)}</span>
  </label>`;

const description =
  "The same strategy priced under six execution assumptions, and a measurement of which of them " +
  "are costs and which are re-timings.";

const html = `<!doctype html>
<html lang="en" data-page="execution">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Execution Reality Lab | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}/tools/execution" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${SOURCE_NAME}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="Execution Reality Lab" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}/tools/execution" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Execution Reality Lab" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/lab.css" />
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Execution Reality Lab",
  applicationCategory: "EducationalApplication", operatingSystem: "Any modern browser",
  url: `${ORIGIN}/tools/execution`, description, author: { "@id": `${ORIGIN}/#arhan-canli` },
  isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
})}</script>
</head>
<body class="lab-page">
<a class="lab-skip" href="#lab">Skip to the lab</a>
${renderProductShellHeader({ active: "" })}
<main>
  <section class="lab-hero" aria-labelledby="lab-title">
    <p class="lab-kicker"><span>Open research instrument</span><span>Educational, not evidence</span></p>
    <h1 id="lab-title">Not every execution assumption is a cost.</h1>
    <p class="lab-lead">A backtest that subtracts a number for slippage has assumed every execution
      assumption behaves the same way. They do not. Some reduce the result on
      <strong>every single series</strong>. Others change <em>which</em> prices you get, hurt on
      average, and flip sign often enough that a fixed haircut misstates them. On one equity chart
      the two look identical, which is why this page measures each one alone across many
      independent series.</p>
    <p class="lab-boundary"><strong>What this is.</strong> ${esc(contract.claim_boundary)}</p>
  </section>

  <section class="lab-lab" id="lab">
    <div class="lab-controls">
      ${field("lab-fast", "Fast window", d.fast, 2, 60, 1, "bars in the fast average")}
      ${field("lab-slow", "Slow window", d.slow, 3, 200, 1, "bars in the slow average")}
      ${field("lab-spread", "Spread and fees", d.spread_bps, 0, 100, 1, "basis points per unit of turnover")}
      ${field("lab-delay", "Decision-to-fill delay", d.delay_bars, 0, 5, 1, "bars between deciding and filling")}
      ${field("lab-impact", "Market impact", d.impact_bps, 0, 100, 1, "basis points per unit of turnover")}
      ${field("lab-outage", "Outage rate", d.outage_rate, 0, 1, 0.01, "share of NEEDED rebalances that fail")}
      ${field("lab-seeds", "Series to measure", d.seeds, 20, 500, 10, "independent series in the sweep")}
      <div class="lab-actions"><button type="button" id="lab-rerun" class="lab-button lab-button--primary">Re-run the sweep</button></div>
      <p class="lab-warning" id="lab-warning" role="alert" hidden></p>
    </div>

    <div class="lab-output">
      <div class="lab-chart-wrap">
        <svg id="lab-chart" viewBox="0 0 760 260" preserveAspectRatio="none" role="img" aria-label="Equity curves under stacked execution assumptions">
          <g id="lab-curves"></g>
        </svg>
        <p class="lab-causal">one series, assumptions stacked: brightest is the honest next-open fill, fading as each is added</p>
      </div>
      <dl class="lab-stats">
        <div><dt>Honest baseline</dt><dd id="lab-baseline">0</dd></div>
        <div><dt>Fully realistic</dt><dd id="lab-realistic">0</dd></div>
        <div><dt>Sharpe lost</dt><dd id="lab-lost">0</dd></div>
        <div><dt>Share of the baseline</dt><dd id="lab-lostpct">0</dd></div>
      </dl>
    </div>

    <div class="lab-ledger">
      <h3>What each assumption actually is</h3>
      <p class="lab-verdict" id="lab-verdict" data-state="idle">Measuring.</p>
    </div>
  </section>

  <section class="lab-notes" aria-labelledby="lab-notes-title">
    <h2 id="lab-notes-title">Each assumption, measured alone</h2>
    <p class="lab-safety">Mean change in annualised Sharpe against the honest baseline, each
      assumption applied by itself, across the sweep. ${esc(contract.classification.rule)}</p>
    <table class="lab-table">
      <thead><tr><th>Assumption, in isolation</th><th>Mean effect</th><th>t</th><th>Worse</th><th>Verdict</th></tr></thead>
      <tbody id="lab-classification"></tbody>
    </table>
    <div class="lab-notes__grid">
      <article><h3>Why isolated, not stacked</h3><p>${esc(contract.classification.why_isolated)}</p></article>
      <article><h3>Why the series has a gap</h3><p>${esc(contract.method.gap_rationale)}</p></article>
      <article><h3>Why the samples match</h3><p>${esc(contract.method.comparability)}</p></article>
      <article><h3>The sharper test</h3><p>A cost scales with its parameter: doubling the spread
        from ${contract.parameter_scaling.cost_example.readings[0].setting} to
        ${contract.parameter_scaling.cost_example.readings[1].setting} basis points moves the mean
        effect from ${contract.parameter_scaling.cost_example.readings[0].mean} to
        ${contract.parameter_scaling.cost_example.readings[1].mean}, almost exactly double. A
        re-timing does not, because it is not paying for anything: the delay's effect
        <em>peaks in the middle</em> at ${contract.parameter_scaling.re_timing_example.readings[1].setting}
        bars and is weakest at ${contract.parameter_scaling.re_timing_example.readings[3].setting}.
        A longer delay is not a bigger cost. It is a different bet.</p></article>
      <article><h3>The uncomfortable row</h3><p>Filling at the price you decided from is the classic
        defect, and on a series with no edge it is indistinguishable from no effect at all. Its
        damage is proportional to how predictive your signal really is, which is the thing the
        backtest was meant to establish. You cannot bound the bug without already knowing the
        answer.</p></article>
    </div>
    <p class="lab-safety"><strong>Sandbox contract.</strong> ${contract.sandbox_safety.map(esc).join(". ")}.</p>
    <p class="lab-source">Rendered from <a href="/glassbox/${SOURCE_NAME}"><code>${SOURCE_NAME}</code></a>.
      Related: <a href="/tools/selection-risk">the Selection Risk Lab</a> and
      <a href="/tools/breadth">the Breadth Lab</a>.</p>
  </section>
</main>
${renderProductShellFooter()}
<script type="module" src="/js/execution-lab.js"></script>
</body>
</html>
`;
writeFileSync(OUT, html);
console.log(`  /tools/execution built; contract ${contract.content_hash.slice(0, 23)}`);
