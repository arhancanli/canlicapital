// =============================================================================
// CANLI CAPITAL / landing.js
// -----------------------------------------------------------------------------
// The interactive MOTION layer for the LANDING (index.html) ONLY. It is loaded
// exclusively by index.html, AFTER js/main.js has booted the shared system (the
// shell, the brand binding, the cursor, the Lenis + GSAP scroll choreography,
// and the Manifold scene). It adds the landing's own scroll-orchestrated beats
// on top of that shared grammar. It never edits the shared engine (scene.js /
// scroll.js / shell.js): it only OBSERVES the state those modules already set
// (the System pin's step classes, the section crossings) and reaches the live
// scene through the same window.__meridianScene handle main.js exposes, exactly
// as js/systems-page.js does for /systems.
//
// THE 10/10 MANDATE (docs/LANDING10_MOTION.md). The landing was rebuilt to a
// conversion-clear V2 structure whose NEW sections (.hero__points, .hero__proof,
// the .offer block, the #equity-slot, the .founder block) shipped with only a
// flat .reveal-fade each, so they read quieter than the richly-choreographed
// older sections. This module brings every new section to PARITY with the old
// ones and BEYOND, using the EXISTING vocabulary at the EXISTING density:
//   - the ONE easing set (EASE.out / EASE.settle, the house curves)
//   - the ONE stagger set (rows 0.07, bullets 0.06; matches scroll.js pillars)
//   - the ONE count-up idiom (true numerals tally, the data-house tell)
//   - the ONE scene-reaction rule (exactly one guarded pulseRidge per chapter,
//     coalesced, never a second flare, never during the System pin's gather)
// plus the landing's new SIGNATURE instrument beat: the #equity-slot powers on
// via the reusable js/charts.js module, in an HONEST pending state (a faint axis
// + one soft signal node, no line, no number), never a fabricated curve.
//
// What it owns, all built from the shared vocabulary:
//   1. The hero V2 release + cascade (initHeroV2): the .hero__points bullets
//      stagger in (each with its signal-hairline marker drawing), then the
//      .hero__proof magnitudes count up, woven into the existing intro -> hero
//      rising column. These two blocks carry .reveal-fade INSIDE #hero, which
//      scroll.js intentionally leaves hidden for the cascade to own; scroll.js's
//      onIntroDone releases only the sub + actions, so WITHOUT this release they
//      would stay invisible. This block is therefore also their failsafe reveal.
//   2. The offer block (initOffer): a composed four-beat ledger at pillar density.
//      The head is a char mask (scroll.js owns it); the denials and the two
//      columns stagger in with their markers / hairlines drawing (.is-in), the
//      LEFT column leading the RIGHT, and ONE ridge pulse answers on arrival.
//   3. The honest equity slot (initEquitySlot): mounts the charts module's equity
//      component in its reserved power-on state (axis frame + one node, drawn on
//      enter), lights the slot (.is-powered), and fires ONE ridge pulse as the
//      instrument wakes. No curve until a validated artifact exists.
//   4. The founder (initFounder): the role resolves just after the name mask
//      (scroll.js owns the name), and the pull-quote's left signal rule draws
//      top to bottom (.is-in) as scroll.js reveals its words, with ONE pulse as
//      the held testimony lands.
//   5. The progress section (initProgress): the lead's "12" counts up, and ONE
//      ridge pulse answers as the live roadmap row enters.
//   6. The System pin "chain of custody" spine (initSystemChain): unchanged.
//   7. The teaser-bridge acknowledgement + the waitlist arrival beat: unchanged.
//
// Accessibility + safety contract (identical to the shared layer):
//   - Honors prefers-reduced-motion: every new beat renders in its FINAL composed
//     state, fully legible, no rise, no stagger, no count (numerals show their
//     final value), no pulse. Nothing is ever hidden without a guaranteed static
//     reveal (the .js gate + main.js's 6s failsafe still apply).
//   - Touch / mobile: staggers run as cheap entrance fades (transform/opacity
//     only); the chart owns its IO-paused work; no layout is ever animated.
//   - No-WebGL / null scene: every scene call is guarded (silent no-op). The
//     equity slot is 2D SVG, independent of the 3D scene.
//   - Numbers bind to the same source of truth the prose uses (the data-fact text
//     main.js wrote, and the shared charts contract); never a hardcoded number.
//   - Transform / opacity / filter / stroke only; never a layout property.
//   - No new persistent rAF in this file (the chart owns its own); the rest is
//     self-disconnecting IntersectionObservers + one MutationObserver.
// =============================================================================

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { mountEquityCurve, fromPerformanceData } from "./charts.js";

gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 768px)").matches;

// The ONE easing vocabulary (mirrors css --ease-* and scroll.js EASE). Redeclared
// here so this module stays independent of scroll.js's internals, exactly as the
// sibling page modules (systems-page.js / performance.js) redeclare their own.
const EASE = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)", // the house ease-out (every fade/stagger/count)
};

