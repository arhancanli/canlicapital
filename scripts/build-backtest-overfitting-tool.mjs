// =============================================================================
// build-backtest-overfitting-tool.mjs  ->  /tools/backtest-overfitting
// -----------------------------------------------------------------------------
// Publishes a browser calculator for the probability of backtest overfitting
// (Combinatorially Symmetric Cross-Validation), the query nobody could find on
// this site: "probability of backtest overfitting", "backtest overfitting
// calculator". js/pbo-core.js already implements CSCV fully client-side (it is
// the SAME core the validation API's /api/v1/validate/overfitting route
// imports), so this generator only had to give it a page.
//
// The worked example is not typed. It is the published production golden
// vector "exhaustive_8x4_70combos" from standards/validation-api/vectors.json,
// and its result is COMPUTED HERE by calling the real pboCscv() function, then
// asserted against that vector's declared expected output before the page is
// written. If the browser core ever drifted from the golden vector, this build
// would fail rather than publish a wrong worked example.
// =============================================================================

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson as canonical } from "./canonical-json.mjs";
import { pboCscv } from "../js/pbo-core.js";
import { LIMITS } from "../api/_lib/limits.js";
import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const VECTORS_PATH = resolve(ROOT, "standards/validation-api/vectors.json");
const WORKED_EXAMPLE_ID = "exhaustive_8x4_70combos";
const OUT = resolve(ROOT, "tools", "backtest-overfitting.html");
const CONTRACT_NAME = "backtest_overfitting_calculator_contract.json";

const esc = (v) =>
  String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function loadWorkedExample() {
  const vectors = JSON.parse(readFileSync(VECTORS_PATH, "utf8"));
  const vector = vectors.pbo.find((v) => v.id === WORKED_EXAMPLE_ID);
  if (!vector) throw new Error(`backtest-overfitting: no published golden vector "${WORKED_EXAMPLE_ID}"`);
  const observed = pboCscv(vector.matrix, {
    nSplits: vector.n_splits,
    maxCombinations: vector.max_combinations,
    seed: vector.seed,
  });
  if (
    observed.exhaustive !== vector.exhaustive ||
    observed.n_combinations !== vector.expected.n_combinations ||
    Math.abs(observed.pbo - vector.expected.pbo) > 1e-9
  ) {
    throw new Error(
      `backtest-overfitting: pboCscv on golden vector "${WORKED_EXAMPLE_ID}" does not reproduce the ` +
      `published expectation (got pbo=${observed.pbo}, n_combinations=${observed.n_combinations})`,
    );
  }
  return { vector, observed };
}

