// =============================================================================
// CANLI CAPITAL / research.js
// -----------------------------------------------------------------------------
// The data binder for /research, the public research page ("The Research / How
// we got here"). It fetches the single read-only artifact the AlphaForge
// exporter wrote to public/glassbox/research.json and fills the page's data
// hooks. This is the FULLER methodology + findings companion to /open: /open is
// the focused glass-box proof (live record, kill log, deflation gauge); this page
// tells the whole honest factor-research story, the validation method in plain
// language, the honest verdicts + ceilings, and the roadmap.
//
// HONESTY CONTRACT (the soul of the page, identical to open.js):
//   - Every visible number comes from a real artifact. This module NEVER invents
//     a value. If a field is missing on the artifact, the bound element keeps its
//     reserved "--" placeholder (omit, never back-fill with a guess), or the
//     element is omitted from a built list entirely.
//   - The forward Sharpe is shown as the deflated 0.7 to 1.0 expectation that the
//     artifact carries, never the 1.46 in-sample headline. Killed factors render
//     with their real negative net Sharpes.
//
// What it does NOT own: the shared chrome (nav/footer/rail/intro/scene/cursor)
// and the reveal/scroll grammar are the single design system (main.js +
// scroll.js + shell.js), which auto-discover .mask / .reveal-fade on this page.
// This module only binds data and the two local interactions (factor row expand,
// asset-class filter). It is loaded BEFORE main.js so the bound DOM is in place
// before the reveal choreography measures it; it degrades to the quiet reserved
// state if the fetch fails.
// =============================================================================

// The bundled GSAP + ScrollTrigger singletons, the SAME instances scroll.js and
// open.js use (resolved by Vite to one copy). We use only the established
// grammar: a one-shot onEnter that hands a section's data viz its reveal as it
// scrolls into view. No new easing, no second timeline engine.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const BASE = "/glassbox/";
const FILE = "research.json";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The house ease-out, matching --ease-out / scroll.js EASE.out / open.js exactly,
// so the data-viz reveals share the one motion signature with the rest of the
// manifold.
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

// Run `fn` once, when `trigger` scrolls into view, via the shared ScrollTrigger.
// Under reduced motion (or with no ScrollTrigger) we run it immediately so the
// final state is always reached; the reveal is an enhancement, never a gate on
// the data being visible. Same helper as open.js.
function onReveal(trigger, fn, start = "top 86%") {
  if (!trigger) return;
  if (reduced || !ScrollTrigger) { fn(); return; }
  const rect = trigger.getBoundingClientRect();
  if (rect.top < window.innerHeight * 0.86 && rect.bottom > 0) { fn(); return; }
  ScrollTrigger.create({ trigger, start, once: true, onEnter: fn });
}

// ---- small DOM + format helpers (mirrors open.js) --------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// DESIGN LAW: zero em dashes (U+2014) in the rendered output. The honesty mandate
// requires the prose to come verbatim from the artifact, but a few artifact
// strings carry an em dash as punctuation (a caption, a step title). Those are
// presentational text, not load-bearing numbers, so we normalise the em/en dash
// to a spaced hyphen on the way into the DOM: the reading is identical, no figure
// is altered, and the property keeps its single-dash typographic law. Applied at
// the two injection points (setHook + the el() text helper) so every bound string
// is clean by construction, including any future re-export.
// The em dash (code point 8212) and en dash (8211) as a regex, built from char
// codes so NO long-dash glyph appears in this source or the shipped bundle, only
// the rule that removes them. Replacing a long dash plus its surrounding spaces
// with a single spaced hyphen reads identically, alters no figure, and upholds
// the single-dash typographic law.
const LONG_DASH_RE = new RegExp(
  "\\s*[" + String.fromCharCode(8212) + String.fromCharCode(8211) + "]\\s*",
  "g",
);
function clean(s) {
  if (typeof s !== "string") return s;
  return s.replace(LONG_DASH_RE, " - ");
}

// Set the text of every [data-<ns>="<key>"] hook. If the value is null /
// undefined / "" / non-finite number we leave the reserved "--" placeholder
// intact (honesty: omit, never invent).
function setHook(ns, key, value) {
  const sel = `[data-${ns}="${key}"]`;
  if (value === null || value === undefined || value === "") return;
  if (typeof value === "number" && !Number.isFinite(value)) return;
  const out = clean(String(value));
  $$(sel).forEach((el) => { el.textContent = out; });
}

function fmtPct(x, decimals = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(decimals)}%`;
}
function fmtSharpe(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(2)}`;
}
function fmtMoney(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  return `$${Math.round(x).toLocaleString("en-US")}`;
}
function fmtYears(days) {
  if (!Number.isFinite(days)) return null;
  const y = days / 365.25;
  return y >= 1 ? `${y.toFixed(1)}y` : `${Math.round(days)}d`;
}
function fmtCap(usd) {
  if (!Number.isFinite(usd)) return null;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(0)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}k`;
  return `$${usd}`;
}
function shortHash(h) {
  if (typeof h !== "string") return null;
  const body = h.replace(/^sha256:/, "");
  return `sha256:${body.slice(0, 12)}...${body.slice(-6)}`;
}
function titleCase(s) {
  if (typeof s !== "string" || !s) return null;
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = clean(String(text));
  return n;
}

async function loadJSON(name) {
  const res = await fetch(`${BASE}${name}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

// A single shared row-enter: fade + small lift with a gentle stagger, fired once
// when `container` scrolls into view, via the shared ScrollTrigger and house
// ease. Under reduced motion (or no ScrollTrigger) the rows are left in their
// resting visible state, never hidden. The SAME grammar open.js / scroll.js use.
function staggerIn(container, rows) {
  if (!container || !rows || !rows.length) return;
  if (reduced || !ScrollTrigger) return; // rows already at rest, fully visible
  gsap.set(rows, { opacity: 0, y: 14 });
  onReveal(container, () => {
    gsap.to(rows, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: EASE_OUT,
      stagger: { each: 0.045, from: "start" },
    });
  });
}

// =============================================================================
// 0. HERO + EXECUTIVE SUMMARY
// =============================================================================
function bindHero(d) {
  const es = d.executive_summary || {};
  setHook("es", "description", es.description);
  setHook("es", "forwardSharpe", es.honest_forward_sharpe_range);
  setHook("es", "deployed", es.deployed_sleeves_count);
  setHook("es", "tested", es.tested_factor_families_count);
  setHook("es", "grade", es.in_sample_grade);
  setHook("es", "gradeNote", es.honest_grade_note);
  setHook("es", "inSample", Number.isFinite(es.in_sample_sharpe) ? es.in_sample_sharpe.toFixed(2) : null);

  // kept / killed come from factor_research so the hero proof cannot drift from
  // the table below it.
  const fr = d.factor_research || {};
  setHook("es", "kept", fr.kept_count);
  setHook("es", "killed", fr.killed_count);
  setHook("es", "factors", (fr.kept_count || 0) + (fr.killed_count || 0));

  setHook("rs", "honestyNote", d.honesty_note);
}

