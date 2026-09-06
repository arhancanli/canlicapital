// =============================================================================
// CANLI CAPITAL / performance.js
// -----------------------------------------------------------------------------
// Page-specific interactivity for /performance. It is loaded as its own module
// (like js/waitlist.js) so the shared boot (main.js) stays unforked: main.js
// still owns the brand binding, the cursor, the scene, Lenis, and the shared
// scroll grammar. This module adds ONLY what the methodology page needs:
//
//   1. Renders the gauntlet ledger rows and the reserved results fields from the
//      data contract (js/performance_data.js). NO numbers are invented here; the
//      reserved state is rendered by design until STATUS === "live".
//   2. Branches on STATUS: reserved -> honest empty states (the "a chart,
//      pending" slot, the dormant capacity frame); live -> draws the real
//      out-of-sample equity curve and capacity curve from the artifact arrays,
//      and fills the labeled value fields and metric verdicts.
//   3. Drives the page's ONE tentpole beat: the gauntlet pin. The six measures
//      cross-fade inside a pinned frame while the shared manifold tightens onto
//      its single ridge (setConverge). The honest result means the bloom is
//      RESTRAINED, so the resolution dims rather than glorifies. Reduced motion
//      and mobile drop the pin and render the measures as a plain list.
//
// It reuses the SAME bundled gsap / ScrollTrigger singletons as scroll.js (Vite
// dedupes them), so registering more triggers here shares one timeline. The live
// scene is read from window.__meridianScene (set by main.js); every scene call is
// guarded so a no-WebGL / reduced-motion page degrades to no gather, never a throw.
//
// HARD RULE: zero em dashes in any string this file emits.
// =============================================================================

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  STATUS,
  PROVENANCE,
  GAUNTLET,
  GAUNTLET_PARAMS,
  RESULTS_FIELDS,
  EQUITY_CURVE,
  CAPACITY_CURVE,
  RESERVED_COPY,
  isLive,
} from "./performance_data.js";

gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 768px)").matches;

// ---- scene guards (the live scene is owned by main.js) ----------------------
const scene = () => (typeof window !== "undefined" ? window.__meridianScene : null);
const sceneConverge = (v) => {
  const s = scene();
  if (s && typeof s.setConverge === "function") s.setConverge(v);
};

// =============================================================================
// 1. THE GAUNTLET LEDGER
// Renders the six measure rows. Labels, gates, and the honest sentences are real
// and final; the measured value and verdict are reserved until a real artifact.
// =============================================================================
function renderGauntlet() {
  const host = document.getElementById("gauntletList");
  if (!host) return;
  const live = isLive();
  host.innerHTML = "";
  host.setAttribute("role", "list");

  GAUNTLET.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "gauntlet__row";
    row.setAttribute("role", "listitem");

    // the verdict chip + value reflect the honest tri-state
    let chipClass = "chip chip--reserved";
    let chipText = "Reserved";
    if (live && m.passed === true) { chipClass = "chip chip--pass"; chipText = "Clears"; }
    else if (live && m.passed === false) { chipClass = "chip chip--hold"; chipText = "Holds"; }

    const hasValue = live && m.value !== null && m.value !== undefined;
    const valueText = hasValue ? String(m.value) : "--";

    row.innerHTML = `
      <span class="gauntlet__idx mono-label" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
      <div>
        <h3 class="gauntlet__name display-m">${m.label}</h3>
        <span class="gauntlet__gate mono-label">Gate: ${m.gate}</span>
      </div>
      <p class="gauntlet__blurb body">${m.blurb}</p>
      <div class="gauntlet__verdict">
        <span class="gauntlet__value" data-empty="${hasValue ? "0" : "1"}">${valueText}</span>
        <span class="${chipClass}">${chipText}</span>
      </div>
    `;
    host.appendChild(row);
  });
}

