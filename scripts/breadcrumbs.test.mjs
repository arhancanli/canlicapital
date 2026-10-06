import test from "node:test";
import assert from "node:assert/strict";
import { completeBreadcrumbs, computedTrail, declaredTrail, pageLabel } from "./lib/breadcrumbs.mjs";

const page = (title, extra = "") => `<!doctype html><html><head><title>${title}</title>${extra}</head><body><main id="content"><h1>x</h1></main></body></html>`;
const labels = new Map([["/research", "Research"], ["/research/null-zoo-v0", "Null Zoo v0"], ["/tools/deflated-sharpe", "Deflated Sharpe calculator"]]);

test("labels come from the page's own title, without the site name", () => {
  assert.equal(pageLabel(page("Null Zoo v0: backtest-overfitting corrections | Canli Capital")), "Null Zoo v0");
  assert.equal(pageLabel(page("Canli Capital / Open research book")), "Open research book");
  assert.equal(pageLabel(page("What the costs actually are | Canli Capital")), "What the costs actually are");
});

test("a trail is Home, each ancestor that is a page, then the page", () => {
  assert.deepEqual(computedTrail("/research/null-zoo-v0", labels), [["Canli Capital", "/"], ["Research", "/research"], ["Null Zoo v0", "/research/null-zoo-v0"]]);
  assert.deepEqual(computedTrail("/tools/deflated-sharpe", labels), [["Canli Capital", "/"], ["Deflated Sharpe calculator", "/tools/deflated-sharpe"]]);
  assert.equal(computedTrail("/unlabelled", labels), null);
});

test("a page missing both gets the BreadcrumbList and the same trail visibly, inside main", () => {
  const out = completeBreadcrumbs(page("Null Zoo v0 | Canli Capital"), "/research/null-zoo-v0", labels);
  assert.deepEqual(declaredTrail(out).map(([, path]) => path), ["/", "/research", "/research/null-zoo-v0"]);
  assert.match(out, /<main id="content"><nav class="cc-crumbs" aria-label="Breadcrumb"><ol><li><a href="\/">Canli Capital<\/a><\/li><li><a href="\/research">Research<\/a><\/li><li><span aria-current="page">Null Zoo v0<\/span><\/li><\/ol><\/nav>/);
  assert.equal((out.match(/data-cc-crumbs/g) ?? []).length, 1);
});

test("a declared BreadcrumbList is kept, and the visible trail is drawn from it", () => {
  const declared = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Canli Capital","item":"https://canlicapital.com"},{"@type":"ListItem","position":2,"name":"FilingFacts v0","item":"https://canlicapital.com/research/filing-facts-v0"},{"@type":"ListItem","position":3,"name":"Check questions","item":"https://canlicapital.com/annotate"}]}</script>`;
  const out = completeBreadcrumbs(page("Check questions | Canli Capital", declared), "/annotate", labels);
  assert.equal((out.match(/BreadcrumbList/g) ?? []).length, 1);
  assert.match(out, /href="\/research\/filing-facts-v0">FilingFacts v0<\/a>/);
});

test("the homepage, noindex pages and pages with both are left unchanged", () => {
  const home = page("Canli Capital");
  assert.equal(completeBreadcrumbs(home, "/", labels), home);
  const hidden = page("Null Zoo v0 | Canli Capital", '<meta name="robots" content="noindex">');
  assert.equal(completeBreadcrumbs(hidden, "/research/null-zoo-v0", labels), hidden);
  const done = completeBreadcrumbs(page("Null Zoo v0 | Canli Capital"), "/research/null-zoo-v0", labels);
  assert.equal(completeBreadcrumbs(done, "/research/null-zoo-v0", labels), done);
});
