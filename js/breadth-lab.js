// =============================================================================
// breadth-lab.js  ->  /tools/breadth
//
// The argument is the CEILING line on the chart. Everything else is a control for
// moving it. A reader who leaves knowing that s/sqrt(rho) does not contain N has
// got the whole thing.
// =============================================================================

import { bookSharpe, breadthCeiling, breadthCurve, ceilingCaptured, sleevesRequired } from "./breadth-core.js";

const MAX_SLEEVES = 60;
const $ = (id) => document.getElementById(id);
const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "unbounded");

function readControls() {
  return {
    sleeveSharpe: Number($("lab-sharpe").value),
    correlation: Number($("lab-rho").value),
    sleeves: Math.round(Number($("lab-n").value)),
    target: Number($("lab-target").value),
  };
}

function writeUrl(c) {
  const url = new URL(window.location.href);
  url.searchParams.set("s", c.sleeveSharpe);
  url.searchParams.set("rho", c.correlation);
  url.searchParams.set("n", c.sleeves);
  url.searchParams.set("target", c.target);
  window.history.replaceState(null, "", url);
}

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  const set = (id, key) => {
    const v = p.get(key);
    if (v !== null && v !== "" && Number.isFinite(Number(v))) $(id).value = v;
  };
  set("lab-sharpe", "s"); set("lab-rho", "rho"); set("lab-n", "n"); set("lab-target", "target");
}

function draw(points, ceiling, target, sleeves) {
  const W = 760;
  const H = 260;
  if (!points.length) return;
  const values = points.map((p) => p.sharpe);
  // The ceiling has to be on the chart or the chart is not making the argument.
  const top = Math.max(...values, Number.isFinite(ceiling) ? ceiling : 0, target) * 1.08;
  const x = (n) => ((n - 1) / Math.max(1, MAX_SLEEVES - 1)) * W;
  const y = (v) => H - (v / top) * (H - 14) - 7;

  $("lab-curve").setAttribute(
    "d",
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.sleeves).toFixed(1)} ${y(p.sharpe).toFixed(1)}`).join(""),
  );
  const ceilingLine = $("lab-ceiling");
  if (Number.isFinite(ceiling) && ceiling <= top) {
    ceilingLine.setAttribute("d", `M0 ${y(ceiling).toFixed(1)}L${W} ${y(ceiling).toFixed(1)}`);
    ceilingLine.style.display = "";
  } else {
    ceilingLine.style.display = "none";
  }
  $("lab-target-line").setAttribute("d", `M0 ${y(target).toFixed(1)}L${W} ${y(target).toFixed(1)}`);
  const here = points.find((p) => p.sleeves === sleeves);
  const marker = $("lab-marker");
  if (here) {
    marker.setAttribute("cx", x(here.sleeves).toFixed(1));
    marker.setAttribute("cy", y(here.sharpe).toFixed(1));
    marker.style.display = "";
  } else {
    marker.style.display = "none";
  }
}

function render() {
  const c = readControls();
  writeUrl(c);
  const warn = $("lab-warning");

  let book;
  try {
    book = bookSharpe(c);
  } catch (error) {
    warn.textContent = error.message;
    warn.hidden = false;
    $("lab-book").textContent = "n/a";
    $("lab-verdict").textContent = "Fix the correlation before reading anything else here.";
    $("lab-verdict").dataset.state = "idle";
    return;
  }
  warn.hidden = true;

  const ceiling = breadthCeiling(c);
  const captured = ceilingCaptured(c);
  const need = sleevesRequired({ ...c, maxSleeves: 500 });

  $("lab-book").textContent = fmt(book, 3);
  $("lab-ceiling-value").textContent = fmt(ceiling, 3);
  $("lab-captured").textContent = captured === null ? "no ceiling" : `${(captured * 100).toFixed(1)}%`;
  $("lab-required").textContent = need.reachable
    ? `${need.sleeves} sleeve${need.sleeves === 1 ? "" : "s"}`
    : "unreachable";

  draw(breadthCurve({ ...c, maxSleeves: MAX_SLEEVES }), ceiling, c.target, c.sleeves);

  const verdict = $("lab-verdict");
  if (!need.reachable) {
    verdict.dataset.state = "fail";
    verdict.textContent =
      `At a shared correlation of ${c.correlation}, a book of sleeves each worth ${c.sleeveSharpe} ` +
      `cannot exceed ${fmt(ceiling, 3)} however many you add. Your target of ${c.target} is above ` +
      `that ceiling, so it is not a question of building more sleeves: no number of them reaches it. ` +
      `The only lever left is the correlation itself.`;
  } else if (need.sleeves > c.sleeves) {
    verdict.dataset.state = "work";
    verdict.textContent =
      `${c.sleeves} sleeves give ${fmt(book, 3)}. Reaching ${c.target} needs ${need.sleeves}, and ` +
      `the ceiling at this correlation is ${fmt(ceiling, 3)}, so the target is reachable but the ` +
      `margin is ${fmt(ceiling - c.target, 3)}.`;
  } else {
    verdict.dataset.state = "pass";
    verdict.textContent =
      `${c.sleeves} sleeves already give ${fmt(book, 3)}, at or above the target of ${c.target}. ` +
      `The ceiling at this correlation is ${fmt(ceiling, 3)}.`;
  }
}

function wire() {
  readUrl();
  for (const id of ["lab-sharpe", "lab-rho", "lab-n", "lab-target"]) {
    $(id).addEventListener("input", render);
  }
  for (const button of document.querySelectorAll("[data-preset]")) {
    button.addEventListener("click", () => {
      const preset = JSON.parse(button.dataset.preset);
      $("lab-sharpe").value = preset.s;
      $("lab-rho").value = preset.rho;
      $("lab-n").value = preset.n;
      $("lab-target").value = preset.target;
      render();
    });
  }
  render();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
}
