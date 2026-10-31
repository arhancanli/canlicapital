// The homepage's one job: take a claim or a company name and answer it from the filings.
import "./navigation.js";
import { findCompany, indexCompanies } from "./check-company.js";

const byId = (id) => document.getElementById(id);
const form = byId("check-form"), input = byId("check-text"), companyRow = byId("check-company-row"), companyInput = byId("check-company"), statusLine = byId("check-status"), slip = byId("receipts");

const count = (action) => { try { navigator.sendBeacon?.("/api/count", new Blob([action], { type: "text/plain" })); } catch { /* counting never gets in the way */ } };

// A return visit is known from a date kept on this device; only the word "returned" leaves it.
try {
  const today = new Date().toISOString().slice(0, 10), last = localStorage.getItem("canli-last-visit");
  if (last && last !== today) count("returned");
  localStorage.setItem("canli-last-visit", today);
} catch { /* private mode */ }

// --- Which company a text is about, from the site's company index, loaded on first use. ---
let names = null;
async function companyIndex() {
  if (names) return names;
  const response = await fetch("/api/v1/company-names.json");
  if (!response.ok) throw new Error("index");
  names = indexCompanies((await response.json()).rows ?? []);
  return names;
}

// --- The check, through the same public server anyone's agent can use. ---
async function verify(company, text) {
  const response = await fetch("/mcp/canli", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "run_tool", arguments: { name: "verify_claims", arguments: { company, text } } } }) });
  if (response.status === 429) throw new Error("Too many checks in a minute. Wait a moment and press Check it again.");
  if (!response.ok) throw new Error("The check didn't finish. Press Check it to try again.");
  const result = (await response.json()).result, body = result?.content?.[0]?.text ?? "";
  if (result?.isError) throw new Error(/No figure with a measure/.test(body) ? "No figure we can check was found. Name the figure and the year, like: Apple's revenue was $400 billion in fiscal 2025." : "The check didn't finish. Press Check it to try again.");
  return JSON.parse(body);
}

const VERDICT = { confirmed: "Matches the filing", contradicted: "Doesn't match", "not reported": "Not in the filings", "not checkable": "Can't check this" };
const money = (value, unit) => {
  if (value == null) return "Not found";
  const [code, ...rest] = String(unit ?? "").split(" "), size = rest.join(" ");
  if (code === "USD") return `$${value.toLocaleString("en-US")}${size ? ` ${size}` : ""}`;
  return `${value.toLocaleString("en-US")}${unit ? ` ${unit}` : ""}`;
};
const element = (tag, props = {}, ...children) => { const node = Object.assign(document.createElement(tag), props); node.append(...children); return node; };

function receipt(row, at, company, text) {
  const field = (name) => row[at[name]] ?? null, verdict = field("verdict");
  const figures = element("dl", {}, element("div", {}, element("dt", { textContent: "Claimed" }), element("dd", { textContent: money(field("claimed"), field("unit")) })), element("div", {}, element("dt", { textContent: "Filed" }), element("dd", { textContent: money(field("filed"), field("unit")) })));
  const card = element("article", { className: "ck-receipt is-new" }, element("header", {}, element("b", { textContent: company }), element("span", { textContent: [field("measure")?.replaceAll("_", " "), field("period")].filter(Boolean).join(", ") })), element("p", { className: "ck-claim", textContent: field("claim") ?? text }), figures, element("p", { className: "ck-stamp", textContent: VERDICT[verdict] ?? verdict }));
  card.dataset.verdict = verdict.replace(" ", "-");
  if (field("note")) card.append(element("p", { className: "ck-note", textContent: field("note") }));
  if (field("source")) card.append(element("a", { className: "ck-source", href: field("source"), rel: "noreferrer", textContent: "Open the filing" }));
  return card;
}

function shareButton(text, company) {
  const button = element("button", { type: "button", className: "ck-share", textContent: "Share this check" });
  button.addEventListener("click", async () => {
    const url = new URL(location.origin + "/"); url.searchParams.set("check", text); url.searchParams.set("company", company);
    count("share");
    try {
      if (navigator.share) await navigator.share({ title: "Claim check", url: url.href });
      else { await navigator.clipboard.writeText(url.href); button.textContent = "Link copied"; }
    } catch { /* the person closed the share sheet */ }
  });
  return button;
}

// SEC names come in capitals and with their own full stops: "NVIDIA CORP", "Apple Inc.".
const tidyName = (name) => String(name).replace(/\.+$/, "").replace(/\b[A-Z][A-Z]+\b/g, (word) => word[0] + word.slice(1).toLowerCase());
const say = (message, isError = false) => { statusLine.textContent = message; statusLine.dataset.error = String(isError); };

async function run(event) {
  event?.preventDefault();
  const text = input.value.trim();
  if (!text) { say("Paste a claim or type a company name.", true); input.focus(); return; }
  const button = form.querySelector(".ck-go"), hasFigure = /\d/.test(text);
  button.disabled = true;
  say(hasFigure ? "Reading the filings…" : "Finding the company…");
  try {
    const index = await companyIndex();
    const typed = companyRow.hidden ? "" : companyInput.value.trim();
    const company = (typed ? findCompany(index, typed) ?? { ticker: typed, name: typed } : null) ?? findCompany(index, text);
    if (!hasFigure) {
      if (company?.cik) { count("lookup"); location.href = `/companies/${company.cik}`; return; }
      say("No company by that name in the SEC's lists. Try its ticker or full name.", true); return;
    }
    if (!company) {
      companyRow.hidden = false; companyInput.focus();
      say("Which company is this about? Add it above, then press Check it.", true); return;
    }
    count("check_started");
    const answer = await verify(company.ticker ?? company.cik ?? company.name, text);
    const columns = Object.fromEntries(answer.columns.map((c, i) => [c, i]));
    const label = tidyName(answer.company?.name ?? company.name);
    slip.replaceChildren(...answer.rows.map((row) => receipt(row, columns, label, text)), shareButton(text, company.ticker ?? company.name));
    count("check_answered");
    const figures = answer.rows.length;
    say(`Checked ${figures} figure${figures === 1 ? "" : "s"} for ${label}. Anything else in your text wasn't checked.`);
    slip.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  } catch (error) {
    count("check_failed");
    say(error instanceof SyntaxError || !error.message || error.message === "index" ? "The check didn't finish. Press Check it to try again." : error.message, true);
  } finally { button.disabled = false; }
}

if (form) {
  form.addEventListener("submit", run);
  for (const example of document.querySelectorAll("[data-try]")) example.addEventListener("click", () => { input.value = example.dataset.try; companyRow.hidden = true; run(); });
  const shared = new URLSearchParams(location.search);
  if (shared.get("check")) {
    input.value = shared.get("check").slice(0, 1500);
    if (shared.get("company")) { companyRow.hidden = false; companyInput.value = shared.get("company").slice(0, 120); }
    run();
  }
}

// The email form posts as it did on the old homepage.
const waitlist = byId("waitlist-form");
waitlist?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = byId("email"), note = byId("form-status");
  if (!email.validity.valid) { note.textContent = "Enter a valid email address."; email.focus(); return; }
  const button = waitlist.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const response = await fetch(waitlist.action, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(waitlist))), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("save");
    count("email_left");
    note.textContent = "You're on the list.";
    waitlist.reset();
  } catch { note.textContent = "Could not save your email. Try again shortly."; }
  finally { button.disabled = false; }
});
