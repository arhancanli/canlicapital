import { matchingHistoryConcepts, constantHistoryUnits } from './company-history-context.mjs';
import { companyFilingNotes } from './company-filing-notes.mjs';
import { companyCoverage, coverageByUnit, historicalFiler, latestFiling, latestObservationsByUnit } from './company-coverage.mjs';
import { renderProductShellHeader, renderProductShellFooter, renderProductShellStylesheet } from '../product-shell.mjs';
import { escapeXml as esc } from './sitemaps.mjs';
const origin = 'https://canlicapital.com';
const pathFor = (company) => `/companies/${company.cik}`;
const dataFor = (company) => `/company-data/${company.cik}.json`;
const metricPath = (company, concept) => `${pathFor(company)}/${concept.tag}`;
const number = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(value);
const numberCell = (value) => `<td class="company-reference__num">${number(value)}</td>`;
const periodStartCell = (row) => row.start ? `<td>${esc(row.start)}</td>` : '<td class="company-reference__na">—</td>';
const label = (company) => company.name.replace(/\s+(CORPORATION|CORP|Inc\.)$/i, '');
const headingHtml = (heading) => esc(heading).replace(/\d{4}-\d{2}-\d{2}|\b\d{1,2}-[KQF](?:\/A)?(?=\s|$)/g, token => `<span class="company-reference__nobreak">${token}</span>`);
const accessionLink = (company, observation) => `https://www.sec.gov/Archives/edgar/data/${Number(company.cik)}/${observation.accn.replaceAll('-', '')}/${observation.accn}-index.html`;

export function renderReferenceDocument({ path, title, description, heading, body, sources, lastmod, dataset, coverage }) {
  const titleText = title.length <= 49 ? `${title} | Canli Capital` : title;
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Company reference', path: '/companies' }];
  if (!dataset && /^\/companies\/page\/\d+$/.test(path)) crumbs.push({ name: `Page ${path.split('/').at(-1)}`, path });
  if (dataset) crumbs.push({ name: dataset.name, path: pathFor(dataset) });
  if (dataset && path !== pathFor(dataset)) crumbs.push({ name: heading.slice(dataset.name.length + 2), path });
  const breadcrumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, name: crumb.name, item: origin + crumb.path })) };
  const schema = dataset ? { '@context': 'https://schema.org', '@type': 'Dataset', name: heading, description, url: origin + path, creator: { '@type': 'Organization', name: dataset.name }, provider: { '@type': 'Organization', name: 'U.S. Securities and Exchange Commission' }, isBasedOn: dataset.source_url, distribution: { '@type': 'DataDownload', contentUrl: origin + dataFor(dataset), encodingFormat: 'application/json' }, dateModified: lastmod, ...(coverage ? { temporalCoverage: `${coverage.first}/${coverage.last}` } : {}) } : { '@context': 'https://schema.org', '@type': 'CollectionPage', name: heading, url: origin + path };
  const html = `<!doctype html>
<html lang="en" data-page="companies"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(titleText)}</title>
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
<script type="application/ld+json">${JSON.stringify([schema, breadcrumbs]).replaceAll('<', '\\u003c')}</script></head>
<body class="paper"><a class="paper__skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: 'companies' })}
<main class="company-reference" id="content" tabindex="-1"><nav class="company-reference__breadcrumbs" aria-label="Breadcrumb"><ol>${crumbs.map((crumb, i) => `<li>${i === crumbs.length - 1 ? `<span aria-current="page">${esc(crumb.name)}</span>` : `<a href="${crumb.path}">${esc(crumb.name)}</a>`}</li>`).join('')}</ol></nav>
<h1>${headingHtml(heading)}</h1><p class="company-reference__intro">${esc(description)}</p>${body}</main>
${renderProductShellFooter()}</body></html>\n`;
  return { path, html, lastmod, loc: origin + path };
}

// Company-level notice for a filer whose record ended more than two years before
// capture. Shared by the overview and the filing index.
export function historicalFilerNotice(name, latest, fetchedAt) {
  return `<section class="company-reference__notice" aria-labelledby="historical-filer"><h2 id="historical-filer">Filing record ends ${esc(latest.filed)}</h2><p>The latest filing in this captured record is ${latest.form ? `a ${esc(latest.form)}` : 'a filing'} filed ${esc(latest.filed)}. No later filing is in the SEC companyfacts record captured on ${esc(fetchedAt.slice(0, 10))}. ${esc(name)} may have stopped filing, merged, or changed its reporting entity; nothing on this page describes its current status. Values are as reported at the time.</p></section>`;
}

