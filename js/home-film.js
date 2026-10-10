// The Canli Capital film. One camera move across a market at night, in twelve chapters.
// An AI model left alone rains numbers onto the floor, and nearly all of them land red. Beside it, the
// open tools heap into a haystack of 1,056 parts that spills tokens. Then three gates light up (find,
// describe, run), the haystack dissolves, the rain turns blue, and a thread runs from the gates into a
// city of filings to the one page an answer came from. Four pillars rise for the vision, canli-mcp's
// 285 tools fall into orbit around one core, and five towers stand for the benchmark, with the gaps
// left dark where a server never answered a kind of question.
// The counts the film shows (numbers given and wrong, tools, the benchmark towers) are read from the
// page's #film-data block, which the build writes from the same published files as the words.
// Raw WebGL2: lit instanced geometry with glowing edges, a wet mirrored floor, additive light, text
// drawn from a glyph atlas, a two-level bloom, tone mapping, grain and vignette. No library. Every word
// on the page is HTML and readable without this file.

const root = document.documentElement;
const chapters = [...document.querySelectorAll("[data-chapter]")];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = matchMedia("(max-width: 768px)").matches;
const cinema = !reduced && innerHeight < 1800; // captions, key, timecode: for people on a real screen
const staged = cinema;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const DATA = (() => { try { return JSON.parse(document.getElementById("film-data")?.textContent || "null"); } catch { return null; } })() ?? {
  rain: { questions: 150, given: 84, wrong: 0.96 }, tangle: { tools: 1056, tokens: 0 }, core: { front: 3, packs: [{ id: "quant", tools: 285 }] }, gap: { categories: [], arms: [] },
};
const fmt = new Intl.NumberFormat("en-US");

// ---------- title cards: headline words rise one after another (text nodes only, so markup and meaning stay intact) ----------
if (staged) for (const h of document.querySelectorAll(".chapter h1, .chapter h2")) {
  let k = 0;
  const walk = (node) => { for (const n of [...node.childNodes]) {
    if (n.nodeType === 3) { const frag = document.createDocumentFragment();
      for (const part of n.textContent.split(/(\s+)/)) { if (!part) continue; if (/^\s+$/.test(part)) { frag.append(part); continue; }
        const w = document.createElement("span"); w.className = "w"; const i = document.createElement("span"); i.textContent = part; i.style.setProperty("--w", String(k++)); w.append(i); frag.append(w); }
      n.replaceWith(frag); }
    else if (n.nodeType === 1) walk(n); } };
  walk(h);
}

// ---------- where the reader is: each chapter's own progress 0…1 while it is pinned ----------
const pinned = (c) => !small && !c.classList.contains("free") && !c.classList.contains("finale");
function progressOf(c) {
  const r = c.getBoundingClientRect();
  if (!pinned(c)) return clamp((innerHeight * 0.85 - r.top) / (r.height * 0.6));
  return clamp(-r.top / Math.max(1, r.height - innerHeight));
}
function scrollState() {
  let i = 0;
  for (let k = 0; k < chapters.length; k++) if (chapters[k].getBoundingClientRect().top <= innerHeight * 0.5) i = k;
  return { i, p: progressOf(chapters[i]) };
}

// ---------- reveals with weight: in a pinned chapter the title arrives first, then each block in turn ----------
const blocksOf = chapters.map((c) => [...c.querySelectorAll(".chapter-inner > *")]);
const inners = chapters.map((c) => c.querySelector(".chapter-inner"));
function reveal() {
  chapters.forEach((c, k) => {
    if (c.getBoundingClientRect().top > innerHeight * 0.95) return;
    const p = progressOf(c);
    // the words leave as the next shot begins: they lift and dissolve over the last part of a pinned chapter
    if (staged && pinned(c) && k < chapters.length - 1) { const r = c.getBoundingClientRect(); // once fully gone it is restored, so nothing off screen stays faded
      inners[k].style.setProperty("--exit", (r.bottom < 0 ? 0 : smooth(0.8, 1, p)).toFixed(3)); }
    blocksOf[k].forEach((el, j) => {
      const at = pinned(c) ? (j <= 1 ? -1 : 0.02 + (j - 1) * 0.07) : -1;
      if (!el.classList.contains("is-shown") && p >= at) el.classList.add("is-shown");
    });
  });
}
reveal();
if (staged) root.classList.add("film-on");
addEventListener("scroll", reveal, { passive: true });
addEventListener("resize", reveal);

// ---------- the shot list: one camera position per chapter, and the state of the world in it ----------
//   eye                 look                rain  tangle gates trace pillars core gap  dawn  fog     exposure
const SHOTS = [
  [[-158, 5.5, 26],     [-126, 15, -30],     0.45, 1,     0,    0,    0,      0,   0,   0,    0.0085, 1.0],  // 0  the market at night; a model hangs over it
  [[-141, 3.2, 15],     [-124, 3.6, -7],     1,    1,     0,    0,    0,      0,   0,   0,    0.011,  1.0],  // 1  it rains numbers, and they land red
  [[-99, 4.4, 17],      [-76, 8.5, -12],     0.35, 1,     0,    0,    0,      0,   0,   0,    0.011,  1.0],  // 2  the haystack of tools, spilling tokens
  [[-55, 4.0, 10.5],    [-34, 3.4, 0],       0,    0,     1,    0,    0,      0,   0,   0,    0.012,  1.05], // 3  three gates light up
  [[-8, 10, 15],        [18, 9, -24],        0,    0,     1,    1,    0,      0,   0,   0,    0.010,  1.05], // 4  a thread into the city, to one page
  [[84, 6, 64],         [92, 17, -18],       0,    0,     1,    1,    1,      0,   0,   0.15, 0.008,  1.05], // 5  four pillars rise
  [[127, 9, 32],        [130, 7.5, -6],        0,    0,     1,    1,    1,      1,   0,   0.15, 0.010,  1.05], // 6  285 tools fall into orbit
  [[154, 10, 60],       [160, 11, -4],      0,    0,     1,    1,    1,      1,   1,   0.2,  0.009,  1.05], // 7  five towers, and their gaps
  [[-34, 46, 96],       [72, 4, -42],        0.2,  0,     1,    1,    1,      1,   1,   1,    0.0022, 1.1],  // 8  the whole market from above, at dawn
  [[-2, 17, 9],         [30, 4, -42],        0,    0,     1,    1,    1,      1,   1,   0.7,  0.008,  1.05], // 9  low over the city of filings
  [[-52.4, 1.75, 7.4],  [-46.6, 1.3, 0.6],    0,    0,     1,    1,    1,      1,   1,   0.4,  0.016,  1.0],  // 10 the builder, at the first gate
  [[-64, 3.5, 0.6],     [40, 3.4, -1.5],     0.15, 0,     1,    1,    1,      1,   1,   1,    0.006,  1.12], // 11 down the line, through the gates
];

// ---------- the world ----------
// Each box: position, size, body colour, edge colour, edge strength, group, and four parameters its group reads.
// groups: 0 always · 1 the model · 2 the haystack · 3 gates · 4 the beam · 5 city · 6 the answer's tower
//         7 the hash seal · 8 pillars · 9 the core · 10 benchmark towers · 11 the builder
const DARK = [0.04, 0.046, 0.06], STEEL = [0.07, 0.08, 0.098], INK = [0.025, 0.03, 0.04];
const ICE = [0.57, 0.86, 1.0], BLUE = [0.36, 0.55, 1.0], WHITE = [0.86, 0.9, 1.0], AMBER = [1.0, 0.62, 0.22], RED = [1.0, 0.28, 0.22], GREEN = [0.3, 0.95, 0.6], WARM = [1.0, 0.8, 0.58], VIOLET = [0.72, 0.55, 1.0];
const boxes = [], lamps = [], captions = [];
const box = (p, s, body = DARK, emit = ICE, ei = 0.35, group = 0, q = [0, 0, 0, 0]) => boxes.push([...p, ...s, ...body, ...emit, ei, group, ...q]);
const lamp = (p, color, size, group = 0, strength = 1) => lamps.push([...p, ...color, size, group, strength]);
const caption = (pos, title, sub, chs, tone = "") => captions.push([pos, title, sub, chs, tone]);
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const R = rng(11);

// the road: one lit line the whole story travels along
box([-20, -0.06, 0], [280, 0.12, 3.6], STEEL, ICE, 0.06);
for (const z of [-1.5, 1.5]) box([-20, 0.02, z], [280, 0.05, 0.06], STEEL, ICE, 0.9);

