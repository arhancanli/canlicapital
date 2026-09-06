import { pboCscv } from "./pbo-core.js";
export { pboCscv };

const formatDecimal = (value, digits = 4) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const formatPercent = (value) => `${formatDecimal(value * 100, 1)}%`;

export function parseMatrix(text) {
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(",").map((cell) => Number(cell.trim())));
  if (rows.length === 0) throw new RangeError("Paste at least one row of returns");
  const width = rows[0].length;
  rows.forEach((row, i) => {
    if (row.length !== width) throw new RangeError(`Row ${i + 1} has ${row.length} values, row 1 has ${width}`);
    row.forEach((value) => {
      if (!Number.isFinite(value)) throw new RangeError(`Row ${i + 1} contains a value that is not a number`);
    });
  });
  return rows;
}

// Mirrors api/v1/validate/overfitting.js compute(), so a browser result and an
// API result on the same matrix describe the outcome the same way.
export function summarize(result, seed) {
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const degraded = result.is_oos_pairs.filter(([inSample, outSample]) => outSample < inSample).length
    / result.is_oos_pairs.length;
  const sampler = result.exhaustive
    ? "all combinations enumerated in lexicographic order"
    : `${result.n_combinations} combinations drawn without replacement by mulberry32(seed=${seed}); ` +
      "the Python reference draws with numpy, so estimates agree within sampling noise, not bit for bit";
  return {
    meanIsSharpe: mean(result.is_oos_pairs.map((pair) => pair[0])),
    meanOosSharpe: mean(result.is_oos_pairs.map((pair) => pair[1])),
    degraded,
    sampler,
    plainReading:
      `In ${(result.pbo * 100).toFixed(1)} percent of the ${result.n_combinations} in-sample and ` +
      "out-of-sample splits, the variant that looked best in sample ranked in the worse half out of " +
      "sample. That share is the probability of backtest overfitting for this matrix as submitted.",
  };
}

function mount() {
  const configNode = document.querySelector("#pbo-tool-config");
  const matrixField = document.querySelector("#pbo-matrix");
  if (!configNode || !matrixField) return;
  const config = JSON.parse(configNode.textContent);

  const nodes = {
    splits: document.querySelector("#pbo-splits"),
    maxCombinations: document.querySelector("#pbo-max-combinations"),
    seed: document.querySelector("#pbo-seed"),
  };
  const output = {
    value: document.querySelector("#pbo-value"),
    combinations: document.querySelector("#pbo-combinations"),
    sampler: document.querySelector("#pbo-sampler"),
    blockLength: document.querySelector("#pbo-block-length"),
    meanIs: document.querySelector("#pbo-mean-is"),
    meanOos: document.querySelector("#pbo-mean-oos"),
    degraded: document.querySelector("#pbo-degraded"),
    verdict: document.querySelector("#pbo-verdict"),
    warning: document.querySelector("#pbo-warning"),
  };

  let lastRun = null;

  function run() {
    output.warning.hidden = true;
    output.warning.textContent = "";
    try {
      const matrix = parseMatrix(matrixField.value);
      const nSplits = Number(nodes.splits.value);
      const maxCombinations = Number(nodes.maxCombinations.value);
      const seed = Number(nodes.seed.value);
      const result = pboCscv(matrix, { nSplits, maxCombinations, seed });
      const summary = summarize(result, seed);

      output.value.textContent = formatPercent(result.pbo);
      output.combinations.textContent = `${result.n_combinations.toLocaleString("en-US")} (${result.exhaustive ? "exhaustive" : "sampled"})`;
      output.sampler.textContent = summary.sampler;
      output.blockLength.textContent = `${result.block_length} rows`;
      output.meanIs.textContent = formatDecimal(summary.meanIsSharpe);
      output.meanOos.textContent = formatDecimal(summary.meanOosSharpe);
      output.degraded.textContent = formatPercent(summary.degraded);
      output.verdict.textContent = summary.plainReading;
      output.verdict.dataset.state = result.pbo >= 0.5 ? "fail" : "pass";

      lastRun = {
        inputs: { matrix, n_splits: nSplits, max_combinations: maxCombinations, seed },
        result,
        summary,
      };
    } catch (error) {
      output.verdict.dataset.state = "idle";
      output.verdict.textContent = "Fix the input below and run again.";
      output.warning.hidden = false;
      output.warning.textContent = error.message;
      lastRun = null;
    }
  }

  document.querySelector("#pbo-run")?.addEventListener("click", run);

  document.querySelector("#pbo-reset")?.addEventListener("click", () => {
    matrixField.value = config.worked_example.matrix_csv;
    nodes.splits.value = config.defaults.n_splits;
    nodes.maxCombinations.value = config.defaults.max_combinations;
    nodes.seed.value = config.defaults.seed;
    run();
  });

  document.querySelector("#pbo-export")?.addEventListener("click", () => {
    if (!lastRun) return;
    const documentPayload = {
      schema: "canli.backtest-overfitting-calculation.v1",
      calculated_at: new Date().toISOString(),
      inputs: lastRun.inputs,
      results: {
        pbo: lastRun.result.pbo,
        n_combinations: lastRun.result.n_combinations,
        exhaustive: lastRun.result.exhaustive,
        block_length: lastRun.result.block_length,
        mean_is_sharpe_of_selected: lastRun.summary.meanIsSharpe,
        mean_oos_sharpe_of_selected: lastRun.summary.meanOosSharpe,
        share_oos_below_is: lastRun.summary.degraded,
      },
      source_bindings: { calculator_contract_content_hash: config.contract.content_hash },
      claim_boundary: config.contract.claim_boundary,
    };
    const blob = new Blob([`${JSON.stringify(documentPayload, null, 2)}\n`], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "backtest-overfitting-calculation.json";
    link.click();
    URL.revokeObjectURL(href);
  });

  run();
}

if (typeof document !== "undefined") mount();
