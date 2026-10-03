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
// The paper-evidence standard is now included after its saved production page
// failed the focus-target contract. Final standard build output is checked by
// verify-standard-skip-focus.mjs; actual keyboard focus remains a browser check.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertStandardSkipFocus, MAX_STANDARD_HTML_BYTES, readStandardHTML } from "./verify-standard-skip-focus.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const noteFiles = readdirSync(resolve(ROOT, "notes"))
  .filter((f) => f.endsWith(".html"))
  .map((f) => `notes/${f}`);

const PAGES = [
  "standards/paper-evidence.html",
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
  return Array.from(html.matchAll(/<a\b[^>]*>/g)).flatMap(([tag]) => {
    const classes = tag.match(/\bclass="([^"]*)"/)?.[1].split(/\s+/) ?? [];
    if (!classes.some((name) => /^[\w-]*skip$/.test(name) || name === "skip-link")) return [];
    const target = tag.match(/\bhref="#([\w-]+)"/)?.[1];
    return target ? [target] : [];
  });
}

function hasFocusableTarget(html, id) {
  const tagMatch = html.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`));
  if (!tagMatch) return false;
  return /\btabindex="-1"/.test(tagMatch[0]);
}

const STANDARD = '<a class="dev-skip skip-link" href="#content">Skip to content</a><main id="content" tabindex="-1"><h1>Paper evidence</h1></main>';

test("standard focus guard admits the generated mirror and reordered multi-class attributes", () => {
  assert.deepEqual(assertStandardSkipFocus(readFileSync(resolve(ROOT, "standards/paper-evidence.html"), "utf8")),
    { route: "/standards/paper-evidence", target: "content", tabindex: "-1" });
  assert.deepEqual(assertStandardSkipFocus(STANDARD.replace('class="dev-skip skip-link" href="#content"',
    "href='#content' class='extra skip-link dev-skip'")),
    { route: "/standards/paper-evidence", target: "content", tabindex: "-1" });
  assert.deepEqual(skipLinkTargets(STANDARD), ["content"]);
});

test("standard focus guard refuses the old committed and captured-live missing tabindex shape", () => {
  assert.throws(() => assertStandardSkipFocus(STANDARD.replace(' tabindex="-1"', "")), /TARGET_TABINDEX/);
  assert.throws(() => assertStandardSkipFocus(STANDARD.replace('tabindex="-1"', 'tabindex="0"')), /TARGET_TABINDEX/);
});

test("standard focus guard refuses a missing shared-handler class or wrong fragment", () => {
  assert.throws(() => assertStandardSkipFocus(STANDARD.replace("dev-skip skip-link", "dev-skip")), /SKIP_CLASS/);
  assert.throws(() => assertStandardSkipFocus(STANDARD.replace('href="#content"', 'href="#other"')), /SKIP_HREF/);
  assert.deepEqual(skipLinkTargets('<a class="skip-faux nonskipper" href="#content">Other</a>'), []);
});

test("standard focus guard refuses duplicate target IDs, attributes and skip controls", () => {
  assert.throws(() => assertStandardSkipFocus(STANDARD + '<div id="content"></div>'), /TARGET_ID/);
  assert.throws(() => assertStandardSkipFocus(STANDARD.replace('tabindex="-1"', 'tabindex="-1" tabindex="0"')), /DUPLICATE_ATTRIBUTE/);
  assert.throws(() => assertStandardSkipFocus(STANDARD + '<a class="dev-skip skip-link" href="#content">Again</a>'), /SKIP_COUNT/);
});

test("standard focus guard does not accept targets or skip controls inside comments or script examples", () => {
  assert.throws(() => assertStandardSkipFocus(`<!-- ${STANDARD} -->`), /TARGET_ID/);
  assert.throws(() => assertStandardSkipFocus(`<script type="application/json">${STANDARD}</script>`), /TARGET_ID/);
  assert.deepEqual(assertStandardSkipFocus(`<!-- ${STANDARD} --><script>${STANDARD}</script>${STANDARD}`),
    { route: "/standards/paper-evidence", target: "content", tabindex: "-1" });
});

test("standard focus guard cannot join text across ignored spans into a main target", () => {
  for (const span of ["<!-- ignored -->", "<script>ignored</script>", "<style>ignored</style>"]) {
    assert.throws(() => assertStandardSkipFocus(STANDARD.replace("<main", `<ma${span}in`)), /TARGET_ID/);
  }
  assert.deepEqual(assertStandardSkipFocus(`<!-- ordinary comment -->${STANDARD}`),
    { route: "/standards/paper-evidence", target: "content", tabindex: "-1" });
});

test("standard focus guard bounds UTF-8 bytes before tag inspection", () => {
  assert.throws(() => assertStandardSkipFocus(null), /INPUT_TYPE/);
  assert.throws(() => assertStandardSkipFocus(STANDARD + "\u20ac".repeat(700000)), /INPUT_BYTES/);
});

test("standard focus reader admits exact owned bytes and refuses oversized or invalid UTF-8 input", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "canli-standard-focus-"));
  try {
    const normal = resolve(directory, "normal.html");
    writeFileSync(normal, STANDARD);
    assert.equal(readStandardHTML(normal), STANDARD);
    assertStandardSkipFocus(readStandardHTML(normal));
    const large = resolve(directory, "large.html");
    writeFileSync(large, Buffer.alloc(MAX_STANDARD_HTML_BYTES + 1, 32));
    assert.throws(() => readStandardHTML(large), /FILE_BYTES/);
    const invalid = resolve(directory, "invalid.html");
    writeFileSync(invalid, Buffer.from([0xc0, 0xaf]));
    assert.throws(() => readStandardHTML(invalid), TypeError);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

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
