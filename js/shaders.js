// =============================================================================
// CANLI CAPITAL / shaders.js
// GLSL building blocks for the manifold. Kept here so scene.js reads as control
// flow rather than a wall of shader strings. All comments are hyphen only.
//
// Contents:
//   SNOISE         Ashima Arts 3D simplex noise (MIT), reused by every shader.
//   SURFACE_VERT   GPU vertex displacement for the line surface: fbm height,
//                  a small curl drift, plurality split, analytic normal for a
//                  view dependent rim term, and per vertex brightness.
//   SURFACE_FRAG   fog dissolve into the page void plus a restrained fresnel rim.
//   MOTE_VERT      vertex animated rising data motes that sit on the surface.
//   MOTE_FRAG      soft round sprite with depth fog.
//   POST_FRAG      one combined pass: vignette plus homeopathic chromatic
//                  aberration. Grain is left to the page CSS to avoid doubling.
// =============================================================================

// Ashima Arts simplex noise. Public, MIT licensed. Returns roughly -1 to 1.
export const SNOISE = `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

// Shared height field used by both the surface and the motes so motes sit on the
// manifold. Inputs are world XZ plus the descriptor uniforms. Two octaves of
// snoise give the rolling base, a long swell adds a calm horizon wave, and the
// tighten uniform pulls the surface toward parallel taut filaments.
// uConverge gates a calming of the curl drift: as the field resolves toward the
// single signal, the surface literally settles (less wandering, less noise).
const HEIGHT_FN = `
float manifoldHeight(vec2 wxz, float time, float amp, float tighten, float w, float d, float converge){
  vec2 nxz = wxz / vec2(w, d);
  // slow curl style drift: offset the sample coords by a noise gradient
  float c1 = snoise(vec3(wxz * 0.18, time * 0.04));
  float c2 = snoise(vec3(wxz.yx * 0.18 + 11.0, time * 0.04));
  // convergence quiets the drift so the surface stops wandering as it resolves
  vec2 drift = vec2(c1, c2) * 0.09 * mix(1.0, 0.3, converge);
  vec2 s = wxz * 0.34 + drift;
  float h = snoise(vec3(s, time * 0.05)) * 1.15;
  h += snoise(vec3(s * 2.05 + 5.0, time * 0.035)) * 0.5;
  h += sin(nxz.y * 3.0 + time * 0.25) * 0.18;
  float tightTarget = sin(nxz.y * 9.0) * 0.12;
  h = mix(h, tightTarget, tighten * 0.7);
  return h * amp;
}
`;

export const SURFACE_VERT = SNOISE + HEIGHT_FN + `
uniform float uTime;
uniform float uAmp;
uniform float uTighten;
uniform float uSpread;
uniform float uDensity;
uniform float uRidge;
uniform float uW;
uniform float uD;
uniform vec3  uCursor;     // world space cursor target on the plane
uniform vec3  uCursorWake; // a single decaying lag point: the cursor's recent trail
uniform float uCursorAmt;  // 0 disables cursor brightening (mobile)
uniform float uCursorRidge;// 0 to 1: cursor proximity to the signal ridge (lifts it)
uniform float uCursorProxBand;// 0/0.33/0.67/1: quantized cursor-to-ridge proximity zone
uniform float uRidgeShimmer;// small live shimmer on the spine ignition (heartbeat trace)
uniform float uFocusZ;     // world Z that reads sharpest (fake depth of field)
uniform float uConverge;   // 0 to 1: the field gathers onto the single ridge
uniform float uDimFloor;   // lowest brightness the dimmed field may reach

attribute vec2 aGrid;      // normalized grid coords 0 to 1 (x, z)

varying float vAlpha;
varying float vFogDepth;
varying float vFres;
varying float vSignal;     // 0 paper .. 1 signal: how much this vertex is the spine
varying float vCursorGlow; // near-zone cursor glow on the spine band (frag adds a halo)

// ridge meander across X for a given normalized z. As the field converges the
// meander straightens toward a single centered spine, so the climax resolves to
// one clean line in the cleared space rather than a band wandering behind copy.
float ridgeXAt(float nz){
  float wander = sin(nz * 2.2 + 0.6) * (uW * 0.22) + snoise(vec3(nz * 1.6, 7.0, 0.0)) * 1.6;
  // straighten: at full convergence the spine collapses to x = 0 (dead center)
  return wander * (1.0 - uConverge * 0.85);
}

