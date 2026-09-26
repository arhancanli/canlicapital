// Structured-data rules checked on every built page (scripts/audit-onpage.mjs).
//
// Google requires "name" and "description" on every schema.org Dataset node, including a Dataset
// nested inside another page's markup; each one lacking them is an invalid item in Search Console.
// On 2026-09-26 Search Console reported 317 invalid Dataset items, all missing "description": the
// name-and-URL entries that /trials and /measurements listed in hasPart (228 + 89).

const typesOf = (node) => (Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

// Every problem in one page's JSON-LD: blocks that do not parse, and Dataset nodes without a
// non-empty name and description. Returns messages; an empty list means the page passes.
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
  });
  return problems;
}
