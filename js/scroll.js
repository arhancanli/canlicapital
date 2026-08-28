// =============================================================================
// CANLI CAPITAL / scroll.js
// Lenis smooth scroll + GSAP ScrollTrigger choreography.
// Owns: smooth scroll, the 3D morph sync, line/word/char mask reveals, body
// fades, the System pin sequence with a 3D focus pull, the Discipline pinned
// beat, mono "type-in" data lines, the living chapter counter, parallax depth,
// stat counters, rail progress, and a tasteful scroll-velocity skew.
//
// Public interface (kept stable for main.js):
//   initScroll({ scene }) -> { lenis, scrollTo, refresh, onIntroDone }
//   scene contract used here: scene.setScroll(p), scene.pulseRidge()
//   (scene.setPointer is owned by main.js, not called from this file)
// =============================================================================

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { mapScroll } from "./page-config.js";

gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 768px)").matches;

// House easing vocabulary (mirrors the CSS tokens in styles.css / motion.css).
// Content-aware: display type uses the snap-settle, data/mono uses the calm
// expensive ease-out, structural cross-fades use the symmetric in-out.
// EXPORTED so every page reads ONE easing vocabulary (the design system law),
// rather than each page re-pasting the four cubic-beziers.
export const EASE = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",        // the house "expensive" ease-out
  settle: "cubic-bezier(0.22, 1, 0.36, 1)",    // faster-out snap-settle for type
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",     // symmetric, for pinned cross-fades
  cinema: "cubic-bezier(0.83, 0, 0.17, 1)",    // filmic, reserved: intro lift + convergence settle
};

// SHARED MOTION CONSTANTS (IMMERSION_VISION section 1). One source of the numbers
// that must match across all four pages, so the rhythm reads as one hand. Pages
// import these instead of re-declaring their own, which is how the rail tick, the
// pin length, the parallax planes, and the magnetic strengths stay byte-identical.
export const MOTION = {
  // depth fractions for the three-plane parallax read (far/mid/near), reused on
  // every page so the multi-plane depth is consistent property-wide.
  PARALLAX_PLANES: { far: 0.06, mid: 0.12, near: 0.20 },
  // magnetic pull strengths (mirrors cursor.js: CTA 16, row 10). Do not exceed.
  MAGNETIC_STRENGTH: { cta: 16, row: 10 },
  // the cursor-to-ridge proximity radius the scene answers to (world units). The
  // scene owns the read; this is the documented shared value for any page hook.
  RIDGE_PROX_RADIUS: 2.4,
  // the shared pin length factor: every tentpole pin holds for N * 105% of scroll.
  PIN_STEP_PCT: 105,
  // the convergence smoothstep windows: gather pages ramp [0.45, 0.96]; the
  // release page (progress) runs [0.30, 0.92]. Kept here so no page re-tunes them.
  CONV_WINDOW: { gather: [0.45, 0.96], release: [0.30, 0.92] },
  // scrubbed depth moves smooth in this band (never 0, which is jittery).
  SCRUB_SMOOTH: 0.6,
};

// Reusable scroll-choreography helper: a once:true, self-killing reveal that
// honors the "already in view -> reveal instantly" safety contract. EXPORTED so
// a page can author a new fade-rise with the shared grammar instead of a bespoke
// always-on scrub (IMMERSION_PERF section 4/5). Transform/opacity only.
export function revealEnter(el, fromVars, toVars, startFrac) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const restState = { ...toVars };
  delete restState.duration; delete restState.ease; delete restState.delay; delete restState.stagger;
  if (reduced) { gsap.set(el, restState); return; }
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const frac = typeof startFrac === "number" ? startFrac : 0.9;
  if (r.top <= vh * frac) { gsap.set(el, restState); return; }
  gsap.set(el, fromVars);
  ScrollTrigger.create({
    trigger: el, start: `top ${Math.round(frac * 100)}%`, once: true,
    onEnter: () => gsap.to(el, { ...toVars }),
  });
}

// =============================================================================
// SPLITTING (manual, dependency-free)
// =============================================================================

// Word split for body / lead / quote text: each whitespace token becomes a
// .word span we can stagger. Whitespace is preserved as text nodes.
function splitWords(el) {
  if (el.dataset.split) return;
  const text = el.textContent;
  el.textContent = "";
  const frag = document.createDocumentFragment();
  text.split(/(\s+)/).forEach((tok) => {
    if (/^\s+$/.test(tok)) {
      frag.appendChild(document.createTextNode(tok));
    } else if (tok.length) {
      const span = document.createElement("span");
      span.className = "word";
      span.textContent = tok;
      frag.appendChild(span);
    }
  });
  el.appendChild(frag);
  el.dataset.split = "1";
}

// Character split for display headlines, used on the inner of a .mask so each
// glyph can clip-rise and settle its variable-font weight independently. Spaces
// keep their flow. We mark the host so it can be styled and so the variable
// weight settles per character. Returns the array of created .char spans.
function splitChars(el) {
  if (el.dataset.splitChars) return Array.from(el.querySelectorAll(".char"));
  const text = el.textContent;
  el.textContent = "";
  el.classList.add("has-chars");
  const frag = document.createDocumentFragment();
  const chars = [];
  // Group each word's char-spans into an atomic .word wrapper so a wrapping line
  // breaks ONLY at the spaces between words, never mid-word (e.g. "tru / th").
  // overflow-wrap/word-break can't govern this because each glyph is its own
  // inline box; the word wrapper is the standard SplitText fix. The .char spans
  // inside still clip-rise + settle weight independently (the reveal is unchanged).
  let word = null;
  const flushWord = () => {
    if (word) {
      frag.appendChild(word);
      word = null;
    }
  };
  for (const ch of text) {
    if (ch === " ") {
      flushWord();
      frag.appendChild(document.createTextNode(" "));
      continue;
    }
    if (!word) {
      word = document.createElement("span");
      word.className = "word";
    }
    const span = document.createElement("span");
    span.className = "char";
    span.textContent = ch;
    word.appendChild(span);
    chars.push(span);
  }
  flushWord();
  el.appendChild(frag);
  el.dataset.splitChars = "1";
  return chars;
}

