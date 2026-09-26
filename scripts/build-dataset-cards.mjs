#!/usr/bin/env node
// Writes the public card for each released dataset from its own records, and a summary record under
// /glassbox/datasets/ that holds every figure the card prints plus the card's schema.org Dataset
// node (scripts/build-papers.mjs emits it for any research page that links a dataset record).
// No figure on the card is typed: scripts/build-dataset-cards.test.mjs fails if the committed card
// or checksum file drifts from what this script writes.
//   node scripts/build-dataset-cards.mjs
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { behaviour } from "./datasets/filing-facts/eval.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const AUTHOR = "Arhan Canli";
const ORCID = "https://orcid.org/0009-0004-4138-7907";
const LICENSE = { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" };
const REPO = "https://github.com/arhancanli/canlicapital";

export const FILING_FACTS = Object.freeze({
  slug: "filing-facts-v0",
  version: "0",
  declared: "2026-09-26",
  dir: "public/datasets/filing-facts/v0",
  files: {
    items: "filing-facts-v0.jsonl",
    closed: "ff-eval-closed.json",
    mcp: "ff-eval-mcp.json",
    gold: "gold-packet-v0.json",
  },
});

const pct = (x) => (x === null || x === undefined ? "n/a" : `${(100 * x).toFixed(1)}%`);
const int = (n) => n.toLocaleString("en-US");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const TEMPLATE_TEXT = {
  lookup: ["one value as reported in a named annual filing", 1],
  change: ["the percent change of one concept between two fiscal years or balance dates", 2],
  ratio: ["a ratio of two concepts for the same period (margin, leverage, cash share)", 2],
  net_assets: ["total assets minus total liabilities at one balance date", 2],
  unanswerable: ["a period before the concept's earliest annual XBRL fact; the right answer is that the XBRL filings do not report it", 1],
};

export function filingFactsSummary() {
  const spec = FILING_FACTS;
  const path = (name) => resolve(ROOT, spec.dir, name);
  const raw = Object.fromEntries(Object.entries(spec.files).map(([key, name]) => [key, readFileSync(path(name))]));
  const items = raw.items.toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
  const closed = JSON.parse(raw.closed.toString("utf8"));
  const mcp = JSON.parse(raw.mcp.toString("utf8"));
  const gold = JSON.parse(raw.gold.toString("utf8"));
  const templates = [...new Set(items.map((item) => item.template))].sort();
  const unknown = templates.filter((t) => !TEMPLATE_TEXT[t]);
  if (unknown.length) throw new Error(`filing facts: no description for template(s) ${unknown.join(", ")}`);
  const ends = items.flatMap((item) => item.facts.map((fact) => fact.end)).sort();
  const filed = items.flatMap((item) => item.facts.map((fact) => fact.filed)).sort();
  const arm = (record) => ({
    model: record.summary.model,
    items: record.runs.length,
    accuracy: record.summary.accuracy,
    mean_tokens: record.summary.mean_tokens,
    by_template: Object.fromEntries(templates.map((t) => [t, record.summary.by_template[t]?.accuracy ?? null])),
    behaviour: behaviour(record.runs),
  });
  const summary = {
    schema: "canli.dataset-summary.v1",
    dataset: "Canli FilingFacts",
    version: spec.version,
    declared: spec.declared,
    license: LICENSE,
    items: items.length,
    companies: new Set(items.map((item) => item.company.cik)).size,
    by_template: Object.fromEntries(templates.map((t) => [t, items.filter((item) => item.template === t).length])),
    facts_cited: items.reduce((n, item) => n + item.facts.length, 0),
    period_ends: { first: ends[0], last: ends.at(-1) },
    filed: { first: filed[0], last: filed.at(-1) },
    baseline: { closed_book: arm(closed), with_mcp: arm(mcp) },
    gold_packet_items: gold.labels.length,
    human_verified_items: 0,
    files: Object.fromEntries(
      Object.entries(spec.files).map(([key, name]) => [key, { path: `/datasets/filing-facts/v${spec.version}/${name}`, bytes: statSync(path(name)).size, kilobytes: Math.round(statSync(path(name)).size / 1024), sha256: sha256(raw[key]) }]),
    ),
  };
  if (summary.baseline.closed_book.model !== summary.baseline.with_mcp.model) throw new Error("filing facts: the two baseline arms used different models");
  return summary;
}

function jsonLd(summary) {
  const url = `${ORIGIN}/research/${FILING_FACTS.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `Canli FilingFacts v${summary.version}: financial reasoning items verified from SEC XBRL data`,
    alternateName: `FilingFacts v${summary.version}`,
    description:
      `${int(summary.items)} questions about ${int(summary.companies)} companies' SEC annual filings, each answer computed ` +
      "from the company's XBRL facts, re-derived by an independent checker, and cited to the filing accession it depends on. " +
      "Includes unanswerable items and a closed-book versus tool-using baseline.",
    url,
    identifier: url,
    version: summary.version,
    datePublished: summary.declared,
    license: summary.license.url,
    isAccessibleForFree: true,
    creator: { "@type": "Person", "@id": `${ORIGIN}/#arhan-canli`, name: AUTHOR, url: `${ORIGIN}/founder`, sameAs: ["https://github.com/arhancanli", ORCID] },
    publisher: { "@type": "Organization", "@id": `${ORIGIN}/#organization`, name: "Canli Capital", url: `${ORIGIN}/` },
    keywords: ["financial question answering", "SEC XBRL", "10-K", "LLM evaluation", "hallucination", "financial reasoning benchmark"],
    temporalCoverage: `${summary.period_ends.first}/${summary.period_ends.last}`,
    measurementTechnique: "Generated from SEC XBRL company facts; every answer re-derived by an independent checker",
    isBasedOn: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
    variableMeasured: ["question", "answer", "facts", "template", "hops"],
    distribution: [
      { "@type": "DataDownload", name: "Items (JSON Lines)", contentUrl: `${ORIGIN}${summary.files.items.path}`, encodingFormat: "application/jsonl", contentSize: `${summary.files.items.bytes} bytes` },
      { "@type": "DataDownload", name: "Gold packet for annotators", contentUrl: `${ORIGIN}${summary.files.gold.path}`, encodingFormat: "application/json" },
    ],
  };
}

