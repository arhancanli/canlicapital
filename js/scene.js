// =============================================================================
// CANLI CAPITAL / scene.js
// "The Manifold": one persistent line based market surface that morphs through
// five scroll states and is filmed by a camera that actually flies through the
// geometry. Displacement runs on the GPU (simplex plus a small curl drift), a
// restrained fresnel rim and a fake depth of field band give it lens depth, a
// vertex animated mote field adds volume, and a disciplined post stack (a high
// threshold bloom reserved for the signal accent, plus a vignette and a
// homeopathic chromatic aberration) is the film layer.
//
// GPU light by design: static geometry uploaded once, all motion in shaders,
// no per frame allocation, half resolution bloom, post skipped on mobile, an
// adaptive watchdog that sheds quality before frames drop, IntersectionObserver
// and visibility pause, and a composed static frame for prefers reduced motion.
//
// PUBLIC API (prior methods unchanged, so existing call sites need no edits; two
// methods are ADDED for "The Convergence", inert unless called):
//   createScene(canvas, { reducedMotion, mobile }) ->
//     { start, stop, renderOnce, dispose, resize,
//       setScroll, setPointer, pulseRidge,
//       setConverge, flareBloom,   // added: signature setConverge(0..1|null), flareBloom()
//       renderer }
// =============================================================================

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import {
  SURFACE_VERT, SURFACE_FRAG,
  MOTE_VERT, MOTE_FRAG,
  POST_VERT, POST_FRAG,
} from "./shaders.js";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);

// Shared palette. Fog and clear color are unified to the page void so the 3D
// dissolves into the background with no visible seam.
const VOID = 0x0A0B0D;
const PAPER = 0xF4F1EA;
const SIGNAL = 0xC8553D;

// The five scroll states. The camera now genuinely travels: it starts low and
// wide on the horizon, descends and pushes in, rises to look down on the
// lattice as a plan view, pushes close to the signal ridge, then pulls way back
// for the closing exhale. focusZ shifts the sharp depth band per chapter.
// converge per state is the descriptor-driven fallback for "The Convergence": the
// field stays scattered through the early chapters (0..2), gathers onto the single
// ridge across the lattice -> validation beat (state 3), then releases as plurality
// fans out (state 4). The System pin can also drive it directly via setConverge,
// which takes priority while engaged so the climax tracks the pin progress exactly.
const STATES = [
  // 0 hero: low, wide, looking along the horizon
  { amp: 0.55, density: 0.9,  spread: 0.0, ridge: 0.55, tighten: 0.0,  camX: 0.0,  camY: 1.0, camZ: 9.0,  camLook: -1.8, focusZ: 6.0,  drift: 0.18, fog: 0.074, converge: 0.0 },
  // 1 coalescing: descend and push in
  { amp: 0.80, density: 1.15, spread: 0.0, ridge: 1.0,  tighten: 0.15, camX: 0.0,  camY: 1.5, camZ: 5.5,  camLook: -1.2, focusZ: 5.0,  drift: 0.10, fog: 0.076, converge: 0.0 },
  // 2 structured lattice: rise and look down on the grid (plan view)
  { amp: 0.62, density: 1.35, spread: 0.0, ridge: 0.9,  tighten: 0.4,  camX: 0.0,  camY: 4.5, camZ: 5.6,  camLook: -3.2, focusZ: 7.0,  drift: 0.0,  fog: 0.080, converge: 0.35 },
  // 3 tightening / validation: settle dead-on to the single signal ridge
  { amp: 0.42, density: 1.1,  spread: 0.0, ridge: 0.85, tighten: 0.85, camX: 0.6,  camY: 1.6, camZ: 3.5,  camLook: -0.4, focusZ: 4.0,  drift: -0.06, fog: 0.078, converge: 1.0 },
  // 4 plurality / the closing chapter: the camera draws back and up so the split
  // surfaces read as a fleet, but the chapter is now authored to stay RICH all the
  // way to the footer rather than thinning to a distant scatter (Builder B, OWNER
  // FIX B). The earlier tune left this chapter reading as "the animation weakens
  // after Performance": camZ 12 pulled the field too far off-frame, spread 1.0 fanned
  // the lanes out past the edges, converge 0.0 let the signal spine go dark, and the
  // post-Performance scroll (clamped to ~0.85..0.95) lives almost entirely inside
  // this chapter, so its dimness WAS the footer. The reshape:
  //   - camZ 12 -> 8.5, camY 6 -> 4.6: the field fills the frame again at the foot.
  //   - amp 0.65 -> 0.78, density 0.95 -> 1.12, ridge 0.55 -> 0.78: more life + spine.
  //   - spread 1.0 -> 0.62: the plural fleet still reads (three lanes) but stays on
  //     screen instead of receding off the edges into the void.
  //   - converge 0.0 -> 0.5: a partial CLOSING convergence so the signal spine
  //     returns warm at the footer (the convergence motif carried through), without
  //     fully collapsing the plural read. The footer beat in scroll.js can drive it
  //     the rest of the way for the final payoff. drift lifted for a touch more breath.
  //   - fog 0.074 -> 0.072: a hair clearer so the closing depth stays legible.
  { amp: 0.78, density: 1.12, spread: 0.62, ridge: 0.78, tighten: 0.45, camX: 0.0,  camY: 4.2, camZ: 8.5,  camLook: -1.5, focusZ: 7.5,  drift: 0.07, fog: 0.072, converge: 0.5 },
];

