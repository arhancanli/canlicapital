// =============================================================================
// CANLI CAPITAL / main.js
// Orchestration: brand binding, capability detection, intro reveal, custom
// cursor, top-nav behavior, stat-band render, then init scene + scroll in order.
// Honors prefers-reduced-motion and degrades the 3D on mobile / no-WebGL.
// =============================================================================

import { BRAND, FLAGSHIP, TAGLINE, STATS, FACTS } from "../config/brand.js";
import { buildShell } from "./shell.js";
import { getPageConfig } from "./page-config.js";

// The per-page parameters (rail chapters, scene band, still frame). Read once so
// the shared bootstrap can drive any of the four pages without forking. The
// landing's defaults make this a no-op for the existing page.
const PAGE = getPageConfig();

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 768px)").matches;
const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

// ---- THE MICRO-PULSE SIGNATURE (one driver, every module) -------------------
// The page's one new motion identity: a major reveal completing (headline lands,
// a stat hits its final value, a key CTA enters) gives ONE restrained breath: a
// 0.15s scale settle (1 -> 1.04 -> 1) + an optional faint signal glow flare. The
// CSS owns the animation (motion.css section 9, keyed off [data-pulse]); this
// only sets the attribute on reveal-completion and clears it after the beat so it
// can fire again on a later reveal. Exposed on window so scroll.js (headline
// settle) and landing.js (stat tally / CTA enter) drive the SAME identity rather
// than each re-inventing it. Fully inert under reduced motion (the static read
// takes no breath); the CSS gate is the second line of defense. Coalesced per
// element only (we never re-arm a pulse already running on that node).
function firePulse(el, opts) {
  if (!el || prefersReduced) return;
  // do not stack a second pulse on a node still mid-breath
  if (el.hasAttribute("data-pulse")) return;
  const glow = opts && opts.glow;
  el.setAttribute("data-pulse", glow ? "glow" : "");
  // clear after the LONGEST animation completes so the glow flare (0.2s) is never
  // truncated by the shorter scale settle (0.15s) ending first. A single timer is
  // the source of truth (animationend would fire on the scale first), with a small
  // tail so the attribute is always removed and the beat can fire again later.
  setTimeout(() => el.removeAttribute("data-pulse"), 360);
}
if (typeof window !== "undefined") window.__meridianPulse = firePulse;

// ---- capability detection ---------------------------------------------------
function detectWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (e) { return false; }
}
const lowMemory = Boolean(navigator.deviceMemory && navigator.deviceMemory < 4);
// The fixed manifold remains the desktop signature. Mobile uses the authored
// static fallback and never downloads the ~500 KiB Three.js scene bundle; this
// removes startup work without reducing content, navigation, or evidence access.
const useCanvas = detectWebGL() && !isMobile && !lowMemory;

// =============================================================================
// 1. BRAND BINDING (single source of truth -> every visible instance)
// =============================================================================
function bindBrand() {
  document.querySelectorAll("[data-brand]").forEach((el) => { el.textContent = BRAND; });
  document.querySelectorAll("[data-flagship]").forEach((el) => { el.textContent = FLAGSHIP; });
  document.querySelectorAll("[data-tagline]").forEach((el) => { el.textContent = TAGLINE; });
  // Facts woven into prose are driven from the same constants as the stat band,
  // so a single edit in config/brand.js keeps numbers and sentences in agreement.
  document.querySelectorAll("[data-fact]").forEach((el) => {
    const key = el.getAttribute("data-fact");
    if (key && key in FACTS) el.textContent = FACTS[key];
  });
  // Title: each page authors its own true <title> in the head (real per-page
  // meta is part of the brand). We never clobber that crafted string. We only
  // template it when a page explicitly opts in with a {brand} / {flagship}
  // placeholder, so a rename in config/brand.js still propagates into the title
  // without discarding the better hand-written copy.
  if (document.title.includes("{brand}") || document.title.includes("{flagship}")) {
    document.title = document.title
      .replace(/\{brand\}/g, BRAND)
      .replace(/\{flagship\}/g, FLAGSHIP);
  }
}

