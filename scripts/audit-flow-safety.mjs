// =============================================================================
// audit-flow-safety.mjs
// -----------------------------------------------------------------------------
// The landing page's motion hides elements before revealing them. That is safe
// only while every hiding rule is unreachable in a browser that cannot run the
// animation which un-hides it.
//
// The failure this prevents: a stylesheet says `opacity: 0`, the mechanism that
// restores it does not run, and the page renders blank while its markup insists
// the content is there. A crawler sees nothing, a reader sees nothing, and the
// HTML looks perfect in a diff.
//
// So: every `opacity: 0` and every `scaleY(0)` in the flow stylesheet must sit
// inside `@supports (animation-timeline: ...)`. Checked by brace depth rather
// than by eye, because eyes stop checking after the third read.
// =============================================================================

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(ROOT, "css/flow.css");
const css = readFileSync(FILE, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");

// Walk the file tracking which @supports blocks enclose the cursor.
const HIDING = /opacity:\s*0(?![.\d])|scaleY\(0\)|translate3d\([^)]*?,\s*\d+px/g;
const supportsRanges = [];
// The condition itself contains parentheses -- `(animation-timeline: view())` --
// so it cannot be matched with [^)]*. Scan for the balanced close instead.
for (const match of css.matchAll(/@supports\s*\(/g)) {
  let condDepth = 0;
  let condEnd = match.index + match[0].length - 1;
  for (let i = condEnd; i < css.length; i += 1) {
    if (css[i] === "(") condDepth += 1;
    else if (css[i] === ")") { condDepth -= 1; if (condDepth === 0) { condEnd = i; break; } }
  }
  const condition = css.slice(match.index + match[0].length, condEnd);
  const braceAt = css.indexOf("{", condEnd);
  if (braceAt === -1) continue;
  const open = braceAt;
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  supportsRanges.push({ condition: condition.trim(), start: open, end });
}

const guarded = supportsRanges.filter((r) => /animation-timeline/.test(r.condition));
if (guarded.length === 0) {
  throw new Error("flow safety: no @supports (animation-timeline: ...) block found at all");
}

const escaped = [];
for (const match of css.matchAll(HIDING)) {
  const at = match.index;
  const inside = guarded.some((r) => at > r.start && at < r.end);
  if (!inside) {
    const line = css.slice(0, at).split("\n").length;
    escaped.push(`line ${line}: ${match[0]}`);
  }
}

// A check whose corpus can empty out reports clear forever. There must BE hiding
// rules to guard; if the flow system is ever gutted this fails loudly rather
// than silently passing on an empty file.
const total = [...css.matchAll(HIDING)].length;
if (total < 3) throw new Error(`flow safety: only ${total} hiding declarations found; the stylesheet collapsed`);

console.log(
  `flow safety: ${total} hiding declarations, all inside ` +
  `${guarded.length} animation-timeline @supports block(s), ${escaped.length} escaped`,
);
if (escaped.length) {
  for (const item of escaped) console.log(`  - ${item}`);
  console.log("\nA hiding rule outside @supports renders the page blank in any browser");
  console.log("that cannot run the animation which would restore it.");
  process.exit(1);
}