// =============================================================================
// 1b. THE GAUNTLET DESIGN PARAMETERS (a terminal-readout dataline of true facts)
// These are facts about how the test is built, not its outcome: the rebalance
// cadence, purge and embargo windowing, the honest trial count fed into the
// deflation, and the literal baseline the strategy must beat. Disclosing them
// requires no validated artifact (they are the test's design), so this line is
// shown in BOTH the reserved and live states. Written as a single mono line that
// scroll.js (.type-mono) reveals left to right like a terminal readout. NO
// performance number is emitted here.
// =============================================================================
function renderGauntletParams() {
  const host = document.getElementById("gauntletParams");
  if (!host) return;
  const p = GAUNTLET_PARAMS;
  // Six design parameters, never a measured result. Wrapped into TWO tiers (3 + 3)
  // so the dense line reads as one labeled block of two rows rather than a single
  // run-on string: the windowing tier (rebalance / purge / embargo) over the
  // validation tier (walk-forward / trials / baseline). Same mono texture; the
  // leading comment glyph keeps it reading as annotation, not a claim. The two
  // tiers are spans so scroll.js's .type-mono reveal still types both rows in order.
  const tierA = [
    `rebalance: ${p.rebalance}`,
    `purge: ${p.purge}`,
    `embargo: ${p.embargo}`,
  ].filter(Boolean);
  const tierB = [
    `walk-forward: ${p.walkForward}`,
    `trials: ${p.trials}`,
    `baseline: ${p.baseline}`,
  ].filter(Boolean);
  host.innerHTML =
    `<span class="gauntlet__params-tier">// ${tierA.join("  /  ")}</span>` +
    `<span class="gauntlet__params-tier">// ${tierB.join("  /  ")}</span>`;
}

// =============================================================================
// 2. THE RESERVED RESULTS FIELDS
// Six labeled fields. Empty (an em-free placeholder) until a validated artifact
// is wired. When live, the value drops in with no redesign.
// =============================================================================
function renderResultFields() {
  const host = document.getElementById("resultFields");
  if (!host) return;
  const live = isLive();
  host.innerHTML = "";

  RESULTS_FIELDS.forEach((f) => {
    const hasValue = live && f.value !== null && f.value !== undefined;
    const valueText = hasValue ? String(f.value) : "--";
    const cell = document.createElement("div");
    // the lead three statistical verdicts carry the emphasized (larger) tier and
    // sit in the panel's left column; the rest are the contextual metadata column.
    cell.className = "results__field" + (f.primary ? " results__field--primary" : "");
    // the unit is its own quiet caption (the gate / span / qualifier), never
    // jammed onto the number, so "0.21" and "gate 0.95" read as value and context.
    const unitMarkup =
      hasValue && f.unit ? `<span class="results__field-unit mono-label">${f.unit}</span>` : "";
    cell.innerHTML = `
      <span class="results__field-label mono-label">${f.label}</span>
      <span class="results__field-value" data-empty="${hasValue ? "0" : "1"}">${valueText}</span>
      ${unitMarkup}
    `;
    host.appendChild(cell);
  });
}

// =============================================================================
// 3. RESERVED-STATE COPY + PANEL STATE
// Bind the honest microcopy from the data file and set the panel's visible state
// label. The reserved caption is shown unless we have a live, non-empty curve.
// =============================================================================
function bindReservedCopy() {
  const slotCap = document.getElementById("resultsPendingCap");
  if (slotCap) slotCap.textContent = RESERVED_COPY.slotCaption;
  const panelNote = document.getElementById("resultsNote");
  if (panelNote) panelNote.textContent = RESERVED_COPY.panelNote;
  const capNote = document.getElementById("capacityNote");
  if (capNote) capNote.textContent = RESERVED_COPY.capacityNote;
  const capPendingCap = document.getElementById("capacityPendingCap");
  if (capPendingCap) capPendingCap.textContent = RESERVED_COPY.capacityNote;

  const stateEl = document.getElementById("resultsState");
  if (stateEl) {
    stateEl.textContent = isLive() ? "[ validated artifact ]" : "[ reserved ]";
  }

  // The reserved cadence line: turns "indefinitely blank" into "actively pending".
  // Names the honest trial count fed into the deflation and the re-run cadence.
  // These are design facts, NOT a result; shown only while reserved (live state
  // is owned by the source line below). Em-dash-free by construction.
  const cadEl = document.getElementById("resultsCadence");
  if (cadEl) {
    if (!isLive() && GAUNTLET_PARAMS) {
      const trials = GAUNTLET_PARAMS.trials ? `${GAUNTLET_PARAMS.trials} configurations tried` : "";
      const cadence = GAUNTLET_PARAMS.cadence || "";
      cadEl.textContent = [cadence, trials].filter(Boolean).join("  /  ");
    } else {
      cadEl.textContent = "";
    }
  }

  // source line under the table, only meaningful when live
  const srcEl = document.getElementById("resultsSource");
  if (srcEl) {
    if (isLive() && PROVENANCE.artifact) {
      const bits = [
        PROVENANCE.artifact ? `Source: ${PROVENANCE.artifact}` : "",
        PROVENANCE.asOf ? `As of ${PROVENANCE.asOf}` : "",
        PROVENANCE.universe ? PROVENANCE.universe : "",
        PROVENANCE.sampleSpan ? `Out-of-sample ${PROVENANCE.sampleSpan}` : "",
      ].filter(Boolean);
      srcEl.textContent = bits.join("  /  ");
    } else {
      srcEl.textContent = "";
    }
  }
}

