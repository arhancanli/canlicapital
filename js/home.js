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
  const lastMark = get("forward.last-mark");
  const liveDays = get("forward.live-days");
  const observations = get("forward.return-observations");
  const forwardValidation = get("forward.validation-status");
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
  const researchIdentities = get("research.identities-observed");

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
  const paperEnd = new Date(`${lastMark.value}T00:00:00Z`);
  setClaimText(
    "evidence-forward-window",
    lastMark,
    Number.isNaN(paperStart.valueOf()) || Number.isNaN(paperEnd.valueOf())
      ? "Date unavailable"
      : `${shortDate.format(paperStart)} to ${shortDate.format(paperEnd)}`,
  );
  setClaimText(
    "evidence-forward-days",
    liveDays,
    `${integer.format(Number(liveDays.value))} paper-trading days, ${integer.format(Number(observations.value))} return observations.`,
  );
  setClaimText("core-trial-count", researchIdentities, integer.format(Number(researchIdentities.value)));
  setClaimText("core-sleeve-count", currentSleeves, integer.format(Number(currentSleeves.value)));

  const validation = document.querySelector(".validation-callout");
  const goalsRemainOpen = String(forwardValidation.value).includes("NOT_YET");
  validation.dataset.validationState = brokerPasses.value === true ? (goalsRemainOpen ? "open" : "pass") : "fail";
  setClaimText(
    "evidence-validation-label",
    forwardValidation,
    brokerPasses.value === true && goalsRemainOpen
      ? `Broker pass / forward goals open / ${internalGrade.value}`
      : humanizeStatus(forwardValidation.value),
  );
  setClaimText(
    "evidence-validation-reason",
    forwardValidation,
    brokerPasses.value === true
      ? "Broker reconciliation passes. The forward record is still too young to establish the performance objectives."
      : "Broker reconciliation is open, so the public status remains fail-closed.",
  );

  const header = document.querySelector(".header-status");
  header.dataset.status = brokerPasses.value === true ? "pass" : "fail";
  setClaimText(
    "header-broker-status",
    brokerPasses,
    brokerPasses.value === true
      ? `${integer.format(Number(brokerSleeves.value))} Alpaca paper accounts reconciled`
      : "Broker reconciliation is fail-closed",
  );
  return claims;
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
    if (target) {
      if (!sleeve.passes) {
        target.textContent = "Latest reconciliation open";
        target.previousElementSibling?.classList.add("state-pill--open");
      } else {
        target.textContent = `${compactCurrency.format(Number(sleeve.current_equity))} equity · ${integer.format(Number(sleeve.open_position_count || 0))} positions`;
      }
    }

    const row = document.querySelector(`[data-broker-row="${key}"]`);
    if (!row) return;
    const observation = row.querySelector("[data-broker-observation]");
    const state = row.querySelector("[data-broker-state]");
    const observedAt = new Date(sleeve.current_equity_as_of);
    observation.textContent = Number.isNaN(observedAt.valueOf())
      ? `${integer.format(Number(sleeve.open_position_count || 0))} open positions`
      : `${integer.format(Number(sleeve.open_position_count || 0))} positions / ${dateTime.format(observedAt)}`;
    state.textContent = sleeve.passes ? "Pass" : "Open";
    state.dataset.brokerState = sleeve.passes ? "pass" : "fail";
  });

  const holdings = Object.values(sleeves).map((sleeve) => sleeve.holdings || {});
  const gross = holdings.map((item) => Number(item.gross_pct)).filter(Number.isFinite);
  const net = holdings.map((item) => Number(item.net_pct)).filter(Number.isFinite);
  if (gross.length) {
    const minimum = Math.min(...gross).toFixed(1);
    const maximum = Math.max(...gross).toFixed(1);
    byId("evidence-gross-range").textContent = `${minimum}% to ${maximum}% gross`;
  }
  if (net.length) {
    const minimum = Math.min(...net);
    const maximum = Math.max(...net);
    byId("evidence-net-range").textContent = `${formatPercent(minimum)} to ${formatPercent(maximum)} net across dedicated broker accounts. Not a composite exposure.`;
  }
}

function hydrateTransparency(transparency) {
  const head = transparency?.head || transparency?.entries?.at(-1);
  if (!head) return;
  const signedAt = new Date(head.generated_at);
  byId("evidence-signed-time").textContent = Number.isNaN(signedAt.valueOf())
    ? "Signed head available"
    : dateTime.format(signedAt);
  byId("evidence-chain-head").textContent = `seq ${integer.format(Number(head.seq))} / ${String(head.chain_hash || "hash unavailable").slice(0, 16)}…`;
  byId("console-time").textContent = Number.isNaN(signedAt.valueOf())
    ? "Latest signed state loaded"
    : `Signed ${dateTime.format(signedAt)}`;
  byId("core-signed-count").textContent = integer.format(Number(transparency.entry_count || 0));
}

function hydrateCosts(costs) {
  const equity = Object.values(costs?.equity_sleeves || {});
  const unmeasurable = equity.length > 0 && equity.every((sleeve) =>
    String(sleeve.slippage_vs_decision_price || "").startsWith("NOT MEASURABLE"));
  byId("evidence-slippage-state").textContent = unmeasurable ? "Not measurable" : "Partially measured";
  byId("evidence-slippage-note").textContent = unmeasurable
    ? "Equity fills lack a decision-price reference. The measured crypto component predates the current forward window."
    : "Only the components supported by recorded reference prices are treated as observed.";
}

function supportsEvidenceCore() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (!window.matchMedia("(min-width: 901px)").matches) return false;
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function prepareEvidenceCore(data, claims) {
  const identities = Number(claims.get("research.identities-observed")?.value || 0);
  const sleeves = Number(claims.get("sleeves.current")?.value || 0);
  const killed = Number(data.kills?.killed_count || 0) + Number(data.kills?.screen_killed_count || 0);
  const signedEntries = Number(data.transparency?.entry_count || 0);
  const brokerSleeves = Number(data.broker?.summary?.reconciled_alpaca_sleeves || 0);
  byId("core-kill-count").textContent = integer.format(killed);
  if (!supportsEvidenceCore()) return;

  const section = byId("evidence-core");
  let loading = false;
  const load = async () => {
    if (loading) return;
    loading = true;
    try {
      const { initEvidenceCore } = await import("./evidence-core.js");
      initEvidenceCore({ section, identities, killed, sleeves, signedEntries, brokerSleeves });
    } catch {
      section.dataset.renderer = "static";
    }
  };
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    load();
  }, { rootMargin: "110% 0px" });
  observer.observe(section);
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
    transparency: "/glassbox/transparency_log.json",
    costs: "/glassbox/cost_model_realism.json",
  };
  const entries = await Promise.allSettled(
    Object.entries(paths).map(async ([key, path]) => [key, await fetchJson(path)]),
  );
  const data = Object.fromEntries(
    entries
      .filter((entry) => entry.status === "fulfilled")
      .map((entry) => entry.value),
  );

  if (!data.claims) throw new Error("Public claim contract unavailable");
  const claims = hydrateClaimContract(data.claims);

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
      : `State generated ${dateTime.format(generated)}`;
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
  if (data.transparency) hydrateTransparency(data.transparency);
  if (data.costs) hydrateCosts(data.costs);
  if (claims) prepareEvidenceCore(data, claims);
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
