// =============================================================================
// CANLI CAPITAL / charts.js
// -----------------------------------------------------------------------------
// THE DATA-VIZ MODULE. One reusable, honest, beautiful chart engine for the
// landing #equity-slot and (next) the /performance results, capacity, and
// gauntlet frames. Three components, one data contract, one mount API.
//
// Binding spec: docs/LANDING10_CHARTS.md. It extends docs/DESIGN_SYSTEM.md,
// docs/IMMERSION_VISION.md, and the existing data contract js/performance_data.js.
// It does NOT fork any of them. The non-negotiables that win on any conflict:
//
//   - ZERO em dashes (U+2014) anywhere in this file (code, comments, captions,
//     titles, descriptions, the table fallback). Use commas, colons, periods, or
//     "to" for ranges. Grep-audited.
//   - ONE signal hue (--signal). No second color, ever. Every color is a token.
//   - HONESTY is the aesthetic. NO fabricated numbers, no sample curve, no fake
//     knee, no placeholder Sharpe. The honest empty state is first-class: a
//     powered-on instrument at rest (a frame, an axis, one live node, true words).
//     isChartLive() gates every drawn line behind a genuinely live, non-trivial
//     payload, so a half-filled artifact can never render a fabricated-looking line.
//   - 60fps, GPU-light, no bundle bloat. Imports ONLY gsap + gsap/ScrollTrigger
//     (the same bundled singletons every other module uses; Vite dedupes them).
//     NO licensed GSAP plugin (DrawSVGPlugin is a trial build, forbidden): we
//     animate native stroke-dashoffset as a plain numeric tween.
//   - Animate transform / opacity / stroke-dashoffset ONLY. Never a layout
//     property (width, height, top, left, margin). SVG is the renderer.
//   - No persistent rAF loop. All draw-in motion is a one-shot GSAP timeline fired
//     ONCE on scroll-enter, self-cleaning. The pending state is STATIC by design.
//   - Reduced motion: draw() composes the final state with no tween.
//   - Accessible: every chart carries <title> + <desc> and a visually-hidden table
//     fallback, so the data (or the honest pending status) is available to AT.
//
// Each component is a pure function of (el, data). Calling it twice on the same
// el clears and re-renders (idempotent, resize-safe). None throws on bad input:
// a missing el, a null data, or a malformed series renders the honest empty state
// and returns a handle whose methods are safe no-ops. A chart enrichment can never
// break the page (the same defensive contract scene.js and landing.js follow).
// =============================================================================

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  STATUS,
  PROVENANCE,
  GAUNTLET,
  EQUITY_CURVE,
  CAPACITY_CURVE,
  RESERVED_COPY,
} from "./performance_data.js";

gsap.registerPlugin(ScrollTrigger);

// The four house eases, mirrored from scroll.js EASE / the CSS --ease-* tokens.
// We use out for reveals and the line draw, settle for node ignition. No new curve.
const EASE = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  settle: "cubic-bezier(0.22, 1, 0.36, 1)",
};

const SVGNS = "http://www.w3.org/2000/svg";

// The shared viewBox coordinate space for the two curve charts. Geometry is
// authored in these units so a pure CSS resize needs no re-render (Section 4.4).
const VB_W = 1000;
const VB_H = 420;

const prefersReducedMedia =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function prefersReduced() {
  return !!(prefersReducedMedia && prefersReducedMedia.matches);
}

let __uid = 0;
function nextId(prefix) {
  __uid += 1;
  return prefix + "-" + __uid;
}