// 0-1 · the model: a monolith hanging over the market, raining numbers
box([-125, 17, -31], [6.2, 24, 1.1], INK, AMBER, 1.6, 1);
box([-125, 17, -31.7], [7.4, 25.2, 0.2], DARK, AMBER, 0.5, 1);
lamp([-125, 17, -21], AMBER, 20, 1, 0.3);
for (let k = 0; k < 6; k++) lamp([-125 + (k - 2.5) * 1.1, 4.4, -28.6], AMBER, 2.6, 1, 0.5);
caption([-125, 30.5, -31], "An AI model", "no tools, no filings", [0, 1], "amber");

// 2 · the haystack: every tool of one open server, heaped
const TOOLS = DATA.tangle.tools || 1056;
const HC = [-76, 0, -13];
for (let k = 0; k < TOOLS; k++) {
  const a = R() * 6.283, layer = Math.pow(R(), 0.7), rr = (1 - layer) * 7.5 * Math.sqrt(R()) + 0.6;
  const y = layer * 21 + R() * 0.8, s = 0.42 + R() * 0.5;
  const tint = k % 11 === 0 ? AMBER : k % 7 === 0 ? RED : WHITE;
  box([HC[0] + Math.cos(a) * rr * 1.15, y + s / 2, HC[2] + Math.sin(a) * rr], [s * (0.8 + R() * 0.9), s * (0.4 + R() * 0.7), s * (0.6 + R() * 0.8)], DARK, tint, 0.45 + R() * 0.5, 2, [R(), R(), R(), y / 22]);
}
lamp([HC[0], 22.5, HC[2]], AMBER, 18, 2, 0.32);
caption([HC[0], 24.5, HC[2]], "One open server's tools", `${fmt.format(TOOLS)} in one list${DATA.tangle.tokens ? ` · ${fmt.format(DATA.tangle.tokens)} tokens` : ""}`, [2], "amber");

// 3 · three gates on the road: find, describe, run
const GATES = [-42, -36, -30], GATE_Y = 3.4, GATE_R = 3.1;
GATES.forEach((x, g) => {
  for (const z of [-3.9, 3.9]) box([x, 3.1, z], [0.42, 6.2, 0.42], STEEL, ICE, 0.45, 3, [g, 0, 0, 0]);
  for (let k = 0; k < 56; k++) { const a = (k / 56) * 6.283; box([x, GATE_Y + Math.sin(a) * GATE_R, Math.cos(a) * GATE_R], [0.19, 0.19, 0.19], ICE, ICE, 4.6, 3, [g, k / 56, 0, 0]); }
  lamp([x, GATE_Y, 0], ICE, 7, 3, 0.45);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283; lamp([x, GATE_Y + Math.sin(a) * GATE_R, Math.cos(a) * GATE_R], ICE, 2.2, 3, 0.9); }
});
caption([GATES[0], GATE_Y + GATE_R + 0.8, 0], "find_tool", "searches 285 tools", [3]);
caption([GATES[1], GATE_Y + GATE_R + 0.8, 0], "describe_tool", "reads one", [3]);
caption([GATES[2], GATE_Y + GATE_R + 0.8, 0], "run_tool", "runs it", [3]);
// the beam: one line of light through all three
box([-31, GATE_Y, 0], [44, 0.07, 0.07], ICE, ICE, 4.0, 4);
box([-31, GATE_Y, 0], [44, 0.22, 0.22], INK, BLUE, 0.6, 4);

// 4 · the city of filings: towers, each a company, their floors lit like the lines of a report
const CITY = [];
for (let gx = 0; gx < 40; gx++) for (let gz = 0; gz < 24; gz++) {
  const x = -12 + gx * 2.25 + (gz % 2) * 0.6, z = -9.5 - gz * 2.5;
  if (Math.abs(x - 20) < 1.6 && Math.abs(z + 26) < 1.6) continue; // the answer's tower stands here
  const n = R(), h = 0.8 + Math.pow(n, 2.6) * 15 + R() * 1.2;
  CITY.push([x, z, h]);
  box([x, h / 2, z], [1.45, h, 1.45], DARK, gz % 5 === 0 ? BLUE : ICE, 0.16 + R() * 0.18, 5, [R(), h, 0, 0]);
}
// the tower the answer came from, and the page the thread reaches
const TOWER = [20, 0, -26], TOWER_H = 16.5;
box([TOWER[0], TOWER_H / 2, TOWER[2]], [1.9, TOWER_H, 1.9], DARK, WHITE, 0.5, 6, [0.5, TOWER_H, 1, 0]);
box([TOWER[0] - 1.6, TOWER_H - 2.6, TOWER[2] + 1.3], [0.05, 1.5, 1.1], WHITE, WHITE, 2.6, 6, [0, 0, 2, 0]);
for (let k = 0; k < 24; k++) box([TOWER[0], TOWER_H + 1.6, TOWER[2]], [0.12, 0.12, 0.12], ICE, ICE, 3, 7, [k / 24, 1.6, 0, 0]);
lamp([TOWER[0], TOWER_H + 1.6, TOWER[2]], ICE, 8, 6, 0.6);
const tag = document.querySelector(".receipt dd:nth-of-type(1)")?.textContent ?? "";
caption([TOWER[0], TOWER_H + 3.2, TOWER[2]], "NVIDIA, 10-K", document.querySelector(".receipt div:nth-child(3) dd")?.textContent || tag, [4], "blue");

// 5 · the vision: four pillars rise at the edge of the city
const PILLARS = [["Context", ICE, 1], ["Testing", GREEN, 1], ["Data", AMBER, 0.62], ["Execution", VIOLET, 0.34]];
PILLARS.forEach(([name, c, built], i) => {
  const x = 84 + i * 6, h = 30, z = -18;
  box([x, h / 2, z], [2.8, h, 2.8], DARK, c, built > 0.9 ? 0.75 : 0.32, 8, [i, built, 0, 0]);
  box([x, h * built + 0.25, z], [3.3, 0.5, 3.3], STEEL, c, 2.2, 8, [i, built, 1, 0]);
  lamp([x, h * built + 0.8, z], c, 7, 8, 0.7 * built);
  caption([x, h * built + 3, z], name, i === 0 ? "live" : i === 1 ? "live" : i === 2 ? "started" : "paper only", [5], i === 0 ? "" : i === 1 ? "green" : i === 2 ? "amber" : "violet");
});

// 6 · the flagship: every tool in orbit around one core, three in front
const CORE = [130, 7, -6];
const PACK_COLORS = { quant: ICE, validation: GREEN, markets: BLUE, fundamentals: WHITE, research: VIOLET, paper: AMBER, backtest: [0.5, 1, 0.9] };
{
  const colours = DATA.core.packs.flatMap((p) => Array(p.tools).fill(PACK_COLORS[p.id] ?? WHITE));
  for (let k = colours.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [colours[k], colours[j]] = [colours[j], colours[k]]; }
  const N = colours.length, golden = Math.PI * (3 - Math.sqrt(5));
  colours.forEach((col, k) => {
    const phi = Math.acos(1 - (2 * (k + 0.5)) / N), theta = k * golden;
    const sx = CORE[0] + (R() - 0.5) * 44, sy = 2 + R() * 20, sz = CORE[2] + (R() - 0.5) * 34;
    box([sx, sy, sz], [0.36, 0.36, 0.36], DARK, col, 3.2, 9, [6.2 + (R() - 0.5) * 0.5, phi, theta, 0.09]);
  });
}
box(CORE, [1.9, 1.9, 1.9], INK, ICE, 4.5, 9, [0, 0, 0, -1]);
for (let k = 0; k < (DATA.core.front || 3); k++) box([CORE[0] - 0.6 + k * 0.6, CORE[1] - 2.3, CORE[2] + 2.6], [0.4, 0.4, 0.4], ICE, WHITE, 4.5, 9, [0, 0, 0, -2]);
lamp([CORE[0], CORE[1], CORE[2] + 2.2], ICE, 9, 9, 0.8);
caption([CORE[0], CORE[1] + 9.5, CORE[2]], "canli-mcp", `${DATA.core.packs.reduce((s, p) => s + p.tools, 0)} tools · ${DATA.core.packs.length} packs · ${DATA.core.front} in front`, [6]);