export function provenance(company) {
  return `<section aria-labelledby="provenance"><h2 id="provenance">Inspect the source</h2><dl><dt>Entity</dt><dd>${esc(company.name)} / CIK ${company.cik}</dd><dt>Captured</dt><dd><time datetime="${esc(company.fetched_at)}">${esc(company.fetched_at.slice(0, 10))} ${esc(company.fetched_at.slice(11, 16))} UTC</time></dd><dt>SEC response SHA-256</dt><dd><code class="company-reference__hash">${esc(company.source_sha256)}</code></dd></dl>
<p><a href="${company.source_url}">Current SEC company facts</a> · <a href="${esc(company.source_snapshot)}" download>Download the original response snapshot (gzip)</a> · <a href="${dataFor(company)}" download>Download the selected JSON</a></p>
<p>${esc(company.policy)}</p><p>${esc(company.claim_boundary)}</p></section>
<section><h2>Use this in research</h2><p>A financial period ends before its results become public. Use the filing date as a minimum availability boundary, inspect amendments, and retain the original filing vintage when testing historical signals. This latest-filed selection can contain information unavailable at the time.</p>
<p>These pages do not supply prices, total-return histories, corporate-action adjustments or a tradable universe. Build those inputs separately before evaluating a strategy. A profitable backtest can still reflect selection bias or costs that were left out.</p>
<p><a href="/methodology">Research methodology</a> · <a href="/costs">Execution and cost assumptions</a> · <a href="/tools/backtest-overfitting">Check backtest overfitting</a></p>
<h3>Build with the open-source tools</h3><p>Use these accounting records as inspectable inputs. When you have constructed a return series, the validation tools can help test its statistical evidence and preserve the result with its limitations.</p>
<ul><li><a href="/developers#quickstart">Get an API key and run your first validation</a></li><li><a href="/developers#ai-assistant">Connect the MCP server to your coding assistant</a></li><li><a href="https://github.com/arhancanli/alphac" rel="noreferrer">Inspect the ALPHAC engine on GitHub</a></li><li><a href="https://github.com/arhancanli/canlicapital/tree/main/mcp" rel="noreferrer">Read the MCP server source and integration examples</a></li></ul>
<details><summary>Read the published dataset with Python</summary><pre><code>${esc(`import json\nfrom urllib.request import urlopen\n\nwith urlopen("${origin}${dataFor(company)}") as response:\n    record = json.load(response)\nprint(record["fetched_at"])\nprint(record["policy"])\nfor concept in record["concepts"]:\n    print(concept["tag"], next(iter(concept["observations"])))`)}</code></pre></details></section>`;
}


