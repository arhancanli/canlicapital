# MERIDIAN / IMMERSION PERFORMANCE BUDGET + FEASIBILITY LAW

Role: performance + feasibility critic. This document is the binding budget any
immersion work must clear. It is derived from the live source (scene.js,
shaders.js, scroll.js, main.js, cursor.js, the three per-page modules) audited
2026-06-16, build green, U+2014 audit clean, three bundle 526.02 KB raw /
131.54 KB gzip.

The bar from the brief is "10000x more immersive, but tasteful, 60fps,
GPU-light, no bundle bloat, no layout thrash, reduced-motion honored." The
existing engine is already very good. The risk is NOT that it is slow today; the
risk is that the next pass of "make it jaw-dropping" reaches for techniques that
quietly break the 60fps / GPU-light / no-bloat contract. This document draws the
lines BEFORE that happens.

---

## 0. THE ONE-LINE VERDICT

The current architecture is sound and holds 60fps by design (static geometry,
all motion in shaders, one draw-heavy LineSegments, watchdog, IO pause). The
budget below is mostly "do not regress what is already correct." There are FOUR
existing soft spots to harden and a SHORT list of techniques that are SAFE to add
and a SHORT list that are FORBIDDEN because they would jank or bloat.

---

## 1. THE FRAME BUDGET (per page, desktop, 60fps = 16.67 ms)

The whole frame must fit in ~10 ms of main-thread + GPU work to leave headroom
for Lenis, ScrollTrigger.update, GSAP tweens, and the cursor rAF. Today's split:

| Consumer | Cost class | Notes |
|---|---|---|
| Scene rAF (scene.js) | the heavy one | 1 LineSegments draw (full-res vertex shader, 2-octave snoise x finite-diff normal = effectively ~6 snoise evals/vert), 1 ridge Line, 2 mote Points, 1 starfield Points, then composer: RenderPass + UnrealBloom (5 mip blur passes at half-res) + 1 ShaderPass. This is the budget. |
| Cursor rAF (cursor.js) | cheap | 2 transform writes + 1 caption transform, no layout read in the loop. Fine. KEEP it allocation-free (it is). |
| Lenis raf | cheap | wired into gsap.ticker; one per frame. |
| ScrollTrigger.update | cheap-to-moderate | scales with active trigger count (see section 4). |
| GSAP tweens | transient | reveals are short, transform/opacity only. |

There are TWO independent rAF loops running simultaneously (scene + cursor) plus
the GSAP/Lenis ticker. That is the ceiling. Do NOT add a third persistent rAF
loop. The performance.js idle waveform is a third rAF BUT it is correctly
mutually exclusive (reserved-state only, IO-paused, stops offscreen/tab-hidden)
and never coexists with the scene's heavy beat in the same viewport for long, so
it is tolerated. Any NEW per-frame loop must follow that exact discipline:
IntersectionObserver pause + visibilitychange stop + no per-frame allocation, OR
be folded into the existing scene/cursor loop instead.

### Hard frame rules
1. Transform / opacity / filter ONLY in any animation. No width/height/top/left/
   margin/padding, no `box-shadow` animation, no `background-position` animation.
   (grep confirms the codebase already obeys this; keep it.)
2. No per-frame allocation in any loop. No `new`, no array literals, no
   `.map/.filter/.slice` inside a rAF or a scrub `onUpdate`. The scene watchdog's
   `dtWindow.slice().sort()` once per frame is the ONE existing allocation; it is
   bounded (60 elements) and acceptable, but do not add more.
3. No layout read (getBoundingClientRect, offsetTop, clientWidth) inside any rAF
   or scrub onUpdate. Reads happen once at init or on resize (debounced).
4. `will-change` is declared ONLY in CSS, only on the elements motion.css/cursor.
   css already list, and is `auto` at rest. Do NOT add `will-change` to many
   elements or leave it permanently on (it costs GPU memory per layer). GSAP
   auto-manages it for tween duration; trust that, do not pin it.

---

## 2. THE GPU / SCENE BUDGET (the manifold)

The scene is the single most expensive thing and the thing most likely to be
bloated by "make it more alive." Lock these numbers.

### Geometry budget (uploaded ONCE, never re-touched)
- Surface: COLS 180 x ROWS 120 desktop (mobile 80 x 60). longitudinal strips +
  sparse lateral hatch -> ~`(ROWS*(COLS-1) + latCols*(ROWS-1))*2` verts. This is
  a static buffer. DO NOT raise COLS/ROWS materially; the vertex shader runs
  ~6 snoise evaluations per vertex (height + 2 finite-difference samples, each
  height call = 2 snoise), so vertex cost scales linearly with grid count and
  snoise is the dominant ALU cost. A 2x grid is a ~2x vertex-shader bill.
