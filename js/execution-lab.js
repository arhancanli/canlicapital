// =============================================================================
// execution-lab.js  ->  /tools/execution
//
// Two panels, and the second is the argument. The curves show what stacking
// assumptions does to one series, which is intuition. The table measures each
// assumption ALONE across many independent series, which is evidence, and it is
// the only way to tell a cost from a re-timing: on any single chart they look
// identical.
// =============================================================================

import { VARIANTS, classify, compareVariants, generateSeries, sweepSeeds } from "./execution-core.js";

const BARS = 750;
const GAP = 0.004;
const $ = (id) => document.getElementById(id);
const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");

const VERDICT_TEXT = {
  COST: "a cost: it reduces the result on essentially every series",
  RE_TIMING: "a re-timing: it hurts on average, but its sign on any one series is close to a coin flip",
  INDISTINGUISHABLE: "indistinguishable from no effect at all on a series with no edge",
};

function readControls() {
  return {
    fast: Math.round(Number($("lab-fast").value)),
    slow: Math.round(Number($("lab-slow").value)),
    settings: {
      spreadBps: Number($("lab-spread").value),
      delayBars: Math.round(Number($("lab-delay").value)),
      impactBps: Number($("lab-impact").value),
      outageRate: Number($("lab-outage").value),
    },
    seeds: Math.round(Number($("lab-seeds").value)),
  };
}

function writeUrl(c) {
  const url = new URL(window.location.href);
  const p = { fast: c.fast, slow: c.slow, spread: c.settings.spreadBps, delay: c.settings.delayBars,
    impact: c.settings.impactBps, outage: c.settings.outageRate, seeds: c.seeds };
  for (const [k, v] of Object.entries(p)) url.searchParams.set(k, String(v));
  window.history.replaceState(null, "", url);
}

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  const set = (id, key) => {
    const v = p.get(key);
    if (v !== null && v !== "" && Number.isFinite(Number(v))) $(id).value = v;
  };
  set("lab-fast", "fast"); set("lab-slow", "slow"); set("lab-spread", "spread");
  set("lab-delay", "delay"); set("lab-impact", "impact"); set("lab-outage", "outage");
  set("lab-seeds", "seeds");
}

function drawCurves(rows) {
  const W = 760;
  const H = 260;
  const all = rows.flatMap((r) => r.result.curve);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const n = rows[0].result.curve.length;
  const x = (i) => (i / (n - 1)) * W;
  const y = (v) => H - ((v - min) / span) * (H - 16) - 8;
  const group = $("lab-curves");
  group.innerHTML = "";
  rows.forEach((r, i) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", r.result.curve.map((v, k) => `${k === 0 ? "M" : "L"}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join(""));
    path.setAttribute("class", r.honest ? "lab-chart__line" : "lab-chart__ceiling");
    // The honest baseline is drawn solid and bright; the stacked variants fade as
    // assumptions accumulate, so the drift downward is legible without a legend.
    path.setAttribute("style", `opacity:${r.honest ? 1 - i * 0.11 : 0.85}`);
    group.appendChild(path);
  });
}

function render() {
  const c = readControls();
  const warn = $("lab-warning");
  if (c.fast >= c.slow) {
    warn.textContent = "The fast window has to be shorter than the slow one.";
    warn.hidden = false;
    return;
  }
  warn.hidden = true;
  writeUrl(c);

  // Panel one: one series, assumptions stacked.
  const series = generateSeries({ seed: 31337, bars: BARS, gapVolatility: GAP });
  const compared = compareVariants({ series, fast: c.fast, slow: c.slow, outageSeed: 31337 });
  drawCurves(compared.rows);
  $("lab-baseline").textContent = fmt(compared.executionGap.baselineSharpe, 3);
  $("lab-realistic").textContent = fmt(compared.executionGap.realisticSharpe, 3);
  $("lab-lost").textContent = fmt(compared.executionGap.sharpeLost, 3);
  $("lab-lostpct").textContent =
    compared.executionGap.fractionLost === null ? "n/a" : `${(compared.executionGap.fractionLost * 100).toFixed(0)}%`;

  // Panel two: each assumption alone, across many series.
  const rows = sweepSeeds({
    seeds: c.seeds, bars: BARS, gapVolatility: GAP, fast: c.fast, slow: c.slow, settings: c.settings,
  });
  const body = $("lab-classification");
  body.innerHTML = "";
  for (const r of rows) {
    const verdict = classify(r);
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<th scope="row">${r.label}</th>` +
      `<td>${r.mean.toFixed(4)}</td>` +
      `<td>${r.t.toFixed(1)}</td>` +
      `<td>${(r.worseShare * 100).toFixed(0)}%</td>` +
      `<td><span class="lab-verdict-pill" data-verdict="${verdict}">${verdict.replace("_", " ").toLowerCase()}</span></td>`;
    body.appendChild(tr);
  }

  const costs = rows.filter((r) => classify(r) === "COST");
  const others = rows.filter((r) => classify(r) !== "COST");
  // A row sitting just under the threshold is not evidence of no effect; it is a
  // sweep without the power to resolve one. Saying so is more useful than picking
  // a seed count that happens to produce a tidier table, and it is the same
  // mistake in miniature that the whole site is about.
  const underpowered = rows.filter((r) => Math.abs(r.t) >= 1 && Math.abs(r.t) < 2);
  const verdict = $("lab-verdict");
  verdict.dataset.state = costs.length ? "fail" : "idle";
  verdict.textContent =
    `Across ${c.seeds} independent series, ${costs.length} of these ${rows.length} assumptions ` +
    `${costs.length === 1 ? "is" : "are"} ${VERDICT_TEXT.COST}` +
    `${costs.length ? ` (${costs.map((r) => r.label.replace(" alone", "")).join(", ")})` : ""}. ` +
    `The other ${others.length} ${others.length === 1 ? "is" : "are"} not, and subtracting a single ` +
    `slippage number for them would misstate both their size and, on any one series, their sign. ` +
    `That is the difference this page exists to show, and no single equity chart can show it.` +
    (underpowered.length
      ? ` Note that ${underpowered.map((r) => r.label.replace(" alone", "")).join(" and ")} ` +
        `${underpowered.length === 1 ? "sits" : "sit"} just under the threshold at this sample size ` +
        `(|t| below 2). That is a sweep without the power to resolve the effect, not evidence there ` +
        `is none. Raise the number of series and watch it settle.`
      : "");
}

function wire() {
  readUrl();
  for (const id of ["lab-fast", "lab-slow", "lab-spread", "lab-delay", "lab-impact", "lab-outage", "lab-seeds"]) {
    $(id).addEventListener("change", render);
  }
  $("lab-rerun").addEventListener("click", render);
  render();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
}
