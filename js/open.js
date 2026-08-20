// =============================================================================
// CANLI CAPITAL / open.js
// -----------------------------------------------------------------------------
// The data binder for /open, the public glass-box hub. It fetches the five
// read-only artifacts the AlphaForge exporter wrote to public/glassbox/*.json
// (kill_log, pre_registration, deflation, track_record, reproducibility) and
// fills the page's data-hooks. It draws the equity curve. It wires the kill-log
// row expand.
//
// HONESTY CONTRACT (the whole point of the glass box):
//   - Every visible number comes from a real artifact. This module NEVER invents
//     a value. If a field is missing on the artifact, the bound element is
//     EMPTIED and marked data-empty so CSS shows the reserved (--) state, or the
//     element is omitted; it is never back-filled with a guess.
//   - The live track record is shown only as it accrues. The artifact already
//     enforces this (live_curve seeds at go-live with no realized marks yet); we
//     render exactly what it says and label the source verbatim.
//
// What it does NOT own: the shared chrome (nav/footer/rail/intro/scene/cursor)
// and the reveal/scroll grammar are the single design system (main.js +
// scroll.js + shell.js), which auto-discover .mask / .reveal-fade etc. on this
// page. This module only binds data and the one local interaction. It is loaded
// before main.js so the bound DOM is in place before the reveal choreography
// measures it; it degrades to a quiet "dormant" state if a fetch fails.
// =============================================================================

// The bundled GSAP + ScrollTrigger singletons (the SAME instances scroll.js and
// the other page modules use, resolved by Vite to one copy). We use only the
// established grammar: a one-shot onEnter that hands a section's data viz its
// reveal as it scrolls into view. No new easing, no second timeline engine.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const BASE = "/glassbox/";
const FILES = {
  kill: "kill_log.json",
  prereg: "pre_registration.json",
  deflation: "deflation.json",
  track: "track_record.json",
  reproduce: "reproducibility.json",
  // The full honest gauntlet (factor research + methodology + verdicts + roadmap),
  // emitted by alphaforge/scripts/research_export.py. Loaded so its content-hash
  // appears in the verifiability rail alongside the five focused views.
  research: "research.json",
  // Capacity & scalability: the book's edge-vs-size decay, emitted by
  // alphaforge/scripts/capacity_export.py. Drives section 05 (the curve + the
  // four-row book table) and appears in the verifiability rail by its hash.
  capacity: "capacity.json",
  // The signed, append-only transparency chain (scripts/transparency_log.py): every published
  // day of the live record, Ed25519-signed and hash-chained, so history is provably un-edited.
  transparency: "transparency_log.json",
};

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The house ease-out, matching --ease-out / scroll.js EASE.out exactly, so the
// data-viz reveals share the one motion signature with the rest of the manifold.
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

// Run `fn` once, when `trigger` scrolls into view, via the shared ScrollTrigger.
// Under reduced motion (or with no ScrollTrigger) we run it immediately so the
// final state is always reached; the reveal is an enhancement, never a gate on
// the data being visible. `start` defaults to the page's 86% enter line.
function onReveal(trigger, fn, start = "top 86%") {
  if (!trigger) return;
  if (reduced || !ScrollTrigger) { fn(); return; }
  // If the element is already past the start line on load (e.g. deep-linked or
  // a very tall viewport), fire immediately rather than wait for a scroll.
  const rect = trigger.getBoundingClientRect();
  if (rect.top < window.innerHeight * 0.86 && rect.bottom > 0) { fn(); return; }
  ScrollTrigger.create({ trigger, start, once: true, onEnter: fn });
}

// ---- small DOM + format helpers --------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Display-layer typographic normalization: the Canli Capital brand uses ZERO em
// dashes anywhere. Artifact prose is the source of truth for VALUES, but any
// stray U+2014 in a sentence is normalized to a spaced hyphen at render time.
// This changes no number and no meaning, only the punctuation glyph, so the page
// can never leak an em dash even if an upstream artifact text drifts.
// 2026-08-06: was em-dash only (\u2014), so EN dashes (\u2013) reached the screen, and this
// helper was only ever called from setHook(). The transparency entries render through el()
// instead, which assigned raw text, so the one page that renders the most artifact prose was
// also the one page still showing em dashes. A headless render check found them; every
// source-level grep says this file is clean, because the dashes live in the DATA.
function normalizeText(s) {
  return String(s).replace(/\s*[\u2014\u2013]\s*/g, " - ");
}

// Set the text of every [data-<ns>="<key>"] hook. If the value is null /
// undefined / NaN we leave the reserved "--" placeholder in the markup intact
// (honesty: omit, never invent).
function setHook(ns, key, value) {
  const sel = `[data-${ns}="${key}"]`;
  if (value === null || value === undefined || value === "") return;
  if (typeof value === "number" && !Number.isFinite(value)) return;
  $$(sel).forEach((el) => { el.textContent = normalizeText(String(value)); });
}

function fmtPct(x, decimals = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(decimals)}%`;
}
function fmtSharpe(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  return x.toFixed(2);
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
function shortHash(h) {
  if (typeof h !== "string") return null;
  const body = h.replace(/^sha256:/, "");
  return `sha256:${body.slice(0, 12)}...${body.slice(-6)}`;
}
// Compact AUM label ($1M / $10M / $100M / $1B) from a dollar figure. Used as a
// fallback when the artifact omits its own aum_label.
function fmtAum(usd) {
  if (!Number.isFinite(usd)) return null;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(usd % 1e9 === 0 ? 0 : 1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(usd % 1e6 === 0 ? 0 : 1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}k`;
  return `$${Math.round(usd)}`;
}
// A signed-percent RANGE label ("+10.5 to +12.0%") from a {low, high} band, or a
// single value, honestly omitting if neither is finite.
function fmtPctRange(low, high, decimals = 1) {
  const a = Number.isFinite(low) ? low : null;
  const b = Number.isFinite(high) ? high : null;
  if (a === null && b === null) return null;
  if (a !== null && b !== null) return `${a.toFixed(decimals)} to ${b.toFixed(decimals)}%`;
  const v = a !== null ? a : b;
  return `${v.toFixed(decimals)}%`;
}
// A Sharpe RANGE label ("0.70 to 0.80") from a {low, high} band.
function fmtSharpeRange(low, high) {
  const a = Number.isFinite(low) ? low : null;
  const b = Number.isFinite(high) ? high : null;
  if (a === null && b === null) return null;
  if (a !== null && b !== null) return `${a.toFixed(2)} to ${b.toFixed(2)}`;
  const v = a !== null ? a : b;
  return v.toFixed(2);
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = normalizeText(text);
  return n;
}