// 7 · the gap: one tower per server, a block per kind of question; dark where it never answered
const ARMS = DATA.gap.arms;
[...ARMS].reverse().forEach((arm, t) => {
  const x = 150 + t * 6, z = -4, total = arm.accuracy * 26, seg = total / Math.max(1, arm.categories.length);
  arm.categories.forEach((acc, s) => {
    const y = seg * s + seg / 2, colour = arm.ours ? ICE : WHITE;
    const level = acc < 0 ? -1 : acc;
    box([x, y, z], [2.4, seg * 0.86, 2.4], level === 0 ? [0.09, 0.02, 0.02] : DARK, level === 0 ? RED : colour, level === 0 ? 1.4 : level < 0 ? 0.08 : (0.35 + level * 1.4) * (arm.ours ? 1.7 : 1), 10, [t, s, level, arm.ours ? 1 : 0]);
  });
  lamp([x, total + 1.2, z], arm.ours ? ICE : WHITE, arm.ours ? 9 : 5, 10, arm.ours ? 0.9 : 0.4);
  caption([x, total + 2.4, z], arm.label, `${Math.round(arm.accuracy * 100)}% correct`, [7], arm.ours ? "blue" : "");
});

// 10 · the builder, standing at the first gate
box([-47, 0.78, 1.2], [0.34, 1.0, 0.22], [0.08, 0.08, 0.1], WARM, 0.7, 11);
for (const dz of [-0.08, 0.08]) box([-47, 0.15, 1.2 + dz], [0.12, 0.3, 0.1], [0.08, 0.08, 0.1], WARM, 0.5, 11);
box([-47, 1.45, 1.2], [0.22, 0.24, 0.22], [0.1, 0.1, 0.12], WARM, 1.1, 11);
lamp([-46.4, 2.4, 1.6], WARM, 3.2, 11, 0.8);
caption([-47, 2.6, 1.2], "Arhan Canli", "founder", [10]);

