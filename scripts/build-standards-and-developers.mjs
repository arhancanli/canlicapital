// =============================================================================
// build-standards-and-developers.mjs
// -----------------------------------------------------------------------------
// Publishes the open standard and the API documentation, and copies the schema,
// the conformance vectors and their manifest into public/ so they are downloadable
// rather than merely described.
//
// A specification nobody can fetch is a blog post. The pages here exist to explain
// the artifacts; the artifacts are the deliverable.
// =============================================================================

import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const SRC = resolve(ROOT, "standards/paper-evidence");
const PUB = resolve(ROOT, "public/standards/paper-evidence/v0");

const esc = (v) =>
  String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function publishArtifacts() {
  mkdirSync(resolve(PUB, "vectors"), { recursive: true });
  copyFileSync(resolve(SRC, "schema.json"), resolve(PUB, "schema.json"));
  copyFileSync(resolve(SRC, "vectors/manifest.json"), resolve(PUB, "vectors/manifest.json"));
  const names = readdirSync(resolve(SRC, "vectors")).filter((f) => f.endsWith(".json"));
  for (const name of names) copyFileSync(resolve(SRC, "vectors", name), resolve(PUB, "vectors", name));
  // The validator itself, so conformance can be checked without this site.
  copyFileSync(resolve(ROOT, "js/paper-evidence-core.js"), resolve(PUB, "validator.js"));
  return names.length;
}

function head({ title, description, route, jsonLd, sources }) {
  return `<!doctype html>
<html lang="en" data-page="${route.slice(1).replace(/\//g, "-")}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}${route}" />
<meta name="author" content="Arhan Canli" />${sources ? `\n<meta name="canli:sources" content="${esc(sources)}" />` : ""}
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}${route}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/developers.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>`;
}

function buildStandard(vectorCount) {
  const manifest = JSON.parse(readFileSync(resolve(SRC, "vectors/manifest.json"), "utf8"));
  // Rendered from the receipt produced by an actual validator run, so the page
  // cannot state a conformance result the validator did not produce.
  const receipt = JSON.parse(
    readFileSync(resolve(ROOT, "public/glassbox/paper_evidence_conformance.json"), "utf8"),
  );
  const invalid = manifest.vectors.filter((v) => v.expect === "INVALID");
  const schema = JSON.parse(readFileSync(resolve(SRC, "schema.json"), "utf8"));
  const required = schema.required;

  const description =
    "A proposed open standard for reporting paper-traded and simulated strategy performance, " +
    "whose required fields are the ones a performance claim usually omits.";

  const html = `${head({
    title: "canli.paper-evidence.v0",
    description,
    route: "/standards/paper-evidence",
    sources: "paper_evidence_conformance.json",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: "canli.paper-evidence.v0: an open standard for paper-trading evidence",
      description,
      url: `${ORIGIN}/standards/paper-evidence`,
      author: { "@id": `${ORIGIN}/#arhan-canli` },
      license: "https://opensource.org/licenses/MIT",
    },
  })}
