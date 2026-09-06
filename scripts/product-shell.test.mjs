// The shared header/footer chrome pasted or rendered onto every page. Two
// regressions this guards against:
//   1. The header panel's tools nav and the footer's tools nav both used
//      aria-label="Interactive tools", so a screen reader announced two
//      landmarks with the identical name and a reader could not tell them
//      apart. Every aria-label rendered by the shell must be unique.
//   2. The nav said "Status" for /performance while the page itself is
//      titled "Performance", so the same destination read as two different
//      names depending on where you saw the link.
import assert from "node:assert/strict";
import test from "node:test";

import { renderProductShellFooter, renderProductShellHeader } from "./product-shell.mjs";

function ariaLabels(html) {
  return Array.from(html.matchAll(/aria-label="([^"]*)"/g)).map((m) => m[1]);
}

test("every landmark aria-label in the header is unique", () => {
  const labels = ariaLabels(renderProductShellHeader({ active: "" }));
  assert.deepEqual(labels, Array.from(new Set(labels)), `duplicate aria-label in header: ${labels.join(", ")}`);
});

test("every landmark aria-label in the footer is unique", () => {
  const labels = ariaLabels(renderProductShellFooter());
  assert.deepEqual(labels, Array.from(new Set(labels)), `duplicate aria-label in footer: ${labels.join(", ")}`);
});

test("the header panel tools nav and the footer tools nav carry distinct labels", () => {
  const headerLabels = ariaLabels(renderProductShellHeader({ active: "" }));
  const footerLabels = ariaLabels(renderProductShellFooter());
  const shared = headerLabels.filter((l) => footerLabels.includes(l));
  assert.deepEqual(shared, [], `header and footer share an aria-label: ${shared.join(", ")}`);
});

test("the performance link reads the same word everywhere: the page's own name", () => {
  const header = renderProductShellHeader({ active: "" });
  const footer = renderProductShellFooter();
  assert.match(header, /<a class="cc-shell__panel-link" href="\/performance"[^>]*>Performance<\/a>/);
  assert.match(footer, /<a href="\/performance">Performance<\/a>/);
  assert.doesNotMatch(header, />Status</);
  assert.doesNotMatch(footer, />Status</);
});
