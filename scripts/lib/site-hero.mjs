// The cinematic header every page except the homepage opens with: a still from the homepage film behind the
// page's own breadcrumb trail, label, title, summary line and actions.
//
// The page generators keep writing their own openers. This runs after them (scripts/build-site-design.mjs):
// it lifts the title and the elements around it out of whatever opener a page has and sets them in one header
// at the top of <main>. Everything else the old opener held (a measurement card, a status panel, a calculator's
// source notice) stays where it was. A page that already has the header is left alone, so a second run is
// byte-identical.
//
// The stills are frames of js/home-film.js, rendered once and kept in public/scenes. Each part of the site has
// its own: research in the rain on Wall Street at night, the MCP servers on the orb of tools, the benchmarks at
// the five towers, ALPHAC's record over the city from above, company data among the towers of filings, the
// founder at the water at first light, and the vision at sunrise over the harbour.

export const SCENES = ["canyon", "gates", "orb", "towers", "aerial", "district", "rail", "harbour"];

const BY_PATH = [
  [/^mcp-servers/, "orb"],
  [/^benchmarks\//, "towers"],
  [/^companies/, "district"],
  [/^(founder|contributors)\.html$/, "rail"],
  [/^(vision|stats)\.html$/, "harbour"],
  [/^(developers|tools|annotate|verify|standards)\b/, "gates"],
  [/^(record|systems|performance|progress|engineering|foundry|costs|open|review)\.html$/, "aerial"],
  [/^(research|trials|measurements|notes|publication|datasets|methodology|how-to-validate-a-backtest)\b/, "canyon"],
];

export function sceneFor(file) {
  for (const [pattern, scene] of BY_PATH) if (pattern.test(file)) return scene;
  return "aerial";
}

export function heroArt(scene) {
  const set = (fmt, ...widths) => widths.map((w) => `/scenes/${scene}-${w}.${fmt} ${w}w`).join(", ");
  return `<picture class="cc-hero__art" aria-hidden="true">`
    + `<source type="image/avif" media="(max-width: 768px)" srcset="/scenes/${scene}-900.avif">`
    + `<source type="image/webp" media="(max-width: 768px)" srcset="/scenes/${scene}-900.webp">`
    + `<source type="image/avif" srcset="${set("avif", 1600, 2400)}" sizes="100vw">`
    + `<source type="image/webp" srcset="${set("webp", 1600, 2400)}" sizes="100vw">`
    + `<img src="/scenes/${scene}-1600.webp" alt="" width="1600" height="560" fetchpriority="high" decoding="async">`
    + `</picture>`;
}

// The extent of the element that starts at `start` (a "<tag" position): through its matching end tag.
function elementEnd(html, start) {
  const tag = /^<([a-z][a-z0-9-]*)/i.exec(html.slice(start, start + 40))?.[1]?.toLowerCase();
  if (!tag) return -1;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    if (m[1]) { depth -= 1; if (depth === 0) return m.index + m[0].length; }
    else if (!m[0].endsWith("/>")) depth += 1;
  }
  return -1;
}

// The element that ends just before `pos` (skipping whitespace and comments), as [start, end], when it is a <p>.
function paragraphBefore(html, pos) {
  const before = html.slice(0, pos).replace(/(\s|<!--[\s\S]*?-->)*$/, "");
  if (!before.endsWith("</p>")) return null;
  const start = before.lastIndexOf("<p");
  if (start < 0 || !/^<p[\s>]/.test(html.slice(start, start + 3))) return null;
  const end = elementEnd(html, start);
  return end === before.length ? [start, end] : null;
}

// The element that starts just after `pos` (skipping whitespace and comments), as [start, end].
function elementAfter(html, pos) {
  const lead = /^(\s|<!--[\s\S]*?-->)*/.exec(html.slice(pos))[0].length;
  const start = pos + lead;
  if (html[start] !== "<" || html[start + 1] === "/") return null;
  const end = elementEnd(html, start);
  return end > start ? [start, end] : null;
}

const classOf = (html, [start]) => /^<[a-z][^>]*\bclass="([^"]*)"/i.exec(html.slice(start, start + 400))?.[1] ?? "";
const tagOf = (html, [start]) => /^<([a-z][a-z0-9-]*)/i.exec(html.slice(start, start + 20))?.[1]?.toLowerCase();