<body class="dev-page">
<a class="dev-skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "" })}
<main id="content">
  <section class="dev-hero">
    <p class="dev-kicker"><span>Proposed open standard</span><span>canli.paper-evidence.v0</span></p>
    <h1>A performance record that states what it does not know.</h1>
    <p class="dev-lead">Almost every way a published track record misleads is an omission, not a
      wrong number: the capital was paper and it did not say so, the costs were modelled and it did
      not say so, the result was the best of two hundred tries and it did not say so. This schema
      makes those the <strong>required</strong> fields.</p>
    <p class="dev-boundary"><strong>Status.</strong> Proposed, version zero, published for
      criticism. It has one implementation, which is mine, and ${receipt.independent_implementations === 0 ? "no independent one" : `${receipt.independent_implementations} independent`}. That is a
      statement of maturity, not modesty: a format with a single implementer is a house style until
      somebody else can read it.</p>
  </section>

  <section class="dev-section">
    <h2>What it requires, and why</h2>
    <p class="dev-note">${required.length} top-level members, every one of them mandatory. The
      interesting ones are the last three.</p>
    <div class="dev-grid">
      <article><h3><code>capital</code></h3><p>Paper, funded, simulated or mixed, and where the
        fills came from. The single most misreadable fact about any record, enumerated so it
        cannot be softened into prose.</p></article>
      <article><h3><code>identity</code></h3><p>What the record is about and whether that identity
        was frozen before the returns were opened. <code>false</code> is a legitimate answer and
        far more useful than an absent field.</p></article>
      <article><h3><code>returns</code></h3><p>Carries <code>basis</code> and
        <code>sharpe_reportable</code>. A short sample must set the latter false and leave the
        Sharpe null rather than publish a figure the sample cannot carry.</p></article>
      <article><h3><code>costs</code></h3><p>What was charged and what was assumed. Absent cost
        modelling is itself a disclosure.</p></article>
      <article><h3><code>selection</code></h3><p>How much searching produced the result. Without
        it a Sharpe ratio is uninterpretable, which is the most common defect in published
        performance.</p></article>
      <article><h3><code>corrections</code></h3><p>What has been withdrawn. A record with no
        correction history and no statement that it has none is silent, not clean.</p></article>
      <article><h3><code>provenance</code></h3><p>At least one source binding with a SHA-256, so a
        reader can check something without trusting the publisher.</p></article>
      <article class="dev-grid__wide"><h3><code>claim_maturity.does_not_establish</code></h3>
        <p>At least one entry, enforced by the schema. Every record fails to establish something,
        and a publisher who cannot name one has not looked. This is the field the standard exists
        for: it is the only one that cannot be satisfied by pointing at a number you already
        had.</p></article>
    </div>
  </section>

  <section class="dev-section">
    <h2>Conformance</h2>
    <p class="dev-note">A validator with ${receipt.validator.dependencies} dependencies, and
      ${receipt.totals.invalid} invalid vectors, each breaking exactly one rule so an implementer
      can diff them against the valid one and read the rule off the difference. On the last run,
      ${receipt.totals.behaved_as_declared} of ${receipt.totals.vectors} vectors behaved as
      declared and ${receipt.totals.failed_at_declared_pointer} failed <em>at the pointer they
      declare</em>. That second number is the one worth having: a vector failing for an unrelated
      reason looks like a passing test while hiding a rule that does not work.
      <a href="/glassbox/paper_evidence_conformance.json">The receipt</a> is published.</p>
    <table class="dev-table">
      <thead><tr><th>Vector</th><th>Violates</th><th>Why it matters</th></tr></thead>
      <tbody>
        ${invalid.map((v) => `<tr><td><a href="/standards/paper-evidence/v0/vectors/${esc(v.name)}.json"><code>${esc(v.name.replace("invalid-", ""))}</code></a></td><td><code>${esc(v.violates)}</code></td><td>${esc(v.why)}</td></tr>`).join("\n        ")}
      </tbody>
    </table>
  </section>

  <section class="dev-section">
    <h2>The flagship instance is my own record</h2>
    <p class="dev-note">A standard whose only example is invented is a wish. The valid vector is
      this project's live paper record, generated from the same artifacts the site renders from,
      and the build fails if it ever stops conforming. Writing it was the useful part: mapping your
      own record into a schema that asks what you do not know is where you find out whether you can
      answer.</p>
    <div class="dev-downloads">
      <a class="dev-button dev-button--primary" href="/standards/paper-evidence/v0/schema.json">JSON Schema</a>
      <a class="dev-button" href="/standards/paper-evidence/v0/vectors/valid-alphac-book.json">Valid instance</a>
      <a class="dev-button" href="/standards/paper-evidence/v0/vectors/manifest.json">Vector manifest</a>
      <a class="dev-button" href="/standards/paper-evidence/v0/validator.js">Validator</a>
      <a class="dev-button" href="/api/v1/record">Live instance via the API</a>
    </div>
  </section>

  <section class="dev-section dev-section--tail">
    <h2>Governance</h2>
    <p class="dev-note">Version zero. Breaking changes bump the version in the <code>schema</code>
      member, which is a <code>const</code> so a record can never claim a version it does not
      implement. Criticism is welcome through
      <a href="https://github.com/arhancanli/alphac/issues/new?template=external-review.yml" rel="noreferrer">the governed review route</a>,
      and the honest next milestone is one independent implementation attempt, pass or fail.</p>
    <p class="dev-note">MIT licensed, like everything else here. Authored by
      <a href="/founder">Arhan Canli</a>.</p>
  </section>