// ---------------------------------------------------------------------------
// SMALL SVG HELPERS (no per-frame allocation: these run once per render only).
// ---------------------------------------------------------------------------
function svgEl(name, attrs) {
  const node = document.createElementNS(SVGNS, name);
  if (attrs) {
    for (const k in attrs) {
      if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
  }
  return node;
}

function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// pure scale helpers. No allocation inside any animation callback (the path
// string is built once per render, not per frame).
function scaleLinear(v, dMin, dMax, rMin, rMax) {
  const span = dMax - dMin || 1;
  return rMin + ((v - dMin) / span) * (rMax - rMin);
}

function log10(v) {
  return Math.log(v) / Math.LN10;
}

// build the polyline "d" string once from already-scaled (x, y) pairs.
function buildPath(xs, ys) {
  let d = "";
  for (let i = 0; i < xs.length; i++) {
    d += (i === 0 ? "M" : "L") + xs[i].toFixed(2) + " " + ys[i].toFixed(2);
  }
  return d;
}

// ===========================================================================
// THE LIVE-DATA GATE
// Returns true ONLY when the contract is genuinely live AND the series it needs
// is present and non-trivial. Anything else (status not exactly "live", an empty
// or sub-two-point series) returns false so the honest empty state shows. This
// mirrors performance_data.js isLive() but ALSO validates the payload, so a half
// filled artifact can never render a fabricated-looking line.
// ===========================================================================
export function isChartLive(data) {
  if (!data || data.status !== "live") return false;
  if (data.kind === "gauntlet") {
    if (!Array.isArray(data.measures) || !data.measures.length) return false;
    // live only if at least one measure carries a real, evaluated value.
    return data.measures.some((m) => m && m.value != null && m.passed != null);
  }
  if (!Array.isArray(data.points) || data.points.length < 2) return false;
  return true;
}

// ===========================================================================
// THE ADAPTER: read the SAME exports /performance reads, return a normalized
// data object. No number is invented here: reserved exports yield the pending
// shell, so the landing and /performance can NEVER disagree about whether a
// result exists. When the operator sets STATUS = "live" and fills the arrays in
// performance_data.js, this returns the live shape and the component draws the
// real curve through update(), with NO chart-code change.
// ===========================================================================
export function fromPerformanceData(kind) {
  const live = STATUS === "live";
  const provenance = live ? PROVENANCE : null;

  if (kind === "capacity") {
    return {
      kind: "capacity",
      status: live ? "live" : "reserved",
      points: live && Array.isArray(CAPACITY_CURVE) ? CAPACITY_CURVE.slice() : [],
      knee: null, // never computed-and-asserted; only an explicit artifact knee.
      caption: RESERVED_COPY.capacityNote,
      provenance,
    };
  }

  if (kind === "gauntlet") {
    return {
      kind: "gauntlet",
      status: live ? "live" : "reserved",
      measures: Array.isArray(GAUNTLET)
        ? GAUNTLET.map((m) => ({
            key: m.key,
            label: m.label,
            gate: m.gate,
            value: live ? m.value : null,
            passed: live ? m.passed : null,
          }))
        : [],
      emphasis: ["dsr", "pbo"],
      caption: RESERVED_COPY.panelNote,
    };
  }

  // equity (default)
  return {
    kind: "equity",
    status: live ? "live" : "reserved",
    points: live && Array.isArray(EQUITY_CURVE) ? EQUITY_CURVE.slice() : [],
    drawdown: false,
    caption: RESERVED_COPY.slotCaption,
    provenance,
  };
}

// ===========================================================================
// SHARED MOUNT SCAFFOLD
// Builds the .chart wrapper, the <svg> with role/title/desc, and the
// visually-hidden table fallback, and wires the draw-on-view ScrollTrigger.
// Returns a base handle the component-specific render fills in.
// ===========================================================================
function makeChart(el, opts, kind) {
  opts = opts || {};

  // build (or reuse) the wrapper inside the host. Idempotent: a second mount on
  // the same host clears the prior chart artifacts but preserves the host's own
  // existing children (the landing slot's label, caption, and link).
  let wrap = el.querySelector(":scope > .chart");
  if (wrap) {
    clear(wrap);
  } else {
    wrap = document.createElement("div");
    wrap.className = "chart chart--" + kind;
    // the chart is the visual GROUND: it sits behind the host's own text/links.
    el.insertBefore(wrap, el.firstChild);
  }

  const titleId = nextId("chart-title");
  const descId = nextId("chart-desc");

  const svg = svgEl("svg", {
    class: "chart__svg",
    viewBox: "0 0 " + VB_W + " " + VB_H,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-labelledby": titleId + " " + descId,
    focusable: "false",
  });
  const title = svgEl("title", { id: titleId });
  const desc = svgEl("desc", { id: descId });
  svg.appendChild(title);
  svg.appendChild(desc);
  wrap.appendChild(svg);

  // the visually-hidden table fallback (the data path for AT and no-CSS render).
  const table = document.createElement("div");
  table.className = "chart__table visually-hidden";
  wrap.appendChild(table);

  const reduced = opts.reducedMotion != null ? !!opts.reducedMotion : prefersReduced();

  return {
    el,
    wrap,
    svg,
    title,
    desc,
    table,
    reduced,
    opts,
    kind,
    _trigger: null,
    _tweens: [],
  };
}

// kill any tweens / trigger a chart owns. Used by destroy() and on re-render.
function teardownMotion(ctx) {
  if (ctx._tweens) {
    ctx._tweens.forEach((t) => t && t.kill && t.kill());
    ctx._tweens.length = 0;
  }
  if (ctx._trigger) {
    ctx._trigger.kill();
    ctx._trigger = null;
  }
  // the pending-state traveling-crest pause/resume trigger (equity pending only).
  if (ctx._scanTrigger) {
    ctx._scanTrigger.kill();
    ctx._scanTrigger = null;
  }
}

// wire the one draw-on-view ScrollTrigger (start: top 82%, once). Reuses the
// shared ScrollTrigger singleton (no new timeline cost) and matches the page's
// word-reveal trigger line. Under reduced motion draw() composes instantly.
function wireDrawOnView(ctx, draw) {
  const drawOnView = ctx.opts.drawOnView != null ? ctx.opts.drawOnView : true;
  if (!drawOnView) return;
  // if ScrollTrigger is unavailable for any reason, just draw now (never strand).
  if (!ScrollTrigger || typeof ScrollTrigger.create !== "function") {
    draw();
    return;
  }
  ctx._trigger = ScrollTrigger.create({
    trigger: ctx.el,
    start: "top 82%",
    once: true,
    onEnter: draw,
  });
}

// ===========================================================================
// 1.1 EQUITY CURVE  (mountEquityCurve)
// The hero component. The out-of-sample equity curve of a validated strategy.
//   Pending: a faint baseline + left axis (the plot frame), one soft signal node
//     centered on the baseline, the honest caption (rendered in surrounding DOM).
//     NO line, NO rise, NO ticks, NO numbers. The node is the one "powered on"
//     tell: the instrument is live and waiting, not broken.
//   Live: the real equity polyline draws in via stroke-dashoffset (left to right,
//     EASE.out, ~1.5s), the final node lands at the right end with a brief pulse,
//     and (optional) a drawdown shade fills under the curve below its running peak.
// ===========================================================================
export function mountEquityCurve(el, data, opts) {
  if (!el) return safeHandle(null);
  const ctx = makeChart(el, opts, "equity");
  const insetX = 0.06; // 6% horizontal inset (matches the existing drawCurve padding)
  const insetY = 0.12; // 12% vertical inset

  function render(d) {
    teardownMotion(ctx);
    clear(ctx.svg);
    ctx.svg.appendChild(ctx.title);
    ctx.svg.appendChild(ctx.desc);

    const live = isChartLive(d);
    const padX = VB_W * insetX;
    const padY = VB_H * insetY;
    const baseY = VB_H - padY; // the resting baseline (pending) and y-floor (live)

    // the plot frame: left axis + baseline (the honest "instrument" frame).
    const frame = svgEl("path", {
      class: "chart__axis",
      d:
        "M" + padX + " " + padY +
        "L" + padX + " " + baseY +
        "L" + (VB_W - padX) + " " + baseY,
      "vector-effect": "non-scaling-stroke",
      fill: "none",
    });
    ctx.svg.appendChild(frame);

    if (!live) {
      // PENDING: one soft signal node resting on the baseline + ONE soft signal
      // pulse that TRAVELS left to right along that baseline on a slow loop (the
      // "instrument powered on and waiting" tell, IMMERSION_VISION 3.3). A FLAT
      // baseline plus a traveling pulse can NEVER be misread as a rising equity
      // curve: the crest never leaves baseY, never rises, draws no line, shows no
      // number. The resting node is the failsafe (visible at rest with no JS / under
      // reduced motion); the traveling crest is the only added motion and it is pure
      // transform/opacity on a single reused element, paused offscreen.
      const xL = padX;
      const xR = VB_W - padX;
      const node = svgEl("circle", {
        class: "chart__node chart__node--pending",
        cx: VB_W / 2,
        cy: baseY,
        r: 5,
      });
      // the traveling crest: a second, fainter signal node that sweeps the baseline.
      // Hidden by default (opacity 0) so a no-JS / reduced-motion read shows only
      // the single resting node, never a stray dot.
      const crest = svgEl("circle", {
        class: "chart__node chart__node--scan",
        cx: xL,
        cy: baseY,
        r: 4,
        opacity: 0,
      });
      ctx.svg.appendChild(crest);
      ctx.svg.appendChild(node);
      setEquityA11y(ctx, d, false);

      // the one gentle "powered on" scale-in on enter, THEN the slow traveling
      // crest loop. transform/opacity only; the loop is paused when the slot is
      // offscreen (a ScrollTrigger toggles play/pause) so it never burns frames out
      // of view, and is never created under reduced motion.
      ctx._draw = () => {
        if (ctx.reduced) return; // composed static: resting node already in place.
        gsap.set(node, { transformOrigin: "center", scale: 0, opacity: 0 });
        // the node ARRIVES: a brief ~90ms ease-in opacity ramp lands the point
        // crisply, while the scale settles over the slower house ease-out. The two
        // run in parallel so the pulse reads as appearing, not dissolving in.
        const nodeIn = gsap.timeline();
        nodeIn.to(node, { opacity: 1, duration: 0.09, ease: "power2.in" }, 0);
        nodeIn.to(node, { scale: 1, duration: 0.6, ease: EASE.out }, 0);
        ctx._tweens.push(nodeIn);
        // the traveling crest: cx sweeps xL -> xR over a slow, calm cadence; opacity
        // breathes in off the left edge and out at the right, so it reads as a single
        // soft pulse passing through, not a shuttling dot. cy is pinned to baseY the
        // whole time (honest: a baseline at rest, no rise).
        const loop = gsap.timeline({ repeat: -1, repeatDelay: 1.1 });
        loop
          .set(crest, { attr: { cx: xL, cy: baseY }, opacity: 0 })
          .to(crest, { opacity: 0.5, duration: 0.6, ease: EASE.out })
          .to(crest, { attr: { cx: xR }, duration: 2.8, ease: "none" }, "<")
          .to(crest, { opacity: 0, duration: 0.6, ease: EASE.out }, ">-0.6");
        ctx._tweens.push(loop);
        // pause the loop while the slot is out of view (cheap, no offscreen frames).
        if (ScrollTrigger && typeof ScrollTrigger.create === "function") {
          ctx._scanTrigger = ScrollTrigger.create({
            trigger: ctx.el,
            start: "top bottom",
            end: "bottom top",
            onToggle: (self) => { if (self.isActive) loop.play(); else loop.pause(); },
          });
        }
      };
      return;
    }

    // LIVE: build the polyline geometry once, then draw it in.
    const pts = d.points;
    const ts = pts.map((p) => p.t);
    const vs = pts.map((p) => p.v);
    const tMin = Math.min.apply(null, ts);
    const tMax = Math.max.apply(null, ts);
    const vMin = Math.min.apply(null, vs);
    const vMax = Math.max.apply(null, vs);
    const xs = new Array(pts.length);
    const ys = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      xs[i] = scaleLinear(ts[i], tMin, tMax, padX, VB_W - padX);
      ys[i] = scaleLinear(vs[i], vMin, vMax, baseY, padY);
    }

    // optional drawdown shade between the curve and its running-max envelope.
    let shade = null;
    if (d.drawdown) {
      let runMax = vs[0];
      const topYs = new Array(pts.length);
      for (let i = 0; i < pts.length; i++) {
        if (vs[i] > runMax) runMax = vs[i];
        topYs[i] = scaleLinear(runMax, vMin, vMax, baseY, padY);
      }
      let dd = "M" + xs[0].toFixed(2) + " " + topYs[0].toFixed(2);
      for (let i = 1; i < pts.length; i++) dd += "L" + xs[i].toFixed(2) + " " + topYs[i].toFixed(2);
      for (let i = pts.length - 1; i >= 0; i--) dd += "L" + xs[i].toFixed(2) + " " + ys[i].toFixed(2);
      dd += "Z";
      shade = svgEl("path", { class: "chart__shade", d: dd, opacity: 0 });
      ctx.svg.appendChild(shade);
    }

    const line = svgEl("path", {
      class: "chart__line",
      d: buildPath(xs, ys),
      "vector-effect": "non-scaling-stroke",
      fill: "none",
    });
    ctx.svg.appendChild(line);

    const endNode = svgEl("circle", {
      class: "chart__node chart__node--end",
      cx: xs[xs.length - 1],
      cy: ys[ys.length - 1],
      r: 5,
    });
    ctx.svg.appendChild(endNode);

    setEquityA11y(ctx, d, true);

    ctx._draw = () => {
      const len = line.getTotalLength ? line.getTotalLength() : VB_W;
      if (ctx.reduced) {
        // composed final state, no tween.
        line.style.strokeDasharray = "none";
        line.style.strokeDashoffset = "0";
        if (shade) shade.setAttribute("opacity", "1");
        return;
      }
      line.style.strokeDasharray = len + "";
      line.style.strokeDashoffset = len + "";
      gsap.set(endNode, { transformOrigin: "center", scale: 0, opacity: 0 });
      const tl = gsap.timeline();
      tl.to(line, { strokeDashoffset: 0, duration: 1.5, ease: EASE.out });
      tl.to(endNode, { scale: 1, opacity: 1, duration: 0.5, ease: EASE.settle }, ">-0.15");
      // a brief signal pulse on the end node (one-shot, transform/opacity only).
      tl.to(endNode, { scale: 1.5, duration: 0.28, ease: EASE.out }, ">");
      tl.to(endNode, { scale: 1, duration: 0.4, ease: EASE.out }, ">");
      if (shade) tl.to(shade, { opacity: 1, duration: 0.6, ease: EASE.out }, "<-0.3");
      // the optional ridge pulse when the curve finishes drawing (guarded scene).
      tl.add(() => pulseScene(), ">-0.2");
      ctx._tweens.push(tl);
    };
  }

  return finishMount(ctx, data, render);
}