// ---------- shaders ----------
const LIB = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float sm(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }`;
const BOX_FRAG = `#version 300 es
precision highp float;
in vec3 vN, vL, vW, vBody, vEmit; in float vEI, vKind; in vec4 vInfo; out vec4 o;
uniform vec3 uEye, uFogC; uniform float uFogD, uExpo, uClip, uTime;
void main(){
  if (vW.y < uClip) discard;
  vec3 a = abs(vL) * 2.0; float mx = max(a.x, max(a.y, a.z)), mn = min(a.x, min(a.y, a.z)), sec = a.x + a.y + a.z - mx - mn;
  float w = fwidth(sec) * 1.4 + 0.012, edge = smoothstep(1.0 - w * 2.2, 1.0 - w * 0.2, sec);
  vec3 n = normalize(vN), L = normalize(vec3(-0.35, 0.85, 0.4)), V = normalize(uEye - vW);
  float key = max(dot(n, L), 0.0), rim = pow(1.0 - max(dot(n, V), 0.0), 3.0), spec = pow(max(dot(n, normalize(L + V)), 0.0), 56.0);
  vec3 col = vBody * (0.35 + 1.1 * key) + vec3(0.25, 0.35, 0.6) * rim * 0.12 + vec3(0.55, 0.65, 0.85) * spec * 0.22;
  col += vEmit * edge * vEI + vEmit * vEI * 0.05;
  // a tower's sides read like a filing: rows of lit lines, a few floors dark
  if (vKind > 0.5 && vKind < 1.5 && abs(n.y) < 0.5) {
    float rows = vInfo.y * 3.2, r = (vL.y + 0.5) * rows, f = fract(r), id = floor(r);
    float lit = step(0.45, fract(sin(id * 12.9 + vInfo.x * 91.7) * 437.5)) * step(0.3, f) * step(f, 0.62);
    float across = abs(n.x) > 0.5 ? vL.z : vL.x;
    lit *= step(0.08, across + 0.5) * step(across + 0.5, 0.92);
    col += vEmit * lit * (0.18 + 0.5 * vInfo.z) * (0.75 + 0.25 * sin(uTime * 0.7 + id));
  }
  float d = length(vW - uEye); col = mix(col, uFogC, 1.0 - exp(-d * uFogD));
  o = vec4(col * uExpo, 1.0);
}`;
const CUBE_IN = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aNrm;`;
const STATIC_V = `${CUBE_IN}
layout(location=2) in vec3 iPos; layout(location=3) in vec3 iScale; layout(location=4) in vec3 iBody; layout(location=5) in vec4 iEmit; layout(location=6) in float iGroup; layout(location=7) in vec4 iQ;
uniform mat4 uVP; uniform float uTime, uBroken, uTangle, uGates, uTrace, uPillars, uCore, uGap;
out vec3 vN, vL, vW, vBody, vEmit; out float vEI, vKind; out vec4 vInfo;
${LIB}
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
void main(){
  int g = int(iGroup + 0.5);
  vec3 scale = iScale, pos = iPos, emit = iEmit.rgb; float ei = iEmit.a; vKind = 0.0; vInfo = vec4(0.0);
  if (g == 1) {
    // the model: amber while it guesses, ice blue once the gates are lit
    emit = mix(vec3(0.57, 0.86, 1.0), emit, uBroken); ei *= 0.75 + 0.25 * sin(uTime * 1.3);
  } else if (g == 2) {
    // the haystack shivers while the world is broken, then comes apart and drifts up into the dark
    float seed = iQ.x;
    pos.x += sin(uTime * (2.0 + seed * 3.0) + seed * 40.0) * 0.06 * uBroken;
    float gone = 1.0 - uTangle, lift = gone * (6.0 + seed * 26.0) * (0.4 + iQ.w);
    pos += vec3((iQ.y - 0.5) * 18.0, lift, (iQ.z - 0.5) * 18.0) * gone;
    scale *= clamp(1.0 - gone * (0.6 + seed * 0.8), 0.0, 1.0);
    ei *= 1.0 + 0.6 * uBroken * step(0.92, fract(sin(floor(uTime * 6.0) + seed * 97.0) * 437.5));
  } else if (g == 3) {
    // a gate lights from its first lamp round to the last, in order, find then describe then run
    float on = sm(iQ.x * 0.22, iQ.x * 0.22 + 0.4, uGates);
    ei *= 0.08 + on * (0.92 + 0.25 * sin(uTime * 3.0 - iQ.y * 18.0));
  } else if (g == 4) {
    ei *= uGates * (0.85 + 0.15 * sin(uTime * 5.0));
  } else if (g == 5 || g == 6) {
    vKind = 1.0; vInfo = vec4(iQ.x, iQ.y, iQ.z, 0.0);
    if (g == 6) { ei *= 0.4 + 1.6 * uTrace; vInfo.z = uTrace; if (iQ.z > 1.5) { vKind = 0.0; ei = iEmit.a * uTrace; scale *= uTrace; } }
  } else if (g == 7) {
    // the hash seal: a ring that turns over the answer's tower once the thread has reached it
    float a = iQ.x * 6.2832 + uTime * 0.8;
    pos += vec3(cos(a), sin(uTime * 2.0 + iQ.x * 12.0) * 0.08, sin(a)) * iQ.y * uTrace;
    scale *= uTrace; ei *= uTrace;
  } else if (g == 8) {
    // pillars rise one after another; their tops stop where each part of the vision stands today
    float up = sm(iQ.x * 0.16, iQ.x * 0.16 + 0.5, uPillars), built = iQ.y;
    if (iQ.z > 0.5) { pos.y *= up; ei *= up; }
    else { scale.y *= up * built; pos.y = scale.y * 0.5; ei *= up; }
  } else if (g == 9) {
    // the core: scattered tools fall into orbit, one ring per pack
    if (iQ.w < -1.5) { scale *= uCore; ei *= uCore; }
    else if (iQ.w < -0.5) { scale *= 0.4 + 0.6 * uCore; ei *= 0.4 + 0.6 * uCore; pos += vec3(0.0, sin(uTime) * 0.08, 0.0); }
    else {
      float th = iQ.z + uTime * iQ.w, ph = iQ.y, r = iQ.x * (1.0 + 0.03 * sin(uTime * 1.4 + iQ.z * 3.0));
      vec3 orbit = vec3(${CORE[0].toFixed(1)}, ${CORE[1].toFixed(1)}, ${CORE[2].toFixed(1)}) + rotX(0.35) * vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)) * r;
      pos = mix(pos + vec3(0.0, sin(uTime * 0.5 + iQ.z) * 0.4, 0.0), orbit, sm(0.0, 1.0, uCore));
    }
  } else if (g == 10) {
    // benchmark towers: each grows in turn, a block per kind of question
    float up = sm(iQ.x * 0.12, iQ.x * 0.12 + 0.55, uGap);
    float top = pos.y + scale.y * 0.5;
    pos.y *= up; scale.y *= up; ei *= up;
    if (abs(iQ.z) < 0.001) ei *= 0.75 + 0.25 * sin(uTime * 5.0 + iQ.y);
  }
  vec3 w = pos + aP * scale;
  vW = w; vN = aNrm; vL = aP; vBody = iBody; vEmit = emit; vEI = ei;
  gl_Position = uVP * vec4(w, 1.0);
}`;
// The rain: numbers drawn from a glyph atlas, falling from the model. One instance per character; every
// character of a number shares its number's fall, so a whole figure drops and lands together.
const GLYPH_V = `#version 300 es
layout(location=0) in vec2 aQ; layout(location=1) in vec4 iG;
uniform mat4 uVP, uView; uniform float uTime, uRain, uBroken, uWrong, uCount;
out vec2 vUV; out vec3 vCol; out float vA;
${LIB}
void main(){
  float id = iG.x, slot = iG.y, ch = iG.z, len = iG.w;
  float h1 = hash(vec2(id, 1.3)), h2 = hash(vec2(id, 7.1)), h3 = hash(vec2(id, 3.7));
  float cycle = 9.0 + h3 * 5.0, t = mod(uTime + h1 * cycle, cycle);
  float fall = clamp(t / 3.4, 0.0, 1.0), rest = clamp((t - 3.4) / (cycle - 3.4), 0.0, 1.0);
  // each figure leaves the face of the model at its own height and drifts down and out to the floor
  vec3 from = vec3(-125.0 + (h2 - 0.5) * 14.0, 7.0 + h1 * 21.0, -27.5 - h3 * 1.5);
  vec3 land = vec3(-140.0 + h1 * 30.0, 0.05, -24.0 + h2 * 32.0);
  float e = 1.0 - pow(1.0 - fall, 1.6) * (1.0 - fall * 0.4);
  vec3 p = mix(from, land, e);
  p.y = mix(from.y, land.y, fall * fall) + (1.0 - fall) * sin(fall * 3.14159) * 1.5;
  bool wrong = (id + 0.5) / uCount < uWrong;
  vec3 col = vec3(0.92, 0.95, 1.0);
  float landed = step(0.999, fall);
  vec3 judged = wrong ? vec3(1.0, 0.27, 0.22) : vec3(0.92, 0.95, 1.0);
  vec3 healed = vec3(0.57, 0.86, 1.0);
  col = mix(col, judged, landed) ;
  col = mix(healed, col, uBroken);
  float a = uRain * (1.0 - rest * rest) * smoothstep(0.0, 0.08, t);
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]), up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  // a landed figure lies flat on the floor, the way a wrong answer sits in a report
  vec3 flatR = vec3(1.0, 0.0, 0.0), flatU = vec3(0.0, 0.0, -1.0);
  vec3 R = normalize(mix(right, flatR, landed)), U = normalize(mix(up, flatU, landed));
  float size = 0.62 + h3 * 0.4;
  vec3 w = p + R * ((slot - len * 0.5) * size * 0.62 + aQ.x * size * 0.62) + U * (aQ.y * size);
  vUV = vec2((ch + aQ.x + 0.5) / 16.0, 0.5 - aQ.y); vCol = col; vA = a;
  gl_Position = uVP * vec4(w, 1.0);
}`;
const GLYPH_F = `#version 300 es
precision highp float; in vec2 vUV; in vec3 vCol; in float vA; out vec4 o; uniform sampler2D uAtlas; uniform float uExpo;
void main(){ float m = texture(uAtlas, vUV).a; o = vec4(vCol * m * vA * 1.6 * uExpo, 1.0); }`;
const FLOOR_V = `#version 300 es
layout(location=0) in vec2 aQ; uniform mat4 uVP; out vec3 vW;
void main(){ vW = vec3(aQ.x * 900.0 + 20.0, 0.0, aQ.y * 900.0); gl_Position = uVP * vec4(vW, 1.0); }`;
const FLOOR_F = `#version 300 es
precision highp float; in vec3 vW; out vec4 o; uniform vec3 uEye, uFogC; uniform float uFogD, uExpo, uReflK, uBroken, uGates, uRain; uniform sampler2D uRefl; uniform vec2 uRes;${LIB}
float grid(vec2 p, float s){ vec2 g = abs(fract(p / s - 0.5) - 0.5) / fwidth(p / s); return 1.0 - min(min(g.x, g.y), 1.0); }
void main(){
  vec3 col = vec3(0.02, 0.024, 0.032);
  col += vec3(0.12, 0.18, 0.3) * grid(vW.xz, 2.25) * 0.16 + vec3(0.2, 0.32, 0.55) * grid(vW.xz, 22.5) * 0.14;
  col += vec3(0.3, 0.5, 0.9) * exp(-abs(vW.z) * 0.8) * 0.07;
  col += vec3(0.57, 0.86, 1.0) * exp(-length(vW.xz - vec2(-36.0, 0.0)) * 0.22) * 0.3 * uGates;
  col += vec3(1.0, 0.3, 0.2) * exp(-length((vW.xz - vec2(-126.0, -8.0)) * vec2(0.08, 0.06))) * 0.12 * uBroken * uRain;
  if (uReflK > 0.0) {
    vec2 suv = gl_FragCoord.xy / uRes, off = (vec2(noise(vW.xz * 1.7), noise(vW.xz * 1.7 + 9.0)) - 0.5) * 0.014;
    vec3 r = texture(uRefl, suv + off).rgb * 0.4 + (texture(uRefl, suv + off + vec2(0.003, 0.0)).rgb + texture(uRefl, suv + off - vec2(0.003, 0.0)).rgb + texture(uRefl, suv + off + vec2(0.0, 0.005)).rgb) * 0.2;
    float wet = mix(0.45, 1.0, smoothstep(0.35, 0.7, noise(vW.xz * 0.1 + 3.0)));
    float fres = 0.18 + 0.75 * pow(1.0 - abs(normalize(uEye - vW).y), 4.0);
    col += r * fres * wet * uReflK;
  }
  float d = length(vW - uEye); col = mix(col, uFogC, 1.0 - exp(-d * uFogD));
  o = vec4(col * uExpo, 1.0);
}`;
const SKY_F = `#version 300 es
precision highp float; out vec4 o; uniform vec2 uRes; uniform float uTime, uHigh, uBroken, uDawn; uniform vec3 uFogC;${LIB}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = mix(uFogC * 1.3, vec3(0.008, 0.01, 0.018), smoothstep(0.2, 1.0, uv.y));
  // a faint aurora over the market, in the brand's ice blue
  float band = sin(uv.x * 3.0 + uTime * 0.05 + noise(uv * vec2(3.0, 1.0) + uTime * 0.02) * 2.0) * 0.5 + 0.5;
  col += vec3(0.25, 0.45, 0.6) * band * 0.035 * smoothstep(0.45, 0.95, uv.y) * (1.0 - uHigh * 0.5) * (1.0 - uBroken * 0.6);
  col += vec3(0.18, 0.04, 0.03) * smoothstep(0.7, 0.1, uv.y) * uBroken * (0.75 + 0.25 * sin(uTime * 2.1));
  vec3 dawn = mix(vec3(1.0, 0.58, 0.38), vec3(0.14, 0.2, 0.42), smoothstep(0.7, 1.0, uv.y));
  dawn += vec3(1.0, 0.8, 0.58) * exp(-length((uv - vec2(0.78, 0.78)) * vec2(uRes.x / uRes.y, 1.0)) * 5.0) * 1.1;
  col = mix(col, dawn * 0.6, uDawn);
  o = vec4(col, 1.0);
}`;
// Light: lamps, stars, drifting dust, the tokens the haystack spills, the thread to the answer, beam pulses.
// meta: size, group, strength. group 20 dust · 21 tokens · 22 thread · 23 stars · 24 beam pulses
const LAMP_V = `#version 300 es
layout(location=0) in vec2 aQ; layout(location=1) in vec3 iPos; layout(location=2) in vec3 iCol; layout(location=3) in vec3 iMeta;
uniform mat4 uVP, uView; uniform float uTime, uBroken, uTangle, uGates, uTrace, uPillars, uCore, uGap, uRain, uFogD; uniform vec3 uEye, uCamVel;
out vec2 vQ; out vec3 vCol;
${LIB}
void main(){
  int g = int(iMeta.y + 0.5);
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]), up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  vec3 p = iPos, col = iCol; float k = 1.0, size = iMeta.x;
  if (g == 1) k = 0.6 + 0.4 * uBroken;
  else if (g == 2) k = uTangle;
  else if (g == 3) k = uGates;
  else if (g == 6) k = 0.3 + 0.7 * uTrace;
  else if (g == 8) k = uPillars * uPillars * uPillars;
  else if (g == 9) k = uCore;
  else if (g == 10) k = uGap;
  else if (g == 20) { p += vec3(sin(uTime * 0.07 + iPos.y * 3.0) * 1.5, mod(iPos.y + uTime * 0.12, 14.0) - iPos.y, cos(uTime * 0.05 + iPos.x) * 1.2); }
  else if (g == 21) {
    // tokens pour out of the haystack and spread across the floor toward the reader
    float s = iPos.x, t = fract(uTime * (0.05 + s * 0.04) + iPos.z);
    vec3 a = vec3(-76.0 + (iPos.y - 0.5) * 5.0, 10.0 + s * 9.0, -13.0), b = vec3(-92.0 + iPos.y * 34.0, 0.1, 6.0 + s * 14.0);
    p = mix(a, b, t) + vec3(0.0, sin(t * 3.14159) * 3.0, 0.0);
    k = uTangle * uBroken * (1.0 - t * t);
  } else if (g == 22) {
    // the thread: from the last gate, up and over the city, down to the page in the answer's tower
    float s = iPos.x;
    vec3 a = vec3(-29.0, 3.4, 0.0), c1 = vec3(-8.0, 26.0, -4.0), c2 = vec3(16.0, 26.0, -26.0), b = vec3(18.4, 13.9, -24.7);
    float u = 1.0 - s;
    p = u * u * u * a + 3.0 * u * u * s * c1 + 3.0 * u * s * s * c2 + s * s * s * b;
    float drawn = step(s, uTrace * 1.02), pulse = exp(-pow((fract(uTime * 0.35) - s) * 18.0, 2.0));
    k = drawn * (0.55 + 1.8 * pulse);
  } else if (g == 23) { k = 0.6 + 0.4 * sin(uTime * (0.5 + iPos.x * 0.01) + iPos.z); }
  else if (g == 24) {
    float t = fract(uTime * 0.22 + iPos.x);
    p = vec3(-53.0 + t * 44.0, 3.4, 0.0); k = uGates * sin(t * 3.14159);
  }
  vec3 w = p + (right * aQ.x + up * aQ.y) * size;
  if (g == 20) w -= uCamVel * (aQ.y + 0.5) * 3.0;
  float d = length(p - uEye); vCol = col * iMeta.z * k * exp(-d * uFogD * (g == 23 ? 0.0 : 0.7)); vQ = aQ;
  gl_Position = uVP * vec4(w, 1.0);
}`;
const LAMP_F = `#version 300 es
precision highp float; in vec2 vQ; in vec3 vCol; out vec4 o; uniform float uExpo;
void main(){ float r = length(vQ) * 2.0; float a = exp(-r * r * 4.0) + exp(-r * 9.0) * 0.6; o = vec4(vCol * a * (1.0 - smoothstep(0.85, 1.0, r)) * uExpo, 1.0); }`;
const POST_V = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const BRIGHT_F = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uTexel; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy * uTexel; vec3 c = vec3(0.0);
  for (int k = 0; k < 4; k++) { vec2 off = vec2(float(k & 1), float(k >> 1)) - 0.5; c += texture(uTex, uv + off * uTexel * 0.5).rgb; }
  c *= 0.25; float l = max(c.r, max(c.g, c.b)); o = vec4(c * smoothstep(0.32, 0.9, l), 1.0); }`;
const BLUR_F = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uDir; uniform vec2 uRes; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy / uRes; vec3 c = texture(uTex, uv).rgb * 0.227;
  c += (texture(uTex, uv + uDir * 1.385).rgb + texture(uTex, uv - uDir * 1.385).rgb) * 0.316;
  c += (texture(uTex, uv + uDir * 3.231).rgb + texture(uTex, uv - uDir * 3.231).rgb) * 0.07; o = vec4(c, 1.0); }`;
