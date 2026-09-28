// Structured-data rules checked on every built page (scripts/audit-onpage.mjs).
//
// Google requires "name" and "description" on every schema.org Dataset node, including a Dataset
// nested inside another page's markup; each one lacking them is an invalid item in Search Console.
// On 2026-09-26 Search Console reported 317 invalid Dataset items, all missing "description": the
// name-and-URL entries that /trials and /measurements listed in hasPart (228 + 89).

const typesOf = (node) => (Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

// Every problem in one page's JSON-LD: blocks that do not parse, Dataset nodes without a non-empty
// name and description, and the item rules below. Returns messages; an empty list means the page passes.
export function jsonLdProblems(html) {
  const problems = [];
  const blocks = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  blocks.forEach((match, index) => {
    let data;
    try {
      data = JSON.parse(match[1]);
    } catch {
      problems.push(`JSON-LD block ${index + 1} does not parse`);
      return;
    }
    let missing = 0;
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      if (typesOf(node).includes("Dataset") && !(nonEmpty(node.name) && nonEmpty(node.description))) missing += 1;
      Object.values(node).forEach(walk);
    };
    walk(data);
    if (missing) problems.push(`JSON-LD block ${index + 1} has ${missing} Dataset node${missing === 1 ? "" : "s"} without a name and description (Google marks each one invalid)`);
    const top = (Array.isArray(data) ? data : [data]).flatMap((node) => (node && node["@graph"] ? node["@graph"] : [node]));
    for (const node of top) if (node && typeof node === "object") problems.push(...itemProblems(node, index + 1));
    walkAll(data, (node) => problems.push(...everywhereProblems(node, index + 1)));
  });
  return [...new Set(problems)];
}

const ARTICLE_TYPES = new Set(["Article", "ScholarlyArticle", "TechArticle", "BlogPosting", "NewsArticle", "Report"]);
const APP_TYPES = new Set(["SoftwareApplication", "WebApplication", "MobileApplication"]);
export const HEADLINE_MAX = 110;

function walkAll(node, visit) {
  if (Array.isArray(node)) return node.forEach((n) => walkAll(n, visit));
  if (!node || typeof node !== "object") return;
  visit(node);
  Object.values(node).forEach((v) => walkAll(v, visit));
}

// What Google's Rich Results Test and the Schema.org validator report for a page's own items (the
// top-level nodes of a block, or its @graph): an article's headline (at most 110 characters),
// image, dates and an author a reader can follow; an application's category and offer.
function itemProblems(node, block) {
  const out = [];
  const types = typesOf(node);
  const label = `JSON-LD block ${block} ${types.join("/")}`;
  if (types.some((t) => ARTICLE_TYPES.has(t))) {
    if (!nonEmpty(node.headline)) out.push(`${label} has no headline`);
    else if (node.headline.length > HEADLINE_MAX) out.push(`${label} headline is ${node.headline.length} characters (Google reads at most ${HEADLINE_MAX})`);
    for (const key of ["image", "datePublished", "dateModified", "author"]) if (node[key] === undefined) out.push(`${label} has no ${key}`);
    for (const author of [].concat(node.author ?? [])) {
      if (author && typeof author === "object" && !(nonEmpty(author.url) || author.sameAs)) out.push(`${label} names an author without a url`);
    }
  }
  if (types.some((t) => APP_TYPES.has(t))) {
    if (!nonEmpty(node.applicationCategory)) out.push(`${label} has no applicationCategory`);
    if (!node.offers && !node.aggregateRating && !node.review) out.push(`${label} has no offers (Google needs offers or a rating for an app result)`);
  }
  return out;
}

// Rules for every node, nested or not: a breadcrumb trail numbered from 1 with a link on every
// step but the last, and the publisher (this site's Organization) with a logo.
function everywhereProblems(node, block) {
  const out = [];
  const types = typesOf(node);
  if (types.includes("BreadcrumbList")) {
    const items = Array.isArray(node.itemListElement) ? node.itemListElement : [];
    if (!items.length) out.push(`JSON-LD block ${block} BreadcrumbList has no items`);
    items.forEach((item, i) => {
      if (item?.position !== i + 1) out.push(`JSON-LD block ${block} BreadcrumbList positions are not 1 to ${items.length}`);
      if (!nonEmpty(item?.name) && !nonEmpty(item?.item?.name)) out.push(`JSON-LD block ${block} BreadcrumbList has an unnamed step`);
      if (i < items.length - 1 && !item?.item) out.push(`JSON-LD block ${block} BreadcrumbList has a step without a link`);
    });
  }
  if ((types.includes("Organization") || types.includes("Corporation")) && node.url === "https://canlicapital.com" && !node.logo) {
    out.push(`JSON-LD block ${block} names the Canli Capital Organization without a logo`);
  }
  return out;
}