// Mono "type-in" for data lines: reveal characters left to right like a terminal
// readout. We wrap each character so we can step its opacity; the leading edge
// gets a brief signal tick. Whitespace stays visible. Returns the char spans.
function splitMono(el) {
  if (el.dataset.splitMono) return Array.from(el.querySelectorAll(".mchar"));
  const nodes = [];
  const chars = [];
  // walk only text nodes so inline data-fact spans keep their bindings
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      const frag = document.createDocumentFragment();
      for (const ch of text) {
        if (ch === " ") {
          frag.appendChild(document.createTextNode(" "));
          continue;
        }
        const span = document.createElement("span");
        span.className = "mchar";
        span.textContent = ch;
        frag.appendChild(span);
        chars.push(span);
      }
      nodes.push([node, frag]);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      Array.from(node.childNodes).forEach(walk);
    }
  };
  Array.from(el.childNodes).forEach(walk);
  nodes.forEach(([node, frag]) => node.replaceWith(frag));
  el.dataset.splitMono = "1";
  return chars;
}

// =============================================================================
// REVEAL HELPER
// If an element is already at or above its trigger line at load it reveals
// instantly (no element can ever stay stuck invisible); otherwise it animates
// on enter. Mirrors the safety contract main.js relies on.
// =============================================================================
function revealOnEnter(el, fromVars, toVars, startFrac) {
  const restState = { ...toVars };
  delete restState.duration; delete restState.ease; delete restState.delay; delete restState.stagger;

  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const frac = typeof startFrac === "number" ? startFrac : 0.9;
  if (r.top <= vh * frac) {
    gsap.set(el, restState);
    return;
  }
  gsap.set(el, fromVars);
  ScrollTrigger.create({
    trigger: el,
    start: `top ${Math.round(frac * 100)}%`,
    once: true,
    onEnter: () => gsap.to(el, { ...toVars }),
  });
}