async function loadJSON(name) {
  const res = await fetch(`${BASE}${name}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

// =============================================================================
// 1. LIVE TRACK RECORD
// =============================================================================
function bindTrack(d) {
  if (!d) return;
  setHook("tr", "title", d.title);
  setHook("tr", "summary", d.summary);
  setHook("tr", "status", d.live_status);
  setHook("tr", "liveSource", d.live_source);
  setHook("tr", "goLive", d.go_live_date);
  setHook("tr", "researchLabel", "Simulation history");

  const days = d.live_days_accrued;
  if (Number.isFinite(days)) {
    $$('[data-tr="liveDays"]').forEach((n) => {
      n.textContent = days === 1 ? "Day 01" : `Day ${String(days).padStart(2, "0")}`;
    });
  }

  setHook("tr", "liveNav", fmtMoney(d.live_nav_current_usd));
  setHook("tr", "baseline", fmtMoney(d.live_nav_baseline_usd));
  const ret = fmtPct(d.live_return_pct, 2);
  if (ret) setHook("tr", "liveReturn", ret);

  // honesty policy lines
  const policy = $("[data-tr-policy]");
  if (policy && Array.isArray(d.honesty_policy)) {
    policy.textContent = "";
    d.honesty_policy.forEach((line) => policy.appendChild(el("li", null, line)));
  }

  drawCurve(d);
}

// Draw the equity curve: the labelled simulation history (calm grey) and the
// live paper segment (signal). The two are normalised on one NAV axis and one
// time axis so the live segment reads honestly as "just started" against the
// research backdrop. HiDPI aware; redraws on resize.
//
// REVEAL CHOREOGRAPHY (the BUILD-2 handoff): the curve is not painted on load.
// It hands its reveal to the shared ScrollTrigger, exactly as the headline masks
// and .reveal-fade blocks do, firing once when the track frame enters view. The
// research history draws left-to-right first (a calm grey trace settling in),
// then the live signal segment + its Day-marker arrive a beat later, so the eye
// reads "long simulated past, brief honest present" in the order it is told.
// Reduced-motion is fully safe: under it (or with no ScrollTrigger) the final
// frame is drawn instantly, no progression. Resize always redraws the final
// frame (never re-animates), so the curve is stable after first reveal.
function drawCurve(d) {
  const canvas = $("#trackCanvas");
  const pending = $("#trackPending");
  if (!canvas) return;

  const research = Array.isArray(d.research_curve) ? d.research_curve : [];
  const live = Array.isArray(d.live_curve) ? d.live_curve : [];

  if (research.length < 2 && live.length < 2) {
    if (pending) pending.hidden = false;
    return;
  }
  if (pending) pending.hidden = true;

  const toTs = (s) => Date.parse(`${s}T00:00:00Z`);
  const all = [...research, ...live].filter((p) => p && Number.isFinite(p.nav_usd) && Number.isFinite(toTs(p.date)));
  if (all.length < 2) { if (pending) pending.hidden = false; return; }

  const xs = all.map((p) => toTs(p.date));
  const ys = all.map((p) => p.nav_usd);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const xspan = x1 - x0 || 1;
  const yspan = (y1 - y0) || 1;

  // Pre-resolve each segment's valid points once.
  const validOf = (pts) => pts.filter((p) => p && Number.isFinite(p.nav_usd) && Number.isFinite(toTs(p.date)));
  const researchPts = validOf(research);
  const livePts = validOf(live);

  // Draw the frame at a given progression: research portion `rp` in [0,1] and
  // live portion `lp` in [0,1]. rp/lp = 1 draws the whole segment (final frame).
  const drawFrame = (rp = 1, lp = 1) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.floor(rect.width * dpr));
    const H = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    const padL = 8 * dpr, padR = 8 * dpr, padT = 14 * dpr, padB = 10 * dpr;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const px = (ts) => padL + ((ts - x0) / xspan) * plotW;
    const py = (nav) => padT + (1 - (nav - y0) / yspan) * plotH;

    // baseline (the 100k seed) as a faint hairline if it is in range
    const baseline = Number.isFinite(d.live_nav_baseline_usd) ? d.live_nav_baseline_usd : null;
    if (baseline !== null && baseline >= y0 && baseline <= y1) {
      ctx.strokeStyle = "rgba(136,138,144,0.25)";
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([3 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(padL, py(baseline));
      ctx.lineTo(W - padR, py(baseline));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw a fractional polyline: the first `frac` of the segment by point
    // count, interpolating the final partial edge so the trace grows smoothly
    // rather than snapping vertex to vertex.
    const linePartial = (valid, frac, stroke, width, markLast) => {
      if (valid.length < 1 || frac <= 0) return null;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width * dpr;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const segs = valid.length - 1;
      const reach = frac >= 1 ? segs : segs * frac;
      const whole = Math.floor(reach);
      const partial = reach - whole;
      ctx.beginPath();
      let endX = px(toTs(valid[0].date)), endY = py(valid[0].nav_usd);
      ctx.moveTo(endX, endY);
      for (let i = 1; i <= whole && i < valid.length; i++) {
        endX = px(toTs(valid[i].date)); endY = py(valid[i].nav_usd);
        ctx.lineTo(endX, endY);
      }
      if (partial > 0 && whole + 1 < valid.length) {
        const a = valid[whole], b = valid[whole + 1];
        const ax = px(toTs(a.date)), ay = py(a.nav_usd);
        const bx = px(toTs(b.date)), by = py(b.nav_usd);
        endX = ax + (bx - ax) * partial; endY = ay + (by - ay) * partial;
        ctx.lineTo(endX, endY);
      }
      ctx.stroke();
      // a short segment (Day 1) gets a point marker at its leading edge so the
      // single live mark is visible against the long research trace
      if (markLast && valid.length <= 2) {
        ctx.fillStyle = stroke;
        ctx.beginPath();
        ctx.arc(endX, endY, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      return { x: endX, y: endY };
    };

    linePartial(researchPts, rp, "rgba(196,192,184,0.55)", 1.25, false);
    linePartial(livePts, lp, "#C8553D", 2, true);
  };

  // The animated reveal: research draws over ~0.95s, then the live segment over
  // a short ~0.35s beat. Uses the bundled gsap with the house ease so it shares
  // the manifold's one motion signature. Cancellable, single timeline.
  let revealTl = null;
  const animateReveal = () => {
    if (revealTl) return; // once
    const state = { rp: 0, lp: 0 };
    revealTl = gsap.timeline({ defaults: { ease: EASE_OUT } });
    revealTl.to(state, {
      rp: 1,
      duration: 0.95,
      onUpdate: () => drawFrame(state.rp, 0),
    });
    if (livePts.length >= 1) {
      revealTl.to(state, {
        lp: 1,
        duration: 0.35,
        onUpdate: () => drawFrame(1, state.lp),
      }, "-=0.04");
    }
  };

  // Hand the reveal to the shared scroll grammar; reduced-motion draws instantly.
  const frame = canvas.closest(".track__frame") || canvas;
  if (reduced || !ScrollTrigger) {
    drawFrame(1, 1);
  } else {
    onReveal(frame, animateReveal);
  }

  // Resize always settles to the final frame (never re-animates).
  let raf = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => drawFrame(1, 1));
  }, { passive: true });
}

// =============================================================================
// 2. KILL-LOG LEDGER
// =============================================================================
function bindKillLog(d) {
  if (!d) return;
  setHook("kl", "title", d.title);
  setHook("kl", "summary", d.summary);
  setHook("kl", "honestyNote", d.honesty_note);
  // Tally "Killed" = every death shown in the ledger (gauntlet + screen-stage); the summary
  // text below gives the honest split. Keeps the headline count consistent with the visible rows.
  setHook("kl", "killed", (d.killed_count || 0) + (d.screen_killed_count || 0));
  setHook("kl", "survived", d.survived_count);
  setHook("kl", "gate", Number.isFinite(d.gate_minimum_sharpe) ? `>= ${d.gate_minimum_sharpe.toFixed(2)}` : null);

  const body = $("#ledgerBody");
  if (!body) return;
  const killed = Array.isArray(d.killed_strategies) ? d.killed_strategies : [];
  // screen-stage prototypes (FX): killed at the cheap screen, before engine integration. Honest
  // shape — they carry screen_net_sharpe (not a full-backtest sharpe) and no return/dd/period.
  const screen = (Array.isArray(d.screen_stage_kills) ? d.screen_stage_kills : []).map((s) => ({
    ...s,
    sharpe: s.screen_net_sharpe,
    _screen: true,
  }));
  const kept = Array.isArray(d.survivor_sleeves) ? d.survivor_sleeves : [];
  // gauntlet deaths, then screen deaths, then the survivors (the payoff lands last)
  const rows = [...killed, ...screen, ...kept];
  if (!rows.length) return;

  body.textContent = "";
  body.removeAttribute("data-empty");

  rows.forEach((s, i) => {
    const keep = (s.verdict || "").toUpperCase() === "KEEP";
    const entry = el("button", "ledger__entry");
    entry.type = "button";
    entry.setAttribute("aria-expanded", "false");
    entry.id = `ledger-entry-${i}`;

    const row = el("div", "ledger__row");

    // name cell: readable name + the key
    const nameCell = el("span", "ledger__cell ledger__cell--name");
    const nameBox = el("span", "ledger__name");
    nameBox.appendChild(el("span", "ledger__name-readable", s.readable_name || s.name || "?"));
    if (s.name) nameBox.appendChild(el("span", "ledger__name-key", s.name));
    nameCell.appendChild(nameBox);

    const sharpe = fmtSharpe(s.sharpe);
    const sCell = el("span", `ledger__cell ledger__cell--num ${s.sharpe >= 0 ? "ledger__num--pos" : "ledger__num--neg"}`, sharpe || "--");

    const retCell = el("span", `ledger__cell ledger__cell--num ledger__cell--return ${s.return_pct >= 0 ? "ledger__num--pos" : "ledger__num--neg"}`, fmtPct(s.return_pct, 1) || "--");

    const ddCell = el("span", "ledger__cell ledger__cell--num ledger__cell--dd ledger__num--neg", fmtPct(s.max_drawdown_pct, 1) || "--");

    const perCell = el("span", "ledger__cell ledger__cell--num ledger__cell--period", fmtYears(s.n_days) || "--");

    const vCell = el("span", "ledger__cell ledger__cell--verdict");
    const chipLabel = keep ? "KEEP" : (s._screen ? "KILLED · SCREEN" : "KILLED");
    const chip = el("span", `ledger__chip ${keep ? "ledger__chip--keep" : "ledger__chip--killed"}`, chipLabel);
    vCell.appendChild(chip);

    row.append(nameCell, sCell, retCell, ddCell, perCell, vCell);
    entry.appendChild(row);

    // the reason, expandable
    const reason = el("div", "ledger__reason");
    const rInner = el("div", "ledger__reason-inner");
    if (s.description) rInner.appendChild(el("p", "ledger__reason-text", s.description));
    if (s.reason) rInner.appendChild(el("p", "ledger__reason-text", s.reason));
    const meta = el("div", "ledger__reason-meta");
    const addMeta = (label, val) => { if (val) { const sp = el("span"); sp.innerHTML = `${label} <b></b>`; sp.querySelector("b").textContent = val; meta.appendChild(sp); } };
    addMeta("Period", s.start_date && s.end_date ? `${s.start_date} to ${s.end_date}` : null);
    addMeta("Net Sharpe", sharpe);
    addMeta("Vol (ann)", fmtPct(s.vol_ann_pct, 1));
    addMeta("Turnover (ann)", Number.isFinite(s.turnover_ann) ? `${s.turnover_ann.toFixed(1)}x` : null);
    addMeta("Fees paid", fmtMoney(s.fees_paid_usd));
    if (Number.isFinite(s.funding_net_usd) && s.funding_net_usd !== 0) addMeta("Funding (net)", fmtMoney(s.funding_net_usd));
    if (keep && Number.isFinite(s.book_weight_pct)) addMeta("Book weight", `${s.book_weight_pct.toFixed(1)}%`);
    rInner.appendChild(meta);
    reason.appendChild(rInner);
    entry.appendChild(reason);

    entry.addEventListener("click", () => {
      const open = entry.getAttribute("aria-expanded") === "true";
      entry.setAttribute("aria-expanded", open ? "false" : "true");
    });

    body.appendChild(entry);
  });

  // The ledger rows arrive with a quiet staggered lift as the table enters view,
  // the same enter signature as the landing's pillar rows. Reduced-motion safe:
  // staggerIn no-ops to the resting state under it.
  staggerIn($(".ledger"), $$(".ledger__entry", body));
}

// A single shared row-enter: fade + small lift with a gentle stagger, fired once
// when `container` scrolls into view, via the shared ScrollTrigger and house
// ease. Under reduced motion (or no ScrollTrigger) the rows are simply left in
// their resting visible state, never hidden. This is the same grammar scroll.js
// uses for .pillar / roadmap rows, applied to our injected data rows.
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
// 3. PRE-REGISTRATION
// =============================================================================
function bindPrereg(d) {
  if (!d) return;
  setHook("pr", "title", d.title);
  setHook("pr", "summary", d.summary);
  setHook("pr", "ceiling", d.trial_budget_hard_ceiling);
  setHook("pr", "docPath", d.document_path);
  setHook("pr", "protocol", d.measure_once_protocol);
  setHook("pr", "expected", d.expected_outcome);
  setHook("pr", "actual", d.actual_outcome);

  const list = $("#preregSlots");
  if (!list || !Array.isArray(d.slots)) return;
  list.textContent = "";
  list.removeAttribute("data-empty");

  d.slots.forEach((slot) => {
    const li = el("li", "prereg__slot");
    li.appendChild(el("span", "prereg__slot-idx", String(slot.slot)));

    const main = el("div", "prereg__slot-main");
    main.appendChild(el("span", "prereg__slot-name", slot.name || "?"));
    if (slot.note) main.appendChild(el("span", "prereg__slot-note", slot.note));
    const sh = Number.isFinite(slot.deployed_sharpe) ? slot.deployed_sharpe
      : Number.isFinite(slot.measured_sharpe) ? slot.measured_sharpe : null;
    if (sh !== null) {
      const tag = Number.isFinite(slot.deployed_sharpe) ? "Deployed Sharpe" : "Measured Sharpe";
      const sp = el("span", "prereg__slot-sharpe");
      sp.innerHTML = `${tag} <b></b>`;
      sp.querySelector("b").textContent = sh.toFixed(4);
      main.appendChild(sp);
    }
    li.appendChild(main);

    const outcome = (slot.outcome || slot.decision || "").toUpperCase();
    const stateClass = outcome.includes("PASS") ? "passed"
      : outcome.includes("FAIL") ? "failed"
      : outcome.includes("DROP") ? "dropped"
      : outcome.includes("NULL") ? "null"
      : outcome.includes("UNSPENT") || outcome.includes("RESERV") ? "reserved"
      : "reserved";
    li.appendChild(el("span", `prereg__slot-state prereg__slot-state--${stateClass}`, outcome || slot.decision || "--"));

    list.appendChild(li);
  });

  // Slots lift in with the same staggered enter as the ledger rows.
  staggerIn(list, $$(".prereg__slot", list));
}

// =============================================================================
// 4. DEFLATION BOARD
// =============================================================================
function bindDeflation(d) {
  if (!d) return;
  setHook("df", "title", d.title);
  setHook("df", "summary", d.summary);
  setHook("df", "capacityNote", d.capacity_note);

  const best = d.best_config || {};
  const gates = d.gates || {};
  const dsr = best.dsr_shared;
  const dsrGate = gates.dsr_shared_min;
  const pbo = d.pbo_matrix;
  const pboGate = gates.pbo_max;

  setHook("df", "dsrVal", Number.isFinite(dsr) ? dsr.toFixed(4) : null);
  setHook("df", "dsrGate", Number.isFinite(dsrGate) ? dsrGate.toFixed(2) : null);
  setHook("df", "pboVal", Number.isFinite(pbo) ? pbo.toFixed(4) : null);
  setHook("df", "pboGate", Number.isFinite(pboGate) ? pboGate.toFixed(2) : null);

  // DSR gauge: must REACH the gate; scale 0..1 (DSR is a probability)
  const dsrPass = Number.isFinite(dsr) && Number.isFinite(dsrGate) && dsr >= dsrGate;
  // PBO gauge: must stay UNDER the gate; scale 0..1 (PBO is a probability)
  const pboPass = Number.isFinite(pbo) && Number.isFinite(pboGate) && pbo < pboGate;

  // The gauge state (pass/fail class, verdict text, gate marker) is set NOW so
  // the board reads correctly the instant it renders; only the fill SWEEP is
  // handed to the scroll reveal so the bars grow toward their gate as the
  // section enters view (the established onEnter grammar). Reduced-motion sets
  // the fills instantly inside onReveal.
  prepGauge("dsr", dsr, dsrGate, dsrPass, dsrPass ? "CLEARS GATE" : "BELOW GATE");
  prepGauge("pbo", pbo, pboGate, pboPass, pboPass ? "UNDER GATE" : "OVER GATE");

  const v = d.verdict || {};
  setHook("df", "grade", v.gauntlet_grade);
  setHook("df", "outcome", v.outcome);
  setHook("df", "reason", v.reason);

  // One reveal for the whole board: sweep both gauge fills + grow the capacity
  // bars together when the deflation section scrolls into view.
  const board = $(".deflation__board");
  onReveal(board, () => {
    sweepGauge("dsr");
    sweepGauge("pbo");
    buildCapacity(d.capacity_curve);
  });
}

// Set the gauge's state immediately (class, verdict text, gate marker) and stash
// its target fill so the reveal can sweep to it later. The fill stays at 0 width
// (its CSS rest state) until sweepGauge runs; under reduced motion the verdict
// and gate are still correct on first paint.
function prepGauge(name, val, gate, pass, stateText) {
  const fig = $(`[data-gauge="${name}"]`);
  if (!fig) return;
  if (!Number.isFinite(val)) return;
  // probabilities live in 0..1; clamp to a visible range
  const pct = Math.max(0, Math.min(1, val)) * 100;
  const gatePct = Number.isFinite(gate) ? Math.max(0, Math.min(1, gate)) * 100 : null;
  const fill = $(`[data-df-fill="${name}"]`, fig);
  const gateEl = $(`[data-df-gate="${name}"]`, fig);
  if (fill) fill.dataset.target = String(pct);
  // the gate marker can settle straight away; it is a reference, not a result
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

// Sweep a prepared gauge's fill to its stashed target. The width transition is
// owned by open.css (.gauge__fill { transition: width ... }), so setting the
// width is enough; reduced motion has that transition disabled in CSS, so it
// snaps. Called from the deflation board's scroll reveal.
function sweepGauge(name) {
  const fig = $(`[data-gauge="${name}"]`);
  if (!fig) return;
  const fill = $(`[data-df-fill="${name}"]`, fig);
  if (!fill || fill.dataset.target === undefined) return;
  fill.style.width = `${fill.dataset.target}%`;
}

function buildCapacity(curve) {
  const list = $("#capacityBars");
  if (!list || !Array.isArray(curve) || !curve.length) return;
  list.textContent = "";
  list.removeAttribute("data-empty");

  // symmetric scale around zero so a negative SR reads as a genuine loss
  const srs = curve.map((c) => c.sr_ann).filter(Number.isFinite);
  const mag = Math.max(0.5, ...srs.map((s) => Math.abs(s)));
  const fmtCap = (usd) => {
    if (usd >= 1e9) return `$${(usd / 1e9).toFixed(0)}B`;
    if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
    if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}k`;
    return `$${usd}`;
  };

  curve.forEach((c, i) => {
    const row = el("li", "capbar__row");
    const top = el("div", "capbar__top");
    top.appendChild(el("span", "capbar__cap", fmtCap(c.initial_cash_usd)));
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
    // The bars grow with a short per-row stagger as the board reveals; the width
    // transition is the CSS one (disabled under reduced motion, so it snaps).
    // We build the rows here (inside the board's onReveal) and grow them on the
    // next frame so the transition catches the change from 0.
    if (reduced) { apply(); }
    else { requestAnimationFrame(() => gsap.delayedCall(0.06 * i, apply)); }
  });
}

