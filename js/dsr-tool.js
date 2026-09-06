import { calculateDsr, checkGoldenVectors, normalCdf, normalPpf } from "./dsr-core.js";
export { calculateDsr, checkGoldenVectors, normalCdf, normalPpf };


const QUERY_KEYS = Object.freeze({
  observed_sharpe_annualized: "sr",
  observations: "n",
  periods_per_year: "ppy",
  skew: "skew",
  non_excess_kurtosis: "kurt",
  effective_independent_trials: "trials",
  cross_trial_sharpe_sd_annualized: "trial_sd",
});

const formatDecimal = (value, digits = 3) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const formatProbability = (value) => `${formatDecimal(value * 100, 2)}%`;

function mount() {
  const configNode = document.querySelector("#dsr-tool-config");
  const form = document.querySelector("#dsr-form");
  if (!configNode || !form) return;
  const config = JSON.parse(configNode.textContent);
  const fields = Object.keys(QUERY_KEYS);
  const nodes = Object.fromEntries(fields.map((name) => [name, form.elements.namedItem(name)]));
  const output = {
    statusLabel: document.querySelector("#dsr-status-label"),
    status: document.querySelector("#dsr-status"),
    value: document.querySelector("#dsr-value"),
    thresholdNote: document.querySelector("#dsr-threshold-note"),
    psr: document.querySelector("#dsr-psr"),
    benchmark: document.querySelector("#dsr-benchmark"),
    haircut: document.querySelector("#dsr-haircut"),
    varianceTerm: document.querySelector("#dsr-variance-term"),
    observedRail: document.querySelector("#dsr-observed-rail"),
    benchmarkRail: document.querySelector("#dsr-benchmark-rail"),
    observedMarker: document.querySelector("#dsr-observed-marker"),
    benchmarkMarker: document.querySelector("#dsr-benchmark-marker"),
    axisMin: document.querySelector("#dsr-axis-min"),
    axisMax: document.querySelector("#dsr-axis-max"),
    chamber: document.querySelector(".dsr-chamber"),
    error: document.querySelector("#dsr-error"),
  };
  let lastResult = null;
  let lastInputs = null;

  function valuesFromForm() {
    return Object.fromEntries(fields.map((name) => [name, Number(nodes[name].value)]));
  }

  function writeUrl(inputs) {
    const url = new URL(window.location.href);
    for (const [name, queryKey] of Object.entries(QUERY_KEYS)) {
      url.searchParams.set(queryKey, String(inputs[name]));
    }
    history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
  }

  function applyQuery() {
    const query = new URLSearchParams(window.location.search);
    for (const [name, queryKey] of Object.entries(QUERY_KEYS)) {
      if (query.has(queryKey)) nodes[name].value = query.get(queryKey);
    }
  }

  function drawRail(inputs, result) {
    const observed = inputs.observed_sharpe_annualized;
    const benchmark = result.expected_max_sharpe_annualized;
    const minimum = Math.min(-0.5, observed, benchmark) - 0.2;
    const maximum = Math.max(2.5, observed, benchmark) + 0.2;
    const position = (value) => 7 + ((value - minimum) / (maximum - minimum)) * 86;
    output.observedMarker.style.left = `${position(observed)}%`;
    output.benchmarkMarker.style.left = `${position(benchmark)}%`;
    output.observedRail.textContent = formatDecimal(observed, 2);
    output.benchmarkRail.textContent = formatDecimal(benchmark, 2);
    output.axisMin.textContent = formatDecimal(minimum, 1);
    output.axisMax.textContent = formatDecimal(maximum, 1);
  }

  function update() {
    const inputs = valuesFromForm();
    for (const node of Object.values(nodes)) node.removeAttribute("aria-invalid");
    try {
      const result = calculateDsr(inputs);
      const threshold = config.contract.policy.full_union_book_maturity_threshold;
      const clearsReference = result.deflated_sharpe_ratio >= threshold;
      output.value.textContent = formatDecimal(result.deflated_sharpe_ratio, 3);
      output.psr.textContent = formatProbability(result.psr_against_zero);
      output.benchmark.textContent = formatDecimal(result.expected_max_sharpe_annualized, 3);
      output.haircut.textContent = formatDecimal(result.search_haircut_annualized, 3);
      output.varianceTerm.textContent = formatDecimal(result.non_normality_variance_term, 4);
      output.statusLabel.textContent = "Book-maturity reference";
      output.status.textContent = clearsReference ? "At or above 0.95" : "Below 0.95";
      output.thresholdNote.textContent = clearsReference
        ? "The supplied inputs clear the reference. This is not an admission or maturity verdict."
        : "The supplied inputs do not clear the full-union book-maturity reference.";
      output.chamber.dataset.reference = clearsReference ? "above" : "below";
      output.error.hidden = true;
      output.error.textContent = "";
      drawRail(inputs, result);
      lastInputs = inputs;
      lastResult = result;
      writeUrl(inputs);
    } catch (error) {
      output.statusLabel.textContent = "Input state";
      output.status.textContent = "Cannot calculate";
      output.value.textContent = "Invalid";
      output.error.hidden = false;
      output.error.textContent = error.message;
      lastInputs = null;
      lastResult = null;
    }
  }

  const vectorFailures = checkGoldenVectors(config.contract.test_vectors);
  if (vectorFailures.length) {
    output.error.hidden = false;
    output.error.textContent = "The browser formula failed its ALPHAC golden-vector check.";
    form.querySelectorAll("input, button").forEach((node) => { node.disabled = true; });
    return;
  }

  applyQuery();
  form.addEventListener("input", update);
  form.addEventListener("submit", (event) => event.preventDefault());

  document.querySelector("#dsr-reset")?.addEventListener("click", () => {
    for (const name of fields) nodes[name].value = config.defaults[name];
    update();
    nodes.observed_sharpe_annualized.focus();
  });

  document.querySelector("#dsr-copy")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(window.location.href);
      button.textContent = "Calculation link copied";
    } catch {
      button.textContent = "Copy unavailable";
    }
    window.setTimeout(() => { button.textContent = "Copy calculation link"; }, 1800);
  });

  document.querySelector("#dsr-export")?.addEventListener("click", () => {
    if (!lastInputs || !lastResult) return;
    const documentPayload = {
      schema: "canli.deflated-sharpe-calculation.v1",
      calculated_at: new Date().toISOString(),
      inputs: lastInputs,
      results: lastResult,
      source_bindings: {
        calculator_contract_content_hash: config.contract.content_hash,
        trial_union_content_hash: config.current_union.source_content_hash,
        trial_union_bytes_sha256: config.current_union.source_bytes_sha256,
      },
      claim_boundary: config.contract.claim_boundary,
    };
    const blob = new Blob([`${JSON.stringify(documentPayload, null, 2)}\n`], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "deflated-sharpe-calculation.json";
    link.click();
    URL.revokeObjectURL(href);
  });

  update();
}

if (typeof document !== "undefined") mount();