- Ridge: 180 pts desktop, the ONLY per-frame CPU geometry write (dynamic usage),
  cheap because it is short. Keep it short.
- Motes: 1200 desktop (white + signal), vertex-animated, no CPU touch. Stars: 400
  PointsMaterial. These are fixed counts. Do not balloon them.
- Total scene draw calls: ~5 (surface, ridge, 2 motes, stars) + post passes.
  BUDGET CEILING: keep scene object draw calls <= 6. If a new visual needs more
  geometry, fold it into an EXISTING buffer/attribute, do not add a 6th+ mesh.

### Shader budget
- snoise is the cost center. The surface vertex shader already pays ~6 snoise/
  vert. Do NOT add more octaves, more finite-difference taps, or a second noise
  field in the vertex shader. If a new effect needs surface variation, drive it
  from an existing varying or a cheap analytic function (sin/smoothstep), never
  another snoise call.
- The fragment shaders are cheap (fog + fresnel + one mix). Keep them cheap; no
  loops, no texture sampling beyond the post pass's 3 taps.
- Post stack: RenderPass -> UnrealBloomPass (half-res, 5 blur passes) -> one
  combined ShaderPass (vignette + 3-tap chromatic aberration). This is the whole
  film layer in ONE extra fullscreen pass beyond bloom. DO NOT add SSAO, DOF as a
  real blur pass, motion blur, a second bloom, FXAA-on-top-of-MSAA, or any extra
  ShaderPass. The "depth of field" is faked in the vertex alpha (uFocusZ); keep
  it faked. Each real fullscreen post pass at 2x DPR is expensive.

### Renderer budget
- DPR capped at 2 desktop / 1.5 mobile. MSAA samples: 2 (HalfFloat RT). antialias
  true desktop only. These are correct. Do NOT raise samples to 4/8 or uncap DPR;
  on a 4K/Retina display the fragment bill is DPR^2 and the bloom blur runs at
  half of that. samples:2 + half-res bloom is the reason it holds; protect it.
- powerPreference high-performance, alpha false, clear color = void. Keep.

### What sheds when frames drop (the watchdog, scene.js:488)
Stage 1: bloom to 0.35-res. Stage 2: drop the vignette/aberration ShaderPass.
Stage 3: hide the white mote field. One-way (no re-upgrade, avoids oscillation).
This is good. ANY new scene cost MUST be added to the watchdog's shed list so it
can be dropped on slow hardware. A new effect with no shed path is a regression.

---

## 3. THE REDUCED-MOTION + NO-WEBGL CONTRACT (do not weaken)

This is graded as a hard requirement, not a nicety. Current handling:
- Reduced motion: Lenis is never constructed (native scroll). Scene constructs
  with `usePost=false` (no composer at all), composes ONE static frame via
  renderOnce at the page's `sceneStill`, never starts the rAF. Chars/words/lines
  set to final state. Pins do not run; steps/sleeves all get `is-active`. Cursor
  returns native. This is correct and must be preserved.
- The brief (J4) asks to make the static frame more cinematic. SAFE: it is just
  tuning `sceneStill` per page in page-config + the STATES descriptor the frozen
  frame blends. It adds ZERO runtime cost (renderOnce is one frame). Do it by
  choosing a better frozen camera/converge, NOT by adding motion under reduced-
  motion. Never animate anything when prefers-reduced-motion is set, including
  the new idle waveform and any new scene "breathing."
- No-WebGL: `body.no-webgl` + CSS `.scene-fallback`. The sub-page modules and the
  scene-call guards (`window.__meridianScene` optional, every call wrapped) mean
  a null scene is a silent no-op everywhere. KEEP every new scene call guarded the
  same way (`if (s && typeof s.method === 'function')`).
- IntersectionObserver pause (threshold 0) + visibilitychange stop are the two
  pause paths. They are correct. Every new rAF loop must wire BOTH.

---

## 4. THE SCROLLTRIGGER BUDGET

ScrollTrigger.update runs every scroll frame and costs roughly O(active
triggers). Current count (grep): scroll.js creates 13 `ScrollTrigger.create`
calls plus per-element triggers inside `gsap.utils.toArray(...).forEach` loops
(each reveal element gets its own ONCE trigger, but `once:true` self-kills on
fire, so steady-state count drops fast). performance.js + progress.js each add 1
pin. Per page there is exactly ONE `pin` (System on landing, gauntlet on
/performance, roadmap on /progress, plus the planned /progress already exists).

### Rules
1. ONE pin per page. The design system says one tentpole beat per page; that is
   also the perf rule (pinning forces layout recalcs at pin/unpin boundaries and
   pinSpacing inserts a spacer). The landing has System + Discipline, but
   Discipline is NOT a `pin` (it is a non-pinning trigger with onUpdate), so it is
   fine. Do not convert Discipline to a real pin, and do not add a second pin to
   any page.
