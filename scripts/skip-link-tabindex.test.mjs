// A skip link only works if the element it jumps to can actually receive
// focus. A plain <main id="content"> (or a tool page's workbench <section>)
// is not focusable by default, so activating the skip link moved the visual
// scroll position but left keyboard focus behind on the link itself: the
// next Tab press resumed from the top of the page instead of the content.
// tabindex="-1" makes the target programmatically focusable without adding
// it to the normal tab order.
//
// Scoped to the pages a real accessibility audit found this on: developers,
// every tool under /tools, founder, foundry, notes (index and every
// published note), methodology and verify. Other generated pages were not
// part of that audit and are not asserted here; this guard would need to
// grow with them if they are fixed later, not silently claim they already
// are.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const noteFiles = readdirSync(resolve(ROOT, "notes"))
  .filter((f) => f.endsWith(".html"))
  .map((f) => `notes/${f}`);

const PAGES = [
  "developers.html",
  "tools/deflated-sharpe.html",
  "tools/backtest-overfitting.html",
  "tools/breadth.html",
  "tools/execution.html",
  "tools/evidence-chain.html",
  "tools/selection-risk.html",
  "tools/trial-accounting.html",
  "founder.html",
  "foundry.html",
  "notes.html",
  ...noteFiles,
  "methodology.html",
  "verify.html",
];

function skipLinkTargets(html) {
  return Array.from(html.matchAll(/class="[\w-]*skip"[^>]*href="#([\w-]+)"/g)).map((m) => m[1]);
}

function hasFocusableTarget(html, id) {
  const tagMatch = html.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`));
  if (!tagMatch) return false;
  return /\btabindex="-1"/.test(tagMatch[0]);
}

for (const page of PAGES) {
  test(`${page}: every skip-link target is focusable (tabindex="-1")`, () => {
    const html = readFileSync(resolve(ROOT, page), "utf8");
    const targets = skipLinkTargets(html);
    assert.ok(targets.length > 0, `${page}: no skip link found to check`);
    for (const id of targets) {
      assert.ok(hasFocusableTarget(html, id), `${page}: #${id} (the skip link target) is missing tabindex="-1"`);
    }
  });
}
