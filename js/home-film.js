// The Canli Capital film: one night on Wall Street, until dawn.
//
// Night. A canyon of towers, rain on the street, tickers wrapped round the facades. An AI model hangs over the
// street and lets its numbers fall like ticker tape, and nearly all of them land red. Across the street a building
// is covered in one open server's tools, every screen talking at once, pouring tokens onto the road. Then three
// arches light up the street (find, describe, run): the rain stops, the screens go quiet, the tickers show what the
// sources say, and a thread climbs a tower to the one filing page an answer came from. Above the roofs canli-mcp's
// tools fall into one orb. Five towers stand for the benchmark, dark where a server never answered. Then blue hour,
// the city from above, the founder at the water at first light, and sunrise over a calm harbour where four towers
// stand for what Canli Capital is building: two finished, two still going up, with the outline of their full height
// and a crane at work. Last, the whole picture from the water: the old city and the new towers in the morning sun.
// The counts the film shows come from the page's #film-data block, which the build writes from the same published
// files as the words. Raw WebGL2, no library. Every word on the page is HTML and reads the same without this file.

const root = document.documentElement;
const chapters = [...document.querySelectorAll("[data-chapter]")];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = matchMedia("(max-width: 768px)").matches;
const cinema = !reduced && innerHeight < 1800; // captions, key, timecode: for people on a real screen
const staged = cinema;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const DATA = (() => { try { return JSON.parse(document.getElementById("film-data")?.textContent || "null"); } catch { return null; } })() ?? {
  ticker: [], rain: { questions: 150, given: 84, wrong: 0.96 }, tangle: { tools: 1056, tokens: 0 }, core: { front: 3, packs: [{ id: "quant", tools: 285 }] }, gap: { categories: [], arms: [] },
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

// ---------- where the reader is ----------
// On a laptop or desktop screen each chapter is one screen and the scroll rests on every one (see "stops" below); on a
// phone each chapter's scene sits above its words. Either way i is the chapter at the top of the screen and p how far
// it has moved off (0…1): the story runs i + p, so the camera stands on a chapter's shot whenever the scroll rests on it.
function scrollState() {
  let i = 0;
  for (let k = 0; k < chapters.length; k++) if (chapters[k].getBoundingClientRect().top <= 1) i = k;
  const r = chapters[i].getBoundingClientRect();
  return { i, p: clamp(-r.top / Math.max(1, r.height)) };
}

// ---------- the words: they arrive when the scroll rests on their chapter, and leave as it moves on ----------
// A chapter's title rises word by word and its blocks follow in turn (--j); as the chapter moves off they lift and
// dissolve in the direction it moves (--exit, --dir), and once well away they reset, to arrive again next time.
const oneScreen = matchMedia("(min-width: 769px)");
const blocksOf = chapters.map((c) => [...c.querySelectorAll(".chapter-inner > *")]);
const inners = chapters.map((c) => c.querySelector(".chapter-inner"));
blocksOf.forEach((blocks) => blocks.forEach((el, j) => el.style.setProperty("--j", String(j))));
let landing = -1; // while the stops glide to a chapter, only that chapter arrives on the way
function reveal() {
  const vh = innerHeight;
  chapters.forEach((c, k) => {
    const r = c.getBoundingClientRect();
    if (!oneScreen.matches) { if (r.top < vh * 0.95) blocksOf[k].forEach((el) => el.classList.add("is-shown")); return; }
    // how far the chapter is off the screen: from below by its top, upwards by its foot (a chapter taller than the
    // screen stays fully shown while any of it fills the screen)
    const off = r.top > 0 ? r.top / vh : Math.max(0, vh - r.bottom) / vh;
    const on = c.classList.contains("is-on");
    if (!on && off < 0.12 && (landing < 0 || landing === k)) { c.classList.add("is-on"); blocksOf[k].forEach((el) => el.classList.add("is-shown")); }
    else if (on && off > 0.6) { c.classList.remove("is-on"); blocksOf[k].forEach((el) => el.classList.remove("is-shown")); }
    if (staged) { inners[k].style.setProperty("--exit", (c.classList.contains("is-on") ? smooth(0.03, 0.3, off) : 0).toFixed(3)); inners[k].style.setProperty("--dir", r.top <= 0 ? "1" : "-1"); }
  });
}
reveal();
if (staged) root.classList.add("film-on");
addEventListener("scroll", reveal, { passive: true });
addEventListener("resize", reveal);

// ---------- the shot list: one camera position per chapter, and the state of the city in it ----------
// rain: rain and falling numbers · tangle: the wall of tools · gates · trace: the thread to the filing · core: the orb
// gap: the benchmark towers · vision: the four towers across the harbour · night / dawn: the hour · fog · expo: exposure
// via: points the camera flies through on its way to the next shot, so it goes round the towers and never through one
const SHOT =(eye, look, o) => ({ eye, look, rain: 0, tangle: 0, gates: 1, trace: 1, core: 1, gap: 1, vision: 0, night: 1, dawn: 0, fog: 0.0016, expo: 1, fov: 0.66, shift: 0.2, ...o });
const DARK_ACT = { rain: 1, tangle: 1, gates: 0, trace: 0, core: 0, gap: 0 };
const SHOTS = [
  SHOT([-298, 112, 2], [-150, 72, 0], { ...DARK_ACT, fog: 0.0019 }),                       // 0  Wall Street, just before midnight
  SHOT([-198, 3.0, 6.5], [-150, 40, -2], { ...DARK_ACT, fog: 0.0024, fov: 0.78 }),           // 1  numbers fall like ticker tape and land red
  SHOT([-128, 3, -8], [-84, 34, 12.8], { ...DARK_ACT, rain: 0.8, fog: 0.0022, fov: 0.92 }),          // 2  a wall of one server's tools
  SHOT([-70, 5.0, 0.4], [4, 15, 0], { trace: 0, core: 0, gap: 0, fog: 0.0019, expo: 1.05 }), // 3  three arches light up the street
  SHOT([20, 176, 7], [40, 186, -12], { core: 0, gap: 0, fog: 0.0016 }),                     // 4  up the tower, to the one page
  SHOT([36, 222, 16], [100, 232, 0], { gap: 0, fog: 0.0013, via: [[84, 150, 3]] }),                               // 5  the orb above the roofs
  SHOT([118, 30, 0.5], [210, 74, 0], { fog: 0.0016, fov: 0.86, shift: 0.26, via: [[122, 110, 1], [100, 290, 40]] }),                             // 6  five towers at the end of the street
  SHOT([-170, 340, 300], [10, 0, -10], { night: 0.8, dawn: 0.18, fog: 0.0009, via: [[-120, 330, 120], [-70, 290, 8]] }),             // 7  blue hour, the city from above
  SHOT([-64, 92, 6], [36, 72, -6], { night: 0.65, dawn: 0.3, fog: 0.0016, via: [[0, 50, 5], [120, 14, 6], [196, 4.5, 6.5]] }),                 // 8  between the towers of filings
  SHOT([221, 1.6, 5.4], [420, 26, 8], { night: 0.3, dawn: 0.7, vision: 0.35, fog: 0.0009, fov: 0.8, shift: 0.12, via: [[241, 6, 7.2], [262, 7, 18]] }), // 9  the builder at the rail, first light
  SHOT([290, 6, 30], [600, 44, -10], { night: 0, dawn: 1, vision: 1, fog: 0.0004, fov: 0.92, shift: 0.38, via: [[470, 14, 125]] }),   // 10 out on the water, the four towers at sunrise
  SHOT([900, 40, 150], [300, 80, -20], { night: 0, dawn: 1, vision: 1, fog: 0.0003, fov: 0.8, shift: 0.14 }), // 11 the market at dawn, the city and the harbour
];
const KEYS = Object.keys(SHOTS[0]).filter((k) => k !== "eye" && k !== "look");

// ---------- the world ----------
// Each instance: position, size, body colour, edge colour, edge strength, group, four parameters its group reads.
// groups: 0 plain · 1 tower facade · 2 the model · 3 arches · 4 screens · 5 the filing page · 6 its seal · 7 the orb
//         8 benchmark towers · 9 vision towers · 10 the builder · 11 stone · 13 the flag · 14 tickers
const STONE = [0.085, 0.078, 0.07], GLASS = [0.03, 0.04, 0.056], STEEL = [0.06, 0.068, 0.082], INK = [0.018, 0.022, 0.03];
const ICE = [0.57, 0.86, 1.0], WHITE = [0.86, 0.9, 1.0], AMBER = [1.0, 0.62, 0.22], RED = [1.0, 0.24, 0.2], GREEN = [0.3, 0.95, 0.6];
const WARM = [1.0, 0.8, 0.58], SODIUM = [1.0, 0.58, 0.26], VIOLET = [0.72, 0.55, 1.0], GOLD = [1.0, 0.76, 0.42], COOL = [0.45, 0.6, 0.85];
const inst = { cube: [], cyl: [], prism: [], plane: [], sphere: [] };
const put = (mesh, p, s, body, emit, ei, group, q = [0, 0, 0, 0]) => inst[mesh].push([...p, ...s, ...body, ...emit, ei, group, ...q]);
const box = (...a) => put("cube", ...a);
const lamps = [], captions = [];
const lamp = (p, color, size, group = 0, strength = 1) => lamps.push([...p, ...color, size, group, strength]);
const caption = (pos, title, sub, chs, tone = "") => captions.push([pos, title, sub, chs, tone]);
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const R = rng(11);

const STREET = 13;                         // the facades stand 13 units either side of the street's centre line
const WATER = 236;                         // the land ends here; the harbour begins
const MONOLITH = [-150, 74, 0], PAGE = [40, 186, -12.85], ORB = [100, 232, 0];
const CROSS = [[-306, 12], [-232, 12], [-58, 14], [16, 12], [96, 12], [168, 14]];
const crossing = (x0, x1) => CROSS.some(([cx, cw]) => x1 > cx - cw / 2 && x0 < cx + cw / 2);

// a tower: up to three setback tiers, a lit crown on some, a mast and an aircraft light on the tallest
function tower(x, z, w, d, h, o = {}) {
  const seed = R(), lit = o.lit ?? (R() < 0.15 ? 0.06 : 0.16 + R() * 0.34), style = o.style ?? Math.floor(R() * 3), crown = o.crown ?? (R() < 0.35 ? 1 + Math.floor(R() * 2) : 0);
  const body = o.body ?? [GLASS, STONE, STEEL][Math.floor(R() * 3)];
  const edge = crown === 1 ? GOLD : crown === 2 ? WHITE : COOL;
  const tiers = h > 150 ? 3 : h > 80 ? 2 : 1;
  let y = 0, cw = w, cd = d;
  for (let t = 0; t < tiers; t++) {
    const last = t === tiers - 1, th = last ? h - y : h * (t === 0 ? 0.52 + R() * 0.16 : 0.24 + R() * 0.1);
    box([x, y + th / 2, z], [cw, th, cd], body, edge, last && crown ? 0.5 : 0.05, 1, [seed + t * 0.137, lit, style, last ? crown : 0]);
    y += th; cw *= 0.7 + R() * 0.14; cd *= 0.7 + R() * 0.14;
  }
  if (!o.bare && h > 170 && R() < 0.6) { const sh = 10 + R() * 26; box([x, y + sh / 2, z], [0.6, sh, 0.6], STEEL, edge, 0.3, 0); lamp([x, y + sh + 0.6, z], RED, 2.8, 10, 1.3); }
  else if (!o.bare && h > 120) lamp([x, y + 1, z], RED, 2.2, 10, 1.0);
  return y;
}
// keep the camera's flight paths clear: lower towers where it passes between shots
const cap = (x, z) => (x > 40 && x < 150 && Math.abs(z) < 90 ? 196 : x > 96 && x < 150 && z > 0 ? 92 : 300);

// the canyon: two rows of towers on each side of the street, gaps for the cross streets and three set pieces
for (const side of [-1, 1]) {
  let x = -400;
  while (x < 150) {
    const w = 14 + R() * 18;
    if (crossing(x, x + w)) { x += 6; continue; }
    const cx = x + w / 2;
    const reserved = (side < 0 && cx > -180 && cx < -120) || (side > 0 && cx > -122 && cx < -42) || (side < 0 && cx > 26 && cx < 54);
    if (!reserved) {
      const d = 18 + R() * 16, h = Math.min(cap(cx, side * 30), 44 + Math.pow(R(), 1.5) * 230);
      tower(cx, side * (STREET + d / 2), w - 1.2, d, h);
    }
    const d2 = 16 + R() * 14, z2 = side * (STREET + 36 + d2 / 2), h2 = Math.min(cap(cx, z2), 60 + Math.pow(R(), 1.3) * 240);
    tower(cx + (R() - 0.5) * 4, z2, w - 2 + R() * 4, d2, h2);
    x += w;
  }
}
// the rest of the island, block by block, lower the further out
for (let gx = -560; gx < 150; gx += 34) for (let gz = -320; gz <= 320; gz += 34) {
  if (Math.abs(gz) < 90 || (small && Math.abs(gz) > 200)) continue;
  if (R() < 0.15) continue;
  const x = gx + (R() - 0.5) * 8, z = gz + (R() - 0.5) * 8, far = Math.min(1, Math.abs(gz) / 320);
  tower(x, z, 14 + R() * 12, 14 + R() * 12, Math.min(cap(x, z), 30 + Math.pow(R(), 1.6) * 200 * (1.1 - far * 0.6)), { bare: far > 0.7 });
}

// the exchange: a temple front of six columns under a pediment, a flag across it, floodlit from below
box([-150, 17, -29], [50, 34, 32], STONE, WARM, 0.04, 11);
box([-150, 2, -15.2], [52, 4, 6.4], STONE, WARM, 0.03, 11);
for (let k = 0; k < 6; k++) put("cyl", [-165 + k * 6, 15, -15.4], [2.2, 22, 2.2], STONE, WARM, 0, 11);
box([-150, 27.6, -15.4], [44, 3.2, 5.6], STONE, WARM, 0.04, 11);
put("prism", [-150, 32.6, -15.4], [44, 6.8, 5.2], STONE, WARM, 0, 11);
put("plane", [-150, 15.6, -12.9], [31, 19, 1], [0.5, 0.5, 0.5], WARM, 0, 13);
lamp([-150, 3, -9.5], WARM, 16, 0, 0.18);
// the model: a dark slab hanging over the street, amber while it guesses
box(MONOLITH, [2.0, 44, 12], INK, AMBER, 2.2, 2);
lamp([MONOLITH[0] - 12, MONOLITH[1], 0], AMBER, 36, 1, 0.2);
for (let k = 0; k < 9; k++) lamp([MONOLITH[0] - 2.2, MONOLITH[1] - 21.4, (k - 4) * 1.4], AMBER, 2.6, 1, 0.7);
caption([MONOLITH[0], MONOLITH[1] + 25, 0], "An AI model", "no tools, no filings", [0, 1], "amber");

// the wall of tools: a facade covered in one open server's screens, every one of them talking
const TOOLS = DATA.tangle.tools || 1056, COLS = 48;
box([-82, 60, 29], [70, 120, 32], GLASS, COOL, 0.05, 1, [0.77, 0.18, 0, 0]);
for (let k = 0; k < TOOLS; k++) {
  const c = k % COLS, r = Math.floor(k / COLS);
  box([-114 + c * (64 / (COLS - 1)), 9 + r * 2.9, 12.8], [1.18, 2.5, 0.2], INK, [0.3, 0.32, 0.36], 1.0, 4, [R(), c, r, 0]);
}
for (const [x, y] of [[-90, 20], [-72, 26], [-84, 48], [-68, 62], [-94, 64]]) lamp([x, y, 6], [1.0, 0.75, 0.5], 22, 2, 0.12);
caption([-58, 44, 12.6], "One open server's tools", `${fmt.format(TOOLS)} in one list${DATA.tangle.tokens ? ` · ${fmt.format(DATA.tangle.tokens)} tokens` : ""}`, [2], "amber");

// three arches across the street: find, describe, run
const ARCH = [-40, -25, -10];
ARCH.forEach((x, g) => {
  for (const z of [-10.6, 10.6]) { box([x, 15, z], [2.2, 30, 2.2], STEEL, ICE, 0.7, 3, [g, 0, 0, 0]); box([x, 15, z * 0.93], [0.3, 28, 0.3], ICE, ICE, 3.0, 3, [g, 0.5, 0, 0]); }
  box([x, 30.2, 0], [2.2, 2.6, 23.4], STEEL, ICE, 0.7, 3, [g, 0, 0, 0]);
  box([x, 28.6, 0], [0.3, 0.3, 19.6], ICE, ICE, 3.0, 3, [g, 0.5, 0, 0]);
  lamp([x, 29, 0], ICE, 7, 3, 0.5);
  for (const z of [-9.4, 9.4]) lamp([x, 3, z], ICE, 3.2, 3, 0.7);
});
caption([ARCH[0], 33, 0], "find_tool", "searches 285 tools", [3]);
caption([ARCH[1], 33, 0], "describe_tool", "reads one", [3]);
caption([ARCH[2], 33, 0], "run_tool", "runs it", [3]);

// the filing tower, and the one page an answer came from
tower(40, -24, 18, 22, 222, { lit: 0.5, style: 1, crown: 2, body: GLASS });
box(PAGE, [5.2, 6.8, 0.12], WHITE, WHITE, 3.4, 5);
for (let k = 0; k < 6; k++) box([PAGE[0] - 1.5 + (k % 2) * 0.4, PAGE[1] + 2.2 - k * 0.8, PAGE[2] + 0.1], [k % 3 === 2 ? 1.8 : 2.8, 0.18, 0.04], ICE, ICE, 2.6, 5);
for (let k = 0; k < 24; k++) box([PAGE[0], PAGE[1], PAGE[2] + 1.1], [0.42, 0.42, 0.42], ICE, ICE, 3.6, 6, [k / 24, 5.4, 0, 0]);
lamp([PAGE[0], PAGE[1], PAGE[2] + 2.4], ICE, 8, 4, 0.7);
caption([PAGE[0], PAGE[1] + 5, PAGE[2]], "NVIDIA, 10-K", document.querySelector(".receipt div:nth-child(3) dd")?.textContent ?? "", [4], "blue");

// the orb: every tool canli-mcp carries, one sphere above the roofs, three in front
{
  const COLOURS = { quant: ICE, validation: GREEN, markets: [0.36, 0.55, 1.0], fundamentals: WHITE, research: VIOLET, paper: AMBER, backtest: [0.5, 1, 0.9] };
  const cols = DATA.core.packs.flatMap((p) => Array(p.tools).fill(COLOURS[p.id] ?? WHITE));
  for (let k = cols.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [cols[k], cols[j]] = [cols[j], cols[k]]; }
  const N = cols.length, golden = Math.PI * (3 - Math.sqrt(5));
  cols.forEach((col, k) => {
    const phi = Math.acos(1 - (2 * (k + 0.5)) / N), theta = k * golden;
    box([ORB[0] + (R() - 0.5) * 120, ORB[1] - 60 + R() * 120, ORB[2] + (R() - 0.5) * 90], [1.05, 1.05, 1.05], INK, col, 3.0, 7, [17 + (R() - 0.5) * 1.2, phi, theta, 0.08]);
  });
  box(ORB, [5.2, 5.2, 5.2], INK, ICE, 4.5, 7, [0, 0, 0, -1]);
  for (let k = 0; k < (DATA.core.front || 3); k++) box([ORB[0] - 7.5, ORB[1] - 3 + k * 3, ORB[2] - 3 + k * 3], [1.9, 1.9, 1.9], ICE, WHITE, 4.5, 7, [0, 0, 0, -2]);
  lamp([ORB[0] - 7, ORB[1], ORB[2]], ICE, 34, 5, 0.32);
  caption([ORB[0], ORB[1] + 22, ORB[2]], "canli-mcp", `${N} tools · ${DATA.core.packs.length} packs · ${DATA.core.front} in front`, [5]);
}

// the benchmark: five towers on the waterfront, lowest to highest, a band of floors per kind of question
{
  const ARMS = [...DATA.gap.arms].reverse();
  ARMS.forEach((arm, t) => {
    const x = 210, z = -26 + t * 13, total = arm.accuracy * 170, n = Math.max(1, arm.categories.length), seg = total / n;
    arm.categories.forEach((acc, s) => {
      const level = acc < 0 ? -1 : acc;
      box([x, seg * s + seg / 2, z], [6.4, seg * 0.94, 6.4], level === 0 ? [0.07, 0.02, 0.02] : GLASS, level === 0 ? RED : arm.ours ? ICE : WHITE,
        level === 0 ? 0.9 : level < 0 ? 0.04 : arm.ours ? 0.55 : 0.18, 8, [t, s, level, arm.ours ? 1 : 0]);
    });
    lamp([x - 4, total + 2, z], arm.ours ? ICE : WHITE, arm.ours ? 12 : 6, 6, arm.ours ? 0.9 : 0.35);
    caption([x, total + 6, z], arm.label, `${Math.round(arm.accuracy * 100)}% correct`, [6], arm.ours ? "blue" : "");
  });
}

// the waterfront: a railing, lamps, and the builder looking out over the harbour
box([WATER - 0.6, 1.0, 0], [0.12, 0.1, 620], STEEL, WARM, 0.5, 0);
for (let z = -300; z <= 300; z += 3) box([WATER - 0.6, 0.5, z], [0.08, 1.0, 0.08], STEEL, WARM, 0.1, 0);
for (let z = -294; z <= 294; z += 16) { if (Math.abs(z - 8.6) < 4) continue; box([WATER - 2.2, 3.5, z], [0.16, 7, 0.16], STEEL, WARM, 0.05, 0); lamp([WATER - 2.2, 7.2, z], WARM, 2.6, 9, 0.9); }
{
  const FX = WATER - 1.3, FZ = 8.6, COAT = [0.035, 0.037, 0.045], SKIN = [0.09, 0.07, 0.06];
  for (const dz of [-0.1, 0.1]) put("cyl", [FX, 0.44, FZ + dz], [0.15, 0.88, 0.15], COAT, WARM, 0, 10);
  put("sphere", [FX, 0.92, FZ], [0.26, 0.24, 0.38], COAT, WARM, 0, 10);
  put("cyl", [FX, 1.22, FZ], [0.27, 0.5, 0.42], COAT, WARM, 0, 10);
  put("sphere", [FX, 1.46, FZ], [0.28, 0.16, 0.5], COAT, WARM, 0, 10);
  for (const dz of [-0.25, 0.25]) { put("cyl", [FX + 0.01, 1.17, FZ + dz], [0.095, 0.56, 0.095], COAT, WARM, 0, 10); put("sphere", [FX + 0.01, 0.88, FZ + dz], [0.09, 0.11, 0.09], SKIN, WARM, 0, 10); }
  put("cyl", [FX, 1.56, FZ], [0.1, 0.12, 0.1], SKIN, WARM, 0, 10);
  put("sphere", [FX, 1.71, FZ], [0.2, 0.25, 0.21], SKIN, WARM, 0, 10);
  caption([FX, 2.1, FZ], "Arhan Canli", "founder", [9]);
}

// the vision: four towers across the harbour, one for each part, each built as far as that part is today.
// Above an unfinished one, the outline of the height it will reach, and a crane at work.
const ISLAND = 600;
{
  const P = [["Context", ICE, 1, "live"], ["Testing", GREEN, 1, "live"], ["Data", AMBER, 0.62, "started"], ["Execution", VIOLET, 0.34, "paper only"]];
  const PEARL = [0.4, 0.42, 0.47];
  P.forEach(([name, c, built, chip], i) => {
    const x = ISLAND + [-10, 8, -6, 10][i], z = [-72, -26, 22, 70][i], w = [15, 13, 16, 13][i], h = [140, 124, 160, 140][i], hb = Math.round(h * built);
    box([x, 0.5, z], [w + 8, 1.0, w + 8], PEARL, c, 0.6, 9, [i, built, 1, 0]);
    box([x, hb / 2, z], [w, hb, w], PEARL, c, 0.3, 9, [i, built, 0, 0]);
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box([x + dx * w / 2, hb / 2, z + dz * w / 2], [0.45, hb, 0.45], c, c, 2.2, 9, [i, built, 1, 0]);
    if (built >= 1) {
      box([x, hb + 4, z], [w * 0.62, 8, w * 0.62], PEARL, c, 1.0, 9, [i, built, 0, 0]);
      box([x, hb - 3, z], [w + 0.5, 1.4, w + 0.5], c, c, 3.0, 9, [i, built, 1, 0]);
      box([x, hb + 17, z], [0.5, 18, 0.5], STEEL, c, 0.5, 9, [i, built, 1, 0]);
      lamp([x, hb + 26.5, z], c, 9, 7, 1.0);
    } else {
      for (let y = hb + 14; y <= h; y += 14) for (const s of [-1, 1]) { box([x, y, z + s * w / 2], [w, 0.22, 0.22], c, c, 1.0, 9, [i, built, 2, 0]); box([x + s * w / 2, y, z], [0.22, 0.22, w], c, c, 1.0, 9, [i, built, 2, 0]); }
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box([x + dx * w / 2, (hb + h) / 2, z + dz * w / 2], [0.22, h - hb, 0.22], c, c, 1.0, 9, [i, built, 2, 0]);
      const mz = z - w * 0.3, top = hb + 34;
      box([x, (hb + top) / 2, mz], [1.3, top - hb, 1.3], STEEL, AMBER, 0.2, 9, [i, built, 3, 0]);
      box([x, top, mz + 15], [1.1, 1.1, 46], STEEL, AMBER, 0.2, 9, [i, built, 3, 0]);
      box([x, top - 1.4, mz - 10], [2.6, 3.2, 5], STEEL, AMBER, 0.1, 9, [i, built, 3, 0]);
      box([x, top + 4, mz], [0.6, 8, 0.6], STEEL, AMBER, 0.2, 9, [i, built, 3, 0]);
      box([x, top - 12, mz + 30], [0.12, 24, 0.12], STEEL, AMBER, 0.3, 9, [i, built, 3, 0]);
      lamp([x, top + 8.6, mz], RED, 3, 10, 1.0);
    }
    caption([x, built >= 1 ? hb - 24 : hb + 10, z], name, chip, [10], ["blue", "green", "amber", "violet"][i]);
  });
}

// the tickers: LED bands wrapped round the facades along the street
const TICKERS = [[-262, -1, 15], [-214, 1, 18], [-188, -1, 16], [-128, 1, 15], [-112, -1, 21], [-30, 1, 17], [4, -1, 15], [62, 1, 19], [84, -1, 16], [138, 1, 15]];
TICKERS.forEach(([x, side, y], k) => box([x, y, side * (STREET - 0.16)], [24, 2.4, 0.3], INK, WHITE, 0, 14, [0.6 + (k % 3) * 0.25, side, k * 0.137, 0]));
// streetlights down both sidewalks
for (let x = -392; x < WATER - 6; x += 16) for (const z of [-11.4, 11.4]) {
  if (crossing(x - 1, x + 1)) continue;
  box([x, 4.2, z], [0.18, 8.4, 0.18], STEEL, WARM, 0.04, 0);
  box([x, 8.4, z * 0.94], [0.12, 0.12, 1.4], STEEL, WARM, 0.04, 0);
  lamp([x, 8.2, z * 0.88], SODIUM, 3.0, 9, 1.0);
}

// ---------- shaders ----------
const LIB = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float sm(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }`;
// The sky, as glass, water and the sky itself all see it: night over a lit city, or dawn over the harbour.
const SKY = `
uniform vec3 uSunDir; uniform float uDawn, uNight, uBroken;
// dawn without the sun's disc: gold low toward the sun, rose and lavender above, clear blue overhead,
// and on the far side the pink band a clear sunrise lays along the horizon
vec3 dawnSky(vec3 d, float glow){
  float e = max(d.y, 0.0), s = max(dot(d, uSunDir), 0.0);
  float toward = dot(normalize(d.xz + vec2(1e-4, 0.0)), normalize(uSunDir.xz)) * 0.5 + 0.5;
  vec3 low = mix(vec3(0.62, 0.48, 0.62), vec3(1.0, 0.6, 0.34), toward * toward);
  vec3 c = mix(low, mix(vec3(0.72, 0.54, 0.66), vec3(0.98, 0.62, 0.54), toward), smoothstep(0.0, 0.07, e));
  c = mix(c, vec3(0.42, 0.45, 0.74), smoothstep(0.05, 0.3, e));
  c = mix(c, vec3(0.13, 0.26, 0.56), smoothstep(0.26, 0.85, e));
  c += vec3(1.0, 0.58, 0.26) * pow(s, 5.0) * 0.42 * (1.0 - smoothstep(0.0, 0.5, e));
  return c + vec3(1.0, 0.76, 0.48) * pow(s, 40.0) * 0.75 * glow;
}
vec3 skyBase(vec3 d, float glow){
  float e = d.y;
  vec3 night = mix(vec3(0.09, 0.06, 0.085), vec3(0.01, 0.014, 0.028), smoothstep(-0.02, 0.5, e));
  night += vec3(0.28, 0.13, 0.06) * exp(-max(e, 0.0) * 10.0) * 0.4;
  vec3 c = uDawn > 0.0 ? mix(night, dawnSky(d, glow), uDawn) : night;
  return mix(c, c * vec3(1.35, 0.72, 0.66) + vec3(0.03, 0.0, 0.0), uBroken * 0.5);
}
vec3 skyCol(vec3 d){ return uDawn > 0.0 ? skyBase(d, 1.0) + vec3(1.0, 0.86, 0.66) * pow(max(dot(d, uSunDir), 0.0), 900.0) * 3.0 * uDawn : skyBase(d, 1.0); }
// the haze takes the colour of the sky low down in the direction it is seen, without the sun's glare
vec3 hazeCol(vec3 eye, vec3 at, vec3 fogC){
  vec3 d = normalize(at - eye); d.y = max(d.y, 0.0) * 0.4 + 0.015;
  return mix(fogC, skyBase(normalize(d), 0.3), clamp(uDawn * 0.85 + (1.0 - uNight) * 0.3, 0.0, 1.0));
}`;
const BOX_FRAG = `#version 300 es
precision highp float;
in vec3 vN, vL, vW, vBody, vEmit, vScale; in float vEI; flat in float vGroup; in vec4 vQ; out vec4 o;
uniform vec3 uEye, uFogC, uKeyDir, uKeyCol, uAmb; uniform float uFogD, uExpo, uClip, uTime, uWin, uFlash, uMesh, uTangle;
uniform sampler2D uTicker;
${LIB}
${SKY}
vec3 facade(vec3 body, vec3 n, vec3 V, vec4 q, float litProb, vec3 tint, float tintK){
  vec2 uv = abs(n.x) > 0.5 ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y);
  float colW = mix(2.1, 3.3, fract(q.x * 7.31)), floorH = mix(3.5, 4.3, fract(q.x * 3.17));
  vec2 c = uv / vec2(colW, floorH), id = floor(c), f = fract(c), fw = fwidth(c);
  float lod = 1.0 - smoothstep(0.16, 0.65, max(fw.x, fw.y));
  vec2 g0 = q.z < 0.5 ? vec2(0.12, 0.2) : q.z < 1.5 ? vec2(0.3, 0.12) : vec2(0.05, 0.32);
  float gx = smoothstep(g0.x - fw.x, g0.x + fw.x, f.x) * smoothstep(1.0 - g0.x + fw.x, 1.0 - g0.x - fw.x, f.x);
  float gy = smoothstep(g0.y - fw.y, g0.y + fw.y, f.y) * smoothstep(1.0 - g0.y * 0.6 + fw.y, 1.0 - g0.y * 0.6 - fw.y, f.y);
  float glass = gx * gy, h = hash(id + vec2(q.x * 91.7, q.x * 13.3));
  float lit = step(h, litProb);
  float tone = fract(h * 13.7), bright = 0.55 + 0.9 * fract(h * 71.3);
  vec3 wc = (tone < 0.55 ? vec3(1.0, 0.76, 0.48) : tone < 0.93 ? vec3(0.74, 0.86, 1.0) : vec3(0.6, 1.0, 0.86)) * bright;
  wc = mix(wc, tint, tintK);
  vec3 R = reflect(-V, n);
  float fres = 0.12 + 0.88 * pow(1.0 - max(dot(n, V), 0.0), 4.0);
  vec3 refl = skyCol(R) * fres;
  float glint = pow(max(dot(R, uSunDir), 0.0), 240.0) * uDawn * 7.0;
  vec3 dark = body * 0.55 + refl * 0.6 + vec3(1.0, 0.84, 0.6) * glint;
  vec3 near = mix(body, mix(dark, wc * 1.7, lit), glass);
  vec3 far = body * 0.8 + refl * 0.32 + wc * 1.7 * litProb * 0.3;
  vec3 res = mix(far, near, lod);
  float lobby = (1.0 - smoothstep(6.0, 7.6, vW.y)) * gx;
  return mix(res, vec3(1.0, 0.82, 0.62) * 1.5, lobby * 0.65 * (0.25 + 0.75 * uNight));
}
void main(){
  if (vW.y < uClip) discard;
  int g = int(vGroup + 0.5);
  vec3 n = normalize(vN), V = normalize(uEye - vW);
  vec3 a = abs(vL) * 2.0; float mx = max(a.x, max(a.y, a.z)), mn = min(a.x, min(a.y, a.z)), sec = a.x + a.y + a.z - mx - mn;
  float w = fwidth(sec) * 1.4 + 0.012, edge = uMesh > 0.5 ? 0.0 : smoothstep(1.0 - w * 2.2, 1.0 - w * 0.2, sec);
  float key = max(dot(n, uKeyDir), 0.0), rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 col = vBody * (uAmb + uKeyCol * key) + vec3(0.25, 0.35, 0.6) * rim * 0.05 * uNight;
  col += vBody * vec3(1.0, 0.55, 0.28) * 0.6 * uNight * clamp(1.0 - vW.y / 150.0, 0.0, 1.0) * (0.5 - n.y * 0.5);
  col += vBody * uFlash * 3.0;
  bool side = abs(n.y) < 0.5;
  if ((g == 1) && side) col = facade(mix(vBody, vBody * (uAmb * 2.0 + uKeyCol * key * 1.6), uDawn), n, V, vQ, vQ.y * uWin, vec3(0.0), 0.0) + vBody * uFlash * 2.0;
  else if (g == 8 && side) {
    float level = vQ.z, ours = vQ.w;
    float p = level < -0.5 ? 0.0 : level < 0.001 ? 0.45 : 0.25 + 0.7 * level;
    col = facade(vBody, n, V, vec4(0.31 + vQ.x * 0.21, 0.0, 0.0, 0.0), p, level < 0.001 && level > -0.5 ? vec3(1.0, 0.18, 0.14) : ours > 0.5 ? vec3(0.62, 0.9, 1.0) : vec3(0.0), level < 0.001 && level > -0.5 ? 1.0 : ours > 0.5 ? 0.7 : 0.0);
  }
  else if (g == 9 && side && vQ.z < 0.5) {
    // a vision tower: glass that holds the dawn, a few floors already lit in its colour
    col = facade(vBody * (uAmb * 1.2 + uKeyCol * key * 0.9), n, V, vec4(0.23 + vQ.x * 0.19, 0.0, 1.0, 0.0), 0.3, vEmit, 0.75);
  }
  else if (g == 10) {
    // the builder: a silhouette against the light, rimmed where the sun comes past him
    col = vBody * (uAmb + uKeyCol * key) + vec3(1.0, 0.72, 0.46) * pow(rim, 1.5) * max(dot(-V, uSunDir), 0.0) * uDawn * 0.9;
  }
  else if (g == 11) {
    // stone, washed with warm light from below
    float up = (1.0 - smoothstep(0.0, 42.0, vW.y)) * (0.35 + 0.65 * uNight);
    float flute = uMesh > 0.5 ? 0.82 + 0.18 * cos(atan(vL.z, vL.x) * 22.0) : 1.0;
    col = vBody * (uAmb * 1.4 + uKeyCol * key) * flute + vec3(1.0, 0.8, 0.56) * vBody * 9.0 * up * flute;
  }
  else if (g == 13) {
    // the flag
    vec2 u = vL.xy + 0.5;
    float stripe = mod(floor((1.0 - u.y) * 13.0), 2.0);
    vec3 c = mix(vec3(0.9, 0.88, 0.84), vec3(0.62, 0.08, 0.1), 1.0 - stripe);
    if (u.x < 0.4 && u.y > 6.0 / 13.0) { vec2 st = fract(vec2(u.x * 15.0, u.y * 13.0)) - 0.5; c = mix(vec3(0.08, 0.12, 0.3), vec3(0.95), step(length(st), 0.18)); }
    float ripple = 0.75 + 0.25 * sin(vL.x * 7.0 - uTime * 1.6 + vL.y * 2.0);
    col = c * (uAmb * 2.0 + uKeyCol * 0.5 + vec3(1.0, 0.82, 0.6) * 0.55 * (0.35 + 0.65 * uNight)) * ripple;
  }
  else if (g == 14 && abs(n.z) > 0.5) {
    // a ticker: guesses while the street is broken, the sources' figures once the gates are lit
    float along = vW.x * sign(n.z) / vScale.y * 0.0156 + uTime * 0.035 * vQ.x + vQ.z;
    float v = clamp(vL.y + 0.5, 0.0, 1.0);
    vec3 guess = texture(uTicker, vec2(along, (1.0 - v) * 0.5)).rgb, truth = texture(uTicker, vec2(along * 0.9, 0.5 + (1.0 - v) * 0.5)).rgb;
    float dots = 0.55 + 0.45 * smoothstep(0.5, 0.2, length(fract(vec2(along * 4096.0 / 3.0, v * 21.0)) - 0.5));
    col = vBody + mix(truth, guess, uBroken) * 2.6 * dots;
  }
  else if (g == 4 && n.z < -0.5) {
    // a screen: one tool's card (a title bar in its colour, lines of description), flickering, until it is switched off;
    // across the whole wall runs one red line, the price the model is guessing
    vec2 s = vL.xy + 0.5;
    float seed = vQ.x, frame = step(0.07, s.x) * step(s.x, 0.93) * step(0.05, s.y) * step(s.y, 0.95);
    vec2 G = vec2((vQ.y + s.x) / 48.0, (vQ.z + s.y) / 22.0);
    float price = 0.52 + 0.2 * sin(G.x * 8.0 + uTime * 0.6) + 0.1 * sin(G.x * 29.0 - uTime * 1.1) + 0.06 * (noise(vec2(G.x * 70.0, uTime * 2.0)) - 0.5);
    float line = smoothstep(0.022, 0.004, abs(G.y - price)), under = smoothstep(price, price - 0.25, G.y) * 0.08;
    float scan = 0.82 + 0.18 * sin(s.y * 70.0 + uTime * 12.0);
    vec3 tint = seed < 0.12 ? vec3(1.0, 0.22, 0.18) : seed < 0.4 ? vec3(1.0, 0.62, 0.26) : vec3(0.55, 0.7, 1.0);
    float head = step(0.8, s.y) * step(s.y, 0.91);
    float rp = (s.y - 0.14) / 0.12, row = floor(rp), inRow = step(0.14, s.y) * step(s.y, 0.74) * step(0.5, fract(rp));
    float text = inRow * step(0.14, s.x) * step(s.x, 0.18 + 0.66 * hash(vec2(row, seed * 91.0)));
    float flick = 0.7 + 0.3 * step(0.4, hash(vec2(floor(uTime * (1.5 + seed * 6.0)), seed * 37.0)));
    vec3 scr = vec3(0.02, 0.035, 0.08) + tint * head * 0.85 + vec3(0.5, 0.6, 0.78) * text * 0.42 + vec3(1.0, 0.18, 0.14) * (line * 3.0 + under);
    col = mix(col, scr * scan * flick * vEI * 1.8, frame);
  }
  if (g == 2) col += vEmit * vEI * 0.07 * (0.5 + 0.5 * noise(vL.yz * vec2(10.0, 4.0) + vec2(uTime * 0.4, 0.0)));
  float lights = (g == 0 || g == 1 || g == 11) ? 0.12 + 0.88 * uNight : 1.0;
  col += (vEmit * edge * vEI + vEmit * vEI * 0.04) * lights;
  float d = length(vW - uEye);
  float fogA = 1.0 - exp(-d * uFogD * (0.45 + 0.9 * exp(-max(vW.y, 0.0) * 0.02)));
  col = mix(col, hazeCol(uEye, vW, uFogC), fogA);
  o = vec4(col * uExpo, 1.0);
}`;
const STATIC_V = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 iPos; layout(location=3) in vec3 iScale; layout(location=4) in vec3 iBody; layout(location=5) in vec4 iEmit; layout(location=6) in float iGroup; layout(location=7) in vec4 iQ;
uniform mat4 uVP; uniform float uTime, uBroken, uTangle, uGates, uTrace, uCore, uGap, uVision;
out vec3 vN, vL, vW, vBody, vEmit, vScale; out float vEI; flat out float vGroup; out vec4 vQ;
${LIB}
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
void main(){
  int g = int(iGroup + 0.5);
  vec3 scale = iScale, pos = iPos, emit = iEmit.rgb; float ei = iEmit.a;
  if (g == 2) { emit = mix(vec3(0.57, 0.86, 1.0), emit, uBroken); ei *= 0.8 + 0.2 * sin(uTime * 1.3); }
  else if (g == 3) { float on = sm(iQ.x * 0.22, iQ.x * 0.22 + 0.4, uGates); ei *= 0.04 + on * (0.96 + 0.2 * sin(uTime * 3.0 - iQ.y * 6.0)); }
  else if (g == 4) { ei *= 1.0 - step(iQ.x, 1.0 - uTangle) * 0.97; }
  else if (g == 5) { ei *= 0.15 + 1.85 * uTrace; }
  else if (g == 6) { float a = iQ.x * 6.2832 + uTime * 0.8; pos += vec3(cos(a), sin(a), 0.0) * iQ.y * uTrace; scale *= uTrace; ei *= uTrace; }
  else if (g == 7) {
    if (iQ.w < -1.5) { scale *= uCore; ei *= uCore; }
    else if (iQ.w < -0.5) { scale *= uCore; ei *= uCore; }
    else {
      scale *= sm(0.0, 0.25, uCore); ei *= sm(0.0, 0.25, uCore);
      float th = iQ.z + uTime * iQ.w, ph = iQ.y, r = iQ.x * (1.0 + 0.025 * sin(uTime * 1.4 + iQ.z * 3.0));
      vec3 orbit = vec3(${ORB[0].toFixed(1)}, ${ORB[1].toFixed(1)}, ${ORB[2].toFixed(1)}) + rotX(0.35) * vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)) * r;
      pos = mix(pos + vec3(0.0, sin(uTime * 0.5 + iQ.z) * 0.8, 0.0), orbit, sm(0.0, 1.0, uCore));
    }
  }
  else if (g == 8) { float up = sm(iQ.x * 0.12, iQ.x * 0.12 + 0.55, uGap); pos.y *= up; scale.y *= up; ei *= up; }
  else if (g == 9) { float up = sm(iQ.x * 0.14, iQ.x * 0.14 + 0.5, uVision); pos.y *= up; scale.y *= up; ei *= up; }
  vec3 w = pos + aP * scale;
  if (g == 13) w.z += (sin(aP.x * 7.0 - uTime * 1.6 + aP.y * 2.0) * 0.35 + sin(aP.x * 13.0 - uTime * 2.3) * 0.12) * (0.7 - aP.y) * 0.9;
  vW = w; vN = aNrm; vL = aP; vBody = iBody; vEmit = emit; vEI = ei; vGroup = iGroup; vQ = iQ; vScale = scale;
  gl_Position = uVP * vec4(w, 1.0);
}`;
// The ticker-tape rain: numbers from a glyph atlas and strips of paper, fluttering down from the model to the street.
const GLYPH_V = `#version 300 es
layout(location=0) in vec2 aQ; layout(location=1) in vec4 iG;
uniform mat4 uVP, uView; uniform float uTime, uRain, uBroken, uWrong, uCount;
out vec2 vUV; out vec3 vCol; out float vA;
${LIB}
void main(){
  float id = iG.x, slot = iG.y, ch = iG.z, len = iG.w;
  bool paper = id >= 1000.0;
  float h1 = hash(vec2(id, 1.3)), h2 = hash(vec2(id, 7.1)), h3 = hash(vec2(id, 3.7));
  float cycle = 10.0 + h3 * 6.0, t = mod(uTime + h1 * cycle, cycle), drop = paper ? 7.5 : 5.2;
  float fall = clamp(t / drop, 0.0, 1.0), rest = clamp((t - drop) / (cycle - drop), 0.0, 1.0);
  vec3 from = vec3(${MONOLITH[0].toFixed(1)} - 1.2 - h3 * 2.0, 56.0 + h1 * 36.0, (h2 - 0.5) * 8.6);
  vec3 land = vec3(-206.0 + h1 * 52.0, 0.06 + h3 * 0.02, -9.0 + h2 * 18.0);
  vec3 p = mix(from, land, 1.0 - pow(1.0 - fall, 1.4));
  p.y = mix(from.y, land.y, fall);
  float sway = sin(uTime * (1.5 + h2) + h1 * 20.0) * (1.0 - fall) * 2.2;
  p.x += sway; p.z += cos(uTime * (1.2 + h1) + h2 * 20.0) * (1.0 - fall) * 1.6;
  bool wrong = !paper && (id + 0.5) / uCount < uWrong;
  float landed = step(0.999, fall);
  vec3 col = paper ? vec3(0.95, 0.93, 0.88) : vec3(0.95, 0.97, 1.0);
  col = mix(col, wrong ? vec3(1.0, 0.24, 0.2) : col, landed);
  col = mix(vec3(0.57, 0.86, 1.0), col, uBroken);
  float a = uRain * (1.0 - rest * rest) * smoothstep(0.0, 0.1, t) * (paper ? 0.5 : 1.0);
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]), up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  vec3 Rx = normalize(mix(right, vec3(1.0, 0.0, 0.0), landed)), Uy = normalize(mix(up, vec3(0.0, 0.0, -1.0), landed));
  float spin = paper ? abs(cos(uTime * (3.0 + h3 * 4.0) + h1 * 9.0)) * 0.85 + 0.15 : 1.0;
  float size = paper ? 0.55 : 0.9 + h3 * 0.5;
  vec3 w = p + Rx * ((slot - len * 0.5) * size * 0.62 + aQ.x * size * (paper ? 0.4 : 0.62) * spin) + Uy * (aQ.y * size * (paper ? 1.6 : 1.0));
  vUV = vec2((ch + aQ.x + 0.5) / 20.0, 0.5 - aQ.y); vCol = col; vA = a;
  gl_Position = uVP * vec4(w, 1.0);
}`;
const GLYPH_F = `#version 300 es
precision highp float; in vec2 vUV; in vec3 vCol; in float vA; out vec4 o; uniform sampler2D uAtlas; uniform float uExpo;
void main(){ float m = texture(uAtlas, vUV).a; o = vec4(vCol * m * vA * 1.7 * uExpo, 1.0); }`;
const FLOOR_V = `#version 300 es
layout(location=0) in vec2 aQ; uniform mat4 uVP; out vec3 vW;
void main(){ vW = vec3(aQ.x * 1600.0 + 40.0, 0.0, aQ.y * 1600.0); gl_Position = uVP * vec4(vW, 1.0); }`;
const FLOOR_F = `#version 300 es
precision highp float; in vec3 vW; out vec4 o;
uniform vec3 uEye, uFogC; uniform float uFogD, uExpo, uReflK, uGates, uRain, uTime; uniform sampler2D uRefl; uniform vec2 uRes;
${LIB}
${SKY}
void main(){
  vec3 V = normalize(uEye - vW);
  vec2 P = vW.xz, suv = gl_FragCoord.xy / uRes;
  vec3 col;
  if (vW.x > ${WATER.toFixed(1)}) {
    // the harbour: calm water, mirroring the city and the sky, a path of light toward the sun
    float t = uTime * 0.22;
    vec2 sl = (vec2(noise(P * 0.07 + vec2(t, t * 0.6)), noise(P * 0.07 + vec2(5.2, 1.3) - vec2(t * 0.5, t))) - 0.5) * 0.3
            + (vec2(noise(P * 0.5 + vec2(t * 1.7, -t)), noise(P * 0.5 + vec2(3.1, 8.7) + t)) - 0.5) * 0.08;
    vec3 n = normalize(vec3(sl.x, 1.0, sl.y)), R = reflect(-V, n);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 refl = uReflK > 0.0 ? texture(uRefl, suv + sl * mix(0.04, 0.022, uDawn)).rgb : skyCol(R);
    vec3 base = mix(vec3(0.008, 0.02, 0.032), vec3(0.035, 0.06, 0.1), uDawn);
    col = mix(base, refl, clamp(fres + 0.2, 0.0, 1.0));
    // glitter: small ripples catch the sun one by one along the path to it
    if (uDawn > 0.0) {
      vec2 gq = P * 1.6 + vec2(t * 3.0, -t * 2.0);
      vec3 gn = normalize(vec3((noise(gq) - 0.5) * 0.36 + sl.x, 1.0, (noise(gq + 9.3) - 0.5) * 0.36 + sl.y));
      float sp = max(dot(reflect(-V, gn), uSunDir), 0.0), sb = max(dot(R, uSunDir), 0.0);
      col += vec3(1.0, 0.82, 0.58) * (pow(sp, 900.0) * 20.0 + pow(sb, 60.0) * 0.4) * uDawn;
    }
  } else {
    // the street: asphalt with its lines and crossings, sidewalks, and a plaza at the water
    float az = abs(vW.z);
    col = vec3(0.02, 0.022, 0.028) * (0.85 + 0.3 * noise(P * 2.3));
    float walk = smoothstep(10.0, 10.25, az);
    col = mix(col, vec3(0.045, 0.045, 0.05) * (0.9 + 0.2 * noise(P * 0.8)), walk);
    float curb = (1.0 - smoothstep(0.0, 0.12, abs(az - 10.1)));
    col += vec3(0.05) * curb;
    float centre = (1.0 - smoothstep(0.05, 0.11, abs(az - 0.22))) * step(az, 10.0);
    col += vec3(0.32, 0.24, 0.06) * centre * 0.5;
    float lane = step(0.5, fract(vW.x / 7.0)) * (1.0 - smoothstep(0.05, 0.1, abs(az - 5.0)));
    col += vec3(0.28) * lane * 0.4;
    float zebra = 0.0;
    ${CROSS.map(([cx, cw]) => `zebra += step(abs(vW.x - (${cx.toFixed(1)})), ${(cw / 2 - 1).toFixed(1)}) * step(0.5, fract(vW.z / 1.4)) * step(az, 9.6);`).join("\n    ")}
    col += vec3(0.3) * min(zebra, 1.0) * 0.35;
    col = mix(col, vec3(0.06, 0.058, 0.062) * (0.85 + 0.3 * noise(P * 0.4)), step(150.0, vW.x));
    // the line of light the arches open down the street
    float pulse = 0.5 + 0.5 * sin(vW.x * 0.08 - uTime * 3.0);
    col += vec3(0.57, 0.86, 1.0) * exp(-az * 2.2) * uGates * (0.25 + 0.75 * pulse) * step(-46.0, vW.x) * step(vW.x, 205.0) * 0.6;
    // wet: the city mirrored in the street, rippled by the rain
    vec2 off = (vec2(noise(P * 1.7), noise(P * 1.7 + 9.0)) - 0.5) * 0.012;
    off += (vec2(noise(P * 3.0 + uTime * 2.5), noise(P * 3.0 - uTime * 2.5)) - 0.5) * 0.02 * uRain;
    float wet = mix(0.45, 1.0, smoothstep(0.35, 0.7, noise(P * 0.11 + 3.0)));
    float fres = 0.18 + 0.72 * pow(1.0 - abs(V.y), 4.0);
    if (uReflK > 0.0) col += texture(uRefl, suv + off).rgb * fres * wet;
  }
  float d = length(vW - uEye);
  col = mix(col, hazeCol(uEye, vW, uFogC), 1.0 - exp(-d * uFogD * 1.25));
  o = vec4(col * uExpo, 1.0);
}`;
const SKY_F = `#version 300 es
precision highp float; out vec4 o;
uniform vec2 uRes; uniform vec3 uCamR, uCamU, uCamF; uniform float uTanY, uAspect, uMirror, uTime, uFlash, uIntro;
${LIB}
${SKY}
void main(){
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec3 d = normalize(uCamF + ndc.x * uTanY * uAspect * uCamR + ndc.y * uTanY * uCamU);
  d.y *= uMirror;
  vec3 c = skyCol(d);
  if (d.y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.07) * 0.8 + vec2(uTime * 0.01, uTime * 0.004);
    float cl = fbm(cp * 1.3);
    float cover = smoothstep(0.42 + 0.16 * uDawn, 0.86, cl) * smoothstep(0.0, 0.06, d.y);
    vec3 nightCloud = vec3(0.17, 0.1, 0.1) * (0.4 + 0.9 * exp(-d.y * 3.5)) + vec3(0.55, 0.62, 0.95) * uFlash * 2.4;
    float s = max(dot(d, uSunDir), 0.0);
    vec3 dawnCloud = mix(vec3(0.9, 0.56, 0.6), vec3(1.0, 0.8, 0.56), pow(s, 3.0)) * (0.7 + 0.4 * cl) + vec3(1.0, 0.7, 0.4) * pow(s, 14.0) * 0.9;
    c = mix(c, mix(nightCloud, dawnCloud, uDawn), cover * mix(0.9, 0.55, uDawn));
    if (uDawn > 0.0) {
      float ci = fbm(vec2(cp.x * 0.3 + cp.y * 0.12, cp.y * 2.4) * 0.9 + 7.0);
      float streak = smoothstep(0.52, 0.78, ci) * smoothstep(0.02, 0.2, d.y) * uDawn;
      c = mix(c, mix(vec3(0.96, 0.64, 0.66), vec3(1.0, 0.84, 0.64), pow(s, 2.0)) * 1.05, streak * 0.55);
    }
    float star = step(0.9986, hash(floor(d.xz / (d.y + 0.3) * 240.0))) * smoothstep(0.2, 0.55, d.y) * (1.0 - cover) * (1.0 - uDawn) * uNight;
    c += star * 0.9;
    c += vec3(1.0, 0.86, 0.64) * smoothstep(0.99935, 0.9997, dot(d, uSunDir)) * 3.2 * uDawn;
  }
  o = vec4(c * uIntro, 1.0);
}`;
// Light: lamps, haze, the tokens the wall spills, the thread, pulses, rain, traffic, steam, dawn motes and mist.
const LAMP_V = `#version 300 es
layout(location=0) in vec2 aQ; layout(location=1) in vec3 iPos; layout(location=2) in vec3 iCol; layout(location=3) in vec3 iMeta;
uniform mat4 uVP, uView; uniform float uTime, uBroken, uTangle, uGates, uTrace, uCore, uGap, uVision, uRain, uNight, uDawn, uFogD; uniform vec3 uEye, uCamVel;
out vec2 vQ; out vec3 vCol; flat out float vShape;
${LIB}
void main(){
  int g = int(iMeta.y + 0.5);
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]), up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  vec3 p = iPos, col = iCol, axis = vec3(0.0, 1.0, 0.0); float k = 1.0, size = iMeta.x, len = 0.0, shape = 0.0;
  if (g == 1) { k = 0.55 + 0.45 * uBroken; col = mix(vec3(0.57, 0.86, 1.0), col, uBroken); }
  else if (g == 2) k = uTangle;
  else if (g == 3) k = uGates;
  else if (g == 4) k = 0.2 + 0.8 * uTrace;
  else if (g == 5) k = uCore;
  else if (g == 6) k = uGap;
  else if (g == 7) k = uVision;
  else if (g == 9) k = 0.12 + 0.88 * uNight;
  else if (g == 10) k = (0.2 + 0.8 * uNight) * step(0.55, fract(uTime * 0.5 + iPos.x * 0.013 + iPos.z * 0.007));
  else if (g == 20) { p += vec3(sin(uTime * 0.07 + iPos.y * 3.0) * 2.0, mod(iPos.y + uTime * 0.6, 60.0) - iPos.y, cos(uTime * 0.05 + iPos.x) * 1.6); k = 0.3 + 0.7 * uNight; }
  else if (g == 21) {
    // tokens pour down the wall of tools and spread across the street
    float s = iPos.x, t = fract(uTime * (0.06 + s * 0.05) + iPos.z);
    vec3 a = vec3(-114.0 + iPos.y * 64.0, 9.0 + s * 62.0, 12.4), b = vec3(-140.0 + iPos.y * 110.0, 0.15, -9.0 + s * 18.0);
    float drop = sm(0.0, 0.55, t);
    p = vec3(mix(a.x, b.x, sm(0.4, 1.0, t)), mix(a.y, b.y, drop), mix(a.z, b.z, sm(0.3, 1.0, t)));
    k = uTangle * uBroken * (1.0 - t * t);
  }
  else if (g == 22) {
    // the thread: from the last arch, up the street and the tower, to the page
    float s = iPos.x, u = 1.0 - s;
    vec3 a = vec3(-10.0, 30.0, 0.0), c1 = vec3(4.0, 120.0, -2.0), c2 = vec3(30.0, 176.0, -6.0), b = vec3(${PAGE[0].toFixed(1)}, ${PAGE[1].toFixed(1)}, ${(PAGE[2] + 0.4).toFixed(2)});
    p = u * u * u * a + 3.0 * u * u * s * c1 + 3.0 * u * s * s * c2 + s * s * s * b;
    k = step(s, uTrace * 1.02) * (0.55 + 1.8 * exp(-pow((fract(uTime * 0.3) - s) * 16.0, 2.0)));
  }
  else if (g == 24) { float t = fract(uTime * 0.18 + iPos.x); p = vec3(-46.0 + t * 222.0, 0.3, 0.0); k = uGates * sin(t * 3.14159); }
  else if (g == 25) {
    // rain, in a box that travels with the camera
    vec3 box = vec3(70.0, 46.0, 70.0);
    p = uEye + mod(iPos * box + vec3(-uTime * 5.0, -uTime * 42.0, uTime * 1.5), box) - box * 0.5;
    axis = normalize(vec3(-0.12, -1.0, 0.04)); len = 1.1; shape = 1.0; k = uRain;
  }
  else if (g == 26 || g == 27) {
    // traffic: headlights coming, tail lights going, streaking down the wet street
    float dir = g == 26 ? -1.0 : 1.0, speed = 9.0 + iPos.y * 8.0;
    p = vec3(mod(iPos.x * 620.0 + uTime * speed * dir, 620.0) - 400.0, 0.62, iPos.z);
    axis = vec3(1.0, 0.0, 0.0); len = 1.4 + speed * 0.06; shape = 1.0; k = 0.35 + 0.65 * uNight;
  }
  else if (g == 28) {
    // steam rising from the street
    float t = fract(uTime * 0.11 + iPos.y);
    p = vec3(iPos.x + sin(t * 4.0 + iPos.y * 9.0) * t * 1.2, t * 16.0, iPos.z + cos(t * 3.0 + iPos.y * 7.0) * t * 1.2);
    size = 1.0 + t * 6.0; shape = 2.0; k = (1.0 - t) * sm(0.0, 0.12, t) * (0.4 + 0.6 * uNight);
  }
  else if (g == 29) { p += vec3(sin(uTime * 0.11 + iPos.z) * 3.0, mod(iPos.y + uTime * 0.7, 30.0) - iPos.y, cos(uTime * 0.09 + iPos.x) * 3.0); k = uDawn * (0.5 + 0.5 * sin(uTime * 1.3 + iPos.x)); }
  else if (g == 30) { p.x += mod(uTime * 1.2 + iPos.y * 40.0, 80.0) - 40.0; shape = 2.0; k = uDawn; }
  vQ = aQ; vShape = shape;
  if (k * iMeta.z <= 0.0) { vCol = vec3(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 w;
  if (shape > 0.5 && shape < 1.5) { vec3 side = normalize(cross(axis, normalize(uEye - p))); w = p + side * aQ.x * size + axis * aQ.y * len; }
  else w = p + (right * aQ.x + up * aQ.y) * size;
  if (g == 20) w -= uCamVel * (aQ.y + 0.5) * 3.0;
  float d = length(p - uEye);
  vCol = col * iMeta.z * k * exp(-d * uFogD * 0.6);
  gl_Position = uVP * vec4(w, 1.0);
}`;
const LAMP_F = `#version 300 es
precision highp float; in vec2 vQ; in vec3 vCol; flat in float vShape; out vec4 o; uniform float uExpo, uTime;
${LIB}
void main(){
  float a;
  if (vShape > 1.5) { float r = length(vQ) * 2.0; a = (1.0 - smoothstep(0.15, 1.0, r)) * (0.5 + 0.5 * noise(vQ * 3.0 + uTime * 0.15)) * 0.3; }
  else if (vShape > 0.5) a = exp(-vQ.x * vQ.x * 24.0) * (1.0 - smoothstep(0.25, 0.5, abs(vQ.y)));
  else { float r = length(vQ) * 2.0; a = (exp(-r * r * 4.0) + exp(-r * 9.0) * 0.6) * (1.0 - smoothstep(0.85, 1.0, r)); }
  o = vec4(vCol * a * uExpo, 1.0);
}`;
// Birds over the harbour at dawn: dark wings against the light.
const BIRD_V = `#version 300 es
layout(location=0) in vec3 aB; layout(location=1) in vec4 iB;
uniform mat4 uVP, uView; uniform float uTime;
out float vA;
void main(){
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]), up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  float t = uTime * (0.9 + iB.w * 0.2) + iB.w * 40.0;
  // two loose V flocks crossing the harbour, one each way
  int id = gl_InstanceID; bool second = id >= 13; int k = second ? id - 13 : id;
  float rank = float((k + 1) / 2), side = (k % 2 == 0) ? 1.0 : -1.0;
  vec3 lead = second ? vec3(520.0, 78.0, -300.0 + mod(uTime * 3.6 + 200.0, 600.0)) : vec3(430.0, 50.0, 300.0 - mod(uTime * 4.5, 600.0));
  vec3 c = lead + vec3(side * rank * 2.2, rank * 0.25 + sin(t * 0.3) * 0.6, (second ? -1.0 : 1.0) * rank * 2.6) + (iB.xyz - 0.5) * vec3(1.4, 0.8, 1.4);
  float flap = sin(t * 4.0) * 0.5 * step(0.35, fract(t * 0.07));
  vec2 q = vec2(aB.x, aB.y * (abs(aB.x) > 0.5 ? flap : 1.0) - aB.z * 0.18);
  vec3 w = c + (right * q.x + up * q.y) * 2.2;
  vA = 1.0;
  gl_Position = uVP * vec4(w, 1.0);
}`;
const BIRD_F = `#version 300 es
precision highp float; in float vA; out vec4 o; uniform float uDawn;
void main(){ o = vec4(vec3(0.06, 0.05, 0.06) * uDawn, 0.85 * uDawn); }`;
const POST_V = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const BRIGHT_F = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uKnee; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy * uTexel; vec3 c = vec3(0.0);
  for (int k = 0; k < 4; k++) { vec2 off = vec2(float(k & 1), float(k >> 1)) - 0.5; c += texture(uTex, uv + off * uTexel * 0.5).rgb; }
  c *= 0.25; float l = max(c.r, max(c.g, c.b)); o = vec4(c * smoothstep(uKnee, uKnee + 1.1, l), 1.0); }`;
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
precision highp float; uniform sampler2D uScene, uB1, uB2, uSoft, uDepth, uStreak; uniform vec2 uRes; uniform vec3 uSun;
uniform float uTime, uFocus, uDof, uTravel, uBroken, uDawn, uNight; out vec4 o;
${LIB}
float lin(float z){ float n = 0.3, f = 2400.0; z = z * 2.0 - 1.0; return 2.0 * n * f / (f + n - z * (f - n)); }
vec3 aces(vec3 x){ return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 cc = uv - 0.5; float ca = 0.0012 + uTravel * 0.005;
  vec3 sc = vec3(texture(uScene, uv - cc * ca).r, texture(uScene, uv).g, texture(uScene, uv + cc * ca).b);
  if (uTravel > 0.01) { vec3 acc = sc; for (int k = 1; k < 7; k++) acc += texture(uScene, uv - cc * uTravel * 0.045 * float(k) / 6.0).rgb; sc = acc / 7.0; }
  float dist = lin(texture(uDepth, uv).r), coc = clamp(abs(dist - uFocus) / max(dist, 1.0) * 0.8, 0.0, 1.0) * uDof;
  sc = mix(sc, texture(uSoft, uv).rgb, smoothstep(0.0, 1.0, coc));
  vec3 c = sc + texture(uB1, uv).rgb * 0.7 + texture(uB2, uv).rgb * 0.9;
  // anamorphic streaks from the lights, strongest at night
  c += texture(uStreak, uv).rgb * vec3(0.55, 0.75, 1.0) * (0.35 + 0.35 * uNight);
  // god rays from the sun, through the gaps between towers
  if (uSun.z > 0.0) {
    vec2 dir = (uSun.xy - uv) / 28.0; vec2 q = uv; float decay = 1.0; vec3 rays = vec3(0.0);
    for (int k = 0; k < 28; k++) { q += dir; rays += texture(uB1, q).rgb * decay; decay *= 0.94; }
    c += rays * 0.035 * uSun.z * vec3(1.0, 0.82, 0.6);
  }
  c = aces(c * 1.12);
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, c * vec3(0.9, 0.98, 1.1) + vec3(0.0, 0.006, 0.014) * (1.0 - lum), 0.5 * uNight * (1.0 - uBroken));
  c = mix(c, mix(vec3(lum), c, 0.55) * vec3(1.14, 0.9, 0.84), uBroken * 0.55);
  c = mix(c, mix(c * c * (3.0 - 2.0 * c), c, 0.6) * mix(vec3(0.94, 0.98, 1.06), vec3(1.05, 1.0, 0.94), smoothstep(0.1, 0.8, lum)), uDawn);
  vec2 v = uv - 0.5; c *= 1.0 - dot(v, v) * mix(0.9 + uBroken * 0.3, 0.5, uDawn);
  c += (hash(gl_FragCoord.xy + fract(uTime * 13.0) * 100.0) - 0.5) * (0.032 + uBroken * 0.02);
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
const norm3 = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function curve(k, i, t) { // k: "eye" or "look"; segment i → i+1 of the shot list
  if (k === "eye" && SHOTS[i].via) return route([SHOTS[i].eye, ...SHOTS[i].via, SHOTS[Math.min(SHOTS.length - 1, i + 1)].eye], t);
  const P = (j) => SHOTS[Math.max(0, Math.min(SHOTS.length - 1, j))][k];
  const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), d = len3(sub3(p2, p1));
  const tan = (a, b, near) => { const m = sub3(b, a).map((v) => v * 0.5), l = len3(m), cap = Math.min(d, near) * 0.9; return l > cap && l > 0 ? m.map((v) => (v * cap) / l) : m; };
  const m1 = tan(p0, p2, len3(sub3(p1, p0)) || d), m2 = tan(p1, p3, len3(sub3(p3, p2)) || d);
  const t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  return [0, 1, 2].map((c) => h00 * p1[c] + h10 * m1[c] + h01 * p2[c] + h11 * m2[c]);
}
// a flight through waypoints, for moves that have to go round the towers: Catmull-Rom spaced by the length of each leg
function route(pts, t) {
  const n = pts.length - 1, knots = [0];
  for (let j = 0; j < n; j++) knots.push(knots[j] + (len3(sub3(pts[j + 1], pts[j])) || 1e-3));
  const u = t * knots[n]; let j = 0; while (j < n - 1 && u > knots[j + 1]) j++;
  const tan = (q) => { const a = pts[Math.max(0, q - 1)], b = pts[Math.min(n, q + 1)], span = knots[Math.min(n, q + 1)] - knots[Math.max(0, q - 1)]; return sub3(b, a).map((v) => v / span); };
  const D = knots[j + 1] - knots[j], s = (u - knots[j]) / D, m1 = tan(j), m2 = tan(j + 1);
  const s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return [0, 1, 2].map((c) => h00 * pts[j][c] + h10 * D * m1[c] + h01 * pts[j + 1][c] + h11 * D * m2[c]);
}
// meshes: position (−0.5…0.5) and normal per vertex
function cube() {
  const out = [], corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (let axis = 0; axis < 3; axis++) for (const s of [-1, 1]) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (const [cu, cv] of corners) { const p = [0, 0, 0], n = [0, 0, 0]; p[axis] = s * 0.5; p[u] = cu * 0.5; p[v] = cv * 0.5; n[axis] = s; out.push(...p, ...n); }
  }
  return new Float32Array(out);
}
function cylinder(seg = 20) {
  const out = [], at = (k) => [Math.cos((k / seg) * 6.2832) * 0.5, Math.sin((k / seg) * 6.2832) * 0.5];
  for (let k = 0; k < seg; k++) {
    const [x0, z0] = at(k), [x1, z1] = at(k + 1), n0 = [x0 * 2, 0, z0 * 2], n1 = [x1 * 2, 0, z1 * 2];
    out.push(x0, -0.5, z0, ...n0, x1, -0.5, z1, ...n1, x1, 0.5, z1, ...n1, x0, -0.5, z0, ...n0, x1, 0.5, z1, ...n1, x0, 0.5, z0, ...n0);
    out.push(0, 0.5, 0, 0, 1, 0, x1, 0.5, z1, 0, 1, 0, x0, 0.5, z0, 0, 1, 0);
  }
  return new Float32Array(out);
}
function sphere(seg = 14, rings = 9) {
  const out = [], at = (i, j) => { const th = (i / seg) * 6.2832, ph = (j / rings) * 3.14159; return [Math.cos(th) * Math.sin(ph) * 0.5, Math.cos(ph) * 0.5, Math.sin(th) * Math.sin(ph) * 0.5]; };
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) for (const [a, b] of [[0, 0], [1, 1], [1, 0], [0, 0], [0, 1], [1, 1]]) { const p = at(i + a, j + b); out.push(...p, p[0] * 2, p[1] * 2, p[2] * 2); }
  return new Float32Array(out);
}
function prism() { // a triangle in x/y, apex up, extruded along z
  const A = [-0.5, -0.5], B = [0.5, -0.5], C = [0, 0.5], out = [];
  for (const z of [0.5, -0.5]) { const n = [0, 0, Math.sign(z)]; for (const p of z > 0 ? [A, B, C] : [A, C, B]) out.push(p[0], p[1], z, ...n); }
  const side = (P, Q) => { const e = [Q[0] - P[0], Q[1] - P[1]], n = norm3([e[1], -e[0], 0]);
    out.push(P[0], P[1], 0.5, ...n, Q[0], Q[1], 0.5, ...n, Q[0], Q[1], -0.5, ...n, P[0], P[1], 0.5, ...n, Q[0], Q[1], -0.5, ...n, P[0], P[1], -0.5, ...n); };
  side(A, B); side(B, C); side(C, A);
  return new Float32Array(out);
}
function plane(nx = 28, ny = 16) {
  const out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x0 = i / nx - 0.5, x1 = (i + 1) / nx - 0.5, y0 = j / ny - 0.5, y1 = (j + 1) / ny - 0.5;
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y0], [x1, y1], [x0, y1]]) out.push(x, y, 0, 0, 0, 1);
  }
  return new Float32Array(out);
}
// The glyph atlas: twenty slots drawn once into a canvas, white on transparent; the last is a solid strip of paper.
const GLYPHS = "0123456789.,$%BM?";
function atlas() {
  const c = document.createElement("canvas"); c.width = 20 * 64; c.height = 96;
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
  x.font = '500 72px "IBM Plex Mono", ui-monospace, monospace';
  [...GLYPHS].forEach((g, i) => x.fillText(g, i * 64 + 32, 50));
  x.fillRect(19 * 64 + 18, 14, 28, 68);
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
// The tickers: one strip of guesses (figures with doubt left in) and one of what the sources say, from #film-data.
function tickerTexture() {
  const c = document.createElement("canvas"); c.width = 4096; c.height = 128;
  const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, c.width, c.height); x.textBaseline = "middle";
  x.font = '600 44px "IBM Plex Mono", ui-monospace, monospace';
  const r = rng(31), SYM = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "JPM", "BRK", "XOM", "GOOGL"];
  let px = 12;
  while (px < c.width) {
    const up = r() < 0.5, v = (10 + r() * 900).toFixed(2).split("").map((ch) => (/\d/.test(ch) && r() < 0.22 ? "?" : ch)).join("");
    const sym = SYM[Math.floor(r() * SYM.length)];
    x.fillStyle = "#dfe6f0"; x.fillText(sym, px, 32); px += x.measureText(`${sym} `).width;
    x.fillStyle = up ? "#5fe39a" : "#ff5a4c"; const t = `${up ? "+" : "-"}${v}`; x.fillText(t, px, 32); px += x.measureText(`${t}      `).width;
  }
  const truths = DATA.ticker?.length ? DATA.ticker : ["READ FROM THE SOURCE"];
  px = 12;
  for (let k = 0; px < c.width; k++) { const t = `${truths[k % truths.length]}      `; x.fillStyle = "#9fdcff"; x.fillText(t, px, 96); px += x.measureText(t).width; }
  return c;
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
    bird: compile(BIRD_V, BIRD_F), bright: compile(POST_V, BRIGHT_F), blur: compile(POST_V, BLUR_F), down: compile(POST_V, DOWN_F), comp: compile(POST_V, COMP_F) };

  const attrib = (loc, size, divisor = 0, stride = 0, offset = 0) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset); gl.vertexAttribDivisor(loc, divisor); };
  const buf = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
  const quad = new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);
  // every mesh draws through the same program, each from its own list of instances
  // Each mesh is kept in two orders. The city is listed west to east, so a camera looking east draws it nearest
  // first and one looking west draws it reversed: either way the depth test turns away what is hidden behind.
  const meshes = [["cube", cube(), 0], ["cyl", cylinder(), 1], ["prism", prism(), 1], ["plane", plane(), 1], ["sphere", sphere(), 1]].filter(([k]) => inst[k].length).map(([k, data, noEdges]) => {
    const vaoOf = (rows) => {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      buf(data); attrib(0, 3, 0, 24, 0); attrib(1, 3, 0, 24, 12);
      buf(new Float32Array(rows.flat())); const SB = 18 * 4;
      attrib(2, 3, 1, SB, 0); attrib(3, 3, 1, SB, 12); attrib(4, 3, 1, SB, 24); attrib(5, 4, 1, SB, 36); attrib(6, 1, 1, SB, 52); attrib(7, 4, 1, SB, 56);
      return vao;
    };
    return { east: vaoOf(inst[k]), west: vaoOf([...inst[k]].reverse()), verts: data.length / 6, count: inst[k].length, noEdges };
  });
  // the ticker-tape rain: one instance per character, then the strips of paper
  const given = Math.max(1, DATA.rain.given || 84), glyphs = [];
  figures(given).forEach((s, id) => [...s].forEach((ch, slot) => glyphs.push([id, slot, Math.max(0, GLYPHS.indexOf(ch)), s.length])));
  for (let k = 0; k < (small ? 220 : 520); k++) glyphs.push([1000 + k, 0, 19, 1]);
  const vGlyph = gl.createVertexArray(); gl.bindVertexArray(vGlyph);
  buf(quad); attrib(0, 2); buf(new Float32Array(glyphs.flat())); attrib(1, 4, 1, 16, 0);
  const texture = (draw, repeat) => { const t = gl.createTexture();
    const upload = () => { gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, draw()); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); };
    upload(); document.fonts?.ready.then(upload); return t; };
  const atlasTex = texture(atlas, false), tickerTex = texture(tickerTexture, true);
  // floor
  const vFloor = gl.createVertexArray(); gl.bindVertexArray(vFloor); buf(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])); attrib(0, 2);
  // light
  const lr = rng(5), extra = [];
  for (let k = 0; k < (small ? 400 : 1000); k++) extra.push([-380 + lr() * 560, lr() * 60, -11 + lr() * 22, 0.7, 0.72, 0.85, 0.06 + lr() * 0.06, 20, 0.3]);
  for (let k = 0; k < (small ? 500 : 1400); k++) extra.push([lr(), lr(), lr(), 1.0, 0.66, 0.3, 0.12 + lr() * 0.14, 21, 0.9]);
  for (let k = 0; k < 420; k++) extra.push([k / 419, 0, 0, 0.57, 0.86, 1.0, 0.62, 22, 1.2]);
  for (let k = 0; k < 16; k++) extra.push([k / 16, 0, 0, 0.57, 0.86, 1.0, 1.4, 24, 1.4]);
  for (let k = 0; k < (small ? 1200 : 3200); k++) extra.push([lr(), lr(), lr(), 0.6, 0.66, 0.78, 0.035, 25, 0.5]);
  for (let k = 0; k < (small ? 60 : 110); k++) for (const dz of [-0.75, 0.75]) {
    const seed = lr(), lane = lr() < 0.5 ? 2.6 : 6.6, speed = lr();
    extra.push([seed, speed, lane + dz, 1.0, 0.95, 0.85, 0.32, 26, 1.6]);
    extra.push([lr(), lr(), -(2.6 + (lr() < 0.5 ? 0 : 4)) + dz, 1.0, 0.16, 0.1, 0.28, 27, 1.4]);
  }
  for (const [vx, vz] of [[-176, 4], [-138, -5], [-92, 3], [-22, -4], [50, 5], [120, -3]]) for (let k = 0; k < 36; k++) extra.push([vx, k / 36, vz, 0.95, 0.9, 0.85, 1, 28, 0.9]);
  for (let k = 0; k < (small ? 200 : 520); k++) extra.push([WATER - 20 + lr() * 420, lr() * 30, -140 + lr() * 280, 1.0, 0.82, 0.55, 0.1 + lr() * 0.12, 29, 0.8]);
  for (let k = 0; k < (small ? 40 : 110); k++) extra.push([WATER + 10 + lr() * 520, lr(), -220 + lr() * 440, 1.0, 0.88, 0.76, 24 + lr() * 22, 30, 0.06]);
  const lampData = new Float32Array([...lamps, ...extra].flat()), LAMPS = lamps.length + extra.length;
  const vLamp = gl.createVertexArray(); gl.bindVertexArray(vLamp);
  buf(quad); attrib(0, 2); buf(lampData); attrib(1, 3, 1, 36, 0); attrib(2, 3, 1, 36, 12); attrib(3, 3, 1, 36, 24);
  // birds: two wings and a tail point each
  const birdGeo = new Float32Array([-1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1]);
  const br = rng(17), birds = []; for (let k = 0; k < 22; k++) birds.push([br(), br(), br(), br()]);
  const vBird = gl.createVertexArray(); gl.bindVertexArray(vBird);
  buf(birdGeo); attrib(0, 3); buf(new Float32Array(birds.flat())); attrib(1, 4, 1, 16, 0);
  gl.bindVertexArray(null);

  // render targets: the scene (multisampled when the device can), the mirror, bloom at two sizes, streaks, a soft copy
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
    if (T) { for (const x of [T.scene, T.b1, T.b1b, T.b2, T.b2b, T.d1, T.d1b, T.s1, T.s1b, ...(T.refl ? [T.refl] : [])]) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); } gl.deleteTexture(T.depthT);
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
    T = { scene, depthT, msFbo, msColor, msDepth, W, H, refl, reflDepth, b1: target(...q(4)), b1b: target(...q(4)), b2: target(...q(10)), b2b: target(...q(10)), d1: target(...q(3)), d1b: target(...q(3)), s1: target(...q(4)), s1b: target(...q(4)) };
  };

  document.body.prepend(canvas);
  // captions: what each thing is, pinned to it while its chapter is on screen
  const capLayer = document.createElement("div"); capLayer.className = "film-captions"; capLayer.setAttribute("aria-hidden", "true");
  const caps = captions.map(([pos, title, sub, chs, tone]) => { const el = document.createElement("div"); el.className = `cap${tone ? " " + tone : ""}`;
    const b = document.createElement("b"); b.textContent = title; el.append(b); if (sub) { const sp = document.createElement("span"); sp.textContent = sub; el.append(sp); }
    capLayer.append(el); return { el, pos, chs, shown: -1 }; });
  // the colour key: what each colour means, only while it matters
  const KEY = [["white", "A number a model gave", 0.6, 1.6], ["red", "Wrong, checked against the filing", 0.6, 2.6], ["amber", "A tool in one long list", 1.6, 2.6], ["ice", "Read from the source", 2.6, 4.6], ["red", "Never answered correctly", 5.6, 6.6]];
  const legend = document.createElement("div"); legend.className = "film-legend"; legend.setAttribute("aria-hidden", "true");
  const keys = KEY.map(([tone, text, from, to]) => { const row = document.createElement("div"); row.className = `key ${tone}`; const dot = document.createElement("i"); const label = document.createElement("span"); label.textContent = text; row.append(dot, label); legend.append(row); return { row, from, to, on: null }; });
  if (cinema) document.body.append(capLayer, legend);

  const story = () => { const { i, p } = scrollState(); return i + p; };
  let goalS = story(), current = goalS, vel = 0, raf = 0, shown = !document.hidden, px = 0, py = 0, last = performance.now(), aspect = 1, prevEye = null, flash = 0, nextFlash = 3;
  const pointer = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; kick(); }, { passive: true });
  const t0 = performance.now();
  const use = (prog) => { gl.useProgram(prog.p); return prog.u; };
  const SUN_AT = (dawn) => norm3([1, lerp(-0.1, 0.07, smooth(0.45, 1, dawn)), -0.06]);

  function frame(now) {
    raf = 0;
    const rawDt = (now - last) / 1000, dt = Math.min(0.1, Math.max(0, rawDt)); last = now; adapt(rawDt);
    const t = reduced ? 3 : (now - t0) / 1000;
    if (reduced) { current = goalS; vel = 0; } else { const w = 3.0, acc = -2 * w * vel - w * w * (current - goalS); vel += acc * dt; current += vel * dt; }
    const s = clamp(current, 0, SHOTS.length - 1.0001), i = Math.floor(s), f = smooth(0, 1, s - i), A = SHOTS[i], B = SHOTS[i + 1];
    const st = Object.fromEntries(KEYS.map((k) => [k, lerp(A[k], B[k], f)]));
    let eye = curve("eye", i, f), look = curve("look", i, f); eye[1] = Math.max(0.9, eye[1]);
    // the camera breathes; at dawn it slows almost to stillness
    const calm = 1 - st.dawn * 0.7;
    if (!reduced) { px += (pointer.x - px) * 0.04; py += (pointer.y - py) * 0.04;
      eye = [eye[0] + px * 1.6 * calm + Math.sin(t * 0.21) * 0.14 * calm, eye[1] - py * 0.9 * calm + Math.sin(t * 0.33) * 0.07 * calm, eye[2] + Math.cos(t * 0.17) * 0.14 * calm]; }
    const camVel = prevEye ? [eye[0] - prevEye[0], eye[1] - prevEye[1], eye[2] - prevEye[2]] : [0, 0, 0]; prevEye = eye;
    const travel = clamp(Math.hypot(...camVel) * 1.6); root.style.setProperty("--travel", travel.toFixed(3));
    const broken = 1 - smooth(2.35, 3.2, s);
    // lightning in the clouds while the street is broken
    if (!reduced && broken > 0.2 && t > nextFlash) { flash = 1; nextFlash = t + 4 + Math.random() * 7; }
    flash = Math.max(0, flash - dt * 3.2); const fl = flash * flash * broken * (0.6 + 0.4 * Math.sin(t * 60));
    // compose for the words: on wide screens they sit on the left, so the subject moves into the right two-thirds
    const fwd = [look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]], fdist = Math.hypot(...fwd), rx = -fwd[2] / fdist, rz = fwd[0] / fdist, shift = small ? 0 : fdist * st.shift;
    const lookC = [look[0] - rx * shift, look[1] - (small ? fdist * 0.22 : 0), look[2] - rz * shift];
    const fov = small ? Math.max(0.98, st.fov) : st.fov, view = lookAt(eye, lookC), proj = perspective(fov, aspect, 0.3, 2400), vp = mul(proj, view);
    const camR = [view[0], view[4], view[8]], camU = [view[1], view[5], view[9]], camF = [-view[2], -view[6], -view[10]];
    const night = st.night, dawn = st.dawn;
    const mixc = (a, b, k) => a.map((v, j) => lerp(v, b[j], k));
    let fogC = mixc([0.022, 0.022, 0.032], [0.06, 0.026, 0.026], broken * 0.6);
    fogC = mixc(fogC, [0.05, 0.07, 0.13], clamp((1 - night) * 2) * (1 - dawn));
    fogC = mixc(fogC, [0.62, 0.52, 0.56], dawn);
    const amb = mixc([0.05, 0.055, 0.075], [0.17, 0.165, 0.22], dawn).map((v) => v + fl * 0.4);
    const SUN = SUN_AT(dawn);
    const keyDir = norm3(mixc([-0.35, 0.85, 0.4], SUN, dawn)), keyCol = mixc([0.1, 0.12, 0.18], [1.45, 0.92, 0.58], dawn);
    const win = 0.12 + 0.88 * night;
    const intro = reduced ? 1 : smooth(0.1, 2.8, t);

    if (cinema) {
      const textEdge = Math.min(innerWidth * 0.56, 860);
      for (const c of caps) {
        const near = Math.max(...c.chs.map((ch) => 1 - smooth(0.35, 0.75, Math.abs(s - ch))));
        const x = vp[0] * c.pos[0] + vp[4] * c.pos[1] + vp[8] * c.pos[2] + vp[12], y = vp[1] * c.pos[0] + vp[5] * c.pos[1] + vp[9] * c.pos[2] + vp[13], w = vp[3] * c.pos[0] + vp[7] * c.pos[1] + vp[11] * c.pos[2] + vp[15];
        const sx = (x / w * 0.5 + 0.5) * innerWidth, sy = (0.5 - y / w * 0.5) * innerHeight;
        const o = w > 0.5 ? near * (small ? 1 : smooth(textEdge - 30, textEdge + 50, sx)) : 0;
        if (o < 0.01) { if (c.shown !== 0) { c.el.style.opacity = "0"; c.shown = 0; } continue; }
        c.el.style.opacity = o.toFixed(3); c.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`; c.shown = 1;
      }
      for (const k of keys) { const on = s >= k.from && s <= k.to; if (on !== k.on) { k.row.classList.toggle("on", on); k.on = on; } }
    }

    const shared = (uu, VP, VIEW) => {
      if (uu.uVP) gl.uniformMatrix4fv(uu.uVP, false, VP); if (uu.uView && VIEW) gl.uniformMatrix4fv(uu.uView, false, VIEW);
      for (const [name, v] of [["uEye", eye], ["uFogC", fogC], ["uKeyDir", keyDir], ["uKeyCol", keyCol], ["uAmb", amb], ["uSunDir", SUN], ["uCamVel", camVel]]) if (uu[name]) gl.uniform3fv(uu[name], v);
      for (const [name, v] of [["uTime", t], ["uBroken", broken], ["uTangle", st.tangle], ["uGates", st.gates], ["uTrace", st.trace], ["uCore", st.core], ["uGap", st.gap], ["uVision", st.vision],
        ["uRain", st.rain], ["uNight", night], ["uDawn", dawn], ["uFogD", st.fog], ["uExpo", st.expo * intro], ["uWin", win], ["uFlash", fl], ["uWrong", DATA.rain.wrong ?? 0.96], ["uCount", given]]) if (uu[name]) gl.uniform1f(uu[name], v);
    };
    const drawSky = (mirror) => {
      const u = use(P.sky); shared(u);
      gl.uniform2f(u.uRes, mirror ? T.refl.w : T.W, mirror ? T.refl.h : T.H); gl.uniform3fv(u.uCamR, camR); gl.uniform3fv(u.uCamU, camU); gl.uniform3fv(u.uCamF, camF);
      gl.uniform1f(u.uTanY, Math.tan(fov / 2)); gl.uniform1f(u.uAspect, aspect); gl.uniform1f(u.uMirror, mirror ? -1 : 1); gl.uniform1f(u.uIntro, intro);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const drawWorld = (VP, VIEW, clip) => {
      let uu = use(P.stat); shared(uu, VP); gl.uniform1f(uu.uClip, clip);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tickerTex); gl.uniform1i(uu.uTicker, 1); gl.activeTexture(gl.TEXTURE0);
      for (const m of meshes) { gl.uniform1f(uu.uMesh, m.noEdges); gl.bindVertexArray(camF[0] < 0 ? m.west : m.east); gl.drawArraysInstanced(gl.TRIANGLES, 0, m.verts, m.count); }
      if (dawn > 0.02) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        uu = use(P.bird); shared(uu, VP, VIEW); gl.bindVertexArray(vBird); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, birds.length); gl.depthMask(true); gl.disable(gl.BLEND); }
      gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      uu = use(P.lamp); shared(uu, VP, VIEW); gl.bindVertexArray(vLamp); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, LAMPS);
      if (st.rain > 0.01) { uu = use(P.glyph); shared(uu, VP, VIEW); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex); gl.uniform1i(uu.uAtlas, 0);
        gl.bindVertexArray(vGlyph); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, glyphs.length); }
      gl.disable(gl.BLEND); gl.depthMask(true);
    };
    const mirrorM = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    if (T.refl) { // the reflection: the same city and sky, mirrored in the wet street and the water, at half resolution
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.refl.f); gl.viewport(0, 0, T.refl.w, T.refl.h);
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); drawSky(true);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
      drawWorld(mul(vp, mirrorM), mul(view, mirrorM), 0.01); gl.disable(gl.DEPTH_TEST);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.msFbo || T.scene.f); gl.viewport(0, 0, T.W, T.H);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(false);
    drawSky(false);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    let u = use(P.floor); shared(u, vp); gl.uniform1f(u.uReflK, T.refl ? 1 : 0); gl.uniform2f(u.uRes, T.W, T.H);
    if (T.refl) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.refl.t); gl.uniform1i(u.uRefl, 0); }
    gl.bindVertexArray(vFloor); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    drawWorld(vp, view, -1000);
    gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(null);
    if (T.msFbo) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.msFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.scene.f);
      gl.blitFramebuffer(0, 0, T.W, T.H, 0, 0, T.W, T.H, gl.COLOR_BUFFER_BIT, gl.NEAREST); gl.blitFramebuffer(0, 0, T.W, T.H, 0, 0, T.W, T.H, gl.DEPTH_BUFFER_BIT, gl.NEAREST); }
    const pass = (prog, dst, src, setup) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, dst.w, dst.h); const uu = use(prog); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t); gl.uniform1i(uu.uTex, 0); setup(uu); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    pass(P.bright, T.b1, T.scene, (uu) => { gl.uniform2f(uu.uTexel, 1 / T.b1.w, 1 / T.b1.h); gl.uniform1f(uu.uKnee, 0.7 + dawn * 0.7); });
    // streaks: the bright pass smeared sideways, as an anamorphic lens does
    pass(P.blur, T.s1, T.b1, (uu) => { gl.uniform2f(uu.uDir, 3 / T.s1.w, 0); gl.uniform2f(uu.uRes, T.s1.w, T.s1.h); });
    pass(P.blur, T.s1b, T.s1, (uu) => { gl.uniform2f(uu.uDir, 9 / T.s1.w, 0); gl.uniform2f(uu.uRes, T.s1.w, T.s1.h); });
    pass(P.blur, T.s1, T.s1b, (uu) => { gl.uniform2f(uu.uDir, 22 / T.s1.w, 0); gl.uniform2f(uu.uRes, T.s1.w, T.s1.h); });
    pass(P.blur, T.b1b, T.b1, (uu) => { gl.uniform2f(uu.uDir, 1 / T.b1.w, 0); gl.uniform2f(uu.uRes, T.b1.w, T.b1.h); });
    pass(P.blur, T.b1, T.b1b, (uu) => { gl.uniform2f(uu.uDir, 0, 1 / T.b1.h); gl.uniform2f(uu.uRes, T.b1.w, T.b1.h); });
    pass(P.blur, T.b2, T.b1, (uu) => { gl.uniform2f(uu.uDir, 1.6 / T.b2.w, 0); gl.uniform2f(uu.uRes, T.b2.w, T.b2.h); });
    pass(P.blur, T.b2b, T.b2, (uu) => { gl.uniform2f(uu.uDir, 0, 1.6 / T.b2.h); gl.uniform2f(uu.uRes, T.b2.w, T.b2.h); });
    pass(P.down, T.d1, T.scene, (uu) => gl.uniform2f(uu.uTexel, 1 / T.d1.w, 1 / T.d1.h));
    pass(P.blur, T.d1b, T.d1, (uu) => { gl.uniform2f(uu.uDir, 1.4 / T.d1.w, 0); gl.uniform2f(uu.uRes, T.d1.w, T.d1.h); });
    pass(P.blur, T.d1, T.d1b, (uu) => { gl.uniform2f(uu.uDir, 0, 1.4 / T.d1.h); gl.uniform2f(uu.uRes, T.d1.w, T.d1.h); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    u = use(P.comp);
    [[T.scene, "uScene"], [T.b1, "uB1"], [T.b2b, "uB2"], [T.d1, "uSoft"], [T.s1, "uStreak"]].forEach(([x, name], k) => { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, x.t); gl.uniform1i(u[name], k); });
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, T.depthT); gl.uniform1i(u.uDepth, 5); gl.activeTexture(gl.TEXTURE0);
    // where the sun is on screen, for the rays
    const sp = [eye[0] + SUN[0] * 2000, eye[1] + SUN[1] * 2000, eye[2] + SUN[2] * 2000];
    const sx = vp[0] * sp[0] + vp[4] * sp[1] + vp[8] * sp[2] + vp[12], sy = vp[1] * sp[0] + vp[5] * sp[1] + vp[9] * sp[2] + vp[13], sw = vp[3] * sp[0] + vp[7] * sp[1] + vp[11] * sp[2] + vp[15];
    const onScreen = sw > 0 ? smooth(1.6, 0.9, Math.max(Math.abs(sx / sw), Math.abs(sy / sw))) : 0;
    gl.uniform3f(u.uSun, sx / sw * 0.5 + 0.5, sy / sw * 0.5 + 0.5, onScreen * dawn);
    gl.uniform1f(u.uFocus, Math.hypot(look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]));
    gl.uniform1f(u.uDof, reduced ? 0.1 : Math.min(1, 0.12 + travel * 0.7));
    gl.uniform1f(u.uTravel, travel); gl.uniform1f(u.uBroken, broken); gl.uniform1f(u.uDawn, dawn); gl.uniform1f(u.uNight, night);
    gl.uniform2f(u.uRes, canvas.width, canvas.height); gl.uniform1f(u.uTime, t); gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduced) kick();
  }
  function kick() { if (!raf && shown) raf = requestAnimationFrame(frame); }
  let held = null;
  const onScroll = () => { if (held === null) goalS = story(); kick(); };
  // resolution follows the machine: it rises on a fast GPU and falls on a slow one, in coarse steps
  const STEPS = [0.6, 0.75, 1, 1.25, 1.5, 1.75, 2].filter((v) => v <= Math.max(1, devicePixelRatio)); let q = STEPS.indexOf(1) >= 0 ? STEPS.indexOf(1) : STEPS.length - 1, ema = 1 / 60, frames = 0;
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
  if (location.search.includes("film-debug")) {
    window.__filmStep = (n = 40, snap = false) => { goalS = story(); if (snap) { current = goalS; vel = 0; } for (let k = 0; k < n; k++) frame(performance.now() + k * 16); return { target: goalS, current }; };
    // a shot by its number, for stills: the camera is placed there and held
    window.__filmShot = (n, frames = 30) => { held = n; goalS = current = n; vel = 0; for (let k = 0; k < frames; k++) frame(performance.now() + k * 16); return n; };
  }
}

