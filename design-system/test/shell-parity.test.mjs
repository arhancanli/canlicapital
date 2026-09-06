// Guard test 2: ShellHeader/ShellFooter must render byte-identical markup to
// scripts/product-shell.mjs's own string output, for the same inputs, after whitespace
// normalisation. This is the test that keeps the React Shell from ever silently diverging
// from the real site chrome.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as DS from "../dist/index.js";
import { renderProductShellFooter, renderProductShellHeader } from "../../scripts/product-shell.mjs";

const h = React.createElement;

function normalise(html) {
  return html.replace(/\s+/g, " ").trim();
}

const headerInputs = [
  { active: "", dynamicStatus: false },
  { active: "research", dynamicStatus: false },
  { active: "verify", dynamicStatus: true },
];

for (const input of headerInputs) {
  test(`ShellHeader(${JSON.stringify(input)}) matches renderProductShellHeader byte for byte`, () => {
    const expected = normalise(renderProductShellHeader(input));
    const actual = normalise(renderToStaticMarkup(h(DS.ShellHeader, input)));
    assert.equal(actual, expected);
  });
}

test("ShellFooter matches renderProductShellFooter byte for byte", () => {
  const expected = normalise(renderProductShellFooter());
  const actual = normalise(renderToStaticMarkup(h(DS.ShellFooter)));
  assert.equal(actual, expected);
});