// The ONE stagger + duration + rise vocabulary (LANDING10_MOTION 1.2). These
// mirror what scroll.js already uses for pillars/rows, so a new group enters at
// the SAME cadence as the old ledgers. No section invents its own.
const STAGGER = { row: 0.07, bullet: 0.06, word: 0.04 };
// count: 1.6s -> 2.0s so large numerals (24M+, 8,436, 2,820+) tally slow enough to
// read as they climb. Matches scroll.js's statband count duration so every tally on
// the page runs at one cadence.
const DUR = { fade: 0.8, row: 0.7, count: 2.0 };
const RISE = { fade: 18, row: 24 };

// Reach the live Manifold scene the same way main.js exposes it. It may be null
// (no-WebGL / mobile fallback); every call is guarded so a missing scene or a
// missing method is a silent no-op, exactly as scroll.js / systems-page.js do.
function scenePulse() {
  const s = window.__meridianScene;
  if (s && typeof s.pulseRidge === "function") s.pulseRidge();
}

// One coalesced ridge pulse per beat (LANDING10_MOTION 1.4): a reaction must be a
// CONSEQUENCE of a reveal the reader sees, and pulses are throttled so two beats
// landing within ~600ms answer as one, never a stutter. This is the single
// throttle gate every new section's pulse passes through. Off under reduced
// motion (the composed static read takes no scene reaction).
let lastPulseAt = 0;
function pulseOnce(minGapMs) {
  if (prefersReduced) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastPulseAt < (minGapMs || 600)) return;
  lastPulseAt = now;
  scenePulse();
}

// ---------------------------------------------------------------------------
// REVEAL HELPERS (the shared safety contract, transform/opacity only)
// An element already at/above its trigger line at load reveals instantly (no
// element can ever stay stuck invisible); otherwise it animates on enter. This
// mirrors scroll.js revealOnEnter exactly, so the new sections obey the same
// "in view at load -> show now" rule and the same trigger lines, with no new
// dependency on ScrollTrigger here (one self-disconnecting IO per call).
// ---------------------------------------------------------------------------
function aboveLine(el, frac) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  return r.top <= vh * (typeof frac === "number" ? frac : 0.9);
}

function onEnterOnce(el, frac, fn) {
  if (!el) return;
  if (aboveLine(el, frac)) { fn(); return; }
  const margin = Math.round((1 - (typeof frac === "number" ? frac : 0.9)) * 100);
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      fn();
    });
  }, { rootMargin: `0px 0px -${margin}% 0px`, threshold: 0 });
  io.observe(el);
}

// Arm a marker host for the per-line draw-in (LANDING10_MOTION B1). The CSS gates
// every new-section marker's collapsed FROM-state behind `.is-stagger` on the
// PARENT host (`.js .X.is-stagger ... ::before { transform: scale(0) }`), and only
// the armed-then-`.is-in` state draws it to 1. WITHOUT this class the markers rest
// at their failsafe drawn state (scale 1) and the signature per-line reward never
// plays, which is exactly the "under-animated" regression the brief forbids. So in
// the MOTION path we add `.is-stagger` to the host the markers hang off, in the
// SAME tick the items are set to their hidden from-state and BEFORE any `.is-in`
// toggles, so the arm (collapse to 0) always precedes the draw (to 1). Under
// reduced motion we deliberately do NOT arm: the markers stay at their drawn
// failsafe and nothing animates (the reduced-motion CSS override is itself
// `.is-stagger`-scoped, so an un-armed host is correctly already-final).
function armStagger(host) {
  if (host && !prefersReduced) host.classList.add("is-stagger");
}

// Stagger a group in as a composed ledger (the pillar idiom). Each item rises
// `rise -> 0` and fades `0 -> 1` on the shared ease, offset by `stagger`, and
// toggles an `.is-in` class AS it lands so the CSS-owned marker draw (the bullet
// hairline, the denial dot, the row hairline) ignites with its line. The CSS owns
// the marker transform and never hides the TEXT, so a row is always legible even
// if the stagger never runs. `opts.arm` is the marker host to add `.is-stagger`
// to (the <ul>/wrapper the ::before markers hang off); armed only in the motion
// path so the collapsed from-state precedes the draw. Reduced motion: set final
// state + .is-in, no tween, host left un-armed (markers rest drawn).
function staggerIn(items, opts) {
  if (!items || !items.length) return;
  const o = opts || {};
  const rise = typeof o.rise === "number" ? o.rise : RISE.fade;
  const stagger = typeof o.stagger === "number" ? o.stagger : STAGGER.bullet;
  const duration = typeof o.duration === "number" ? o.duration : DUR.fade;
  const baseDelay = typeof o.delay === "number" ? o.delay : 0;

  if (prefersReduced) {
    items.forEach((el) => { gsap.set(el, { opacity: 1, y: 0 }); el.classList.add("is-in"); });
    return;
  }
  // arm the marker host FIRST (collapse markers to 0) before any item lands.
  armStagger(o.arm);
  gsap.set(items, { opacity: 0, y: rise });
  gsap.to(items, {
    opacity: 1,
    y: 0,
    duration,
    ease: EASE.out,
    delay: baseDelay,
    stagger,
    // light each marker as its row lands, in lockstep with the tween offset.
    onStart: () => {
      items.forEach((el, i) => {
        gsap.delayedCall(baseDelay + i * stagger, () => el.classList.add("is-in"));
      });
    },
  });
}

