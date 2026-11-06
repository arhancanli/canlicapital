// =============================================================================
// CANLI CAPITAL / scripts/build-home-doors.mjs
// -----------------------------------------------------------------------------
// Writes what sits under the homepage's checker into index.html, between
// <!-- home-doors:start --> and <!-- home-doors:end -->: three short facts that
// stand behind a check, then three doors (a company, learning, AI and
// developers). The figures come from two published files, the weekly
// fresh-filings test and the finance MCP head-to-head summary, so they move when
// those files move, and audit-published-numbers traces each one to them.
//
// Idempotent: a second run writes the same bytes.
//   node scripts/build-home-doors.mjs
// =============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { esc } from "./lib/clear-page.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PAGE = "index.html";
export const SOURCES = Object.freeze({
  fresh: "public/benchmarks/fresh-filings.json",
  h2h: "public/benchmarks/finance-mcp-servers.json",
});
export const REGION = Object.freeze(["<!-- home-doors:start -->", "<!-- home-doors:end -->"]);
const integer = new Intl.NumberFormat("en-US");

/** The latest week's two runs: the AI with canli-mcp and the same AI alone. */
export function weekRuns(fresh) {
  const week = fresh.weeks?.[0];
  const tooled = week?.runs?.find((r) => r.with), alone = week?.runs?.find((r) => !r.with);
  if (!tooled || !alone) throw new Error("build-home-doors: the latest fresh-filings week needs a run with canli-mcp and one without");
  return { tooled, alone };
}

export function renderHomeDoors(fresh, h2h) {
  const { tooled, alone } = weekRuns(fresh);
  const tools = h2h.flagship?.tools;
  if (!Number.isSafeInteger(tools) || tools < 1) throw new Error("build-home-doors: the head-to-head summary has no flagship tool count");
  const facts = [
    [`${integer.format(tooled.correct)} of ${integer.format(tooled.questions)}`, `questions on that week's new filings, answered right by an AI using our data. Without it: ${integer.format(alone.correct)} of ${integer.format(alone.questions)}.`, ["/benchmarks/fresh-filings", "The weekly test"]],
    ["Every figure", "links to the filing it came from, on SEC.gov."],
    ["Mistakes stay public", "Each correction is published with what changed.", ["/progress#corrections", "Corrections"]],
  ];
  const doors = [
    ["A company", "/companies", "Look up a company", "Its filed figures, year by year, each linked to its filing."],
    ["Learning", "/learn", "Learn to read the numbers", "Short lessons, shown with real filings."],
    ["AI and developers", "/mcp-servers", "Give your AI real financial data", `canli-mcp: ${integer.format(tools)} finance tools for Claude, ChatGPT and Cursor. Free, no key.`],
  ];
  return `    <section class="ck-proof" aria-label="What stands behind a check">
      <ul>
${facts.map(([figure, line, link]) => `        <li><b>${esc(figure)}</b> <span>${esc(line)}</span>${link ? ` <a href="${esc(link[0])}">${esc(link[1])}</a>` : ""}</li>`).join("\n")}
      </ul>
    </section>

    <section class="ck-doors" aria-labelledby="ck-doors-title">
      <h2 class="ck-hidden" id="ck-doors-title">Start here</h2>
      <ul>
${doors.map(([who, href, title, line]) => `        <li class="ck-door"><p class="ck-door__who">${esc(who)}</p><h3><a href="${esc(href)}">${esc(title)}</a></h3><p>${esc(line)}</p></li>`).join("\n")}
      </ul>
    </section>`;
}

export function buildHomeDoors(page, fresh, h2h) {
  const [open, close] = REGION;
  const start = page.indexOf(open);
  const end = page.indexOf(close);
  if (start < 0 || end < start || page.indexOf(open, start + 1) >= 0) throw new Error(`build-home-doors: ${PAGE} needs exactly one ${open} ... ${close} region`);
  return `${page.slice(0, start + open.length)}\n${renderHomeDoors(fresh, h2h)}\n    ${page.slice(end)}`;
}

export function readSources(root = ROOT) {
  return {
    fresh: JSON.parse(readFileSync(resolve(root, SOURCES.fresh), "utf8")),
    h2h: JSON.parse(readFileSync(resolve(root, SOURCES.h2h), "utf8")),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { fresh, h2h } = readSources();
  const path = resolve(ROOT, PAGE);
  const before = readFileSync(path, "utf8");
  const after = buildHomeDoors(before, fresh, h2h);
  if (after !== before) writeFileSync(path, after);
  console.log(`  home doors: ${after === before ? "unchanged" : "rewritten"} (three facts and three doors from ${Object.values(SOURCES).join(", ")})`);
}