// =============================================================================
// 2. STAT BAND RENDER (from approved STATS list)
// =============================================================================
function renderStats() {
  const list = document.getElementById("statList");
  if (!list) return;
  list.innerHTML = "";
  STATS.forEach((s) => {
    const li = document.createElement("li");
    li.className = "stat";
    const val = document.createElement("span");
    val.className = "stat__val mono-data";
    val.setAttribute("data-count", String(s.value));
    val.setAttribute("data-decimals", String(s.decimals || 0));
    val.setAttribute("data-suffix", s.suffix || "");
    if (s.group) val.setAttribute("data-group", "1");
    val.textContent = "0";
    const lab = document.createElement("span");
    lab.className = "stat__label mono-label";
    lab.textContent = s.label;
    li.append(val, lab);
    list.appendChild(li);
  });
}

// =============================================================================
// 3. INTRO REVEAL
// =============================================================================
// Honest calibration tokens cycled under the loading bracket as the bar fills.
// None are metrics; each names a real thing the engine reads in. The motion
// designer authored the #introCalib CSS contract (.is-shown / .is-swapping);
// main.js owns writing the text, since it owns the intro progress loop.
// The first token must NOT echo the literal "[ loading ]" bracket in the markup
// (two identical stacked words read as a glitch), so the cycle opens on a
// distinct real input the engine reads at boot.
const CALIB_TOKENS = ["market data", "point-in-time data", "signal library", "paper ledger"];

// Swap the calibration token with a brief de-emphasis so the change reads as a
// settle, not a flicker. Idempotent: re-asserting the same token is a no-op.
function setCalibToken(el, text) {
  if (!el || el.dataset.token === text) return;
  el.dataset.token = text;
  el.classList.add("is-shown");
  if (prefersReduced) { el.textContent = text; return; }
  el.classList.add("is-swapping");
  // let the de-emphasis paint, then write the new token and lift it back in
  setTimeout(() => {
    el.textContent = text;
    el.classList.remove("is-swapping");
  }, 140);
}

// The intro returns a small handle so boot() can release the count the moment
// the real scene is ready (markReady), instead of running a fixed fake timer.
// The count climbs to a holding ceiling, then completes to 100 (never parks on
// 99) once either readiness arrives or a short cap elapses. On the no-canvas /
// mobile path there is no heavy WebGL to mask, so the cap is much shorter.
function runIntro(onDone) {
  const intro = document.getElementById("intro");
  const fill = document.getElementById("introFill");
  const pct = document.getElementById("introPct");
  const calib = document.getElementById("introCalib");
  if (!intro) { onDone(); return { markReady() {} }; }

  // pick the calibration token for a given progress (30 / 60 / 90 thresholds)
  const tokenFor = (v) => v < 30 ? CALIB_TOKENS[0]
    : v < 60 ? CALIB_TOKENS[1]
    : v < 90 ? CALIB_TOKENS[2]
    : CALIB_TOKENS[3];

  const setPct = (v) => { pct.textContent = String(Math.round(v)).padStart(2, "0"); };

  if (prefersReduced) {
    intro.classList.add("is-settling");
    fill.style.width = "100%";
    setPct(100);
    setCalibToken(calib, CALIB_TOKENS[CALIB_TOKENS.length - 1]);
    setTimeout(() => { intro.classList.add("is-done"); onDone(); }, 200);
    return { markReady() {} };
  }

  if (calib) setCalibToken(calib, CALIB_TOKENS[0]);

  // Cap: how long we are willing to hold the curtain at most. Shorter when there
  // is no WebGL to mask (mobile / no-canvas), so a discerning visitor is never
  // stalled on a black screen waiting for nothing.
  const CAP = useCanvas ? 1500 : 950;
  // The count rests at a ceiling until readiness; if it lands there before ready
  // it should not sit at a hard 99 forever, so the ceiling is high but the final
  // lift to 100 is what closes the curtain.
  const CEIL = 88;

  let p = 0;
  let done = false;
  let ready = false;
  let completing = false;

  const finish = () => {
    if (done) return;
    done = true;
    setPct(100);
    fill.style.width = "100%";
    intro.classList.add("is-settling");
    setTimeout(() => {
      intro.classList.add("is-done");
      onDone();
    }, 420);
  };

  // Close out: glide the remaining percentage to 100 over a short settle, then
  // lift the curtain. Used by both the readiness signal and the cap timeout.
  const complete = () => {
    if (completing || done) return;
    completing = true;
    setCalibToken(calib, CALIB_TOKENS[CALIB_TOKENS.length - 1]);
    const from = p;
    const t0 = performance.now();
    const DUR = 240;
    const settle = (now) => {
      if (done) return;
      const k = Math.min(1, (now - t0) / DUR);
      const eased = 1 - Math.pow(1 - k, 3); // ease-out cubic to 100
      p = from + (100 - from) * eased;
      fill.style.width = p + "%";
      setPct(p);
      if (k < 1) requestAnimationFrame(settle);
      else finish();
    };
    requestAnimationFrame(settle);
  };

  // hard cap: never hold the curtain past CAP, even if readiness never signals.
  const capTimer = setTimeout(() => { ready = true; complete(); }, CAP);

  // climb toward the ceiling; complete the moment readiness has arrived.
  const tick = () => {
    if (done || completing) return;
    if (ready) { complete(); return; }
    // ease toward the ceiling, faster early; never overshoot CEIL before ready
    const step = p < 60 ? 5 + Math.random() * 8 : 2 + Math.random() * 3;
    p = Math.min(CEIL, p + step);
    fill.style.width = p + "%";
    setPct(p);
    setCalibToken(calib, tokenFor(p));
    setTimeout(tick, 70 + Math.random() * 70);
  };
  setTimeout(tick, 140);

  return {
    // boot() calls this once the scene is composed (or the no-canvas path is
    // settled). It releases the count to glide to 100 and lift the curtain.
    markReady() {
      if (ready) return;
      ready = true;
      clearTimeout(capTimer);
      complete();
    },
  };
}

