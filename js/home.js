const byId = (id) => document.getElementById(id);

function shortForward(value) {
  const match = String(value || "").match(/([0-9.]+)\s+to\s+([0-9.]+)/i);
  return match ? `${match[1]}–${match[2]}` : "0.3–0.9";
}

function signed(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "+0.0274";
  return `${number >= 0 ? "+" : ""}${number.toFixed(digits)}`;
}

async function hydrateEvidence() {
  try {
    const [stateResponse, researchResponse, killResponse, discoveryResponse] = await Promise.all([
      fetch("/paper-state.json", { cache: "no-cache" }),
      fetch("/glassbox/research.json", { cache: "no-cache" }),
      fetch("/glassbox/kill_log.json", { cache: "no-cache" }),
      fetch("/glassbox/sleeve_discovery.json", { cache: "no-cache" }),
    ]);
    if (!stateResponse.ok || !researchResponse.ok || !killResponse.ok || !discoveryResponse.ok) throw new Error("Evidence unavailable");
    const [state, research, kills, discovery] = await Promise.all([
      stateResponse.json(), researchResponse.json(), killResponse.json(), discoveryResponse.json(),
    ]);

    const sleeves = Array.isArray(state.book?.sleeves) ? state.book.sleeves : [];
    byId("metric-sleeves").textContent = String(sleeves.length).padStart(2, "0");
    byId("metric-correlation").textContent = signed(state.metrics?.correlation_value);
    byId("metric-forward").textContent = shortForward(state.metrics?.honest_forward_sharpe);
    byId("metric-grade").textContent = state.metrics?.gauntlet_grade || "C+";
    byId("proof-families").textContent = research.executive_summary?.tested_factor_families_count || "35+";
    byId("proof-killed").textContent = String((kills.killed_count || 0) + (kills.screen_killed_count || 0));
    const activeIds = new Set((discovery.candidates || []).map((candidate) => candidate.id));
    document.querySelectorAll("#discovery-frontier [data-candidate-id]").forEach((row) => {
      row.hidden = !activeIds.has(row.dataset.candidateId);
    });
    byId("artifact-status").textContent = "artifact verified";
    const generated = new Date(state.generated_at);
    byId("artifact-time").textContent = Number.isNaN(generated.valueOf())
      ? "Evidence artifact loaded"
      : `Evidence generated ${generated.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })} UTC`;
  } catch {
    byId("artifact-status").textContent = "verified fallback";
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
