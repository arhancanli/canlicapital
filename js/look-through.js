// Imported here, not linked in the page: build-site-design.mjs rewrites each page's stylesheets in its head.
import "../css/check-home.css";
import "../css/look-through.css";
import "./navigation.js";
import { mergeOpened } from "canli-markets-mcp/src/xray-merge.mjs";
import { fromLink, parseHoldings, toLink } from "./look-through-parse.js";

const byId = (id) => document.getElementById(id);
const form = byId("look-form"), input = byId("look-text"), statusLine = byId("look-status"), out = byId("look-result");
const count = (action) => { try { navigator.sendBeacon?.("/api/count", new Blob([action], { type: "text/plain" })); } catch { /* counting never gets in the way */ } };
const element = (tag, props = {}, ...children) => { const node = Object.assign(document.createElement(tag), props); node.append(...children); return node; };
const percent = (x) => `${(100 * x).toFixed(x >= 0.1 ? 1 : 2)}%`;
const whole = (x) => Math.round(x).toLocaleString("en-US");

// Each holding is opened on the server, the same answer for everyone and kept by the CDN, and added up
// here with the server's own arithmetic. Only tickers leave this page, never amounts.
async function openOne(symbol) {
  const response = await fetch(`/api/open-holding?symbol=${encodeURIComponent(symbol)}`);
  if (response.status === 429) throw new Error("Too many requests in a minute. Wait a moment and press Look inside again.");
  if (!response.ok) throw new Error("This didn't finish. Press Look inside to try again.");
  return response.json();
}

async function lookThrough(holdings) {
  const symbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];
  const answers = new Map(await Promise.all(symbols.map(async (symbol) => [symbol, await openOne(symbol)])));
  return { ...mergeOpened(holdings, (symbol) => answers.get(symbol).opened, { top: 15 }), limits: answers.get(symbols[0]).limits };
}

function draw(answer, holdings) {
  const at = (name) => answer.columns.indexOf(name), [top] = answer.rows;
  const summary = element("p", { className: "lt-summary" },
    `Your ${holdings.length === 1 ? "holding opens" : `${holdings.length} holdings open`} into ${whole(answer.positions_after_look_through)} companies and other issuers. By weight, that is like owning about ${whole(answer.effective_positions)} of them in equal amounts.`);
  const largest = top ? element("p", { className: "lt-largest" }, element("b", { textContent: percent(top[at("weight")]) }), ` of your money is in ${top[at("issuer")]}, your largest holding once the funds are opened.`) : "";
  const scale = top ? top[at("weight")] : 1;
  const rows = answer.rows.map((row) => {
    const via = Object.entries(row[at("via")] ?? {}).map(([symbol, weight]) => `${symbol} ${percent(weight)}`).join(", ");
    const bar = element("span", { className: "lt-bar" });
    bar.style.width = `${Math.max(2, (100 * row[at("weight")]) / scale)}%`;
    return element("tr", {}, element("th", { scope: "row", textContent: row[at("issuer")] }), element("td", { className: "lt-num" }, percent(row[at("weight")]), bar), element("td", { className: "lt-via", textContent: via }));
  });
  const table = element("table", { className: "lt-table" }, element("caption", { textContent: "The largest positions once your funds are opened" }),
    element("thead", {}, element("tr", {}, ...["Company", "Your share", "Through"].map((t) => element("th", { scope: "col", textContent: t })))), element("tbody", {}, ...rows));
  const sources = (answer.funds ?? []).map((f) => element("li", { textContent: `${f.symbol}: ${f.fund}, its report for ${f.period}, filed ${f.filed}.` }));
  const notes = [...(answer.notes ?? []), ...(answer.limits ?? [])].map((text) => element("li", { textContent: text }));
  const share = element("button", { type: "button", className: "ck-share", textContent: "Share this portfolio" });
  share.addEventListener("click", async () => {
    const url = new URL(location.origin + location.pathname); url.searchParams.set("h", toLink(holdings));
    count("share");
    try {
      if (navigator.share) await navigator.share({ title: "What I really own", url: url.href });
      else { await navigator.clipboard.writeText(url.href); share.textContent = "Link copied"; }
    } catch { /* the person closed the share sheet */ }
  });
  out.replaceChildren(summary, largest, element("div", { className: "lt-scroll", tabIndex: 0 }, table), share,
    ...(sources.length ? [element("h3", { textContent: "Where this comes from" }), element("ul", { className: "lt-notes" }, ...sources)] : []),
    ...(notes.length ? [element("h3", { textContent: "What to keep in mind" }), element("ul", { className: "lt-notes" }, ...notes)] : []));
  out.hidden = false;
}

async function run(event) {
  event?.preventDefault();
  const { holdings, unread, problem } = parseHoldings(input.value);
  out.hidden = true;
  if (problem) { statusLine.textContent = problem; return; }
  if (!holdings.length) { statusLine.textContent = "List at least one holding, such as VOO 60."; return; }
  statusLine.textContent = "Opening each fund's latest report.";
  count("look_through");
  try {
    draw(await lookThrough(holdings), holdings);
    statusLine.textContent = unread.length ? `Left out what we couldn't read: ${unread.join(", ")}.` : "";
    out.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  } catch (err) { statusLine.textContent = err.message; }
}

if (form) {
  form.addEventListener("submit", run);
  for (const example of document.querySelectorAll("[data-try]")) example.addEventListener("click", () => { input.value = example.dataset.try.replaceAll(",", "\n"); run(); });
  const shared = new URLSearchParams(location.search).get("h");
  if (shared) { input.value = fromLink(shared); run(); }
}