// Count a true numeral up from 0 to its target, reading the value from the
// element's already-bound text (what main.js wrote from FACTS), so the number is
// never hardcoded here. Parses a leading number plus an optional thousands group,
// a decimal, and a trailing suffix (e.g. "3.5M+", "2,500+", "94", "12"), and
// reproduces that exact shape as it tallies. Reduced motion / non-numeric: the
// final text stands. The caller chooses which facts to count (the year is left
// uncounted, since a year tallying to 2020 reads odd).
function countUp(el, opts) {
  if (!el) return;
  const o = opts || {};
  const raw = (el.textContent || "").trim();
  const m = raw.match(/^([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return; // not a numeral; leave the bound text exactly as-is
  const numStr = m[1];
  const suffix = m[2] || "";
  const grouped = numStr.indexOf(",") !== -1;
  const target = parseFloat(numStr.replace(/,/g, ""));
  if (!isFinite(target)) return;
  const decimals = numStr.indexOf(".") !== -1 ? numStr.split(".")[1].length : 0;
  const fmt = (v) => {
    let s = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString();
    if (grouped) s = Number(s).toLocaleString("en-US");
    return s + suffix;
  };
  if (prefersReduced) { el.textContent = fmt(target); return; }
  el.textContent = fmt(0);
  const obj = { v: 0 };
  gsap.to(obj, {
    v: target,
    duration: typeof o.duration === "number" ? o.duration : DUR.count,
    ease: EASE.out,
    delay: typeof o.delay === "number" ? o.delay : 0,
    onUpdate: () => { el.textContent = fmt(obj.v); },
    // SIGNATURE: the numeral gives one restrained micro-pulse the instant it
    // reaches its final value (main.js owns the driver + reduced-motion gate).
    onComplete: () => { if (window.__meridianPulse) window.__meridianPulse(el); },
  });
}

// =============================================================================
// 1. THE HERO V2 RELEASE + CASCADE
// The .hero__points bullets and the .hero__proof facts sit inside #hero and carry
// .reveal-fade, which scroll.js intentionally leaves HIDDEN (opacity 0, y 18) so
// the intro -> hero cascade can own the hero's reveal as one rising column rather
// than a separate late fade under the overlay. scroll.js's onIntroDone releases
// only the .hero__sub and the .hero__actions, so WITHOUT this block the points and
// proof would never be revealed. This block:
//   - releases + staggers the points in as a ledger (each bullet's signal-hairline
//     marker drawing with its line, via .is-in), woven after the sub,
//   - releases + counts the proof magnitudes up (the data-house tell), leaving the
//     "since 2020" year as a plain reveal (a fact, not a tally).
// It waits for the cascade to have released the sub (so the points land IN the
// rising column, not before it), polling a cheap rAF for the sub's reveal, with a
// hard time cap so the content is NEVER stranded hidden if the cascade never runs
// (the same failsafe spirit as main.js). The hero exit scrub (scroll.js) carries
// the points + proof out for free (they are inside .hero__body), so no exit work.
// =============================================================================
function initHeroV2() {
  const hero = document.getElementById("hero");
  if (!hero) return;
  const points = hero.querySelector(".hero__points");
  const proof = hero.querySelector(".hero__proof");
  const sub = hero.querySelector(".hero__sub");
  if (!points && !proof) return;

  const pointItems = points ? Array.from(points.querySelectorAll("li")) : [];
  // the proof MAGNITUDES count up; the YEAR facts (equitySince 1997, cryptoSince
  // 2020) are left as fade-only facts, since a year tallying up reads odd. Bind by
  // data-fact key so the choice is explicit and honest, never a hardcoded skip.
  const YEAR_FACTS = ["since", "equitySince", "cryptoSince"];
  const proofFacts = proof
    ? Array.from(proof.querySelectorAll("[data-fact]")).filter((s) => YEAR_FACTS.indexOf(s.getAttribute("data-fact")) === -1)
    : [];

  // Reduced motion: show everything composed, count nothing (final values stand).
  if (prefersReduced) {
    if (points) { gsap.set(points, { opacity: 1, y: 0 }); pointItems.forEach((li) => li.classList.add("is-in")); }
    if (proof) gsap.set(proof, { opacity: 1, y: 0 });
    return;
  }

  // If the hero is already scrolled past at load (deep link / refresh mid page),
  // show it composed immediately rather than gating on a cascade that has ended.
  if (!aboveLine(hero, 1.2)) {
    if (points) { gsap.set(points, { opacity: 1, y: 0 }); pointItems.forEach((li) => li.classList.add("is-in")); }
    if (proof) { gsap.set(proof, { opacity: 1, y: 0 }); proofFacts.forEach((el) => countUp(el)); }
    return;
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;

    if (points) {
      // the <ul> is the .reveal-fade block: lift it into the column.
      gsap.set(points, { opacity: 1, y: 0 });
      // ARM the bullet-tick draw-in (B1): the <ul> is the marker host, so adding
      // `.is-stagger` collapses each li::before tick to scaleX(0); the per-item
      // `.is-in` below then draws it to 1 in lockstep with the text rise.
      armStagger(points);
      // stagger the bullets' own rise + marker draw on top, a tight scannable
      // ledger (bullet cadence), landing just after the sub.
      gsap.set(pointItems, { opacity: 0, y: RISE.fade });
      gsap.to(pointItems, {
        opacity: 1, y: 0, duration: DUR.fade, ease: EASE.out,
        delay: 0.15, stagger: STAGGER.bullet,
        onStart: () => {
          pointItems.forEach((li, i) => {
            gsap.delayedCall(0.15 + i * STAGGER.bullet, () => li.classList.add("is-in"));
          });
        },
      });
    }

    if (proof) {
      // the proof line lands LAST in the column (the brightest mono, the readout),
      // a beat after the actions; its magnitudes then count up from 0.
      const proofDelay = pointItems.length * STAGGER.bullet + 0.55;
      gsap.set(proof, { opacity: 0, y: RISE.fade });
      gsap.to(proof, {
        opacity: 1, y: 0, duration: DUR.fade, ease: EASE.out, delay: proofDelay,
        onComplete: () => { proofFacts.forEach((el) => countUp(el, { duration: DUR.count })); },
      });
    }
  };

  // wait for the cascade to release the sub (its inline opacity climbs above 0),
  // then release the points/proof so they land in the same rising column. Poll
  // cheaply on rAF with a hard cap so nothing is ever stranded hidden if
  // onIntroDone never fires (well inside main.js's 6s failsafe).
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const HARD_CAP_MS = 4200;
  const subReleased = () => {
    if (!sub) return true; // no sub to gate on
    const o = parseFloat(sub.style.opacity || "");
    return isFinite(o) ? o > 0.01 : false;
  };
  const poll = () => {
    if (released) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (subReleased() || now - startedAt > HARD_CAP_MS) { release(); return; }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);

  // HERO PARALLAX SCRUB (P0-C 10). A short, scroll-scrubbed drift on the wordmark
  // across the very top of the page so it stays alive WITH the manifold as the
  // reader starts moving, before the exit choreography (scroll.js) takes over at
  // the section's leave. This rides the `y` channel; scroll.js drives the wordmark's
  // data-parallax on the `yPercent` channel, so the two compose without fighting (a
  // scrubbed tween is ease:"none" by design, the correct ScrollTrigger idiom; the
  // cinema token stays reserved for its two tentpole beats). Desktop + motion only.
  if (!prefersReduced && !isMobile) {
    const word = hero.querySelector(".hero__word");
    if (word) {
      gsap.to(word, {
        y: -40,
        ease: "none",
        scrollTrigger: {
          trigger: hero,
          start: "top top",
          end: "top 30%",
          scrub: 0.6,
        },
      });
    }
  }
}

// =============================================================================
// 2. THE OFFER BLOCK (#what-it-is) NEW V2 SECTION
// A composed four-beat ledger at PILLAR density. The .offer__head is a char mask
// (scroll.js owns its clip-rise; the markup carries .mask[data-chars]); the lead
// is a .reveal-fade (scroll.js owns it). This block owns the parts scroll.js does
// NOT animate: the denials and the two columns, which today just appear. Each
// group staggers in as a ledger with its marker / hairline drawing (.is-in), the
// LEFT column leading the RIGHT so the eye reads who-it-is-for then what-you-get.
// ONE ridge pulse answers as the chapter arrives (on the head's trigger line),
// guarded + coalesced, never a flare, never a gather (the gather is the System
// pin's alone).
// =============================================================================
function initOffer() {
  const offer = document.getElementById("what-it-is");
  if (!offer) return;

  const denials = Array.from(offer.querySelectorAll(".offer__denials li"));
  const cols = Array.from(offer.querySelectorAll(".offer__col"));
  const head = offer.querySelector(".offer__head");

  // ONE scene pulse as the offer arrives (the manifold answers "here is what this
  // is"). Keyed to the head crossing the -22% line, coalesced.
  onEnterOnce(head || offer, 0.78, () => pulseOnce());

  // the denials: a tight bullet ledger; each denial's signal disc ignites (the
  // <ul> is the marker host, armed in the motion path) as the line lands.
  const denialsUl = offer.querySelector(".offer__denials");
  if (denials.length) {
    onEnterOnce(denialsUl || offer, 0.9, () => {
      staggerIn(denials, { rise: RISE.fade, stagger: STAGGER.bullet, duration: DUR.fade, arm: denialsUl });
    });
  }

  // the two columns: TWO sub-ledgers. The column head's hairline draws (.is-in),
  // then the list rows stagger in (row cadence), the left column leading the right
  // by ~0.14s so the reading order is deliberate (eye reads who-it-is-for before
  // what-you-get). Each row's top hairline draws with it (.is-in). One enter
  // trigger on the cols wrapper drives both columns. The .offer__cols wrapper hosts
  // the column-head seam markers and each .offer__list hosts its row seams, so we
  // arm BOTH in the motion path (B1) before toggling .is-in.
  const colsWrap = offer.querySelector(".offer__cols");
  if (cols.length) {
    onEnterOnce(colsWrap || offer, 0.9, () => {
      armStagger(colsWrap); // arm the column-head seam draws (::after)
      cols.forEach((col, ci) => {
        const colHead = col.querySelector(".offer__col-head");
        const list = col.querySelector(".offer__list");
        const rows = Array.from(col.querySelectorAll(".offer__list li"));
        const lead = ci * 0.14; // left column leads the right (perceptible order)
        if (colHead) {
          if (prefersReduced) colHead.classList.add("is-in");
          else gsap.delayedCall(lead, () => colHead.classList.add("is-in"));
        }
        staggerIn(rows, {
          rise: RISE.row, stagger: STAGGER.row, duration: DUR.row,
          delay: lead + 0.08, arm: list,
        });
      });
    });
  }
}

// =============================================================================
// 3. THE HONEST EQUITY SLOT (#equity-slot) NEW V2 SECTION, BEYOND PARITY
// The landing's new signature instrument beat. It mounts the reusable charts
// module's equity component into the existing #equity-slot in its RESERVED state:
// a faint axis frame + one soft signal node that scales in on enter (the "powered
// on, waiting" tell). A flat baseline + a single node can NEVER be misread as a
// rising equity curve, so the slot is honest by construction. NO curve is drawn
// until STATUS === "live" AND a non-empty point array exists (the chart's own
// live-data gate enforces this). The chart reads the SAME contract /performance
// reads (fromPerformanceData), so the landing and the methodology page can NEVER
// disagree about whether a result exists. When the grand backtest lands and the
// operator sets STATUS = "live" + fills EQUITY_CURVE in performance_data.js, this
// identical call renders the real drawn curve with no code change here.
//
// On the slot's entrance this also lights the slot (.is-powered, the grid + border
// lift owned by landing.css / charts.css) and fires ONE ridge pulse as the
// instrument wakes (the chapter's scene answer, coalesced). The chart's pending
// state does not itself pulse, so the slot's one scene reaction is fired here.
// Guarded and additive: a chart failure leaves the existing static honest frame
// (grid + label + caption + link) standing, exactly the brief's failsafe.
// =============================================================================
function initEquitySlot() {
  const slot = document.getElementById("equity-slot");
  if (!slot) return;

  // mount the reusable component. It reads the shared contract itself; reserved
  // today => the honest empty state. The component owns its own draw-on-view
  // ScrollTrigger (start top 82%), so the axis + node ignite as the slot enters.
  let chart = null;
  try {
    const data = fromPerformanceData("equity");
    chart = mountEquityCurve(slot, data, {
      drawOnView: true,
      reducedMotion: prefersReduced,
      ariaLabel: "AlphaForge out-of-sample equity, backtest in progress",
    });
  } catch (e) {
    // keep the static honest frame; still run the slot's arrival beat below.
    chart = null;
  }

  // light the slot + fire ONE pulse as the instrument wakes. Keyed to the slot
  // crossing its own line (top 85%), so the scene answers WITH the chart igniting.
  onEnterOnce(slot, 0.85, () => {
    slot.classList.add("is-powered");
    pulseOnce();
  });

  // SCRUBBED AXIS DRAW (P0-C 11). The chart module owns its own draw-on-view of the
  // live SVG axis (stroke-dashoffset). On TOP of that, scrub the host's backdrop
  // graticule so the oscilloscope grid "energizes" with scroll velocity as the slot
  // travels from top 85% to top 50%: it draws up from the baseline (scaleY 0.6 -> 1,
  // origin bottom) and resolves its opacity (0.35 -> powered), so the reader feels
  // the instrument coming online under their scroll, not a static panel. The grid is
  // position:absolute inset:0, so a scaleY from the bottom edge reads as the trace
  // sweeping up. Transform/opacity only, SCRUB_SMOOTH:0.6. Desktop + motion only.
  if (!prefersReduced && !isMobile) {
    const grid = slot.querySelector(".proof__curve-grid");
    if (grid) {
      gsap.fromTo(grid,
        { scaleY: 0.6, opacity: 0.35, transformOrigin: "50% 100%" },
        {
          scaleY: 1, opacity: 0.8, ease: "none",
          scrollTrigger: { trigger: slot, start: "top 85%", end: "top 50%", scrub: 0.6 },
        });
    }
  }

  // keep the instrument sized to its slot; the chart re-renders cheaply.
  if (chart && typeof chart.resize === "function") {
    let rt = 0;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => { try { chart.resize(); } catch (e) {} }, 180);
    }, { passive: true });
  }
}