// The visible trail: one the page already has, else the one scripts/lib/breadcrumbs.mjs would add.
function crumbsOf(html, mainStart, h1Start, trailNav) {
  const region = html.slice(mainStart, h1Start);
  const at = region.search(/<nav\b[^>]*(aria-label="Breadcrumb"|class="(cc-crumbs|paper__crumbs)")/);
  if (at >= 0) { const start = mainStart + at; const end = elementEnd(html, start); if (end > start) return { range: [start, end] }; }
  return trailNav ? { html: trailNav } : null;
}

export function applyHero(html, file, { trailNav = null } = {}) {
  if (html.includes('<header class="cc-hero"')) return html;
  const main = /<main\b[^>]*>/.exec(html);
  if (!main) return html;
  const mainStart = main.index, inner = main.index + main[0].length;
  const h1Start = html.indexOf("<h1", inner);
  const mainEnd = html.indexOf("</main>", inner);
  if (h1Start < 0 || (mainEnd >= 0 && h1Start > mainEnd)) return html;
  const h1End = html.indexOf("</h1>", h1Start) + 5;

  const take = []; // [start, end] ranges lifted into the header
  const parts = { eyebrow: "", lede: "", meta: "", actions: "" };
  const eyebrow = paragraphBefore(html, h1Start);
  if (eyebrow && /(kicker|eyebrow)/.test(classOf(html, eyebrow))) { parts.eyebrow = html.slice(...eyebrow); take.push(eyebrow); }
  // after the title: up to three of a summary line, a byline or key, and the actions, in any order
  let pos = h1End;
  for (let k = 0; k < 3; k++) {
    const next = elementAfter(html, pos);
    if (!next) break;
    const cls = classOf(html, next), tag = tagOf(html, next);
    if (tag === "p" && !parts.lede && /(lead|lede|dek|intro|standfirst|question)/.test(cls)) parts.lede = html.slice(...next);
    else if (tag === "p" && !parts.meta && /(byline|meta|__key)/.test(cls)) parts.meta = html.slice(...next);
    else if ((tag === "div" || tag === "p") && !parts.actions && /(actions|hero-links)/.test(cls)) parts.actions = html.slice(...next);
    else break;
    take.push(next);
    pos = next[1];
  }
  // a hero's own actions a little further down (a calculator explains itself first) still belong in the band
  if (!parts.actions) {
    const stop = [html.indexOf("<h2", pos), html.indexOf("</section>", pos), html.indexOf("</header>", pos)].filter((x) => x >= 0);
    const near = html.slice(pos, Math.min(...stop, pos + 4000)).search(/<(div|p)\b[^>]*class="[^"]*\b(?:[a-z]+-)?hero__actions\b[^"]*"/);
    if (near >= 0) { const start = pos + near, end = elementEnd(html, start); if (end > start) { parts.actions = html.slice(start, end); take.push([start, end]); } }
  }
  const crumbs = crumbsOf(html, inner, eyebrow ? eyebrow[0] : h1Start, trailNav);
  if (crumbs?.range) take.push(crumbs.range);
  const crumbsHtml = crumbs?.range ? html.slice(...crumbs.range) : crumbs?.html ?? "";

  const scene = sceneFor(file);
  const header = `<header class="cc-hero" data-scene="${scene}">${heroArt(scene)}<div class="cc-hero__inner">`
    + crumbsHtml + parts.eyebrow + html.slice(h1Start, h1End) + parts.lede + parts.meta + parts.actions + `</div></header>`;

  // lift the pieces out, last first so earlier positions stay true
  let out = html;
  for (const [start, end] of [...take, [h1Start, h1End]].sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + out.slice(end);
  out = out.slice(0, inner) + header + out.slice(inner);
  // an opener the title has left empty goes with it; one that still holds something becomes the page's first block
  out = out.replace(/<(section|header|div)\b[^>]*\bcc-film-head\b[^>]*>\s*<\/\1>\s*/, "");
  return out.replace(/(<(?:section|header|div)\b[^>]*class="[^"]*)\bcc-film-head\s*/, "$1");
}