// =============================================================================
// 5. REPRODUCIBILITY
// =============================================================================
function bindTransparency(d, anchors) {
  if (!d) return;
  // DAYS != ENTRIES. The chain gains an entry on every PUBLISH and the tick publishes hourly, so
  // the entry count runs ~8x the number of calendar dates covered. This rendered entry_count into
  // a slot labelled "days" under the heading "Signed chain" — 371 entries read as "371 days" while
  // the record actually spanned 47 dates and the live book was 13 days old. On the page that says
  // "don't trust us, verify us", that is the worst possible place to overstate.
  // Both are shown now, and days is derived from the entries themselves when the exporter is older
  // than this page, so a stale bundle degrades to the TRUE number rather than the flattering one.
  const distinctDays = Number.isFinite(d.distinct_days)
    ? d.distinct_days
    : (Array.isArray(d.entries) ? new Set(d.entries.map((e) => e && e.date)).size : null);
  setHook("tx", "days", distinctDays);
  setHook("tx", "entries", d.entry_count);
  if (d.head && d.head.chain_hash) setHook("tx", "chainHead", shortHash(d.head.chain_hash));
  if (d.public_key_ed25519_hex) {
    const k = d.public_key_ed25519_hex;
    setHook("tx", "pubKey", k.length > 20 ? `${k.slice(0, 16)}…` : k);
  }
  setHook("tx", "verifyCmd", d.verify);
  // External Bitcoin anchor (OpenTimestamps): an independent clock proving WHEN the head existed,
  // so we cannot backdate. It says nothing about whether the numbers are good — that is reproducibility.
  if (anchors && anchors.head_anchor) {
    const a = anchors.head_anchor;
    const n = anchors.anchor_count;
    const where =
      a.status === "bitcoin"
        ? `Bitcoin block ${a.bitcoin_block_height}`
        : "pending Bitcoin (calendar-attested)";
    setHook("tx", "anchor", `${n} head${n === 1 ? "" : "s"} · ${where}`);
  }
}

