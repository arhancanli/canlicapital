import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { verifyCompanyReference } from './lib/company-reference.mjs';
import { renderProductShellHeader, renderProductShellFooter, renderProductShellStylesheet } from './product-shell.mjs';
import { escapeXml as esc } from './lib/sitemaps.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://canlicapital.com';
const dataDir = resolve(root, 'public/company-data');
const records = existsSync(dataDir) ? readdirSync(dataDir).filter((f) => /^\d{10}\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(resolve(dataDir, f), 'utf8'))) : [];
const manifest = [];
const pathFor = (company) => `/companies/${company.cik}`;
const dataFor = (company) => `/company-data/${company.cik}.json`;
const metricPath = (company, concept) => `${pathFor(company)}/${concept.tag}`;
const number = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(value);
const label = (company) => company.name.length > 32 ? `CIK ${company.cik}` : company.name;
const accessionLink = (company, observation) => `https://www.sec.gov/Archives/edgar/data/${Number(company.cik)}/${observation.accn.replaceAll('-', '')}/${observation.accn}-index.html`;

function page({ path, title, description, heading, body, sources, lastmod, dataset }) {
  const schema = dataset ? { '@context': 'https://schema.org', '@type': 'Dataset', name: heading, description, url: origin + path, creator: { '@type': 'Organization', name: dataset.name }, provider: { '@type': 'Organization', name: 'U.S. Securities and Exchange Commission' }, isBasedOn: dataset.source_url, distribution: { '@type': 'DataDownload', contentUrl: origin + dataFor(dataset), encodingFormat: 'application/json' }, dateModified: lastmod } : { '@context': 'https://schema.org', '@type': 'CollectionPage', name: heading, url: origin + path };
  const html = `<!doctype html>
<html lang="en" data-page="companies"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${esc(sources.join(' '))}" />
<meta name="robots" content="index, follow" />
<link rel="canonical" href="${origin}${path}" />
<meta property="og:title" content="${esc(heading)}" /><meta property="og:description" content="${esc(description)}" />
<meta property="og:type" content="website" /><meta property="og:url" content="${origin}${path}" />
<meta property="og:image" content="${origin}/og.png" />
<link rel="stylesheet" href="/css/paper.css" /><link rel="stylesheet" href="/css/company-reference.css" />
${renderProductShellStylesheet()}
<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script></head>
<body class="paper"><a class="paper__skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: 'companies' })}
<main class="company-reference" id="content" tabindex="-1"><p class="paper__eyebrow"><a href="/companies">Company reference</a> / Public filing evidence</p>
<h1>${esc(heading)}</h1><p class="company-reference__intro">${esc(description)}</p>${body}</main>
${renderProductShellFooter()}</body></html>\n`;
  const output = resolve(root, path.slice(1) + '.html');
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, html);
  manifest.push({ loc: origin + path, lastmod });
}

function provenance(company) {
  return `<section aria-labelledby="provenance"><h2 id="provenance">Inspect the source</h2><dl><dt>Entity</dt><dd>${esc(company.name)} / CIK ${company.cik}</dd><dt>Captured</dt><dd>${esc(company.fetched_at)}</dd><dt>SEC response SHA-256</dt><dd><code class="company-reference__hash">${esc(company.source_sha256)}</code></dd></dl>
<p><a href="${company.source_url}">Current SEC company facts</a> · <a href="${esc(company.source_snapshot)}" download>Download the original response snapshot (gzip)</a> · <a href="${dataFor(company)}" download>Download the selected JSON</a></p>
<p>${esc(company.policy)}</p><p>${esc(company.claim_boundary)}</p></section>
<section><h2>Use this in research</h2><p>A financial period ends before its results become public. Use the filing date as a minimum availability boundary, inspect amendments, and retain the original filing vintage when testing historical signals. This latest-filed selection can contain information unavailable at the time.</p>
<p>These pages do not supply prices, total-return histories, corporate-action adjustments or a tradable universe. Build those inputs separately before evaluating a strategy. A profitable backtest can still reflect selection bias or costs that were left out.</p>
<p><a href="/methodology">Research methodology</a> · <a href="/costs">Execution and cost assumptions</a> · <a href="/developers">Validate your return series with the API or MCP server</a> · <a href="/tools/backtest-overfitting">Check backtest overfitting</a></p>
<details><summary>Read the published dataset with Python</summary><pre><code>${esc(`import json\nfrom urllib.request import urlopen\n\nwith urlopen("${origin}${dataFor(company)}") as response:\n    record = json.load(response)\nprint(record["fetched_at"])\nprint(record["policy"])\nfor concept in record["concepts"]:\n    print(concept["tag"], next(iter(concept["observations"])))`)}</code></pre></details></section>`;
}