// ===========================================================================
// 1.2 CAPACITY CURVE  (mountCapacityCurve)
// sr_ann (annualized Sharpe, y) vs capital (notional USD, LOG x). The point past
// which more size erodes the edge through market impact and funding.
//   Pending: the honest empty frame with faint, UNLABELED log-decade gridlines
//     (vertical hairlines at each power of ten) so it reads as a capacity plot
//     specifically, plus one signal node. NO knee, NO numbers.
//   Live: the curve draws in left to right via stroke-dashoffset. The knee MAY be
//     marked ONLY if data provides an explicit knee point (never computed).
// ===========================================================================
export function mountCapacityCurve(el, data, opts) {
  if (!el) return safeHandle(null);
  const ctx = makeChart(el, opts, "capacity");
  const insetX = 0.06;
  const insetY = 0.12;

  function render(d) {
    teardownMotion(ctx);
    clear(ctx.svg);
    ctx.svg.appendChild(ctx.title);
    ctx.svg.appendChild(ctx.desc);

    const live = isChartLive(d);
    const padX = VB_W * insetX;
    const padY = VB_H * insetY;
    const baseY = VB_H - padY;

    // the plot frame.
    const frame = svgEl("path", {
      class: "chart__axis",
      d:
        "M" + padX + " " + padY +
        "L" + padX + " " + baseY +
        "L" + (VB_W - padX) + " " + baseY,
      "vector-effect": "non-scaling-stroke",
      fill: "none",
    });
    ctx.svg.appendChild(frame);

    // determine the log-x decade range. While reserved (no points) we draw a
    // representative decade frame so the plot reads as a capacity plot, with NO
    // labels and NO knee, so it cannot be misread as a fabricated result.
    let capMin, capMax;
    if (live && d.points.length) {
      const caps = d.points.map((p) => p.capital).filter((c) => c > 0);
      capMin = Math.min.apply(null, caps);
      capMax = Math.max.apply(null, caps);
    } else {
      capMin = 1e4; // a generic decade span for the empty frame only (no label drawn)
      capMax = 1e9;
    }
    const lMin = log10(capMin);
    const lMax = log10(capMax);

    // faint, UNLABELED log-decade gridlines at each integer power of ten.
    const dFrom = Math.ceil(lMin);
    const dTo = Math.floor(lMax);
    for (let p = dFrom; p <= dTo; p++) {
      const x = scaleLinear(p, lMin, lMax, padX, VB_W - padX);
      ctx.svg.appendChild(
        svgEl("path", {
          class: "chart__grid",
          d: "M" + x.toFixed(2) + " " + padY + "L" + x.toFixed(2) + " " + baseY,
          "vector-effect": "non-scaling-stroke",
          fill: "none",
        })
      );
    }

    if (!live) {
      const node = svgEl("circle", {
        class: "chart__node chart__node--pending",
        cx: VB_W / 2,
        cy: baseY,
        r: 5,
      });
      ctx.svg.appendChild(node);
      setCapacityA11y(ctx, d, false);
      ctx._draw = () => {
        if (ctx.reduced) return;
        gsap.set(node, { transformOrigin: "center", scale: 0, opacity: 0 });
        ctx._tweens.push(
          gsap.to(node, { scale: 1, opacity: 1, duration: 0.6, ease: EASE.out })
        );
      };
      return;
    }

    // LIVE: sr_ann (y, linear) vs capital (x, log).
    const pts = d.points;
    const srs = pts.map((p) => p.sr_ann);
    const srMin = Math.min.apply(null, srs);
    const srMax = Math.max.apply(null, srs);
    const xs = new Array(pts.length);
    const ys = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      xs[i] = scaleLinear(log10(pts[i].capital), lMin, lMax, padX, VB_W - padX);
      ys[i] = scaleLinear(pts[i].sr_ann, srMin, srMax, baseY, padY);
    }

    const line = svgEl("path", {
      class: "chart__line",
      d: buildPath(xs, ys),
      "vector-effect": "non-scaling-stroke",
      fill: "none",
    });
    ctx.svg.appendChild(line);

    // the knee marker: ONLY if the artifact states it (never computed-and-asserted).
    let kneeNode = null;
    let kneeLabel = null;
    if (d.knee && d.knee.capital > 0) {
      const kx = scaleLinear(log10(d.knee.capital), lMin, lMax, padX, VB_W - padX);
      const ky = scaleLinear(d.knee.sr_ann, srMin, srMax, baseY, padY);
      kneeNode = svgEl("circle", { class: "chart__node chart__node--end", cx: kx, cy: ky, r: 5 });
      kneeLabel = svgEl("text", {
        class: "chart__label",
        x: kx,
        y: ky - 14,
        "text-anchor": "middle",
      });
      kneeLabel.textContent = formatCapital(d.knee.capital);
      ctx.svg.appendChild(kneeNode);
      ctx.svg.appendChild(kneeLabel);
    }

    setCapacityA11y(ctx, d, true);

    ctx._draw = () => {
      const len = line.getTotalLength ? line.getTotalLength() : VB_W;
      if (ctx.reduced) {
        line.style.strokeDasharray = "none";
        line.style.strokeDashoffset = "0";
        if (kneeNode) gsap.set(kneeNode, { opacity: 1, scale: 1 });
        if (kneeLabel) gsap.set(kneeLabel, { opacity: 1 });
        return;
      }
      line.style.strokeDasharray = len + "";
      line.style.strokeDashoffset = len + "";
      const tl = gsap.timeline();
      tl.to(line, { strokeDashoffset: 0, duration: 1.5, ease: EASE.out });
      if (kneeNode) {
        gsap.set(kneeNode, { transformOrigin: "center", scale: 0, opacity: 0 });
        tl.to(kneeNode, { scale: 1, opacity: 1, duration: 0.5, ease: EASE.settle }, ">-0.2");
      }
      if (kneeLabel) {
        gsap.set(kneeLabel, { opacity: 0 });
        tl.to(kneeLabel, { opacity: 1, duration: 0.4, ease: EASE.out }, ">-0.1");
      }
      ctx._tweens.push(tl);
    };
  }

  return finishMount(ctx, data, render);
}