// =============================================================================
// 1. FACTOR RESEARCH  (the full ledger: every test, real Sharpe, real Rank-IC)
// =============================================================================
function bindFactors(d) {
  const fr = d.factor_research || {};
  setHook("fr", "summary", fr.summary);
  setHook("fr", "kept", fr.kept_count);
  setHook("fr", "killed", fr.killed_count);

  const equity = Array.isArray(fr.equity_factors) ? fr.equity_factors : [];
  const crypto = Array.isArray(fr.crypto_factors) ? fr.crypto_factors : [];
  const all = [...equity, ...crypto];
  if (!all.length) return;

  // KEEP rows first, then the kills, so surviving factor tests lead.
  all.sort((a, b) => {
    const ak = (a.verdict || "").toUpperCase() === "KEEP" ? 0 : 1;
    const bk = (b.verdict || "").toUpperCase() === "KEEP" ? 0 : 1;
    if (ak !== bk) return ak - bk;
    // within a group, order by net Sharpe descending (real numbers, best first)
    const as = a.performance ? a.performance.net_sharpe : -Infinity;
    const bs = b.performance ? b.performance.net_sharpe : -Infinity;
    return (bs ?? -Infinity) - (as ?? -Infinity);
  });

  const body = $("#factorBody");
  if (!body) return;
  body.textContent = "";
  body.removeAttribute("data-empty");

  all.forEach((f, i) => {
    body.appendChild(buildFactorRow(f, i));
  });

  // Asset-class filter chips (equity / crypto / all). Filtering is presentational
  // only; it never changes a number.
  wireFilter(body);

  staggerIn($(".factors__table"), $$(".factor", body));
}

function buildFactorRow(f, i) {
  const keep = (f.verdict || "").toUpperCase() === "KEEP";
  const perf = f.performance || {};
  const sharpe = perf.net_sharpe;

  const entry = el("article", "factor");
  entry.dataset.assetClass = f.asset_class || "";

  const toggle = el("button", "factor__toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.id = `factor-${i}`;

  const row = el("span", "factor__row");

  // name cell: readable name + the registered key + family/asset tag
  const nameCell = el("span", "factor__cell factor__cell--name");
  const nameBox = el("span", "factor__name");
  nameBox.appendChild(el("span", "factor__name-readable", f.readable_name || f.name || "?"));
  const tags = el("span", "factor__name-tags");
  if (f.name) tags.appendChild(el("span", "factor__name-key", f.name));
  const klass = f.asset_class === "crypto_perp" ? "Crypto" : f.asset_class === "us_equity" ? "Equity" : null;
  if (klass) tags.appendChild(el("span", `factor__name-class factor__name-class--${klass.toLowerCase()}`, klass));
  nameBox.appendChild(tags);
  nameCell.appendChild(nameBox);

  // family cell
  const famCell = el("span", "factor__cell factor__cell--family", titleCase(f.family) || "--");

  // net Sharpe cell, signed, pos/neg coloured
  const sCell = el("span", `factor__cell factor__cell--num ${sharpe >= 0 ? "factor__num--pos" : "factor__num--neg"}`, fmtSharpe(sharpe) || "--");

  // Rank-IC cell: the headline horizon's t-stat (h21 preferred, else first
  // available). The whole IC table lives in the expanded detail.
  const icCell = el("span", "factor__cell factor__cell--num factor__cell--ic");
  const ic = headlineIC(f.rank_ic);
  if (ic) {
    icCell.appendChild(el("span", "factor__ic-val", ic.mean_rank_ic.toFixed(4)));
    icCell.appendChild(el("span", "factor__ic-t", `t ${ic.t_nw.toFixed(2)}`));
  } else {
    icCell.textContent = "--";
  }

  // verdict chip
  const vCell = el("span", "factor__cell factor__cell--verdict");
  const chip = el("span", `factor__chip ${keep ? "factor__chip--keep" : "factor__chip--killed"}`, keep ? "KEPT" : "KILLED");
  vCell.appendChild(chip);

  row.append(nameCell, famCell, sCell, icCell, vCell);
  toggle.appendChild(row);

  // the expandable detail: the reason, the full performance meta, and the full
  // Rank-IC by horizon.
  const detail = el("div", "factor__detail");
  detail.id = `factor-detail-${i}`;
  detail.setAttribute("aria-hidden", "true");
  detail.setAttribute("inert", "");
  toggle.setAttribute("aria-controls", detail.id);
  const dInner = el("div", "factor__detail-inner");

  if (f.reason) dInner.appendChild(el("p", "factor__reason", f.reason));

  // performance meta strip
  const meta = el("div", "factor__meta");
  const addMeta = (label, val) => {
    if (val === null || val === undefined) return;
    const sp = el("span", "factor__meta-item");
    sp.appendChild(el("span", "factor__meta-label", label));
    sp.appendChild(el("span", "factor__meta-val", val));
    meta.appendChild(sp);
  };
  addMeta("Period", perf.period_start && perf.period_end ? `${perf.period_start} to ${perf.period_end}` : null);
  addMeta("Sample", fmtYears(perf.n_days));
  addMeta("CAGR", fmtPct(perf.cagr_pct));
  addMeta("Total return", fmtPct(perf.total_return_pct));
  addMeta("Vol (ann)", fmtPct(perf.vol_ann_pct));
  addMeta("Max DD", fmtPct(perf.max_drawdown_pct));
  addMeta("Sortino", Number.isFinite(perf.sortino) ? perf.sortino.toFixed(2) : null);
  addMeta("Turnover (ann)", Number.isFinite(perf.turnover_ann) ? `${perf.turnover_ann.toFixed(1)}x` : null);
  addMeta("Fees paid", fmtMoney(perf.fees_paid_usd));
  if (Number.isFinite(perf.funding_net_usd) && perf.funding_net_usd !== 0) addMeta("Funding (net)", fmtMoney(perf.funding_net_usd));
  addMeta("Final equity", fmtMoney(perf.final_equity_usd));
  if (meta.childElementCount) dInner.appendChild(meta);

  // the full Rank-IC table, only if the artifact carries one
  const icTable = buildICTable(f.rank_ic, f.rank_ic_source);
  if (icTable) dInner.appendChild(icTable);

  // the source path, the proof-of-origin line
  if (f.source_path) {
    const src = el("p", "factor__source");
    src.appendChild(el("span", "comment mono-label", "//"));
    src.appendChild(el("span", "factor__source-path", f.source_path));
    dInner.appendChild(src);
  }

  detail.appendChild(dInner);
  entry.append(toggle, detail);

  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", open ? "false" : "true");
    entry.classList.toggle("is-open", !open);
    detail.setAttribute("aria-hidden", open ? "true" : "false");
    detail.toggleAttribute("inert", open);
  });

  return entry;
}