for (const company of records) {
  if (company.schema !== 'canli.company-reference.v1' || company.concepts.length < 4 || !/^\d{10}$/.test(company.cik)) throw new Error('Invalid company reference');
  if (!/^[a-f0-9]{64}$/.test(company.source_sha256) || company.source_snapshot !== `/company-data/sources/${company.source_sha256}.json.gz`) throw new Error('Invalid source snapshot binding');
  const original = gunzipSync(readFileSync(resolve(root, `public${company.source_snapshot}`)));
  verifyCompanyReference(company, original);
  const lastmod = (company.content_updated_at ?? company.fetched_at).slice(0, 10);
  const sources = [`company-data/${company.cik}.json`];
  const rows = company.concepts.map((concept) => {
    const latest = [...concept.observations].sort((a, b) => b.end.localeCompare(a.end))[0];
    return `<tr><th scope="row"><a href="${metricPath(company, concept)}">${esc(concept.label)}</a></th><td>${esc(latest.end)}</td><td>${number(latest.val)}</td><td>${esc(latest.unit)}</td><td>${esc(latest.filed)}</td></tr>`;
  }).join('');
  page({ path: pathFor(company), title: `${label(company)}: filing data`, description: `Explore ${company.name} financial histories from SEC filings, with original units, reporting periods, filing dates and downloadable source data.`, heading: `${company.name}: financial reference`, sources, lastmod, dataset: company,
    body: `<section><h2>Reported financial histories</h2><p>Choose a measure to inspect its definition, complete selected history and filing provenance. Values below show the latest period in this captured record; they are accounting amounts, not prices.</p><div class="company-reference__table" role="region" aria-label="Latest financial observations" tabindex="0"><table><caption>Latest selected reporting period per concept</caption><thead><tr><th scope="col">Measure</th><th scope="col">Period end</th><th scope="col">Value</th><th scope="col">Unit</th><th scope="col">Filed</th></tr></thead><tbody>${rows}</tbody></table></div></section>${provenance(company)}` });
  for (const concept of company.concepts) {
    const shortName = company.name.replace(/\s+(CORPORATION|Corporation|CORP|Inc\.)$/, '');
    const title = `${shortName}: ${concept.label}`;
    const rows = concept.observations.map((row) => `<tr><td>${esc(row.start ?? 'At date')}</td><th scope="row">${esc(row.end)}</th><td>${number(row.val)}</td><td>${esc(row.unit)}</td><td>${esc(row.filed)}</td><td><a href="${accessionLink(company, row)}">${esc(row.form)} · ${esc(row.accn)}</a></td></tr>`).join('');
    page({ path: metricPath(company, concept), title: title.length <= 49 ? title : `${company.cik}: ${concept.label.slice(0, 35)}`, description: `${concept.label} for ${company.name.replace(/\.$/, '')}. Inspect selected reporting periods, original units and SEC filing links; download the financial history.`, heading: `${company.name}: ${concept.label.toLowerCase()}`, sources, lastmod, dataset: company,
      body: `<p><a href="${pathFor(company)}">All ${esc(company.name)} financial histories</a></p><section><h2>What this measure means</h2><p>${esc(concept.meaning)}</p><p>Exact concept: <code>us-gaap:${esc(concept.tag)}</code>. ${concept.kind === 'duration' ? 'Each value covers an annual-duration reporting interval, shown with both start and end dates.' : 'Each value is a balance at the reporting date, not a flow earned over a year.'} Different units remain separate; no currency conversion or interpolation is applied.</p></section><section><h2>Selected filing history</h2><div class="company-reference__table" role="region" aria-label="${esc(concept.label)} filing history" tabindex="0"><table><caption>${esc(concept.label)} in original reported units, latest-filed observation per period</caption><thead><tr><th scope="col">Period start</th><th scope="col">Period end</th><th scope="col">Value</th><th scope="col">Unit</th><th scope="col">Filed</th><th scope="col">Source filing</th></tr></thead><tbody>${rows}</tbody></table></div></section>${provenance(company)}` });
  }
}
if (records.length) page({ path: '/companies', title: 'Company filings for reproducible research', heading: 'Company filings. Inspectable inputs.', description: 'Explore company financial histories with SEC filing provenance, original units and downloadable data. Build research on inputs you can inspect.', sources: records.map((r) => `company-data/${r.cik}.json`), lastmod: records.map((r) => r.fetched_at.slice(0, 10)).sort().at(-1),
  body: `<section><h2>Start with the filing</h2><p>This reference connects company accounting history to its public source. Every financial measure carries a reporting period, filing date, original unit and a link back to the filing. The downloadable record uses the same observations as the page.</p><p>This is an initial reference collection, not a complete market universe or a ranking of companies. Coverage is limited to selected standard accounting concepts with substantive histories. A missing measure stays missing.</p><ul class="company-reference__directory">${records.map((r) => `<li><a href="${pathFor(r)}">${esc(r.name)}</a><span>CIK ${r.cik} · Captured ${esc(r.fetched_at.slice(0, 10))}</span></li>`).join('')}</ul></section><section><h2>From public data to a testable hypothesis</h2><p>Begin with a mechanism and a declared information boundary. Preserve the filing vintage available at the decision date, account for trading costs, and evaluate the complete search history. These accounting histories help inspect a possible input; they do not establish a trading edge.</p><p><a href="/research">Read the research and failed experiments</a> · <a href="/methodology">Review the method</a> · <a href="/developers">Use the validation API and MCP server</a></p></section>` });
writeFileSync(resolve(root, 'public/company-reference-index.json'), JSON.stringify({ schema: 'canli.company-reference-index.v1', routes: manifest }, null, 2) + '\n');
console.log(`Company reference: ${records.length} companies, ${manifest.length} source-backed pages`);