// ===========================================================================
// 1.3 GAUNTLET / DSR-PBO VISUAL  (mountGauntlet)
// A compact strip of the six gauntlet measures, each a labeled track with a
// verdict marker. The "did it clear the bar" picture in one glance. NOT a curve.
//   Pending: six faint rails, each with the measure label and a HOLLOW signal
//     marker at the gate threshold position. NO value placed (none exists). The
//     reader sees the SHAPE of the test before any result: rigor, not a claim.
//   Live: each track fills a signal segment to the measured position with a solid
//     marker and a chip that reads "Clears" / "Holds" (the same vocabulary
//     performance.js renderGauntlet uses). The DSR and PBO rows render taller (the
//     deflation story). "Holds" reads as calmly as "Clears": one hue, restraint.
// ===========================================================================
export function mountGauntlet(el, data, opts) {
  if (!el) return safeHandle(null);
  const ctx = makeChart(el, opts, "gauntlet");

  function render(d) {
    teardownMotion(ctx);
    clear(ctx.svg);
    ctx.svg.appendChild(ctx.title);
    ctx.svg.appendChild(ctx.desc);

    const measures = Array.isArray(d.measures) ? d.measures : [];
    const live = isChartLive(d);
    const emphasis = Array.isArray(d.emphasis) ? d.emphasis : [];

    // lay out six stacked tracks across the viewBox height. Emphasis rows (dsr,
    // pbo) take a taller slice; the rest share the remainder evenly. We compute
    // band tops once (no per-frame work).
    const padX = VB_W * 0.04;
    const padTop = 18;
    const padBot = 18;
    const usable = VB_H - padTop - padBot;
    const weights = measures.map((m) => (emphasis.indexOf(m.key) >= 0 ? 1.4 : 1));
    const wSum = weights.reduce((a, b) => a + b, 0) || 1;
    const gap = 10;
    const totalGap = gap * Math.max(0, measures.length - 1);
    const unit = (usable - totalGap) / wSum;
    const trackX0 = padX;
    const trackX1 = VB_W - padX;

    const fillTargets = [];
    let y = padTop;
    measures.forEach((m, i) => {
      const h = weights[i] * unit;
      const railY = y + h / 2;
      // the rail (the bar to clear).
      ctx.svg.appendChild(
        svgEl("path", {
          class: "chart__axis chart__track",
          d: "M" + trackX0 + " " + railY.toFixed(2) + "L" + trackX1 + " " + railY.toFixed(2),
          "vector-effect": "non-scaling-stroke",
          fill: "none",
        })
      );

      // the gate threshold marker: a hollow signal marker at a normalized gate
      // position. Gates are qualitative ("> 0 after deflation"), not a numeric
      // coordinate, so the reserved gate marker sits at a fixed reference point
      // (two thirds across the rail) to read as "the bar", NOT as a value. It is
      // hollow, the value (live only) is solid. No number is implied.
      const gateX = scaleLinear(0.66, 0, 1, trackX0, trackX1);
      ctx.svg.appendChild(
        svgEl("circle", {
          class: "chart__node chart__node--gate",
          cx: gateX,
          cy: railY,
          r: 4.5,
        })
      );

      if (live && m.value != null && m.passed != null) {
        // the filled segment to the measured position. The measured position is
        // the artifact's normalized score against its gate; we only ever read it
        // from the artifact (m.pos in 0..1) and never fabricate one. If the
        // artifact does not carry a normalized position, the segment fills to the
        // gate (a pass) or stops short of it (a hold), a coarse but honest read
        // derived solely from the boolean verdict, with no invented magnitude.
        const pos =
          typeof m.pos === "number" ? gsap.utils.clamp(0, 1, m.pos) : m.passed ? 0.66 : 0.42;
        const valX = scaleLinear(pos, 0, 1, trackX0, trackX1);
        const fill = svgEl("path", {
          class: "chart__line chart__fill",
          d: "M" + trackX0 + " " + railY.toFixed(2) + "L" + valX.toFixed(2) + " " + railY.toFixed(2),
          "vector-effect": "non-scaling-stroke",
          fill: "none",
        });
        ctx.svg.appendChild(fill);
        const valNode = svgEl("circle", {
          class: "chart__node chart__node--end",
          cx: valX,
          cy: railY,
          r: 5,
        });
        ctx.svg.appendChild(valNode);
        fillTargets.push({ fill, valNode });
      }

      // the measure label (mono, via CSS) and the verdict chip text.
      const label = svgEl("text", { class: "chart__label", x: trackX0, y: railY - 12 });
      label.textContent = (i + 1 < 10 ? "0" + (i + 1) : "" + (i + 1)) + "  " + m.label;
      ctx.svg.appendChild(label);

      const verdict = live
        ? m.passed === true
          ? "Clears"
          : "Holds"
        : "Reserved";
      const chip = svgEl("text", {
        class: "chart__chip chart__chip--" + (live ? (m.passed ? "pass" : "hold") : "reserved"),
        x: trackX1,
        y: railY - 12,
        "text-anchor": "end",
      });
      chip.textContent = verdict;
      ctx.svg.appendChild(chip);

      y += h + gap;
    });

    setGauntletA11y(ctx, d, live);

    ctx._draw = () => {
      if (ctx.reduced) {
        fillTargets.forEach((t) => {
          t.fill.style.strokeDasharray = "none";
          t.fill.style.strokeDashoffset = "0";
          gsap.set(t.valNode, { opacity: 1, scale: 1 });
        });
        return;
      }
      if (!fillTargets.length) return; // pending: nothing to fill (honest empty)
      const tl = gsap.timeline();
      fillTargets.forEach((t, i) => {
        const len = t.fill.getTotalLength ? t.fill.getTotalLength() : trackX1 - trackX0;
        t.fill.style.strokeDasharray = len + "";
        t.fill.style.strokeDashoffset = len + "";
        gsap.set(t.valNode, { transformOrigin: "center", scale: 0, opacity: 0 });
        tl.to(t.fill, { strokeDashoffset: 0, duration: 0.6, ease: EASE.out }, i * 0.08);
        tl.to(t.valNode, { scale: 1, opacity: 1, duration: 0.4, ease: EASE.settle }, "<0.25");
      });
      ctx._tweens.push(tl);
    };
  }

  return finishMount(ctx, data, render);
}