export function filingFactsCard(summary) {
  const record = `/glassbox/datasets/${FILING_FACTS.slug}.json`;
  const c = summary.baseline.closed_book;
  const m = summary.baseline.with_mcp;
  const templates = Object.keys(summary.by_template);
  const templateRows = templates.map((t) => `| ${t} | ${TEMPLATE_TEXT[t][0]} | ${TEMPLATE_TEXT[t][1]} | ${int(summary.by_template[t])} |`).join("\n");
  const behaviourRow = (label, key, withCount) =>
    `| ${label} | ${pct(c.behaviour[key])}${withCount ? ` (${c.behaviour.numbers_given} numbers)` : ""} | ${pct(m.behaviour[key])}${withCount ? ` (${m.behaviour.numbers_given} numbers)` : ""} |`;
  const fileRow = (label, key) => `| [${summary.files[key].path.split("/").at(-1)}](${summary.files[key].path}) | ${label} | ${int(summary.files[key].kilobytes)} KB |`;
  return `# FilingFacts v${summary.version}: financial reasoning items verified from SEC XBRL data

**Short title:** FilingFacts v${summary.version} dataset
**Author:** ${AUTHOR}
**Declared:** ${summary.declared}, with its build and evaluation records published beside it.
**License:** [${summary.license.name}](${summary.license.url})

FilingFacts is a set of ${int(summary.items)} questions about the annual SEC filings of ${int(summary.companies)} companies.
Every answer is computed from the company's XBRL facts, re-derived by an independent checker, and
cited to the accession number of each filing it depends on, so a model's answer can be scored
against the filing rather than against another model.

## What is in it

| template | asks for | hops | items |
|---|---|---|---|
${templateRows}

The items cite ${int(summary.facts_cited)} facts from filings made between ${summary.filed.first} and ${summary.filed.last},
for periods ending between ${summary.period_ends.first} and ${summary.period_ends.last}. Figures on this page are read from
[\`${record}\`](${record}).

Rules: only annual-report facts (fiscal period FY on 10-K, 20-F, 40-F and their amendments), so a
question never mixes a quarter with a year; one value per concept, period end and unit; a period
whose annual filings disagree on the value is dropped as ambiguous; an unanswerable item claims
absence only from the company's XBRL filings.

## Baseline: ${c.model}, ${c.items} items, closed book and with a tool

| | closed book | with canli-validation-mcp's company tool |
|---|---|---|
| accuracy, all items | ${pct(c.accuracy)} | ${pct(m.accuracy)} |
| accuracy on answerable items | ${pct(c.behaviour.answerable_accuracy)} | ${pct(m.behaviour.answerable_accuracy)} |
${behaviourRow("numbers given on answerable items that were wrong", "numbers_wrong", true)}
${behaviourRow("answerable items the model called \"not reported\"", "answerable_abstention", false)}
${behaviourRow("unanswerable items answered \"not reported\"", "unanswerable_abstention", false)}
${behaviourRow("unanswerable items answered with an invented number", "unanswerable_invented_number", false)}
| mean tokens per item | ${int(c.mean_tokens)} | ${int(m.mean_tokens)} |

By template (accuracy, closed book then with the tool): ${templates.map((t) => `${t} ${pct(c.by_template[t])} and ${pct(m.by_template[t])}`).join("; ")}.

Accuracy on all items rewards a model that answers "not reported" to everything, because the
unanswerable items then score. The behaviour rows separate knowing that data is absent from
declining to answer.

## Download

| file | contents | size |
|---|---|---|
${fileRow("the items, one JSON object per line", "items")}
${fileRow("closed-book baseline, every run", "closed")}
${fileRow("baseline with the company tool, every run", "mcp")}
${fileRow("the gold packet annotators fill in", "gold")}

Checksums: [SHA256SUMS](/datasets/filing-facts/v${summary.version}/SHA256SUMS). The generator, the independent checker and
the evaluation harness are in [\`scripts/datasets/filing-facts/\`](${REPO}/tree/main/scripts/datasets/filing-facts), so
anyone can rebuild the items from the public company data, including from filings made after a
model's training cutoff.

## License and citation

The items are released under ${summary.license.name}. The underlying SEC filings are US public domain.
Cite as: ${AUTHOR} (${summary.declared.slice(0, 4)}), FilingFacts v${summary.version}: financial reasoning items verified from
SEC XBRL data, Canli Capital, ${ORIGIN}/research/${FILING_FACTS.slug}.

## Help verify it

No item has been verified by a person yet (${summary.human_verified_items} of ${int(summary.items)}). The gold packet holds
${summary.gold_packet_items} items stratified by template, and [the annotation page](/annotate) walks you through them in
your browser; [the annotation guidelines](${REPO}/blob/main/scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md)
say how to check each one against the filing itself. Two annotators fill copies independently, and
\`agreement.mjs\` reports raw agreement and Cohen's kappa for each judgement.

## Evidence boundary

The answers are checked against XBRL facts, not against the filings' rendered text, so a filer's
tagging error becomes the dataset's answer. The baseline covers one model on a fixed sample and
says nothing about other models. Restatement items (first-reported versus later-reported values)
are planned for a later version.
`;
}

export function build({ write = true } = {}) {
  const summary = filingFactsSummary();
  const record = { ...summary, jsonld: jsonLd(summary) };
  const sums = Object.values(summary.files)
    .map((file) => `${file.sha256}  ${file.path.split("/").at(-1)}`)
    .sort((a, b) => a.slice(66).localeCompare(b.slice(66)))
    .join("\n") + "\n";
  const outputs = {
    [`public/research/${FILING_FACTS.slug}.md`]: filingFactsCard(summary),
    [`${FILING_FACTS.dir}/SHA256SUMS`]: sums,
  };
  if (write) {
    mkdirSync(resolve(ROOT, "public/glassbox/datasets"), { recursive: true });
    writeFileSync(resolve(ROOT, `public/glassbox/datasets/${FILING_FACTS.slug}.json`), `${JSON.stringify(record, null, 2)}\n`);
    for (const [rel, text] of Object.entries(outputs)) writeFileSync(resolve(ROOT, rel), text);
  }
  return { outputs, record };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { record } = build();
  console.log(`dataset cards: ${FILING_FACTS.slug} (${record.items} items, ${record.companies} companies), record under /glassbox/datasets/`);
}