void main(){
  float nx = aGrid.x;
  float nz = aGrid.y;
  float wx = (nx - 0.5) * uW;
  float wz = -nz * uD;

  float h = manifoldHeight(vec2(wx, wz), uTime, uAmp, uTighten, uW, uD, uConverge);

  // analytic normal via finite differences on the height field
  float e = 0.35;
  float hX = manifoldHeight(vec2(wx + e, wz), uTime, uAmp, uTighten, uW, uD, uConverge);
  float hZ = manifoldHeight(vec2(wx, wz + e), uTime, uAmp, uTighten, uW, uD, uConverge);
  vec3 nrm = normalize(vec3(h - hX, e, h - hZ));

  // the convergence: filaments collapse onto the single signal ridge line so the
  // restless field visibly gathers onto one decision as the system resolves. The
  // pull is eased hard (cubic) so the gather accelerates into the climax, and at
  // full convergence the field is drawn most of the way in (0.82), leaving one
  // taut spine rather than a loosely leaning scatter.
  float ridX = ridgeXAt(nz);
  float gather = uConverge * uConverge * (3.0 - 2.0 * uConverge); // smoothstep
  float sx = mix(wx, ridX, gather * 0.82);
  float sz = wz;
  // plurality split into three receding lanes (suppressed once converging)
  if (uSpread > 0.001){
    float lane = floor(nx * 3.0) - 1.0;     // -1, 0, 1
    sx += lane * uSpread * 3.0;
    sz -= abs(lane) * uSpread * 3.5;
  }

  vec3 pos = vec3(sx, h, sz);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vFogDepth = -mv.z;

  // view direction for fresnel rim
  vec3 viewDir = normalize(-mv.xyz);
  vec3 nrmView = normalize((modelViewMatrix * vec4(nrm, 0.0)).xyz);
  vFres = pow(1.0 - max(dot(nrmView, viewDir), 0.0), 3.0);

  // brightness: base density, ridge proximity, cursor proximity, height.
  // ridgeProx is measured against the (now gathered) sample x so the converged
  // spine reads as the lit band; a tight inner core gets the strongest glow.
  float ridgeProx = max(0.0, 1.0 - abs(sx - ridX) / 2.2);
  float ridgeCore = max(0.0, 1.0 - abs(sx - ridX) / 0.8);
  // the converged spine ignites: the ridge band brightens hard with convergence
  // so the gathered line is unmistakably the hero of the frame, not background.
  // a live shimmer rides the ignited core so the one colored line reads as a
  // running readout (a heartbeat trace), never a static stroke. analytic, cheap.
  float shimmer = 1.0 + uRidgeShimmer * ridgeCore;
  float ridgeBright = (ridgeProx * 0.18 * uRidge
                    + ridgeProx * 0.30 * uConverge
                    + ridgeCore * ridgeCore * 0.55 * uConverge) * shimmer;
  // the manifold answers the cursor near the spine: when the pointer rides close
  // to the signal ridge, lift that band a touch so the reader discovers the one
  // line responds to them. damped to nothing at the climax (camera holds still).
  ridgeBright += ridgeCore * uCursorRidge * 0.22 * (1.0 - uConverge * 0.7);
  // three-zone envelope: the quantized proximity band (0 far .. 1 near) carries the
  // cursor's discovered nearness as a steady zone rather than a continuous wobble,
  // so the near zone reads as the reader "finding" the spine. The near zone (band
  // toward 1) seeds a glow on the ridge core that the frag turns into a soft halo.
  // damped near the climax so the held-still beat keeps its composure.
  vCursorGlow = ridgeCore * uCursorProxBand * (1.0 - uConverge * 0.7);
  // surface wake: the field brightens under the live cursor AND faintly along its
  // recent trail (a single decaying lag point), so the manifold ripples where the
  // cursor has been. two cheap distance reads, no allocation, mobile-disabled.
  float distCur = distance(vec3(sx, h, sz), uCursor);
  float curBright = (1.0 - smoothstep(0.0, 3.4, distCur)) * 0.34 * uCursorAmt;
  float distWake = distance(vec3(sx, h, sz), uCursorWake);
  curBright += (1.0 - smoothstep(0.0, 2.6, distWake)) * 0.12 * uCursorAmt;
  // convergence dims the wide field hard toward uDimFloor while the ridge band
  // holds, so the scatter falls into the void and the single signal stays lit
  // (many -> one). Squared so the dimming bites late and decisively.
  float dimAmt = uConverge * uConverge * (1.0 - ridgeProx);
  float fieldDim = mix(1.0, uDimFloor, dimAmt);
  float a = ((0.10 + curBright) * fieldDim + ridgeBright) * uDensity;
  a += max(0.0, h) * 0.06;
  // fake depth of field: keep a sharp band around the focal Z, dim near and far.
  // convergence narrows the in-focus band so the ridge reads razor-sharp while
  // the rest of the field blurs into the void (one decision in focus).
  float focusFar = mix(11.0, 7.0, uConverge);
  float focus = 1.0 - smoothstep(0.0, focusFar, abs(-sz - uFocusZ));
  a *= mix(0.55, 1.0, focus);
  // ceiling lifts with convergence so the ignited spine can push above the bloom
  // threshold and actually glow; the wide field stays held at its calm ceiling.
  vAlpha = clamp(a, 0.0, mix(0.55, 0.95, ridgeCore * uConverge));
  // the gathered core takes on the signal tint as it ignites, so the collapse
  // resolves to one warm spine (the single decision) against the cooled field.
  vSignal = ridgeCore * uConverge;

  gl_Position = projectionMatrix * mv;
}
`;

export const SURFACE_FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uSignalColor;
uniform float fogDensity;
uniform vec3 fogColor;
varying float vAlpha;
varying float vFogDepth;
varying float vFres;
varying float vSignal;
varying float vCursorGlow;
void main(){
  float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  fogFactor = clamp(fogFactor, 0.0, 1.0);
  // the converged spine warms toward the signal accent (and overshoots a touch
  // so its hot core crosses the bloom threshold); the wide field stays paper.
  // the near cursor zone warms the ridge band an extra notch toward the signal,
  // so when the reader rides the pointer onto the spine it reads as the one line
  // recognizing them (a zone, not a wobble). Restrained, fog-respecting.
  float warm = clamp(vSignal + vCursorGlow * 0.6, 0.0, 1.0);
  vec3 base = mix(uColor, uSignalColor * 1.25, smoothstep(0.0, 1.0, warm));
  vec3 col = mix(base, fogColor, fogFactor);
  // restrained rim: edge on lines pick up a hair more paper light
  col = mix(col, base, vFres * 0.35);
  // the near-zone halo: one small additive glow on the ridge band only, fading
  // with fog so it never lights the far field. transform/opacity-equivalent.
  float a = (vAlpha + vFres * 0.06 + vCursorGlow * 0.10 * (1.0 - fogFactor)) * (1.0 - fogFactor);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;

// Motes: rise along Y and wrap, sitting just above the manifold surface.
export const MOTE_VERT = SNOISE + HEIGHT_FN + `
uniform float uTime;
uniform float uAmp;
uniform float uTighten;
uniform float uW;
uniform float uD;
uniform float uPixelRatio;
uniform float uParallax;   // extra lateral push so motes parallax faster
uniform float uConverge;   // 0 to 1: shared with the surface so motes settle too
uniform float uSignal;     // 1 for the signal cluster, 0 for the white field

