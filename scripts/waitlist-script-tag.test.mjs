// js/waitlist.js was being loaded on open, research, progress, performance and
// systems, none of which carry a #waitlist-form for it to bind to: five wasted
// module fetches on pages where initWaitlist() always hits its own `if (!form)
// return` and does nothing. index.html has the real form, but wires it inline
// in js/home.js rather than through this shared module, so the correct rule
// is one-directional: no page without the form may load the dead script. This
// walks every tracked HTML file so a future page cannot reintroduce the same
// dead include.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "artifacts", ".bak", ".claude", ".firecrawl", "test-results"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(resolve(dir, entry.name), out);
    } else if (entry.name.endsWith(".html")) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

const htmlFiles = walk(ROOT);

test("no page without a #waitlist-form loads the dead js/waitlist.js script", () => {
  const offenders = htmlFiles.filter((file) => {
    const html = readFileSync(file, "utf8");
    const loadsScript = /src="\.?\/?js\/waitlist\.js"/.test(html);
    const hasForm = /id="waitlist-form"/.test(html);
    return loadsScript && !hasForm;
  });
  assert.deepEqual(offenders, [], `js/waitlist.js loaded with no form to bind on: ${offenders.join(", ")}`);
});

test("index.html still carries the real waitlist form the cleanup must not touch", () => {
  const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
  assert.match(html, /id="waitlist-form"/);
});