function bindCommitment(d) {
  if (!d || !Array.isArray(d.pledge)) return;
  const ul = $("#capacityCommitment");
  if (ul) {
    ul.textContent = "";
    ul.removeAttribute("data-empty");
    d.pledge.forEach((p) => ul.appendChild(el("li", null, p)));
  }
  setHook(
    "commit",
    "sig",
    d.signature_ed25519
      ? `Ed25519-signed, key ${(d.public_key_ed25519_hex || "").slice(0, 16)}… — verify against the published key`
      : "",
  );
}

function bindReproduce(d) {
  if (!d) return;
  setHook("rp", "title", d.title);
  setHook("rp", "summary", d.summary);
  setHook("rp", "claim", d.reproducibility_claim);
  setHook("rp", "notClaimed", d.not_claimed);
  setHook("rp", "factors", d.registered_factors);
  setHook("rp", "noLookAhead", d.no_look_ahead);

  const gm = d.golden_master_test || {};
  setHook("rp", "testFile", gm.file);
  setHook("rp", "testLines", gm.lines);
  setHook("rp", "testPurpose", gm.purpose);

  const cov = $("#reproCoverage");
  if (cov && Array.isArray(gm.coverage)) {
    cov.textContent = "";
    cov.removeAttribute("data-empty");
    gm.coverage.forEach((c) => cov.appendChild(el("li", null, c)));
  }

  const fp = d.fill_price_precision || {};
  setHook("rp", "fillTol", fp.assertion_tolerance);
  const fr = d.funding_reproduction || {};
  setHook("rp", "settlements", Number.isFinite(fr.expected_settlements) ? fr.expected_settlements : null);
  const par = d.factor_parity || {};
  setHook("rp", "parityExact", par.adv_quote_30d ? "abs = 0.0" : null);
}