const DOWN_F = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uTexel; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy * uTexel; vec3 c = vec3(0.0);
  for (int k = 0; k < 4; k++) { vec2 off = vec2(float(k & 1), float(k >> 1)) - 0.5; c += texture(uTex, uv + off * uTexel * 0.5).rgb; }
  o = vec4(c * 0.25, 1.0); }`;
const COMP_F = `#version 300 es
precision highp float; uniform sampler2D uScene, uB1, uB2, uSoft, uDepth; uniform vec2 uRes; uniform float uTime, uFocus, uDof, uTravel, uBroken, uDawn; out vec4 o;${LIB}
float lin(float z){ float n = 0.1, f = 1400.0; z = z * 2.0 - 1.0; return 2.0 * n * f / (f + n - z * (f - n)); }
vec3 aces(vec3 x){ return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 cc = uv - 0.5; float ca = 0.0012 + uTravel * 0.005;
  vec3 sc = vec3(texture(uScene, uv - cc * ca).r, texture(uScene, uv).g, texture(uScene, uv + cc * ca).b);
  if (uTravel > 0.01) { vec3 acc = sc; for (int k = 1; k < 7; k++) acc += texture(uScene, uv - cc * uTravel * 0.045 * float(k) / 6.0).rgb; sc = acc / 7.0; }
  float dist = lin(texture(uDepth, uv).r), coc = clamp(abs(dist - uFocus) / max(dist, 1.0) * 0.8, 0.0, 1.0) * uDof;
  sc = mix(sc, texture(uSoft, uv).rgb, smoothstep(0.0, 1.0, coc));
  vec3 c = sc + texture(uB1, uv).rgb * 0.75 + texture(uB2, uv).rgb * 0.95;
  c = aces(c * 1.15);
  c = mix(c, c * vec3(0.92, 0.98, 1.08), 0.5 * (1.0 - uBroken));
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, mix(vec3(lum), c, 0.55) * vec3(1.12, 0.92, 0.84), uBroken * 0.7);
  c = mix(c, c * vec3(1.1, 1.0, 0.9) + vec3(0.025, 0.014, 0.0), uDawn * 0.8);
  vec2 v = uv - 0.5; c *= 1.0 - dot(v, v) * (0.85 + uBroken * 0.3);
  c += (hash(gl_FragCoord.xy + fract(uTime * 13.0) * 100.0) - 0.5) * (0.035 + uBroken * 0.02);
  o = vec4(pow(c, vec3(0.95)), 1.0);
}`;

// ---------- a little matrix arithmetic (column-major, as WebGL reads it) ----------
function perspective(fovy, aspect, near, far) { const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]); }
function lookAt(e, c) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = zz, xz = -zx; l = Math.hypot(xx, xz) || 1; xx /= l; xz /= l; const xy = 0;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
}
const mul = (a, b) => { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; };
const lerp = (a, b, t) => a + (b - a) * t;
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len3 = (a) => Math.hypot(a[0], a[1], a[2]);
function curve(k, i, t) { // k: 0 eye, 1 look; segment i → i+1 of the shot list
  const P = (j) => SHOTS[Math.max(0, Math.min(SHOTS.length - 1, j))][k];
  const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), d = len3(sub3(p2, p1));
  const tan = (a, b, near) => { const m = sub3(b, a).map((v) => v * 0.5), l = len3(m), cap = Math.min(d, near) * 0.9; return l > cap && l > 0 ? m.map((v) => (v * cap) / l) : m; };
  const m1 = tan(p0, p2, len3(sub3(p1, p0)) || d), m2 = tan(p1, p3, len3(sub3(p3, p2)) || d);
  const t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  return [0, 1, 2].map((c) => h00 * p1[c] + h10 * m1[c] + h01 * p2[c] + h11 * m2[c]);
}
function cube() { // 36 vertices: position (−0.5…0.5) and normal
  const out = [], corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (let axis = 0; axis < 3; axis++) for (const s of [-1, 1]) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (const [cu, cv] of corners) { const p = [0, 0, 0], n = [0, 0, 0]; p[axis] = s * 0.5; p[u] = cu * 0.5; p[v] = cv * 0.5; n[axis] = s; out.push(...p, ...n); }
  }
  return new Float32Array(out);
}
// The glyph atlas: sixteen characters drawn once into a canvas, white on transparent.
const GLYPHS = "0123456789.,$%BM";
function atlas() {
  const c = document.createElement("canvas"); c.width = 16 * 64; c.height = 96;
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
  x.font = '500 72px "IBM Plex Mono", ui-monospace, monospace';
  [...GLYPHS].forEach((g, i) => x.fillText(g, i * 64 + 32, 50));
  return c;
}
// The numbers: the shape of figures a model states about a company, made up here for the picture.
function figures(count) {
  const r = rng(29), out = [];
  for (let i = 0; i < count; i++) {
    const kind = r(); let s;
    if (kind < 0.3) s = `$${(1 + r() * 400).toFixed(1)}B`;
    else if (kind < 0.55) s = `${(r() * 40).toFixed(1)}%`;
    else if (kind < 0.8) s = fmt.format(Math.round(1000 + r() * 90000));
    else s = `${(r() * 12).toFixed(2)}`;
    out.push(s);
  }
  return out;
}

function start() {
  const canvas = document.createElement("canvas");
  canvas.id = "film"; canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, powerPreference: "high-performance" });
  if (!gl) { root.classList.add("no-webgl"); return; }
  const compile = (vs, fs) => { const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "compile"); gl.attachShader(p, s); }
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u }; };
  const P = { stat: compile(STATIC_V, BOX_FRAG), glyph: compile(GLYPH_V, GLYPH_F), floor: compile(FLOOR_V, FLOOR_F), sky: compile(POST_V, SKY_F), lamp: compile(LAMP_V, LAMP_F),
    bright: compile(POST_V, BRIGHT_F), blur: compile(POST_V, BLUR_F), down: compile(POST_V, DOWN_F), comp: compile(POST_V, COMP_F) };

  const attrib = (loc, size, divisor = 0, stride = 0, offset = 0) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset); gl.vertexAttribDivisor(loc, divisor); };
  const buf = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
  const cubeData = cube(), quad = new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);
  // boxes
  const vStat = gl.createVertexArray(); gl.bindVertexArray(vStat);
  buf(cubeData); attrib(0, 3, 0, 24, 0); attrib(1, 3, 0, 24, 12);
  buf(new Float32Array(boxes.flat())); const SB = 18 * 4;
  attrib(2, 3, 1, SB, 0); attrib(3, 3, 1, SB, 12); attrib(4, 3, 1, SB, 24); attrib(5, 4, 1, SB, 36); attrib(6, 1, 1, SB, 52); attrib(7, 4, 1, SB, 56);
  // the rain: one instance per character
  const given = Math.max(1, DATA.rain.given || 84), figs = figures(given), glyphs = [];
  figs.forEach((s, id) => [...s].forEach((ch, slot) => glyphs.push([id, slot, Math.max(0, GLYPHS.indexOf(ch)), s.length])));
  const vGlyph = gl.createVertexArray(); gl.bindVertexArray(vGlyph);
  buf(quad); attrib(0, 2); buf(new Float32Array(glyphs.flat())); attrib(1, 4, 1, 16, 0);
  const atlasTex = gl.createTexture();
  const upload = () => { gl.bindTexture(gl.TEXTURE_2D, atlasTex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas()); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); };
  upload(); document.fonts?.ready.then(upload);
  // floor
  const vFloor = gl.createVertexArray(); gl.bindVertexArray(vFloor); buf(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])); attrib(0, 2);
  // light: lamps, dust, tokens, the thread, stars and beam pulses
  const lr = rng(5), extra = [];
  for (let k = 0; k < (small ? 500 : 1200); k++) extra.push([-170 + lr() * 360, lr() * 14, -40 + lr() * 60, 0.6, 0.7, 0.9, 0.05 + lr() * 0.06, 20, 0.35]);
  for (let k = 0; k < (small ? 500 : 1400); k++) extra.push([lr(), lr(), lr(), 1.0, 0.66, 0.3, 0.1 + lr() * 0.12, 21, 0.9]);
  for (let k = 0; k < 220; k++) extra.push([k / 219, 0, 0, 0.57, 0.86, 1.0, 0.16, 22, 1.0]);
  for (let k = 0; k < 700; k++) { const a = lr() * 6.283, el = 0.05 + lr() * 1.2, d = 700; extra.push([Math.cos(a) * Math.cos(el) * d + 20, Math.sin(el) * d * 0.6 + 20, Math.sin(a) * Math.cos(el) * d - 100, 0.8, 0.88, 1.0, 1.2 + lr() * 2.4, 23, 0.4 + lr() * 0.6]); }
  for (let k = 0; k < 14; k++) extra.push([k / 14, 0, 0, 0.57, 0.86, 1.0, 0.7, 24, 1.4]);
  const lampData = new Float32Array([...lamps, ...extra].flat()), LAMPS = lamps.length + extra.length;
  const vLamp = gl.createVertexArray(); gl.bindVertexArray(vLamp);
  buf(quad); attrib(0, 2); buf(lampData); attrib(1, 3, 1, 36, 0); attrib(2, 3, 1, 36, 12); attrib(3, 3, 1, 36, 24);
  gl.bindVertexArray(null);

  // render targets: the scene (multisampled when the device can), the mirror, two levels of bloom, a soft copy
  const samples = small ? 0 : Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
  const HDR = !!gl.getExtension("EXT_color_buffer_float");
  const tex = (w, h) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, HDR ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, HDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; };
  const target = (w, h) => { const t = tex(w, h), f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f, w, h }; };
  const depthTex = (w, h) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; };
  const MIRROR = !small;
  let T = null;
  const build = (W, H) => {
    if (T) { for (const x of [T.scene, T.b1, T.b1b, T.b2, T.b2b, T.d1, T.d1b, ...(T.refl ? [T.refl] : [])]) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); } gl.deleteTexture(T.depthT);
      if (T.msFbo) { gl.deleteRenderbuffer(T.msColor); gl.deleteRenderbuffer(T.msDepth); gl.deleteFramebuffer(T.msFbo); } if (T.reflDepth) gl.deleteRenderbuffer(T.reflDepth); }
    const scene = target(W, H), depthT = depthTex(W, H); let msFbo = null, msColor = null, msDepth = null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthT, 0);
    if (samples > 0) {
      msColor = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, msColor); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, HDR ? gl.RGBA16F : gl.RGBA8, W, H);
      msDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, msDepth); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H);
      msFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColor); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepth);
    }
    const q = (d) => [Math.max(1, Math.round(W / d)), Math.max(1, Math.round(H / d))];
    let refl = null, reflDepth = null;
    if (MIRROR) { refl = target(...q(2)); reflDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, reflDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, refl.w, refl.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, refl.f); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, reflDepth); }
    T = { scene, depthT, msFbo, msColor, msDepth, W, H, refl, reflDepth, b1: target(...q(4)), b1b: target(...q(4)), b2: target(...q(10)), b2b: target(...q(10)), d1: target(...q(3)), d1b: target(...q(3)) };
  };

  document.body.prepend(canvas);
  // captions: what each thing is, pinned to it while its chapter is on screen
  const capLayer = document.createElement("div"); capLayer.className = "film-captions"; capLayer.setAttribute("aria-hidden", "true");
  const caps = captions.map(([pos, title, sub, chs, tone]) => { const el = document.createElement("div"); el.className = `cap${tone ? " " + tone : ""}`;
    const b = document.createElement("b"); b.textContent = title; el.append(b); if (sub) { const sp = document.createElement("span"); sp.textContent = sub; el.append(sp); }
    capLayer.append(el); return { el, pos, chs, shown: -1 }; });
  // the colour key: what each colour means, only while it matters
  const KEY = [["white", "A number a model gave", 0.6, 1.6], ["red", "Wrong, checked against the filing", 0.6, 2.6], ["amber", "A tool in one long list", 1.6, 2.6], ["ice", "Read from the source", 2.6, 4.6], ["red", "Never answered correctly", 6.6, 7.6]];
  const legend = document.createElement("div"); legend.className = "film-legend"; legend.setAttribute("aria-hidden", "true");
  const keys = KEY.map(([tone, text, from, to]) => { const row = document.createElement("div"); row.className = `key ${tone}`; const dot = document.createElement("i"); const label = document.createElement("span"); label.textContent = text; row.append(dot, label); legend.append(row); return { row, from, to, on: null }; });
  if (cinema) document.body.append(capLayer, legend);

  const story = () => { const { i, p } = scrollState(); return i === 0 ? smooth(0.2, 1, p) * 0.35 : i - 1 + smooth(0, 0.62, p) + (i === 1 ? 0.35 * (1 - smooth(0, 0.62, p)) : 0); };
  let goalS = story(), current = goalS, vel = 0, raf = 0, shown = !document.hidden, px = 0, py = 0, last = performance.now(), aspect = 1, prevEye = null;
  const pointer = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; kick(); }, { passive: true });
  const t0 = performance.now();
  const use = (prog) => { gl.useProgram(prog.p); return prog.u; };

  function frame(now) {
    raf = 0;
    const rawDt = (now - last) / 1000, dt = Math.min(0.1, Math.max(0, rawDt)); last = now; adapt(rawDt);
    const t = reduced ? 3 : (now - t0) / 1000;
    if (reduced) { current = goalS; vel = 0; } else { const w = 3.2, acc = -2 * w * vel - w * w * (current - goalS); vel += acc * dt; current += vel * dt; }
    const s = clamp(current, 0, SHOTS.length - 1.0001), i = Math.floor(s), f = smooth(0, 1, s - i), A = SHOTS[i], B = SHOTS[i + 1];
    let eye = curve(0, i, f), look = curve(1, i, f); eye[1] = Math.max(0.9, eye[1]);
    if (!reduced) { px += (pointer.x - px) * 0.04; py += (pointer.y - py) * 0.04; eye = [eye[0] + px * 1.4 + Math.sin(t * 0.21) * 0.12, eye[1] - py * 0.8 + Math.sin(t * 0.33) * 0.06, eye[2] + Math.cos(t * 0.17) * 0.12]; }
    const camVel = prevEye ? [eye[0] - prevEye[0], eye[1] - prevEye[1], eye[2] - prevEye[2]] : [0, 0, 0]; prevEye = eye;
    const travel = clamp(Math.hypot(...camVel) * 3); root.style.setProperty("--travel", travel.toFixed(3));
    const st = (k) => lerp(A[k], B[k], f);
    const rain = st(2), tangle = st(3), gates = st(4), trace = st(5), pillars = st(6), core = st(7), gap = st(8), dawn = st(9), fogD = st(10), expo = st(11);
    const broken = 1 - smooth(2.35, 3.2, s);
    // compose for the words: on wide screens they sit on the left, so the subject moves into the right two-thirds
    const fwd = [look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]], fl = Math.hypot(...fwd), rx = -fwd[2] / fl, rz = fwd[0] / fl, shift = small ? 0 : fl * 0.2;
    const lookC = [look[0] - rx * shift, look[1] - (small ? fl * 0.22 : 0), look[2] - rz * shift];
    const view = lookAt(eye, lookC), proj = perspective(small ? 0.98 : 0.66, aspect, 0.1, 1400), vp = mul(proj, view);
    const high = smooth(30, 80, eye[1]);
    const night = [0.028 + 0.01 * high, 0.034 + 0.012 * high, 0.052 + 0.02 * high], ill = [0.06, 0.028, 0.026], future = [0.2, 0.15, 0.17];
    const fogC = [0, 1, 2].map((k) => lerp(lerp(night[k], ill[k], broken * 0.55), future[k], dawn));
    const intro = reduced ? 1 : smooth(0.1, 2.6, t);

    const textEdge = Math.min(innerWidth * 0.56, 860);
    if (cinema) for (const c of caps) {
      const near = Math.max(...c.chs.map((ch) => 1 - smooth(0.35, 0.75, Math.abs(s - ch))));
      const x = vp[0] * c.pos[0] + vp[4] * c.pos[1] + vp[8] * c.pos[2] + vp[12], y = vp[1] * c.pos[0] + vp[5] * c.pos[1] + vp[9] * c.pos[2] + vp[13], w = vp[3] * c.pos[0] + vp[7] * c.pos[1] + vp[11] * c.pos[2] + vp[15];
      const sx = (x / w * 0.5 + 0.5) * innerWidth, sy = (0.5 - y / w * 0.5) * innerHeight;
      const o = w > 0.5 ? near * (small ? 1 : smooth(textEdge - 30, textEdge + 50, sx)) : 0;
      if (o < 0.01) { if (c.shown !== 0) { c.el.style.opacity = "0"; c.shown = 0; } continue; }
      c.el.style.opacity = o.toFixed(3); c.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`; c.shown = 1;
    }
    if (cinema) for (const k of keys) { const on = s >= k.from && s <= k.to; if (on !== k.on) { k.row.classList.toggle("on", on); k.on = on; } }

    const mirrorM = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const state = (uu) => { for (const [name, v] of [["uTime", t], ["uBroken", broken], ["uTangle", tangle], ["uGates", gates], ["uTrace", trace], ["uPillars", pillars], ["uCore", core], ["uGap", gap], ["uRain", rain]]) if (uu[name]) gl.uniform1f(uu[name], v); };
    const drawWorld = (VP, VIEW, clip) => {
      const set = (uu) => { gl.uniformMatrix4fv(uu.uVP, false, VP); if (uu.uEye) gl.uniform3fv(uu.uEye, eye); if (uu.uFogC) gl.uniform3fv(uu.uFogC, fogC); if (uu.uFogD) gl.uniform1f(uu.uFogD, fogD); if (uu.uExpo) gl.uniform1f(uu.uExpo, expo * intro); if (uu.uClip) gl.uniform1f(uu.uClip, clip); state(uu); };
      let uu = use(P.stat); set(uu); gl.bindVertexArray(vStat); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, boxes.length);
      gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      uu = use(P.lamp); set(uu); gl.uniformMatrix4fv(uu.uView, false, VIEW); gl.uniform3fv(uu.uCamVel, camVel); gl.bindVertexArray(vLamp); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, LAMPS);
      if (rain > 0.01) { uu = use(P.glyph); set(uu); gl.uniformMatrix4fv(uu.uView, false, VIEW); gl.uniform1f(uu.uWrong, DATA.rain.wrong ?? 0.96); gl.uniform1f(uu.uCount, given);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex); gl.uniform1i(uu.uAtlas, 0); gl.bindVertexArray(vGlyph); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, glyphs.length); }
      gl.disable(gl.BLEND); gl.depthMask(true);
    };
    if (T.refl) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.refl.f); gl.viewport(0, 0, T.refl.w, T.refl.h);
      gl.clearColor(fogC[0] * expo, fogC[1] * expo, fogC[2] * expo, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); drawWorld(mul(vp, mirrorM), mul(view, mirrorM), 0.01); gl.disable(gl.DEPTH_TEST);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.msFbo || T.scene.f); gl.viewport(0, 0, T.W, T.H);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(false);
    let u = use(P.sky); gl.uniform2f(u.uRes, T.W, T.H); gl.uniform1f(u.uTime, t); gl.uniform1f(u.uHigh, high); gl.uniform3fv(u.uFogC, fogC.map((v) => v * intro)); gl.uniform1f(u.uBroken, broken * intro); gl.uniform1f(u.uDawn, dawn); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    u = use(P.floor); gl.uniformMatrix4fv(u.uVP, false, vp); gl.uniform3fv(u.uEye, eye); gl.uniform3fv(u.uFogC, fogC); gl.uniform1f(u.uFogD, fogD); gl.uniform1f(u.uExpo, expo * intro);
    gl.uniform1f(u.uReflK, T.refl ? 1 : 0); gl.uniform2f(u.uRes, T.W, T.H); gl.uniform1f(u.uBroken, broken); gl.uniform1f(u.uGates, gates); gl.uniform1f(u.uRain, rain);
    if (T.refl) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.refl.t); gl.uniform1i(u.uRefl, 0); }
    gl.bindVertexArray(vFloor); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    drawWorld(vp, view, -100);
    gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(null);
    if (T.msFbo) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.msFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.scene.f);
      gl.blitFramebuffer(0, 0, T.W, T.H, 0, 0, T.W, T.H, gl.COLOR_BUFFER_BIT, gl.NEAREST); gl.blitFramebuffer(0, 0, T.W, T.H, 0, 0, T.W, T.H, gl.DEPTH_BUFFER_BIT, gl.NEAREST); }
    const pass = (prog, dst, src, setup) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, dst.w, dst.h); const uu = use(prog); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t); gl.uniform1i(uu.uTex, 0); setup(uu); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    pass(P.bright, T.b1, T.scene, (uu) => gl.uniform2f(uu.uTexel, 1 / T.b1.w, 1 / T.b1.h));
    pass(P.blur, T.b1b, T.b1, (uu) => { gl.uniform2f(uu.uDir, 1 / T.b1.w, 0); gl.uniform2f(uu.uRes, T.b1.w, T.b1.h); });
    pass(P.blur, T.b1, T.b1b, (uu) => { gl.uniform2f(uu.uDir, 0, 1 / T.b1.h); gl.uniform2f(uu.uRes, T.b1.w, T.b1.h); });
    pass(P.blur, T.b2, T.b1, (uu) => { gl.uniform2f(uu.uDir, 1.6 / T.b2.w, 0); gl.uniform2f(uu.uRes, T.b2.w, T.b2.h); });
    pass(P.blur, T.b2b, T.b2, (uu) => { gl.uniform2f(uu.uDir, 0, 1.6 / T.b2.h); gl.uniform2f(uu.uRes, T.b2.w, T.b2.h); });
    pass(P.down, T.d1, T.scene, (uu) => gl.uniform2f(uu.uTexel, 1 / T.d1.w, 1 / T.d1.h));
    pass(P.blur, T.d1b, T.d1, (uu) => { gl.uniform2f(uu.uDir, 1.4 / T.d1.w, 0); gl.uniform2f(uu.uRes, T.d1.w, T.d1.h); });
    pass(P.blur, T.d1, T.d1b, (uu) => { gl.uniform2f(uu.uDir, 0, 1.4 / T.d1.h); gl.uniform2f(uu.uRes, T.d1.w, T.d1.h); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    u = use(P.comp);
    [[T.scene, "uScene"], [T.b1, "uB1"], [T.b2b, "uB2"], [T.d1, "uSoft"]].forEach(([x, name], k) => { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, x.t); gl.uniform1i(u[name], k); });
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, T.depthT); gl.uniform1i(u.uDepth, 4); gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(u.uFocus, Math.hypot(look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]));
    gl.uniform1f(u.uDof, reduced ? 0.4 : Math.min(1, 0.6 * (1 - high) * (1 + travel * 1.8)));
    gl.uniform1f(u.uTravel, travel); gl.uniform1f(u.uBroken, broken); gl.uniform1f(u.uDawn, dawn);
    gl.uniform2f(u.uRes, canvas.width, canvas.height); gl.uniform1f(u.uTime, t); gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduced) kick();
  }
  function kick() { if (!raf && shown) raf = requestAnimationFrame(frame); }
  const onScroll = () => { goalS = story(); kick(); };
  // resolution follows the machine: it rises on a fast GPU and falls on a slow one, in coarse steps
  const STEPS = [0.75, 1, 1.25, 1.5, 1.75, 2].filter((v) => v <= Math.max(1, devicePixelRatio)); let q = STEPS.indexOf(1.25) >= 0 ? STEPS.indexOf(1.25) : STEPS.length - 1, ema = 1 / 60, frames = 0;
  const adapt = (dt) => { if (reduced || dt <= 0) return; ema += (dt - ema) * 0.05; if (++frames < 150) return; frames = 0;
    if (ema < 1 / 70 && q < STEPS.length - 1) { q++; resize(); } else if (ema > 1 / 42 && q > 0) { q--; resize(); } };
  const resize = () => { const d = STEPS[q] ?? 1;
    canvas.width = Math.round(innerWidth * d); canvas.height = Math.round(innerHeight * d); aspect = innerWidth / Math.max(1, innerHeight);
    build(canvas.width, canvas.height); onScroll(); };
  resize();
  frame(performance.now());
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => { shown = !document.hidden; last = performance.now(); kick(); });
  canvas.addEventListener("webglcontextlost", (ev) => { ev.preventDefault(); cancelAnimationFrame(raf); root.classList.add("no-webgl"); });
  root.classList.add("film-live");
  if (location.search.includes("film-debug")) window.__filmStep = (n = 40, snap = false) => { goalS = story(); if (snap) { current = goalS; vel = 0; } for (let k = 0; k < n; k++) frame(performance.now() + k * 16); return { target: goalS, current }; };
}