// =============================================================================
// 3b. THE INTERACTIVE MINI-PIPELINE (the landing's "interactive element" mandate)
// A five-stage spine, DATA -> SIGNALS -> PORTFOLIO -> RISK -> EXECUTION, injected
// after the offer block. It mirrors the /systems pipeline's stage language exactly
// (one diagram vocabulary across the property), compressed to a single interactive
// row for the landing. Hovering (or focusing) a stage highlights it: the dot
// ignites, the label brightens, the stage lifts a touch, and ONE sentence of plain
// copy resolves below the row explaining that stage. JS-driven hover state (not
// CSS-only) so the explanation panel reads as one shared readout that swaps, and so
// the keyboard path works. It replaces the static "every capability opens as it is
// validated" aside read with a live, explorable summary of the whole pipeline.
// Honest copy, no invented numbers. Built once; transform/opacity/color only.
// =============================================================================
const PIPELINE_STAGES = [
  { key: "DATA", note: "Survivorship-free market and point-in-time fundamental data, leak-proof by construction." },
  { key: "SIGNALS", note: "A library of registered factors, each ranked by its actual predictive content, not a hunch." },
  { key: "PORTFOLIO", note: "Signals combine into positions under explicit, documented construction rules." },
  { key: "RISK", note: "Exposure, drawdown, and concentration are bounded before a trade is ever sized." },
  { key: "EXECUTION", note: "Orders run in live paper against honest costs. No real capital is at risk." },
];

