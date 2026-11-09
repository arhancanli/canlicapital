#!/usr/bin/env node
// /datasets, every dataset this site publishes, and a page for each one that had none: company guidance against
// results (the data behind beat_probability) and every bankruptcy 8-K (the events default_risk predicts). Each page
// reads its figures from the released file itself, copies that file under /datasets/ with its SHA-256, and carries
// Dataset markup so dataset search can find it. FilingFacts keeps its own page (build-datasets-page.mjs).
//   node scripts/build-datasets-hub.mjs
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderProductShellFooter, renderProductShellHeader, renderProductShellStylesheet } from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const AUTHOR = "Arhan Canli";
const LICENSE = "https://creativecommons.org/licenses/by/4.0/";
const REPO = "https://github.com/arhancanli/canlicapital";

export const HUB_ROUTE = "/datasets";
export const DATASETS = Object.freeze({
  guidance: {
    route: "/datasets/company-guidance",
    page: "datasets/company-guidance.html",
    files: [
      { from: "config/research/beat-probability-v1/guidance_lines-2026-11-02.csv", to: "public/datasets/company-guidance/guidance-lines-2026-11-02.csv" },
      { from: "config/research/beat-probability-v1/companies_read-2026-11-02.csv", to: "public/datasets/company-guidance/companies-read-2026-11-02.csv" },
    ],
    summary: "public/datasets/company-guidance/index.json",
    released: "2026-11-02",
  },
  bankruptcy: {
    route: "/datasets/bankruptcy-filings",
    page: "datasets/bankruptcy-filings.html",
    files: [{ from: "config/research/default-risk-v1/bankruptcy_8k.csv", to: "public/datasets/bankruptcy-filings/bankruptcy-8k-item-1-03.csv" }],
    summary: "public/datasets/bankruptcy-filings/index.json",
    released: "2026-11-08",
  },
});

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const int = (n) => n.toLocaleString("en-US");
const pct = (a, b) => `${((100 * a) / b).toFixed(1)}%`;
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// RFC 4180 rows: quoted fields may hold commas.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i += 1; row.push(field); field = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x !== "")) rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const fileInfo = ({ from, to }) => {
  const bytes = readFileSync(resolve(ROOT, from));
  return { url: `/${to.replace(/^public\//, "")}`, name: to.split("/").pop(), sha256: sha256(bytes), kilobytes: Math.round(bytes.length / 1000), rows: parseCsv(bytes.toString("utf8")) };
};

// Where a result landed, with "(the guide was approximate)" folded in and every reason not to place it as one.
const placed = (position) => (/^above/.test(position) ? "above" : /^within/.test(position) ? "within" : /^below/.test(position) ? "below" : "not placed");

export function guidanceSummary() {
  const [lines, companies] = DATASETS.guidance.files.map(fileInfo);
  const byMeasure = {};
  for (const r of lines.rows) {
    const m = (byMeasure[r.measure] ??= { lines: 0, above: 0, within: 0, below: 0, "not placed": 0 });
    m.lines += 1; m[placed(r.position)] += 1;
  }
  const filed = lines.rows.map((r) => r.filed).sort();
  const read = companies.rows.filter((c) => Number(c.releases_read) > 0);
  return {
    schema: "canli.dataset-summary.v1", name: "S&P 500 company guidance against results", released: DATASETS.guidance.released, license: LICENSE,
    files: [lines, companies].map(({ rows, ...f }) => ({ ...f, rows: rows.length })),
    lines: lines.rows.length, companies_with_lines: new Set(lines.rows.map((r) => r.company)).size,
    index_companies: companies.rows.length, companies_read: read.length, releases_read: read.reduce((s, c) => s + Number(c.releases_read), 0),
    first_filed: filed[0], last_filed: filed.at(-1), first_year: Number(filed[0].slice(0, 4)), last_year: Number(filed.at(-1).slice(0, 4)),
    measures: Object.keys(byMeasure).length, by_measure: Object.fromEntries(Object.entries(byMeasure).sort((a, b) => b[1].lines - a[1].lines)),
    hand_check: { lines: 30, right: 29, source: "the dataset's README, 2026-11-02: a random sample of 30 lines read by hand against both quotes" },
  };
}