// ---------- the timecode: a thin progress line, and which chapter of how many ----------
if (chapters.length && cinema) {
  const bar = document.createElement("div"); bar.className = "film-progress"; bar.setAttribute("aria-hidden", "true");
  const code = document.createElement("div"); code.className = "film-timecode"; code.setAttribute("aria-hidden", "true");
  document.body.append(bar, code);
  const names = chapters.map((c) => (c.querySelector(".kicker")?.textContent ?? "").replace(/^\s*\d+\s*/, "").trim());
  let lastCode = "";
  const tick = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty("--p", (max > 0 ? scrollY / max : 0).toFixed(4));
    const { i } = scrollState(), text = `${String(i).padStart(2, "0")} / ${String(chapters.length - 1).padStart(2, "0")} · ${names[i]}`;
    if (text !== lastCode) { code.textContent = text; lastCode = text; }
  };
  tick(); addEventListener("scroll", tick, { passive: true }); addEventListener("resize", tick);
}

// ---------- inertial scrolling: the wheel glides and settles (desktop pointer only; keys, scrollbar and touch stay native) ----------
let glideTo = null;
if (chapters.length && !reduced && matchMedia("(pointer: fine)").matches) {
  let y = scrollY, goal = scrollY, running = false;
  const max = () => document.documentElement.scrollHeight - innerHeight;
  const step = () => { y += (goal - y) * 0.085; if (Math.abs(goal - y) < 0.4) { y = goal; running = false; } scrollTo(0, y); if (running) requestAnimationFrame(step); };
  const run = () => { if (!running) { running = true; requestAnimationFrame(step); } };
  addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.target.closest?.("textarea, select, input, pre, .gap-grid, [role=region]")) return;
    e.preventDefault();
    if (!running) y = goal = scrollY;
    goal = clamp(goal + e.deltaY * (e.deltaMode === 1 ? 32 : 1), 0, max());
    run();
  }, { passive: false });
  for (const ev of ["keydown", "pointerdown", "touchstart"]) addEventListener(ev, () => { running = false; }, { passive: true });
  glideTo = (top) => { y = scrollY; goal = clamp(top, 0, max()); run(); };
  // In-page links glide too, and still land focus where a keyboard user expects it.
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.('a[href^="#"], a[href^="/#"]'); if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    const id = a.getAttribute("href").replace(/^\/?#/, ""), el = id && document.getElementById(id); if (!el) return;
    e.preventDefault(); glideTo(scrollY + el.getBoundingClientRect().top - 72); history.replaceState(null, "", `#${id}`);
    setTimeout(() => el.querySelector("a, button, input, pre")?.focus({ preventScroll: true }), 900);
  });
}