// =============================================================================
// 5b. CAPACITY & SCALABILITY
// Binds capacity.json: the cliff/threshold facts, a clean Sharpe-vs-AUM curve,
// and the four-row book table ($1M / $10M / $100M / $1B). Every figure carries
// the artifact's own MEASURED / MODELED / FORWARD basis as a badge. Honest by
// construction: a missing field leaves the reserved (--) state, never a guess.
// =============================================================================

// One badge element from a basis string. The badge class drives the dot colour
// (MEASURED = signal, MODELED/FORWARD = grey) in open.css. Unknown bases render
// as a quiet neutral chip so a new basis never throws.
function basisBadge(basis) {
  const b = (basis || "").toUpperCase();
  // Prefix match so compound bases ("MEASURED + STRUCTURAL", "STRUCTURAL")
  // still earn the right dot: anything anchored on MEASURED gets the signal hue.
  const slug = b.startsWith("MEASURED") ? "measured"
    : b.startsWith("MODELED") ? "modeled"
    : b.startsWith("FORWARD") ? "forward"
    : b === "NOT_MEASURED" ? "none"
    : "neutral";
  const span = el("span", `capbadge capbadge--${slug}`);
  span.textContent = normalizeText(b || "--");
  return span;
}

function bindCapacity(d) {
  if (!d) return;
  setHook("cap", "title", d.title);
  setHook("cap", "summary", d.summary);
  setHook("cap", "honesty", d.honesty_note);

  // The two structural callouts (cliff + equity-core threshold).
  const cliff = d.crypto_capacity_cliff || {};
  setHook("cap", "cliffCap", fmtAum(cliff.cap_usd));
  setHook("cap", "cliffNote", cliff.note);
  const cliffBadgeHost = $('[data-cap="cliffBasis"]');
  if (cliffBadgeHost && cliff.basis) { cliffBadgeHost.replaceWith(basisBadge(cliff.basis)); }

  const core = d.equity_core_threshold || {};
  setHook("cap", "coreThreshold", fmtAum(core.aum_usd));
  setHook("cap", "coreNote", core.note);
  const coreBadgeHost = $('[data-cap="coreBasis"]');
  if (coreBadgeHost && core.basis) { coreBadgeHost.replaceWith(basisBadge(core.basis)); }

  // The deflated forward expectation (never the in-sample headline).
  const fwd = d.forward_expectation || {};
  setHook("cap", "fwdFloor", fmtSharpe(fwd.floor_sharpe));
  setHook("cap", "fwdCeiling", fmtSharpe(fwd.ceiling_sharpe));
  setHook("cap", "fwdCentral", fmtSharpe(fwd.central_sharpe));
  if (typeof fwd.net_return_14pct_voltarget_pct === "string") {
    setHook("cap", "fwdReturn", `${fwd.net_return_14pct_voltarget_pct}%`);
  }

  // The four-row book table + the curve both read book_capacity_curve[].
  const curve = Array.isArray(d.book_capacity_curve) ? d.book_capacity_curve : [];
  buildCapTable(curve);

  // Curve + table reveal together when the section enters view (shared grammar).
  const section = $("#capacity");
  onReveal(section, () => {
    drawCapacityCurve(curve);
    staggerIn($(".captable"), $$(".captable__row", $("#capacityTableBody")));
  });
}

