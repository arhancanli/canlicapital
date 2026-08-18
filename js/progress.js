// =============================================================================
// CANLI CAPITAL / progress.js
// -----------------------------------------------------------------------------
// Page-specific interactivity for /progress. It is loaded as its own module
// (like js/performance.js) so the shared boot (main.js) stays unforked: main.js
// still owns the brand binding, the cursor, the scene, Lenis, and the shared
// scroll grammar. This module adds ONLY what the progress page needs:
//
//   1. The twelve-phase explorer: each phase title is a real <button> that
//      toggles its detail. Default (no JS) state is OPEN, so no content is ever
//      stranded; this module collapses the rows and makes them toggleable.
//   2. The roadmap pin: the page's ONE tentpole beat (it had none before, the
//      single structural gap in the "four pages, one hand" promise). It reuses
//      the EXACT pin grammar from js/performance.js initGauntletPin: a pinned
//      frame whose four algorithm sleeves cross-fade one at a time while the
//      shared manifold fans out (the plurality chapter, /progress's scene band).
//      AlphaForge is the climax: it locks lit with ONE restrained flareBloom.
//      Reduced motion / mobile: no pin, the sleeves stack (CSS handles it) and
//      the static .roadmap table above is the full reference.
//   3. The hero ghost wordmark reveal: fades the oversized watermark in after the
//      curtain begins to lift (route (a) of the polish brief). Purely cosmetic
//      and guarded so JS off / reduced motion keeps it visible.
//   4. The staggered ledger reveals: the four arc heads, the twelve phase rows,
//      and the two edge-status rows enter as composed, staggered ledgers (the
//      shared reveal grammar from systems-page.js revealSet) so this page reads
//      at the landing's density rather than having its dense rows simply appear.
//      Transform/opacity only; instant for anything already on screen, instant
//      under reduced motion, and always reveals what it hid (never strands a row).
//
// It reuses the SAME bundled gsap / ScrollTrigger singletons as scroll.js (Vite
// dedupes them). The live scene is read from window.__meridianScene (set by
// main.js); every scene call is guarded so a no-WebGL / reduced-motion page
// degrades to no gather, never a throw.
//
// Accessibility + honesty contract:
//   - Each phase title is already authored as a real <button aria-expanded>.
//   - Keyboard: the button is natively focusable and operable; Escape closes the
//     focused row.
//   - Reduced motion: respected; the pin does not run, reveals are instant.
//   - Nothing is hidden without a guaranteed reveal path; a thrown error reveals
//     every sleeve and step.
//
// HARD RULE: zero em dashes in any string this file emits.
// =============================================================================

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 768px)").matches;

// The house ease-out, mirrored from styles.css / scroll.js so this page's reveals
// are the same curve as everything else (one easing vocabulary). Kept local, like
// systems-page.js, so this module has no coupling to scroll.js internals.
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

// ---- scene guards (the live scene is owned by main.js) ----------------------
const scene = () => (typeof window !== "undefined" ? window.__meridianScene : null);
const sceneConverge = (v) => {
  const s = scene();
  if (s && typeof s.setConverge === "function") s.setConverge(v);
};
const scenePulse = () => {
  const s = scene();
  if (s && typeof s.pulseRidge === "function") s.pulseRidge();
};
const sceneFlare = () => {
  const s = scene();
  if (s && typeof s.flareBloom === "function") s.flareBloom();
};

// =============================================================================
// 0. STAGGERED LEDGER REVEALS (the connective beat that brings this page up to
// the landing's density). Until now /progress's dense rows, the four arc heads,
// the twelve phase rows, and the two edge-status rows, simply appeared, while the
// landing's pillars and /systems's factor families enter as composed, staggered
// ledgers. This adds the SAME reveal grammar (transform/opacity, content-aware
// stagger, the house ease-out) so the page reads as the same hand. It mirrors
// systems-page.js revealSet verbatim: once-fired per element, instant for anything
// already on screen, instant under reduced motion, and it always reveals whatever
// it hid so nothing is ever stranded. Transform/opacity only (no layout thrash).
// =============================================================================
function siblingIndex(el) {
  let n = 0;
  let prev = el.previousElementSibling;
  while (prev) {
    if (prev.className === el.className) n++;
    prev = prev.previousElementSibling;
  }
  return n;
}

