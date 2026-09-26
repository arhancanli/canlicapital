import assert from "node:assert/strict";
import test from "node:test";

import { DESCRIPTION_MAX, DESCRIPTION_MIN, fitDescription, sentences } from "./descriptions.mjs";

test("decimal points and dotted tokens are not sentence ends", () => {
  assert.deepEqual(sentences("A Sharpe of 0.59 held. It fell to -0.2 later! Why?"), ["A Sharpe of 0.59 held.", "It fell to -0.2 later!", "Why?"]);
});

test("a short lead is extended with the page's own next sentences up to the window", () => {
  const out = fitDescription("The lake has no October 2025 CPI level.", [
    "The release was cancelled during the shutdown, so the value is absent, not late.",
    "Forward returns are unaffected because the sleeve reads only published levels.",
  ]);
  assert.ok(out.length >= DESCRIPTION_MIN && out.length <= DESCRIPTION_MAX, `${out.length}: ${out}`);
  assert.ok(out.startsWith("The lake has no October 2025 CPI level. The release was cancelled"));
});

test("a long lead is cut at a sentence end, and a lead inside the window is left alone", () => {
  const long = `${"Word ".repeat(20).trim()}. ${"More ".repeat(40).trim()}.`;
  assert.ok(fitDescription(long).length <= DESCRIPTION_MAX);
  const ok = "x".repeat(DESCRIPTION_MIN + 2);
  assert.equal(fitDescription(ok, ["Never added."]), ok);
});

test("with nothing more to say, a short lead stays as it is (never padded)", () => {
  assert.equal(fitDescription("A short but complete description."), "A short but complete description.");
});

test("a long lead whose first sentence ends early keeps as much of the lead as fits", () => {
  const lead = "This receipt freezes a future disjoint classifier-confirmation design. It does not authorize corpus acquisition, labelling, returns, or any change to the live book or its sleeves.";
  const out = fitDescription(lead);
  assert.ok(out.length >= 150 && out.length <= 160, `${out.length}: ${out}`);
  assert.ok(out.startsWith("This receipt freezes a future disjoint classifier-confirmation design. It does not authorize"));
});