</main>
${renderProductShellFooter()}
</body>
</html>
`;
  writeFileSync(resolve(ROOT, "standards/paper-evidence.html"), html);
  return { invalid: invalid.length, required: required.length, vectorCount };
}

function buildDevelopers() {
  const index = JSON.parse(readFileSync(resolve(ROOT, "public/api/v1/index.json"), "utf8"));
  const openapi = JSON.parse(readFileSync(resolve(ROOT, "public/api/v1/openapi.json"), "utf8"));
  const summaries = Object.entries(openapi.paths).map(([path, def]) => ({ path, summary: def.get.summary }));

  const description =
    "A static, cacheable read API over the Canli Capital paper record. Every response carries its " +
    "sources, their hashes, its claim class and its limits.";

  const html = `${head({
    title: "Developers",
    description,
    route: "/developers",
    sources: "",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebAPI",
      name: "Canli Capital public read API",
      description,
      documentation: `${ORIGIN}/developers`,
      url: `${ORIGIN}/api/v1`,
      provider: { "@id": `${ORIGIN}/#organization` },
      termsOfService: `${ORIGIN}/methodology`,
    },
  })}
<body class="dev-page">
<a class="dev-skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "" })}
<main id="content">
  <section class="dev-hero">
    <p class="dev-kicker"><span>Public read API</span><span>v1</span></p>
    <h1>Every response says what it cannot be used to claim.</h1>
    <p class="dev-lead">Static JSON, regenerated on each publish, no key and no rate limit because
      there is nothing to authenticate to and nothing to overload. An API is the easiest place on a
      site to lose a claim boundary, because nobody reads one by eye, so the boundary is part of
      the envelope rather than part of the documentation.</p>
    <div class="dev-downloads">
      <a class="dev-button dev-button--primary" href="/api/v1">Discovery document</a>
      <a class="dev-button" href="/api/v1/openapi">OpenAPI 3.1</a>
      <a class="dev-button" href="/standards/paper-evidence">The record standard</a>
    </div>
  </section>

  <section class="dev-section">
    <h2>Endpoints</h2>
    <table class="dev-table">
      <thead><tr><th>Path</th><th>What it returns</th></tr></thead>
      <tbody>
        ${summaries.map((e) => `<tr><td><a href="${esc(e.path)}"><code>GET ${esc(e.path)}</code></a></td><td>${esc(e.summary)}</td></tr>`).join("\n        ")}
      </tbody>
    </table>
  </section>

  <section class="dev-section">
    <h2>The envelope</h2>
    <p class="dev-note">Every response has the same shape. The two fields worth reading first are
      the two an API usually omits.</p>
    <div class="dev-grid">
      <article><h3><code>claim_class</code></h3><p>What kind of claim this is: observed, model
        estimated, a published document, a cryptographic record. Merging these is how a simulated
        figure acquires the authority of a measured one.</p></article>
      <article><h3><code>limits</code></h3><p>What this response cannot be used to say. The build
        refuses to emit an endpoint that declares none.</p></article>
      <article><h3><code>sources</code></h3><p>Every artifact the response was built from, with a
        SHA-256 and a URL, so a consumer can recompute rather than trust.</p></article>
      <article><h3><code>generated_at</code></h3><p>The freshness of every figure inside. These are
        snapshots, not a stream.</p></article>
    </div>
  </section>

  <section class="dev-section dev-section--tail">
    <h2>Limits of the whole API</h2>
    <ul class="dev-list">
      ${index.limits.map((l) => `<li>${esc(l)}</li>`).join("\n      ")}
      <li>Sleeve research curves are decimated for display and are <strong>not on a common date
        grid</strong>. They cannot be combined into a composite by a consumer, and the composite is
        published separately for that reason.</li>
    </ul>
    <p class="dev-note">Found a problem?
      <a href="https://github.com/arhancanli/alphac/issues/new?template=external-review.yml" rel="noreferrer">The governed review route</a>
      is the fastest way to get it fixed and recorded.</p>
  </section>
</main>
${renderProductShellFooter()}
</body>
</html>
`;
  writeFileSync(resolve(ROOT, "developers.html"), html);
  return summaries.length;
}

const vectorCount = publishArtifacts();
const standard = buildStandard(vectorCount);
const endpoints = buildDevelopers();
console.log(
  `  /standards/paper-evidence: ${standard.required} required members, ${standard.invalid} invalid vectors published`,
);
console.log(`  /developers: ${endpoints} endpoints documented`);