export function initScroll({ scene, page }) {
  // Per-page parameters (rail chapter labels + the manifold state band this page
  // occupies). Defaults reproduce the landing exactly, so passing nothing is a
  // no-op. See js/page-config.js for the contract.
  const PAGE = page || {};
  // The landing owns a few beats the sub-pages do not (e.g. the hero exit
  // choreography). Sub-pages set their own id via window.__MERIDIAN_PAGE; the
  // landing is "home" (or the default when no id is declared).
  const isHome = (PAGE.id || document.documentElement.getAttribute("data-page") || "home") === "home";
  const sceneBand = Array.isArray(PAGE.sceneBand) ? PAGE.sceneBand : [0, 1];
  const chapterNames = Array.isArray(PAGE.chapters) && PAGE.chapters.length
    ? PAGE.chapters
    : ["Overview", "Thesis", "ALPHAC", "Systems",
       "Discipline", "Performance", "Progress", "Waitlist", "Colophon"];

  // -------------------------------------------------------------------------
  // Lenis (skip smoothing under reduced motion)
  // -------------------------------------------------------------------------
  let lenis = null;
  if (!prefersReduced) {
    lenis = new Lenis({
      lerp: 0.085,
      wheelMultiplier: 1,
      smoothWheel: true,
    });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const scrollTo = (target) => {
    if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.1 });
    else {
      const el = typeof target === "string" ? document.querySelector(target) : target;
      if (el) el.scrollIntoView({ behavior: "auto" });
    }
  };

  // -------------------------------------------------------------------------
  // SCENE API GUARDS. The 3D artist adds setConverge(v) and flareBloom() to the
  // scene's returned object (additive to the public contract). They may or may
  // not be present at the moment this file runs (parallel build, no-WebGL
  // fallback, reduced motion). Wrap every call so a missing method is a silent
  // no-op and never throws. The convergence drive degrades to "no gather" and
  // the page is unaffected, exactly as the brief specifies.
  // -------------------------------------------------------------------------
  const sceneConverge = (v) => {
    if (scene && typeof scene.setConverge === "function") scene.setConverge(v);
  };
  const sceneFlare = () => {
    if (scene && typeof scene.flareBloom === "function") scene.flareBloom();
  };

  // Will the System pin actually run? (same gate as the pin block below.) When
  // it does, the Status headline reveal is owned by the Convergence handoff, so
  // its own char mask must NOT bind a competing auto-trigger. When it does not
  // (reduced motion / mobile / no #system), the headline reveals normally.
  const systemPinWillRun = !!document.getElementById("system") && !prefersReduced && !isMobile;

  // -------------------------------------------------------------------------
  // Global scroll progress -> drives the 3D manifold + rail/progress fills.
  // (scene.setScroll preserved; rail fill + mobile fill preserved.)
  // -------------------------------------------------------------------------
  const railFill = document.getElementById("railFill");
  const mobileFill = document.querySelector(".mobile-progress__fill");
  // A small, transient scene-scroll lead used ONLY during the landing hero exit
  // (Section 3.1): as the wordmark recedes and dissolves, the manifold is nudged
  // a hair ahead of the raw scroll so it reads as the world the camera pulls back
  // INTO, not a flat scroll-away. The body-progress trigger stays the one
  // authoritative driver of scene.setScroll; this only adds a clamped lead so the
  // two never fight. Set by the hero-exit scrub below; 0 everywhere else.
  let sceneLead = 0;
  ScrollTrigger.create({
    trigger: document.body,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => {
      // Drive the manifold within THIS page's chapter of the shared state arc.
      // The landing's default band [0,1] makes this the identity (unchanged);
      // a sub-page band keeps the scene in its own convergence chapter while the
      // rail/progress fills still track the page's own 0..1 scroll. The hero-exit
      // lead is added then clamped so the manifold leads the wordmark dissolve.
      //
      // END-OF-PAGE ANCHOR CLAMP (relaxed for OWNER FIX B). The original clamp held
      // the local scroll at 0.95 so the foot of the page never landed on STATE[4],
      // which USED to be a dead, far, converge:0.0 pose (the "animation stops near
      // the footer" read). STATE[4] has now been reauthored as a RICH, alive closing
      // chapter (closer camera, more amp/density/ridge, a partial closing
      // convergence), so the foot of the page should be ALLOWED to resolve onto it.
      // The clamp is lifted to 0.985 (a hair of buffer so the final frame never sits
      // exactly on the band edge), letting the footer reach the full closing pose and
      // the manifold fill the frame all the way down. The inner Math.min(1, ...)
      // keeps the hero-exit lead from ever overshooting the band.
      scene.setScroll(mapScroll(Math.min(0.985, self.progress + sceneLead), sceneBand));
      if (railFill) railFill.style.height = (self.progress * 100).toFixed(2) + "%";
      if (mobileFill) mobileFill.style.transform = `scaleX(${self.progress.toFixed(4)})`;
    },
  });

  // -------------------------------------------------------------------------
  // HERO EXIT CHOREOGRAPHY (the entrance, read in reverse).
  // As the first viewport scrolls away, the hero column lifts a touch, recedes
  // in scale, softens, and dissolves into the void while the Thesis rises beneath
  // it. The move out of the hero then reads as the camera pulling back THROUGH the
  // wordmark into the world, rather than a flat scroll-away. This is the hero's
  // OWN exit (a scrub on the hero leaving), not a second pinned tentpole and not a
  // second cinematic beat: it only enriches the existing parallax/transform layer,
  // and the giant wordmark's data-parallax drift still composes on top so it
  // recedes slightly faster than the body (multi-plane depth). Transform/opacity/
  // filter only; gated off under reduced motion + mobile, where the hero stays a
  // composed, fully-legible poster. The hero content is owned by the intro->hero
  // cascade for its REVEAL; this only governs its EXIT, so the two never collide.
  // Landing-only: every page ships a #hero / .hero__body, so this is scoped to the
  // home page so a sub-page's own hero treatment (owned elsewhere) is untouched.
  // -------------------------------------------------------------------------
  if (isHome && !prefersReduced && !isMobile) {
    const heroEl = document.getElementById("hero");
    const heroBody = heroEl && heroEl.querySelector(".hero__body");
    const heroScroll = heroEl && heroEl.querySelector(".hero__scroll");
    if (heroEl && heroBody) {
      // the column lifts and recedes as the hero clears the fold. Small amplitudes
      // so it reads as depth, never as the content "leaving early"; the dissolve
      // completes only as the section is most of the way out.
      gsap.to(heroBody, {
        yPercent: -8,
        scale: 0.965,
        opacity: 0,
        // a gentle defocus (kept light: a blur on the huge wordmark is the most
        // expensive of the three, so it stays a whisper and only over the short
        // exit window). Tightened 3px -> 1.5px so the exit reads as a clean recede
        // rather than a smear. GSAP auto-manages will-change for the tween duration.
        filter: "blur(1.5px)",
        ease: "none",
        scrollTrigger: {
          trigger: heroEl,
          start: "top top",
          end: "bottom top",
          scrub: 0.5,
        },
      });
      // the scroll cue fades fast and early (it has done its job the moment the
      // reader starts moving), so it never lingers blurred over the next chapter.
      if (heroScroll) {
        gsap.to(heroScroll, {
          opacity: 0,
          y: 14,
          ease: "none",
          scrollTrigger: {
            trigger: heroEl,
            start: "top top",
            end: "top+=22% top",
            scrub: 0.4,
          },
        });
      }
      // Couple the manifold to the exit (Section 3.1): a tiny scene-scroll lead
      // that rises then falls back to 0 across the hero leaving, so the field
      // appears to be what the camera pulls back INTO as the wordmark dissolves.
      // A half-sine bell over the exit progress means the lead is 0 at both ends,
      // peaks mid-exit, and is already back in lockstep by the time the hero is
      // gone (no snap). Drives the shared sceneLead the body-progress trigger
      // reads, so there is no second setScroll driver to fight. Scalar only.
      ScrollTrigger.create({
        trigger: heroEl,
        start: "top top",
        end: "bottom top",
        onUpdate: (self) => { sceneLead = Math.sin(self.progress * Math.PI) * 0.05; },
        onLeave: () => { sceneLead = 0; },
        onLeaveBack: () => { sceneLead = 0; },
      });
    }
  }

  // -------------------------------------------------------------------------
  // HEADLINE reveals.
  // Hero + section display heads use per-character clip-rise with a variable
  // font weight settle (Fraunces wght climbs from light to rest as each glyph
  // lands). Everything else keeps the single mask-rise. The per-char path is
  // applied to .mask__inner that opt in via the host carrying [data-chars]
  // (the director sets this on hero + section heads); plain masks fall back to
  // the line rise so nothing regresses.
  // -------------------------------------------------------------------------
  function animateChars(inner, opts = {}) {
    const chars = splitChars(inner);
    if (!chars.length) return;
    if (prefersReduced) { gsap.set(chars, { yPercent: 0, opacity: 1 }); inner.classList.add("is-settled"); return; }
    gsap.set(chars, { yPercent: 115, opacity: 0 });
    gsap.to(chars, {
      yPercent: 0,
      opacity: 1,
      duration: 0.78,
      ease: EASE.settle,
      stagger: opts.stagger || 0.02,
      delay: opts.delay || 0,
      onStart: () => inner.classList.add("is-settling"),
      onComplete: () => {
        inner.classList.remove("is-settling");
        inner.classList.add("is-settled");
        // SIGNATURE: the headline gives one restrained micro-pulse as it lands
        // (the page's one new motion identity; main.js owns the driver + the
        // reduced-motion gate, so this is a silent no-op when motion is off).
        if (window.__meridianPulse) window.__meridianPulse(inner);
      },
    });
  }

  gsap.utils.toArray(".mask").forEach((mask) => {
    const inner = mask.querySelector(".mask__inner");
    if (!inner) return;
    const wantsChars = mask.hasAttribute("data-chars") || (mask.parentElement && mask.parentElement.hasAttribute("data-chars"));

    if (prefersReduced) {
      if (wantsChars) { splitChars(inner); gsap.set(inner.querySelectorAll(".char"), { yPercent: 0, opacity: 1 }); inner.classList.add("is-settled"); }
      else gsap.set(inner, { y: 0, opacity: 1 });
      return;
    }

    if (wantsChars) {
      // pre-split + hide so layout is stable before reveal
      const chars = splitChars(inner);
      gsap.set(chars, { yPercent: 115, opacity: 0 });
      // Hero display lines are owned by the intro -> hero handoff (onIntroDone):
      // they stay hidden here so they can cascade as a continuation of the load
      // rather than revealing under the intro overlay. Everything else reveals on
      // its own trigger as before, so nothing off-hero regresses.
      if (mask.closest("#hero")) return;
      // The Status headline ("What is true today.") is the Convergence handoff:
      // when the System pin runs it is revealed from the pin's final step (see
      // setStep), so it must not also bind its own scroll trigger here, or the
      // two reveal paths would collide. It stays pre-split + hidden; the pin
      // owns it. Without the pin it falls through to its normal trigger.
      if (systemPinWillRun && mask.closest("#proof .proof__title")) return;
      const r = mask.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (r.top <= vh * 0.88) {
        animateChars(inner, { delay: 0.05 });
        return;
      }
      ScrollTrigger.create({
        trigger: mask, start: "top 88%", once: true,
        onEnter: () => animateChars(inner, { delay: 0.04 }),
      });
      return;
    }

    // default: single mask-rise
    gsap.set(inner, { yPercent: 110 });
    ScrollTrigger.create({
      trigger: mask, start: "top 88%", once: true,
      onEnter: () => gsap.to(inner, { yPercent: 0, duration: 0.9, ease: EASE.out, delay: 0.04 }),
    });
  });

  // -------------------------------------------------------------------------
  // BODY / LEAD fades, word reveals, line reveals.
  // Content-aware durations + staggers: display-weight leads rise slower and
  // wider, data lines snap fast. No layout-affecting props animated.
  // -------------------------------------------------------------------------
  gsap.utils.toArray(".reveal-fade").forEach((el) => {
    if (prefersReduced) { gsap.set(el, { opacity: 1, y: 0 }); return; }
    // The hero sub + actions are owned by the intro -> hero cascade (onIntroDone)
    // so they reveal last in the rising column rather than under the overlay.
    // They stay hidden here and are released by the handoff.
    if (el.closest("#hero")) { gsap.set(el, { opacity: 0, y: 18 }); return; }
    revealOnEnter(el,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.8, ease: EASE.out },
      0.9);
  });

  gsap.utils.toArray(".reveal-words").forEach((el) => {
    if (prefersReduced) return; // CSS keeps it visible; nothing hidden
    splitWords(el);
    const words = el.querySelectorAll(".word");
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.top <= vh * 0.82) { gsap.set(words, { opacity: 1, y: 0 }); return; }
    // Keep the quote fully legible while it waits below the fold. Fading readable text to 10%
    // opacity created a transient WCAG contrast failure; the rise and stagger carry the reveal
    // without turning content into low-contrast decoration.
    gsap.set(words, { opacity: 1, y: 16 });
    ScrollTrigger.create({
      trigger: el, start: "top 82%", once: true,
      onEnter: () => gsap.to(words, {
        opacity: 1, y: 0, duration: 0.66, ease: EASE.out,
        stagger: { each: 0.018, from: "start" },
      }),
    });
  });

  gsap.utils.toArray(".reveal-line").forEach((el) => {
    if (prefersReduced) { gsap.set(el, { opacity: 1, y: 0 }); return; }
    revealOnEnter(el,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.62, ease: EASE.out },
      0.92);
  });

  // -------------------------------------------------------------------------
  // MONO "type-in" data lines (terminal/Bloomberg feel, on-brand for quant).
  // Opt in via .type-mono. Characters reveal left to right; the leading run
  // briefly carries the signal tint as it writes. data-fact bindings survive
  // because we only split text nodes.
  // -------------------------------------------------------------------------
  gsap.utils.toArray(".type-mono").forEach((el) => {
    if (prefersReduced) return; // leave visible, no hide
    const chars = splitMono(el);
    if (!chars.length) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const run = () => {
      gsap.set(chars, { opacity: 0 });
      gsap.to(chars, {
        opacity: 1, duration: 0.01, ease: "none",
        stagger: { each: 0.018, from: "start" },
        onStart: () => el.classList.add("is-typing"),
        onComplete: () => el.classList.remove("is-typing"),
      });
    };
    if (r.top <= vh * 0.9) { run(); return; }
    ScrollTrigger.create({ trigger: el, start: "top 90%", once: true, onEnter: run });
  });

  // -------------------------------------------------------------------------
  // CHAPTER BOUNDARY HAIRLINE. Each [class="section__rule"] (integrator adds it
  // as the first child of the chaptered sections that follow a tonal change)
  // draws left-to-right as its section enters, marking the seam with one
  // composited gesture. Reduced motion: shown static (CSS handles via .is-drawn
  // set immediately). Mirrors the [data-brand-fill] draw pattern.
  // -------------------------------------------------------------------------
  gsap.utils.toArray(".section__rule").forEach((rule) => {
    if (prefersReduced) { rule.classList.add("is-drawn"); return; }
    const host = rule.parentElement || rule;
    const r = host.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.top <= vh * 0.85) { rule.classList.add("is-drawn"); return; }
    ScrollTrigger.create({
      trigger: host, start: "top 85%", once: true,
      onEnter: () => rule.classList.add("is-drawn"),
    });
  });

  // -------------------------------------------------------------------------
  // signal-word pulse -> brighten the 3D ridge (+ draw-on underline in CSS via
  // .is-lit). Synced so the ridge flare reads as the word landing.
  // -------------------------------------------------------------------------
  gsap.utils.toArray(".signal-word").forEach((el) => {
    ScrollTrigger.create({
      trigger: el, start: "top 80%", once: true,
      onEnter: () => { el.classList.add("is-lit"); scene.pulseRidge(); },
    });
  });

  // -------------------------------------------------------------------------
  // PILLARS / tenets / roadmap rows: content-aware staggered enter.
  // -------------------------------------------------------------------------
  gsap.utils.toArray(".pillar").forEach((p, i) => {
    if (prefersReduced) { gsap.set(p, { opacity: 1, y: 0 }); return; }
    revealOnEnter(p,
      { opacity: 0, y: 26 },
      { opacity: 1, y: 0, duration: 0.7, ease: EASE.out, delay: (i % 3) * 0.07 },
      0.9);
  });

  // The roadmap rows: on desktop with motion, the richer post-Performance block
  // below (OWNER FIX B, C1) owns them with a scrubbed left-assemble, so this generic
  // reveal must skip them there to avoid two triggers fighting over the same rows.
  // Reduced motion shows them static; mobile (where C1 is gated off) keeps this
  // plain enter-reveal so nothing regresses on small screens.
  const roadmapOwnedByTail = !prefersReduced && !isMobile;
  ["roadmap__row"].forEach((cls) => {
    gsap.utils.toArray("." + cls).forEach((el, i) => {
      if (el.classList.contains("roadmap__row--head")) return;
      if (prefersReduced) { gsap.set(el, { opacity: 1, y: 0 }); return; }
      if (roadmapOwnedByTail) return; // C1 assembles these with a scrub
      revealOnEnter(el,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.62, ease: EASE.out, delay: (i % 4) * 0.06 },
        0.92);
    });
  });

  // -------------------------------------------------------------------------
  // PARALLAX depth layering. Elements opting in with [data-parallax] drift at
  // a fraction of scroll speed for a multi-plane depth read. Tiny amplitudes,
  // transform-only, disabled under reduced motion + mobile. The tenet ghost
  // numerals and section eyebrows are the natural candidates (director may add
  // data-parallax; we also auto-apply to tenet ghosts which already exist).
  // -------------------------------------------------------------------------
  if (!prefersReduced && !isMobile) {
    const parallaxItems = [
      ...gsap.utils.toArray("[data-parallax]"),
      ...gsap.utils.toArray(".tenet__ghost"),
      ...gsap.utils.toArray(".footer__wordmark"),
    ];
    const vhNow = window.innerHeight || document.documentElement.clientHeight;
    parallaxItems.forEach((el) => {
      const depth = parseFloat(el.dataset.parallax || "") || (el.classList.contains("footer__wordmark") ? 0.12 : 0.16);
      // Elements already in the first viewport at load (the hero wordmark) must
      // start their drift at scroll 0 with zero offset, then lift as the page
      // scrolls past, so they slide up BEHIND the next chapter (multi-plane
      // depth). Anchoring to "top bottom" would apply a large initial offset to
      // an element that is already on screen. Everything below the fold keeps
      // the standard enter-to-exit scrub.
      const startsInView = el.getBoundingClientRect().top < vhNow * 0.9;
      gsap.to(el, {
        yPercent: -depth * 100,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: startsInView ? "top top" : "top bottom",
          end: "bottom top",
          scrub: 0.6,
        },
      });
    });
  }

  // -------------------------------------------------------------------------
  // THE SYSTEM pin (tentpole, held beat). 5 steps cross-fade inside a pinned
  // frame. Entry is given a longer scrub ramp so it reads as composed, and a
  // 3D focus pull fires on each step. Reduced motion / mobile: steps stack.
  // -------------------------------------------------------------------------
  const systemEl = document.getElementById("system");
  const steps = gsap.utils.toArray(".step");
  const stepCurrent = document.getElementById("stepCurrent");
  const stepTotalEl = document.getElementById("stepTotal");
  let activeStep = -1;

  // The signature lands on the last step: when it locks, fire the single bloom
  // flare and reveal the Status headline a beat later, so "they are one system,
  // run twice" lands on the gather and hands off to "What is true today."
  const proofHeadInner = document.querySelector("#proof .proof__title .mask__inner");
  let convergenceFired = false;

  function revealProofHeadEarly() {
    // The Status headline is a char mask; the mask-reveal loop left it hidden
    // and bound to its own trigger. We pre-empt that trigger so the headline
    // can land on the Convergence handoff rather than on its own scroll line.
    if (!proofHeadInner) return;
    if (proofHeadInner.classList.contains("is-settled") ||
        proofHeadInner.classList.contains("is-settling")) return;
    animateChars(proofHeadInner, { delay: 0 });
  }

  function setStep(idx) {
    if (idx === activeStep) return;
    activeStep = idx;
    steps.forEach((s, i) => {
      const active = i === idx;
      s.classList.toggle("is-active", active);
      s.classList.toggle("is-prev", i < idx);
    });
    if (stepCurrent) stepCurrent.textContent = String(idx + 1).padStart(2, "0");
    scene.pulseRidge();

    // THE CONVERGENCE PAYOFF: only on first arrival at the final step. The
    // bloom flare is the one flare of the page; the Status headline lands ~400ms
    // after the field gathers, the literal "many signals -> one decision" beat.
    // We also add .is-resolved on the System: motion.css dims the step body copy
    // a touch and lifts the converged ridge into the cleared space, so the
    // collapse is the hero of the frame (not a faint background event) before the
    // handoff to "What is true today." Removed if the user scrolls back up.
    if (idx === steps.length - 1) {
      if (systemEl) systemEl.classList.add("is-resolved");
      if (!convergenceFired) {
        convergenceFired = true;
        sceneFlare();
        gsap.delayedCall(0.4, revealProofHeadEarly);
      }
    } else if (systemEl) {
      systemEl.classList.remove("is-resolved");
    }
  }

  if (stepTotalEl && steps.length) stepTotalEl.textContent = String(steps.length).padStart(2, "0");

  if (systemEl && !prefersReduced && !isMobile) {
    const N = steps.length;
    // Convergence ramp: held flat through the early steps, then gathers across
    // the back of the pin so the scatter resolves onto the single ridge exactly
    // as the camera arrives on step 05. Maps the pin's lead-in-adjusted progress
    // p to uConverge with a window that completes just before the end.
    const CONV_START = 0.45; // p at which the field begins to gather
    const CONV_END = 0.96;   // p at which it is fully resolved (lands on step 05)
    systemEl.setAttribute("data-cursor-pinned", systemEl.getAttribute("data-cursor-pinned") || "the field converging on one signal");
    ScrollTrigger.create({
      trigger: systemEl,
      start: "top top",
      // longer hold so the tentpole feels deliberate, not metronomic
      end: "+=" + (N * 105) + "%",
      pin: ".system__sticky",
      pinSpacing: true,
      scrub: false,
      onEnter: () => { systemEl.classList.add("is-pinned", "is-converging"); },
      onEnterBack: () => { systemEl.classList.add("is-pinned", "is-converging"); },
      onLeave: () => {
        systemEl.classList.remove("is-pinned", "is-converging");
        // Hold the resolution into Performance: the field stays gathered on the one
        // signal as the reader reads "What is true today." The post-Performance
        // choreography below then OWNS the convergence override from here down (it
        // releases + re-gathers the field through Progress / Founder / Waitlist and
        // drives the final closing convergence at the footer). We no longer hard-lock
        // at 1 forever, which (with the old far/dim closing state) was a chief cause
        // of the manifold reading as a thin, frozen line after Performance.
        sceneConverge(1);
        // backstop: never leave the Status headline stranded hidden if the
        // final-step reveal did not fire for any reason (idempotent).
        revealProofHeadEarly();
      },
      onLeaveBack: () => { systemEl.classList.remove("is-pinned", "is-converging", "is-resolved"); sceneConverge(0); },
      onUpdate: (self) => {
        // small lead-in dead zone so the first step holds a beat before stepping
        const p = gsap.utils.clamp(0, 1, (self.progress - 0.04) / 0.92);
        const idx = Math.min(N - 1, Math.floor(p * N));
        setStep(idx);
        // drive the manifold gather: 0 until CONV_START, smooth to 1 by CONV_END
        const c = gsap.utils.clamp(0, 1, (p - CONV_START) / (CONV_END - CONV_START));
        // smoothstep so the gather eases in and out, never a linear ramp
        const eased = c * c * (3 - 2 * c);
        sceneConverge(eased);
      },
    });
    setStep(0);
    sceneConverge(0);
  } else {
    steps.forEach((s) => s.classList.add("is-active"));
    if (stepCurrent) stepCurrent.textContent = "01";
    // reduced-motion / mobile: the scene module already composes a mid-gather
    // static frame; do not drive convergence from here (no pin to ride).
  }

  // -------------------------------------------------------------------------
  // THE DISCIPLINE held beat. A brief pin where the three roman ghosts scrub
  // through as the eye descends and the section recedes to its darkest read
  // (CSS .is-recessed). Second deliberate moment, contrasting the System.
  // Reduced motion / mobile: no pin, tenets simply reveal (handled above).
  // -------------------------------------------------------------------------
  const disciplineEl = document.getElementById("discipline");
  const tenets = gsap.utils.toArray(".tenet");
  if (disciplineEl && tenets.length && !prefersReduced && !isMobile) {
    ScrollTrigger.create({
      trigger: disciplineEl,
      start: "top 70%",
      end: "bottom 60%",
      onEnter: () => disciplineEl.classList.add("is-recessed"),
      onEnterBack: () => disciplineEl.classList.add("is-recessed"),
      onLeave: () => disciplineEl.classList.remove("is-recessed"),
      onLeaveBack: () => disciplineEl.classList.remove("is-recessed"),
      onUpdate: (self) => {
        const idx = Math.min(tenets.length - 1, Math.floor(self.progress * tenets.length));
        tenets.forEach((tn, i) => tn.classList.toggle("is-focus", i === idx));
      },
    });
  }

  // =========================================================================
  // POST-PERFORMANCE CHOREOGRAPHY (OWNER FIX B)
  // -------------------------------------------------------------------------
  // The brief: the GSAP + Three.js motion AFTER the 5th section (Performance)
  // must be rich and CONSISTENT all the way to the footer, not thinned out.
  //
  // The scene fix lives in scene.js (STATE[4] reshaped: closer camera, more amp /
  // density / ridge, a partial closing convergence so the spine stays warm). This
  // block adds the on-page motion that matches the quality of the early sections,
  // for #progress / #founder / #waitlist / #footer ONLY (Builder B's scope):
  //   A. The convergence MOTIF carried through: the field, held gathered through
  //      Performance, RELEASES into a plural read across Progress (many markets),
  //      gently RE-GATHERS toward the Waitlist (the invitation to watch one system),
  //      then drives a final CLOSING convergence + the page's last bloom flare on
  //      the footer wordmark. One scrubbed override, the design system's "many ->
  //      one" grammar, never a new idea.
  //   B. Multi-plane PARALLAX depth on the tail sections (the same data-parallax
  //      planes the early page uses), so the closing chapters have the same depth.
  //   C. Scrubbed REVEALS with signal-line accents (the roadmap rows assemble, the
  //      footer columns + wordmark rise) and ONE ridge pulse per chapter arrival,
  //      so the scene answers every chapter to the very bottom.
  //
  // Performant + reduced-motion-safe: the whole block is gated off under reduced
  // motion and mobile (those readers keep the composed static poster + the plain
  // reveals already wired above). Transform / opacity only; one scrub each.
  // =========================================================================
  if (!prefersReduced && !isMobile) {
    const progressEl = document.getElementById("progress");
    const founderEl = document.getElementById("founder");
    const waitlistEl = document.getElementById("waitlist");
    const footerEl = document.getElementById("footer");

    // --- A. The convergence motif, scrubbed across the whole tail ----------
    // One ScrollTrigger spanning Progress-top to the foot of the page drives the
    // convergence override on a deliberate curve so the field is never inert here:
    //   p 0.00 (Progress top)  : 0.62  held high, the resolution carried in
    //   p 0.30 (mid Progress)  : 0.20  RELEASE -> the plural "many markets" read
    //   p 0.62 (Founder)       : 0.34  a breath, the field re-stirs
    //   p 0.86 (Waitlist)      : 0.70  RE-GATHER toward the one-system invitation
    //   p 1.00 (Footer)        : 0.92  the closing convergence (footer beat tops it)
    // Authored as eased segments so it reads as a living wave, not a ramp. This
    // takes the override back from the System pin's hold, which is the core
    // "stop the field freezing after Performance" fix.
    if (progressEl && footerEl) {
      const stops = [
        [0.00, 0.62], [0.30, 0.20], [0.62, 0.34], [0.86, 0.70], [1.00, 0.92],
      ];
      const tailConverge = (p) => {
        for (let i = 0; i < stops.length - 1; i++) {
          const [p0, v0] = stops[i], [p1, v1] = stops[i + 1];
          if (p <= p1) {
            const k = p1 === p0 ? 1 : (p - p0) / (p1 - p0);
            const e = k * k * (3 - 2 * k); // smoothstep each segment
            return v0 + (v1 - v0) * e;
          }
        }
        return stops[stops.length - 1][1];
      };
      ScrollTrigger.create({
        trigger: progressEl,
        start: "top bottom",   // begin as Progress first peeks in
        endTrigger: footerEl,
        end: "bottom bottom",  // resolve as the footer fully lands
        scrub: MOTION.SCRUB_SMOOTH,
        onUpdate: (self) => { sceneConverge(tailConverge(self.progress)); },
        // if the reader ever scrolls back UP into Performance, hand the override
        // back to the System pin's resolution so the two never disagree.
        onLeaveBack: () => { sceneConverge(1); },
      });
    }

    // --- B. Multi-plane parallax on the tail section eyebrows + heads -------
    // The early page parallaxes its ghost numerals + the footer wordmark; we add
    // the same restrained, transform-only depth to the tail section eyebrows and
    // titles so Progress / Founder / Waitlist carry the page's depth read instead
    // of sitting flat. Tiny amplitudes (the shared MOTION.PARALLAX_PLANES), each a
    // single enter-to-exit scrub. The footer wordmark already parallaxes above.
    const parallaxTail = [
      [progressEl && progressEl.querySelector(".house__head"), MOTION.PARALLAX_PLANES.far],
      [founderEl && founderEl.querySelector(".founder__id"), MOTION.PARALLAX_PLANES.mid],
      [waitlistEl && waitlistEl.querySelector(".waitlist__head"), MOTION.PARALLAX_PLANES.far],
    ];
    parallaxTail.forEach(([el, depth]) => {
      if (!el) return;
      gsap.to(el, {
        yPercent: -depth * 100,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: MOTION.SCRUB_SMOOTH },
      });
    });

    // --- C1. The roadmap ASSEMBLES: each row writes in from the left as it
    // crosses, the data-table reading as the engine's slots populating in order.
    // A scrubbed x+opacity (no layout), so the table builds with the scroll rather
    // than popping. The head row is excluded (it is the schema, always present).
    gsap.utils.toArray("#progress .roadmap__row").forEach((row, i) => {
      if (row.classList.contains("roadmap__row--head")) return;
      gsap.fromTo(row,
        { opacity: 0, x: -18 },
        {
          opacity: 1, x: 0, ease: EASE.out,
          scrollTrigger: { trigger: row, start: "top 92%", end: "top 70%", scrub: MOTION.SCRUB_SMOOTH },
        });
    });

    // --- C2. The footer composes as the closing chapter: the columns rise in a
    // gentle stagger, the giant wordmark lifts + clarifies (it already parallaxes,
    // so this is a one-shot settle on enter), and the closing convergence beat
    // fires the page's final bloom flare + ridge pulse as the wordmark lands, the
    // "one system, signed" payoff at the very bottom. Reveal-on-enter (once), so it
    // never re-fires on scroll-up; transform/opacity only.
    if (footerEl) {
      const cols = gsap.utils.toArray("#footer .footer__col");
      cols.forEach((col, i) => {
        revealOnEnter(col,
          { opacity: 0, y: 22 },
          { opacity: 1, y: 0, duration: 0.7, ease: EASE.out, delay: (i % 3) * 0.08 },
          0.92);
      });
      const wordmark = footerEl.querySelector(".footer__wordmark");
      if (wordmark) {
        // the wordmark's own settle (the data-parallax drift composes on top): it
        // rises a touch and resolves opacity as the footer lands, the closing mark.
        revealOnEnter(wordmark,
          { opacity: 0, y: 28 },
          { opacity: 1, y: 0, duration: 1.0, ease: EASE.cinema },
          0.96);
      }
      // THE CLOSING CONVERGENCE PAYOFF: the page's last flare. As the footer status
      // line lands, drive the override the rest of the way to a clean gather and
      // fire the single closing flare + a ridge pulse, so the manifold resolves to
      // one warm spine under the wordmark, the bottom-of-page echo of the System's
      // convergence. once:true so it is a one-shot beat, never a loop.
      const status = footerEl.querySelector(".footer__status") || footerEl;
      ScrollTrigger.create({
        trigger: status, start: "top 90%", once: true,
        onEnter: () => { sceneConverge(0.96); sceneFlare(); scene.pulseRidge(); },
      });
    }
  }

  // -------------------------------------------------------------------------
  // STAT counters (count up on enter). Tabular mono.
  // -------------------------------------------------------------------------
  gsap.utils.toArray("[data-count]").forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const suffix = el.dataset.suffix || "";
    const group = el.dataset.group === "1";
    const fmt = (v) => {
      let s = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString();
      if (group) s = Number(s).toLocaleString("en-US");
      return s + suffix;
    };
    el.textContent = fmt(0);
    ScrollTrigger.create({
      trigger: el, start: "top 88%", once: true,
      onEnter: () => {
        if (prefersReduced) { el.textContent = fmt(target); return; }
        const obj = { v: 0 };
        gsap.to(obj, {
          // 1.6s -> 2.0s so the large statband numerals (24M+, 8,436, 2,820+) tally
          // slowly enough to be read as they climb, not blur past.
          v: target, duration: 2.0, ease: EASE.out,
          onUpdate: () => { el.textContent = fmt(obj.v); },
        });
      },
    });
  });

  const zeroStat = document.querySelector(".stat--zero");
  if (zeroStat) {
    ScrollTrigger.create({
      trigger: zeroStat, start: "top 85%", once: true,
      onEnter: () => zeroStat.classList.add("is-in"),
    });
  }

  // -------------------------------------------------------------------------
  // RAIL: living chapter counter + active section + click-to-scroll.
  // The rail is promoted from dots to a typographic counter. As each chapter
  // becomes active we set its label on the rail head (#railIndex / #railName)
  // with a brief blur/slide (CSS .is-ticking), and mark the active number.
  // -------------------------------------------------------------------------
  const railItems = gsap.utils.toArray(".rail__item");
  const railIndex = document.getElementById("railIndex");
  const railName = document.getElementById("railName");
  // Rail chapter labels are per-page (parameterized via the page config), so the
  // one rail mechanism is reused on every page; only the labels differ. The
  // landing renames its old System / Status / House chapters to the sitemap's
  // Systems / Performance / Progress so all four pages share one numbered spine.
  const CHAPTER_NAMES = chapterNames;

  let lastChapter = -1;
  function setChapter(idx) {
    if (idx === lastChapter) return;
    lastChapter = idx;
    railItems.forEach((it, i) => it.classList.toggle("is-active", i === idx));
    if (railIndex || railName) {
      const head = document.getElementById("railHead");
      const apply = () => {
        if (railIndex) railIndex.textContent = String(idx).padStart(2, "0");
        if (railName) railName.textContent = CHAPTER_NAMES[idx] || "";
      };
      if (head && !prefersReduced) {
        head.classList.add("is-ticking");
        apply();
        clearTimeout(setChapter._t);
        setChapter._t = setTimeout(() => head.classList.remove("is-ticking"), 360);
      } else {
        apply();
      }
    }
  }

  gsap.utils.toArray("[data-section]").forEach((sec) => {
    const idx = parseInt(sec.dataset.section, 10);
    ScrollTrigger.create({
      trigger: sec, start: "top 50%", end: "bottom 50%",
      onToggle: (self) => { if (self.isActive) setChapter(idx); },
    });
  });

  railItems.forEach((it) => {
    it.addEventListener("click", (e) => {
      e.preventDefault();
      scrollTo(it.getAttribute("href"));
    });
  });

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    if (a.classList.contains("rail__item")) return;
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length > 1 && document.querySelector(id)) {
        e.preventDefault();
        scrollTo(id);
        if (a.classList.contains("skip-link")) {
          document.querySelector(id).focus({ preventScroll: true });
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // SCROLL-VELOCITY skew (Locomotive signature, homeopathic dose). Body text
  // wrappers opting in with [data-skew] (and the content column by default)
  // take a sub-degree skew on fast scrolls that relaxes to flat. Off under
  // reduced motion + mobile. Transform-only.
  // -------------------------------------------------------------------------
  if (lenis && !prefersReduced && !isMobile) {
    const skewTargets = gsap.utils.toArray("[data-skew]");
    if (skewTargets.length) {
      const setters = skewTargets.map((el) => gsap.quickTo(el, "skewY", { duration: 0.5, ease: EASE.out }));
      let raf = 0;
      // P0-C 15: max skew lifted 1.4 -> 2.2deg so the momentum lean reads with a
      // touch more life on fast scrolls (still a sub-3deg homeopathic dose, the
      // Locomotive signature, never a slant). A `is-scrolling-fast` flag is toggled
      // on <html> above a velocity threshold so a single restrained CSS rule can
      // brighten the resting hairlines (--grey-825 -> --paper-dim feel) while the
      // page is in fast motion, then relax. Off under reduced motion + mobile (gated).
      const MAX = 2.2; // degrees, hard cap
      const root = document.documentElement;
      const FAST_V = 2.2; // velocity above which the page reads as "in motion"
      let heatTimer = 0;
      // Lenis emits its instance on the per-frame "scroll" (carrying .velocity);
      // other emits pass a delta object with no velocity. Read defensively so a
      // missing/NaN velocity never writes a bad transform.
      lenis.on("scroll", (e) => {
        const v = e && typeof e.velocity === "number" ? e.velocity : 0;
        // toggle the fast-scroll brighten flag (debounced relax), cheap class write.
        if (Math.abs(v) > FAST_V) {
          if (!root.classList.contains("is-scrolling-fast")) root.classList.add("is-scrolling-fast");
          clearTimeout(heatTimer);
          heatTimer = setTimeout(() => root.classList.remove("is-scrolling-fast"), 220);
        }
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const sk = gsap.utils.clamp(-MAX, MAX, v * 0.06);
          setters.forEach((s) => s(sk));
        });
      });
    }

    // -----------------------------------------------------------------------
    // SCROLL VELOCITY -> a small, decaying pointer-like nudge on the manifold.
    // The manifold already answers the cursor; on scroll (when the pointer is
    // stationary) the field reads inert. We sample Lenis velocity each tick,
    // clamp it to a few pixels of equivalent push, and feed it as a brief y-axis
    // setPointer nudge that decays back to rest, so the surface breathes WITH the
    // scroll. cursor.js owns the real pointer and overwrites this the instant the
    // mouse moves (both write the scene's lerped pointer target), so the two never
    // fight; this only colours the scroll-only moments. Off on mobile + reduced
    // motion (the whole block is gated). One self-throttled rAF, transform-only.
    if (scene && typeof scene.setPointer === "function") {
      const CLAMP = 4;        // px-equivalent per frame, the brief's bound
      const NORM = 1 / 900;   // velocity -> a gentle normalized push
      let nudge = 0;          // current decaying nudge (normalized y)
      let pRaf = 0;
      let lastV = 0;
      const decay = () => {
        pRaf = 0;
        // ease the nudge toward the latest clamped velocity push, then let it relax
        const push = gsap.utils.clamp(-CLAMP, CLAMP, lastV * NORM * CLAMP) / CLAMP;
        nudge = nudge * 0.82 + push * 0.18;
        lastV *= 0.7; // the velocity sample itself decays between scroll events
        // feed only the y channel; the scene lerps toward it and cursor.js's own
        // setPointer (on mousemove) takes precedence whenever the reader moves.
        scene.setPointer(0, gsap.utils.clamp(-1, 1, nudge));
        if (Math.abs(nudge) > 0.001 || Math.abs(lastV) > 0.5) pRaf = requestAnimationFrame(decay);
      };
      lenis.on("scroll", (e) => {
        const v = e && typeof e.velocity === "number" ? e.velocity : 0;
        lastV = v;
        if (!pRaf) pRaf = requestAnimationFrame(decay);
      });
    }
  }

  // -------------------------------------------------------------------------
  // refresh once everything is wired and fonts are in
  // -------------------------------------------------------------------------
  ScrollTrigger.refresh();
  window.addEventListener("load", () => ScrollTrigger.refresh());

  // -------------------------------------------------------------------------
  // INTRO -> HERO handoff hook. main.js owns the calibration intro; when it
  // finishes it calls onIntroDone(), and we fire the hero headline reveal as a
  // shared-element-feeling continuation rather than a separate fade. Idempotent.
  // -------------------------------------------------------------------------
  function onIntroDone() {
    // Build the resolved set of hero .mask elements that carry char splitting.
    const heroChars = gsap.utils.toArray("#hero .mask").filter((m) =>
      m.hasAttribute("data-chars") || (m.parentElement && m.parentElement.hasAttribute("data-chars")));
    const heroSub = document.querySelector("#hero .hero__sub");
    const heroActions = document.querySelector("#hero [data-hero-actions]");
    const hasIntroCurtain = Boolean(document.getElementById("intro"));

    // Most evidence pages do not render an intro curtain. Hiding their LCP headline and
    // revealing it character by character delayed the first useful paint by more than two
    // seconds even though there was no transition to hand off from. Keep the authored cascade
    // only where a real curtain exists; otherwise the hero is the first frame and must already
    // be composed. Reduced-motion visitors use the same immediate final state.
    if (prefersReduced || !hasIntroCurtain) {
      heroChars.forEach((m) => {
        const inner = m.querySelector(".mask__inner");
        if (inner) { splitChars(inner); gsap.set(inner.querySelectorAll(".char"), { yPercent: 0, opacity: 1 }); inner.classList.add("is-settled"); }
      });
      if (heroSub) gsap.set(heroSub, { opacity: 1, y: 0 });
      if (heroActions) gsap.set(heroActions, { opacity: 1, y: 0 });
      return;
    }

    // Cascade the hero display lines: wordmark first, then statement lines,
    // with a small inter-line delay so it reads as one rising column.
    let d = 0.0;
    let flagshipLineDelay = 0; // when the "AlphaForge is the first algorithm." line lands
    heroChars.forEach((m, i) => {
      const inner = m.querySelector(".mask__inner");
      if (!inner || inner.classList.contains("is-settled")) return;
      animateChars(inner, { delay: d, stagger: i === 0 ? 0.026 : 0.018 });
      // The third hero statement line is marked data-hero-flagship: brighten the
      // signal ridge exactly as the product name resolves (second pulse).
      if (m.hasAttribute("data-hero-flagship")) {
        flagshipLineDelay = d;
        gsap.delayedCall(d + 0.42, () => scene.pulseRidge());
      }
      d += i === 0 ? 0.16 : 0.1;
    });
    // First ridge ignition rides with the wordmark settle (kept from before).
    scene.pulseRidge();

    // Hero sub, then the single primary action, reveal LAST in the column so the
    // eye lands story -> product -> act. Anchored a beat after the flagship line.
    const subDelay = (flagshipLineDelay || d) + 0.5;
    if (heroSub) gsap.to(heroSub, { opacity: 1, y: 0, duration: 0.8, ease: EASE.out, delay: subDelay });
    if (heroActions) gsap.to(heroActions, {
      opacity: 1, y: 0, duration: 0.7, ease: EASE.out, delay: subDelay + 0.3,
      // SIGNATURE: the primary action gives one micro-pulse WITH a faint signal
      // glow flare as it enters (the page's one new motion identity, glow form
      // reserved for the key CTA). main.js owns the driver + reduced-motion gate.
      onComplete: () => {
        const cta = heroActions.querySelector(".hero__cta");
        if (cta && window.__meridianPulse) window.__meridianPulse(cta, { glow: true });
      },
    });
  }

  return {
    lenis,
    scrollTo,
    refresh: () => ScrollTrigger.refresh(),
    onIntroDone,
  };
}