// ===========================================================================
// SHARED FINISH: run the initial render, wire draw-on-view, and return a handle.
// ===========================================================================
function finishMount(ctx, data, render) {
  ctx._render = render;
  render(normalize(ctx, data));

  const draw = () => {
    if (ctx._draw) ctx._draw();
  };
  wireDrawOnView(ctx, draw);

  return {
    el: ctx.el,
    draw,
    update(next) {
      teardownMotion(ctx);
      render(normalize(ctx, next));
      // a fresh draw-on-view, so the wired-in real data animates on next enter.
      wireDrawOnView(ctx, () => {
        if (ctx._draw) ctx._draw();
      });
    },
    resize() {
      // geometry is in viewBox units, so a pure CSS resize needs no re-render.
      // We re-render only to recompute any inset-dependent geometry cheaply (no
      // tween): re-bind the same data and re-render the static frame.
      render(ctx._lastData || normalize(ctx, data));
    },
    destroy() {
      teardownMotion(ctx);
      if (ctx.wrap && ctx.wrap.parentNode) ctx.wrap.parentNode.removeChild(ctx.wrap);
    },
  };
}

// normalize the incoming data to a guaranteed-safe shape, tagging the kind and
// stashing it for resize(). Malformed input collapses to the pending shell.
function normalize(ctx, data) {
  let d = data && typeof data === "object" ? data : {};
  d = Object.assign({ kind: ctx.kind }, d, { kind: ctx.kind });
  if (ctx.kind === "gauntlet") {
    if (!Array.isArray(d.measures)) d.measures = [];
  } else if (!Array.isArray(d.points)) {
    d.points = [];
  }
  if (d.status !== "live") d.status = "reserved";
  ctx._lastData = d;
  return d;
}