function initMiniPipeline() {
  const offer = document.getElementById("what-it-is");
  if (!offer) return;
  // do not inject twice (HMR / double-boot safety)
  if (offer.querySelector(".mini-pipe")) return;

  const aside = offer.querySelector(".offer__aside");
  const anchor = aside || offer.lastElementChild;
  if (!anchor) return;

  const wrap = document.createElement("div");
  wrap.className = "mini-pipe reveal-fade";
  wrap.setAttribute("aria-label", "How the engine works, end to end");

  const row = document.createElement("ol");
  row.className = "mini-pipe__row";

  const stages = PIPELINE_STAGES.map((s, i) => {
    const li = document.createElement("li");
    li.className = "mini-pipe__stage";
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-describedby", "mini-pipe-note");
    li.innerHTML =
      `<span class="mini-pipe__dot" aria-hidden="true"></span>` +
      `<span class="mini-pipe__num mono-label">${String(i + 1).padStart(2, "0")}</span>` +
      `<span class="mini-pipe__label label">${s.key}</span>`;
    row.appendChild(li);
    return li;
  });

  const note = document.createElement("p");
  note.className = "mini-pipe__note body";
  note.id = "mini-pipe-note";
  note.setAttribute("aria-live", "polite");
  note.textContent = PIPELINE_STAGES[0].note;

  wrap.appendChild(row);
  wrap.appendChild(note);
  anchor.insertAdjacentElement("afterend", wrap);

  let active = -1;
  const setActive = (idx) => {
    if (idx === active) return;
    active = idx;
    stages.forEach((st, i) => st.classList.toggle("is-active", i === idx));
    if (idx >= 0 && PIPELINE_STAGES[idx]) {
      // swap the explanation with a tiny de-emphasis so it reads as a settle, not
      // a flicker (the same idiom the rail chapter tick uses). Reduced motion: hard
      // set. Transform/opacity only.
      if (prefersReduced) { note.textContent = PIPELINE_STAGES[idx].note; return; }
      note.classList.add("is-swapping");
      gsap.delayedCall(0.12, () => {
        note.textContent = PIPELINE_STAGES[idx].note;
        note.classList.remove("is-swapping");
      });
      pulseOnce(700);
    }
  };

  // first stage rests active so the panel is never empty; hover/focus drives it.
  setActive(0);

  if (!isMobile) {
    stages.forEach((st, i) => {
      st.addEventListener("mouseenter", () => setActive(i));
      st.addEventListener("focus", () => setActive(i));
    });
    // leaving the row settles back to the first stage (the resting summary).
    row.addEventListener("mouseleave", () => setActive(0));
  } else {
    // touch: tap to step through (no hover); keeps the explorable read on mobile.
    stages.forEach((st, i) => st.addEventListener("click", () => setActive(i)));
  }
}