// =============================================================================
// 3b. FORWARD SHARPE EVIDENCE DOCKET
// Reads the governing contract, sole-writer rollout receipt and maturity verdict
// as three separate authorities. Failure is rendered as a named broken link, not
// hidden behind an empty state or inferred from color.
// =============================================================================
async function renderForwardEvidenceDocket() {
  const receipt = document.getElementById("evidenceReceipt");
  if (!receipt) return;
  const read = async (path) => {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
  };
  const words = (value) => String(value || "UNAVAILABLE").replaceAll("_", " ");

  try {
    const [contract, rollout, maturity] = await Promise.all([
      read("/glassbox/forward_evidence_contract.json"),
      read("/glassbox/crypto_position_attribution_rollout_verification.json"),
      read("/glassbox/forward_evidence_maturity.json"),
    ]);
    const set = (id, value) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    };
    set("evidenceAuthor", `Author / ${contract.author}`);
    set("evidenceContractStatus", "PASS");
    set(
      "evidenceContractCopy",
      `Target ${Number(contract.forward_sharpe_target).toFixed(1)}. ` +
        `${contract.minimum_daily_returns_for_estimate} observations before an estimate; ` +
        `${contract.minimum_daily_returns_for_establishment} before establishment.`,
    );
    set("evidenceRolloutStatus", rollout.passes ? "PASS" : "FAIL CLOSED");
    set("evidenceRolloutCopy", `${words(rollout.status)}. ${rollout.claim_boundary}`);
    set("evidenceMaturityStatus", maturity.provenance_gate?.passes ? "PASS" : "WITHHELD");
    set(
      "evidenceMaturityCopy",
      `${maturity.record.daily_return_observations} of ` +
        `${maturity.sharpe_evidence.estimate_minimum} observations. ` +
        `${maturity.provenance_gate.failed_checks.length} provenance gates remain open. ` +
        `Status: ${words(maturity.sharpe_evidence.underlying_status || maturity.status)}.`,
    );
    const hash = String(maturity.content_hash || "");
    const short = hash.length > 24 ? `${hash.slice(0, 16)}…${hash.slice(-8)}` : hash;
    receipt.textContent = `Maturity receipt / ${short}`;
  } catch (error) {
    document.querySelectorAll(".evidence-chain__status").forEach((node) => {
      node.textContent = "EVIDENCE UNAVAILABLE";
    });
    receipt.textContent = "The machine evidence could not be read. No Sharpe claim is shown.";
    console.warn("Canli Capital /performance evidence docket unavailable", error);
  }
}