// Pick the headline Rank-IC horizon to show on the collapsed row: prefer h21
// (the canonical monthly horizon), else h5, else h63, else any present.
function headlineIC(rankIc) {
  if (!rankIc || typeof rankIc !== "object") return null;
  const order = ["h21", "h5", "h63"];
  for (const k of order) {
    const o = rankIc[k];
    if (o && Number.isFinite(o.mean_rank_ic) && Number.isFinite(o.t_nw)) return o;
  }
  // fall back to the first horizon present with finite numbers
  for (const k of Object.keys(rankIc)) {
    const o = rankIc[k];
    if (o && Number.isFinite(o.mean_rank_ic) && Number.isFinite(o.t_nw)) return o;
  }
  return null;
}

// Build the per-horizon Rank-IC table for the expanded detail. Returns null if
// the artifact carries no IC block, so the page omits rather than invents.
function buildICTable(rankIc, sources) {
  if (!rankIc || typeof rankIc !== "object") return null;
  const horizons = Object.values(rankIc).filter((o) => o && Number.isFinite(o.mean_rank_ic));
  if (!horizons.length) return null;
  horizons.sort((a, b) => (a.horizon_bars || 0) - (b.horizon_bars || 0));

  const wrap = el("div", "factor__ic");
  wrap.appendChild(el("p", "factor__ic-head label", "Rank-IC by horizon (Newey-West t)"));

  const table = el("div", "factor__ic-grid");
  const head = el("div", "factor__ic-row factor__ic-row--head");
  ["Horizon", "Mean IC", "t (NW)", "Hit rate", "IC-IR", "Obs"].forEach((h) => {
    head.appendChild(el("span", "factor__ic-cell", h));
  });
  table.appendChild(head);

  horizons.forEach((o) => {
    const r = el("div", "factor__ic-row");
    r.appendChild(el("span", "factor__ic-cell factor__ic-cell--h", `${o.horizon_bars}d`));
    r.appendChild(el("span", `factor__ic-cell ${o.mean_rank_ic >= 0 ? "factor__num--pos" : "factor__num--neg"}`, o.mean_rank_ic.toFixed(4)));
    r.appendChild(el("span", `factor__ic-cell ${o.t_nw >= 0 ? "factor__num--pos" : "factor__num--neg"}`, o.t_nw.toFixed(2)));
    r.appendChild(el("span", "factor__ic-cell", Number.isFinite(o.hit_rate) ? `${(o.hit_rate * 100).toFixed(1)}%` : "--"));
    r.appendChild(el("span", "factor__ic-cell", Number.isFinite(o.ic_ir) ? o.ic_ir.toFixed(3) : "--"));
    r.appendChild(el("span", "factor__ic-cell", Number.isFinite(o.n_obs) ? String(o.n_obs) : "--"));
    table.appendChild(r);
  });
  wrap.appendChild(table);

  if (Array.isArray(sources) && sources.length) {
    const s = el("p", "factor__ic-source mono-label", sources.join("  |  "));
    wrap.appendChild(s);
  }
  return wrap;
}