// ===========================================================================
// ACCESSIBILITY: <title> + <desc> + the visually-hidden table fallback.
// Em-dash-free, sourced only from real data. Pending states say "backtest in
// progress, no data yet"; live states state the real points or verdicts.
// ===========================================================================
function setTitleDesc(ctx, titleText, descText) {
  ctx.title.textContent = titleText;
  ctx.desc.textContent = descText;
}

function setEquityA11y(ctx, d, live) {
  setTitleDesc(
    ctx,
    "Out-of-sample equity curve",
    live
      ? "Out-of-sample equity. " + provenanceSentence(d)
      : "Backtest in progress. No result is shown until it clears the validation gauntlet."
  );
  if (!live) {
    ctx.table.innerHTML =
      '<table><caption>Out-of-sample equity curve</caption>' +
      "<tbody><tr><th scope=\"row\">Status</th>" +
      "<td>Backtest in progress, no data yet.</td></tr></tbody></table>";
    return;
  }
  ctx.table.innerHTML = pointsTable("Out-of-sample equity curve", d.points, "t", "v", "Time", "Equity");
}

function setCapacityA11y(ctx, d, live) {
  setTitleDesc(
    ctx,
    "Capacity curve",
    live
      ? "Annualized Sharpe versus deployed capital. " + provenanceSentence(d)
      : "Capacity analysis pending. The curve is drawn only from a validated artifact."
  );
  if (!live) {
    ctx.table.innerHTML =
      '<table><caption>Capacity curve</caption>' +
      "<tbody><tr><th scope=\"row\">Status</th>" +
      "<td>Capacity analysis pending, no data yet.</td></tr></tbody></table>";
    return;
  }
  ctx.table.innerHTML = pointsTable(
    "Capacity curve",
    d.points,
    "capital",
    "sr_ann",
    "Capital (USD)",
    "Annualized Sharpe"
  );
}

