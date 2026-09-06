import assert from "node:assert/strict";
import test from "node:test";

import { BANNED_BADGE_WORDS, hasBannedWord, renderNotFoundBadge, renderReceiptBadge } from "./badge.js";

// A minimal well-formedness check: every opening tag has a matching close, in the right order, or
// is self-closed. Not a full XML parser, but enough to catch an unescaped "&" or a dangling tag.
function assertWellFormedSvg(svg) {
  assert.match(svg, /^<svg\b[^>]*>[\s\S]*<\/svg>\s*$/, "must be a single <svg>...</svg> document");
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/)?>/g;
  const stack = [];
  let match;
  while ((match = tagPattern.exec(svg))) {
    const [full, name, selfClose] = match;
    if (full.startsWith("</")) {
      assert.equal(stack.pop(), name, `mismatched closing tag </${name}> in: ${svg}`);
    } else if (!selfClose) {
      stack.push(name);
    }
  }
  assert.equal(stack.length, 0, `unclosed tag(s) remain: ${stack.join(",")}`);
}

const noBannedWords = (text) => {
  for (const word of BANNED_BADGE_WORDS) assert.ok(!text.toLowerCase().includes(word), `banned word "${word}" present`);
};

test("hasBannedWord flags every banned word, case-insensitively: the guard the badge relies on can actually fire", () => {
  for (const word of BANNED_BADGE_WORDS) {
    assert.equal(hasBannedWord(`this receipt is ${word}`), true, word);
    assert.equal(hasBannedWord(word.toUpperCase()), true, `${word} uppercase`);
  }
  assert.equal(hasBannedWord("DSR v1 receipt 8f21a0c3b1d2"), false);
});

test("a deflated-sharpe receipt badge shows the formula version and the id prefix, and nothing banned", () => {
  const svg = renderReceiptBadge({ id: "8f21a0c3b1d2aaaaaaaaaaaa", endpoint: "validate/deflated-sharpe", output: { derived_inputs: { observations: 730 } } });
  assertWellFormedSvg(svg);
  assert.match(svg, /DSR v1/);
  assert.match(svg, /8f21a0c3b1d2/);
  noBannedWords(svg);
  assert.ok(!/[✓✔✗✘✅❌]/.test(svg), "no checkmark or cross glyph");
  assert.ok(!/\bpass\b|\bfail\b/i.test(svg), "no pass/fail mark");
});

test("the id prefix shown is exactly the first twelve hex characters, not the full id", () => {
  const svg = renderReceiptBadge({ id: "8f21a0c3b1d2aaaaaaaaaaaa", endpoint: "validate/deflated-sharpe", output: { derived_inputs: { observations: 730 } } });
  assert.match(svg, /receipt 8f21a0c3b1d2(?!a)/);
});

test("the <title> carries the receipt's own sample-size fact for a deflated-sharpe receipt", () => {
  const svg = renderReceiptBadge({ id: "8f21a0c3b1d2aaaaaaaaaaaa", endpoint: "validate/deflated-sharpe", output: { derived_inputs: { observations: 730 } } });
  const title = svg.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  assert.ok(title, "no <title> element");
  assert.match(title, /730/);
  assert.match(title, /observations|sample size/i);
});

test("the <title> carries the receipt's own trial-count fact for an overfitting receipt", () => {
  const svg = renderReceiptBadge({ id: "abcdefabcdefabcdefabcdef", endpoint: "validate/overfitting", output: { n_combinations: 2000 } });
  assertWellFormedSvg(svg);
  assert.match(svg, /PBO v1/);
  const title = svg.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  assert.match(title, /2000/);
  assert.match(title, /trial|combinations/i);
  noBannedWords(svg);
});

test("an endpoint with no sample size or trial count states that plainly, never a fabricated number", () => {
  const svg = renderReceiptBadge({ id: "0011223344556677889900aa", endpoint: "validate/breadth", output: {} });
  const title = svg.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  assert.match(title, /no sleeve count in this receipt/);
});

test("renderNotFoundBadge is a plain grey badge, well-formed, with none of the banned words", () => {
  const svg = renderNotFoundBadge();
  assertWellFormedSvg(svg);
  assert.match(svg, /receipt not found/i);
  assert.match(svg, /fill="#9e9e9e"/, "the not-found badge must be grey");
  noBannedWords(svg);
});

test("an untrusted receipt id is XML-escaped rather than able to break the document", () => {
  // The first twelve characters (the shown prefix) are the injection point that matters: this id
  // puts a raw tag inside that window, not past it, so the test cannot pass by truncation alone.
  const svg = renderReceiptBadge({ id: "<script>xxxxxxxxxxxxxxxxxxxx", endpoint: "validate/deflated-sharpe", output: {} });
  assertWellFormedSvg(svg);
  assert.ok(!svg.includes("<script>"), "raw markup from the id must never reach the document unescaped");
});
