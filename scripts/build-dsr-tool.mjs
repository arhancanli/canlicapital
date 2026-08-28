// Build /tools/deflated-sharpe from the ALPHAC formula contract and live trial union.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GLASSBOX = resolve(ROOT, "public", "glassbox");
const CONTRACT_NAME = "deflated_sharpe_calculator_contract.json";
const LEDGER_NAME = "trial_ledger.json";
const CONTRACT_PATH = resolve(GLASSBOX, CONTRACT_NAME);
const LEDGER_PATH = resolve(GLASSBOX, LEDGER_NAME);
const ORIGIN = "https://canlicapital.com";
const ALPHAC_COMMIT = "9b92f5128acfdabbc9c3160348004c5b3eba6f05";
const ALPHAC_ROOT = `https://github.com/arhancanli/alphac/blob/${ALPHAC_COMMIT}`;
const CONTRACT_BYTES_SHA256 =
  "sha256:bd709eca441119fa71e15ce03d0c917950e07d7f1f5068238e3c600d507533d8";
const CONTRACT_CONTENT_HASH =
  "sha256:241f33d627cecb876d5cd0cb0b9d48f18e20d55d921437ec2926d4603f92d349";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const bytesHash = (path) =>
  `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;

function assertSources(contract, ledger) {
  if (
    contract.schema !== "canli.alphac-deflated-sharpe-calculator-contract.v1" ||
    contract.status !== "REFERENCE_IMPLEMENTATION_CONTRACT" ||
    contract.content_hash !== CONTRACT_CONTENT_HASH ||
    bytesHash(CONTRACT_PATH) !== CONTRACT_BYTES_SHA256
  ) {
    throw new Error("DSR tool: ALPHAC formula contract is absent, unsupported or hash-invalid");
  }
  if (
    contract.current_policy.per_sleeve_dsr !== "mandatory_measurement_not_a_universal_gate" ||
    contract.current_policy.full_union_book_maturity_threshold !== 0.95 ||
    contract.selection_accounting.trial_unit !== "complete_union_hypothesis_identities"
  ) {
    throw new Error("DSR tool: policy context drifted from the reviewed contract");
  }
  if (
    !/^sha256:[0-9a-f]{64}$/.test(ledger.content_hash || "") ||
    ledger.selection_statistics.unit !== "first_immutable_record_per_hypothesis" ||
    ledger.selection_statistics.n_hypotheses !== ledger.distinct_hypothesis_identities ||
    ledger.selection_statistics.n_hypotheses < 2 ||
    ledger.selection_statistics.sharpe_variance < 0
  ) {
    throw new Error("DSR tool: current trial union is incomplete or hash-invalid");
  }
  if (contract.test_vectors.length < 3) {
    throw new Error("DSR tool: fewer than three production golden vectors are published");
  }
}

function field({ id, label, value, min, max, step, note }) {
  return `<label class="dsr-field" for="${id}">
    <span>${escapeHtml(label)}</span>
    <input id="${id}" name="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" inputmode="decimal" />
    <small>${escapeHtml(note)}</small>
  </label>`;
}

function main() {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
  const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
  assertSources(contract, ledger);

  const selection = ledger.selection_statistics;
  const defaultPpy = 365;
  const trialSdAnnualized = Math.sqrt(selection.sharpe_variance * defaultPpy);
  const threshold = contract.current_policy.full_union_book_maturity_threshold;
  const reference = contract.references[0];
  const contractShort = contract.content_hash.replace("sha256:", "").slice(0, 16);
  const ledgerBytes = bytesHash(LEDGER_PATH);
  const ledgerShort = ledgerBytes.replace("sha256:", "").slice(0, 16);
  const description =
    "Calculate Probabilistic and Deflated Sharpe ratios while exposing trial count, dispersion, " +
    "sample length and non-normal return assumptions behind each result.";
  const defaults = {
    observed_sharpe_annualized: 1.5,
    observations: 730,
    periods_per_year: defaultPpy,
    skew: -0.5,
    non_excess_kurtosis: 5,
    effective_independent_trials: selection.n_hypotheses,
    cross_trial_sharpe_sd_annualized: trialSdAnnualized,
  };
  const clientConfig = {
    schema: "canli.dsr-tool-client-config.v1",
    defaults,
    current_union: {
      n_hypotheses: selection.n_hypotheses,
      sharpe_variance_per_period: selection.sharpe_variance,
      generated_at: ledger.generated_at,
      source_content_hash: ledger.content_hash,
      source_bytes_sha256: ledgerBytes,
    },
    contract: {
      content_hash: contract.content_hash,
      claim_boundary: contract.claim_boundary,
      policy: contract.current_policy,
      selection_warning: contract.selection_accounting.warning,
      test_vectors: contract.test_vectors,
    },
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Deflated Sharpe selection pressure calculator",
    url: `${ORIGIN}/tools/deflated-sharpe`,
    description,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any modern web browser",
    author: { "@id": `${ORIGIN}/#arhan-canli` },
    creator: { "@id": `${ORIGIN}/#arhan-canli` },
    isAccessibleForFree: true,
    citation: reference.url,
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Deflated Sharpe calculator | Canli Capital</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${ORIGIN}/tools/deflated-sharpe" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${CONTRACT_NAME} ${LEDGER_NAME}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="Deflated Sharpe selection pressure calculator" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${ORIGIN}/tools/deflated-sharpe" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Deflated Sharpe selection pressure calculator" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=optional" />
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=optional" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=optional" /></noscript>
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/dsr-tool.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="dsr-page">
<a class="dsr-skip" href="#calculator">Skip to calculator</a>
${renderProductShellHeader({ active: "methodology" })}
<main>
  <section class="dsr-hero" aria-labelledby="dsr-title">
    <div class="dsr-hero__copy">
      <p class="dsr-kicker"><span>Open research instrument</span><span>Contract v${escapeHtml(contract.version)}</span></p>
      <h1 id="dsr-title">How much Sharpe survives the search?</h1>
      <p class="dsr-hero__lead">A strong backtest is less surprising after a long search. Put the observed Sharpe, return shape and complete selection process on the same surface. The calculator reproduces ALPHAC's per-period PSR and DSR formulas in your browser.</p>
      <div class="dsr-hero__actions">
        <a class="dsr-button dsr-button--primary" href="#calculator">Open the pressure chamber</a>
        <a class="dsr-button" href="${ALPHAC_ROOT}/${contract.source_bindings.implementation.path}" rel="noreferrer">Inspect the Python source <span aria-hidden="true">↗</span></a>
      </div>
    </div>
    <aside class="dsr-union" aria-label="Current ALPHAC trial accounting preset">
      <div class="dsr-union__head"><span>Current union preset</span><strong>Source-bound</strong></div>
      <dl>
        <div><dt>Hypothesis identities</dt><dd>${selection.n_hypotheses}</dd></div>
        <div><dt>Per-period V[SR]</dt><dd>${selection.sharpe_variance.toPrecision(7)}</dd></div>
        <div><dt>Selection unit</dt><dd>First immutable record</dd></div>
        <div><dt>Claim status</dt><dd>Accounting, not performance</dd></div>
      </dl>
      <p>${escapeHtml(ledger.claim_boundary)}</p>
    </aside>
  </section>

  <section class="dsr-boundary" aria-label="Calculator claim boundary">
    <span>Illustrative calculation</span>
    <p>The current-union preset supplies only trial count and dispersion. The observed Sharpe, sample length, skew and kurtosis are illustrative until you replace them. No output on this page is an ALPHAC performance claim or an admission verdict.</p>
  </section>

  <section class="dsr-workbench" id="calculator" aria-labelledby="calculator-title">
    <header class="dsr-section-head">
      <div><p class="dsr-label">Selection pressure chamber</p><h2 id="calculator-title">One result. The whole search behind it.</h2></div>
      <div class="dsr-workbench__tools">
        <button type="button" id="dsr-reset">Restore sourced preset</button>
        <button type="button" id="dsr-copy">Copy calculation link</button>
        <button type="button" id="dsr-export">Export JSON</button>
      </div>
    </header>

    <div class="dsr-console">
      <form class="dsr-controls" id="dsr-form">
        <fieldset>
          <legend><span>Observed sample</span><small>Illustrative until replaced</small></legend>
          ${field({ id: "observed_sharpe_annualized", label: "Observed Sharpe, annualized", value: defaults.observed_sharpe_annualized, min: -10, max: 10, step: 0.01, note: "Converted to per-period Sharpe before inference." })}
          ${field({ id: "observations", label: "Return observations", value: defaults.observations, min: 2, max: 1000000, step: 1, note: "Use the count after dropping missing returns." })}
          ${field({ id: "periods_per_year", label: "Periods per year", value: defaults.periods_per_year, min: 1, max: 10000, step: 1, note: "365 for daily crypto; 252 for trading days." })}
          ${field({ id: "skew", label: "Sample skew", value: defaults.skew, min: -20, max: 20, step: 0.01, note: "Negative skew can widen estimator uncertainty." })}
          ${field({ id: "non_excess_kurtosis", label: "Non-excess kurtosis", value: defaults.non_excess_kurtosis, min: 1, max: 100, step: 0.01, note: "Gaussian returns equal 3, not 0." })}
        </fieldset>
        <fieldset class="dsr-controls__selection">
          <legend><span>Selection process</span><small>Preset from the public union</small></legend>
          ${field({ id: "effective_independent_trials", label: "Effective independent trials", value: defaults.effective_independent_trials, min: 2, max: 10000000, step: 1, note: "Do not shrink N after seeing outcomes." })}
          ${field({ id: "cross_trial_sharpe_sd_annualized", label: "Cross-trial Sharpe SD, annualized", value: trialSdAnnualized.toFixed(6), min: 0, max: 10, step: 0.000001, note: "Derived from the identity-aligned per-period V[SR]." })}
          <div class="dsr-selection-seal">
            <span>Published union context</span>
            <strong>${selection.n_hypotheses} identities</strong>
            <code>${ledgerShort}...</code>
            <p>${escapeHtml(contract.selection_accounting.warning)}</p>
          </div>
        </fieldset>
      </form>

      <section class="dsr-chamber" aria-live="polite" aria-atomic="true">
        <div class="dsr-chamber__status"><span id="dsr-status-label">Calculating</span><strong id="dsr-status">Pending</strong></div>
        <div class="dsr-score">
          <span>Deflated Sharpe ratio</span>
          <strong id="dsr-value">...</strong>
          <small id="dsr-threshold-note">Against the expected best result under the supplied search.</small>
        </div>
        <div class="dsr-rail" id="dsr-rail" role="img" aria-label="Observed Sharpe and expected best-by-luck benchmark on an annualized Sharpe scale">
          <div class="dsr-rail__grid" aria-hidden="true"></div>
          <div class="dsr-marker dsr-marker--observed" id="dsr-observed-marker"><span>Observed</span><strong id="dsr-observed-rail">...</strong></div>
          <div class="dsr-marker dsr-marker--benchmark" id="dsr-benchmark-marker"><span>Best by luck</span><strong id="dsr-benchmark-rail">...</strong></div>
          <div class="dsr-rail__axis"><span id="dsr-axis-min">...</span><span>Annualized Sharpe</span><span id="dsr-axis-max">...</span></div>
        </div>
        <dl class="dsr-readout">
          <div><dt>PSR against zero</dt><dd id="dsr-psr">...</dd><small>Sampling uncertainty only</small></div>
          <div><dt>Best-by-luck benchmark</dt><dd id="dsr-benchmark">...</dd><small>Annualized for display</small></div>
          <div><dt>Search haircut</dt><dd id="dsr-haircut">...</dd><small>Observed minus benchmark</small></div>
          <div><dt>Non-normality term</dt><dd id="dsr-variance-term">...</dd><small>Must remain positive</small></div>
        </dl>
        <p class="dsr-error" id="dsr-error" role="alert" hidden></p>
      </section>
    </div>
  </section>

  <section class="dsr-explain" aria-labelledby="explain-title">
    <header class="dsr-section-head"><div><p class="dsr-label">Read the result</p><h2 id="explain-title">PSR asks about the sample. DSR asks about the search.</h2></div></header>
    <div class="dsr-explain__grid">
      <article><span>PSR</span><h3>Was the observed Sharpe above a benchmark?</h3><p>Probabilistic Sharpe Ratio adjusts for sample length, skew and non-excess kurtosis. The zero-benchmark result does not know how many alternatives were tried.</p></article>
      <article><span>SR*</span><h3>What would the best null trial look like?</h3><p>The expected maximum rises with the number of effectively independent trials and their cross-trial Sharpe dispersion.</p></article>
      <article><span>DSR</span><h3>Did the result clear the search-adjusted benchmark?</h3><p>DSR is PSR evaluated against SR*. It is one diagnostic inside a larger research contract, never proof that a strategy is deployable.</p></article>
    </div>
    <div class="dsr-formula" aria-label="Deflated Sharpe formula">
      <span>Implemented formula</span>
      <code>${escapeHtml(contract.formula.psr)}</code>
      <code>${escapeHtml(contract.formula.expected_max_sharpe)}</code>
      <p>${escapeHtml(contract.periodicity.observed_conversion)}. ${escapeHtml(contract.periodicity.dispersion_conversion)}.</p>
    </div>
  </section>

  <section class="dsr-policy" aria-labelledby="policy-title">
    <div><p class="dsr-label">Current ALPHAC policy</p><h2 id="policy-title">A probability is not a promotion decision.</h2></div>
    <div class="dsr-policy__body">
      <p>Under ${escapeHtml(contract.current_policy.admission_schema)}, per-sleeve DSR is mandatory to measure and publish, but it is not a universal sleeve gate. Incremental admission is not decided by DSR alone.</p>
      <p>The ${threshold} reference applies to a full-union portfolio-maturity claim. Clearing it inside this calculator does not clear robustness, execution, stress, capacity, bootstrap-improvement or trial-accounting requirements.</p>
      <a href="/methodology#deflated-sharpe">Read the complete policy context</a>
    </div>
  </section>

  <section class="dsr-source" aria-labelledby="source-title">
    <div><p class="dsr-label">Reproduce and inspect</p><h2 id="source-title">The interface is downstream of the evidence.</h2></div>
    <div class="dsr-source__ledger">
      <a href="/glassbox/${CONTRACT_NAME}"><span>Formula contract</span><strong>${contractShort}...</strong><small>Golden vectors and policy boundary</small></a>
      <a href="/glassbox/${LEDGER_NAME}"><span>Trial union</span><strong>${ledgerShort}...</strong><small>Current N and identity-aligned V[SR]</small></a>
      <a href="${ALPHAC_ROOT}/${contract.source_bindings.implementation.path}" rel="noreferrer"><span>Python implementation</span><strong>${contract.source_bindings.implementation.sha256.replace("sha256:", "").slice(0, 16)}...</strong><small>Production arithmetic in ALPHAC</small></a>
      <a href="${reference.url}" rel="noreferrer"><span>Primary paper</span><strong>Bailey and López de Prado</strong><small>${escapeHtml(reference.publication)}</small></a>
    </div>
    <p class="dsr-source__boundary">${escapeHtml(contract.claim_boundary)}</p>
  </section>
</main>
${renderProductShellFooter()}
<script type="application/json" id="dsr-tool-config">${JSON.stringify(clientConfig).replaceAll("<", "\\u003c")}</script>
<script type="module" src="/js/dsr-tool.js"></script>
</body>
</html>
`;

  const outputDir = resolve(ROOT, "tools");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "deflated-sharpe.html"), html);
  console.log(
    `rendered /tools/deflated-sharpe: N=${selection.n_hypotheses}, ` +
      `V[SR]=${selection.sharpe_variance}, contract=${contractShort}`,
  );
}

main();
