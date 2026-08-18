// =============================================================================
// CANLI CAPITAL / systems-page.js
// -----------------------------------------------------------------------------
// The interactive layer for /systems ONLY. It is loaded exclusively by
// systems.html, after js/main.js has booted the shared system (the shell, the
// brand binding, the cursor, the Lenis + GSAP scroll choreography, and the
// Manifold scene). It adds the page's own scroll-orchestrated diagram motion on
// top of that shared grammar; it never forks a second motion language and never
// re-skins the cursor, tokens, or scene.
//
// What it owns, all built from the shared vocabulary:
//   1. The pipeline spine (.sys-pipe): a desktop chain-of-custody tracker on the
//      right edge. As each architecture chapter becomes the active one it lights
//      that stage's node and fills the connector down to it, so the reader
//      watches the six-stage pipeline assemble as they descend (data -> factors
//      -> portfolio -> backtester -> overlays -> paper loop). It also offers
//      click-to-scroll to any stage.
//   2. The per-chapter schematic reveals: the factor families ledger (.sys-fam),
//      the lineage / paper-loop flow strips (.sys-flow__cell), the portfolio
//      brake panels (.sys-panel), and the gauntlet tests (.sys-test) each enter
//      with a content-aware stagger using the house ease-out, matching the
//      landing's .pillar / .roadmap__row reveal feel exactly.
//   3. The drawdown-ladder fill (.sys-ladder -> .is-in) and the gauntlet seam
//      draw (.sys-gauntlet -> .is-drawn), the two bespoke connective gestures.
//   4. The chain-of-custody pin (.cpin): the page's ONE tentpole beat (the
//      structural gap it previously lacked, while the other three pages each had a
//      pinned scene-coupled climax). Six engine stages cross-fade inside a pinned
//      frame while the shared manifold's lattice TIGHTENS to a MID convergence
//      (~0.55: /systems is the FORMING chapter, the verdict resolves on
//      /performance). The paper loop, the last stage, is the culmination: it locks
//      lit with the page's single RESTRAINED flareBloom, reusing the scene's public
//      flareBloom() through the same window handle main.js exposes. It reuses the
//      EXACT pin grammar of performance.js / progress.js, so the four pages share
//      one motion language. Guarded so a missing method / no-WebGL is a silent
//      no-op; reduced motion and mobile drop the pin (the six chapters above are
//      the canonical reference, so nothing is lost).
//
// Accessibility + safety contract (identical to the shared layer):
//   - Honors prefers-reduced-motion: everything reveals instantly, no spine
//     animation, no flare. The CSS already keeps every diagram visible in that
//     mode; this module simply does not hide-then-reveal.
//   - Every diagram element is only ever HIDDEN by CSS when html.js is set AND
//     motion is allowed, and this module always reveals what it hid, so a thrown
//     error or a never-firing observer can never strand a diagram blank.
//   - No layout-thrashing properties are animated (transform + opacity only).
//   - Heavy work is gated behind IntersectionObserver; nothing runs off-screen.
// =============================================================================

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isDesktop = window.matchMedia("(min-width: 1025px)").matches;
const isMobile = window.matchMedia("(max-width: 768px)").matches;

// The house ease-out, mirrored from styles.css / scroll.js so the page's motion
// is the same curve as everything else. Kept local (not imported) so this module
// has no coupling to scroll.js internals.
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

// Reach the live Manifold scene the same way main.js exposes it. It may be null
// (no-WebGL / mobile fallback); every call is guarded so a missing scene or a
// missing method is a silent no-op, exactly as scroll.js does it.
const scene = () => (typeof window !== "undefined" ? window.__meridianScene : null);
function sceneFlare() {
  const s = scene();
  if (s && typeof s.flareBloom === "function") s.flareBloom();
}
function sceneConverge(v) {
  const s = scene();
  if (s && typeof s.setConverge === "function") s.setConverge(v);
}
function scenePulse() {
  const s = scene();
  if (s && typeof s.pulseRidge === "function") s.pulseRidge();
}