attribute float aOffset;   // phase offset 0 to 1
attribute float aSpeed;    // rise speed
attribute float aSize;     // base size

varying float vFogDepth;
varying float vTwinkle;

void main(){
  float range = 4.2;
  float rise = mod(uTime * aSpeed + aOffset * range, range);
  vec3 pos = position;
  pos.x += uParallax;
  // signal motes gather toward the centered spine as the field converges, so the
  // accent cluster collapses onto the single line in step with the surface.
  float gather = uConverge * uConverge * (3.0 - 2.0 * uConverge);
  pos.x = mix(pos.x, 0.0, uSignal * gather * 0.82);
  // sit on the surface, then float upward by rise
  float surfH = manifoldHeight(pos.xz, uTime, uAmp, uTighten, uW, uD, uConverge);
  pos.y = surfH + 0.05 + rise;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vFogDepth = -mv.z;
  // fade in from the surface and out near the top of the range
  vTwinkle = smoothstep(0.0, 0.6, rise) * (1.0 - smoothstep(range * 0.6, range, rise));
  // the gathered signal cluster brightens as it collapses onto the spine
  vTwinkle *= 1.0 + uSignal * gather * 0.6;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * (60.0 / max(0.001, -mv.z)) * (1.0 + uSignal * gather * 0.5);
}
`;

export const MOTE_FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float uOpacity;
varying float vFogDepth;
varying float vTwinkle;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = 1.0 - smoothstep(0.2, 0.5, d);
  float fogFactor = clamp(1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth), 0.0, 1.0);
  vec3 col = mix(uColor, fogColor, fogFactor);
  float a = soft * vTwinkle * uOpacity * (1.0 - fogFactor);
  if (a < 0.002) discard;
  gl_FragColor = vec4(col, a);
}
`;

// One combined post pass: vignette plus micro chromatic aberration.
export const POST_VERT = `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const POST_FRAG = `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uVignette;     // strength 0 to 1
uniform float uAberration;   // max edge offset in uv
varying vec2 vUv;
void main(){
  vec2 toCenter = vUv - 0.5;
  float r2 = dot(toCenter, toCenter);
  // radial chromatic aberration: zero at center, grows to the corners
  vec2 off = toCenter * uAberration * r2 * 4.0;
  float cr = texture2D(tDiffuse, vUv + off).r;
  float cg = texture2D(tDiffuse, vUv).g;
  float cb = texture2D(tDiffuse, vUv - off).b;
  vec3 col = vec3(cr, cg, cb);
  // vignette: corners drop in brightness, eye is drawn to center
  float vig = 1.0 - r2 * uVignette;
  col *= clamp(vig, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;
