// The datasets hub and its two dataset pages: the committed pages are what the generator writes, the published files
// are the released files byte for byte, and every figure the pages print is counted from those files.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { bankruptcyDescription, bankruptcySummary, DATASETS, guidanceDescription, guidanceSummary, parseCsv, renderBankruptcy, renderGuidance } from "./build-datasets-hub.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(ROOT, p));

test("CSV: quoted fields keep their commas and quotes; blank lines are not rows", () => {
  assert.deepEqual(parseCsv('a,b\n1,"x, ""y"""\r\n\n2,z\n'), [{ a: "1", b: 'x, "y"' }, { a: "2", b: "z" }]);
});

test("the published files are the released ones, byte for byte", () => {
  for (const d of Object.values(DATASETS)) for (const f of d.files) assert.ok(read(f.from).equals(read(f.to)), f.to);
});

test("the committed pages and summaries are what the generator writes", () => {
  const g = { ...guidanceSummary(), summaryUrl: "/datasets/company-guidance/index.json" }, b = { ...bankruptcySummary(), summaryUrl: "/datasets/bankruptcy-filings/index.json" };
  assert.deepEqual(JSON.parse(read(DATASETS.guidance.summary)), JSON.parse(JSON.stringify(g)));
  assert.deepEqual(JSON.parse(read(DATASETS.bankruptcy.summary)), JSON.parse(JSON.stringify(b)));
  // The site's design layer wraps tables and adds attributes after the generator runs: the text and the markup data are
  // what must not drift.
  const body = (html) => html.slice(html.indexOf('<div class="paper__body">'), html.indexOf("</article>")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const ld = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  for (const [page, html] of [[DATASETS.guidance.page, renderGuidance(g)], [DATASETS.bankruptcy.page, renderBankruptcy(b)]]) {
    const committed = read(page).toString();
    assert.equal(body(committed), body(html), page);
    assert.deepEqual(ld(committed), ld(html), page);
  }
});

test("figures counted from the files", () => {
  const g = guidanceSummary(), lines = parseCsv(read(DATASETS.guidance.files[0].from).toString());
  assert.equal(g.lines, lines.length);
  assert.equal(g.companies_with_lines, new Set(lines.map((r) => r.company)).size);
  for (const [measure, m] of Object.entries(g.by_measure)) {
    assert.equal(m.lines, m.above + m.within + m.below + m["not placed"], measure);
    assert.equal(m.lines, lines.filter((r) => r.measure === measure).length, measure);
  }
  assert.equal(Object.values(g.by_measure).reduce((s, m) => s + m.lines, 0), g.lines);
  assert.ok(g.companies_read <= g.index_companies && g.companies_with_lines <= g.companies_read);
  const b = bankruptcySummary(), rows = parseCsv(read(DATASETS.bankruptcy.files[0].from).toString());
  assert.equal(b.filings_by_company, rows.length);
  assert.equal(Object.values(b.by_year).reduce((s, n) => s + n, 0), rows.length);
  assert.ok(b.filings <= rows.length && b.companies <= rows.length);
  assert.ok(rows.every((r) => /^\d{10}-\d{2}-\d{6}$/.test(r.accession) && /^\d{4}-\d{2}-\d{2}$/.test(r.filed)));
});

test("titles and descriptions fit a search result", () => {
  for (const d of [guidanceDescription(guidanceSummary()), bankruptcyDescription(bankruptcySummary())]) assert.ok(d.length >= 120 && d.length <= 160, `${d.length}: ${d}`);
  for (const p of ["datasets.html", DATASETS.guidance.page, DATASETS.bankruptcy.page]) {
    const html = read(p).toString(), title = html.match(/<title>(.*?)<\/title>/)[1].replaceAll("&amp;", "&");
    assert.ok(title.length <= 65, `${p}: ${title}`);
    assert.match(html, /"@type":"(Dataset|DataCatalog)"/);
  }
});