function revealSet(selector, opts = {}) {
  const els = gsap.utils.toArray(selector);
  if (!els.length) return;

  const fromY = opts.y ?? 22;
  const dur = opts.duration ?? 0.66;
  const stepStagger = opts.stagger ?? 0.06;
  const startFrac = opts.startFrac ?? 0.9;

  if (prefersReduced) { gsap.set(els, { opacity: 1, y: 0 }); return; }

  const vh = window.innerHeight || document.documentElement.clientHeight;

  els.forEach((el) => {
    gsap.set(el, { opacity: 0, y: fromY });
    const r = el.getBoundingClientRect();
    if (r.top <= vh * startFrac) {
      gsap.to(el, { opacity: 1, y: 0, duration: dur, ease: EASE_OUT, delay: (siblingIndex(el) % 6) * stepStagger });
      return;
    }
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

function initLedgerReveals() {
  // The phase explorer resolves as composed ledgers: each arc's head label enters
  // first, then its phase rows resolve one after another as the column lands. We
  // reveal the row-level elements (the arc heads and the phase rows), NOT the whole
  // .arc wrapper, so a container fade never double-animates its own children, which
  // is exactly how systems-page reveals its factor families (row-level, not the
  // ledger box). The two edge-status rows enter together as their own ledger. Each
  // set keys its stagger off siblingIndex so a column reads as one gesture, not a
  // global cascade. Transform/opacity only; instant if already on screen / reduced.
  revealSet(".arc__head", { y: 18, duration: 0.62, stagger: 0.08 });
  revealSet(".phase", { y: 18, duration: 0.6, stagger: 0.05 });
  revealSet(".ledger__row", { y: 22, duration: 0.66, stagger: 0.1 });
}

// =============================================================================
// 1. THE TWELVE-PHASE EXPLORER
// =============================================================================
export function initPhaseExplorer() {
  const phases = Array.from(document.querySelectorAll(".phase"));
  if (!phases.length) return;

  phases.forEach((phase) => {
    const btn = phase.querySelector(".phase__bar");
    const detail = phase.querySelector(".phase__detail");
    if (!btn || !detail) return;

    // Opt this row into the collapsible state. The CSS default keeps every detail
    // OPEN (so a no-JS reader loses nothing); adding .is-collapsible hands the
    // closed/open control to this module. We then start the row closed.
    phase.classList.add("is-collapsible");

    const setOpen = (open) => {
      phase.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      detail.setAttribute("aria-hidden", open ? "false" : "true");
    };
    setOpen(false);

    btn.addEventListener("click", () => {
      const willOpen = !phase.classList.contains("is-open");
      setOpen(willOpen);
      // Couple the page's interactive centerpiece to the living manifold: opening
      // a phase ticks the signal ridge once, the same homeopathic reward the pins
      // fire on a step change, so revealing a shipped component reads as the one
      // proven signal acknowledging it. Guarded (no-op without a scene), and only
      // on open, so it never machine-guns the ridge on a rapid close/open. Inert
      // under reduced motion (pulseRidge animates nothing in the static frame).
      if (willOpen && !prefersReduced) scenePulse();
    });

    // Escape closes the focused row, returning focus to its toggle (it already
    // holds focus). A small, expected nicety for keyboard users.
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && phase.classList.contains("is-open")) {
        setOpen(false);
      }
    });
  });
}