// =============================================================================
// 4. TOP NAV (hide on scroll down, show on up; hairline after hero)
// =============================================================================
function initNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  // The top nav STAYS VISIBLE at every scroll position so the other pages are
  // always one click away (a hide-on-scroll bar left navigation unreachable while
  // reading). rAF-polled so the frosted background engages the instant we leave the
  // hero, regardless of what drives the scroll (Lenis) or the device. is-hidden is
  // never applied; we clear it every frame in case any other code sets it.
  const tick = () => {
    nav.classList.remove("is-hidden");
    nav.classList.toggle("is-scrolled", window.scrollY > 48);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// =============================================================================
// 5. CUSTOM CURSOR
// The premium pointer lives in its own module (js/cursor.js + css/cursor.css).
// main.js only owns wiring it in boot(), in the right order, with the live scene
// so scene.setPointer reaches the manifold. See section 9 (boot).
// =============================================================================

// =============================================================================
// 6. WAITLIST FORM
// The waitlist (#waitlist-form -> /api/waitlist, honeypot, status states) lives
// in its own module, js/waitlist.js, loaded directly from index.html. main.js no
// longer owns its logic, so the two builders' contracts stay independent.
// =============================================================================

// =============================================================================
// 7. MOBILE PROGRESS BAR (rail replacement)
// =============================================================================
function initMobileProgress() {
  if (!isMobile) return;
  const bar = document.createElement("div");
  bar.className = "mobile-progress";
  const fill = document.createElement("div");
  fill.className = "mobile-progress__fill";
  bar.appendChild(fill);
  document.body.appendChild(bar);
}

// =============================================================================
// 8. SCENE + OFFSCREEN/VISIBILITY PAUSE
// =============================================================================
async function initScene() {
  const canvas = document.getElementById("scene");
  if (!useCanvas || !canvas) {
    document.body.classList.add("no-webgl");
    return null;
  }
  const { createScene, readPriorArc } = await import("./scene.js");
  const scene = createScene(canvas, { reducedMotion: prefersReduced, mobile: isMobile });

  canvas.classList.add("is-ready");

  if (prefersReduced) {
    // One composed static frame, frozen at THIS page's chapter of the manifold
    // (its still position on the global state arc) so the page's thesis is
    // legible even with motion off. The landing's default still is mid-arc.
    if (typeof scene.setScroll === "function") scene.setScroll(PAGE.sceneStill);
    scene.renderOnce();
    return scene;
  }

  // Seed this page's manifold at the start of its band, then (if a prior page in
  // this session wrote its last arc frame) ease FROM that frame to the band so a
  // sub-page entry reads as the camera flying here under the curtain, not a cut.
  // The whole property then feels like one continuous flight across navigations.
  // Every call is guarded; on a fresh load (no prior arc) this is a clean entry.
  if (typeof scene.setScroll === "function") scene.setScroll(PAGE.sceneBand[0]);
  if (!isMobile && typeof scene.enterFrom === "function" && typeof readPriorArc === "function") {
    const prior = readPriorArc();
    if (prior) scene.enterFrom(prior.p, prior.c);
  }

  scene.start();

  // P0-A: pause ONLY when the tab is hidden, never on scroll position. The canvas
  // is position:fixed inset:0 (it is the whole-page backdrop), but it is declared
  // early in the DOM, so an element-intersection observer marked it "not
  // intersecting" the instant the reader scrolled past its DOM-flow origin and
  // froze the manifold mid-page (the "stops toward the end" report). The scene
  // must live from load until the tab is hidden, independent of scroll. A
  // tab-visibility pause is the only correct power saver here.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) scene.stop();
    else scene.start();
  });

  window.addEventListener("resize", () => scene.resize());
  return scene;
}

