// Build /review from the governed external-submission and contribution ledgers.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GLASSBOX = resolve(ROOT, "public/glassbox");
const ORIGIN = "https://canlicapital.com";
const REVIEW_ISSUE =
  "https://github.com/arhancanli/alphac/issues/new?template=external-review.yml";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const readJson = (name) => JSON.parse(readFileSync(resolve(GLASSBOX, name), "utf8"));

const capitalLabel = (value) =>
  ({
    ALPACA_PAPER_AND_RESEARCH_SIMULATION_SEPARATELY_LABELLED: "Alpaca paper + simulation",
    LOCAL_SIMULATED_PAPER_NOT_ALPACA: "Local simulated paper",
    RESEARCH_SIMULATION_ONLY: "Research simulation",
  })[value] || value.toLowerCase().replaceAll("_", " ");

const publicPaperPath = (url) => new URL(url).pathname.replace(/\/paper$/, "");

function assertContract(plan, portfolio, records) {
  const external = portfolio.contribution_map?.external_validation;
  if (plan.counts?.wave_1 !== 5 || records.length !== 5) {
    throw new Error("review page: flagship manuscript count is not five");
  }
  if (records.some((record) => record.review.external_reviewer_packet.assigned_reviewers !== 0)) {
    throw new Error("review page: assigned reviewer count changed; update the public state first");
  }
  if (records.some((record) => record.review.external_reviewer_packet.completed_reviews !== 0)) {
    throw new Error("review page: completed reviewer count changed; update the public state first");
  }
  if (
    external?.assigned_reviewers !== 0 ||
    external?.completed_reviews !== 0 ||
    external?.independent_replications !== 0
  ) {
    throw new Error("review page: portfolio validation counts disagree with the submission ledger");
  }
}

function renderManuscript(record, index) {
  const packet = record.review.external_reviewer_packet;
  const shortHash = packet.sha256.slice(0, 12);
  const issueTitle = encodeURIComponent(`review: ${record.registry_key} ${record.version}`);
  return `<article class="review-manuscript" data-registry-key="${escapeHtml(record.registry_key)}">
    <header class="review-manuscript__head">
      <span class="review-manuscript__index">${String(index + 1).padStart(2, "0")}</span>
      <div>
        <p>${escapeHtml(capitalLabel(record.capital_kind))}</p>
        <h3>${escapeHtml(record.title)}</h3>
      </div>
      <span class="review-manuscript__state">Preparation only</span>
    </header>
    <div class="review-manuscript__lanes" aria-label="Requested review roles">
      <section class="review-lane review-lane--methods">
        <span>Methods lane</span>
        <strong>Statistics, econometrics, quantitative finance</strong>
        <small>Unassigned</small>
      </section>
      <section class="review-lane review-lane--repro">
        <span>Reproduction lane</span>
        <strong>Data lineage, environment, commands, hashes</strong>
        <small>Unassigned</small>
      </section>
    </div>
    <footer class="review-manuscript__foot">
      <code>packet sha256 ${escapeHtml(shortHash)}...</code>
      <div>
        <a href="${escapeHtml(publicPaperPath(record.public_canonical))}">Read exact paper</a>
        <a href="${REVIEW_ISSUE}&amp;title=${issueTitle}" rel="noreferrer">Open structured critique <span aria-hidden="true">↗</span></a>
      </div>
    </footer>
  </article>`;
}