// ---------------------------------------------------------------------------
// Generic "reveal a set on enter, with a small stagger" helper. If an element is
// already on screen at init it reveals immediately (the safety contract: nothing
// stays stuck hidden); otherwise it animates as it scrolls into view. Mirrors the
// revealOnEnter pattern in scroll.js so the timing matches the shared reveals.
// ---------------------------------------------------------------------------
function revealSet(selector, opts = {}) {
  const els = gsap.utils.toArray(selector);
  if (!els.length) return;

  const fromY = opts.y ?? 22;
  const dur = opts.duration ?? 0.68;
  const stepStagger = opts.stagger ?? 0.07;
  const startFrac = opts.startFrac ?? 0.9;

  if (prefersReduced) {
    gsap.set(els, { opacity: 1, y: 0 });
    return;
  }

  const vh = window.innerHeight || document.documentElement.clientHeight;

  // Group by their nearest revealing container so the stagger restarts per
  // chapter rather than running one global cascade down the whole page.
  els.forEach((el, i) => {
    gsap.set(el, { opacity: 0, y: fromY });
    const r = el.getBoundingClientRect();
    if (r.top <= vh * startFrac) {
      gsap.to(el, { opacity: 1, y: 0, duration: dur, ease: EASE_OUT, delay: (i % 6) * stepStagger });
      return;
    }
    // Use a per-element observer so each enters on its own line, but apply a
    // sibling-aware delay so a row of cells still feels like one gesture.
    const obs = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        gsap.to(entry.target, {
          opacity: 1, y: 0, duration: dur, ease: EASE_OUT,
          delay: (siblingIndex(entry.target) % 6) * stepStagger,
        });
      });
    }, { rootMargin: `0px 0px -${Math.round((1 - startFrac) * 100)}% 0px`, threshold: 0 });
    obs.observe(el);
  });
}

// index of an element among its same-class siblings, so a row of .sys-flow__cell
// staggers 0,1,2 even when several flow strips exist on the page.
function siblingIndex(el) {
  let n = 0;
  let prev = el.previousElementSibling;
  while (prev) {
    if (prev.className === el.className) n++;
    prev = prev.previousElementSibling;
  }
  return n;
}