// =============================================================================
// 9. BOOT (init order matters: brand -> stats -> scene -> scroll -> intro)
// =============================================================================
// One-shot guard so the hero reveal happens exactly once, no matter which path
// reaches it first (the scroll handoff or any failsafe). This is the fix for the
// race where a slow scene init pushed the intro onto the 6s failsafe and the two
// reveal paths collided (one hiding the chars the other had just shown).
let heroRevealed = false;
let scrollHandoff = null; // set once scroll.js is wired

function revealHero() {
  if (heroRevealed) return;
  heroRevealed = true;
  if (scrollHandoff) {
    // cinematic path: the hero display lines cascade as a continuation of load
    scrollHandoff();
  } else {
    revealHeroFallback();
  }
  // The brand wordmark's one bespoke gesture: a hairline signal rule draws under
  // the mark once its glyphs settle, synced to the manifold's first ridge pulse.
  const word = document.querySelector(".hero__word[data-brand-fill]");
  if (word) {
    const draw = () => {
      word.classList.add("is-drawn");
      if (window.__meridianScene && window.__meridianScene.pulseRidge) {
        window.__meridianScene.pulseRidge();
      }
    };
    if (prefersReduced) draw();
    else setTimeout(draw, 760); // lands just after the wordmark glyphs settle
  }
}

async function boot() {
  // Build the shared cross-page chrome (nav + footer) FIRST, so the brand
  // binding below resolves the names inside the injected markup and the scroll
  // wiring picks up the nav/footer anchor links. This is the one nav and footer
  // for every page; see js/shell.js.
  buildShell();
  bindBrand();
  renderStats();
  initMobileProgress();
  initNav();

  // Start the intro progress immediately so it is never gated on scene init.
  // Its completion only flips a flag; the actual hero reveal waits until scroll
  // is wired too (so the cascade handoff is available), coordinated by revealHero.
  let introDone = false;
  const introHandle = runIntro(() => {
    introDone = true;
    document.body.removeAttribute("data-loading");
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    // Reveal now only if the scroll cascade is already wired; otherwise defer to
    // the end of boot (which runs revealHero once scroll is ready). The 6s
    // failsafe is the final backstop if scroll never arrives at all.
    if (scrollHandoff) revealHero();
  });

  // ---- FIRST-PAINT ORDER -----------------------------------------------------
  // The heavy module on this property is three (the manifold renderer, ~130 kB
  // gzip), pulled only by scene.js. It is already a lazy chunk (Vite never
  // modulepreloads it), but the OLD boot awaited initScene() FIRST, so the
  // browser fetched + parsed three on the critical path before the hero text and
  // chrome could paint. Two corrections, no behavior loss:
  //   1. Wire scroll FIRST, with a no-op scene placeholder. scroll.js depends
  //      only on gsap/lenis (already on the critical path), so the hero cascade
  //      handoff (scrollHandoff) becomes available immediately, and the headline
  //      reveals as a continuation of load without waiting on three at all.
  //   2. Defer the scene import to AFTER first paint (idle / next frame). The
  //      manifold then streams in under its own 1.4s opacity fade once composed,
  //      so the visual identity is unchanged; it simply no longer blocks paint.
  // The intro curtain is never gated on the scene: runIntro's CAP backstop lifts
  // it promptly, and markReady() still fires the moment the scene is composed (or
  // immediately, on the no-canvas path) to close the curtain crisply when it can.

  // scroll choreography needs a scene-like object; start with a no-op stand-in so
  // the cascade is wired before three exists. Replaced with the live scene below.
  let liveScene = null;
  const sceneApi = {
    setScroll(v) { if (liveScene && liveScene.setScroll) liveScene.setScroll(v); },
    setPointer(x, y) { if (liveScene && liveScene.setPointer) liveScene.setPointer(x, y); },
    pulseRidge() { if (liveScene && liveScene.pulseRidge) liveScene.pulseRidge(); },
    renderOnce() { if (liveScene && liveScene.renderOnce) liveScene.renderOnce(); },
    setConverge(v) { if (liveScene && liveScene.setConverge) liveScene.setConverge(v); },
    flareBloom() { if (liveScene && liveScene.flareBloom) liveScene.flareBloom(); },
  };

  // Expose the proxy as the public scene handle immediately, so the brand-draw
  // ridge pulse (revealHero) routes through to the live scene the moment it is
  // composed, whether that is before or after the wordmark settles.
  window.__meridianScene = sceneApi;

  const { initScroll } = await import("./scroll.js");
  const scrollApi = initScroll({ scene: sceneApi, page: PAGE });
  if (scrollApi && typeof scrollApi.onIntroDone === "function") {
    scrollHandoff = scrollApi.onIntroDone;
  }

  // With scroll wired, the hero cascade can run the instant the intro finishes.
  if (introDone) revealHero();

  // Compose the manifold after first paint. afterPaint yields to the browser so
  // the hero/chrome paint before the three chunk is fetched + parsed. The intro
  // CAP still opens the curtain on time if this composition runs long.
  afterPaint(async () => {
    let scene = null;
    try {
      scene = await initScene();
    } catch (err) {
      // A renderer failure must never strand the curtain or the page; the no-op
      // proxy stays in place and the void backdrop reads as the static fallback.
      console.error("Canli Capital scene compose failed; continuing without it.", err);
      document.body.classList.add("no-webgl");
    }
    // Bind the live scene behind the already-exposed proxy (window.__meridianScene
    // is the stable public handle; it now delegates to the real renderer). Keeping
    // one handle avoids a swap race for any consumer that captured it early.
    liveScene = scene;

    // The scene is composed (or the no-canvas path settled / failed): release the
    // intro count to glide to 100 and lift the curtain, if it has not already
    // lifted on its CAP. markReady is idempotent, so a late call is harmless.
    introHandle.markReady();

    // Custom cursor removed 2026-08-06. Hiding the OS cursor and replacing it with a
    // captioned dot reads as a showcase rather than a firm, and it is the one element
    // that can make a page feel broken. Deleting it dropped 28KB (cursor.css 8KB +
    // cursor.js 20KB). The manifold simply no longer tracks the pointer.
  });
}