// =============================================================================
// 4. THE FOUNDER (#founder) NEW V2 SECTION
// The page's TRUST keystone, brought to head + held-statement parity. A composed
// two-stage reveal:
//   STAGE ONE  the identity: the .founder__name is a char mask (scroll.js owns its
//              clip-rise via .mask[data-chars]). This block resolves the
//              .founder__role just after, so the person comes into focus.
//   STAGE TWO  the testimony: the bio (.reveal-fade) and the pull-quote's words
//              (.reveal-words) are revealed by scroll.js. This block draws the
//              pull-quote's LEFT signal rule top to bottom (.is-in, owned by
//              landing.css) as those words land, so the signal "writes" the quote
//              into the record, and fires ONE ridge pulse as the held testimony
//              lands. (The words themselves are scroll.js's reveal-words beat; we
//              do not re-split or re-animate them, exactly as the hero avoids
//              re-animating scroll.js-owned content.)
// Reduced motion: role lit, rule drawn, no rise, no pulse.
// =============================================================================
function initFounder() {
  const founder = document.getElementById("founder");
  if (!founder) return;
  const role = founder.querySelector(".founder__role");
  const pull = founder.querySelector(".founder__pull");

  // STAGE ONE: the role resolves just after the name mask. Fade only (the name is
  // the char-mask hero of the identity). The role is visible by default in CSS, so
  // animating from 0 is safe only with a guaranteed reveal (onEnterOnce provides
  // it). One trigger on the id block.
  if (role) {
    if (prefersReduced) {
      gsap.set(role, { opacity: 1, y: 0 });
    } else {
      const idBlock = founder.querySelector(".founder__id") || role;
      gsap.set(role, { opacity: 0, y: 12 });
      onEnterOnce(idBlock, 0.88, () => {
        gsap.to(role, { opacity: 1, y: 0, duration: 0.66, ease: EASE.out, delay: 0.28 });
      });
    }
  }

  // STAGE TWO: draw the pull-quote's signal rule + pulse as the held statement
  // lands. The words are scroll.js's reveal-words beat (start top 82%); we match
  // that line so the rule writes in WITH the words, then mark the held moment with
  // one pulse. Under reduced motion the rule is shown drawn (CSS), no pulse.
  if (pull) {
    if (prefersReduced) { pull.classList.add("is-in"); return; }
    const quote = pull.querySelector(".reveal-words") || pull;
    onEnterOnce(pull, 0.82, () => {
      // ARM the pull-quote rule draw (B1): .is-stagger collapses the left signal
      // rule to scaleY(0), then .is-in below draws it top-to-bottom as the words
      // land, "writing" the testimony into the record.
      armStagger(pull);
      pull.classList.add("is-in"); // the left signal rule draws top to bottom
      // P0-C 13: the held statement itself lifts a touch (y:-6 -> 0) in lockstep
      // with the rule drawing, so the testimony "settles into the record" as the
      // signal writes it. The words' own opacity/stagger is scroll.js's reveal-words
      // beat; this only adds a synced container lift (transform-only, no re-split).
      gsap.fromTo(quote, { y: -6 }, { y: 0, duration: 0.9, ease: EASE.out });
      // the words take ~ (wordCount * 0.04 + 0.66) to finish; mark the testimony
      // with one pulse a beat after they begin landing, coalesced so it never
      // stacks on the bridge pulse below it.
      gsap.delayedCall(0.5, () => pulseOnce());
    });
  }
}

