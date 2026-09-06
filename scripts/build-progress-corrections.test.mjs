// The corrections record used to exist only as data (public/paper-state.json's
// `transparency` array); no page rendered it as readable text. This pins the
// fix: /progress carries every CORRECTION-prefixed entry, newest first,
// verbatim, ahead of the edge-status section, and the marker-bounded block a
// reader sees is exactly what scripts/build-progress-corrections.mjs would
// write from the CURRENT data, not a snapshot that can drift from it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { escapeHtml, renderCorrectionsList, selectCorrections } from "./build-progress-corrections.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
const state = readJson("public/paper-state.json");
const page = readFileSync(resolve(ROOT, "progress.html"), "utf8");

const START = "<!-- corrections:start -->";
const END = "<!-- corrections:end -->";

function between(html, start, end) {
  const s = html.indexOf(start);
  const e = html.indexOf(end, s);
  assert.ok(s >= 0 && e > s, "markers must exist and be in order");
  return html.slice(s + start.length, e);
}

test("selectCorrections picks exactly the CORRECTION-prefixed entries, newest first", () => {
  const raw = state.transparency.filter((entry) => /^(CORRECTION|RETRACTION|WITHDRAWN)\b/.test(entry));
  const selected = selectCorrections(state.transparency);
  assert.equal(selected.length, raw.length);
  assert.ok(selected.length > 0, "the fixture must actually carry correction entries or this test proves nothing");
  // Every selected entry's own text is one of the raw matches, and none is lost or invented.
  const rawSet = new Set(raw);
  for (const { text } of selected) assert.ok(rawSet.has(text));
  assert.equal(new Set(selected.map((s) => s.text)).size, raw.length, "no duplicates");

  // Newest first: each date is >= the next one.
  for (let i = 1; i < selected.length; i += 1) {
    assert.ok(selected[i - 1].date >= selected[i].date, `entry ${i - 1} (${selected[i - 1].date}) must not be older than entry ${i} (${selected[i].date})`);
  }
});

test("selectCorrections rejects a transparency array that is not an array", () => {
  assert.throws(() => selectCorrections(undefined));
  assert.throws(() => selectCorrections({}));
});

test("escapeHtml neutralizes the five HTML-significant characters", () => {
  assert.equal(escapeHtml(`<a>&"'`), "&lt;a&gt;&amp;&quot;&#39;");
});

test("progress.html's corrections block exists between the markers and is non-empty", () => {
  const inner = between(page, START, END).trim();
  assert.ok(inner.length > 0, "the block between the markers must not be empty");
  assert.match(inner, /<ol class="corrections-list"/);
});

test("the rendered block on disk is exactly what the CURRENT data produces (proves prebuild ran, not a stale copy)", () => {
  const entries = selectCorrections(state.transparency);
  const expected = renderCorrectionsList(entries);
  const actual = between(page, START, END).trim();
  assert.equal(actual, expected);
});

test("every CORRECTION-prefixed entry's full verbatim text is present on the page, unmodified", () => {
  const entries = selectCorrections(state.transparency);
  for (const { text, headLength } of entries) {
    // The head (prefix, date, optional scope) is wrapped in a <time> element for structure, so
    // it is not adjacent to the rest of the string on the page; everything either side of that
    // tag boundary must still be the SAME characters as the source, escaped, never reworded.
    const head = text.slice(0, headLength);
    const rest = text.slice(headLength);
    assert.ok(page.includes(escapeHtml(head)), `head not found verbatim (escaped) on the page: ${head}`);
    assert.ok(page.includes(escapeHtml(rest)), `entry body not found verbatim (escaped) on the page: ${rest.slice(0, 60)}...`);
  }
});

test("the corrections section precedes #edge-status", () => {
  const correctionsAt = page.indexOf('id="corrections"');
  const edgeStatusAt = page.indexOf('id="edge-status"');
  assert.ok(correctionsAt >= 0, "no #corrections section on the page");
  assert.ok(edgeStatusAt >= 0, "no #edge-status section on the page");
  assert.ok(correctionsAt < edgeStatusAt, "#corrections must come before #edge-status");
});

test("progress.html declares its sources so the numbers audit can trace the injected text", () => {
  const declared = page.match(/<meta name="canli:sources" content="([^"]*)"/);
  assert.ok(declared, "progress.html has no canli:sources meta tag");
  assert.ok(declared[1].split(/\s+/).includes("paper-state.json"));
});