// Run a callback after the browser has had a chance to paint the first frame.
// Prefers requestIdleCallback (with a short timeout so it never starves on a busy
// main thread), falling back to a double-rAF (which lands after the next paint).
// This is how the heavy manifold import is kept off the first-paint critical path
// without losing the scene: it composes a beat later, then fades in as before.
function afterPaint(cb) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => cb(), { timeout: 400 });
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => cb()));
  }
}

// If the scroll handoff is unavailable for any reason, make sure no hero glyph is
// left invisible. Reveals any split chars + mask inners inside the hero.
function revealHeroFallback() {
  document.querySelectorAll("#hero .char").forEach((c) => {
    c.style.transform = "none";
    c.style.opacity = "1";
  });
  document.querySelectorAll("#hero .mask__inner").forEach((m) => {
    m.style.transform = "none";
    m.style.opacity = "1";
  });
  // The hero sub + actions are gated into the cascade (scroll.js onIntroDone),
  // so if that handoff never runs they must still be released here.
  document.querySelectorAll("#hero .hero__sub, #hero [data-hero-actions]").forEach((el) => {
    el.style.transform = "none";
    el.style.opacity = "1";
  });
}

// Failsafe: no matter what boot() does (a CDN import rejecting, a throw before
// runIntro), never leave the full-screen intro overlay covering a black page.
// Force it open after 6s and on any boot failure.
function forceIntroOpen() {
  const intro = document.getElementById("intro");
  if (intro) intro.classList.add("is-done");
  document.body.removeAttribute("data-loading");
  // never strand the hero headline hidden if the handoff never ran
  revealHero();
}
const introSafety = setTimeout(forceIntroOpen, 6000);

function runBoot() {
  Promise.resolve()
    .then(boot)
    .then(() => clearTimeout(introSafety))
    .catch((err) => {
      console.error("Canli Capital boot failed; revealing page anyway.", err);
      clearTimeout(introSafety);
      forceIntroOpen();
      // ensure no reveal element is left hidden by CSS if the choreography never ran
      document.querySelectorAll(
        ".reveal-fade, .reveal-line, .pillar, .tenet, .roadmap__row, .mask__inner, .char, .word, .mchar"
      ).forEach((el) => { el.style.opacity = "1"; el.style.transform = "none"; });
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runBoot);
} else {
  runBoot();
}
