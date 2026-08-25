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
  if (!Number.isFinite(number)) return "—";
  const formatted = percent.format(absolute ? Math.abs(number) : number);
  return `${formatted.replace("-", "−").replace(/^\+/, absolute ? "" : "+")}%`;
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
  const header = document.querySelector(".header-status");

  header.dataset.status = passed ? "pass" : "fail";
  byId("header-broker-status").textContent = passed
    ? `${reconciled} Alpaca paper accounts reconciled`
    : "Broker reconciliation is fail-closed";
  byId("console-broker").textContent = passed
    ? `${reconciled} dedicated accounts · PASS`
    : "Reconciliation check open";
  byId("console-book").textContent = `${integer.format(positions)} positions · ${integer.format(orders)} orders`;
  byId("evidence-accounts").textContent = passed ? `${reconciled} × $1M` : "Check open";
  byId("evidence-positions").textContent = `${integer.format(positions)} / ${integer.format(orders)}`;
  byId("evidence-status").textContent = passed ? "Broker PASS" : "Fail-closed";

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
    const grade = data.state.metrics?.gauntlet_grade || "—";
    byId("metric-grade").textContent = grade;
    byId("evidence-days").textContent = integer.format(Number(data.state.metrics?.live_days || 0));
    const correlation = Number(data.state.metrics?.correlation_value);
    byId("correlation-reading").textContent = Number.isFinite(correlation)
      ? correlationFormat.format(correlation)
      : "—";
  }

  if (data.broker) hydrateBroker(data.broker);
  else {
    document.querySelector(".header-status").dataset.status = "fail";
    byId("header-broker-status").textContent = "Broker evidence unavailable";
    byId("evidence-status").textContent = "Unavailable";
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
  status.textContent = "Requesting access…";
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
    status.textContent = "Access requested. You will receive the next research release.";
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