function buildCapTable(curve) {
  const body = $("#capacityTableBody");
  if (!body || !curve.length) return;
  body.textContent = "";
  body.removeAttribute("data-empty");

  curve.forEach((r) => {
    const sh = r.book_sharpe_forward || {};
    const ret = r.book_return_natural_vol_pct || {};
    const dd = r.max_dd_assumption || {};
    const w = r.book_weight || {};
    const crypto = r.crypto_sleeve || {};

    const row = el("li", "captable__row");

    // AUM cell
    const aumCell = el("span", "captable__col captable__col--aum");
    aumCell.appendChild(el("span", "captable__aum", r.aum_label || fmtAum(r.aum_usd) || "--"));
    row.appendChild(aumCell);

    // Book Sharpe (forward), with its basis badge
    const shCell = el("span", "captable__col captable__col--num");
    shCell.appendChild(el("span", "captable__num", fmtSharpeRange(sh.low, sh.high) || "--"));
    if (sh.basis) shCell.appendChild(basisBadge(sh.basis));
    row.appendChild(shCell);

    // Return, natural vol (band)
    const retCell = el("span", "captable__col captable__col--num");
    retCell.appendChild(el("span", "captable__num", fmtPctRange(ret.low, ret.high) || "--"));
    row.appendChild(retCell);

    // Max DD assumption (single value, shown as a percent)
    const ddCell = el("span", "captable__col captable__col--num captable__col--dd");
    const ddPct = Number.isFinite(dd.value) ? `${(dd.value * 100).toFixed(1)}%` : "--";
    ddCell.appendChild(el("span", "captable__num captable__num--neg", ddPct));
    row.appendChild(ddCell);

    // What is driving it: the two capacity buckets + a one-line constraint.
    const driveCell = el("span", "captable__col captable__col--drive");
    const wc = Number.isFinite(w.crypto) ? Math.round(w.crypto * 100) : null;
    const we = Number.isFinite(w.equity) ? Math.round(w.equity * 100) : null;
    if (wc !== null && we !== null) {
      const split = el("span", "captable__split");
      // a slim two-part capacity bar: crypto (signal) vs equity (paper-dim)
      const bar = el("span", "captable__bar");
      const cFill = el("span", "captable__bar-seg captable__bar-seg--crypto");
      cFill.style.width = `${wc}%`;
      const eFill = el("span", "captable__bar-seg captable__bar-seg--equity");
      eFill.style.width = `${we}%`;
      bar.append(cFill, eFill);
      const lab = el("span", "captable__split-label mono-label");
      const cryptoStatus = (crypto.capacity_status || "").toUpperCase();
      const cryptoLabel = cryptoStatus === "DECAYED_TO_ZERO"
        ? "crypto decayed"
        : `crypto ${wc}%`;
      lab.textContent = wc === 0 ? "equity core" : `${cryptoLabel} / equity ${we}%`;
      split.append(bar, lab);
      driveCell.appendChild(split);
    }
    if (r.binding_constraint) {
      driveCell.appendChild(el("span", "captable__drive-note body", normalizeText(r.binding_constraint)));
    }
    row.appendChild(driveCell);

    body.appendChild(row);
  });
}