export function bankruptcySummary() {
  const [file] = DATASETS.bankruptcy.files.map(fileInfo);
  const byYear = {};
  for (const r of file.rows) byYear[r.filed.slice(0, 4)] = (byYear[r.filed.slice(0, 4)] ?? 0) + 1;
  const filed = file.rows.map((r) => r.filed).sort();
  return {
    schema: "canli.dataset-summary.v1", name: "Bankruptcy 8-K filings (Item 1.03)", released: DATASETS.bankruptcy.released, license: LICENSE,
    files: [{ ...file, rows: file.rows.length }].map(({ rows, ...f }) => ({ ...f, rows })),
    filings_by_company: file.rows.length, companies: new Set(file.rows.map((r) => r.cik)).size, filings: new Set(file.rows.map((r) => r.accession)).size,
    first_filed: filed[0], last_filed: filed.at(-1), first_year: Number(filed[0].slice(0, 4)), by_year: byYear,
  };
}

function head({ route, title, description, schema, sources, page }) {
  return `<!doctype html>
<html lang="en" data-page="${page}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}${route}" />
<meta name="author" content="${AUTHOR}" />
<meta name="canli:sources" content="${esc(sources.join(" "))}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}${route}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/css/paper.css" />
${renderProductShellStylesheet()}
<style>
.ds__wrap{overflow-x:auto;margin:1rem 0}
.ds__table{width:100%;border-collapse:collapse}
.ds__table th,.ds__table td{padding:.6rem .5rem;border-bottom:1px solid rgba(0,0,0,.12);text-align:left;vertical-align:top}
.ds__hash{display:block;font-size:.75rem;opacity:.7;overflow-wrap:anywhere}
.ds__code{overflow-x:auto;padding:1rem;background:rgba(0,0,0,.05);border-radius:.5rem;font-size:.85rem}
.paper__crumbs ol{list-style:none;display:flex;flex-wrap:wrap;gap:.35rem;padding:0;margin:0 0 1rem;font-size:.85rem}
.paper__crumbs li+li::before{content:"/";margin-right:.35rem;opacity:.5}
</style>
<script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "datasets" })}
<main class="paper__main" id="content">
  <article class="paper__article">`;
}

const foot = () => `  </article>
</main>
${renderProductShellFooter()}
</body>
</html>
`;

