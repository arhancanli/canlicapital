const byId = (id) => document.getElementById(id);

const percent = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "always",
});
const correlationFormat = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
  signDisplay: "always",
});
const integer = new Intl.NumberFormat("en-GB");
const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
const fullDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

function formatPercent(value, absolute = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Not available";
  const formatted = percent.format(absolute ? Math.abs(number) : number);
  return `${formatted.replace("-", "−").replace(/^\+/, absolute ? "" : "+")}%`;
}

function formatDecimalPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Not available";
  return `${Math.abs(number * 100).toFixed(2)}%`;
}

function humanizeStatus(value) {
  return String(value || "Not available")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function setClaimText(elementId, claim, value) {
  const element = byId(elementId);
  if (!element) return;
  element.textContent = value;
  element.dataset.claimId = claim.id;
  element.dataset.claimMaturity = claim.maturity;
  element.title = `${claim.label}. ${claim.description}`;
}

function hydrateClaimContract(payload) {
  const claims = new Map((payload?.claims || []).map((claim) => [claim.id, claim]));
  const get = (id) => {
    const claim = claims.get(id);
    if (!claim) throw new Error(`Missing public claim ${id}`);
    return claim;
  };

  const capitalKind = get("forward.capital-kind");
  const firstMark = get("forward.first-mark");
  const observations = get("forward.return-observations");
  const internalGrade = get("validation.internal-grade");
  const brokerSleeves = get("broker.reconciled-alpaca-sleeves");
  const brokerPasses = get("broker.reconciliation-passes");
  const brokerPositions = get("broker.open-positions");
  const brokerOrders = get("broker.open-orders");
  const forwardSharpe = get("objective.forward-sharpe");
  const drawdownObjective = get("objective.expected-max-drawdown");
  const expectedDrawdown = get("model.expected-max-drawdown");
  const p95Drawdown = get("model.p95-max-drawdown");
  const currentSleeves = get("sleeves.current");
  const targetSleeves = get("sleeves.target");
  const correlation = get("diversification.average-pairwise-correlation");

  setClaimText(
    "hero-record-basis",
    capitalKind,
    capitalKind.value === "PAPER_ONLY" ? "Observed paper" : humanizeStatus(capitalKind.value),
  );
  setClaimText(
    "hero-broker-execution",
    brokerSleeves,
    `${integer.format(Number(brokerSleeves.value))} Alpaca paper sleeves`,
  );
  const paperStart = new Date(`${firstMark.value}T00:00:00Z`);
  setClaimText(
    "hero-paper-since",
    firstMark,
    Number.isNaN(paperStart.valueOf()) ? "Date unavailable" : `Since ${fullDate.format(paperStart)}`,
  );
  setClaimText("hero-grade", internalGrade, `Self-grade ${internalGrade.value}`);
  setClaimText("metric-grade", internalGrade, internalGrade.value);
  setClaimText("evidence-observations", observations, integer.format(Number(observations.value)));
  setClaimText(
    "evidence-accounts",
    brokerSleeves,
    `${integer.format(Number(brokerSleeves.value))} / paper`,
  );
  setClaimText(
    "evidence-positions",
    brokerPositions,
    `${integer.format(Number(brokerPositions.value))} / ${integer.format(Number(brokerOrders.value))}`,
  );
  setClaimText(
    "evidence-status",
    brokerPasses,
    brokerPasses.value === true ? "Broker pass" : "Broker check open",
  );
  setClaimText("objective-forward-sharpe", forwardSharpe, Number(forwardSharpe.value).toFixed(2));
  setClaimText("objective-max-drawdown", drawdownObjective, formatDecimalPercent(drawdownObjective.value));
  setClaimText("model-expected-drawdown", expectedDrawdown, formatDecimalPercent(expectedDrawdown.value));
  setClaimText("model-p95-drawdown", p95Drawdown, formatDecimalPercent(p95Drawdown.value));
  setClaimText("current-sleeve-count", currentSleeves, integer.format(Number(currentSleeves.value)));
  setClaimText("target-sleeve-count", targetSleeves, integer.format(Number(targetSleeves.value)));
  setClaimText("correlation-reading", correlation, correlationFormat.format(Number(correlation.value)));

  const header = document.querySelector(".header-status");
  header.dataset.status = brokerPasses.value === true ? "pass" : "fail";
  setClaimText(
    "header-broker-status",
    brokerPasses,
    brokerPasses.value === true
      ? `${integer.format(Number(brokerSleeves.value))} Alpaca paper accounts reconciled`
      : "Broker reconciliation is fail-closed",
  );
}

function curveStatistics(curve) {
  if (!Array.isArray(curve) || curve.length < 2) return null;
  const values = curve.map((point) => Number(point.equity)).filter(Number.isFinite);
  if (values.length < 2 || values[0] === 0) return null;

  let high = values[0];
  let maxDrawdown = 0;
  const returns = [];
  values.forEach((value, index) => {
    high = Math.max(high, value);
    maxDrawdown = Math.min(maxDrawdown, value / high - 1);
    if (index > 0 && values[index - 1] !== 0) {
      returns.push(value / values[index - 1] - 1);
    }
  });
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.length > 1
    ? returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (returns.length - 1)
    : 0;
  return {
    returnPercent: (values.at(-1) / values[0] - 1) * 100,
    drawdownPercent: maxDrawdown * 100,
    annualizedVolatilityPercent: Math.sqrt(variance) * Math.sqrt(365) * 100,
  };
}

function renderCurve(algorithm, { updateUrl = true } = {}) {
  const curve = algorithm?.live_curve;
  const path = byId("equity-path");
  const area = byId("equity-area");
  const node = byId("equity-node");
  if (!Array.isArray(curve) || curve.length < 2 || !path || !area || !node) return;

  const width = 760;
  const height = 320;
  const insetX = 18;
  const insetY = 28;
  const values = curve.map((point) => Number(point.equity));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, Math.abs(maximum) * 0.001, 1);
  const points = values.map((value, index) => {
    const x = insetX + (index / (values.length - 1)) * (width - (insetX * 2));
    const y = insetY + ((maximum - value) / range) * (height - (insetY * 2));
    return [x, y];
  });
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const [lastX, lastY] = points.at(-1);
  path.setAttribute("d", line);
  area.setAttribute(
    "d",
    `${line} L${lastX.toFixed(2)} ${(height - insetY).toFixed(2)} L${points[0][0].toFixed(2)} ${(height - insetY).toFixed(2)} Z`,
  );
  node.setAttribute("cx", lastX.toFixed(2));
  node.setAttribute("cy", lastY.toFixed(2));

  const stats = curveStatistics(curve);
  if (stats) {
    byId("metric-live-return").textContent = formatPercent(stats.returnPercent);
    byId("metric-live-drawdown").textContent = formatPercent(stats.drawdownPercent);
    byId("metric-live-vol").textContent = formatPercent(stats.annualizedVolatilityPercent, true);
    document.querySelector(".live-console")?.toggleAttribute("data-positive", stats.returnPercent >= 0);
  }

  const first = new Date(curve[0].date);
  const last = new Date(curve.at(-1).date);
  byId("chart-start").textContent = shortDate.format(first);
  byId("chart-end").textContent = shortDate.format(last);
  byId("chart-title").textContent = `${algorithm.name} paper equity curve`;
  byId("chart-description").textContent = `${algorithm.name} has ${curve.length} published paper equity marks from ${shortDate.format(first)} through ${shortDate.format(last)}.`;

  document.querySelectorAll("[data-curve-key]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.curveKey === algorithm.key));
  });
  if (updateUrl) {
    const url = new URL(window.location.href);
    if (algorithm.key === "alphac") url.searchParams.delete("curve");
    else url.searchParams.set("curve", algorithm.key);
    window.history.replaceState(null, "", url);
  }
}