function withholdingNotices(exclusions) {
  const groups = new Map();
  for (const row of exclusions) {
    const key = JSON.stringify([row.tag, row.reason, Boolean(row.observation)]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(rows => {
    const first = rows[0];
    const explanation = `<p><code>us-gaap:${esc(first.tag)}</code>: ${esc(first.reason)}</p>`;
    if (!first.observation) return explanation + rows.map(row => `<p><a href="${esc(row.filing_url)}">Inspect the filing</a>.</p>`).join('');
    const ends = rows.map(row => row.observation.end).sort();
    const range = ends[0] === ends.at(-1) ? ends[0] : `${ends[0]} to ${ends.at(-1)}`;
    return `${explanation}<details class="company-reference__withheld"><summary>Inspect ${rows.length} withheld ${rows.length === 1 ? 'observation' : 'observations'} (period ends: ${esc(range)})</summary><div class="company-reference__table" role="region" aria-label="Withheld ${esc(first.tag)} observations" tabindex="0"><table><caption>Withheld source values: ${esc(first.tag)}. These values are excluded from the selected history.</caption><thead><tr><th scope="col">Period start</th><th scope="col">Period end</th><th scope="col" class="company-reference__num">Original value</th><th scope="col">Unit</th><th scope="col">Source filing</th></tr></thead><tbody>${rows.map(row => {
      const observation = row.observation;
      return `<tr>${periodStartCell(observation)}<th scope="row">${esc(observation.end)}</th><td class="company-reference__num">${esc(String(observation.val))}</td><td>${esc(observation.unit)}</td><td><a href="${esc(row.filing_url)}">${esc(observation.accn)}</a></td></tr>`;
    }).join('')}</tbody></table></div></details>`;
  }).join('');
}


// Input must already reproduce from its source (static build) or belong to a
// verified immutable catalog (runtime). No network, disk writes or global state.
// filings: { filings: n } when the serving release holds filing pages for this
// company; the overview then links to the filing index. Static builds pass none.
export function renderCompanyPages(company, { target = 'all', filings = null } = {}) {
  if (company.schema !== 'canli.company-reference.v1' || !/^\d{10}$/.test(company.cik) || company.concepts.length < 4 || !/^[a-f0-9]{64}$/.test(company.source_sha256)) throw new Error('Invalid company reference');
  if (filings !== null && (!Number.isSafeInteger(filings?.filings) || filings.filings < 1)) throw new Error('Invalid filings summary');
  const filingsSection = filings ? `<section aria-labelledby="filings"><h2 id="filings">Filings</h2><p><a href="${pathFor(company)}/filings">${filings.filings} ${esc(label(company))} filings with published measures</a>: what each annual or quarterly report tagged, with the periods it covered, as reported in that filing. The histories above show the latest-filed value per period.</p></section>` : '';
  if (company.source_url !== `https://data.sec.gov/api/xbrl/companyfacts/CIK${company.cik}.json` || company.source_snapshot !== `/company-data/sources/${company.source_sha256}.json.gz`) throw new Error('Invalid company source URL');
  if (!['all', 'overview', ...company.concepts.map(concept => concept.tag)].includes(target)) return [];
  const matches = matchingHistoryConcepts(company.concepts);
  const pages = [];
  const page = options => pages.push(renderReferenceDocument(options));
  const lastmod = (company.content_updated_at ?? company.fetched_at).slice(0, 10);
  const sources = [`company-data/${company.cik}.json`];
  const historicalNote = historicalFiler(company) ? historicalFilerNotice(company.name, latestFiling(company), company.fetched_at) : '';
  const editorialNote = company.editorial_exclusions?.length ? `<section aria-labelledby="editorial-scope"><h2 id="editorial-scope">Limits of the selected measures</h2>${withholdingNotices(company.editorial_exclusions)}</section>` : '';
  const overviewNotes = [...new Set(company.concepts.flatMap(concept => companyFilingNotes(company, concept.tag)).filter(note => note.include_on_overview))];
  const overviewContext = overviewNotes.length ? `<section aria-labelledby="filing-context"><h2 id="filing-context">Context from the filing</h2>${overviewNotes.map(note => `<p>${esc(note.text)} <a href="${esc(note.filing_url)}">Read the source filing</a>.</p>`).join('')}</section>` : '';
  const rows = company.concepts.flatMap((concept) => latestObservationsByUnit(concept.observations).map((latest) => {
    return `<tr><th scope="row"><a href="${metricPath(company, concept)}">${esc(concept.label)}</a></th>${periodStartCell(latest)}<td>${esc(latest.end)}</td>${numberCell(latest.val)}<td>${esc(latest.unit)}</td><td>${esc(latest.filed)}</td></tr>`;
  })).join('');
  if (target === 'all' || target === 'overview') page({ path: pathFor(company), title: `${label(company)}: filing data`, description: `Explore ${company.name} financial histories from SEC filings, with original units, reporting periods, filing dates and downloadable source data.`, heading: `${company.name}: financial reference`, sources, lastmod, dataset: company,
    body: `${historicalNote}${editorialNote}${overviewContext}<section><h2>Reported financial histories</h2><p>Choose a measure to inspect its definition, complete selected history and filing provenance. Each row shows the latest period available for that selected concept and original unit. Separate currencies and reporting intervals remain separate rows. Coverage dates can differ between concepts. A recent capture does not imply recent accounting coverage; these amounts are not prices.</p><div class="company-reference__table" role="region" aria-label="Latest financial observations" tabindex="0"><table><caption>Latest periods by selected concept and original unit</caption><thead><tr><th scope="col">Measure</th><th scope="col">Period start</th><th scope="col">Period end</th><th scope="col" class="company-reference__num">Value</th><th scope="col">Unit</th><th scope="col">Filed</th></tr></thead><tbody>${rows}</tbody></table></div></section>${filingsSection}${provenance(company)}` });
  for (const concept of company.concepts) {
    if (target !== 'all' && target !== concept.tag) continue;
    const coverage = companyCoverage(concept.observations, company.fetched_at);
    const unitCoverage = coverage.units.length > 1 ? `<h3>Coverage by original unit</h3><ul class="company-reference__unit-coverage">${coverageByUnit(concept.observations, company.fetched_at).map(unit => `<li><strong>${esc(unit.unit)}</strong>: ${esc(unit.first)} to ${esc(unit.last)}.${unit.historicalOnly ? ' <strong>This unit’s selected history ends more than two years before capture.</strong>' : ''}</li>`).join('')}</ul><p>These are separate reported series. A newer period in one unit does not update another unit’s history or establish a currency conversion.</p>` : '';
    const coverageNote = `<section aria-labelledby="coverage"><h2 id="coverage">Coverage of this history</h2><p>Selected reporting periods run from ${esc(coverage.first)} to ${esc(coverage.last)}. The SEC response was captured on ${esc(company.fetched_at.slice(0, 10))}.</p>${coverage.historicalOnly ? '<p><strong>This selected history ends more than two years before capture.</strong> Do not treat its final value as a current balance or current annual result. More recent filings may use another accounting tag; inspect the filings before drawing conclusions about the company.</p>' : ''}${unitCoverage}</section>`;
    const equalHistories = matches.get(concept.tag);
    const filingNotes = companyFilingNotes(company, concept.tag);
    const observationHolds = (company.editorial_exclusions ?? []).filter(row => row.tag === concept.tag && row.observation);
    const observationNote = observationHolds.length ? `<section aria-labelledby="withheld-observations"><h2 id="withheld-observations">Withheld reporting periods</h2>${withholdingNotices(observationHolds)}</section>` : '';

    const constants = constantHistoryUnits(concept);
    const historyContext = equalHistories.length || constants.length ? `<section aria-labelledby="history-context"><h2 id="history-context">Reading these values</h2>${constants.map(unit => `<p>The selected <strong>${esc(unit.unit)}</strong> history reports ${number(unit.value)} at all ${unit.reportingEnds} reporting ends.${unit.value === 0 ? ' These are reported zeros, not values substituted for missing data.' : ''} This describes this concept and the selected periods only; it does not establish that other measures or later periods are unchanged.</p>`).join('')}${equalHistories.length ? `<p>This selected numerical history matches ${equalHistories.map(other => `<a href="${metricPath(company, other)}">${esc(other.label)}</a>`).join(', ')} for the same reporting intervals and original units. The accounting definitions remain distinct. Equal values do not establish that the concepts are interchangeable or explain why they match; filing dates and accessions may differ. Compare the definitions and source filings before combining them.</p>` : ''}</section>` : '';
    const shortName = label(company);
    const title = `${shortName}: ${concept.label}`;
    const rows = concept.observations.map((row) => `<tr>${periodStartCell(row)}<th scope="row">${esc(row.end)}</th>${numberCell(row.val)}<td>${esc(row.unit)}</td><td>${esc(row.filed)}</td><td><a href="${accessionLink(company, row)}">${esc(row.form)} · ${esc(row.accn)}</a></td></tr>`).join('');
    page({ path: metricPath(company, concept), title, description: `${concept.label} for ${company.name.replace(/\.$/, '')}. Inspect selected reporting periods, original units and SEC filing links; download the financial history.`, heading: `${company.name}: ${concept.label.toLowerCase()}`, sources, lastmod, dataset: company, coverage,
      body: `<p><a href="${pathFor(company)}">All ${esc(company.name)} financial histories</a></p><section><h2>What this measure means</h2><p>${esc(concept.meaning)}</p><p>Exact concept: <code>us-gaap:${esc(concept.tag)}</code>. ${concept.kind === 'duration' ? 'Each value covers an annual-duration reporting interval, shown with both start and end dates.' : 'Each value is a balance at the reporting date, not a flow earned over a year.'} Different units remain separate; no currency conversion or interpolation is applied.</p></section>${coverageNote}${observationNote}${historyContext}${filingNotes.length ? `<section aria-labelledby="filing-context"><h2 id="filing-context">Context from the filing</h2>${filingNotes.map(note => `<p>${esc(note.text)} <a href="${esc(note.filing_url)}">Read the source filing</a>.</p>`).join('')}</section>` : ''}<section><h2>Selected filing history</h2><div class="company-reference__table" role="region" aria-label="${esc(concept.label)} filing history" tabindex="0"><table><caption>${esc(concept.label)} in original reported units, latest-filed observation per period</caption><thead><tr><th scope="col">Period start</th><th scope="col">Period end</th><th scope="col" class="company-reference__num">Value</th><th scope="col">Unit</th><th scope="col">Filed</th><th scope="col">Source filing</th></tr></thead><tbody>${rows}</tbody></table></div></section><section><h2>Related ${esc(company.name)} histories</h2><ul class="company-reference__related">${company.concepts.filter(other => other.tag !== concept.tag).map(other => `<li><a href="${metricPath(company, other)}">${esc(other.label)}</a></li>`).join('')}</ul></section>${provenance(company)}` });
  }
  return pages;
}