// ---------------------------------------------------------------------------
// 1. THE PIPELINE SPINE
// Build the right-edge stage tracker from the chapters that carry data-stage,
// then light the active stage as its section crosses the viewport middle. The
// connector fill and the past/active/idle node states give the "chain of custody
// assembling as you descend" read the brief asks for.
// ---------------------------------------------------------------------------
function initPipeline() {
  const pipe = document.getElementById("sysPipe");
  if (!pipe) return;

  // The stage sections, in document order. Each declares data-stage (its id to
  // scroll to) and data-stage-label (the spine label).
  const stages = gsap.utils.toArray("[data-stage]");
  if (!stages.length) return;

  // Build the spine nodes from the stages so the spine and the page can never
  // drift out of sync (one source of truth: the sections themselves).
  const nodes = stages.map((sec, i) => {
    const node = document.createElement("a");
    node.className = "sys-pipe__node";
    node.href = "#" + sec.id;
    const stageLabel = sec.getAttribute("data-stage-label") || sec.id;
    const whisper = sec.getAttribute("data-stage-whisper") || "";
    node.setAttribute("data-cursor", stageLabel);
    // The spine is a VISUAL echo of the rail (the canonical, keyboard-accessible
    // nav, which already offers jump-to-stage). Its container is aria-hidden, so the
    // nodes must not be focusable (no focusable descendant inside an aria-hidden
    // region) and must not be announced. tabindex -1 + aria-hidden keeps the keyboard
    // path on the rail, with no duplicate tab stops, while the hover whisper and the
    // active-stage whisper still read for pointer users. The focus-visible ring in
    // CSS remains for parity if the spine is ever promoted to a real nav.
    node.setAttribute("tabindex", "-1");
    node.setAttribute("aria-hidden", "true");
    node.innerHTML =
      `<span class="sys-pipe__role">` +
        `<span class="sys-pipe__label">${stageLabel}</span>` +
        (whisper ? `<span class="sys-pipe__whisper">${whisper}</span>` : "") +
      `</span>` +
      `<span class="sys-pipe__num">${String(i + 1).padStart(2, "0")}</span>` +
      `<span class="sys-pipe__dot" aria-hidden="true"></span>`;
    pipe.appendChild(node);
    return node;
  });

  // Reveal the spine once it is built (CSS fades it in via .is-ready).
  requestAnimationFrame(() => pipe.classList.add("is-ready"));

  // Lenis is owned by scroll.js; we reach its scrollTo through the same anchor
  // click path scroll.js already wired for in-page hrefs. So a plain anchor click
  // is already smooth-scrolled by the shared handler, and we do not double-bind.
  // We only manage the lit state here.

  let activeIdx = -1;
  const setActive = (idx) => {
    if (idx === activeIdx) return;
    activeIdx = idx;
    nodes.forEach((node, i) => {
      node.classList.toggle("is-active", i === idx);
      node.classList.toggle("is-past", i < idx);
      // fill the connector ABOVE every node up to and including the active one,
      // so the flow reads as descending water filling the pipe.
      node.classList.toggle("is-filled", i <= idx && i > 0);
    });
  };

  // P0-C 6 + 8: make the spine tactile and two-way linked to its chapters. On
  // desktop with a fine pointer, each node gets a light magnetic pull (the shared
  // MAGNETIC_STRENGTH.row feel, ~10px, smoothstep falloff via gsap.quickTo) AND a
  // hover that spotlights its matching chapter (.is-spotlit), so hovering DATA /
  // FACTORS / PORTFOLIO / RISK / EXECUTION highlights and names each stage. A plain
  // anchor click is already smooth-scrolled by scroll.js's shared handler, so the
  // node also scrolls its chapter into view. Touch / reduced motion: no magnetism,
  // no hover-only state (the active-stage whisper still reads). One hand with the
  // landing's cursor magnetism; transform/opacity/color only, GPU-safe.
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  nodes.forEach((node, i) => {
    const section = stages[i];
    const spotlight = section && section.classList.contains("sys-chapter") ? section : null;
    if (!prefersReduced && fine) {
      // light magnetic pull on the node (the row strength, 10px), settled on the
      // house ease via quickTo so it never snaps per frame.
      const setX = gsap.quickTo(node, "x", { duration: 0.4, ease: "power3.out" });
      const setY = gsap.quickTo(node, "y", { duration: 0.4, ease: "power3.out" });
      node.addEventListener("mousemove", (e) => {
        const r = node.getBoundingClientRect();
        const relX = e.clientX - (r.left + r.width / 2);
        const relY = e.clientY - (r.top + r.height / 2);
        const dist = Math.hypot(relX, relY);
        const reach = r.width * 1.4 || 120;
        const pull = gsap.utils.clamp(0, 1, 1 - dist / reach);
        const ease = pull * pull * (3 - 2 * pull);
        setX((relX / (r.width || 1)) * 10 * ease);
        setY((relY / (r.height || 1)) * 10 * ease);
      }, { passive: true });
      node.addEventListener("mouseleave", () => { setX(0); setY(0); });
    }
    if (spotlight) {
      node.addEventListener("mouseenter", () => spotlight.classList.add("is-spotlit"));
      node.addEventListener("mouseleave", () => spotlight.classList.remove("is-spotlit"));
      // keyboard parity (the node has a focus-visible ring already): focus also
      // spotlights and blur clears, so the two-way link is reachable without a pointer.
      node.addEventListener("focus", () => spotlight.classList.add("is-spotlit"));
      node.addEventListener("blur", () => spotlight.classList.remove("is-spotlit"));
    }
  });

  // Drive the active stage from each section crossing the viewport middle, the
  // same trigger line the rail's chapter counter uses in scroll.js, so the spine
  // and the rail change chapter together.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const idx = stages.indexOf(entry.target);
      if (idx >= 0) setActive(idx);
    });
  }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });

  stages.forEach((sec) => io.observe(sec));

  // initialise: light whatever is already at mid-screen (deep links / refresh).
  const vh = window.innerHeight || document.documentElement.clientHeight;
  let initial = 0;
  stages.forEach((sec, i) => {
    const r = sec.getBoundingClientRect();
    if (r.top < vh * 0.55) initial = i;
  });
  setActive(initial);
}

// ---------------------------------------------------------------------------
// 2/3. CHAPTER SCHEMATIC REVEALS + the two bespoke gestures
// ---------------------------------------------------------------------------
function initDiagrams() {
  // The factor families ledger: a staggered enter that matches the landing's
  // five-pillar reveal feel.
  revealSet(".sys-fam", { y: 26, duration: 0.7, stagger: 0.06 });

  // The lineage / paper-loop flow strips: cells resolve left-to-right.
  revealSet(".sys-flow__cell", { y: 18, duration: 0.6, stagger: 0.09 });

  // The portfolio brake panels: the two panels enter together as a pair.
  revealSet(".sys-panel", { y: 22, duration: 0.66, stagger: 0.1 });

  // The gauntlet tests: a numbered ledger, the densest reveal on the page.
  revealSet(".sys-test", { y: 20, duration: 0.6, stagger: 0.05 });

  // The drawdown ladder fill (.is-in): rungs scale in left-to-right via CSS
  // transition-delays once the ladder enters view.
  gsap.utils.toArray(".sys-ladder").forEach((ladder) => {
    if (prefersReduced) { ladder.classList.add("is-in"); return; }
    const obs = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        entry.target.classList.add("is-in");
      });
    }, { rootMargin: "0px 0px -15% 0px", threshold: 0 });
    obs.observe(ladder);
  });
}