2. Prefer ONE shared body-progress trigger (already exists, scroll.js:212) over
   many scrubs. Each `scrub` trigger ties a tween to scroll; a handful is fine,
   dozens are not. Current scrubs: hero exit (2), parallax (N small ones), the
   pins. Keep parallax items to a SMALL count (the hero wordmark, footer wordmark,
   tenet ghosts, a few eyebrows). Do NOT put `data-parallax` on dozens of rows.
3. Reuse `revealOnEnter` / `revealSet` (the once:true self-killing pattern) for
   any new reveal. Do not author bespoke always-on scrubs for simple fade-rises.
4. After adding/removing pinned or scrubbed content, ScrollTrigger.refresh() must
   be called once (the modules already do on load + post-init). Do not call
   refresh inside a loop or on every scroll.

---

## 5. SAFE TECHNIQUES (use these to push immersion without breaking budget)

These add a LOT of perceived richness for near-zero cost:
- More expressive use of the EXISTING uniforms: `setConverge`, `pulseRidge`,
  `flareBloom`, `setPointer`, `setScroll` band remap. Re-choreographing the
  camera path and the convergence curve per page costs nothing extra (the shader
  already runs). This is the single highest-leverage, zero-cost lever.
- Per-page camera framing via the STATES descriptor band (page-config sceneBand /
  sceneStill). Free.
- GSAP transform/opacity/filter reveals, magnetic (already CTA-only), scrub-
  pinned ONE tentpole, section-rule draws, char clip-rise. All already in the
  vocabulary and cheap. Add MORE of these (within the easing/count rules) freely.
- CSS-only micro-interactions: `transform`/`opacity` transitions on hover, the
  signal-word underline draw, the rail tick. GPU-cheap.
- Driving an EXISTING attribute/varying for a new look (e.g. a new brightness
  read off ridgeProx) instead of new geometry. Cheap.
- IntersectionObserver-gated CSS class toggles (`.is-in`, `.is-drawn`) for
  ledger/diagram reveals (systems-page.js pattern). Cheap, self-disconnecting.
- Lazy import of any page-specific heavy module (already done for scene/scroll).

---

## 6. FORBIDDEN / FLAG-FOR-CHEAPER-ALTERNATIVE (these would jank or bloat)

If a motion-director plan proposes any of these, BLOCK it and offer the cheaper
swap in the same line:

1. A second/larger Three scene, a second WebGL context, or a materially larger
   three import (e.g. pulling in extra addons: GLTFLoader, more post passes,
   physics, text geometry, EnvironmentMap). -> The three bundle is already 526 KB
   raw / 131.54 KB gzip; that is the cap. CHEAPER: reuse `createScene` and re-aim
   the camera/converge. The whole property is ONE scene by design.
2. Raising COLS/ROWS, adding noise octaves, adding finite-difference taps, or a
   second snoise field in the surface vertex shader. -> Linear-to-worse GPU cost.
   CHEAPER: animate via the existing uniforms; add visual interest in the fragment
   mix or via the cursor brightening, not more vertex ALU.
3. A real depth-of-field / gaussian-blur post pass, SSAO, motion blur, a second
   bloom, god rays, or any extra full-screen ShaderPass. -> Each is a full DPR^2
   fragment pass. CHEAPER: the faked DOF in vertex alpha (uFocusZ) + the existing
   half-res bloom already read as cinematic lens depth.
4. Animating layout properties for a "reveal" (height auto, max-height, width,
   grid-template, top/left, margin). -> Forces layout/reflow every frame.
   CHEAPER: transform: translate/scale + opacity, clip-path on a fixed box, or the
   mask-overflow clip-rise already in use.
5. `filter: blur()` animated on a LARGE element every frame, or many blurred
   elements at once. -> Blur is expensive and scales with element area. The hero-
   exit blur(3px) on the giant wordmark is already the most expensive existing
   filter and is correctly scoped to a SHORT scrub window with GSAP-managed
   will-change. Do NOT add persistent large-area animated blurs (e.g. a blurred
   backdrop that tracks scroll). CHEAPER: opacity + small translate for recession;
   reserve blur for the one short pin cross-fade (step blur 1.5px, already there).
6. `backdrop-filter` on a large or scroll-tracked surface (the nav already uses a
   backdrop blur on a thin bar after the fold; that is fine because it is small and
   static-positioned). Do NOT extend backdrop-filter to large panels or animate it.
7. A new persistent rAF loop that does not IO-pause + visibility-stop, or that
   allocates per frame, or that reads layout per frame. -> Burns a core, fights
   the scene loop. CHEAPER: fold the work into the scene loop (it already ticks)
   or use a once:true ScrollTrigger / CSS transition.