// =============================================================================
// 5. THE PROGRESS SECTION (#progress)
// Bring it to the "scene answers every chapter" consistency the rest of the page
// now has, and tally its one true numeral:
//   - the lead's "12" (data-fact="phases") COUNTS UP like every other true number
//     on the page, bound to the text main.js wrote (never hardcoded here).
//   - ONE ridge pulse answers as the live roadmap row (the proven, paper-trading
//     sleeve) enters, so the manifold marks the one live row.
// Both guarded; reduced motion shows the final value + no pulse.
// =============================================================================
function initProgress() {
  const house = document.getElementById("progress");
  if (!house) return;

  // count the "12" in the lead. It is a data-fact span main.js bound; reading its
  // text keeps the source of truth in FACTS, never a literal here.
  const phases = house.querySelector('.house__lead [data-fact="phases"]');
  if (phases) {
    onEnterOnce(house.querySelector(".house__lead") || house, 0.9, () => {
      countUp(phases, { duration: DUR.count });
    });
  }

  // ONE pulse as the live row enters (the manifold answers the one live sleeve).
  const liveRow = house.querySelector(".roadmap__row--live");
  if (liveRow) onEnterOnce(liveRow, 0.78, () => pulseOnce());
}

// ---------------------------------------------------------------------------
// 6. THE SYSTEM PIN "CHAIN OF CUSTODY" SPINE (unchanged)
// Build a node column in the pinned frame's left rail from the existing steps
// (one source of truth: the .step elements scroll.js drives). As scroll.js toggles
// a step's is-active / is-prev classes through the pin, we mirror that onto the
// matching node and fill the connector down to it, so the five-stage chain visibly
// assembles as the field converges. We OBSERVE the step classes rather than
// re-deriving the active step, so this can never disagree with the pin. Desktop +
// motion only; on mobile / reduced motion the steps stack as a plain list, so the
// chain renders fully formed and static (the closed diagram).
// ---------------------------------------------------------------------------
function initSystemChain() {
  const systemEl = document.getElementById("system");
  const left = systemEl && systemEl.querySelector(".system__left");
  const counter = left && left.querySelector(".system__counter");
  if (!systemEl || !left || !counter) return;

  const steps = Array.from(systemEl.querySelectorAll(".step"));
  if (!steps.length) return;

  const chain = document.createElement("ol");
  chain.className = "sys-chain";
  chain.setAttribute("aria-label", "System chain of custody");

  const nodes = steps.map((step, i) => {
    const kicker = step.querySelector(".step__kicker");
    const raw = (kicker ? kicker.textContent : "").trim();
    const label = raw.includes("/") ? raw.split("/").pop().trim() : raw || String(i + 1);
    const li = document.createElement("li");
    li.className = "sys-chain__node";
    li.innerHTML =
      `<span class="sys-chain__dot" aria-hidden="true"></span>` +
      `<span class="sys-chain__num mono-label">${String(i + 1).padStart(2, "0")}</span>` +
      `<span class="sys-chain__label label">${label}</span>`;
    chain.appendChild(li);
    return li;
  });

  counter.insertAdjacentElement("afterend", chain);

  let lastIdx = -1;
  const sync = () => {
    let idx = steps.findIndex((s) => s.classList.contains("is-active"));
    if (idx < 0) idx = 0;
    if (idx === lastIdx) return;
    lastIdx = idx;
    nodes.forEach((node, i) => {
      node.classList.toggle("is-active", i === idx);
      node.classList.toggle("is-past", i < idx);
      node.classList.toggle("is-filled", i <= idx && i > 0);
    });
  };

  if (prefersReduced || isMobile) {
    nodes.forEach((node) => node.classList.add("is-filled"));
    nodes[nodes.length - 1].classList.add("is-active");
    chain.classList.add("is-static");
    requestAnimationFrame(() => chain.classList.add("is-ready"));
    return;
  }

  sync();
  requestAnimationFrame(() => chain.classList.add("is-ready"));

  const stepsParent = steps[0].parentElement || systemEl;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; sync(); });
  };
  const mo = new MutationObserver(schedule);
  mo.observe(stepsParent, { subtree: true, attributes: true, attributeFilter: ["class"] });
}

