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

test("phase 4 keeps dynamic status out of the stable top row", () => {
  const html=renderProductShellHeader({dynamicStatus:true});
  assert.match(html,/data-shell-revision="5"/);
  assert.ok(html.indexOf('cc-shell__panel-foot') < html.indexOf('id="header-broker-status"'));
  assert.match(html,/<script type="module" src="\/js\/navigation.js"><\/script>/);
  assert.match(html,/<a class="cc-shell__cta" href="\/mcp-servers#install">Add canli-mcp<\/a>/);
  assert.match(html,/href="https:\/\/app.canlicapital.com\/dashboard" rel="noreferrer"[^>]*>Live record</,'the live record stays one click away');
});

test("primary navigation names what a visitor comes for in plain words: the MCP server, company data, research, performance and developers", () => {
  const html=renderProductShellHeader({active:'research'});
  const primary=html.match(/<nav class="cc-shell__primary"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual([...primary.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),['/mcp-servers','/companies','/research','/performance','/developers']);
  assert.doesNotMatch(primary,/aria-current="page"/,'A parent-family match is not necessarily the current page');
});

test("repeated footer workflow is optional, native and preserves its evidence routes", () => {
  const html=renderProductShellFooter();
  assert.match(html,/<details class="cc-footer__context"><summary>/);
  assert.doesNotMatch(html,/<details class="cc-footer__context" open/);
  for(const href of ['/research','/developers#validation','/verify'])assert.ok(html.includes(`href="${href}"`));
  assert.match(html,/A receipt is not proof of future returns/);
});

test("the footer promotes canli-mcp, every public repository and the API key", () => {
  const strip = renderProductShellFooter().match(/<section class="cc-footer__dev"[\s\S]*?<\/section>/)?.[0];
  assert.ok(strip, "the developer strip is missing from the footer");
  for (const href of [
    "https://www.npmjs.com/package/canli-mcp",
    "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.arhancanli/canli-mcp",
    "/mcp-servers/answers",
    "https://github.com/arhancanli/alphac",
    "https://github.com/arhancanli/canli-pit-lake",
    "https://github.com/arhancanli/canli-backtest",
    "/developers#quickstart",
  ]) assert.ok(strip.includes(`href="${href}"`), `the developer strip does not link ${href}`);
  assert.match(strip, /<code>npx -y canli-mcp<\/code>/);
});

test("company pages keep their released footer bytes", () => {
  assert.doesNotMatch(renderProductShellFooter({ developerStrip: false }), /cc-footer__dev/);
});

test("the shared footer follows the public paper record without freezing its start date", () => {
  const html = renderProductShellFooter();
  assert.match(html, /href="\/performance">public paper record and its observation dates<\/a>/);
  assert.doesNotMatch(html, /\b\d{4}-\d{2}-\d{2}\b/);
  assert.match(html, /since July 2024/);
});

test("the Explore menu groups every destination once, by what a visitor wants to do", () => {
  const html = renderProductShellHeader({ active: "" });
  const panel = html.match(/<div class="cc-shell__panel">([\s\S]*?)<div class="cc-shell__panel-foot">/)[1];
  const hrefs = [...panel.matchAll(/class="cc-shell__panel-link" href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, [...new Set(hrefs)], "a destination appears twice in the menu");
  assert.deepEqual([...panel.matchAll(/cc-shell__panel-label">([^<]+)</g)].map((m) => m[1]), ["Use it", "Research and record", "About and trust", "Source code"]);
  for (const href of ["/mcp-servers/answers", "/companies", "/benchmarks/finance-mcp-servers", "/vision", "/verify"]) assert.ok(hrefs.includes(href), href);
});
