import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { verifyCompanyReference } from './lib/company-reference.mjs';
import { renderCompanyPages, renderReferenceDocument } from './lib/company-page-renderer.mjs';
import { escapeXml as esc } from './lib/sitemaps.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://canlicapital.com';
const dataDir = resolve(root, 'public/company-data');
const records = existsSync(dataDir) ? readdirSync(dataDir).filter((f) => /^\d{10}\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(resolve(dataDir, f), 'utf8'))) : [];
const manifest = [];
const pathFor = company => `/companies/${company.cik}`;
function emit(result) {
  const output = resolve(root, result.path.slice(1) + '.html');
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, result.html);
  manifest.push({ loc: result.loc, lastmod: result.lastmod });
}
const page = options => emit(renderReferenceDocument(options));
for (const company of records) {
  if (company.schema !== 'canli.company-reference.v1' || company.concepts.length < 4 || !/^\d{10}$/.test(company.cik)) throw new Error('Invalid company reference');
  if (!/^[a-f0-9]{64}$/.test(company.source_sha256) || company.source_snapshot !== `/company-data/sources/${company.source_sha256}.json.gz`) throw new Error('Invalid source snapshot binding');
  const original = gunzipSync(readFileSync(resolve(root, `public${company.source_snapshot}`)));
  verifyCompanyReference(company, original);
  for (const result of renderCompanyPages(company)) emit(result);
}
if (records.length) page({ path: '/companies', title: 'Company filings for reproducible research', heading: 'Company filings. Inspectable inputs.', description: 'Explore company financial histories with SEC filing provenance, original units and downloadable data. Build research on inputs you can inspect.', sources: records.map((r) => `company-data/${r.cik}.json`), lastmod: records.map((r) => r.fetched_at.slice(0, 10)).sort().at(-1),
  body: `<section><h2>Start with the filing</h2><p>This reference connects company accounting history to its public source. Every financial measure carries a reporting period, filing date, original unit and a link back to the filing. The downloadable record uses the same observations as the page.</p><p>This is an initial reference collection, not a complete market universe or a ranking of companies. Coverage is limited to selected standard accounting concepts with substantive histories. A missing measure stays missing.</p><ul class="company-reference__directory">${records.map((r) => `<li><a href="${pathFor(r)}">${esc(r.name)}</a><span>CIK ${r.cik} · Captured ${esc(r.fetched_at.slice(0, 10))}</span></li>`).join('')}</ul></section><section><h2>From public data to a testable hypothesis</h2><p>Begin with a mechanism and a declared information boundary. Preserve the filing vintage available at the decision date, account for trading costs, and evaluate the complete search history. These accounting histories help inspect a possible input; they do not establish a trading edge.</p><p><a href="/research">Read the research and failed experiments</a> · <a href="/methodology">Review the method</a> · <a href="/developers">Use the validation API and MCP server</a></p></section>` });
writeFileSync(resolve(root, 'public/company-reference-index.json'), JSON.stringify({ schema: 'canli.company-reference-index.v1', routes: manifest }, null, 2) + '\n');
console.log(`Company reference: ${records.length} companies, ${manifest.length} source-backed pages`);