8. Box-shadow / text-shadow ANIMATION across many elements (the one resolved
   #stepCurrent text-shadow transition is a single element, fine). -> Shadow
   repaint is costly. CHEAPER: the signal-glow tokens as static, or opacity on a
   pre-rendered glow layer.
9. Canvas 2D overlays drawn every frame at full DPR for "data rain" / tickers /
   particle fields beyond the one gated idle waveform. -> 2D canvas fill at 2x DPR
   every frame is a real cost and competes with the scene. CHEAPER: it belongs in
   the manifold (motes) or as a one-shot SVG/CSS reveal.
10. SplitText-style per-character animation applied to BODY paragraphs or long
    prose (the char clip-rise is for DISPLAY HEADLINES only; mono type-in is for
    SHORT data lines). -> Hundreds of inline-block spans with will-change is layout
    + layer-memory heavy. CHEAPER: word-level fade-rise (`.reveal-words`) for body.
11. Adding `will-change` broadly, or to elements that are not actively animating,
    or leaving it on at rest. -> Each promoted layer costs GPU memory. CHEAPER:
    rely on the existing motion.css declarations + GSAP auto-management.

---

## 7. THE FOUR EXISTING SOFT SPOTS TO HARDEN (not blockers today)

These already ship and work; flag them so a pass tightens rather than copies them:

1. Sub-page pins do NOT pulse-guard against a missing scene gracefully beyond the
   guard wrappers (which is fine), but each sub-page pin calls `scenePulse()` on
   every `setStep`. That is cheap (it just sets ridgePulse=1) but confirm new pins
   do not call a scene mutator inside a high-frequency `onUpdate` more than once
   per step change (current code only pulses on step change via the `idx ===
   activeStep` early return - keep that guard).
2. The watchdog only runs when `usePost` is true (desktop, motion on). On a weak
   integrated GPU that still reports WebGL, the heavy vertex shader + 1200 motes
   could dip below 60 even with post on; the watchdog will catch it (sheds bloom
   then motes). Good, but any NEW cost must register in the shed ladder, or weak
   hardware has no relief. Verify on add.
3. `IntersectionObserver` pause uses threshold 0 on the canvas. Because the canvas
   is `position: fixed; inset: 0`, it is ALWAYS intersecting the viewport, so the
   IO pause effectively only fires on tab-switch via visibilitychange, NOT on
   scroll (a fixed full-screen canvas never leaves the viewport). This is fine for
   the landing (scene is always relevant) but means the scene runs full-tilt on
   every page even when content has scrolled far past any scene-relevant moment.
   NOT a bug, but if a future page wants to stop the scene in a long text region,
   it needs an explicit scroll-position stop, not the IO (which will never fire).
   Do not "fix" the IO to a non-fixed element; that would break the seamless
   fixed-scene layering. If scene-pause-on-scroll is wanted, gate scene.stop()/
   start() off a ScrollTrigger range instead.
4. Two simultaneous rAF loops (scene + cursor) is the steady state. It is fine,
   but it is the ceiling: the idle waveform makes three transiently. Do not let a
   new page introduce a fourth concurrent loop. Audit any new loop against
   sections 1 and 6.7.

---

## 8. THE PER-CHANGE GATE (run after every immersion edit)

1. `cd /Users/arhancanli/meridian && npm run build` must be green.
2. `grep -rPn "\x{2014}" .` over source AND dist must be empty.
3. three bundle must stay <= ~530 KB raw / ~132 KB gzip. If it grows, an addon or
   a dep crept in: revert it. (Current: 526.02 KB / 131.54 KB.)
4. No new persistent rAF without IO-pause + visibility-stop + zero per-frame alloc.
5. No new `pin` beyond the one per page. No new full-screen post pass. No grid/
   noise/octave increase in the surface shader.
6. Scrub triggers stay few; reveals use the once:true self-killing pattern.
7. Spot-check reduced-motion (the static frame still composes, nothing animates)
   and a simulated no-WebGL (`body.no-webgl`, all guards no-op, content visible).
8. DevTools Performance: a steady scroll through each page should hold 60fps with
   no long task > 50 ms after the intro; the intro curtain masks scene warm-up by
   design, so warm-up cost there is acceptable.

---

This is the budget. The engine is already fast because all the motion lives in
shaders and the geometry is static. The way to make it "10000x more immersive"
within budget is to choreograph the EXISTING uniforms and reveal vocabulary far
more ambitiously per page (camera, convergence, pulse, flare, scroll band,
GSAP transform/opacity), NOT to add more geometry, more passes, or more loops.
Restraint is also the performance strategy.