// =============================================================================
// 2. THE ROADMAP PIN (the page's ONE tentpole beat)
// Reuses initGauntletPin's grammar verbatim (renamed for clarity): a pinned frame
// whose four sleeves cross-fade one at a time. /progress lives in the plurality
// band, so as the sleeves advance the manifold RELEASES (fans out) rather than
// gathers: setConverge ramps DOWN toward 0 so the field reads as splitting into a
// fleet of future sleeves. AlphaForge (the first sleeve) is the proven climax: the
// page resolves back onto it at the end with one restrained flareBloom. Reduced
// motion / mobile drop the pin (CSS shows all sleeves).
// =============================================================================
function initRoadmapPin() {
  const pinEl = document.getElementById("roadmapPin");
  const sleeves = gsap.utils.toArray(".rsleeve");
  const stepCurrent = document.getElementById("rstepCurrent");
  const stepTotal = document.getElementById("rstepTotal");
  if (stepTotal && sleeves.length) stepTotal.textContent = String(sleeves.length).padStart(2, "0");

  // No pin: show all sleeves (matches the CSS mobile/reduced fallback) and stop.
  if (!pinEl || !sleeves.length || prefersReduced || isMobile) {
    sleeves.forEach((s) => s.classList.add("is-active"));
    if (stepCurrent) stepCurrent.textContent = "01";
    return;
  }

  let activeStep = -1;
  let resolvedFired = false;
  const setStep = (idx) => {
    if (idx === activeStep) return;
    activeStep = idx;
    sleeves.forEach((s, i) => {
      s.classList.toggle("is-active", i === idx);
      s.classList.toggle("is-prev", i < idx);
    });
    if (stepCurrent) stepCurrent.textContent = String(idx + 1).padStart(2, "0");
    scenePulse();

    // The resolution: only on first arrival at the LAST sleeve (Algorithm 04).
    // One restrained bloom punctuates "the house is laid out, AlphaForge proven,
    // more to come". The honest result means the bloom is muted, never triumphant.
    // Reversible: cleared on scroll-up.
    if (idx === sleeves.length - 1) {
      pinEl.classList.add("is-resolved");
      if (!resolvedFired) { resolvedFired = true; sceneFlare(); }
    } else {
      pinEl.classList.remove("is-resolved");
    }
  };

  const N = sleeves.length;
  // The plurality fan-out: as the reader walks the sleeves the field RELEASES from
  // the gathered ridge into a fleet of receding surfaces. We ramp the convergence
  // DOWN across the back of the pin (1 -> 0) so the single proven signal visibly
  // splits into the future sleeves, the on-thesis read for the breadth chapter.
  const REL_START = 0.30;
  const REL_END = 0.92;
  ScrollTrigger.create({
    trigger: pinEl,
    start: "top top",
    end: "+=" + (N * 105) + "%",
    pin: ".rpin__sticky",
    pinSpacing: true,
    scrub: false,
    onEnter: () => pinEl.classList.add("is-pinned"),
    onEnterBack: () => pinEl.classList.add("is-pinned"),
    onLeave: () => { pinEl.classList.remove("is-pinned"); sceneConverge(null); },
    onLeaveBack: () => { pinEl.classList.remove("is-pinned", "is-resolved"); sceneConverge(null); },
    onUpdate: (self) => {
      const p = gsap.utils.clamp(0, 1, (self.progress - 0.04) / 0.92);
      const idx = Math.min(N - 1, Math.floor(p * N));
      setStep(idx);
      // release ramp: gathered (1) at the start, fanned out (0) by the end.
      const r = gsap.utils.clamp(0, 1, (p - REL_START) / (REL_END - REL_START));
      const eased = r * r * (3 - 2 * r); // smoothstep
      sceneConverge(1 - eased);
    },
  });
  setStep(0);
  // Let the [0.0, 0.4] descriptor drive the scattered/plurality read everywhere
  // ABOVE the pin (matching the siblings, which never force a static init value).
  // The pin itself begins gathered on its first onUpdate (1 - eased, eased = 0 at
  // the top) and fans out as the reader descends, so the "gather then release"
  // beat is preserved exactly where it belongs: at the pin.
  sceneConverge(null);
}

// =============================================================================
// 3. THE HERO GHOST WORDMARK REVEAL
// Fade the oversized watermark in shortly after boot (the curtain lift is ~0.9s).
// Guarded: under reduced motion the CSS already shows it; with JS off it is shown
// by the .js gate absence. This only adds the .is-shown class on the moving path.
// =============================================================================
function initHeroGhost() {
  const ghost = document.querySelector(".hero__ghost");
  if (!ghost) return;
  if (prefersReduced) { ghost.classList.add("is-shown"); return; }
  // land just after the curtain begins to lift so it reads as part of the load.
  gsap.delayedCall(0.6, () => ghost.classList.add("is-shown"));
}

// =============================================================================
// 4. BOOT
// Wire the explorer immediately (it does not depend on the scene), then defer the
// pin one frame so scroll.js has wired Lenis + the ticker and the scene handle
// exists on window. A failsafe reveals everything if anything throws.
// =============================================================================
function revealFailsafe() {
  document.querySelectorAll(".rsleeve").forEach((s) => s.classList.add("is-active"));
  // never strand the staggered ledgers hidden if a reveal observer never fired:
  // force the arc heads, phase rows, and edge ledger fully visible.
  document.querySelectorAll(".arc__head, .phase, .ledger__row")
    .forEach((el) => { el.style.opacity = "1"; el.style.transform = "none"; });
  const ghost = document.querySelector(".hero__ghost");
  if (ghost) ghost.classList.add("is-shown");
}

function boot() {
  try {
    initLedgerReveals();
    initPhaseExplorer();
    initHeroGhost();

    // Defer the pin one frame so the shared scroll layer (loaded in parallel by
    // main.js) has wired Lenis + the ticker and the scene handle exists. The pin
    // only reads ScrollTrigger (a shared singleton) and the guarded scene calls,
    // so it is safe even if the scene never arrives.
    requestAnimationFrame(() => {
      initRoadmapPin();
      ScrollTrigger.refresh();
    });

    window.addEventListener("load", () => ScrollTrigger.refresh());
  } catch (err) {
    console.error("Canli Capital /progress enhancement failed; showing static content.", err);
    revealFailsafe();
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
