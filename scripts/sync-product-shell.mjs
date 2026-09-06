// =============================================================================
// sync-product-shell.mjs
// -----------------------------------------------------------------------------
// The generated pages get their chrome from product-shell.mjs at build time. The
// six hand-authored pages had it PASTED IN, so every shell change had to be made
// in seven places and the copies had already drifted from the source.
//
// This makes product-shell.mjs the single source of truth for all of them: it
// rewrites the <header class="cc-shell"> and <footer class="cc-footer"> blocks in
// each hand-authored page from the rendered shell. Idempotent -- running it twice
// changes nothing the second time.
//
// Every replacement asserts it matched exactly once. A silent no-op here would
// look identical to success while leaving a page on the old chrome.
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderProductShellFooter, renderProductShellHeader } from "./product-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

//: The pages whose shell is authored inline rather than generated. Every other
//: page with a shell is written by a build-*.mjs script that already calls the
//: renderer, so including it here would be redundant, not wrong.
const HAND_AUTHORED = [
  "index.html",
  "systems.html",
  "open.html",
  "progress.html",
  "performance.html",
  "research.html",
];

function replaceBlock(source, file, openTag, closeTag, replacement) {
  const start = source.indexOf(openTag);
  if (start < 0) throw new Error(`${file}: no ${openTag}`);
  if (source.indexOf(openTag, start + 1) >= 0) throw new Error(`${file}: ${openTag} appears twice`);
  const end = source.indexOf(closeTag, start);
  if (end < 0) throw new Error(`${file}: ${openTag} never closes`);
  return source.slice(0, start) + replacement + source.slice(end + closeTag.length);
}

let changed = 0;
for (const file of HAND_AUTHORED) {
  const path = join(ROOT, file);
  const before = readFileSync(path, "utf8");

  // The page declares its own identity; the shell only reflects it.
  const pageMatch = before.match(/<html[^>]*\sdata-page="([^"]*)"/);
  const active = pageMatch ? pageMatch[1] : "";
  // Only the landing binds a live broker status into the header.
  const dynamicStatus = before.includes('id="header-broker-status"');

  let after = replaceBlock(
    before, file, '<header class="cc-shell"', "</header>",
    renderProductShellHeader({ active, dynamicStatus }),
  );
  after = replaceBlock(
    after, file, '<footer class="cc-footer"', "</footer>",
    renderProductShellFooter(),
  );

  if (after !== before) {
    writeFileSync(path, after);
    changed += 1;
    console.log(`  synced ${file} (active="${active}"${dynamicStatus ? ", live status" : ""})`);
  } else {
    console.log(`  ok     ${file}`);
  }
}
console.log(`\nproduct shell: ${changed} of ${HAND_AUTHORED.length} page(s) rewritten from source`);
