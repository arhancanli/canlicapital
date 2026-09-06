import {
  buildTrialUnion,
  filterTrialUnion,
  TRIAL_UNION_STATUS,
} from "./trial-accounting-core.js";

const config = JSON.parse(document.querySelector("#trial-accounting-config").textContent);
const byId = (id) => document.getElementById(id);
const state = { union: null, filtered: [], selected: null };
const statusLabel = {
  [TRIAL_UNION_STATUS.LEGACY_COMPLETE]: "COMPLETE EVIDENCED PACKET",
  [TRIAL_UNION_STATUS.LEGACY_INCOMPLETE]: "INCOMPLETE LEGACY PACKET",
  [TRIAL_UNION_STATUS.PROSPECTIVE_FINAL_INCOMPLETE]: "PROSPECTIVE / NOT ADMITTED",
};
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const safePublicHref = (value) => {
  const href = String(value ?? "");
  return /^\/[a-zA-Z0-9/_.,-]+$/.test(href) ? href : "#";
};

function filtersFromUrl() {
  const query = new URLSearchParams(location.search);
  return {
    query: query.get("q") || "",
    family: query.get("family") || "all",
    status: query.get("status") || "all",
    sleeve: query.get("sleeve") || "all",
    identity: query.get("identity") || null,
  };
}

function filtersFromControls() {
  return {
    query: byId("union-query").value,
    family: byId("union-family").value,
    status: byId("union-status").value,
    sleeve: byId("union-sleeve").value,
  };
}