// ---------------------------------------------------------------------------
// 3b. DIAGRAM VELOCITY SKEW + SCRUBBED PARALLAX (P0-C 11)
// The schematics lean with scroll momentum (a subtle skewY driven by ScrollTrigger
// velocity) and the gauntlet block scrubs a faint parallax drift, so the diagrams
// feel alive with the reader's motion rather than static. Reduced-motion / mobile:
// skipped (the diagrams sit still). Transform-only, GPU-safe, capped at a small angle
// so it reads as momentum, never as a wobble. The shared [data-parallax] yPercent is
// owned by scroll.js; this only ADDS the velocity lean, the same grammar the landing's
// scroll-velocity skew uses (scroll.js SCROLL-VELOCITY), kept within a 2.5deg ceiling.
// ---------------------------------------------------------------------------
function initDiagramMomentum() {
  if (prefersReduced || isMobile) return;
  const diagrams = gsap.utils.toArray(".sys-flow, .sys-gauntlet, .sys-pair");
  if (!diagrams.length) return;
  diagrams.forEach((el) => {
    const setSkew = gsap.quickTo(el, "skewY", { duration: 0.5, ease: "power2.out" });
    ScrollTrigger.create({
      trigger: el,
      start: "top bottom",
      end: "bottom top",
      onUpdate: (self) => {
        // velocity is px/s; normalize to a small skew and clamp to +/- 2.2deg.
        const v = self.getVelocity() / 320;
        setSkew(gsap.utils.clamp(-2.2, 2.2, v));
      },
    });
  });
}

// ---------------------------------------------------------------------------
// 3c. THE FACTOR-DEPTH PANEL (P0-C 10)
// The <details> factor library expander. Native <details> handles the open/close
// with JS off and under reduced motion; this layer staggers the family grid open on
// the moving path and surfaces each family's honest IC note on hover (no invented
// numbers: the note explains how the family earns its weight). The note cell is
// aria-live so a keyboard reader hears the focused family's description too.
// ---------------------------------------------------------------------------
function initFactorDepth() {
  const panel = document.getElementById("factorDepth");
  if (!panel) return;
  const fams = gsap.utils.toArray(".sys-depth__fam", panel);
  const note = document.getElementById("factorDepthNote");
  const defaultNote = note ? note.textContent : "";

  // stagger the grid open each time the panel is opened (moving path only). The CSS
  // hides the families under .js + motion; this reveals them, and the toggle failsafe
  // (below) guarantees they never stay hidden if the panel opens with JS but a thrown
  // error here. Reduced motion shows them instantly (CSS), so skip the tween.
  const revealFams = () => {
    if (prefersReduced) { gsap.set(fams, { opacity: 1, y: 0 }); return; }
    gsap.fromTo(
      fams,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.5, ease: EASE_OUT, stagger: 0.04, overwrite: true }
    );
  };
  panel.addEventListener("toggle", () => {
    if (panel.open) revealFams();
  });
  if (panel.open) revealFams();

  // per-family hover/focus surfaces its honest note; leaving restores the prompt.
  fams.forEach((fam) => {
    const text = fam.getAttribute("data-note") || "";
    if (!text || !note) return;
    const show = () => { note.textContent = text; };
    const hide = () => { note.textContent = defaultNote; };
    fam.addEventListener("mouseenter", show);
    fam.addEventListener("mouseleave", hide);
    fam.setAttribute("tabindex", "0");
    fam.addEventListener("focus", show);
    fam.addEventListener("blur", hide);
  });
}