function hydrateBroker(broker) {
  const summary = broker?.summary || {};
  const sleeves = broker?.sleeves || {};
  const passed = summary.passes === true;
  const reconciled = Number(summary.reconciled_alpaca_sleeves || 0);
  const positions = Number(summary.open_positions || 0);
  const orders = Number(summary.open_orders || 0);
  byId("console-broker").textContent = passed
    ? `${reconciled} dedicated accounts · PASS`
    : "Reconciliation check open";
  byId("console-book").textContent = `${integer.format(positions)} positions · ${integer.format(orders)} orders`;

  Object.entries(sleeves).forEach(([key, sleeve]) => {
    const target = byId(`sleeve-${key}-state`);
    if (!target) return;
    if (!sleeve.passes) {
      target.textContent = "Latest reconciliation open";
      target.previousElementSibling?.classList.add("state-pill--open");
      return;
    }
    target.textContent = `${compactCurrency.format(Number(sleeve.current_equity))} equity · ${integer.format(Number(sleeve.open_position_count || 0))} positions`;
  });
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function hydrateEvidence() {
  const paths = {
    claims: "/contracts/public-claims.json",
    state: "/paper-state.json",
    broker: "/glassbox/alpaca_broker_reconciliation.json",
    researchIndex: "/research-index.json",
    kills: "/glassbox/kill_log.json",
  };
  const entries = await Promise.allSettled(
    Object.entries(paths).map(async ([key, path]) => [key, await fetchJson(path)]),
  );
  const data = Object.fromEntries(
    entries
      .filter((entry) => entry.status === "fulfilled")
      .map((entry) => entry.value),
  );

  if (data.claims) hydrateClaimContract(data.claims);
  else throw new Error("Public claim contract unavailable");

  if (data.state) {
    const algorithms = new Map(
      (data.state.algorithms || []).map((algorithm) => [algorithm.key, algorithm]),
    );
    const requested = new URL(window.location.href).searchParams.get("curve");
    const initial = algorithms.get(requested) || algorithms.get("alphac");
    renderCurve(initial, { updateUrl: false });
    document.querySelectorAll("[data-curve-key]").forEach((button) => {
      button.addEventListener("click", () => {
        const algorithm = algorithms.get(button.dataset.curveKey);
        if (algorithm) renderCurve(algorithm);
      });
    });

    const generated = new Date(data.state.generated_at);
    byId("console-time").textContent = Number.isNaN(generated.valueOf())
      ? "Latest mark loaded"
      : `Verified ${dateTime.format(generated)}`;
  }

  if (data.broker) hydrateBroker(data.broker);
  else {
    byId("console-broker").textContent = "Broker detail unavailable";
    byId("console-book").textContent = "Open system status";
  }

  if (data.researchIndex) {
    byId("research-documents").textContent = integer.format(Number(data.researchIndex.count || 0));
  }
  if (data.kills) {
    const killed = Number(data.kills.killed_count || 0) + Number(data.kills.screen_killed_count || 0);
    byId("research-killed").textContent = integer.format(killed);
  }
}

const form = byId("waitlist-form");
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = byId("email");
  const status = byId("form-status");
  const button = form.querySelector("button[type='submit']");
  status.dataset.error = "false";
  if (!email.validity.valid) {
    status.textContent = "Enter a valid email address.";
    status.dataset.error = "true";
    email.setAttribute("aria-invalid", "true");
    email.focus();
    return;
  }

  email.removeAttribute("aria-invalid");
  button.disabled = true;
  status.textContent = "Joining research updates…";
  try {
    const payload = Object.fromEntries(new FormData(form));
    const response = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Could not save right now.");
    form.reset();
    email.removeAttribute("aria-invalid");
    status.textContent = "You're on the research update list. The public record stays open either way.";
  } catch (error) {
    status.textContent = error.message || "Could not save right now. Try again shortly.";
    status.dataset.error = "true";
  } finally {
    button.disabled = false;
  }
});

hydrateEvidence().catch(() => {
  document.querySelector(".header-status").dataset.status = "fail";
  byId("header-broker-status").textContent = "Evidence loading failed";
  byId("evidence-status").textContent = "Fail-closed";
});