function updateUrl(filters, selected = state.selected) {
  const url = new URL(location.href);
  const values = { q: filters.query, family: filters.family, status: filters.status, sleeve: filters.sleeve };
  for (const [key, value] of Object.entries(values)) {
    if (!value || value === "all") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  if (selected) url.searchParams.set("identity", selected.hypothesis_key);
  else url.searchParams.delete("identity");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

const formatNumber = (value, digits = 3) =>
  value === null || value === undefined ? "Not measured" : Number(value).toFixed(digits);

function renderInspector(identity) {
  state.selected = identity;
  const completeSections = identity.verified_sections.length;
  const missingSections = identity.missing_sections.length;
  byId("union-inspector").innerHTML = `<div class="union-inspector__status" data-state="${escapeHtml(identity.status)}">${escapeHtml(statusLabel[identity.status])}</div>
    <p class="union-inspector__key">${escapeHtml(identity.hypothesis_key)}</p>
    <h3>${escapeHtml(identity.label)}</h3>
    <dl>
      <div><dt>Family</dt><dd>${escapeHtml(identity.family_title)}</dd></div>
      <div><dt>Sleeve context</dt><dd>${escapeHtml(identity.sleeve)}</dd></div>
      <div><dt>First recorded</dt><dd>${escapeHtml(identity.first_recorded_at || `Reservation ${identity.reservation_ordinal}`)}</dd></div>
      <div><dt>Historical observations</dt><dd>${escapeHtml(identity.measurement.observations ?? "Not measured")}</dd></div>
      <div><dt>Historical Sharpe</dt><dd>${escapeHtml(formatNumber(identity.measurement.annualized_sharpe))}</dd></div>
      <div><dt>Admitted</dt><dd>NO</dd></div>
    </dl>
    <div class="union-inspector__coverage"><span>Evidence coverage</span><strong>${completeSections} verified / ${missingSections} missing or unevaluated</strong><i style="--coverage:${completeSections / Math.max(1, completeSections + missingSections)}"></i></div>
    <div class="union-inspector__links"><a href="${safePublicHref(identity.public_page)}">Open public evidence page</a><a href="${safePublicHref(identity.packet_path)}">Download exact packet</a>${identity.family_paper ? `<a href="${safePublicHref(identity.family_paper)}">Read bound research</a>` : ""}</div>
    <p class="union-inspector__boundary">Packet completeness describes evidence accounting only. This identity is not presented as admitted, live or predictive.</p>`;
  document.querySelectorAll("[data-identity]").forEach((element) => {
    element.dataset.selected = String(element.dataset.identity === identity.hypothesis_key);
  });
  updateUrl(filtersFromControls());
}

function renderResults(filters) {
  state.filtered = filterTrialUnion(state.union, filters);
  byId("union-visible").textContent = String(state.filtered.length);
  const visible = new Set(state.filtered.map((identity) => identity.hypothesis_key));
  byId("union-matrix").innerHTML = state.union.identities.map((identity) =>
    `<button type="button" role="listitem" data-identity="${escapeHtml(identity.hypothesis_key)}" data-state="${escapeHtml(identity.status)}" data-visible="${visible.has(identity.hypothesis_key)}" aria-label="${escapeHtml(identity.label)}, ${escapeHtml(statusLabel[identity.status])}"></button>`
  ).join("");
  byId("union-list").innerHTML = state.filtered.length
    ? state.filtered.map((identity) => `<button type="button" data-identity="${escapeHtml(identity.hypothesis_key)}" data-state="${escapeHtml(identity.status)}"><code>${escapeHtml(identity.hypothesis_key)}</code><span>${escapeHtml(identity.label)}</span><small>${escapeHtml(identity.family_title)}</small><strong>${escapeHtml(statusLabel[identity.status])}</strong></button>`).join("")
    : `<p class="union-empty">No identity matches these filters. Selection N is still ${state.union.facts.selection_n}.</p>`;
  document.querySelectorAll("[data-identity]").forEach((element) => {
    element.addEventListener("click", () => renderInspector(
      state.union.identities.find((identity) => identity.hypothesis_key === element.dataset.identity),
    ));
  });
  if (state.selected && visible.has(state.selected.hypothesis_key)) renderInspector(state.selected);
  else if (state.filtered.length) renderInspector(state.filtered[0]);
  else {
    state.selected = null;
    byId("union-inspector").innerHTML = `<p>No visible identity. Reset a filter to inspect a packet.</p>`;
    updateUrl(filters, null);
  }
}

function populateControls(filters) {
  byId("union-family").insertAdjacentHTML("beforeend", state.union.families.map((family) => `<option value="${escapeHtml(family.family_key)}">${escapeHtml(family.title)} (${family.identities})</option>`).join(""));
  const sleeves = [...new Set(state.union.identities.map((identity) => identity.sleeve))].sort();
  byId("union-sleeve").insertAdjacentHTML("beforeend", sleeves.map((sleeve) => `<option value="${escapeHtml(sleeve)}">${escapeHtml(sleeve)}</option>`).join(""));
  byId("union-query").value = filters.query;
  byId("union-family").value = state.union.families.some((family) => family.family_key === filters.family) ? filters.family : "all";
  byId("union-status").value = Object.values(TRIAL_UNION_STATUS).includes(filters.status) ? filters.status : "all";
  byId("union-sleeve").value = sleeves.includes(filters.sleeve) ? filters.sleeve : "all";
}

async function copyLink() {
  await navigator.clipboard.writeText(location.href);
  const button = byId("union-copy");
  button.textContent = "Copied";
  setTimeout(() => { button.textContent = "Copy filtered link"; }, 1300);
}

function exportFiltered() {
  const payload = {
    schema: "canli.trial-accounting-filter-export.v1",
    selection_n: state.union.facts.selection_n,
    filters: filtersFromControls(),
    visible_identities: state.filtered,
    claim_boundary: state.union.claim_boundary,
    source_hashes: config.source_hashes,
  };
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "alphac-trial-union-filter.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function load() {
  try {
    const sourceOrder = ["ledger", "manifest", "index", "prospective"];
    const responses = await Promise.all(sourceOrder.map((name) => fetch(config.source_urls[name], { cache: "no-store" })));
    if (responses.some((response) => !response.ok)) throw new Error("A trial-accounting source could not be loaded");
    const [ledger, manifest, index, prospective] = await Promise.all(responses.map((response) => response.json()));
    state.union = buildTrialUnion(ledger, manifest, index, prospective);
    const filters = filtersFromUrl();
    populateControls(filters);
    const requested = state.union.identities.find((identity) => identity.hypothesis_key === filters.identity);
    if (requested) state.selected = requested;
    renderResults(filtersFromControls());
  } catch (error) {
    byId("union-list").innerHTML = `<p class="union-empty">${escapeHtml(error.message)}</p>`;
    byId("union-inspector").innerHTML = `<p>FAIL CLOSED</p>`;
  }
}

for (const id of ["union-query", "union-family", "union-status", "union-sleeve"]) {
  byId(id).addEventListener(id === "union-query" ? "input" : "change", () => renderResults(filtersFromControls()));
}
byId("union-reset").addEventListener("click", () => {
  byId("union-query").value = ""; byId("union-family").value = "all"; byId("union-status").value = "all"; byId("union-sleeve").value = "all"; renderResults(filtersFromControls());
});
byId("union-copy").addEventListener("click", copyLink);
byId("union-export").addEventListener("click", exportFiltered);
load();