// =============================================================================
// 4. CURVE DRAWING (live only)
// Draws a single-hue, line-based curve into a canvas, in the manifold's visual
// language (void ground, one signal accent). Called ONLY when STATUS === "live"
// and the point array is non-empty, so the reserved state never shows a line.
// =============================================================================
function drawCurve(canvas, points, opts = {}) {
  if (!canvas || !points || points.length < 2) return;
  const xKey = opts.xKey || "t";
  const yKey = opts.yKey || "v";
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 600;
  const cssH = canvas.clientHeight || 320;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const xs = points.map((p) => p[xKey]);
  const ys = points.map((p) => p[yKey]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const padX = cssW * 0.06, padY = cssH * 0.12;
  const sx = (x) => padX + ((x - xMin) / (xMax - xMin || 1)) * (cssW - padX * 2);
  const sy = (y) => (cssH - padY) - ((y - yMin) / (yMax - yMin || 1)) * (cssH - padY * 2);

  ctx.beginPath();
  points.forEach((p, i) => {
    const X = sx(p[xKey]); const Y = sy(p[yKey]);
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  });
  ctx.strokeStyle = "#C8553D"; // the one signal hue, matches --signal
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function renderCurvesIfLive() {
  if (!isLive()) return;

  const eq = document.getElementById("resultsCanvas");
  const eqPending = document.getElementById("resultsPending");
  if (eq && EQUITY_CURVE.length >= 2) {
    drawCurve(eq, EQUITY_CURVE, { xKey: "t", yKey: "v" });
    if (eqPending) eqPending.style.display = "none";
  }

  const cap = document.getElementById("capacityCanvas");
  const capPending = document.getElementById("capacityPending");
  if (cap && CAPACITY_CURVE.length >= 2) {
    drawCurve(cap, CAPACITY_CURVE, { xKey: "capital", yKey: "netEdge" });
    if (capPending) capPending.style.display = "none";
  }
}

// =============================================================================
// 4b. THE IDLE WAVEFORMS (reserved state only)
// The two reserved frames (Results and Capacity) lean entirely on copy to read as
// intentional rather than as a failed data load. This draws a powered-on idle into
// each: an instrument at rest, in the manifold's exact visual language (void
// ground, one signal hue, the line aesthetic of drawCurve). Each idle is
// unmistakably NOT a result. There are NO ticks, NO numbers, NO knee point. They
// run ONLY while STATUS is not live; the moment a validated artifact is wired,
// renderCurvesIfLive draws the real curve over the SAME canvas and the idle never
// starts (the honest empty slots are preserved).
//
// BOTH reserved frames use the SAME honest idle: a dead-FLAT baseline with a
// single soft signal pulse traveling along it. A flat line cannot be misread as a
// rising equity curve OR as a capacity envelope (no rise, no fall, no knee), so it
// is impossible to mistake for a fabricated result of either kind. The two frames
// are differentiated only by the pulse DIRECTION (results travels left to right,
// capacity right to left) and a small cadence offset, so they read as two
// instruments in the same world rather than one copied twice, while neither
// implies a single datum. There are NO ticks, NO numbers, NO knee, NO trend.
//
// Performance + a11y: ONE shared rAF (initIdleWaveforms) drives the phase and
// renders only the reserved canvases currently on screen, so two idle waveforms
// NEVER tick as two concurrent loops (IMMERSION_PERF section 1) and there is no
// per-frame allocation. The loop is IntersectionObserver-paused offscreen and
// visibility-stopped on tab-hide, the exact discipline the scene watchdog uses.
// Reduced motion: a single composed static frame each, no animation.
// =============================================================================
function makeIdleWaveform(canvas, variant) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const kind = variant || "results";

  let cssW = 0, cssH = 0, dpr = 1;

  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cssW = canvas.clientWidth || 600;
    cssH = canvas.clientHeight || 320;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // capacity reads its pulse right to left (and on a small phase offset) so the two
  // reserved frames feel like two instruments rather than one copied twice. The
  // baseline stays dead flat in BOTH, so neither can be misread as a result.
  const reverse = kind === "capacity";

  // draw one frame. phase in 0..1 drives the breath; when null the frame is the
  // composed static rest pose (reduced-motion / no-scroll).
  function frame(phase) {
    if (cssW === 0) size();
    ctx.clearRect(0, 0, cssW, cssH);
    const padX = cssW * 0.06;
    const x0 = padX;
    const x1 = cssW - padX;
    let ph = phase == null ? 0.5 : phase;
    if (reverse) {
      // CAPACITY: the pulse travels in and then SETTLES at the rightmost extent (the
      // knee, where added size erodes the edge), distinct from the equity frame's
      // full edge-to-edge sweep. We ease the phase toward 1 (right) and hold it
      // briefly there, so the capacity instrument reads as "the edge fading at scale"
      // rather than a symmetric pass-through. Still a flat baseline: no fabricated
      // knee value, no rise, no number.
      const eased = ph * ph * (3 - 2 * ph); // smoothstep: slow arrival, then dwell
      ph = 0.18 + eased * 0.74; // travel from near-left to the right knee, then hold
    }

    // a dead-flat baseline (deliberately NOT a curve): a faint flat line in the
    // signal hue, well below the brightness of a real drawn curve, so it never
    // imitates a result of any kind (no rise, no fall, no knee).
    const yMid = cssH * 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, yMid);
    ctx.lineTo(x1, yMid);
    ctx.strokeStyle = "rgba(200, 85, 61, 0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // the traveling pulse: a soft, short swell of brightness that glides along the
    // baseline. A small vertical lift at its crest reads as a "breath", never a
    // trend (it returns to flat on both sides).
    const cx = x0 + (x1 - x0) * ph;
    const reach = (x1 - x0) * 0.16; // half-width of the swell
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const x = x0 + (x1 - x0) * t;
      const d = (x - cx) / reach;
      const bump = Math.exp(-d * d) * (cssH * 0.06); // gaussian crest, small
      const y = yMid - bump;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(200, 85, 61, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    // a faint node riding the crest, the one bright point.
    ctx.beginPath();
    ctx.arc(cx, yMid - cssH * 0.06, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200, 85, 61, 0.85)";
    ctx.fill();
  }

  function renderStatic() {
    size();
    frame(null);
  }

  return { size, frame, renderStatic };
}

// One shared driver for ALL reserved idle waveforms. A single rAF advances one
// phase and renders only the canvases whose panels are currently on screen, so we
// never run two concurrent idle loops (IMMERSION_PERF section 1: no fourth loop).
// IO-paused offscreen, visibility-stopped on tab-hide, zero per-frame allocation.
function initIdleWaveforms() {
  if (isLive()) return; // live state is owned by renderCurvesIfLive

  const specs = [
    { canvas: document.getElementById("resultsCanvas"), panel: document.querySelector(".results__panel"), variant: "results" },
    { canvas: document.getElementById("capacityCanvas"), panel: document.querySelector(".capacity__panel"), variant: "capacity" },
  ].filter((s) => s.canvas && s.panel);
  if (!specs.length) return;

  const items = [];
  specs.forEach((s) => {
    const wave = makeIdleWaveform(s.canvas, s.variant);
    if (!wave) return;
    wave.renderStatic(); // composed static rest frame first
    items.push({ wave, panel: s.panel, visible: false });
  });
  if (!items.length) return;

  if (prefersReduced) return; // composed static frames only, never animate

  let phase = 0;
  let raf = 0;
  let running = false;

  function anyVisible() {
    for (let i = 0; i < items.length; i++) if (items[i].visible) return true;
    return false;
  }
  function tick() {
    if (!running) return;
    phase += 0.0045; // slow drift, a calm breath (shared cadence)
    if (phase > 1) phase -= 1;
    for (let i = 0; i < items.length; i++) {
      if (items[i].visible) items[i].wave.frame(phase);
    }
    raf = requestAnimationFrame(tick);
  }
  function startLoop() {
    if (running || document.hidden) return;
    running = true;
    raf = requestAnimationFrame(tick);
  }
  function stopLoop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
  }

  // one IntersectionObserver across both panels; the loop runs while ANY reserved
  // panel is on screen and renders only the visible ones.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const it = items.find((x) => x.panel === entry.target);
      if (it) it.visible = entry.isIntersecting;
    });
    if (anyVisible()) startLoop();
    else stopLoop();
  }, { threshold: 0 });
  items.forEach((it) => io.observe(it.panel));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopLoop();
    else if (anyVisible()) startLoop();
  });

  window.addEventListener("resize", () => {
    clearTimeout(initIdleWaveforms._rt);
    initIdleWaveforms._rt = setTimeout(() => {
      const wasRunning = running;
      items.forEach((it) => it.wave.size());
      if (!wasRunning) items.forEach((it) => it.wave.renderStatic());
    }, 180);
  }, { passive: true });
}

