import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { companyFilings, filingPath, filingsIndexPath } from './lib/company-filings.mjs';
import { renderFilingPage, renderFilingPages, renderFilingsIndexPage } from './lib/company-filing-page-renderer.mjs';

function pilotFilings(cik) {
  const record = JSON.parse(readFileSync(new URL(`../public/company-data/${cik}.json`, import.meta.url)));
  const raw = gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))).toString();
  return { record, document: companyFilings(raw, { fetchedAt: record.fetched_at, expectedCik: record.cik }) };
}
const HTML_BUDGET = 256 * 1024;

test('every filing page carries its facts, provenance, canonical and links, within the runtime HTML budget', () => {
  const { record, document } = pilotFilings('0000320193');
  const pages = renderFilingPages(document);
  assert.equal(pages.length, document.filings.length + 1);
  const index = pages[0];
  assert.equal(index.path, filingsIndexPath(record.cik));
  assert.ok(index.html.includes(`<link rel="canonical" href="https://canlicapital.com${filingsIndexPath(record.cik)}" />`));
  for (const filing of document.filings) assert.ok(index.html.includes(`href="${filingPath(record.cik, filing.accession)}"`), `index lacks ${filing.accession}`);
  assert.ok(index.html.includes('Inspect the source') && index.html.includes(record.source_sha256));
  let largest = 0;
  for (const filing of document.filings) {
    const page = renderFilingPage(document, filing.accession);
    assert.equal(page.path, filingPath(record.cik, filing.accession));
    assert.equal(page.loc, `https://canlicapital.com${page.path}`);
    assert.equal(page.lastmod, record.fetched_at.slice(0, 10));
    assert.ok(page.html.includes(`<link rel="canonical" href="${page.loc}" />`));
    assert.ok(page.html.includes('<meta name="robots" content="index, follow" />'));
    assert.ok(page.html.includes(filing.sec_index_url));
    assert.ok(page.html.includes(`href="${filingsIndexPath(record.cik)}"`));
    for (const concept of filing.concepts) {
      assert.ok(page.html.includes(`href="/companies/${record.cik}/${concept.tag}"`), `${filing.accession} lacks history link for ${concept.tag}`);
      for (const fact of concept.facts) {
        const rendered = new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(fact.val);
        assert.ok(page.html.includes(`<td>${rendered}</td><td>${fact.unit}</td>`), `${filing.accession} ${concept.tag} ${fact.end} missing`);
      }
    }
    assert.equal(page.html.includes('This is an amendment'), filing.amendment);
    assert.ok(page.html.includes(record.source_sha256) && page.html.includes(document.claim_boundary.slice(0, 40)));
    largest = Math.max(largest, Buffer.byteLength(page.html));
  }
  assert.ok(largest < HTML_BUDGET, `largest filing page is ${largest} bytes`);
  assert.equal(renderFilingPage(document, '0000000000-00-000000'), null);
  assert.deepEqual(renderFilingPages(document, { target: document.filings[0].accession }).map(p => p.path), [filingPath(record.cik, document.filings[0].accession)]);
  assert.equal(renderFilingsIndexPage(document).html, renderFilingsIndexPage(document).html);
});

test('malformed documents and unsafe text are rejected or escaped', () => {
  const { document } = pilotFilings('0000320193');
  assert.throws(() => renderFilingsIndexPage({ ...document, schema: 'other' }), /Invalid company filings document/);
  assert.throws(() => renderFilingsIndexPage({ ...document, source_url: 'https://example.com/x' }), /source binding/);
  const hostile = { ...document, name: 'Evil <script>alert(1)</script> Co', filings: document.filings.slice(0, 1).map(f => ({ ...f, concepts: f.concepts.slice(0, 8).map(c => ({ ...c, label: 'L <b>x</b>', meaning: 'M & "q"' })) })) };
  const page = renderFilingPage(hostile, hostile.filings[0].accession);
  assert.ok(!page.html.includes('<script>alert(1)</script>') && page.html.includes('&lt;script&gt;'));
  assert.ok(page.html.includes('L &lt;b&gt;x&lt;/b&gt;') && page.html.includes('M &amp; &quot;q&quot;'));
});