// ---------- the chapter rail: where you are in the story, and a way to jump ----------
if (chapters.length) {
  const rail = document.createElement("nav");
  rail.className = "film-rail"; rail.setAttribute("aria-label", "Chapters");
  const links = chapters.map((c) => {
    const a = document.createElement("a"); a.href = `#${c.id}`;
    const dot = document.createElement("i"), label = document.createElement("span");
    label.textContent = (c.querySelector(".kicker")?.textContent ?? "").replace(/^\s*\d+\s*/, "").trim();
    a.append(dot, label); rail.append(a);
    a.addEventListener("click", (e) => { if (!glideTo) return; e.preventDefault(); e.stopPropagation(); glideTo(scrollY + c.getBoundingClientRect().top); history.replaceState(null, "", a.href); });
    return a;
  });
  document.body.append(rail);
  let lastI = -1;
  const mark = () => { const { i } = scrollState(); if (i === lastI) return; lastI = i;
    links.forEach((a, k) => (k === i ? a.setAttribute("aria-current", "step") : a.removeAttribute("aria-current"))); };
  mark(); addEventListener("scroll", mark, { passive: true });
}

if (chapters.length && !navigator.connection?.saveData) {
  const go = () => { try { start(); } catch (err) { root.classList.add("no-webgl"); if (location.search.includes("film-debug")) console.error(String(err)); } };
  if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 1200 }); else addEventListener("load", go);
}
