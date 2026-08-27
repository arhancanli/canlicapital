// =============================================================================
// build-selection-risk.mjs
// -----------------------------------------------------------------------------
// Builds /tools/selection-risk and the contract it renders from.
//
// The contract is emitted here rather than hand-written so the page types no
// numbers: every parameter a reader sees (bar count, annualisation, the gate, the
// generator's own settings) is read back out of a hash-bound artifact, and
// audit-published-numbers can trace it like any other published figure.
// =============================================================================

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const SOURCE_NAME = "selection_risk_lab_contract.json";
const CONTRACT_PATH = resolve(ROOT, "public", "glassbox", SOURCE_NAME);
const OUT = resolve(ROOT, "tools", "selection-risk.html");

const esc = (v) =>
  String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

function buildContract() {
  const payload = {
    schema: "canli.alphac-selection-risk-lab-contract.v1",
    status: "EDUCATIONAL_INSTRUMENT_NOT_RESEARCH_EVIDENCE",
    author: "Arhan Canli",
    published_on: "2026-08-27",
    claim_boundary:
      "A teaching instrument. It runs on a synthetic series with no edge, spends no research " +
      "hypothesis, writes to no ledger, and produces no ALPHAC performance claim. Nothing a " +
      "visitor generates here is evidence about any strategy.",
    why_synthetic: {
      rights:
        "config/data_source_rights_policy.json records every market-data source this project " +
        "uses as prohibited or withheld for raw redistribution, with a project default of do " +
        "not bundle raw third-party rows. Shipping real bars into a browser is not available.",
      proof:
        "On real data a visitor can always argue the edge they found was genuine. On a " +
        "driftless random walk the true Sharpe is zero by construction, so every good result " +
        "is provably luck. The demonstration is stronger for it, not weaker.",
    },
    generator: {
      process: "driftless geometric random walk",
      bars: 750,
      per_bar_volatility: 0.011,
      drift: 0,
      true_sharpe: 0,
      deterministic: "mulberry32 seeded; the same seed reproduces the same series anywhere",
    },
    execution: {
      rule: "decide at the close of bar t, hold from the open of bar t+1 to the open of bar t+2",
      matches_engine: "the same no-lookahead contract the ALPHAC backtester enforces",
      rechecked_every_run: true,
    },
    statistics: {
      periods_per_year: 252,
      deflation_implementation: "js/dsr-tool.js, golden-vector tested against the Python source",
      kurtosis_convention: "non_excess",
      deployment_gate_dsr: 0.95,
      trial_unit: "one distinct parameter set evaluated by this visitor, on this series",
    },
    defaults: { seed: 20260827, fast: 10, slow: 50, cost_bps: 2 },
    // The sweep's grid, declared here so the button can state its true size. The
    // first version of the button said "1,000 settings" and evaluated 820, which is
    // a small overstatement on a page whose whole subject is counting honestly.
    sweep_grid: {
      fast_from: 2, fast_to: 24, fast_step: 1,
      slow_offset: 2, slow_to: 120, slow_step: 3,
      combinations: (() => {
        let n = 0;
        for (let fast = 2; fast <= 24; fast += 1) {
          for (let slow = fast + 2; slow <= 120; slow += 3) n += 1;
        }
        return n;
      })(),
    },
    sandbox_safety: [
      "every input is stored in the URL, so a scenario is shareable and reproducible",
      "no write path to any ledger, artifact, broker or published record exists",
      "results are labelled USER_GENERATED_SCENARIO_NOT_RESEARCH_EVIDENCE",
    ],
  };
  payload.content_hash = `sha256:${createHash("sha256").update(canonical(payload)).digest("hex")}`;
  mkdirSync(dirname(CONTRACT_PATH), { recursive: true });
  writeFileSync(CONTRACT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

function assertContract(c) {
  const body = { ...c };
  delete body.content_hash;
  const observed = `sha256:${createHash("sha256").update(canonical(body)).digest("hex")}`;
  if (observed !== c.content_hash) throw new Error("selection-risk: contract hash does not reproduce");
  if (c.generator.drift !== 0 || c.generator.true_sharpe !== 0) {
    throw new Error(
      "selection-risk: the generator must be driftless. The entire lesson is that any edge found " +
        "is luck, and a drifting series would make that false.",
    );
  }
  // The button states this number, so it has to be the number the sweep actually
  // evaluates, not a round one.
  let counted = 0;
  for (let fast = c.sweep_grid.fast_from; fast <= c.sweep_grid.fast_to; fast += c.sweep_grid.fast_step) {
    for (let slow = fast + c.sweep_grid.slow_offset; slow <= c.sweep_grid.slow_to; slow += c.sweep_grid.slow_step) {
      counted += 1;
    }
  }
  if (counted !== c.sweep_grid.combinations) {
    throw new Error(`selection-risk: grid declares ${c.sweep_grid.combinations} settings but spans ${counted}`);
  }
  if (c.status !== "EDUCATIONAL_INSTRUMENT_NOT_RESEARCH_EVIDENCE") {
    throw new Error("selection-risk: the instrument's status may not be promoted");
  }
}

function main() {
  const c = buildContract();
  assertContract(c);
  const g = c.generator;
  const s = c.statistics;
  const d = c.defaults;

  const description =
    "Search a series that provably has no edge, and watch what your best result is worth once " +
    "the search is counted against it.";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Selection Risk Lab",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any modern browser",
    url: `${ORIGIN}/tools/selection-risk`,
    description,
    author: { "@id": `${ORIGIN}/#arhan-canli` },
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  const num = (id, label, value, min, max, step, note) => `<label class="lab-field" for="${id}">
    <span class="lab-field__label">${esc(label)}</span>
    <input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" inputmode="numeric" />
    <span class="lab-field__note">${esc(note)}</span>
  </label>`;

  const html = `<!doctype html>
<html lang="en" data-page="selection-risk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Selection Risk Lab | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}/tools/selection-risk" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${SOURCE_NAME}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="Selection Risk Lab" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}/tools/selection-risk" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Selection Risk Lab" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/lab.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="lab-page">
<a class="lab-skip" href="#lab">Skip to the lab</a>
${renderProductShellHeader({ active: "" })}
<main>
  <section class="lab-hero" aria-labelledby="lab-title">
    <p class="lab-kicker"><span>Open research instrument</span><span>Educational, not evidence</span></p>
    <h1 id="lab-title">Find an edge that is not there.</h1>
    <p class="lab-lead">The series below is a driftless random walk. Its true Sharpe ratio is
      <strong>${g.true_sharpe}</strong>, by construction, and no setting of any control can change
      that. Search it anyway. The lab counts every parameter set you try and deflates your best
      result against your own search, so you can watch a good-looking number turn into what it
      actually is.</p>
    <p class="lab-boundary"><strong>What this is.</strong> ${esc(c.claim_boundary)}</p>
  </section>

  <section class="lab-lab" id="lab" aria-labelledby="lab-lab-title">
    <h2 id="lab-lab-title" class="lab-visually-hidden">The lab</h2>
    <div class="lab-controls">
      ${num("lab-seed", "Series seed", d.seed, 1, 999999, 1, `${g.bars} bars, ${g.process}`)}
      ${num("lab-fast", "Fast window", d.fast, 2, 60, 1, "bars in the fast average")}
      ${num("lab-slow", "Slow window", d.slow, 3, 200, 1, "bars in the slow average")}
      ${num("lab-cost", "Cost", d.cost_bps, 0, 100, 1, "basis points per unit of turnover")}
      <div class="lab-actions">
        <button type="button" id="lab-sweep" class="lab-button lab-button--primary" data-grid="${c.sweep_grid.combinations}">Search ${c.sweep_grid.combinations.toLocaleString("en-US")} settings</button>
        <button type="button" id="lab-new-series" class="lab-button">New series</button>
        <button type="button" id="lab-reset-ledger" class="lab-button">Reset trial ledger</button>
      </div>
      <p class="lab-warning" id="lab-warning" role="alert" hidden></p>
    </div>

    <div class="lab-output">
      <div class="lab-chart-wrap">
        <svg id="lab-chart" viewBox="0 0 760 260" preserveAspectRatio="none" role="img">
          <path id="lab-base" class="lab-chart__base" d="" />
          <path id="lab-path" class="lab-chart__line" d="" />
        </svg>
        <p class="lab-causal" id="lab-causal" data-ok="true"></p>
      </div>
      <dl class="lab-stats">
        <div><dt>Annualised Sharpe</dt><dd id="lab-sharpe">0</dd></div>
        <div><dt>Max drawdown</dt><dd id="lab-drawdown">0</dd></div>
        <div><dt>Total return</dt><dd id="lab-total">0</dd></div>
        <div><dt>Trades</dt><dd id="lab-trades">0</dd></div>
      </dl>
    </div>

    <div class="lab-ledger">
      <h3>Your trial ledger</h3>
      <dl>
        <div><dt>Distinct settings evaluated</dt><dd id="lab-trials">0</dd></div>
        <div><dt>Best annualised Sharpe found</dt><dd id="lab-best">0</dd></div>
        <div><dt>Sharpe luck alone would find</dt><dd id="lab-luckbar">n/a</dd></div>
        <div><dt>Deflated Sharpe of your best</dt><dd id="lab-dsr">n/a</dd></div>
      </dl>
      <p class="lab-bestparams">Best found at <span id="lab-bestparams">nothing yet</span></p>
      <p class="lab-verdict" id="lab-verdict" data-state="idle">Move a control to record your first trial.</p>
    </div>
  </section>

  <section class="lab-notes" aria-labelledby="lab-notes-title">
    <h2 id="lab-notes-title">How it works, and why it is synthetic</h2>
    <div class="lab-notes__grid">
      <article>
        <h3>The execution rule is the engine's</h3>
        <p>${esc(c.execution.rule)}. ${esc(c.execution.matches_engine)}. The property is re-checked
          on every run and reported under the chart, rather than asserted once in prose.</p>
      </article>
      <article>
        <h3>Why not real prices</h3>
        <p>${esc(c.why_synthetic.rights)}</p>
        <p>${esc(c.why_synthetic.proof)}</p>
      </article>
      <article>
        <h3>What the deflation uses</h3>
        <p>Your trial count is the number of distinct settings you have evaluated on this series.
          The dispersion is measured across your own results, not assumed. The arithmetic is
          <a href="/tools/deflated-sharpe">the same calculator</a> published elsewhere on this site,
          ${esc(s.deflation_implementation)}, on the ${esc(s.kurtosis_convention)} kurtosis
          convention, annualised at ${s.periods_per_year} periods.</p>
      </article>
      <article>
        <h3>The gate</h3>
        <p>ALPHAC admits a full-union book at a deflated ratio of ${s.deployment_gate_dsr}. That is
          the bar your scenario is read against here. Reaching it on a series with no edge is a
          false positive, and the instrument is built to let you produce one and then see it named.</p>
      </article>
    </div>
    <p class="lab-safety"><strong>Sandbox contract.</strong> ${c.sandbox_safety.map(esc).join(". ")}.</p>
    <p class="lab-source">Rendered from
      <a href="/glassbox/${SOURCE_NAME}"><code>${SOURCE_NAME}</code></a>, whose content hash the
      build reproduces before this page is written. Further reading:
      <a href="/notes/deflating-a-sharpe-ratio">the arithmetic of not fooling yourself</a>, and
      <a href="/tools/breadth">the Breadth Lab</a>, which shows the other ceiling this book runs
      into.</p>
  </section>
</main>
${renderProductShellFooter()}
<script type="module" src="/js/selection-risk-lab.js"></script>
</body>
</html>
`;
  writeFileSync(OUT, html);
  console.log(`  /tools/selection-risk built; contract ${c.content_hash.slice(0, 23)}`);
}

main();