// ---------------------------------------------------------------------------
// 4. THE GAUNTLET SEAM DRAW (the bespoke gesture for the validation centerpiece).
// The gauntlet is the prestige centerpiece; its top seam draws left-to-right as
// it enters (mirroring the shared .section__rule gesture). This is a connective
// beat, NOT the page's flare: the page's ONE flareBloom is owned by the chain-of-
// custody tentpole pin (initChainPin), which fires it once on the paper-loop lock
// (IMMERSION_VISION 3.2: exactly one flare per page). Reduced motion: drawn
// instantly. A ridge pulse rides the seam so the accent still answers the beat
// without spending the page's single bloom flare here.
// ---------------------------------------------------------------------------
function initGauntlet() {
  const gauntlet = document.querySelector(".sys-gauntlet");
  if (!gauntlet) return;

  if (prefersReduced) { gauntlet.classList.add("is-drawn"); return; }

  let fired = false;
  const obs = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      entry.target.classList.add("is-drawn");
      if (!fired) {
        fired = true;
        // a ridge pulse a beat after the seam begins to draw, so the accent reads
        // as the gauntlet "lighting up" without firing the page's single flare.
        gsap.delayedCall(0.35, scenePulse);
      }
    });
  }, { rootMargin: "0px 0px -25% 0px", threshold: 0 });
  obs.observe(gauntlet);
}

// ---------------------------------------------------------------------------
// 5. THE CHAIN-OF-CUSTODY PIN (the page's ONE tentpole beat)
// The single structural gap the page had: no pinned, scene-coupled climax (the
// other three pages have one). This reuses the EXACT pin grammar from
// js/performance.js initGauntletPin / js/progress.js initRoadmapPin (renamed for
// clarity): a pinned frame whose six engine stages cross-fade one at a time while
// the shared manifold's lattice TIGHTENS. Because /systems is the FORMING chapter
// (its scene band is the mid-convergence structure band, not the resolved one),
// the gather ramps to a MID value (~0.55), never a full 1.0: the architecture
// takes shape here, the verdict resolves on /performance. The paper loop (the last
// stage) is the culmination: it locks lit with ONE RESTRAINED flareBloom, the
// page's only flare. Reduced motion / mobile drop the pin (CSS stacks the stages;
// the six chapters above are the canonical reference, so nothing is lost).
// ---------------------------------------------------------------------------
// The mid-convergence ceiling for the forming chapter: the lattice tightens into
// structure but stops short of the fully resolved spine (that is /performance).
const CHAIN_CONV_MAX = 0.55;
function initChainPin() {
  const pinEl = document.getElementById("chainPin");
  const stages = gsap.utils.toArray(".cstage");
  const stepCurrent = document.getElementById("cstepCurrent");
  const stepTotal = document.getElementById("cstepTotal");
  if (stepTotal && stages.length) stepTotal.textContent = String(stages.length).padStart(2, "0");

  // No pin: show all stages (matches the CSS mobile/reduced fallback) and stop.
  if (!pinEl || !stages.length || prefersReduced || isMobile) {
    stages.forEach((s) => s.classList.add("is-active"));
    if (stepCurrent) stepCurrent.textContent = "01";
    return;
  }

  let activeStep = -1;
  let resolvedFired = false;
  const setStep = (idx) => {
    if (idx === activeStep) return;
    activeStep = idx;
    stages.forEach((s, i) => {
      s.classList.toggle("is-active", i === idx);
      s.classList.toggle("is-prev", i < idx);
    });
    if (stepCurrent) stepCurrent.textContent = String(idx + 1).padStart(2, "0");
    scenePulse();

    // The resolution: only on first arrival at the LAST stage (the paper loop).
    // One restrained bloom punctuates "the engine is whole, end to end". The
    // forming chapter never glorifies, so the bloom is the same muted flare the
    // sibling pages fire; the verdict belongs to /performance. Reversible on up.
    if (idx === stages.length - 1) {
      pinEl.classList.add("is-resolved");
      if (!resolvedFired) { resolvedFired = true; sceneFlare(); }
      // P0-C 9: the last stage LANDS with a brief 0.98 -> 1.0 scale, so the chain
      // resolving end to end reads with emphasis (a quiet "lock"), not a plain
      // cross-fade. Transform-only, one-shot, off under reduced motion (gated above).
      const landed = stages[idx];
      if (landed && !prefersReduced) {
        gsap.fromTo(landed, { scale: 0.98 }, { scale: 1, duration: 0.3, ease: EASE_OUT, overwrite: "auto" });
      }
    } else {
      pinEl.classList.remove("is-resolved");
    }
  };

  const N = stages.length;
  // The lattice tighten: gather from 0 to the mid ceiling across the back of the
  // pin, the same smoothstep window the gather pages share (CONV_WINDOW.gather),
  // scaled to the forming chapter's mid ceiling so the structure forms but does
  // not fully resolve here. Identical convergence GRAMMAR as the siblings; only
  // the ceiling differs (the design system's "systems = forming" read).
  const CONV_START = 0.45;
  const CONV_END = 0.96;
  ScrollTrigger.create({
    trigger: pinEl,
    start: "top top",
    end: "+=" + (N * 105) + "%",
    pin: ".cpin__sticky",
    pinSpacing: true,
    scrub: false,
    onEnter: () => pinEl.classList.add("is-pinned"),
    onEnterBack: () => pinEl.classList.add("is-pinned"),
    // hand back to the descriptor band on the way out / back: unlike the sibling
    // high-convergence pages (which hold an override the whole page), /systems is
    // the FORMING chapter and wants its ambient mid-convergence band to drive the
    // scene everywhere EXCEPT inside the pin. So we release the override (null) on
    // both exits, and never set one at init, leaving the six-chapter scroll-through
    // to read as the lattice forming under scroll.js, with no override fighting it.
    // The override is engaged only while pinned (onUpdate below), then released.
    onLeave: () => { pinEl.classList.remove("is-pinned"); sceneConverge(null); },
    onLeaveBack: () => { pinEl.classList.remove("is-pinned", "is-resolved"); sceneConverge(null); },
    onUpdate: (self) => {
      const p = gsap.utils.clamp(0, 1, (self.progress - 0.04) / 0.92);
      const idx = Math.min(N - 1, Math.floor(p * N));
      setStep(idx);
      const c = gsap.utils.clamp(0, 1, (p - CONV_START) / (CONV_END - CONV_START));
      const eased = c * c * (3 - 2 * c); // smoothstep, the shared gather curve
      sceneConverge(eased * CHAIN_CONV_MAX);
    },
  });
  // set the visual starting step, but do NOT engage a convergence override here:
  // the ambient band (scroll.js setScroll within [0.22, 0.62]) drives the forming
  // read until the pin is entered, where onUpdate takes over and ramps the gather.
  setStep(0);
}