function setGauntletA11y(ctx, d, live) {
  setTitleDesc(
    ctx,
    "Validation gauntlet",
    live
      ? "The validation gauntlet verdicts, one row per measure."
      : "Validation gauntlet pending. Six measures, each with a bar to clear, are configured and awaiting a result."
  );
  const measures = Array.isArray(d.measures) ? d.measures : [];
  let rows = "";
  measures.forEach((m) => {
    const verdict = live ? (m.passed === true ? "Clears" : "Holds") : "Reserved";
    const val = live && m.value != null ? String(m.value) : "pending";
    rows +=
      "<tr><th scope=\"row\">" +
      escapeHtml(m.label) +
      "</th><td>Gate: " +
      escapeHtml(m.gate) +
      "</td><td>" +
      escapeHtml(val) +
      "</td><td>" +
      verdict +
      "</td></tr>";
  });
  ctx.table.innerHTML =
    '<table><caption>Validation gauntlet</caption><thead><tr>' +
    "<th scope=\"col\">Measure</th><th scope=\"col\">Gate</th>" +
    "<th scope=\"col\">Value</th><th scope=\"col\">Verdict</th></tr></thead><tbody>" +
    rows +
    "</tbody></table>";
}

// build a down-sampled points table (cap rows so a long curve stays readable).
function pointsTable(caption, points, xKey, yKey, xHead, yHead) {
  const maxRows = 24;
  const step = Math.max(1, Math.ceil(points.length / maxRows));
  let rows = "";
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    rows +=
      "<tr><td>" + escapeHtml(String(p[xKey])) + "</td><td>" + escapeHtml(String(p[yKey])) + "</td></tr>";
  }
  return (
    "<table><caption>" +
    escapeHtml(caption) +
    "</caption><thead><tr><th scope=\"col\">" +
    escapeHtml(xHead) +
    "</th><th scope=\"col\">" +
    escapeHtml(yHead) +
    "</th></tr></thead><tbody>" +
    rows +
    "</tbody></table>"
  );
}