function blendStates(p) {
  const seg = p * (STATES.length - 1);
  const i = Math.min(Math.floor(seg), STATES.length - 2);
  const t = smooth(clamp01(seg - i));
  const a = STATES[i], b = STATES[i + 1];
  const out = {};
  for (const k in a) out[k] = lerp(a[k], b[k], t);
  return out;
}

export function createScene(canvas, opts = {}) {
  const reduced = !!opts.reducedMotion;
  const mobile = !!opts.mobile;
  const usePost = !mobile && !reduced;

  // ---- renderer ----
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !mobile,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(VOID, 1);
  const DPR_CAP = mobile ? 1.5 : 2;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  // the surface/mote custom fog base: the value the proven look was tuned at, so
  // the ambient fog breath rides on top of it without shifting the shipped look.
  const FOG_BASE = 0.074;
  const fog = new THREE.FogExp2(VOID, FOG_BASE);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
  camera.position.set(0, 1.0, 9.0);

  // ---- grid surface dimensions ----
  const COLS = mobile ? 80 : 180; // along X (raised: displacement is now on GPU)
  const ROWS = mobile ? 60 : 120; // along Z (depth)
  const W = 14;   // world width
  const D = 16;   // world depth

  // Build static geometry once. Longitudinal strips plus a sparse cross hatch,
  // a single LineSegments to keep draw calls minimal. Positions are placeholder
  // (z = 0 plane); the vertex shader computes the real height every frame, so
  // this buffer is uploaded ONCE and never touched again.
  const longSeg = ROWS * (COLS - 1);
  const LAT_STEP = mobile ? 10 : 8;
  const latCols = Math.floor(COLS / LAT_STEP);
  const latSeg = latCols * (ROWS - 1);
  const totalVerts = (longSeg + latSeg) * 2;

  const positions = new Float32Array(totalVerts * 3);
  const grid = new Float32Array(totalVerts * 2); // normalized (nx, nz) per vertex

  let vi = 0;
  function pushVert(c, r) {
    const nx = c / (COLS - 1);
    const nz = r / (ROWS - 1);
    positions[vi * 3] = (nx - 0.5) * W;
    positions[vi * 3 + 1] = 0;
    positions[vi * 3 + 2] = -nz * D;
    grid[vi * 2] = nx;
    grid[vi * 2 + 1] = nz;
    vi++;
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 1; c++) { pushVert(c, r); pushVert(c + 1, r); }
  }
  for (let lc = 0; lc < latCols; lc++) {
    const c = lc * LAT_STEP;
    for (let r = 0; r < ROWS - 1; r++) { pushVert(c, r); pushVert(c, r + 1); }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aGrid", new THREE.BufferAttribute(grid, 2));

  // Shared uniform objects so surface and motes read the same descriptor.
  const uTime = { value: 0 };
  const uAmp = { value: STATES[0].amp };
  const uTighten = { value: STATES[0].tighten };
  const uSpread = { value: STATES[0].spread };
  const uDensity = { value: STATES[0].density };
  const uRidge = { value: STATES[0].ridge };
  const uFocusZ = { value: STATES[0].focusZ };
  const uCursor = { value: new THREE.Vector3(0, 0, -8) };
  // a single decaying lag point that trails the cursor target, so the surface
  // ripples faintly where the cursor has been (one reused vector, no per-frame alloc)
  const uCursorWake = { value: new THREE.Vector3(0, 0, -8) };
  // 0..1 cursor-to-ridge proximity (lifts the spine when the pointer rides near it)
  const uCursorRidge = { value: 0 };
  // quantized cursor-to-ridge proximity zone: 0 (far) / 0.33 / 0.67 / 1 (near). The
  // continuous proximity above wobbles with every pixel; this banded value reads as
  // the reader stepping INTO the spine's neighbourhood, so the near zone lights the
  // ridge band as a steady "found it" state. Desktop-pointer only; 0 when calmed.
  const uCursorProxBand = { value: 0 };
  // a small always-on shimmer on the ignited core: the spine reads as a live readout
  const uRidgeShimmer = { value: 0 };
  const uParallax = { value: 0 };
  const uConverge = { value: STATES[0].converge };
  // shared fog density uniform: the custom surface/mote fog reads THIS (their own
  // analytic fog, distinct from three's built-in FogExp2), so writing it per frame
  // lets the void depth track the scroll state AND breathe (Section 2.2). One
  // object referenced by every fogged material, so a single write breathes them all.
  const uFogDensity = { value: fog.density };
  // lowest brightness the dimmed (non ridge) field may reach at full convergence.
  // higher on mobile so the simpler scene does not read as empty when it gathers.
  // desktop floor lifted 0.18 -> 0.25 so convergence reads as the focus TIGHTENING
  // onto the spine, not the field being erased (the scatter stays faintly present).
  const uDimFloor = { value: mobile ? 0.28 : 0.25 };

  const surfMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    fog: true,
    uniforms: {
      uColor: { value: new THREE.Color(PAPER) },
      uSignalColor: { value: new THREE.Color(SIGNAL) },
      fogColor: { value: fog.color },
      fogDensity: uFogDensity,
      uTime, uAmp, uTighten, uSpread, uDensity, uRidge, uFocusZ, uCursor,
      uCursorWake, uCursorRidge, uCursorProxBand, uRidgeShimmer,
      uConverge, uDimFloor,
      uW: { value: W },
      uD: { value: D },
      uCursorAmt: { value: mobile ? 0 : 1 },
    },
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
  });

  const surface = new THREE.LineSegments(geo, surfMat);
  surface.frustumCulled = false;
  scene.add(surface);

  // ---- signal ridge filament (the only line color) ----
  // The ridge follows the same meander the surface shader uses. It is short so
  // a tiny per frame CPU update is cheap, and it is the one element bloom is
  // tuned to catch (additive, above the bloom threshold).
  const RIDGE_PTS = mobile ? 80 : 180;
  const ridgePos = new Float32Array(RIDGE_PTS * 3);
  // per vertex color so the ridge fades into fog at the far end (additive line, so
  // a dark vertex color = less contribution). Filled once: the falloff is static.
  const ridgeCol = new Float32Array(RIDGE_PTS * 3);
  const sigR = ((SIGNAL >> 16) & 255) / 255;
  const sigG = ((SIGNAL >> 8) & 255) / 255;
  const sigB = (SIGNAL & 255) / 255;
  for (let i = 0; i < RIDGE_PTS; i++) {
    const nz = i / (RIDGE_PTS - 1);
    // full strength near the camera, easing toward the far end so it dissolves
    const depth = 1.0 - smooth(clamp01((nz - 0.55) / 0.45)) * 0.7;
    ridgeCol[i * 3] = sigR * depth;
    ridgeCol[i * 3 + 1] = sigG * depth;
    ridgeCol[i * 3 + 2] = sigB * depth;
  }
  const ridgeGeo = new THREE.BufferGeometry();
  const ridgePosAttr = new THREE.BufferAttribute(ridgePos, 3);
  ridgePosAttr.setUsage(THREE.DynamicDrawUsage);
  ridgeGeo.setAttribute("position", ridgePosAttr);
  ridgeGeo.setAttribute("color", new THREE.BufferAttribute(ridgeCol, 3));
  const ridgeMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    fog: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ridge = new THREE.Line(ridgeGeo, ridgeMat);
  ridge.frustumCulled = false;
  scene.add(ridge);

  // CPU mirror of the height field, used only for the short ridge polyline.
  function valNoise(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return (s - Math.floor(s)) - 0.5;
  }
  // ridge meander across X. Mirrors the shader's ridgeXAt: as the field converges
  // the meander straightens toward a centered spine so the CPU ridge polyline
  // tracks the gathered surface exactly (no parallax drift between them).
  function ridgeXFor(nz, converge) {
    const wander = Math.sin(nz * 2.2 + 0.6) * (W * 0.22) + valNoise(nz * 1.6, 7.0) * 3.2;
    return wander * (1.0 - (converge || 0) * 0.85);
  }
  function ridgeHeight(nz, time, amp, tighten) {
    // a light approximation of the shader height along the ridge line
    let h = Math.sin(nz * 6.0 + time * 0.18) * 0.5 + Math.sin(nz * 11.0) * 0.22;
    const tightTarget = Math.sin(nz * 9.0) * 0.12;
    h = lerp(h, tightTarget, tighten * 0.7);
    h += Math.sin(nz * 3.0 + time * 0.25) * 0.18;
    return h * amp;
  }

  // ---- data mote field (the volume that sells the depth) ----
  // Vertex animated rising motes that sit on the manifold. White field plus a
  // small additive signal cluster near the ridge so the accent feels earned.
  let motesWhite = null, motesSignal = null;
  let moteWhiteMat = null, moteSignalMat = null;
  if (!mobile) {
    const N = reduced ? 250 : 1200;
    const NS = Math.round(N * 0.08); // a handful of signal motes
    const NW = N - NS;

    const buildMotes = (count, signal) => {
      const p = new Float32Array(count * 3);
      const off = new Float32Array(count);
      const spd = new Float32Array(count);
      const siz = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const nz = Math.random();
        if (signal) {
          // cluster near the ridge X for the given z (scattered start, converge 0)
          const rx = ridgeXFor(nz, 0);
          p[i * 3] = rx + (Math.random() - 0.5) * 1.6;
        } else {
          p[i * 3] = (Math.random() - 0.5) * W;
        }
        p[i * 3 + 1] = 0;
        p[i * 3 + 2] = -nz * D;
        off[i] = Math.random();
        spd[i] = 0.12 + Math.random() * 0.22;
        siz[i] = signal ? (0.02 + Math.random() * 0.02) : (0.012 + Math.random() * 0.01);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(p, 3));
      g.setAttribute("aOffset", new THREE.BufferAttribute(off, 1));
      g.setAttribute("aSpeed", new THREE.BufferAttribute(spd, 1));
      g.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: signal ? THREE.AdditiveBlending : THREE.NormalBlending,
        fog: true,
        uniforms: {
          uColor: { value: new THREE.Color(signal ? SIGNAL : PAPER) },
          fogColor: { value: fog.color },
          fogDensity: uFogDensity,
          uOpacity: { value: signal ? 0.5 : 0.16 },
          uPixelRatio: { value: pixelRatio },
          uParallax,
          uConverge,
          uSignal: { value: signal ? 1 : 0 },
          uTime, uAmp, uTighten,
          uW: { value: W },
          uD: { value: D },
        },
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
      });
      const pts = new THREE.Points(g, mat);
      pts.frustumCulled = false;
      scene.add(pts);
      return { pts, mat };
    };

    const w = buildMotes(NW, false); motesWhite = w.pts; moteWhiteMat = w.mat;
    const s = buildMotes(NS, true);  motesSignal = s.pts; moteSignalMat = s.mat;
  }

  // ---- starfield (far depth dust), desktop only ----
  let stars = null;
  if (!mobile) {
    const N = 400;
    const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      sp[i * 3] = (Math.random() - 0.5) * 40;
      sp[i * 3 + 1] = Math.random() * 14 + 1;
      sp[i * 3 + 2] = -Math.random() * 35 - 5;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const sm = new THREE.PointsMaterial({
      color: PAPER, size: 0.018, transparent: true, opacity: 0.06, fog: true,
    });
    stars = new THREE.Points(sg, sm);
    scene.add(stars);
  }

  // ---- post processing (the film layer) ----
  // RenderPass into an MSAA target on desktop (lines alias badly otherwise),
  // a high threshold bloom that only the signal ridge and signal motes cross,
  // and one combined vignette plus micro aberration pass.
  let composer = null, renderPass = null, bloomPass = null, postPass = null;
  let postEnabled = usePost;
  let bloomEnabled = usePost;
  if (usePost) {
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      samples: 2,
      type: THREE.HalfFloatType,
    });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(pixelRatio);

    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x * 0.5, size.y * 0.5),
      0.30, // strength
      0.55, // radius
      0.82, // threshold (high: only the accent blooms; eased lower at the climax)
    );
    composer.addPass(bloomPass);

    postPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uVignette: { value: 0.6 },
        uAberration: { value: 0.0012 },
      },
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
    });
    postPass.renderToScreen = true;
    composer.addPass(postPass);
  }

  // ---- state ----
  let scrollP = 0;
  // P0-A final-frame failsafe: the wall-clock time setScroll last fired. If the
  // reader is parked near the foot of the page and no scroll event has driven the
  // scene for a beat, a one-shot refresh keeps the last composed frame live so the
  // manifold never reads as "stopped" at the footer even on an idle tab edge case.
  let lastScrollSetAt = performance.now();
  let current = blendStates(0);
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let ridgePulse = 0;
  let t = reduced ? 12.0 : 0; // fixed pleasing time for the static frame
  let driftX = 0;
  let yaw = 0;
  // the cursor wake lag point on the plane: lerped behind the live cursor target
  // so the surface brightening leaves a brief, decaying trail. reused, never new.
  const wake = { x: 0, z: -8 };
  let cursorRidge = 0; // smoothed cursor-to-ridge proximity 0..1 (desktop only)
  // a short page-to-page arrival ease: when enterFrom seeds a prior frame, the
  // scene eases from that seeded scroll/gather to this page's band so a sub-page
  // entry reads as the camera flying here, never a hard cut. 0 = no arrival.
  let arriveT = 0;
  let arriveFrom = 0;
  let arriveTo = 0;
  const ARRIVE_DUR = 0.9; // seconds, lands under the intro curtain lift
  // the arrival's gather ease: seeds from the prior frame's converge and eases to
  // the descriptor. arriveConvLast is the value the arrival itself last wrote, so
  // if a pin's setConverge changes the override mid-arrival, the arrival yields
  // (it never fights a tentpole that has taken control of the gather).
  let arriveConvFrom = null;
  let arriveConvLast = null;
  // convergence: null lets the blended descriptor drive it; a number (set by the
  // System pin via setConverge) takes priority while the pin is engaged.
  let convergeOverride = null;
  // transient bloom flare for the single climax beat (seconds remaining).
  let flareT = 0;
  const FLARE_DUR = 0.7;
  const BLOOM_BASE = 0.30;   // resting glow on the accent
  const BLOOM_CONV = 0.62;   // sustained glow once the field is fully gathered
  const BLOOM_FLARE = 0.30;  // extra punch added on top at the single climax beat
  const THRESH_BASE = 0.82;  // resting bloom threshold (only the accent crosses)
  const THRESH_CONV = 0.58;  // lowered at convergence so the warm spine blooms

  // Reduced motion: compose the single static frame mid convergence so even frozen
  // the thesis is legible (the field is visibly gathering onto the one signal).
  // scrollP sits between the plan view and the ridge close; the explicit 0.5
  // override fixes the gather amount regardless of the blended descriptor.
  // Reduced-motion poster gather: each page freezes at its own sceneStill (set by
  // the bootstrap), and the gather amount is derived from that pose so the four
  // static frames each read as a finished, on-thesis poster (the field visibly
  // collapsing), not a single shared neutral frame. A legible floor keeps the
  // gathering glow present even on the lower-converge poses (progress/systems),
  // and the high-band pose (performance) reads close on the resolved spine.
  function staticConverge(p) {
    const natural = blendStates(p).converge; // the descriptor's own gather here
    // ease the still position to a poster gather: low poses still show the field
    // visibly gathering (floor 0.4), high poses sit close on the resolved spine.
    // Clamped below a full 1.0 so even the high-band poster keeps a hair of the
    // scattered field visible around the spine (the gather READS as a gather).
    return Math.min(0.85, Math.max(0.4, natural * 0.6 + p * 0.5));
  }
  if (reduced) {
    scrollP = 0.62;
    current = blendStates(scrollP);
    convergeOverride = staticConverge(scrollP);
  }

  // ---- per frame: ridge polyline (short, cheap) ----
  function updateRidge(desc, time) {
    const cv = desc.converge || 0;
    for (let i = 0; i < RIDGE_PTS; i++) {
      const nz = i / (RIDGE_PTS - 1);
      const ridX = ridgeXFor(nz, cv);
      const h = ridgeHeight(nz, time, desc.amp, desc.tighten);
      ridgePos[i * 3] = ridX;
      // the spine lifts a touch as it converges so the single line sits clear of
      // the cooled field and reads as the one decision rising out of the scatter
      ridgePos[i * 3 + 1] = h + 0.05 + cv * 0.18;
      ridgePos[i * 3 + 2] = -nz * D;
    }
    ridgePosAttr.needsUpdate = true;
    // floor raised to 0.6 so the hero filament carries more additive presence and
    // bloom does the glow. The pulse lifts the ceiling; convergence drives the
    // filament hard so the gathered spine is the brightest thing on screen.
    const base = 0.6 + desc.ridge * 0.4;
    ridgeMat.opacity = Math.min(0.98, base + ridgePulse * 0.5 + cv * 0.32);
  }

  // ---- camera flight ----
  function updateCamera(desc, dt) {
    driftX += desc.drift * 0.004;
    // a slow continuous breath independent of scroll, kept under a few degrees
    yaw += dt;
    const breath = Math.sin(yaw * 0.05) * 0.15;
    // calm at the climax: pointer influence eases out as the field converges so
    // the camera holds dead still on the signal and does not drift under the cursor
    const cv = desc.converge || 0;
    const cursorScale = lerp(1.0, 0.25, cv);
    const px = pointer.x * 0.7 * cursorScale;
    const py = pointer.y * 0.35 * cursorScale;
    // as the spine straightens to dead center (shader/ridge), settle the camera to
    // x = 0 so the gathered line is framed centrally in the cleared space (payoff)
    const camXc = desc.camX * (1.0 - cv);
    camera.position.x = lerp(camera.position.x, camXc + driftX + breath + px, 0.05);
    camera.position.y = lerp(camera.position.y, desc.camY + py, 0.05);
    camera.position.z = lerp(camera.position.z, desc.camZ, 0.05);
    // ease the look target to dead center on Z as well at the climax
    camera.lookAt((driftX * 0.4 + breath * 0.3) * (1.0 - cv), desc.camLook + 0.5, -D * 0.55);
  }

  // ---- cursor world target on the plane (for surface brightening + parallax) ----
  // also maintains the decaying wake (a single lerped lag point that trails the
  // cursor) and the cursor-to-ridge proximity that the spine answers to. Both
  // are desktop-pointer only (uCursorAmt is 0 on mobile, so the wake is inert
  // there too) and both calm to nothing at the convergence climax.
  function updateCursorTarget(desc, dt) {
    const cx = pointer.x * (W * 0.5);
    const cz = -(pointer.y * 0.5 + 0.5) * D;
    uCursor.value.set(cx, 0.4, cz);
    // motes parallax a touch faster than the surface for layered depth
    uParallax.value = pointer.x * 0.4;

    if (mobile || reduced || cursorReactiveOff) return;

    // the wake trails the cursor target with a frame-rate-aware lerp, leaving a
    // brief brightened trail on the surface (one reused scalar pair, no alloc).
    const wlerp = 1 - Math.pow(0.86, dt * 60);
    wake.x = lerp(wake.x, cx, wlerp);
    wake.z = lerp(wake.z, cz, wlerp);
    uCursorWake.value.set(wake.x, 0.4, wake.z);

    // cursor-to-ridge proximity: distance from the cursor's world X to the ridge
    // X at the cursor's normalized depth. As the field converges the spine sits
    // at center, so the proximity tracks the gathered line. One cheap analytic
    // read per frame. Damped near the climax so the held-still beat is not lifted.
    const cv = desc.converge || 0;
    const nz = clamp01(pointer.y * 0.5 + 0.5);
    const ridX = ridgeXFor(nz, cv);
    const prox = Math.max(0, 1 - Math.abs(cx - ridX) / 2.4);
    // smoothstep + ease so the lift answers gently, then relaxes when the cursor
    // leaves; only meaningful while a pointer is actually moving over the field.
    const target = prox * prox * (3 - 2 * prox);
    cursorRidge = lerp(cursorRidge, target, 1 - Math.pow(0.84, dt * 60));
    uCursorRidge.value = cursorRidge;
    // quantize the smoothed proximity into a three-zone envelope (plus far = 0):
    // [0, 0.33, 0.67, 1]. The thresholds are read once per frame (two compares),
    // so the near zone latches as a steady "found the spine" state instead of
    // tracking every pixel of cursor jitter. damped to nothing at the climax via
    // the same convergence factor the lift uses.
    let band = 0;
    if (cursorRidge > 0.75) band = 1;
    else if (cursorRidge > 0.5) band = 0.67;
    else if (cursorRidge > 0.28) band = 0.33;
    uCursorProxBand.value = band * (1 - cv * 0.7);
  }

  // ---- public setters ----
  // setScroll seeds scrollP. When called BEFORE the frame loop starts (the boot
  // path: main.js sets the page band before scene.start), it also composes `current`
  // at that position so the FIRST visible frame after the intro curtain lifts is
  // already at the page's pose, with no lerp-in. This is the dead-frame fix: the
  // scene holds composed under the curtain and only releases (lerps) once running.
  // An active arrival (enterFrom) owns the seed instead, so we never stomp it.
  function setScroll(p) {
    scrollP = clamp01(p);
    lastScrollSetAt = performance.now();
    if (!running && arriveT <= 0 && !reduced) current = blendStates(scrollP);
  }
  function pulseRidge() { ridgePulse = 1; }
  function setPointer(nx, ny) {
    if (reduced || mobile) return;
    pointer.tx = nx; pointer.ty = ny;
  }
  // P0-C 17: read the live, smoothed cursor-to-ridge proximity (0..1) so the UI
  // layer (a .ridge-accent overlay in the page) can ECHO the 3D surface waking
  // when the pointer rides near the spine. Additive to the public API; returns 0
  // on mobile / reduced / when the watchdog has shed cursor reactivity, so a
  // consumer is always safe and the echo is correctly inert there.
  function getCursorRidge() { return cursorRidge; }
  // The Convergence (added to the public API; existing call sites unaffected).
  // Pass a 0 to 1 progress to steer the field gathering onto the ridge; pass null
  // (or nothing) to release control back to the scroll-state descriptor.
  function setConverge(v) {
    convergeOverride = (v == null) ? null : clamp01(v);
  }
  // The single bloom flare of the page: a brief lift on the ridge accent. No-op
  // when post is unavailable (mobile / reduced motion), so it is always safe.
  function flareBloom() {
    if (!usePost || !bloomPass) return;
    flareT = FLARE_DUR;
  }
  // Page-to-page continuity (added to the public API; additive, guarded by every
  // caller so a missing method or null scene is a silent no-op). Seed the scene
  // from a prior frame's global arc position + gather, compose that first frame,
  // then ease to this page's band so a sub-page entry reads as the camera flying
  // here under the curtain, not a fresh load. Inert under reduced motion (the
  // static poster owns the frame) and on the no-WebGL path (no scene at all).
  function enterFrom(p, converge) {
    if (reduced) return;
    const from = clamp01(typeof p === "number" ? p : scrollP);
    arriveFrom = from;
    arriveTo = scrollP;        // the page band start (already set by setScroll)
    arriveT = 1;
    arriveConvFrom = (converge == null) ? null : clamp01(converge);
    arriveConvLast = arriveConvFrom; // the arrival's first written value
    // seed current from the prior frame so the FIRST visible frame is already at
    // the entry pose (no snap), then the loop eases it toward arriveTo.
    current = blendStates(from);
    if (arriveConvFrom != null) { convergeOverride = arriveConvFrom; current.converge = arriveConvFrom; }
  }

  // ---- resize ----
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setSize(w, h);
      if (bloomPass) bloomPass.setSize(w * 0.5, h * 0.5);
    }
    if (!running) renderOnce();
  }

  // ---- adaptive quality watchdog ----
  // Rolling dt median. If we sit below ~45fps for a second, shed quality once
  // in stages and never re channel up (avoids oscillation).
  const dtWindow = new Array(60).fill(16);
  let dtIdx = 0;
  let slowMs = 0;
  let degradeStage = 0;
  // set when the watchdog sheds the live cursor reactivity (wake + ridge lift)
  // on slow hardware, alongside the white mote field. One-way, like the rest.
  let cursorReactiveOff = false;
  function watchdog(dtMs) {
    if (!usePost) return;
    dtWindow[dtIdx] = dtMs;
    dtIdx = (dtIdx + 1) % dtWindow.length;
    const sorted = dtWindow.slice().sort((a, b) => a - b);
    const median = sorted[30];
    if (median > 22) {
      slowMs += dtMs;
      if (slowMs > 1000 && degradeStage < 3) {
        degradeStage++;
        if (degradeStage === 1 && bloomPass) {
          const w = window.innerWidth, h = window.innerHeight;
          bloomPass.setSize(w * 0.35, h * 0.35);
        } else if (degradeStage === 2 && postPass) {
          postEnabled = false; // drop vignette + aberration pass
          if (bloomPass) bloomPass.renderToScreen = true;
        } else if (degradeStage === 3) {
          if (motesWhite) motesWhite.visible = false; // halve mote cost
          // also drop the live cursor wake + ridge proximity reactivity: cheap
          // per vertex, but on weak hardware every ALU read counts, so the
          // reactivity sheds with the mote field (one-way, no oscillation).
          cursorReactiveOff = true;
          uCursorWake.value.set(0, 0, -100); // out of range: wake contributes 0
          uCursorRidge.value = 0;
          uCursorProxBand.value = 0; // shed the banded zone too on weak hardware
        }
        slowMs = 0;
      }
    } else {
      slowMs = Math.max(0, slowMs - dtMs);
    }
  }

  // ---- frame ----
  let running = false;
  let rafId = 0;
  let last = performance.now();

  function applyDescriptor(desc) {
    uAmp.value = desc.amp;
    uTighten.value = desc.tighten;
    uSpread.value = desc.spread;
    uDensity.value = desc.density;
    uRidge.value = desc.ridge;
    uFocusZ.value = desc.focusZ;
    // a living ambient breath: the void's depth subtly inhales and exhales on a
    // slow sine independent of scroll, so the horizon reads alive, not painted.
    // pure uniform write, frozen under reduced motion (t is fixed there). The
    // breath rides on top of the established surface fog base (0.074, the value
    // the proven look was tuned at) so the custom surface/mote fog now visibly
    // breathes WITHOUT shifting the per-chapter look it shipped with. three's
    // built-in fog (the starfield) keeps tracking the per-state desc.fog as before.
    const fogBreath = reduced ? 0 : Math.sin(t * (Math.PI * 2 / 22)) * 0.002;
    fog.density = desc.fog;
    uFogDensity.value = FOG_BASE + fogBreath;
    // the System pin can steer convergence directly (override); otherwise the
    // blended descriptor value drives it so the climax also reads on free scroll.
    const cv = convergeOverride == null ? desc.converge : convergeOverride;
    uConverge.value = cv;
    desc.converge = cv; // keep current.converge in sync for camera + ridge reads
    // a homeopathic shimmer on the ignited spine (a heartbeat trace): two slow
    // sines beat together for an organic, non-periodic pulse, kept well below
    // flicker. frozen under reduced motion (the static poster holds one pose). The
    // shimmer DAMPENS as the field resolves (x (1 - converge*0.7)) so the gathered
    // spine reads as composed and decided at the climax, not still flickering.
    //
    // P0-C 17: cursor proximity INTENSIFIES the shimmer. As the pointer rides near
    // the signal ridge (cursorRidge -> 1, the smoothed proximity updateCursorTarget
    // maintains), the heartbeat trace on the spine quickens its amplitude up to ~1.6x
    // so the one colored line visibly "wakes" under the reader, then relaxes when the
    // pointer leaves. cursorRidge is 0 on mobile / reduced / when the watchdog sheds
    // reactivity, so this is inert there. Damped near the climax with the same
    // convergence factor so the held-still resolution keeps its composure.
    const shimmerBoost = 1 + cursorRidge * 0.6 * (1 - cv * 0.7);
    uRidgeShimmer.value = reduced ? 0
      : (Math.sin(t * 1.7) * 0.5 + Math.sin(t * 0.9 + 1.3) * 0.5) * 0.04 * (1 - cv * 0.7) * shimmerBoost;
  }

  // bloom is driven by convergence (sustained glow on the gathered spine) plus the
  // transient climax flare. Shared by the live frame and renderOnce so the static
  // reduced-motion frame shows the same gathering glow. No-op without bloom.
  function updateBloom() {
    if (!bloomPass || !bloomEnabled) return;
    const cv = current.converge || 0;
    const convEase = cv * cv * (3 - 2 * cv); // smoothstep: glow blooms late
    let strength = lerp(BLOOM_BASE, BLOOM_CONV, convEase);
    if (flareT > 0) strength += BLOOM_FLARE * smooth(flareT / FLARE_DUR);
    bloomPass.strength = strength;
    // the threshold drops as the field gathers so the converged spine crosses into
    // bloom while the cooled scatter never does. Gated through a tight [0.3, 0.8]
    // smoothstep on the eased convergence so the focus IGNITES across a decisive
    // window (the spine catches fire as it resolves) rather than fading in linearly.
    const ignite = smooth(clamp01((convEase - 0.3) / (0.8 - 0.3)));
    bloomPass.threshold = lerp(THRESH_BASE, THRESH_CONV, ignite);
  }

  function renderFrame() {
    if (postEnabled && composer) composer.render();
    else renderer.render(scene, camera);
  }

  function frame(now) {
    if (!running) return;
    const dtMs = Math.min(now - last, 50);
    const dt = dtMs / 1000;
    last = now;
    t += dt;
    uTime.value = t;

    pointer.x = lerp(pointer.x, pointer.tx, 0.06);
    pointer.y = lerp(pointer.y, pointer.ty, 0.06);

    // page-to-page arrival: if a prior frame was seeded (enterFrom), ease the
    // effective scroll from the seeded position to this page's band so the entry
    // reads as a continuous camera flight, not a cut. Once spent, free scroll
    // takes over. The convergence seed eases the same way then releases to the
    // descriptor so the gather read stays continuous across the navigation.
    let effScroll = scrollP;
    if (arriveT > 0) {
      arriveT = Math.max(0, arriveT - dt / ARRIVE_DUR);
      const k = 1 - arriveT;
      const eased = k * k * (3 - 2 * k); // smoothstep, decelerating arrival
      effScroll = lerp(arriveFrom, arriveTo, eased);
      if (arriveConvFrom != null) {
        // yield to a pin: if the override no longer equals the value the arrival
        // last wrote, a tentpole has taken control of the gather, so stop driving.
        if (arriveConvLast != null && convergeOverride !== arriveConvLast) {
          arriveConvFrom = null; arriveConvLast = null;
        } else {
          // ease the seeded gather toward the descriptor's value for effScroll so
          // the spine does not pop on entry; hand back to the descriptor at the end
          const descConv = blendStates(effScroll).converge;
          const v = lerp(arriveConvFrom, descConv, eased);
          if (arriveT === 0) { convergeOverride = null; arriveConvFrom = null; arriveConvLast = null; }
          else { convergeOverride = v; arriveConvLast = v; }
        }
      }
    }

    const target = blendStates(effScroll);
    for (const k in target) current[k] = lerp(current[k], target[k], 0.06);
    applyDescriptor(current);

    ridgePulse = lerp(ridgePulse, 0, 0.04);

    // bloom: a sustained glow that ramps up with the convergence so the gathered
    // spine genuinely blooms (the payoff holds while the field is collapsed), plus
    // a single eased flare added on top at the climax beat as punctuation. Guarded
    // so the watchdog (which can drop or resize bloom) is never overridden.
    if (flareT > 0) flareT = Math.max(0, flareT - dt);
    updateBloom();

    updateCursorTarget(current, dt);
    updateRidge(current, t);
    updateCamera(current, dt);

    // far dust rotates, but the rotation dampens with convergence so the whole
    // frame stills as the field resolves (the climax holds, even in the background).
    if (stars) stars.rotation.y += dt * 0.005 * (1 - (current.converge || 0) * 0.5);

    renderFrame();
    watchdog(dtMs);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  // P0-A final-frame failsafe. The RAF loop now never self-pauses on scroll (the
  // IntersectionObserver pause was removed in main.js), so the field is alive at
  // every scroll depth. This is a belt-and-suspenders guard for the deep-scroll
  // edge: if the reader is parked past 95% of a page and the loop is somehow not
  // running (e.g. a degraded path) while no setScroll has fired for ~400ms, paint
  // one fresh composed frame so the last frame is never a frozen, dimmed remnant.
  // Cheap (a few comparisons a second); never starts a competing RAF. Skipped
  // under reduced motion (the static poster owns the single frame).
  let failsafeTimer = 0;
  if (!reduced && typeof window !== "undefined") {
    failsafeTimer = window.setInterval(() => {
      if (running || document.hidden) return;
      if (scrollP > 0.95 && performance.now() - lastScrollSetAt > 400) renderOnce();
    }, 400);
  }

  // render exactly one composed frame (reduced motion static, or warm up)
  function renderOnce() {
    // reduced-motion static frame: re-derive the poster gather from whatever
    // still the bootstrap set (scene.setScroll(PAGE.sceneStill)), so each page's
    // frozen frame is composed for its own pose, not the constructor's default.
    if (reduced) convergeOverride = staticConverge(scrollP);
    const desc = blendStates(scrollP);
    current = desc;
    uTime.value = t;
    applyDescriptor(desc);
    updateCursorTarget(desc, 0.016);
    updateRidge(desc, t);
    updateCamera(desc, 0.016);
    updateBloom();
    renderFrame();
  }

  function dispose() {
    stop();
    if (failsafeTimer) clearInterval(failsafeTimer);
    geo.dispose();
    surfMat.dispose();
    ridgeGeo.dispose();
    ridgeMat.dispose();
    if (motesWhite) { motesWhite.geometry.dispose(); moteWhiteMat.dispose(); }
    if (motesSignal) { motesSignal.geometry.dispose(); moteSignalMat.dispose(); }
    if (stars) { stars.geometry.dispose(); stars.material.dispose(); }
    if (composer) {
      composer.passes.forEach((p) => { if (p.dispose) p.dispose(); });
      if (composer.renderTarget1) composer.renderTarget1.dispose();
      if (composer.renderTarget2) composer.renderTarget2.dispose();
      if (composer.dispose) composer.dispose();
    }
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
  }

  // size composer once layout is known
  resize();

  // Page-to-page continuity: persist the live global arc position + gather on
  // unload so the next page can enterFrom() that exact frame and ease in. One
  // tiny sessionStorage write on navigate; no per-frame cost. Guarded so a
  // privacy-mode storage throw never breaks navigation. Skipped under reduced
  // motion (no arrival ease there) and on mobile (no continuity flight).
  function persistArc() {
    if (reduced) return;
    try {
      const cv = uConverge.value;
      sessionStorage.setItem("meridian:arc", JSON.stringify({ p: scrollP, c: cv, t: Date.now() }));
    } catch (e) { /* storage unavailable: continuity simply degrades to a clean entry */ }
  }
  if (!reduced && typeof window !== "undefined") {
    window.addEventListener("pagehide", persistArc);
    window.addEventListener("beforeunload", persistArc);
  }

  return {
    start, stop, renderOnce, dispose, resize,
    setScroll, setPointer, pulseRidge, getCursorRidge,
    setConverge, flareBloom, enterFrom,
    renderer,
  };
}

// Read a persisted prior-frame arc (written by persistArc on the previous page).
// Returns null when absent / stale / unavailable, so callers cleanly skip the
// arrival ease and enter at the page band. Exported so the bootstrap can seed
// the scene before the first paint. Shared, so all four pages read it the same.
export function readPriorArc() {
  try {
    const raw = sessionStorage.getItem("meridian:arc");
    if (!raw) return null;
    const a = JSON.parse(raw);
    if (!a || typeof a.p !== "number") return null;
    // stale guard: only treat it as a genuine same-session navigation if recent
    if (typeof a.t === "number" && Date.now() - a.t > 60000) return null;
    return { p: Math.max(0, Math.min(1, a.p)), c: (typeof a.c === "number" ? a.c : null) };
  } catch (e) { return null; }
}