// The asset-class filter: three chips (All / Equity / Crypto) that show or hide
// factor rows. Presentational only. Reduced-motion safe (a class toggle, no
// animation). Built into the static markup; this only wires it to the rows.
function wireFilter(body) {
  const chips = $$(".factors__filter-chip");
  if (!chips.length) return;
  const apply = (which) => {
    $$(".factor", body).forEach((r) => {
      const ac = r.dataset.assetClass || "";
      const match = which === "all"
        || (which === "equity" && ac === "us_equity")
        || (which === "crypto" && ac === "crypto_perp");
      r.hidden = !match;
    });
    chips.forEach((c) => {
      const on = c.dataset.filter === which;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (!reduced && ScrollTrigger) {
      requestAnimationFrame(() => { try { ScrollTrigger.refresh(); } catch (_) { /* settles on next scroll */ } });
    }
  };
  chips.forEach((c) => c.addEventListener("click", () => apply(c.dataset.filter)));
  apply("all");
}

// =============================================================================
// 2. COMBINED BOOK  (what survived: sleeves, correlation, in-sample vs forward)
// =============================================================================
function bindBook(d) {
  const b = d.combined_book || {};
  setHook("cb", "name", b.name);
  setHook("cb", "style", b.style);
  setHook("cb", "correlation", Number.isFinite(b.correlation) ? b.correlation.toFixed(3) : null);
  setHook("cb", "correlationNote", b.correlation_note);

  const cs = b.correlation_stress || {};
  setHook("cb", "corrDown", Number.isFinite(cs.down_days) ? cs.down_days.toFixed(2) : null);
  setHook("cb", "corrStress", Number.isFinite(cs.stress_union) ? cs.stress_union.toFixed(2) : null);

  // in-sample (labelled) vs honest forward (deflated). The label discipline is
  // load-bearing: the in-sample card is explicitly NOT the forward expectation.
  const is = b.in_sample || {};
  setHook("cb", "isWindow", is.window);
  setHook("cb", "isSharpe", Number.isFinite(is.sharpe) ? is.sharpe.toFixed(2) : null);
  setHook("cb", "isCagr", fmtPct(is.cagr_pct));
  setHook("cb", "isDd", fmtPct(is.max_drawdown_pct));
  setHook("cb", "isLabel", is.label);

  const fwd = b.honest_forward_expectation || {};
  setHook("cb", "fwdSharpe", fwd.sharpe_range);
  setHook("cb", "fwdReturn", fwd.return_pct_range);
  setHook("cb", "fwdDd", fwd.realistic_worst_drawdown_pct);
  setHook("cb", "fwdReason", fwd.reason);

  // current sleeves: one card per constituent with weight + standalone Sharpe
  const sleeveWrap = $("#bookSleeves");
  if (sleeveWrap && Array.isArray(b.sleeves)) {
    sleeveWrap.textContent = "";
    sleeveWrap.removeAttribute("data-empty");
    b.sleeves.forEach((s) => {
      const card = el("div", "sleeve");
      card.setAttribute("role", "listitem");
      const top = el("div", "sleeve__top");
      top.appendChild(el("span", "sleeve__name", s.name || s.key || "?"));
      if (Number.isFinite(s.weight_pct)) {
        top.appendChild(el("span", "sleeve__weight mono-data", `${s.weight_pct.toFixed(1)}%`));
      }
      card.appendChild(top);

      // a slim weight bar so the split reads at a glance
      if (Number.isFinite(s.weight_pct)) {
        const bar = el("div", "sleeve__bar");
        const fill = el("span", "sleeve__bar-fill");
        fill.dataset.target = String(Math.max(0, Math.min(100, s.weight_pct)));
        bar.appendChild(fill);
        card.appendChild(bar);
      }

      if (s.description) card.appendChild(el("p", "sleeve__desc", s.description));
      if (Number.isFinite(s.standalone_sharpe)) {
        const sh = el("p", "sleeve__sharpe");
        sh.appendChild(el("span", "sleeve__sharpe-label", "Standalone Sharpe"));
        sh.appendChild(el("span", "sleeve__sharpe-val", fmtSharpe(s.standalone_sharpe)));
        card.appendChild(sh);
      }
      sleeveWrap.appendChild(card);
    });

    // grow the weight bars to their target as the section enters view (the same
    // CSS-transition-on-width grammar open.js uses for gauges).
    onReveal(sleeveWrap, () => {
      $$(".sleeve__bar-fill", sleeveWrap).forEach((fill) => {
        if (fill.dataset.target !== undefined) fill.style.width = `${fill.dataset.target}%`;
      });
    });
  }

  // the deflation summary table (the honest "structure survives, magnitude
  // fails" verdict)
  const def = b.deflation || {};
  setHook("cb", "dsrN69", Number.isFinite(def.combined_dsr_at_n69) ? def.combined_dsr_at_n69.toFixed(2) : null);
  setHook("cb", "dsrN518", Number.isFinite(def.combined_dsr_at_n518) ? def.combined_dsr_at_n518.toFixed(2) : null);
  setHook("cb", "dsrGate", Number.isFinite(def.dsr_gate) ? def.dsr_gate.toFixed(2) : null);
  setHook("cb", "dsrEquity", Number.isFinite(def.standalone_equity_dsr) ? def.standalone_equity_dsr.toFixed(3) : null);
  setHook("cb", "dsrCrypto", Number.isFinite(def.standalone_crypto_dsr) ? def.standalone_crypto_dsr.toFixed(3) : null);
  setHook("cb", "deflationNote", def.note);

  // ceilings + grade
  const ceil = b.ceilings || {};
  setHook("cb", "ceilEquity", ceil.equity_capacity_usd);
  setHook("cb", "ceilCrypto", ceil.crypto_carry_capacity_usd);
  setHook("cb", "ceilBtc", ceil.btc_correlation_cap);
  setHook("cb", "ceilSurvivor", ceil.equity_survivor_only);
  setHook("cb", "grade", b.grade);
  setHook("cb", "gradeNote", b.grade_note);
}

// =============================================================================
// 3. DEFLATION GAUNTLET  (crypto-alone NO-DEPLOY null + capacity cliff)
// =============================================================================
function bindGauntlet(d) {
  const g = d.deflation_gauntlet || {};
  setHook("gt", "config", g.tested_configuration);

  const w = g.window || {};
  setHook("gt", "window", w.start_date && w.end_date ? `${w.start_date} to ${w.end_date}` : null);
  setHook("gt", "trials", g.honest_trial_count);

  const best = g.best_config || {};
  const gates = g.gates || {};
  const dsr = best.dsr_shared;
  const dsrGate = gates.dsr_shared_min;
  const pbo = g.pbo_matrix_cscv;
  const pboGate = gates.pbo_max;

  setHook("gt", "bestName", best.name);
  setHook("gt", "dsrVal", Number.isFinite(dsr) ? dsr.toFixed(4) : null);
  setHook("gt", "dsrGate", Number.isFinite(dsrGate) ? dsrGate.toFixed(2) : null);
  setHook("gt", "pboVal", Number.isFinite(pbo) ? pbo.toFixed(4) : null);
  setHook("gt", "pboGate", Number.isFinite(pboGate) ? pboGate.toFixed(2) : null);

  const dsrPass = Number.isFinite(dsr) && Number.isFinite(dsrGate) && dsr >= dsrGate;
  const pboPass = Number.isFinite(pbo) && Number.isFinite(pboGate) && pbo < pboGate;
  prepGauge("dsr", dsr, dsrGate, dsrPass, dsrPass ? "CLEARS GATE" : "BELOW GATE");
  prepGauge("pbo", pbo, pboGate, pboPass, pboPass ? "UNDER GATE" : "OVER GATE");

  const v = g.verdict || {};
  setHook("gt", "outcome", v.outcome);
  setHook("gt", "reason", v.reason);
  setHook("gt", "capacityNote", g.capacity_note);

  // One reveal for the whole board: sweep both gauges + grow the capacity bars.
  const board = $(".gauntlet__board");
  onReveal(board, () => {
    sweepGauge("dsr");
    sweepGauge("pbo");
    buildCapacity(g.capacity_curve);
  });
}

// Identical gauge grammar to open.js: state set now (so the verdict reads
// correctly on first paint), fill swept later on the section's scroll reveal.
function prepGauge(name, val, gate, pass, stateText) {
  const fig = $(`[data-gauge="${name}"]`);
  if (!fig) return;
  if (!Number.isFinite(val)) return;
  const pct = Math.max(0, Math.min(1, val)) * 100;
  const gatePct = Number.isFinite(gate) ? Math.max(0, Math.min(1, gate)) * 100 : null;
  const fill = $(`[data-gt-fill="${name}"]`, fig);
  const gateEl = $(`[data-gt-gate="${name}"]`, fig);
  if (fill) fill.dataset.target = String(pct);
  if (gateEl && gatePct !== null) gateEl.style.left = `${gatePct}%`;
  fig.classList.toggle("is-pass", !!pass);
  fig.classList.toggle("is-fail", !pass);
  const verdict = $(".gauge__verdict", fig);
  if (verdict) {
    verdict.textContent = stateText;
    verdict.classList.toggle("gauge__verdict--pass", !!pass);
    verdict.classList.toggle("gauge__verdict--fail", !pass);
  }
}

function sweepGauge(name) {
  const fig = $(`[data-gauge="${name}"]`);
  if (!fig) return;
  const fill = $(`[data-gt-fill="${name}"]`, fig);
  if (!fill || fill.dataset.target === undefined) return;
  fill.style.width = `${fill.dataset.target}%`;
}

function buildCapacity(curve) {
  const list = $("#capacityBars");
  if (!list || !Array.isArray(curve) || !curve.length) return;
  list.textContent = "";
  list.removeAttribute("data-empty");

  const srs = curve.map((c) => c.sr_ann).filter(Number.isFinite);
  const mag = Math.max(0.5, ...srs.map((s) => Math.abs(s)));

  curve.forEach((c, i) => {
    const row = el("li", "capbar__row");
    const top = el("div", "capbar__top");
    top.appendChild(el("span", "capbar__cap", fmtCap(c.initial_cash_usd) || "--"));
    const neg = c.sr_ann < 0;
    top.appendChild(el("span", `capbar__sr ${neg ? "capbar__sr--neg" : ""}`, Number.isFinite(c.sr_ann) ? `SR ${c.sr_ann.toFixed(3)}` : "--"));
    row.appendChild(top);

    const track = el("div", "capbar__track");
    const zero = el("span", "capbar__zero");
    zero.style.left = "50%";
    const fill = el("span", `capbar__fill ${neg ? "capbar__fill--neg" : ""}`);
    const half = (Math.abs(c.sr_ann) / mag) * 50;
    const apply = () => {
      if (neg) { fill.style.left = `${50 - half}%`; fill.style.width = `${half}%`; }
      else { fill.style.left = "50%"; fill.style.width = `${half}%`; }
    };
    track.append(zero, fill);
    row.appendChild(track);
    list.appendChild(row);
    if (reduced) { apply(); }
    else { requestAnimationFrame(() => gsap.delayedCall(0.06 * i, apply)); }
  });
}

// =============================================================================
// 4. METHODOLOGY  (the validation framework in plain language)
// =============================================================================
function bindMethodology(d) {
  const m = d.methodology || {};
  const list = $("#methodList");
  if (!list) return;

  // The methodology is a set of named blocks, each with a `summary` plain-language
  // line and sometimes a small set of facts. We render them in a fixed, legible
  // order, omitting any block the artifact does not carry.
  const order = [
    { key: "point_in_time", title: "Point-in-time, survivorship-free", facts: (b) => [
      b.survivorship_free === true ? ["Survivorship-free", "yes"] : null,
      b.point_in_time_enforced === true ? ["PIT enforced", "yes"] : null,
    ] },
    { key: "purged_walk_forward", title: "Purged walk-forward", facts: (b) => [
      b.scheme ? ["Scheme", b.scheme] : null,
    ] },
    { key: "deflated_sharpe", title: "Deflated Sharpe Ratio", facts: (b) => [
      Number.isFinite(b.dsr_gate_minimum) ? ["Gate", `DSR >= ${b.dsr_gate_minimum.toFixed(2)}`] : null,
    ] },
    { key: "pbo", title: "Probability of backtest overfitting", facts: (b) => [
      Number.isFinite(b.pbo_gate_maximum) ? ["Gate", `PBO < ${b.pbo_gate_maximum.toFixed(2)}`] : null,
    ] },
    { key: "pre_registration", title: "Pre-registration", facts: (b) => [
      Number.isFinite(b.trial_budget_hard_ceiling) ? ["Trial budget", `${b.trial_budget_hard_ceiling} hard ceiling`] : null,
      b.document_path ? ["Committed", b.document_path] : null,
    ], extra: (b) => b.measure_once_protocol },
    { key: "reproducibility", title: "Reproducibility", facts: (b) => [
      b.claim ? ["We claim", b.claim] : null,
      b.not_claimed ? ["We do not claim", b.not_claimed] : null,
      b.golden_master_test ? ["Golden master", b.golden_master_test] : null,
    ] },
  ];

  list.textContent = "";
  list.removeAttribute("data-empty");
  let n = 0;
  order.forEach((spec) => {
    const block = m[spec.key];
    if (!block || typeof block !== "object") return;
    n += 1;
    const card = el("article", "method");
    const head = el("div", "method__head");
    head.appendChild(el("span", "method__idx mono-label", String(n).padStart(2, "0")));
    head.appendChild(el("h3", "method__title", spec.title));
    card.appendChild(head);

    if (block.summary) card.appendChild(el("p", "method__summary", block.summary));
    if (spec.extra) {
      const x = spec.extra(block);
      if (x) {
        const ex = el("p", "method__extra");
        ex.appendChild(el("span", "method__extra-label label", "Measure-once protocol"));
        ex.appendChild(el("span", "method__extra-text", x));
        card.appendChild(ex);
      }
    }

    const facts = (spec.facts(block) || []).filter(Boolean);
    if (facts.length) {
      const fl = el("dl", "method__facts");
      facts.forEach(([label, val]) => {
        const row = el("div", "method__fact");
        row.appendChild(el("dt", "method__fact-label mono-label", label));
        row.appendChild(el("dd", "method__fact-val mono-label", val));
        fl.appendChild(row);
      });
      card.appendChild(fl);
    }
    list.appendChild(card);
  });

  staggerIn(list, $$(".method", list));
}

// =============================================================================
// 5. RESEARCH FRONTIER  (active, failed and data-gated candidate protocols)
// =============================================================================
function bindFrontier(d) {
  const discovery = d.sleeve_discovery || {};
  const objective = discovery.objective || {};
  const gates = discovery.admission_gates || {};
  const target = objective.portfolio_sharpe_target;
  const count = objective.target_sleeve_count;
  const atlasSection = d.sleeve_atlas || {};
  const atlas = atlasSection.atlas || {};
  const audit = atlasSection.audit || {};
  const lineageAudit = atlasSection.lineage_audit || {};
  const atlasSummary = atlas.summary || {};
  const auditSummary = audit.summary || {};
  const admissionContract = (d.sleeve_admission_contract || {}).contract || {};

  if (Array.isArray(target) && target.length === 2 && Number.isFinite(count)) {
    const drawdown = Number.isFinite(objective.portfolio_max_drawdown_target)
      ? ` and approximately ${(objective.portfolio_max_drawdown_target * 100).toFixed(0)}% maximum drawdown`
      : "";
    setHook(
      "sd",
      "objective",
      `The locked research objective is ${count} evidence-backed sleeves, including at least ${objective.minimum_new_sleeves || 10} new admissions, with an honest out-of-sample portfolio Sharpe of ${target[0].toFixed(1)} to ${target[1].toFixed(1)}${drawdown}. Targets never lower an admission gate.`,
    );
    setHook("sd", "breadth", `${count} sleeves / >= ${objective.minimum_new_sleeves || 10} new`);
  } else if (Array.isArray(target) && target.length === 2 && Array.isArray(count) && count.length === 2) {
    setHook(
      "sd",
      "objective",
      `The research objective is an honest out-of-sample portfolio Sharpe of ${target[0].toFixed(1)} to ${target[1].toFixed(1)} across ${count[0]} to ${count[1]} independent sleeves. It is a research direction, never a promised result.`,
    );
    setHook("sd", "breadth", `${count[0]} to ${count[1]} sleeves`);
  }
  if (Number.isFinite(atlasSummary.cells) && Number.isFinite(atlasSummary.families)) {
    const familyLineage = auditSummary.lineage_families || {};
    setHook("sa", "title", `${atlasSummary.cells.toLocaleString("en-US")} coverage cells. Zero sleeves claimed.`);
    setHook("sa", "families", atlasSummary.families.toLocaleString("en-US"));
    setHook("sa", "cells", atlasSummary.cells.toLocaleString("en-US"));
    setHook("sa", "novel", familyLineage.NOVEL_ATLAS);
    setHook("sa", "active", familyLineage.ACTIVE_FEASIBILITY);
    setHook("sa", "retired", familyLineage.RETIRED_KILLED);
    setHook("sa", "overlap", familyLineage.DUPLICATE_OVERLAP);
    setHook("sa", "lineageDecision", lineageAudit.summary && lineageAudit.summary.decision);
    setHook("sa", "evaluations", Number.isFinite(auditSummary.gate_evaluations) ? auditSummary.gate_evaluations.toLocaleString("en-US") : null);
    setHook("sa", "admitted", Number.isFinite(auditSummary.new_sleeves_admitted) ? String(auditSummary.new_sleeves_admitted) : "0");
    setHook("sa", "contractChecks", Number.isFinite(admissionContract.evidence_checks_per_candidate) ? String(admissionContract.evidence_checks_per_candidate) : null);
    setHook("sa", "executionChecks", Array.isArray(admissionContract.execution_dimensions) ? String(admissionContract.execution_dimensions.length) : null);
    setHook("sa", "boundary", audit.claim_boundary || "Passing taxonomy is not return evidence and does not create a sleeve.");
    setHook(
      "sa",
      "decisions",
      `${auditSummary.ready_for_key_free_feasibility || 0} cells may proceed only to key-free feasibility; ${auditSummary.literature_review_required || 0} remain stopped for cited literature review; ${auditSummary.overlap_review_required || 0} require identity-level overlap resolution; ${auditSummary.retired_killed || 0} are retired/killed and ${auditSummary.forward_only_monitoring || 0} are monitoring a sealed forward-only continuation. Return data opened: ${auditSummary.return_data_opened || 0}. Return identities spent: ${auditSummary.return_hypotheses_spent || 0}.`,
    );
  }
  setHook("sd", "dsr", Number.isFinite(gates.deflated_sharpe_min) ? `>= ${gates.deflated_sharpe_min.toFixed(2)}` : null);
  setHook("sd", "pbo", Number.isFinite(gates.pbo_max) ? `< ${gates.pbo_max.toFixed(2)}` : null);
  setHook(
    "sd",
    "correlation",
    Number.isFinite(gates.average_pairwise_correlation_max) ? `<= ${gates.average_pairwise_correlation_max.toFixed(2)}` : null,
  );

  // The breadth arithmetic, published beside the gate it describes. For most of this programme's
  // life the page showed a portfolio objective and a correlation ceiling next to each other and
  // said nothing about the relationship between them -- and the relationship was the whole story:
  // the ceiling then in force capped the book BELOW the objective at every plausible quality. The
  // verdict below is read from the bundle, never asserted here, so it flips on its own when the
  // arithmetic changes.
  // Look a value up by its numeric suffix rather than by rebuilding the key as a string. The
  // contract's keys are written from Python floats ("..._for_2.0"); reconstructing that suffix in
  // JavaScript makes the page depend on two languages formatting a float identically, which they
  // do not for 2.25 or 1.0. Matching on the parsed number cannot drift.
  const byTarget = (obj, prefix, value) => {
    if (!obj || !Number.isFinite(value)) return null;
    const hit = Object.keys(obj).find(
      (key) => key.startsWith(prefix) && Number.parseFloat(key.slice(prefix.length)) === value,
    );
    return hit ? obj[hit] : null;
  };
  const frontier = discovery.frontier_arithmetic;
  const ceilingWrap = $("#frontierCeiling");
  if (ceilingWrap && frontier && frontier.book_sharpe_ceiling_at_the_gate) {
    const n = frontier.target_sleeve_count;
    const gate = frontier.correlation_gate_in_force;
    const ceiling = frontier.book_sharpe_ceiling_at_the_gate.s_bar_traded_basis;
    const quality = frontier.quality_precondition_at_the_gate || {};
    const measured = quality.s_bar_measured_traded_basis;
    const low = Array.isArray(target) && target.length === 2 ? target[0] : null;
    const high = Array.isArray(target) && target.length === 2 ? target[1] : null;
    const permits = frontier.gate_permits_objective_floor === true;

    if (Number.isFinite(ceiling) && Number.isFinite(low)) {
      ceilingWrap.hidden = false;
      setHook(
        "fa",
        "headline",
        permits
          ? `The gate now reaches ${low.toFixed(1)}.`
          : `The gate alone reaches ${ceiling.toFixed(2)}, not ${low.toFixed(1)}.`,
      );
      setHook(
        "fa",
        "identity",
        `A book's Sharpe is bounded by its own arithmetic: S = s\u0304 \u00d7 \u221a(N / (1 + (N \u2212 1)\u03c1\u0304)). Every figure below follows from that identity at ${n} sleeves and the correlation ceiling actually in force, and is rebuilt from the contract each time it is published.`,
      );
      setHook("fa", "ceiling", `${ceiling.toFixed(2)} at ${n} sleeves`);
      setHook("fa", "floor", low.toFixed(1));
      setHook("fa", "verdict", permits ? "Yes" : "No \u2014 not on its own");
      const qualityNeeded = byTarget(quality, "s_bar_required_for_", low);
      if (Number.isFinite(qualityNeeded)) {
        setHook(
          "fa",
          "quality",
          `s\u0304 >= ${qualityNeeded.toFixed(3)} (measured ${Number.isFinite(measured) ? measured.toFixed(3) : "--"})`,
        );
      }
      const required = (frontier.correlation_required_at_measured_quality || {}).traded_basis || {};
      const rhoLow = byTarget(required, "rho_bar_required_for_", low);
      const rhoHigh = byTarget(required, "rho_bar_required_for_", high);
      if (Number.isFinite(rhoLow)) {
        setHook(
          "fa",
          "rho",
          Number.isFinite(rhoHigh)
            ? `\u03c1\u0304 <= ${rhoLow.toFixed(4)} for ${low.toFixed(1)}, ${rhoHigh.toFixed(4)} for ${high.toFixed(1)}`
            : `\u03c1\u0304 <= ${rhoLow.toFixed(4)}`,
        );
      }
      if (Number.isFinite(frontier.psd_floor_at_target_n)) {
        setHook(
          "fa",
          "psd",
          `\u03c1\u0304 >= ${frontier.psd_floor_at_target_n.toFixed(4)} at ${n} sleeves`,
        );
      }
      setHook(
        "fa",
        "reading",
        `${frontier.honest_reading || ""} The gate in force is \u03c1\u0304 <= ${Number.isFinite(gate) ? gate.toFixed(2) : "--"}.`,
      );
    }
  }

  // The research library. Rendered from public/research-index.json, which scripts/build-papers.mjs
  // derives from the documents that actually exist -- so a new paper appears here by being
  // written, and a list that quietly stops matching the corpus is not possible.
  const libraryWrap = $("#researchLibrary");
  const libraryList = $("#researchLibraryList");
  if (libraryWrap && libraryList) {
    fetch("/research-index.json", { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((index) => {
        const papers = index && Array.isArray(index.papers) ? index.papers : [];
        if (!papers.length) return;
        libraryWrap.hidden = false;
        setHook("rl", "title", `${papers.length} research documents. Published whole.`);
        libraryList.textContent = "";
        papers.forEach((paper) => {
          const item = el("li", "research-library__item");
          const link = el("a", "research-library__link");
          link.href = paper.path;
          link.appendChild(el("span", "research-library__title", paper.title));
          if (paper.description) {
            link.appendChild(el("span", "research-library__desc", paper.description));
          }
          item.appendChild(link);
          libraryList.appendChild(item);
        });
      })
      .catch(() => {});
  }

  const probeWrap = $("#frontierProbeResults");
  const probes = Array.isArray(d.active_probe_results) ? d.active_probe_results : [];
  if (probeWrap && probes.length) {
    probeWrap.hidden = false;
    probeWrap.textContent = "";
    probes.forEach((probe) => {
      const metrics = probe.metrics || {};
      const review = probe.admission_review || {};
      const gateValues = Object.values(probe.gates || {}).filter((value) => typeof value === "boolean");
      const passed = gateValues.filter(Boolean).length;
      const docket = el("article", `probe-docket ${probe.verdict === "KILL" ? "is-kill" : "is-escalate"}`);
      const rail = el("div", "probe-docket__rail");
      rail.appendChild(el("span", "mono-label", "Locked return verdict"));
      rail.appendChild(el("strong", "mono-data", probe.verdict || "--"));
      rail.appendChild(el("p", "display-s", String(probe.id || "probe").replaceAll("_", " ")));
      docket.appendChild(rail);

      const body = el("div", "probe-docket__body");
      const tape = el("dl", "probe-docket__tape");
      [
        ["Net Sharpe", metrics.net_sharpe, 3, ""],
        ["2x cost Sharpe", metrics.net_sharpe_at_2x_costs, 3, ""],
        ["DSR", metrics.dsr, 4, ""],
        ["NW t-stat", metrics.newey_west_t, 2, ""],
        ["Max drawdown", Number.isFinite(metrics.max_drawdown) ? metrics.max_drawdown * 100 : null, 1, "%"],
        ["Research gates", passed, 0, `/${gateValues.length}`],
      ].forEach(([label, value, digits, suffix]) => {
        const item = el("div");
        item.appendChild(el("dt", "mono-label", label));
        const rendered = Number.isFinite(value) ? `${Number(value).toFixed(Number(digits))}${suffix}` : "--";
        item.appendChild(el("dd", "mono-data", rendered));
        tape.appendChild(item);
      });
      body.appendChild(tape);
      const boundary = el("p", "probe-docket__boundary body");
      boundary.appendChild(el("strong", null, "Not an admission. "));
      boundary.appendChild(document.createTextNode(review.claim_boundary || "Full technical eligibility remains unproven."));
      body.appendChild(boundary);
      const links = el("nav", "probe-docket__links");
      links.setAttribute("aria-label", `${probe.id || "probe"} evidence downloads`);
      [
        ["Result", probe.public_result],
        ["Input manifest", "/glassbox/earnings_narrative_change_input_data_manifest.json"],
        ["Diversification", "/glassbox/earnings_narrative_change_diversification.json"],
        ["Pre-registration", "/research/prereg-earnings-narrative-change.md"],
      ].forEach(([label, href]) => {
        if (!href) return;
        const link = el("a", "research-link label", label);
        link.href = href;
        links.appendChild(link);
      });
      body.appendChild(links);
      docket.appendChild(body);
      probeWrap.appendChild(docket);
    });
    staggerIn(probeWrap, $$(".probe-docket", probeWrap));
  }

  const ledger = $("#frontierLedger");
  const candidates = Array.isArray(discovery.candidates) ? discovery.candidates : [];
  if (!ledger || !candidates.length) return;
  ledger.textContent = "";
  ledger.removeAttribute("data-empty");

  candidates.forEach((candidate, index) => {
    const statusLabels = {
      "return-preregistered-ingest-pending": "INGEST / RETURN LOCKED",
      "return-preregistration-pending": "FEASIBILITY PASSED / RETURN UNOPENED",
      "calendar-lineage-pending": "CALENDAR LINEAGE / RETURN UNOPENED",
      "selected-key-free-probe": "KEY-FREE PROBE",
      "key-free-feasibility": "FEASIBILITY QUEUED",
      "data-gated": "DATA GATED",
    };
    const active = [
      "return-preregistered-ingest-pending",
      "return-preregistration-pending",
      "calendar-lineage-pending",
    ]
      .includes(candidate.status);
    const row = el("article", `frontier-row${active ? " is-active" : ""}`);
    row.appendChild(el("span", "frontier-row__index mono-label", String(index + 1).padStart(2, "0")));

    const identity = el("div", "frontier-row__identity");
    identity.appendChild(el(
      "span",
      `frontier-row__status mono-label${active ? " is-active" : ""}`,
      statusLabels[candidate.status] || "RESEARCH QUEUED",
    ));
    identity.appendChild(el("h3", "frontier-row__name", String(candidate.id || "candidate").replaceAll("_", " ")));
    identity.appendChild(el("p", "frontier-row__market mono-label", `${candidate.asset_class || "?"} / ${candidate.horizon || "?"}`));
    row.appendChild(identity);

    const body = el("div", "frontier-row__body");
    if (candidate.mechanism) body.appendChild(el("p", "frontier-row__mechanism", candidate.mechanism));

    const manifest = candidate.manifest;
    const feasibility = candidate.feasibility;
    if (manifest && Number.isFinite(manifest.filings)) {
      body.appendChild(el(
        "p",
        "frontier-row__evidence",
        `${manifest.filings.toLocaleString("en-US")} official 10-K records mapped; ${manifest.pair_eligible_filings.toLocaleString("en-US")} pair-eligible filings; ${manifest.metadata_failures} metadata failures. The locked runner cannot load returns until the corpus is complete.`,
      ));
    } else if (feasibility && Number.isFinite(feasibility.target_anchors)) {
      const outcome = (feasibility.later_outcome_540d_rate * 100).toFixed(1);
      const prior = (feasibility.prior_8k_60d_rate * 100).toFixed(1);
      body.appendChild(el(
        "p",
        "frontier-row__evidence",
        `${feasibility.target_anchors.toLocaleString("en-US")} official target anchors found. Later outcome coverage reached ${outcome}%, but prior deal-state coverage reached only ${prior}%; the pre-written 80% gate failed. No return test was run.`,
      ));
    } else if (feasibility && Number.isFinite(feasibility.coupon_auction_events)) {
      body.appendChild(el(
        "p",
        "frontier-row__evidence",
        `${feasibility.coupon_auction_events.toLocaleString("en-US")} official coupon-auction events passed the locked metadata gates, including ${feasibility.post_2013_events.toLocaleString("en-US")} from 2013 onward. Core fields and event identities were complete; ${(feasibility.at_least_one_day_notice_rate * 100).toFixed(2)}% had at least one day of notice. No prices were opened and zero return identities were spent.`,
      ));
    } else if (feasibility && Number.isFinite(feasibility.metadata_rows)) {
      body.appendChild(el(
        "p",
        "frontier-row__evidence",
        `${feasibility.metadata_rows.toLocaleString("en-US")} official metadata rows across ${feasibility.history_years} years passed schema and identity checks, but exact historical release lineage is ${(feasibility.exact_release_timestamp_lineage_rate * 100).toFixed(0)}% and no tradable-contract map is sealed. The candidate is data-gated. No positions, prices, or returns were opened.`,
      ));
    } else if (feasibility && Number.isFinite(feasibility.scheduled_events)) {
      body.append(el(
        "p",
        "frontier__candidate-evidence body",
        `${feasibility.scheduled_events} official regular FOMC statement events span 2016–2025. Release-time coverage and the 2:00 p.m. ET convention both measured 100%, but point-in-time schedule-revision lineage is 0%. Returns remain unopened and zero identities were spent.`,
      ));
    }
    const tender = candidate.tender_only_document_feasibility;
    const identityTiming = candidate.identity_timing;
    if (feasibility && feasibility.pipeline_status) {
      body.appendChild(el(
        "p",
        "frontier-row__evidence",
        `${feasibility.pipeline_status.replace(/_/g, " ")}. The ${feasibility.pipeline_tests || 0}-test no-return pipeline is implemented. ${feasibility.fail_closed_state || "Every missing seal or failed gate exits nonzero."}`,
      ));
    }
    if (identityTiming && Number.isFinite(identityTiming.two_year_note_auctions)) {
      body.appendChild(el(
        "p",
        "frontier-row__evidence",
        `A second timing audit found ${identityTiming.two_year_note_auctions} two-year auctions, a median ${identityTiming.median_announcement_lead_calendar_days.toFixed(0)} calendar days of formal notice, and ${identityTiming.formal_announcements_with_at_least_ten_calendar_days} events with the 10 calendar days needed even before counting trading sessions. The published 10-session identity remains closed until archived tentative schedules are sealed.`,
      ));
    }
    if (tender && Number.isFinite(tender.documents)) {
      body.appendChild(el(
        "p",
        "frontier-row__evidence",
        `A separately locked tender-only branch downloaded ${tender.documents} target filings and extracted Item 4 from ${(tender.item4_extraction_rate * 100).toFixed(1)}%. It still failed: only ${(tender.unique_price_rate * 100).toFixed(1)}% yielded one safe cash price, while ${(tender.ambiguous_price_rate * 100).toFixed(1)}% were ambiguous and board posture resolved in only ${(tender.recommendation_resolution_rate * 100).toFixed(1)}%. The parser was not retuned and no return test was run.`,
      ));
    }
    const ownershipMetadata = candidate.metadata_feasibility_v2;
    if (ownershipMetadata && Number.isFinite(ownershipMetadata.unique_initial_accessions)) {
      body.appendChild(el(
        "p",
        "frontier-row__evidence",
        "Schema-aware SEC discovery passed: "
          + ownershipMetadata.unique_initial_accessions.toLocaleString("en-US")
          + " initial accessions, " + ownershipMetadata.headers
          + " immutable headers, " + (ownershipMetadata.header_lineage_rate * 100).toFixed(0)
          + "% target/filer lineage, and "
          + (ownershipMetadata.unique_ticker_mapping_rate * 100).toFixed(1)
          + "% contemporaneous ticker coverage with a "
          + (ownershipMetadata.unique_ticker_wilson_95_lower * 100).toFixed(1)
          + "% Wilson lower bound.",
      ));
    }
    const ownershipDocuments = candidate.document_feasibility_v2;
    if (ownershipDocuments && Number.isFinite(ownershipDocuments.documents)) {
      body.appendChild(el(
        "p",
        "frontier-row__evidence",
        "The locked Item 4 stage then failed. Parser v2 resolved "
          + ownershipDocuments.successful_submissions + "/" + ownershipDocuments.documents
          + " submissions and extracted " + ownershipDocuments.item4_extracted + "/"
          + ownershipDocuments.documents + " sections ("
          + (ownershipDocuments.item4_extraction_rate * 100).toFixed(1)
          + "% versus 90% required). No parser v3 or return test was opened.",
      ));
    }

    const facts = el("dl", "frontier-row__facts");
    [
      ["Required evidence", candidate.production_data],
      ["Potential sources", Array.isArray(candidate.provider_options) ? candidate.provider_options.join(" / ") : null],
      ["Kill rule", candidate.kill],
    ].forEach(([label, value]) => {
      if (!value) return;
      const fact = el("div", "frontier-row__fact");
      fact.appendChild(el("dt", "mono-label", label));
      fact.appendChild(el("dd", "", value));
      facts.appendChild(fact);
    });
    body.appendChild(facts);
    if (candidate.literature_review_public) {
      const source = el("p", "frontier-row__source");
      const link = el("a", "research-link label", "Read cited literature review");
      link.href = candidate.literature_review_public;
      source.appendChild(link);
      body.appendChild(source);
    }
    if (feasibility && feasibility.protocol_public) {
      const source = el("p", "frontier-row__source");
      const protocol = el("a", "research-link label", "Read locked feasibility protocol");
      protocol.href = feasibility.protocol_public;
      source.appendChild(protocol);
      if (feasibility.result_public) {
        const result = el("a", "research-link label", "Inspect sealed feasibility result");
        result.href = feasibility.result_public;
        source.append(document.createTextNode(" / "), result);
      }
      body.appendChild(source);
    }
    if (identityTiming && identityTiming.protocol_public && identityTiming.result_public) {
      const source = el("p", "frontier-row__source");
      const protocol = el("a", "research-link label", "Read identity-timing protocol");
      protocol.href = identityTiming.protocol_public;
      const result = el("a", "research-link label", "Inspect identity-timing result");
      result.href = identityTiming.result_public;
      source.append(protocol, document.createTextNode(" / "), result);
      body.appendChild(source);
    }
    row.appendChild(body);
    ledger.appendChild(row);
  });

  staggerIn(ledger, $$(".frontier-row", ledger));
}

// =============================================================================
// 6. ROADMAP  (the honest path to deployment)
// =============================================================================
function bindRoadmap(d) {
  const r = d.roadmap || {};
  setHook("rm", "summary", r.summary);
  setHook("rm", "preArm", r.pre_arm_gates);

  const list = $("#roadmapSteps");
  if (!list || !Array.isArray(r.steps)) return;
  list.textContent = "";
  list.removeAttribute("data-empty");

  const steps = [...r.steps].sort((a, b) => (a.order || 0) - (b.order || 0));
  steps.forEach((s) => {
    const li = el("li", "roadmap__step");
    li.appendChild(el("span", "roadmap__step-idx mono-label", String(s.order).padStart(2, "0")));
    const main = el("div", "roadmap__step-main");
    main.appendChild(el("h3", "roadmap__step-title", s.title || "?"));
    if (s.detail) main.appendChild(el("p", "roadmap__step-detail", s.detail));
    li.appendChild(main);
    list.appendChild(li);
  });

  staggerIn(list, $$(".roadmap__step", list));
}

// =============================================================================
// 7. COLOPHON / VERIFIABILITY  (content hash + generated-at of THIS artifact)
// =============================================================================
function bindColophon(d) {
  setHook("co", "schema", d.schema);
  setHook("co", "hash", shortHash(d.content_hash));
  if (typeof d.generated_at === "string") {
    // show the date portion only; the full ISO stamp is in the artifact
    setHook("co", "generated", d.generated_at.replace("T", " ").replace(/\.\d+.*$/, " UTC"));
  }
}

// =============================================================================
// BOOT
// =============================================================================
async function boot() {
  let d = null;
  try {
    d = await loadJSON(FILE);
  } catch (e) {
    console.error("research bind failed; reserved states retained.", e);
    return;
  }

  bindHero(d);
  bindFactors(d);
  bindBook(d);
  bindGauntlet(d);
  bindMethodology(d);
  bindFrontier(d);
  bindRoadmap(d);
  bindColophon(d);

  // The data rows are injected after fetch, so the page height and trigger
  // positions changed under any ScrollTrigger initScroll already wired. Refresh
  // so our reveal triggers measure against the final layout. Guarded + deferred
  // a frame. No-op under reduced motion (no triggers were created).
  if (!reduced && ScrollTrigger) {
    requestAnimationFrame(() => { try { ScrollTrigger.refresh(); } catch (_) { /* singleton not ready yet; scroll will settle it */ } });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { boot(); });
} else {
  boot();
}
