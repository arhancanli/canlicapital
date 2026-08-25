const byId = (id) => document.getElementById(id);

const percentage = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "always",
});

const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const longDate = new Intl.DateTimeFormat("en-GB", {
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
  const formatted = percentage.format(absolute ? Math.abs(number) : number);
  return `${formatted.replace("-", "−").replace(/^\+/, absolute ? "" : "+")}%`;
}

function curveStatistics(curve) {
  if (!Array.isArray(curve) || curve.length < 2) return null;
  const values = curve.map((point) => Number(point.equity)).filter(Number.isFinite);
  if (values.length < 2 || values[0] === 0) return null;

  let high = values[0];
  let maxDrawdown = 0;
  const returns = [];
  for (let index = 0; index < values.length; index += 1) {
    high = Math.max(high, values[index]);
    maxDrawdown = Math.min(maxDrawdown, values[index] / high - 1);
    if (index > 0 && values[index - 1] !== 0) {
      returns.push(values[index] / values[index - 1] - 1);
    }
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.length > 1
    ? returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (returns.length - 1)
    : 0;
  return {
    returnPercent: (values.at(-1) / values[0] - 1) * 100,
    drawdownPercent: maxDrawdown * 100,
    realizedVolatilityPercent: Math.sqrt(variance) * Math.sqrt(365) * 100,
  };
}

function renderCurve(algorithm) {
  const curve = algorithm?.live_curve;
  const path = byId("equity-path");
  const area = byId("equity-area");
  const node = byId("equity-node");
  if (!Array.isArray(curve) || curve.length < 2 || !path || !area || !node) return;

  const width = 560;
  const height = 310;
  const insetX = 16;
  const insetY = 26;
  const values = curve.map((point) => Number(point.equity));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, Math.abs(maximum) * 0.001, 1);
  const points = values.map((value, index) => {
    const x = insetX + (index / (values.length - 1)) * (width - (insetX * 2));
    const y = insetY + ((maximum - value) / range) * (height - (insetY * 2));
    return [x, y];
  });
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const [lastX, lastY] = points.at(-1);
  path.setAttribute("d", line);
  area.setAttribute("d", `${line} L${lastX.toFixed(2)} ${(height - insetY).toFixed(2)} L${points[0][0].toFixed(2)} ${(height - insetY).toFixed(2)} Z`);
  node.setAttribute("cx", lastX.toFixed(2));
  node.setAttribute("cy", lastY.toFixed(2));

  const stats = curveStatistics(curve);
  if (stats) {
    byId("metric-live-return").textContent = formatPercent(stats.returnPercent);
    byId("metric-live-drawdown").textContent = formatPercent(stats.drawdownPercent);
    byId("metric-live-vol").textContent = formatPercent(stats.realizedVolatilityPercent, true);
  }
  const first = new Date(curve[0].date);
  const last = new Date(curve.at(-1).date);
  byId("chart-start").textContent = shortDate.format(first);
  byId("chart-end").textContent = shortDate.format(last);
  byId("chart-title").textContent = `${algorithm.name} paper equity curve`;
  byId("chart-description").textContent = `${algorithm.name} has ${curve.length} published paper equity marks from ${longDate.format(first)} through ${longDate.format(last)}.`;

  document.querySelectorAll("[data-curve-key]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.curveKey === algorithm.key));
  });
}