// Draw the forward book Sharpe against deployed AUM on a log-x axis: one calm
// path in the signal hue, a baseline at the deflated floor, and a labelled dot
// at each measured/modeled AUM. The crypto sleeve's MEASURED sr_ann is overlaid
// as faint grey markers where it exists (and is positive enough to read), so the
// eye sees the satellite fading under the book line. HiDPI aware; redraws on
// resize; the reveal is a left-to-right grow handed to the section's onReveal.
function drawCapacityCurve(curve) {
  const canvas = $("#capacityCurveCanvas");
  const pending = $("#capacityCurvePending");
  if (!canvas) return;

  // Use the book forward Sharpe MIDPOINT per AUM as the plotted book value.
  const pts = curve
    .map((r) => {
      const sh = r.book_sharpe_forward || {};
      const mid = (Number.isFinite(sh.low) && Number.isFinite(sh.high))
        ? (sh.low + sh.high) / 2
        : (Number.isFinite(sh.low) ? sh.low : (Number.isFinite(sh.high) ? sh.high : null));
      const crypto = r.crypto_sleeve || {};
      return {
        aum: r.aum_usd,
        book: mid,
        cryptoSr: Number.isFinite(crypto.sr_ann) ? crypto.sr_ann : null,
        label: r.aum_label || fmtAum(r.aum_usd),
      };
    })
    .filter((p) => Number.isFinite(p.aum) && Number.isFinite(p.book));

  if (pts.length < 2) { if (pending) pending.hidden = false; return; }
  if (pending) pending.hidden = true;

  // x is log10(aum); y spans from a touch below zero to a touch above the max
  // book value, so the decay reads as a real slope, not a flat line.
  const lx = pts.map((p) => Math.log10(p.aum));
  const x0 = Math.min(...lx), x1 = Math.max(...lx);
  const xspan = x1 - x0 || 1;
  const books = pts.map((p) => p.book);
  const cryptos = pts.map((p) => p.cryptoSr).filter(Number.isFinite);
  const yMaxRaw = Math.max(...books, ...cryptos, 0.4);
  const yMinRaw = Math.min(...books, ...cryptos, 0);
  const yMax = yMaxRaw + 0.1;
  const yMin = Math.min(yMinRaw, 0) - 0.05;
  const yspan = (yMax - yMin) || 1;

  const drawFrame = (progress = 1) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.floor(rect.width * dpr));
    const H = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    const padL = 30 * dpr, padR = 30 * dpr, padT = 22 * dpr, padB = 26 * dpr;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const px = (aum) => padL + ((Math.log10(aum) - x0) / xspan) * plotW;
    const py = (v) => padT + (1 - (v - yMin) / yspan) * plotH;

    // zero line (a faint reference; the book stays above it the whole way)
    if (yMin < 0 && yMax > 0) {
      ctx.strokeStyle = "rgba(136,138,144,0.25)";
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([3 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(padL, py(0));
      ctx.lineTo(W - padR, py(0));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // crypto sleeve MEASURED markers (faint grey), where they exist
    pts.forEach((p) => {
      if (!Number.isFinite(p.cryptoSr)) return;
      ctx.fillStyle = "rgba(196,192,184,0.45)";
      ctx.beginPath();
      ctx.arc(px(p.aum), py(p.cryptoSr), 3 * dpr, 0, Math.PI * 2);
      ctx.fill();
    });

    // the book line: a fractional grow to `progress`
    const segs = pts.length - 1;
    const reach = progress >= 1 ? segs : segs * progress;
    const whole = Math.floor(reach);
    const partial = reach - whole;
    ctx.strokeStyle = "#C8553D";
    ctx.lineWidth = 2 * dpr;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    let ex = px(pts[0].aum), ey = py(pts[0].book);
    ctx.moveTo(ex, ey);
    for (let i = 1; i <= whole && i < pts.length; i++) {
      ex = px(pts[i].aum); ey = py(pts[i].book);
      ctx.lineTo(ex, ey);
    }
    if (partial > 0 && whole + 1 < pts.length) {
      const a = pts[whole], b = pts[whole + 1];
      const ax = px(a.aum), ay = py(a.book);
      const bx = px(b.aum), by = py(b.book);
      ex = ax + (bx - ax) * partial; ey = ay + (by - ay) * partial;
      ctx.lineTo(ex, ey);
    }
    ctx.stroke();

    // book dots + AUM labels at full progress only (so they arrive once settled)
    if (progress >= 1) {
      ctx.font = `${10 * dpr}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      pts.forEach((p) => {
        ctx.fillStyle = "#C8553D";
        ctx.beginPath();
        ctx.arc(px(p.aum), py(p.book), 3.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(196,192,184,0.7)";
        ctx.fillText(p.label || "", px(p.aum), H - padB + 16 * dpr);
      });
    }
  };

  let revealTl = null;
  const animateReveal = () => {
    if (revealTl) return;
    const state = { p: 0 };
    revealTl = gsap.timeline({ defaults: { ease: EASE_OUT } });
    revealTl.to(state, { p: 1, duration: 1.0, onUpdate: () => drawFrame(state.p) });
  };

  if (reduced || !ScrollTrigger) {
    drawFrame(1);
  } else {
    animateReveal();
  }

  let raf = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => drawFrame(1));
  }, { passive: true });
}

// =============================================================================
// 6. VERIFIABILITY: the content hashes of every artifact this page actually
// loaded, rendered so a visitor can confirm against the files themselves.
// =============================================================================
function bindHashes(loaded) {
  const list = $("#hashList");
  if (!list) return;
  const rows = Object.entries(loaded).filter(([, d]) => d && d.content_hash);
  if (!rows.length) return;
  list.textContent = "";
  list.removeAttribute("data-empty");
  rows.forEach(([name, d]) => {
    const row = el("li", "reproduce__hash-row");
    row.appendChild(el("span", "reproduce__hash-file", FILES[name] || name));
    row.appendChild(el("span", "reproduce__hash-val", shortHash(d.content_hash)));
    list.appendChild(row);
  });
}

// =============================================================================
// 7. HERO KPIs (read from the same artifacts, so they cannot drift)
// =============================================================================
function bindHeroKpis(kill, deflation, track) {
  if (kill) {
    setHook("kpi", "killed", kill.killed_count);
    setHook("kpi", "survived", kill.survived_count);
  }
  if (deflation && deflation.verdict) setHook("kpi", "grade", deflation.verdict.gauntlet_grade);
  if (track && Number.isFinite(track.live_days_accrued)) {
    const days = track.live_days_accrued;
    $$('[data-kpi="liveDays"]').forEach((n) => {
      n.textContent = days === 1 ? "Day 01" : `Day ${String(days).padStart(2, "0")}`;
    });
  }
}

// =============================================================================
// BOOT
// =============================================================================
async function boot() {
  const entries = await Promise.allSettled(
    Object.entries(FILES).map(async ([key, file]) => [key, await loadJSON(file)])
  );
  const data = {};
  entries.forEach((r) => { if (r.status === "fulfilled") { const [k, v] = r.value; data[k] = v; } });

  bindTrack(data.track);
  bindKillLog(data.kill);
  bindPrereg(data.prereg);
  bindDeflation(data.deflation);
  bindCapacity(data.capacity);
  bindReproduce(data.reproduce);
  let anchors = null;
  try {
    const ar = await fetch(`${BASE}ots/anchors.json`, { cache: "no-cache" });
    if (ar.ok) anchors = await ar.json();
  } catch { /* anchor render is best-effort; the chain still binds without it */ }
  bindTransparency(data.transparency, anchors);

  let commitment = null;
  try {
    const cr = await fetch(`${BASE}capacity_commitment.json`, { cache: "no-cache" });
    if (cr.ok) commitment = await cr.json();
  } catch { /* commitment render is best-effort */ }
  bindCommitment(commitment);

  try {
    const fr = await fetch(`${BASE}founder_commitment.json`, { cache: "no-cache" });
    if (fr.ok) {
      const f = await fr.json();
      if (f && f.amount_usd) {
        setHook("tx", "founder", `$${f.amount_usd.toLocaleString()} at first live deploy, signed`);
      }
    }
  } catch { /* founder render is best-effort */ }
  bindHashes(data);
  bindHeroKpis(data.kill, data.deflation, data.track);

  // The data rows are injected asynchronously (after fetch), so the page height
  // and trigger positions changed under any ScrollTrigger that initScroll
  // already wired. Refresh so our reveal triggers measure against the final
  // layout. Guarded + deferred a frame so it runs after these nodes have laid
  // out. No-op under reduced motion (no triggers were created).
  if (!reduced && ScrollTrigger) {
    requestAnimationFrame(() => { try { ScrollTrigger.refresh(); } catch (_) { /* singleton not ready yet; scroll will settle it */ } });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { boot().catch((e) => console.error("glass-box bind failed; reserved states retained.", e)); });
} else {
  boot().catch((e) => console.error("glass-box bind failed; reserved states retained.", e));
}
