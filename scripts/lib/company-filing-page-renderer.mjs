// Filing page family renderer: one index page per company listing its filings, and
// one page per accession showing every published concept that filing tagged.
// Input is a canli.company-filings.v1 document (scripts/lib/company-filings.mjs)
// derived from the same captured bytes as the company record. No network, disk
// writes or global state. Runtime responses stay noindex until admitted.
import { renderReferenceDocument, provenance } from './company-page-renderer.mjs';
import { filingPath, filingsIndexPath } from './company-filings.mjs';
import { escapeXml as esc } from './sitemaps.mjs';

const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(value);
const label = company => company.name.replace(/\s+(CORPORATION|CORP|Inc\.)$/i, '');
const period = fact => fact.start ? `${esc(fact.start)} to ${esc(fact.end)}` : `At ${esc(fact.end)}`;
const formName = form => ({ '10-K': 'annual report', '10-K/A': 'annual report amendment', '10-Q': 'quarterly report', '10-Q/A': 'quarterly report amendment', '20-F': 'annual report (foreign private issuer)', '20-F/A': 'annual report amendment (foreign private issuer)', '40-F': 'annual report (Canadian issuer)', '40-F/A': 'annual report amendment (Canadian issuer)' })[form] ?? form;
const fiscal = filing => filing.fiscal_year ? `fiscal ${filing.fiscal_period ?? ''} ${filing.fiscal_year}`.replace(/\s+/g, ' ').trim() : 'fiscal period not tagged';

function validate(document) {
  if (document.schema !== 'canli.company-filings.v1' || !/^\d{10}$/.test(document.cik) || !/^[a-f0-9]{64}$/.test(document.source_sha256) || !Array.isArray(document.filings)) throw new Error('Invalid company filings document');
  if (document.source_url !== `https://data.sec.gov/api/xbrl/companyfacts/CIK${document.cik}.json`) throw new Error('Invalid filings source binding');
}

function company(document) {
  return { name: document.name, cik: document.cik, fetched_at: document.fetched_at, source_url: document.source_url, source_sha256: document.source_sha256, source_snapshot: `/company-data/sources/${document.source_sha256}.json.gz`, policy: document.policy, claim_boundary: document.claim_boundary };
}

export function renderFilingsIndexPage(document) {
  validate(document);
  const dataset = company(document);
  const rows = document.filings.map(filing => `<tr><th scope="row"><a href="${filingPath(document.cik, filing.accession)}">${esc(filing.form)}</a></th><td>${esc(filing.filed)}</td><td>${esc(fiscal(filing))}</td><td>${filing.concept_count}</td><td>${filing.fact_count}</td><td><a href="${esc(filing.sec_index_url)}" rel="noreferrer">${esc(filing.accession)}</a></td></tr>`).join('');
  const withheld = document.withheld.length ? `<section aria-labelledby="withheld"><h2 id="withheld">Filings without a page</h2><p>These filings tagged published concepts but are not shown because their facts conflict within a period or their form, date or fiscal tags disagree between facts. They remain in the source snapshot.</p><ul>${document.withheld.map(w => `<li>${esc(w.form)} filed ${esc(w.filed)}, accession ${esc(w.accession)}: ${esc(w.reason)}</li>`).join('')}</ul></section>` : '';
  const thin = document.summary.thin_filings ? `<p>${document.summary.thin_filings} further ${document.summary.thin_filings === 1 ? 'filing tags' : 'filings tag'} fewer than eight published concepts and ${document.summary.thin_filings === 1 ? 'has' : 'have'} no page.</p>` : '';
  return renderReferenceDocument({
    path: filingsIndexPath(document.cik), lastmod: document.fetched_at.slice(0, 10), dataset, sources: [`company-data/${document.cik}.json`],
    title: `${label(dataset)}: SEC filings`, heading: `${dataset.name}: filings`,
    description: `Every ${dataset.name} annual and quarterly report in the SEC record with the published financial measures it tagged, ${document.filings.length} filings, each linked to its SEC index.`,
    body: `<section><h2>Filings with published measures</h2><p>Each page shows what one filing reported, as tagged in that filing, with the periods it covered. Later filings can restate a value; the <a href="/companies/${document.cik}">company overview</a> shows the latest-filed value per period.</p><div class="company-reference__table"><table><thead><tr><th scope="col">Form</th><th scope="col">Filed</th><th scope="col">Fiscal period</th><th scope="col">Measures</th><th scope="col">Facts</th><th scope="col">SEC accession</th></tr></thead><tbody>${rows}</tbody></table></div>${thin}</section>${withheld}${provenance(dataset)}`,
  });
}

export function renderFilingPage(document, accession) {
  validate(document);
  const filing = document.filings.find(item => item.accession === accession);
  if (!filing) return null;
  const dataset = company(document);
  const amendment = filing.amendment ? `<p class="company-reference__notice">This is an amendment. Values here are as tagged in the amendment; the original filing has its own page.</p>` : '';
  const sections = filing.concepts.map(concept => `<section aria-labelledby="c-${esc(concept.tag)}"><h3 id="c-${esc(concept.tag)}"><a href="/companies/${document.cik}/${esc(concept.tag)}">${esc(concept.label)}</a></h3><p>${esc(concept.meaning)}</p><div class="company-reference__table"><table><thead><tr><th scope="col">Period</th><th scope="col">Value</th><th scope="col">Unit</th><th scope="col">Days</th></tr></thead><tbody>${concept.facts.map(fact => `<tr><th scope="row">${period(fact)}</th><td>${number(fact.val)}</td><td>${esc(fact.unit)}</td><td>${fact.days ?? ''}</td></tr>`).join('')}</tbody></table></div></section>`).join('');
  return renderReferenceDocument({
    path: filingPath(document.cik, accession), lastmod: document.fetched_at.slice(0, 10), dataset, sources: [`company-data/${document.cik}.json`],
    title: `${label(dataset)} ${filing.form} ${filing.filed}`, heading: `${dataset.name}: ${filing.form} filed ${filing.filed}`,
    description: `What ${dataset.name} reported in its ${formName(filing.form)} filed ${filing.filed} (${fiscal(filing)}): ${filing.concept_count} published measures, ${filing.fact_count} facts as tagged in accession ${filing.accession}.`,
    body: `${amendment}<section><h2>This filing</h2><dl><dt>Form</dt><dd>${esc(filing.form)} (${esc(formName(filing.form))})</dd><dt>Filed</dt><dd>${esc(filing.filed)}</dd><dt>Fiscal period</dt><dd>${esc(fiscal(filing))}</dd><dt>Accession</dt><dd><a href="${esc(filing.sec_index_url)}" rel="noreferrer">${esc(filing.accession)}</a> on SEC EDGAR</dd></dl><p>Values are as tagged in this filing. A later filing can restate them; each measure links to its history page, which shows the latest-filed value per period. <a href="${filingsIndexPath(document.cik)}">All ${esc(dataset.name)} filings</a>.</p></section><section><h2>Reported measures</h2>${sections}</section>${provenance(dataset)}`,
  });
}

export function renderFilingPages(document, { target = 'all' } = {}) {
  validate(document);
  const pages = [];
  if (target === 'all' || target === 'index') pages.push(renderFilingsIndexPage(document));
  for (const filing of document.filings) if (target === 'all' || target === filing.accession) pages.push(renderFilingPage(document, filing.accession));
  return pages;
}