function buildContract(workedExample) {
  const { vector, observed } = workedExample;
  const payload = {
    schema: "canli.alphac-backtest-overfitting-calculator-contract.v1",
    status: "REFERENCE_IMPLEMENTATION_CONTRACT",
    author: "Arhan Canli",
    published_on: "2026-09-06",
    claim_boundary:
      "This runs the production Combinatorially Symmetric Cross-Validation implementation on " +
      "whatever variant returns you submit. It does not know where your matrix came from, cannot " +
      "detect lookahead in how it was built, and a low probability of overfitting is not proof a " +
      "strategy is deployable. It is one diagnostic about whether an in-sample ranking predicts an " +
      "out-of-sample one, nothing more.",
    method: {
      name: "Combinatorially Symmetric Cross-Validation (CSCV)",
      reference: {
        authors: "Bailey, Borwein, Lopez de Prado and Zhu",
        year: 2017,
        title: "The Probability of Backtest Overfitting",
        publication: "Journal of Computational Finance 20(4), 39 to 69",
      },
      question:
        "Given many configurations evaluated on the same sample, does the one that ranks best " +
        "in-sample also rank well out-of-sample, across every symmetric way of splitting the " +
        "sample in half?",
      steps: [
        "Split the T rows into S contiguous equal blocks (S even). Drop any remainder rows so " +
        "every block has exactly T div S rows.",
        "For each way of choosing S/2 blocks as in-sample, form the in-sample matrix from those " +
        "blocks and the out-of-sample matrix from the rest.",
        "Take the in-sample winner: the configuration with the highest in-sample Sharpe.",
        "Find that same configuration's rank among all configurations out-of-sample, ascending, " +
        "and take the logit of its relative rank.",
        "PBO is the fraction of splits where the in-sample winner lands in the worse half " +
        "out-of-sample.",
      ],
    },
    implementation: {
      path: "js/pbo-core.js",
      matches_engine:
        "a line-for-line port of alphaforge.validation.pbo.pbo_cscv, the same core the validation " +
        "API's POST /api/v1/validate/overfitting route imports, so a browser result and an API " +
        "result on the same matrix agree",
      exhaustive_rule:
        "when C(n_splits, n_splits / 2) is at most the combinations ceiling, every split is " +
        "enumerated and the result is bit-comparable to the Python reference. Above that ceiling, " +
        "n_splits / 2 sized subsets are sampled without replacement by this repo's mulberry32 " +
        "generator, and the result is reported as exhaustive: false, agreeing with the Python " +
        "reference within sampling noise rather than bit for bit.",
    },
    defaults: {
      n_splits: 16,
      max_combinations: LIMITS.max_cscv_combinations,
      seed: 42,
    },
    worked_example: {
      vector_id: vector.id,
      source: "standards/validation-api/vectors.json, the golden-vector corpus the validation API is tested against",
      n_splits: vector.n_splits,
      max_combinations: vector.max_combinations,
      seed: vector.seed,
      n_rows: vector.matrix.length,
      n_configs: vector.matrix[0].length,
      matrix: vector.matrix,
      computed: {
        pbo: observed.pbo,
        n_combinations: observed.n_combinations,
        exhaustive: observed.exhaustive,
        block_length: observed.block_length,
      },
    },
    sandbox_safety: [
      "the matrix and parameters you enter never leave your browser; nothing is uploaded",
      "no write path to any ledger, artifact, broker or published record exists",
      "export downloads a JSON receipt of exactly what you entered and what it computed",
    ],
  };
  payload.content_hash = `sha256:${createHash("sha256").update(canonical(payload)).digest("hex")}`;
  const target = resolve(ROOT, "public/glassbox", CONTRACT_NAME);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

function field(id, label, value, min, max, step, note) {
  return `<label class="lab-field" for="${id}">
    <span class="lab-field__label">${esc(label)}</span>
    <input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" inputmode="numeric" />
    <span class="lab-field__note">${esc(note)}</span>
  </label>`;
}

function main() {
  const workedExample = loadWorkedExample();
  const contract = buildContract(workedExample);
  const w = contract.worked_example;
  const d = contract.defaults;

  const queryTitle = "Probability of backtest overfitting calculator";
  const description =
    "Calculate the probability of backtest overfitting (CSCV) from your own in-sample and " +
    "out-of-sample variant returns, the same method the validation API runs on.";

  const matrixCsv = w.matrix.map((row) => row.join(", ")).join("\n");
  const clientConfig = {
    schema: "canli.backtest-overfitting-tool-client-config.v1",
    defaults: { n_splits: w.n_splits, max_combinations: w.max_combinations, seed: w.seed },
    worked_example: { vector_id: w.vector_id, matrix_csv: matrixCsv, computed: w.computed },
    contract: {
      content_hash: contract.content_hash,
      claim_boundary: contract.claim_boundary,
      recommended_defaults: contract.defaults,
    },
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: queryTitle,
    url: `${ORIGIN}/tools/backtest-overfitting`,
    description,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any modern web browser",
    author: { "@id": `${ORIGIN}/#arhan-canli` },
    creator: { "@id": `${ORIGIN}/#arhan-canli` },
    isAccessibleForFree: true,
    citation: "https://doi.org/10.21314/JCF.2016.322",
  };

  const html = `<!doctype html>
<html lang="en" data-page="backtest-overfitting">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(queryTitle)} | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}/tools/backtest-overfitting" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${CONTRACT_NAME}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="${esc(queryTitle)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}/tools/backtest-overfitting" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(queryTitle)}" />
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
    <p class="lab-kicker"><span>Open research instrument</span><span>Reference implementation</span></p>
    <h1 id="lab-title">${esc(queryTitle)}</h1>
    <p class="lab-lead">A deflated Sharpe ratio asks whether one result survives the search that
      produced it. This asks a sharper question: across every configuration you tried, does the one
      that ranked best on your in-sample data also rank well out of sample, or did it just win a
      popularity contest against the noise in that one split? Paste a matrix of per-period returns,
      one column per configuration, and it runs Combinatorially Symmetric Cross-Validation (CSCV)
      entirely in your browser.</p>
    <p class="lab-boundary"><strong>What this is.</strong> ${esc(contract.claim_boundary)}</p>
  </section>

  <section class="lab-lab" id="lab" aria-labelledby="lab-lab-title">
    <h2 id="lab-lab-title" class="lab-visually-hidden">The calculator</h2>
    <div class="lab-controls">
      <label class="lab-field" for="pbo-matrix">
        <span class="lab-field__label">Return matrix, one row per period, one column per configuration</span>
        <textarea id="pbo-matrix" rows="12" spellcheck="false">${esc(matrixCsv)}</textarea>
        <span class="lab-field__note">Comma-separated. Loaded with the published golden vector "${esc(w.vector_id)}" (${w.n_rows} rows, ${w.n_configs} configurations).</span>
      </label>
      ${field("pbo-splits", "Blocks to split into", w.n_splits, 2, 64, 2, `must be even; matches the loaded example, recommended default is ${d.n_splits}`)}
      ${field("pbo-max-combinations", "Combinations ceiling", w.max_combinations, 2, LIMITS.max_cscv_combinations, 1, `above C(splits, splits/2) it samples instead of enumerating; the free API caps this at ${LIMITS.max_cscv_combinations}`)}
      ${field("pbo-seed", "Sample seed", w.seed, 1, 999999, 1, "only used once sampling replaces enumeration")}
      <div class="lab-actions">
        <button type="button" id="pbo-run" class="lab-button lab-button--primary">Run CSCV</button>
        <button type="button" id="pbo-reset" class="lab-button">Restore published example</button>
        <button type="button" id="pbo-export" class="lab-button">Export JSON</button>
      </div>
      <p class="lab-warning" id="pbo-warning" role="alert" hidden></p>
    </div>

    <div class="lab-output">
      <dl class="lab-stats">
        <div><dt>Probability of backtest overfitting</dt><dd id="pbo-value">...</dd></div>
        <div><dt>Splits evaluated</dt><dd id="pbo-combinations">...</dd></div>
        <div><dt>Sampler</dt><dd id="pbo-sampler">...</dd></div>
        <div><dt>Block length</dt><dd id="pbo-block-length">...</dd></div>
      </dl>
      <dl class="lab-stats">
        <div><dt>Mean in-sample Sharpe of the winner</dt><dd id="pbo-mean-is">...</dd></div>
        <div><dt>Mean out-of-sample Sharpe of the winner</dt><dd id="pbo-mean-oos">...</dd></div>
        <div><dt>Share of splits where it degraded out of sample</dt><dd id="pbo-degraded">...</dd></div>
      </dl>
    </div>

    <div class="lab-ledger">
      <h3>Plain reading</h3>
      <p class="lab-verdict" id="pbo-verdict" data-state="idle">Run CSCV to see the plain-language reading of the result above.</p>
    </div>
  </section>

  <section class="lab-notes" aria-labelledby="lab-notes-title">
    <h2 id="lab-notes-title">What CSCV does, step by step</h2>
    <div class="lab-notes__grid">
      ${contract.method.steps.map((step, i) => `<article><h3>Step ${i + 1}</h3><p>${esc(step)}</p></article>`).join("\n      ")}
    </div>
    <p class="lab-safety"><strong>Same core as the API.</strong> ${esc(contract.implementation.matches_engine)}.
      ${esc(contract.implementation.exhaustive_rule)}</p>
    <p class="lab-safety"><strong>Sandbox contract.</strong> ${contract.sandbox_safety.map(esc).join(". ")}.</p>
    <p class="lab-source">Rendered from
      <a href="/glassbox/${CONTRACT_NAME}"><code>${CONTRACT_NAME}</code></a>, whose worked example is
      computed at build time from the published golden vector and checked against the production
      expectation before this page is written. Reference:
      ${esc(contract.method.reference.authors)} (${contract.method.reference.year}),
      <em>${esc(contract.method.reference.title)}</em>, ${esc(contract.method.reference.publication)}.
      Run the same matrix through <a href="/developers#api-overfitting">the validation API</a>, read
      the arithmetic behind the search in
      <a href="/notes/deflating-a-sharpe-ratio">the arithmetic of not fooling yourself</a>, or check
      one Sharpe at a time with <a href="/tools/deflated-sharpe">the deflated Sharpe calculator</a>.</p>
  </section>
</main>
${renderProductShellFooter()}
<script type="application/json" id="pbo-tool-config">${JSON.stringify(clientConfig).replaceAll("<", "\\u003c")}</script>
<script type="module" src="/js/backtest-overfitting-tool.js"></script>
</body>
</html>
`;

  const outputDir = resolve(ROOT, "tools");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(OUT, html);
  console.log(
    `  /tools/backtest-overfitting built; contract ${contract.content_hash.slice(0, 23)}; ` +
    `worked example pbo=${w.computed.pbo.toFixed(4)} over ${w.computed.n_combinations} splits`,
  );
}

main();