// ---------------------------------------------------------------------------
// 7. TEASER-BRIDGE ACKNOWLEDGEMENT (unchanged)
// Each cross-page bridge is the way out of a teaser chapter. When one enters view,
// pulse the signal ridge once (coalesced through the shared throttle so a bridge
// near another section's pulse does not double-fire). One pulse per bridge,
// self-disconnecting. Off under reduced motion.
// ---------------------------------------------------------------------------
function initBridgePulse() {
  if (prefersReduced) return;
  const bridges = Array.from(document.querySelectorAll(".bridge__link"));
  if (!bridges.length) return;
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      obs.unobserve(entry.target);
      pulseOnce();
    });
  }, { rootMargin: "0px 0px -22% 0px", threshold: 0 });
  bridges.forEach((b) => io.observe(b));
}

// ---------------------------------------------------------------------------
// 8. THE WAITLIST ARRIVAL BEAT (unchanged)
// As the conversion chapter enters, draw a single signal underline beneath the
// form label and pulse the ridge once, so the join moment reads as the page
// arriving at its decision. Reuses the left-anchored underline-draw idiom (.is-lit
// in landing.css). One-shot, self-disconnecting. No flare.
// ---------------------------------------------------------------------------
function initWaitlistArrival() {
  const section = document.getElementById("waitlist");
  const label = section && section.querySelector(".waitlist__label");
  if (!section || !label) return;
  if (prefersReduced) { label.classList.add("is-lit"); return; }
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      label.classList.add("is-lit");
      pulseOnce();
    });
  }, { rootMargin: "0px 0px -25% 0px", threshold: 0 });
  io.observe(section);
}

// ---------------------------------------------------------------------------
// BOOT
// Run after main.js has booted (this module is loaded after main.js in the markup
// and main.js boots on DOMContentLoaded / immediately). The shared scene is
// exposed on window.__meridianScene by the time the user can scroll to these
// beats; every scene call is guarded, so initializing before the scene resolves
// is safe. Each init is independently wrapped so one failing beat can never strand
// another or break the page: the shared layer already renders everything, so a
// failure here is a silent skip with the static composed content intact.
// ---------------------------------------------------------------------------
function safe(label, fn) {
  try { fn(); }
  catch (e) {
    if (window.console && console.warn) console.warn("Canli Capital landing beat skipped (" + label + "):", e);
  }
}

function boot() {
  safe("hero-v2", initHeroV2);
  safe("offer", initOffer);
  safe("mini-pipeline", initMiniPipeline);
  safe("equity-slot", initEquitySlot);
  safe("founder", initFounder);
  safe("progress", initProgress);
  safe("system-chain", initSystemChain);
  safe("bridge-pulse", initBridgePulse);
  safe("waitlist-arrival", initWaitlistArrival);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