// =============================================================================
// 5. THE GAUNTLET BOARD
// All six measures remain visible in one comparison surface. This replaces the
// long pinned reveal that made readers scroll through one gate at a time.
// =============================================================================
function initGauntletBoard() {
  const pinEl = document.getElementById("gpin");
  const steps = gsap.utils.toArray(".gstep");
  const stepCurrent = document.getElementById("gstepCurrent");
  const stepTotal = document.getElementById("gstepTotal");
  if (stepTotal && steps.length) stepTotal.textContent = String(steps.length).padStart(2, "0");
  if (!pinEl || !steps.length) return;

  // Every gate stays visible. A reader can compare the whole admission contract
  // without spending six viewport-heights revealing one item at a time.
  steps.forEach((step) => {
    step.classList.add("is-active");
    step.classList.remove("is-prev");
  });
  pinEl.classList.remove("is-pinned", "is-resolved");
  if (stepCurrent) stepCurrent.textContent = String(steps.length).padStart(2, "0");
  sceneConverge(null);
}

// =============================================================================
// 5b. THE STANDING-CLOSE SETTLE (the tentpole's quiet payoff)
// As the honest standing close enters view, the manifold settles to its stillest,
// most disciplined pose: the field gathered fully onto the one spine, the camera
// holding dead center (setConverge(1) damps the cursor parallax to a whisper and
// centers the look in scene.js). Stillness, here, IS the immersion. This is NOT a
// second pin (one pin per page): it is a single non-pinning ScrollTrigger that
// drives the gather while #standing is on screen and releases it to the descriptor
// when it leaves, so the held-still beat is reversible and costs one trigger.
// Reduced motion / mobile / no-WebGL: a guarded no-op (the scene call short
// circuits, the close still reveals via CSS / the shared word reveal).
// =============================================================================
function initStandingSettle() {
  const standing = document.getElementById("standing");
  if (!standing || prefersReduced || isMobile) return;

  ScrollTrigger.create({
    trigger: standing,
    // engage as the chapter is well into view so the gather lands WITH the close,
    // not on first sight of the section head.
    start: "top 55%",
    end: "bottom 30%",
    onEnter: () => sceneConverge(1),
    onEnterBack: () => sceneConverge(1),
    // hand the gather back to the high-band descriptor on the way out in either
    // direction (the descriptor already keeps the spine close, never scattered).
    onLeave: () => sceneConverge(null),
    onLeaveBack: () => sceneConverge(null),
  });
}