// ---------- the clock: one night in the market, from just before midnight to sunrise, and the chapter ----------
if (chapters.length && cinema) {
  const bar = document.createElement("div"); bar.className = "film-progress"; bar.setAttribute("aria-hidden", "true");
  const code = document.createElement("div"); code.className = "film-timecode"; code.setAttribute("aria-hidden", "true");
  document.body.append(bar, code);
  const names = chapters.map((c) => (c.querySelector(".kicker")?.textContent ?? "").replace(/^\s*\d+\s*/, "").trim());
  let lastCode = "";
  const tick = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty("--p", (max > 0 ? scrollY / max : 0).toFixed(4));
    const { i, p } = scrollState();
    const minutes = Math.round(23 * 60 + 58 + ((i + p) / Math.max(1, chapters.length - 1)) * 374) % 1440;
    const text = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} · ${names[i]}`;
    if (text !== lastCode) { code.textContent = text; lastCode = text; }
  };
  tick(); addEventListener("scroll", tick, { passive: true }); addEventListener("resize", tick);
}

// ---------- stops: the scroll comes to rest on every chapter ----------
// With a mouse or trackpad on a screen tall enough for a chapter, one gesture moves one chapter: a flick of the wheel or
// a swipe of the trackpad, an arrow key, Page Up or Down or the space bar glides to the next chapter in one movement and
// stops there, and a swipe's momentum never carries the reader past a chapter. A dragged scrollbar, a search in the
// page or a focused link settles on the nearest chapter. On a touch screen the browser stops at every chapter and
// section itself (CSS scroll snap). After the film, from the side-by-side table on, the page scrolls freely.
let glideTo = null;
if (chapters.length) {
  const glideMQ = matchMedia("(pointer: fine) and (min-width: 769px) and (min-height: 600px)");
  const touchMQ = matchMedia("(pointer: coarse)");
  const mode = () => { root.classList.toggle("stops-glide", glideMQ.matches); root.classList.toggle("stops-touch", !glideMQ.matches && touchMQ.matches); };
  root.classList.add("film-stops"); mode();
  glideMQ.addEventListener?.("change", mode); touchMQ.addEventListener?.("change", mode);

  const after = document.querySelector(".home-compare");
  const top = (el) => el.getBoundingClientRect().top + scrollY;
  const end = () => (after ? top(after) : document.documentElement.scrollHeight - innerHeight);
  const inFilm = (dir) => scrollY < end() - 2 || (dir < 0 && scrollY < end() + 2);
  // where the scroll may rest: each chapter's top (and its foot, when it is taller than the screen), then the table after the film
  const rests = () => { const out = []; for (const c of chapters) { const t = top(c); out.push(t); if (c.offsetHeight > innerHeight + 4) out.push(t + c.offsetHeight - innerHeight); } out.push(end()); return out; };
  const chapterAt = (y) => chapters.findIndex((c) => Math.abs(top(c) - y) < 2);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  let gliding = false;
  glideTo = (y, chapter = chapterAt(y)) => {
    const from = scrollY, screens = Math.abs(y - from) / innerHeight;
    if (screens * innerHeight < 1) return;
    const ms = reduced ? 0 : Math.min(2200, 950 + 260 * Math.max(0, screens - 1));
    landing = chapter; gliding = true; root.classList.add("gliding");
    const t0 = performance.now();
    const step = (now) => {
      const k = ms ? clamp((now - t0) / ms) : 1;
      scrollTo(0, from + (y - from) * ease(k));
      if (k < 1) requestAnimationFrame(step);
      else {
        gliding = false; root.classList.remove("gliding"); landing = -1; reveal();
        const next = wheel.next; wheel.next = 0; if (next && inFilm(next)) go(next);
      }
    };
    requestAnimationFrame(step);
  };
  const go = (dir) => {
    const list = rests(), y = scrollY;
    const to = dir > 0 ? list.find((v) => v > y + 2) : list.findLast((v) => v < y - 2);
    if (to !== undefined) glideTo(to);
  };

  // A gesture is a run of wheel events without a pause. It moves one chapter as soon as it has gone far enough to mean
  // it. After that it moves another only if it is a fresh swipe on top of the old one's momentum: the scroll has slowed
  // from its peak and then speeds up sharply again. Speeds are pixels per millisecond over short windows, so events the
  // browser merged or delayed under load never read as a new swipe. A gesture that arrives while the scroll is still
  // gliding waits for it (one at most), and the momentum of a gesture that already moved the page is spent quietly,
  // even once it has carried the page onto the table after the film.
  const wheel = { at: -1e9, ev: [], sum: 0, moved: false, peak: 0, low: Infinity, slowed: false, next: 0 };
  const rate = (from, to) => { let px = 0; for (const [t, d] of wheel.ev) if (t > from && t <= to) px += d; return px / (to - from); };
  addEventListener("wheel", (e) => {
    if (!glideMQ.matches || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const now = e.timeStamp, gap = now - wheel.at, dir = Math.sign(e.deltaY);
    if (!inFilm(dir) && !(wheel.moved && gap <= 200)) return;
    e.preventDefault();
    wheel.at = now;
    if (gap > 200) Object.assign(wheel, { ev: [], sum: 0, moved: false, peak: 0, low: Infinity, slowed: false });
    const d = Math.abs(e.deltaY) * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? innerHeight : 1);
    wheel.sum += d; wheel.ev.push([now, d]); while (wheel.ev.length && wheel.ev[0][0] < now - 400) wheel.ev.shift();
    const r = rate(now - 60, now);
    wheel.peak = Math.max(wheel.peak, r);
    if (r < 0.6 * wheel.peak) wheel.slowed = true;
    if (wheel.slowed) wheel.low = Math.min(wheel.low, r);
    if (d < 1 || !inFilm(dir)) return;
    const meant = !wheel.moved && wheel.sum >= 6;
    const again = wheel.moved && wheel.slowed && r > Math.max(0.3, 2.2 * wheel.low);
    if (!meant && !again) return;
    if (again) Object.assign(wheel, { peak: r, low: Infinity, slowed: false });
    wheel.moved = true;
    if (gliding) wheel.next = wheel.next || dir; else go(dir);
  }, { passive: false });

  addEventListener("keydown", (e) => {
    if (!glideMQ.matches || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])")) return;
    if (e.key === "Home" && scrollY < end() + 2) { e.preventDefault(); glideTo(0); return; }
    const space = e.key === " " && !t.closest?.("button, summary, a, [role=button]");
    const dir = e.key === "ArrowDown" || e.key === "PageDown" || (space && !e.shiftKey) ? 1 : e.key === "ArrowUp" || e.key === "PageUp" || (space && e.shiftKey) ? -1 : 0;
    if (!dir || !inFilm(dir)) return;
    e.preventDefault();
    if (!gliding) go(dir);
  });

  // a dragged scrollbar, a search in the page or a focused link: settle on the nearest chapter once the scroll ends
  const settle = () => {
    if (gliding || !glideMQ.matches || scrollY >= end() - 2) return;
    let best = 0, gap = Infinity;
    for (const v of rests()) if (Math.abs(v - scrollY) < gap) { gap = Math.abs(v - scrollY); best = v; }
    if (gap > 2) glideTo(best);
  };
  if ("onscrollend" in window) addEventListener("scrollend", settle);
  else { let timer = 0; addEventListener("scroll", () => { clearTimeout(timer); timer = setTimeout(settle, 240); }, { passive: true }); }

  // links within the page glide too, and still land focus where a keyboard user expects it
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.('a[href^="#"], a[href^="/#"]'); if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || !glideMQ.matches) return;
    const id = a.getAttribute("href").replace(/^\/?#/, ""), el = id && document.getElementById(id); if (!el) return;
    e.preventDefault(); history.replaceState(null, "", `#${id}`);
    const k = chapters.indexOf(el.closest("[data-chapter]"));
    glideTo(k >= 0 ? top(chapters[k]) : top(el) - 72, k);
    setTimeout(() => el.querySelector?.("a, button, input, pre")?.focus({ preventScroll: true }), 1000);
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
    a.addEventListener("click", (e) => { if (!glideTo || !root.classList.contains("stops-glide")) return; e.preventDefault(); e.stopPropagation(); glideTo(scrollY + c.getBoundingClientRect().top); history.replaceState(null, "", a.href); });
    return a;
  });
  document.body.append(rail);
  let lastI = -1;
  const mark = () => { const { i: at, p } = scrollState(), i = Math.min(chapters.length - 1, at + (p > 0.5 ? 1 : 0)); if (i === lastI) return; lastI = i;
    links.forEach((a, k) => (k === i ? a.setAttribute("aria-current", "step") : a.removeAttribute("aria-current"))); };
  mark(); addEventListener("scroll", mark, { passive: true });
}

if (chapters.length && !navigator.connection?.saveData) {
  const go = () => { try { start(); } catch (err) { root.classList.add("no-webgl"); if (location.search.includes("film-debug")) console.error(String(err)); } };
  if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 1200 }); else addEventListener("load", go);
}
