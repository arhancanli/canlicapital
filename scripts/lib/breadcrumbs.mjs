// Breadcrumbs for every indexable page: a BreadcrumbList in JSON-LD (what search results show) and the
// same trail as a visible <nav aria-label="Breadcrumb"> (what a reader and a crawler follow).
//
// The trail is Home, then each ancestor path that is itself a page, then the page. A page that already
// declares a BreadcrumbList keeps it, and its visible trail is drawn from that declaration, so the two
// never disagree. Labels come from each page's own <title> (before " | Canli Capital"), so a crumb never
// says anything its page does not.

export const ORIGIN = "https://canlicapital.com";
const HOME = ["Canli Capital", "/"];

const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const unesc = (v) => String(v).replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

// "Deflated Sharpe calculator | Canli Capital" -> "Deflated Sharpe calculator". A label stops at a dash
// or colon break so it stays a name, not a sentence.
export function pageLabel(html) {
  const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1];
  if (!title) return null;
  let label = unesc(title).replace(/\s+/g, " ").trim().replace(/\s*[|·/]\s*Canli( Capital)?\s*$/i, "").replace(/^Canli Capital\s*[|:·/]\s*/i, "");
  label = label.split(/\s[\u2014\u2013-]\s|:\s/)[0].trim();
  return label || null;
}

export const isNoindex = (html) => /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);

// "/research/null-zoo-v0" -> ["/research", "/research/null-zoo-v0"].
export function ancestors(path) {
  const parts = path.split("/").filter(Boolean);
  return parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/"));
}

// labels: Map(path -> label) of every page in the build.
export function computedTrail(path, labels) {
  const trail = [HOME];
  for (const step of ancestors(path)) if (labels.has(step)) trail.push([labels.get(step), step]);
  if (trail.at(-1)[1] !== path) return null; // the page itself has no label
  return trail;
}

export function declaredTrail(html) {
  for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(body); } catch { continue; }
    const nodes = [data, ...(Array.isArray(data) ? data : []), ...(data?.["@graph"] ?? [])].flat();
    const list = nodes.find((node) => node?.["@type"] === "BreadcrumbList");
    if (list?.itemListElement?.length) {
      return [...list.itemListElement].sort((a, b) => a.position - b.position)
        .map((item) => [item.name, String(item.item ?? item["@id"] ?? "").replace(ORIGIN, "") || "/"]);
    }
  }
  return null;
}

export const jsonLd = (trail) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: trail.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path === "/" ? "" : path}` })) }).replaceAll("<", "\\u003c")}</script>`;

export const visibleNav = (trail) => `<nav class="cc-crumbs" aria-label="Breadcrumb"><ol>${trail.map(([name, path], i) =>
  `<li>${i === trail.length - 1 ? `<span aria-current="page">${esc(name)}</span>` : `<a href="${esc(path)}">${esc(name)}</a>`}</li>`).join("")}</ol></nav>`;

// Aligned with the page content (inside <main>, so it takes main's padding); every child reset so page-level link and list styles
// cannot shift one crumb against the others.
const STYLE = `<style data-cc-crumbs>.cc-crumbs{margin:0;padding:.9rem 0 .25rem;font:500 .82rem/1.4 inherit;letter-spacing:0}.cc-crumbs ol{list-style:none;display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;margin:0;padding:0}.cc-crumbs li{display:inline-flex;align-items:baseline;margin:0;padding:0;font:inherit}.cc-crumbs li+li::before{content:"/";margin-right:.35rem;opacity:.45}.cc-crumbs a,.cc-crumbs span{font:inherit;line-height:inherit;margin:0;padding:0;border:0;background:none;color:inherit;text-decoration:none;vertical-align:baseline}.cc-crumbs a{opacity:.7}.cc-crumbs a:hover,.cc-crumbs a:focus-visible{opacity:1;text-decoration:underline}.cc-crumbs [aria-current]{opacity:.95}</style>`;

// Returns the page with whatever it was missing; a page with both is returned unchanged.
export function completeBreadcrumbs(html, path, labels) {
  if (path === "/" || isNoindex(html)) return html;
  const declared = declaredTrail(html);
  const trail = declared ?? computedTrail(path, labels);
  if (!trail || trail.length < 2) return html;
  let out = html;
  if (!declared) out = out.replace("</head>", `${jsonLd(trail)}\n</head>`);
  if (!/aria-label="Breadcrumb"/.test(out)) {
    const main = /<main\b[^>]*>/.exec(out);
    if (main) {
      out = out.slice(0, main.index + main[0].length) + visibleNav(trail) + out.slice(main.index + main[0].length);
      if (!out.includes("data-cc-crumbs")) out = out.replace("</head>", `${STYLE}\n</head>`);
    }
  }
  return out;
}