// =============================================================================
// 6. BOOT
// Render the data-driven markup first, then expose the comparison board and draw
// any live curves. A failsafe guarantees no measure stays hidden.
// =============================================================================
function reveal() {
  // Never strand a measure or field hidden if anything below throws.
  document.querySelectorAll(".gstep").forEach((s) => s.classList.add("is-active"));
  const ghost = document.querySelector(".hero__ghost");
  if (ghost) ghost.classList.add("is-shown");
}

// Fade the hero ghost wordmark in shortly after boot (the curtain lift is ~0.9s).
// Guarded: under reduced motion the CSS shows it; with JS off the .js gate keeps
// it visible. This only adds the .is-shown class on the moving path.
function initHeroGhost() {
  const ghost = document.querySelector(".hero__ghost");
  if (!ghost) return;
  if (prefersReduced) { ghost.classList.add("is-shown"); return; }
  gsap.delayedCall(0.6, () => ghost.classList.add("is-shown"));
}

function boot() {
  try {
    renderGauntlet();
    renderGauntletParams();
    renderResultFields();
    bindReservedCopy();
    renderForwardEvidenceDocket();
    renderCurvesIfLive();
    initIdleWaveforms();
    initHeroGhost();

    // Defer one frame so the shared scene and scroll bootstrap have settled.
    requestAnimationFrame(() => {
      initGauntletBoard();
      initStandingSettle();
      ScrollTrigger.refresh();
    });

    // Redraw live curves on resize (no-op while reserved).
    window.addEventListener("resize", () => {
      clearTimeout(boot._rt);
      boot._rt = setTimeout(renderCurvesIfLive, 180);
    }, { passive: true });

    window.addEventListener("load", () => ScrollTrigger.refresh());
  } catch (err) {
    console.error("Canli Capital /performance enhancement failed; showing static content.", err);
    reveal();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