function provenanceSentence(d) {
  const p = d && d.provenance;
  if (!p) return "Sourced from a validated artifact.";
  const bits = [];
  if (p.universe) bits.push(p.universe);
  if (p.sampleSpan) bits.push("out-of-sample " + p.sampleSpan);
  if (p.asOf) bits.push("as of " + p.asOf);
  return bits.length ? bits.join(", ") + "." : "Sourced from a validated artifact.";
}

function formatCapital(c) {
  if (c >= 1e9) return (c / 1e9).toFixed(c % 1e9 === 0 ? 0 : 1) + "B";
  if (c >= 1e6) return (c / 1e6).toFixed(c % 1e6 === 0 ? 0 : 1) + "M";
  if (c >= 1e3) return (c / 1e3).toFixed(c % 1e3 === 0 ? 0 : 1) + "K";
  return String(c);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// the guarded scene pulse (the scene is owned by main.js; guard every call so a
// no-WebGL / reduced-motion page degrades to a silent no-op, never a throw).
function pulseScene() {
  const s = typeof window !== "undefined" ? window.__meridianScene : null;
  if (s && typeof s.pulseRidge === "function") s.pulseRidge();
}

// a safe no-op handle for a missing host: every method is a silent no-op so a
// chart enrichment can never break the page.
function safeHandle(el) {
  return {
    el: el || null,
    draw() {},
    update() {},
    resize() {},
    destroy() {},
  };
}