const crumbs = (trail) => `<nav class="paper__crumbs" aria-label="Breadcrumb"><ol>${trail.map(([name, path], i) => (i === trail.length - 1 ? `<li><span aria-current="page">${esc(name)}</span></li>` : `<li><a href="${path}">${esc(name)}</a></li>`)).join("")}</ol></nav>`;
const crumbSchema = (trail) => ({ "@type": "BreadcrumbList", itemListElement: trail.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path}` })) });
const datasetNode = ({ name, description, route, keywords, files, released, temporal }) => ({
  "@type": "Dataset", name, description, url: `${ORIGIN}${route}`, license: LICENSE, isAccessibleForFree: true,
  creator: { "@type": "Person", name: AUTHOR, url: `${ORIGIN}/founder` }, datePublished: released, keywords, ...(temporal ? { temporalCoverage: temporal } : {}),
  distribution: files.map((f) => ({ "@type": "DataDownload", name: f.name, contentUrl: `${ORIGIN}${f.url}`, encodingFormat: "text/csv" })),
});
const downloads = (files, about) => `<div class="ds__wrap" role="region" aria-label="Files" tabindex="0"><table class="ds__table">
        <caption>Each file is CSV with a header row</caption>
        <thead><tr><th scope="col">File</th><th scope="col">Rows</th><th scope="col">What it holds</th><th scope="col">SHA-256</th></tr></thead>
        <tbody>${files.map((f, i) => `<tr><th scope="row"><a href="${esc(f.url)}">${esc(f.name)}</a> (${f.kilobytes} kB)</th><td>${int(f.rows)}</td><td>${esc(about[i])}</td><td><code class="ds__hash">${f.sha256}</code></td></tr>`).join("")}</tbody>
      </table></div>`;
const columns = (rows) => `<div class="ds__wrap" role="region" aria-label="Columns" tabindex="0"><table class="ds__table">
        <caption>The columns</caption>
        <thead><tr><th scope="col">Column</th><th scope="col">What it holds</th></tr></thead>
        <tbody>${rows.map(([c, w]) => `<tr><th scope="row"><code>${esc(c)}</code></th><td>${esc(w)}</td></tr>`).join("")}</tbody>
      </table></div>`;

export const GUIDANCE_TITLE = "S&P 500 guidance against results, 2023 to 2026";
export function guidanceDescription(s) {
  return `${int(s.lines)} lines of what S&P 500 companies guided and then reported, one measure a quarter, from SEC results releases, each linked to its filing.`;
}

export function renderGuidance(s) {
  const route = DATASETS.guidance.route, description = guidanceDescription(s);
  const trail = [["Canli Capital", "/"], ["Datasets", HUB_ROUTE], ["Company guidance", route]];
  const files = s.files;
  const schema = { "@context": "https://schema.org", "@graph": [datasetNode({ name: GUIDANCE_TITLE, description, route, released: s.released, temporal: `${s.first_filed}/${s.last_filed}`, keywords: ["earnings guidance", "guidance vs actual", "S&P 500", "SEC filings", "8-K", "earnings beats", "revenue guidance", "EPS guidance"], files }), crumbSchema(trail)] };
  const measureRows = Object.entries(s.by_measure).filter(([, m]) => m.lines >= 100).map(([name, m]) => `<tr><th scope="row">${esc(name.replaceAll("_", " "))}</th><td>${int(m.lines)}</td><td>${int(m.above)}</td><td>${int(m.within)}</td><td>${int(m.below)}</td><td>${int(m["not placed"])}</td></tr>`).join("");
  return `${head({ route, title: GUIDANCE_TITLE, description, schema, sources: [s.summaryUrl.replace(/^\//, "")], page: "dataset-company-guidance" })}
    ${crumbs(trail)}
    <p class="paper__eyebrow">Dataset</p>
    <h1 class="paper__title">${esc(GUIDANCE_TITLE)}</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, Canli Capital. Released ${s.released}. Free under <a href="${LICENSE}">CC BY 4.0</a>.</p>
    <div class="paper__body">
      <p class="hub__standfirst">What companies told investors to expect, set against what they then reported, read from the quarterly results releases they filed with the SEC. Each of the ${int(s.lines)} rows is one measure for one quarter: the range or figure guided in one release, the result in the next, and where the result landed. Every row links the filing it came from.</p>
      <h2>Download</h2>
      ${downloads(files, ["One measure for one quarter: the guide, the result and where it landed.", "Every company in the index, how many releases were read and how many lines matched, including those with none."])}
      ${columns([["company", "The company, as the index fund lists it."], ["quarter", "The fiscal quarter the result is for."], ["filed", "The day the release with the result was filed."], ["measure", "What was guided: eps, revenue, gross_margin, ebitda and others."], ["basis", "GAAP, non-GAAP, adjusted, organic or constant currency, where the release names one; matched like for like."], ["unit", "The unit both figures are in."], ["guided_low, guided_high", "The guided range; equal for a single figure."], ["actual", "The reported figure."], ["position", "Above, within or below the range, or why it could not be placed (a result too far from the guide to be the same measure, or stated to fewer decimals)."], ["url", "The SEC filing the result was read from."]])}
      <h2>What is in it</h2>
      <ul>
        <li>The ${int(s.index_companies)} companies the Vanguard S&amp;P 500 ETF held, ${int(s.companies_read)} of them read: ${int(s.releases_read)} results releases, filed from ${s.first_year} to ${s.last_year}.</li>
        <li>${int(s.companies_with_lines)} companies have at least one matched line. The rest guide in words, on a call or not at all, or the reader could not match a guide to a result, so companies that publish a number and report the same measure next quarter are over-represented.</li>
        <li>${s.measures} measures in all. Those with at least a hundred lines:</li>
      </ul>
      <div class="ds__wrap" role="region" aria-label="Lines by measure" tabindex="0"><table class="ds__table">
        <caption>Where each result landed against its guide</caption>
        <thead><tr><th scope="col">Measure</th><th scope="col">Lines</th><th scope="col">Above</th><th scope="col">Within</th><th scope="col">Below</th><th scope="col">Not placed</th></tr></thead>
        <tbody>${measureRows}</tbody>
      </table></div>
      <p>These counts take every line as it is. <a href="/notes/how-often-companies-beat-their-guidance">How often companies beat their own guidance</a> counts each company's quarters once and sets ranges apart from single figures.</p>
      <h2>Load it</h2>
      <pre class="ds__code"><code>curl -O ${ORIGIN}${files[0].url}
shasum -a 256 ${esc(files[0].name)}

python3 -c "
import csv
rows = list(csv.DictReader(open('${esc(files[0].name)}')))
print(len(rows), rows[0]['company'], rows[0]['measure'], rows[0]['position'])"</code></pre>
      <h2>How it was made, and what uses it</h2>
      <ul>
        <li>Read with <a href="/mcp-servers/tools/guidance-record"><code>guidance_record</code></a> in <a href="/mcp-servers">canli-mcp</a>, free and open source, which matches each guide to the next result by measure, basis and unit.</li>
        <li><a href="/notes/beat-your-own-guidance">beat_probability</a>, the first Canli model, is fitted and tested on it: the chance a company's next result lands above, within or below its own guide.</li>
      </ul>
      <h2>Limits</h2>
      <ul>
        <li>A hand read of a random sample of ${s.hand_check.lines} lines against both quotes found ${s.hand_check.right} right. Other errors will remain.</li>
        <li>Only what the releases print: guidance given on a call or in a slide deck is not here.</li>
        <li>A record of the past. It is not a forecast and not investment advice.</li>
      </ul>
    </div>
${foot()}`;
}

export const BANKRUPTCY_TITLE = "Every bankruptcy 8-K since 2009";
export function bankruptcyDescription(s) {
  return `${int(s.filings_by_company)} rows, one per company and 8-K reporting bankruptcy or receivership (Item 1.03), ${s.first_year} to ${s.last_filed}, from SEC EDGAR. Free, CC BY 4.0.`;
}

export function renderBankruptcy(s) {
  const route = DATASETS.bankruptcy.route, description = bankruptcyDescription(s);
  const trail = [["Canli Capital", "/"], ["Datasets", HUB_ROUTE], ["Bankruptcy filings", route]];
  const schema = { "@context": "https://schema.org", "@graph": [datasetNode({ name: "Bankruptcy 8-K filings (Item 1.03), 2009 onward", description, route, released: s.released, temporal: `${s.first_filed}/${s.last_filed}`, keywords: ["bankruptcy", "Chapter 11", "8-K Item 1.03", "SEC EDGAR", "default prediction", "credit risk", "receivership"], files: s.files }), crumbSchema(trail)] };
  const years = Object.entries(s.by_year).sort(([a], [b]) => a.localeCompare(b));
  return `${head({ route, title: BANKRUPTCY_TITLE, description, schema, sources: [s.summaryUrl.replace(/^\//, "")], page: "dataset-bankruptcy-filings" })}
    ${crumbs(trail)}
    <p class="paper__eyebrow">Dataset</p>
    <h1 class="paper__title">${esc(BANKRUPTCY_TITLE)}</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, Canli Capital. Released ${s.released}. Free under <a href="${LICENSE}">CC BY 4.0</a>.</p>
    <div class="paper__body">
      <p class="hub__standfirst">A US public company that files for bankruptcy or enters receivership reports it on Form 8-K under Item 1.03. This is every such 8-K that EDGAR's full-text search finds from ${s.first_filed} to ${s.last_filed}: ${int(s.filings)} filings by ${int(s.companies)} companies, one row for each company a filing names (${int(s.filings_by_company)} rows).</p>
      <h2>Download</h2>
      ${downloads(s.files, ["One row per company and filing, oldest first."])}
      ${columns([["cik", "The company's SEC identifier."], ["filed", "The day the 8-K was filed."], ["accession", "The filing's accession number: its address on EDGAR."], ["name", "The company's name as EDGAR shows it on the filing."]])}
      <h2>By year</h2>
      <div class="ds__wrap" role="region" aria-label="Rows by year" tabindex="0"><table class="ds__table">
        <caption>Rows by the year the 8-K was filed</caption>
        <thead><tr><th scope="col">Year</th><th scope="col">Rows</th></tr></thead>
        <tbody>${years.map(([y, n]) => `<tr><th scope="row">${y}</th><td>${int(n)}</td></tr>`).join("")}</tbody>
      </table></div>
      <h2>How it was made, and what uses it</h2>
      <ul>
        <li><a href="${REPO}/blob/main/scripts/research/default-risk/labels.mjs">One script</a> asks EDGAR's full-text search for 8-Ks that mention Item 1.03, year by year, and keeps a filing only if its own list of items carries 1.03; a filing that merely mentions the item is left out. Each year's search returned well under the search's cap of ten thousand hits, so none was cut short.</li>
        <li>They are the events <a href="/notes/bankruptcy-risk-from-an-annual-report">default_risk</a> predicts: the chance a company reports a bankruptcy within a year of its annual report, tested year by year against Ohlson's O-score and Altman's Z''.</li>
      </ul>
      <h2>Limits</h2>
      <ul>
        <li>Only companies that file 8-Ks. A company that stops filing before it fails, as many small ones do, is not here.</li>
        <li>A company can appear more than once: an amended report, a second case, or several entities named on one filing.</li>
        <li>The search reads the filing's own item list; a filing tagged wrongly by its filer is missed or included as tagged.</li>
      </ul>
    </div>
${foot()}`;
}

export const HUB_TITLE = "Open financial datasets from SEC filings";
export function renderHub(cards) {
  const description = `Free datasets from SEC filings: ${cards.map((c) => c.short).join(", ")}. Each file with its SHA-256, CC BY 4.0.`;
  const trail = [["Canli Capital", "/"], ["Datasets", HUB_ROUTE]];
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "DataCatalog", name: "Canli Capital datasets", description, url: `${ORIGIN}${HUB_ROUTE}`, license: LICENSE, creator: { "@type": "Person", name: AUTHOR, url: `${ORIGIN}/founder` }, dataset: cards.map((c) => ({ "@type": "Dataset", name: c.name, url: `${ORIGIN}${c.route}`, description: c.about, license: LICENSE })) },
    crumbSchema(trail)] };
  return `${head({ route: HUB_ROUTE, title: HUB_TITLE, description, schema, sources: cards.map((c) => c.source), page: "datasets-hub" })}
    ${crumbs(trail)}
    <p class="paper__eyebrow">Datasets</p>
    <h1 class="paper__title">${esc(HUB_TITLE)}</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, Canli Capital. Free under <a href="${LICENSE}">CC BY 4.0</a>: credit Canli Capital and link the page you used.</p>
    <div class="paper__body">
      <p class="hub__standfirst">${esc(description)} Every row says where it came from, so any of it can be checked at the SEC.</p>
      ${cards.map((c) => `<section aria-labelledby="ds-${c.id}">
        <h2 id="ds-${c.id}"><a href="${c.route}">${esc(c.name)}</a></h2>
        <p>${esc(c.about)}</p>
        <p><a href="${c.route}">Files, columns and limits</a>${c.uses ? `. ${c.uses}` : ""}</p>
      </section>`).join("\n      ")}
      <h2>More data</h2>
      <ul>
        <li>Every study's results, the files each research page and note cites, are under <a href="/research">Research</a> and <a href="/notes">Notes</a>, each figure traced to its file.</li>
        <li><a href="/companies">Company reference pages</a> give each company's reported figures with the filing behind every value, also as JSON.</li>
        <li><a href="/mcp-servers">canli-mcp</a> reads the filings themselves, for any company and any date.</li>
      </ul>
    </div>
${foot()}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const d of Object.values(DATASETS)) for (const f of d.files) { mkdirSync(dirname(resolve(ROOT, f.to)), { recursive: true }); copyFileSync(resolve(ROOT, f.from), resolve(ROOT, f.to)); }
  const g = { ...guidanceSummary(), summaryUrl: "/datasets/company-guidance/index.json" }, b = { ...bankruptcySummary(), summaryUrl: "/datasets/bankruptcy-filings/index.json" };
  const ff = JSON.parse(readFileSync(resolve(ROOT, "public/datasets/filing-facts/index.json"), "utf8")), ffAll = ff.releases[0];
  writeFileSync(resolve(ROOT, DATASETS.guidance.summary), `${JSON.stringify(g, null, 1)}\n`);
  writeFileSync(resolve(ROOT, DATASETS.bankruptcy.summary), `${JSON.stringify(b, null, 1)}\n`);
  writeFileSync(resolve(ROOT, DATASETS.guidance.page), renderGuidance(g));
  writeFileSync(resolve(ROOT, DATASETS.bankruptcy.page), renderBankruptcy(b));
  writeFileSync(resolve(ROOT, "datasets.html"), renderHub([
    { id: "filing-facts", name: "FilingFacts: SEC filing questions for AI", short: "FilingFacts questions for AI", route: "/datasets/filing-facts", source: "datasets/filing-facts/index.json", about: `${int(ffAll.questions)} questions on ${int(ffAll.companies)} companies, each answer computed from XBRL filings and naming the facts it comes from, for testing whether AI models get finance numbers right.`, uses: "The FilingFacts benchmark scores models on it." },
    { id: "guidance", name: GUIDANCE_TITLE, short: "company guidance against results", route: DATASETS.guidance.route, source: "datasets/company-guidance/index.json", about: `${int(g.lines)} lines, one measure a quarter, of what ${int(g.companies_with_lines)} companies guided against what they then reported, from ${int(g.releases_read)} results releases filed with the SEC.`, uses: "beat_probability is fitted on it." },
    { id: "bankruptcy", name: BANKRUPTCY_TITLE, short: "every bankruptcy 8-K", route: DATASETS.bankruptcy.route, source: "datasets/bankruptcy-filings/index.json", about: `${int(b.filings)} 8-K filings reporting bankruptcy or receivership (Item 1.03) by ${int(b.companies)} companies, ${b.first_filed} to ${b.last_filed}.`, uses: "default_risk predicts them." },
  ]));
  console.log(`  ${HUB_ROUTE} built: guidance ${g.lines} lines, bankruptcy ${b.filings_by_company} rows`);
}