function main() {
  const plan = readJson("external_submission_plan.json");
  const portfolio = readJson("stanford_cs_evidence_map.json");
  const records = plan.records.filter((record) => record.wave === 1);
  assertContract(plan, portfolio, records);

  const roles = records.length * 2;
  const assigned = records.reduce(
    (total, record) => total + record.review.external_reviewer_packet.assigned_reviewers,
    0,
  );
  const completed = records.reduce(
    (total, record) => total + record.review.external_reviewer_packet.completed_reviews,
    0,
  );
  const replications = records.reduce(
    (total, record) => total + record.review.independent_replications_completed,
    0,
  );
  if (roles !== 10 || assigned !== 0 || completed !== 0 || replications !== 0) {
    throw new Error("review page: the derived review state does not match its public contract");
  }

  const description =
    "Inspect five ALPHAC flagship manuscripts, their unassigned review roles, evidence bindings " +
    "and the governed path for public technical criticism.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Review ALPHAC research",
    url: `${ORIGIN}/review`,
    description,
    author: { "@id": `${ORIGIN}/#arhan-canli` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: records.length,
      itemListElement: records.map((record, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${ORIGIN}${publicPaperPath(record.public_canonical)}`,
        name: record.title,
      })),
    },
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Review ALPHAC research | Canli Capital</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${ORIGIN}/review" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="external_submission_plan.json stanford_cs_evidence_map.json" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="Review ALPHAC research" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${ORIGIN}/review" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Review ALPHAC research" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/review.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="review-page">
<a class="review-skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "" })}
<main id="content">
  <section class="review-hero" aria-labelledby="review-title">
    <div class="review-hero__thesis">
      <p class="review-kicker">Independent scrutiny / preparation ledger</p>
      <h1 id="review-title">Do not trust the curve. Try to break the claim.</h1>
      <p>Five flagship papers are bound to ten review roles. None is assigned. None is complete.
      This page makes the burden visible and gives technical criticism a structured path.</p>
      <div class="review-hero__actions">
        <a class="review-button review-button--primary" href="#bench">Inspect the review bench</a>
        <a class="review-button" href="${REVIEW_ISSUE}" rel="noreferrer">Open critique form <span aria-hidden="true">↗</span></a>
      </div>
    </div>
    <aside class="review-tally" aria-label="Current review counts">
      <p><span>Current state</span><strong>Preparation only</strong></p>
      <dl>
        <div><dt>Flagship packets</dt><dd>${records.length}</dd></div>
        <div><dt>Independent roles</dt><dd>${roles}</dd></div>
        <div><dt>Assigned reviewers</dt><dd>${assigned}</dd></div>
        <div><dt>Completed reviews</dt><dd>${completed}</dd></div>
        <div><dt>Independent replications</dt><dd>${replications}</dd></div>
      </dl>
    </aside>
  </section>

  <section class="review-boundary" aria-label="Review claim boundary">
    <span>Claim boundary</span>
    <p>${escapeHtml(plan.claim_boundary)}</p>
  </section>

  <section class="review-section review-bench" id="bench" aria-labelledby="bench-title">
    <header class="review-section__head">
      <p class="review-kicker">The review bench</p>
      <h2 id="bench-title">Two independent lanes for every paper.</h2>
      <p>A methods reviewer attacks the inference. A reproducibility reviewer attacks the path from data to claim. One cannot silently substitute for the other.</p>
    </header>
    <div class="review-bench__legend" aria-hidden="true">
      <span>Methods</span><span>Reproducibility</span>
    </div>
    <div class="review-bench__list">${records.map(renderManuscript).join("\n")}</div>
  </section>

  <section class="review-section review-protocol" aria-labelledby="protocol-title">
    <header class="review-section__head">
      <p class="review-kicker">Governed intake</p>
      <h2 id="protocol-title">Criticism first. Status later.</h2>
    </header>
    <ol>
      <li><span>01</span><div><strong>Bind the version</strong><p>Name the manuscript, version and SHA-256. Findings against an unspecified draft cannot change governed status.</p></div></li>
      <li><span>02</span><div><strong>Disclose the reviewer</strong><p>Record qualifications, relationships, conflicts, compensation and automated tool use before assignment.</p></div></li>
      <li><span>03</span><div><strong>Number the findings</strong><p>Mark every item blocking, major, minor or question. Ask for criticism, not approval.</p></div></li>
      <li><span>04</span><div><strong>Separate review from execution</strong><p>Replication requires commands, environment, hashes, deviations and an outcome from a system outside the project.</p></div></li>
      <li><span>05</span><div><strong>Keep every objection</strong><p>Arhan answers each finding. The original review and unresolved objections stay attached to the revised version.</p></div></li>
    </ol>
  </section>

  <section class="review-section review-states" aria-labelledby="states-title">
    <div>
      <p class="review-kicker">What counts</p>
      <h2 id="states-title">A public issue is evidence of criticism. It is not peer review.</h2>
    </div>
    <dl>
      <div><dt>Issue opened</dt><dd>Public technical criticism</dd><small>Not assigned review</small></div>
      <div><dt>Conflict screen passed</dt><dd>Eligible reviewer for one scope</dd><small>Not completed review</small></div>
      <div><dt>Findings answered</dt><dd>Completed governed review</dd><small>Not replication</small></div>
      <div><dt>Protocol executed externally</dt><dd>Replication attempt</dd><small>Outcome may pass or fail</small></div>
      <div><dt>Journal or conference decision</dt><dd>Formal editorial state</dd><small>Submission is not acceptance</small></div>
    </dl>
  </section>

  <section class="review-section review-close" aria-labelledby="close-title">
    <p class="review-kicker">Public correction channel</p>
    <h2 id="close-title">Find the strongest reason a claim could be wrong.</h2>
    <p>Formal commissioning and archive release remain gated. The public papers and correction channel are available now. No favorable conclusion is requested.</p>
    <div class="review-hero__actions">
      <a class="review-button review-button--primary" href="${REVIEW_ISSUE}" rel="noreferrer">Open structured critique <span aria-hidden="true">↗</span></a>
      <a class="review-button" href="/progress">Read published corrections</a>
    </div>
  </section>
</main>
${renderProductShellFooter()}
</body>
</html>
`;

  if (html.includes(String.fromCodePoint(0x2014))) {
    throw new Error("review page: rendered copy contains an em dash");
  }
  writeFileSync(resolve(ROOT, "review.html"), html);
  console.log(
    `rendered /review: ${records.length} packets, ${roles} roles, ${assigned} assigned, ` +
      `${completed} completed, ${replications} replications`,
  );
}

main();