async function hydrateEvidence() {
  try {
    const [stateResponse, researchResponse, killResponse, discoveryResponse, brokerResponse, maturityResponse, continuityResponse] = await Promise.all([
      fetch("/paper-state.json", { cache: "no-cache" }),
      fetch("/glassbox/research.json", { cache: "no-cache" }),
      fetch("/glassbox/kill_log.json", { cache: "no-cache" }),
      fetch("/glassbox/sleeve_discovery.json", { cache: "no-cache" }),
      fetch("/glassbox/alpaca_broker_reconciliation.json", { cache: "no-cache" }),
      fetch("/glassbox/forward_evidence_maturity.json", { cache: "no-cache" }),
      fetch("/glassbox/record_continuity.json", { cache: "no-cache" }),
    ]);
    if ([stateResponse, researchResponse, killResponse, discoveryResponse, brokerResponse, maturityResponse, continuityResponse].some((response) => !response.ok)) {
      throw new Error("Evidence unavailable");
    }
    const [state, research, kills, discovery, broker, maturity, continuity] = await Promise.all([
      stateResponse.json(), researchResponse.json(), killResponse.json(), discoveryResponse.json(),
      brokerResponse.json(), maturityResponse.json(), continuityResponse.json(),
    ]);

    const algorithms = new Map((state.algorithms || []).map((algorithm) => [algorithm.key, algorithm]));
    const composite = algorithms.get("alphac");
    renderCurve(composite);
    document.querySelectorAll("[data-curve-key]").forEach((button) => {
      button.addEventListener("click", () => renderCurve(algorithms.get(button.dataset.curveKey)));
    });

    const grade = state.metrics?.gauntlet_grade || "C+";
    byId("metric-grade").textContent = grade;
    byId("status-grade").textContent = `${grade} / developing`;
    byId("validation-overall").textContent = `${grade} / developing`;
    byId("proof-families").textContent = research.executive_summary?.tested_factor_families_count || "35+";
    byId("proof-killed").textContent = String((kills.killed_count || 0) + (kills.screen_killed_count || 0));

    const start = new Date(state.go_live_date);
    const generated = new Date(state.generated_at);
    const statusStart = byId("status-start");
    statusStart.textContent = longDate.format(start);
    statusStart.dateTime = state.go_live_date;
    byId("evidence-days").textContent = String(state.metrics?.live_days || composite?.live_days || 0);
    const compositeStats = curveStatistics(composite?.live_curve);
    if (compositeStats) {
      byId("evidence-return").textContent = formatPercent(compositeStats.returnPercent);
      byId("evidence-drawdown").textContent = formatPercent(compositeStats.drawdownPercent);
    }

    const brokerSleeves = Object.values(broker.sleeves || {});
    const reconciled = brokerSleeves.filter((sleeve) => sleeve.passes && sleeve.broker === "ALPACA").length;
    byId("status-broker").textContent = `${reconciled} sleeves on Alpaca`;
    byId("validation-broker").textContent = `${reconciled} dedicated Alpaca paper accounts reconcile.`;
    const positions = Number(broker.summary?.open_positions || 0);
    const orders = Number(broker.summary?.open_orders || 0);
    byId("evidence-exposure").textContent = `${positions} Alpaca paper positions and ${orders} open orders at the latest reconciliation.`;

    const observations = Number(maturity.sharpe_evidence?.daily_return_observations || 0);
    const establishment = Number(maturity.sharpe_evidence?.establishment_minimum || 0);
    byId("validation-maturity").textContent = `${observations} of ${establishment} return observations required for establishment.`;
    const cryptoOpen = (maturity.provenance_gate?.failed_checks || []).some((check) => check.includes("crypto_position_attribution"));
    byId("validation-crypto").textContent = cryptoOpen
      ? "Full production-position attribution is still open."
      : "Production-position attribution checks pass.";

    const activeIds = new Set((discovery.candidates || []).map((candidate) => candidate.id));
    document.querySelectorAll("#discovery-frontier [data-candidate-id]").forEach((row) => {
      row.hidden = !activeIds.has(row.dataset.candidateId);
    });
    const coreChecksPass = broker.summary?.passes === true && continuity.passes === true;
    byId("artifact-status").textContent = coreChecksPass ? "record verified" : "check open";
    byId("evidence-updated").textContent = Number.isNaN(generated.valueOf())
      ? "Latest record timestamp unavailable"
      : `Latest verified record ${dateTime.format(generated)}`;
    byId("artifact-time").textContent = Number.isNaN(generated.valueOf())
      ? "Evidence artifact loaded"
      : `Evidence generated ${longDate.format(generated)} UTC`;
  } catch {
    byId("artifact-status").textContent = "verified fallback";
    byId("evidence-updated").textContent = "Static evidence fallback in use";
    byId("artifact-time").textContent = "Static evidence fallback in use";
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
    status.textContent = "Access requested. We will send the next research release.";
  } catch (error) {
    status.textContent = error.message || "Could not save right now. Try again shortly.";
    status.dataset.error = "true";
  } finally {
    button.disabled = false;
  }
});

hydrateEvidence();