// ---------------------------------------------------------------------------
// BOOT. Run after the shared boot has had a tick to wire the scene + scroll, so
// window.__meridianScene is available for the flare and Lenis owns the smooth
// scroll for the spine's anchor clicks. We do not block on it: every piece
// degrades to a silent no-op if the shared layer is absent.
// ---------------------------------------------------------------------------
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
    if (isDesktop && !prefersReduced) initPipeline();
    else if (isDesktop) initPipeline(); // reduced motion still gets the static lit spine
    initDiagrams();
    initDiagramMomentum();
    initFactorDepth();
    initGauntlet();
    initHeroGhost();

    // Defer the tentpole pin one more frame so the shared scroll layer (loaded in
    // parallel by main.js) has wired Lenis + the ticker and the scene handle exists
    // on window. The pin only reads ScrollTrigger (a shared singleton) and the
    // guarded scene calls, so it is safe even if the scene never arrives. We refresh
    // ScrollTrigger once after so the new pin measures its pinSpacing correctly.
    requestAnimationFrame(() => {
      initChainPin();
      ScrollTrigger.refresh();
    });
    window.addEventListener("load", () => ScrollTrigger.refresh());
  } catch (err) {
    // Never let a failure here strand a hidden diagram or a pinned stage: reveal
    // everything the CSS may have hidden, exactly like main.js's boot failsafe.
    console.error("Canli Capital /systems interactive layer failed; revealing statics.", err);
    document.querySelectorAll(".sys-fam, .sys-flow__cell, .sys-panel, .sys-test, .sys-depth__fam")
      .forEach((el) => { el.style.opacity = "1"; el.style.transform = "none"; });
    document.querySelectorAll(".sys-ladder").forEach((el) => el.classList.add("is-in"));
    document.querySelectorAll(".cstage").forEach((el) => el.classList.add("is-active"));
    const g = document.querySelector(".sys-gauntlet");
    if (g) g.classList.add("is-drawn");
    const ghost = document.querySelector(".hero__ghost");
    if (ghost) ghost.classList.add("is-shown");
  }
}

// main.js boots on DOMContentLoaded and then awaits the scene/scroll dynamic
// imports, so by the time this module's microtask runs the shared layer is at
// least in flight. We defer one frame so the scene handle has the best chance of
// being present for the flare, without ever blocking the diagram reveals on it.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(boot));
} else {
  requestAnimationFrame(boot);
}
