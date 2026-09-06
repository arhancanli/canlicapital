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

import { KEY_LIFECYCLE_TEXT, LIMITS, LIMITS_TEXT } from "../api/_lib/limits.js";
import { MANIFEST, SNIPPET_LABELS } from "../api/_lib/manifest.js";
import { renderAll, renderCurl, renderJs, renderPython } from "./render-snippets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const SRC = resolve(ROOT, "standards/paper-evidence");
const PUB = resolve(ROOT, "public/standards/paper-evidence/v0");

const esc = (v) =>
  String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// curl, Python and JavaScript, side by side, generated from the SAME manifest requestExample
// (see scripts/render-snippets.mjs). One route, three copy-ready blocks; none can name a body
// its own handler would refuse, because a test round-trips every one of them.
const LANG_LABEL = { curl: "curl", python: "Python", javascript: "JavaScript" };
const blocksFromPairs = (pairs) =>
  pairs.map(({ lang, code }) => `<div class="dev-snippet"><p class="dev-snippet-label">${esc(LANG_LABEL[lang])}</p><pre class="dev-code"><code>${esc(code)}</code></pre></div>`).join("\n      ");
const languageBlocks = (m, example) => blocksFromPairs(renderAll(m, example));

// A route can declare `modes`: a discriminated union of input shapes (deflated-sharpe's seven
// contract fields OR a return series plus its trials) rather than one flattened example. Such a
// route gets one labelled group of three language blocks PER MODE, so a developer sees every
// shape the handler accepts instead of one example that could only ever show one of them.
function snippetsBlock(m) {
  if (Array.isArray(m.modes) && m.modes.length) {
    return m.modes.map((mode) => `<div class="dev-mode">
      <p class="dev-note"><strong>${esc(mode.label ?? mode.name)}</strong></p>
      <div class="dev-snippets">
      ${languageBlocks(m, mode.example)}
      </div>
    </div>`).join("\n    ");
  }
  return `<div class="dev-snippets">
      ${languageBlocks(m)}
    </div>`;
}

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
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" /></noscript>
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
    <p class="dev-note">Checking a submission of your own against this schema does not have to stay
      private: the <a href="/developers#validation">free keyed API</a> returns a receipt id with every
      verdict, and that id is exactly what a submission can cite as evidence the check ran.</p>
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
    <p class="dev-note"><strong>Change already queued for v1.</strong> <code>costs.not_modelled</code>
      was added to v0 as an OPTIONAL member and should become required. A cost model described
      only by its inclusions is structurally misleading: a reader cannot tell a cost judged
      immaterial from one nobody considered, because both appear as silence. It was not made
      required immediately because that is a breaking change, and the rule below is the rule
      whether or not it is inconvenient on the day it applies.</p>
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

// Pulls one fenced code block out of a markdown file by the heading right above it, so a snippet
// shown on the site is read from the same file an agent (or a person) reads directly, rather than
// typed a second time and left free to drift from it. Throws loudly if the heading or the fence is
// gone, rather than silently rendering an empty block, because a missing snippet is a build defect.
function extractReadmeFence(markdown, heading, lang) {
  const headingIndex = markdown.indexOf(`## ${heading}`);
  if (headingIndex === -1) throw new Error(`mcp/README.md: no "## ${heading}" heading found`);
  const fenceMark = "```" + lang;
  const fenceOpen = markdown.indexOf(fenceMark, headingIndex);
  if (fenceOpen === -1) throw new Error(`mcp/README.md: no ${fenceMark} fence under "## ${heading}"`);
  const bodyStart = markdown.indexOf("\n", fenceOpen) + 1;
  const fenceClose = markdown.indexOf("```", bodyStart);
  if (fenceClose === -1) throw new Error(`mcp/README.md: unterminated fence under "## ${heading}"`);
  return markdown.slice(bodyStart, fenceClose).trimEnd();
}

// The short "From your AI assistant" block on /developers: the MCP server wraps the same seven
// routes documented below it, read from mcp/package.json and mcp/README.md rather than typed
// here, so this section cannot drift from what an agent running that package actually sees.
function mcpAssistantSection() {
  const mcpPkg = JSON.parse(readFileSync(resolve(ROOT, "mcp/package.json"), "utf8"));
  const readme = readFileSync(resolve(ROOT, "mcp/README.md"), "utf8");
  const claudeCodeInstall = extractReadmeFence(readme, "Claude Code", "bash");
  const claudeDesktopJson = extractReadmeFence(readme, "Claude Desktop", "json");
  const npmUrl = `https://www.npmjs.com/package/${mcpPkg.name}`;
  return `<section class="dev-section" id="ai-assistant">
    <h2>From your AI assistant</h2>
    <p class="dev-note">This API is also an MCP server, so a coding assistant can call the
      routes on this page as tools instead of writing requests by hand. Every tool it exposes
      returns the full envelope, the same way every route on this page does, so the assistant
      sees what a number cannot be used to claim, not only the number.</p>
    <div class="dev-snippet"><p class="dev-snippet-label">Claude Code</p><pre class="dev-code"><code>${esc(claudeCodeInstall)}</code></pre></div>
    <div class="dev-snippet"><p class="dev-snippet-label">Claude Desktop</p><pre class="dev-code"><code>${esc(claudeDesktopJson)}</code></pre></div>
    <p class="dev-note"><a href="${esc(npmUrl)}" rel="noreferrer">${esc(mcpPkg.name)} on npm</a>, with the full tool list and what each one does not establish.</p>
  </section>`;
}

function buildDevelopers() {
  const index = JSON.parse(readFileSync(resolve(ROOT, "public/api/v1/index.json"), "utf8"));
  const openapi = JSON.parse(readFileSync(resolve(ROOT, "public/api/v1/openapi.json"), "utf8"));
  const summaries = Object.entries(openapi.paths)
    .filter(([path, def]) => def.get && !MANIFEST.some((m) => m.path === path))
    .map(([path, def]) => ({ path, summary: def.get.summary }));
  const validators = MANIFEST.filter((m) => m.method === "POST" && m.keyed);
  const keysRoute = MANIFEST.find((m) => m.path === "/api/v1/keys");
  const firstValidator = validators[0];

  // POST /api/v1/keys, once, but each language gets its OWN default label rather than the one
  // manifest example repeated three times: an unedited copy-paste from curl, Python or the "Get a
  // key" button each stamps a different string on the issued key's row, so a count of api_keys
  // grouped by label is a source breakdown with no tracking parameter (SNIPPET_LABELS is the one
  // table; nothing here is typed a second time).
  const keysSnippetsBlock = () => {
    const withLabel = (label) => ({ ...keysRoute.requestExample, label });
    const pairs = [
      { lang: "curl", code: renderCurl(keysRoute, withLabel(SNIPPET_LABELS.quickstartCurl)) },
      { lang: "python", code: renderPython(keysRoute, withLabel(SNIPPET_LABELS.quickstartPython)) },
      { lang: "javascript", code: renderJs(keysRoute, withLabel(SNIPPET_LABELS.quickstartJs)) },
    ];
    return `<div class="dev-snippets">\n      ${blocksFromPairs(pairs)}\n    </div>`;
  };

  // Vanilla JS, no dependency, defensive: every DOM lookup checks its own result before touching
  // it, and every failure path falls back to the curl block that is always on the page. Without
  // this script the page reads exactly as it does today; there is no loading placeholder, only a
  // button that does nothing until it runs. The $CANLI_KEY placeholder and the pre.dev-code
  // selector are shared with every snippet on the page (curl, Python and JavaScript alike), so one
  // key issuance updates all of them. String.replace is called with a REPLACER FUNCTION, never a
  // replacement string, because a $ inside the substituted text (a key or a JSON body) would
  // otherwise be read as a $-substitution pattern by String.replace itself.
  const QUICKSTART_SCRIPT = `(function () {
  "use strict";
  function replaceKeyInSnippets(key) {
    var blocks = document.querySelectorAll("pre.dev-code");
    for (var i = 0; i < blocks.length; i++) {
      var target = blocks[i].querySelector("code") || blocks[i];
      target.textContent = target.textContent.replace(/\\$CANLI_KEY/g, function () { return key; });
    }
  }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function showKeyResult(data) {
    var box = document.getElementById("dev-key-result");
    if (!box || !data || !data.key) return;
    box.innerHTML = "";
    var value = el("p", "dev-key-value");
    value.appendChild(el("code", "", data.key));
    var copyButton = el("button", "dev-button", "Copy");
    copyButton.type = "button";
    copyButton.addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(data.key);
    });
    box.appendChild(value);
    box.appendChild(copyButton);
    box.appendChild(el("p", "dev-key-note", data.note || "Store this key now. It cannot be shown again."));
    box.appendChild(el("p", "dev-key-remaining", "Keys remaining today: " + data.keys_remaining_today));
    box.hidden = false;
    replaceKeyInSnippets(data.key);
  }
  function showKeyError(message) {
    var box = document.getElementById("dev-key-error");
    if (!box) return;
    box.textContent = message || "The key service is unavailable. Use the curl command below.";
    box.hidden = false;
  }
  function wire() {
    var button = document.getElementById("dev-get-key-button");
    if (!button) return;
    button.addEventListener("click", function () {
      button.disabled = true;
      var errorBox = document.getElementById("dev-key-error");
      if (errorBox) errorBox.hidden = true;
      fetch("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: ${JSON.stringify(SNIPPET_LABELS.developersPage)} }),
      }).then(function (response) {
        return response.json().then(function (payload) {
          return { status: response.status, payload: payload };
        });
      }).then(function (result) {
        button.disabled = false;
        if (result.status === 201) {
          showKeyResult(result.payload && result.payload.data);
        } else {
          var message = result.payload && result.payload.error && result.payload.error.message;
          showKeyError(message);
        }
      }).catch(function () {
        button.disabled = false;
        showKeyError("Could not reach the key service. Use the curl command below.");
      });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();`;
  // The browser calculators that compute the same arithmetic as one of these routes. Only
  // routes with an actual matching tool are listed: the Selection Risk and Execution Reality
  // labs run synthetic demonstrations with no general-purpose API equivalent, so they are not
  // named here rather than pointed at a route that would not agree with them.
  const TOOL_PAGE_FOR = {
    "/api/v1/validate/deflated-sharpe": "/tools/deflated-sharpe",
    "/api/v1/validate/overfitting": "/tools/backtest-overfitting",
    "/api/v1/validate/breadth": "/tools/breadth",
  };
  const endpointSlug = (path) => path.split("/").pop();

  const description =
    "A read API over the Canli Capital paper record, and a free keyed API that runs your numbers " +
    "through the same validation arithmetic. Each response states its limits.";

  const html = `${head({
    title: "Developers",
    description,
    route: "/developers",
    sources: "validation_api_limits.json validation_api_manifest.json",
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
${renderProductShellHeader({ active: "developers" })}
<main id="content" tabindex="-1">
  <section class="dev-hero">
    <p class="dev-kicker"><span>Public API</span><span aria-hidden="true"> &middot; </span><span>v1</span></p>
    <h1>Every response says what it cannot be used to claim.</h1>
    <p class="dev-lead">The read endpoints need no key: static JSON, regenerated on each publish.
      The validation endpoints take a free key and run your numbers through the same arithmetic this
      record is held to, then hand back a receipt you can cite. An API is the easiest place on a
      site to lose a claim boundary, because nobody reads one by eye, so the boundary is part of
      the envelope rather than part of the documentation. The same <a href="/open">honesty pledge</a>
      that governs the published record governs every response here.</p>
    <div class="dev-downloads">
      <a class="dev-button dev-button--primary" href="/api/v1">Discovery document</a>
      <a class="dev-button" href="/api/v1/openapi">OpenAPI document</a>
      <a class="dev-button" href="/standards/paper-evidence">The record standard</a>
      <a class="dev-button" href="/tools">Run the same arithmetic in a browser calculator</a>
    </div>
  </section>

  <section class="dev-section dev-quickstart" id="quickstart">
    <h2>Quickstart</h2>
    <p class="dev-note">Three steps, in the order you need them. Every block below is copy-ready,
      and the key you get in step one drops straight into the rest.</p>
    <ol class="dev-steps">
      <li class="dev-step">
        <h3>1. Get a key</h3>
        <p class="dev-note">No signup, no email.
          <a href="/api/v1/validate/status"><code>GET /api/v1/validate/status</code></a> is the
          one-line check that the service is up before you start.</p>
        <button type="button" class="dev-button dev-button--primary" id="dev-get-key-button">Get a free key</button>
        <div class="dev-key-result" id="dev-key-result" hidden></div>
        <p class="dev-key-error" id="dev-key-error" hidden role="alert"></p>
        <p class="dev-note">Or from a terminal, in the language you have open:</p>
        ${keysSnippetsBlock()}
        <p class="dev-note">The key is returned once. Only its hash is kept, so store it now.</p>
      </li>
      <li class="dev-step">
        <h3>2. Validate your own numbers</h3>
        <p class="dev-note">${esc(firstValidator.summary)}</p>
        ${snippetsBlock(firstValidator)}
        <p class="dev-note">The other three validators are documented <a href="#validation">below</a>.</p>
      </li>
      <li class="dev-step">
        <h3>3. Fetch the receipt</h3>
        <p class="dev-note">Every verdict carries <code>receipt.url</code>. It is immutable and
          cacheable forever, so anyone, not only the caller, can fetch and recompute it.</p>
        <pre class="dev-code"><code>curl https://canlicapital.com/api/v1/receipts/{id}</code></pre>
        <p class="dev-note">Its response carries <code>badge_url</code> and <code>embed_markdown</code>:
          a badge showing only the formula version and the receipt id prefix, never a pass or fail
          mark. Drop the embed straight into a README:</p>
        <pre class="dev-code"><code>[![Canli receipt](https://canlicapital.com/api/v1/receipts/{id}/badge.svg)](https://canlicapital.com/api/v1/receipts/{id})</code></pre>
      </li>
    </ol>
  </section>
  <script>${QUICKSTART_SCRIPT}</script>

  ${mcpAssistantSection()}

  <section class="dev-section">
    <h2>Read endpoints, no key</h2>
    <table class="dev-table">
      <thead><tr><th>Path</th><th>What it returns</th></tr></thead>
      <tbody>
        ${summaries.map((e) => `<tr><td><a href="${esc(e.path)}"><code>GET ${esc(e.path)}</code></a></td><td>${esc(e.summary)}</td></tr>`).join("\n        ")}
      </tbody>
    </table>
  </section>

  <section class="dev-section" id="validation">
    <h2>Validation endpoints, free key</h2>
    <p class="dev-note">Send your own numbers; get back the arithmetic this house runs on itself.
      Nothing you send is stored. Each verdict returns a receipt anyone can recompute.</p>
    <table class="dev-table">
      <thead><tr><th>Route</th><th>What it does</th></tr></thead>
      <tbody>
        ${MANIFEST.map((m) => `<tr><td><code>${esc(m.method)} ${esc(m.path)}</code></td><td>${esc(m.summary)}</td></tr>`).join("\n        ")}
      </tbody>
    </table>
    <h3>First, issue a key</h3>
    ${keysSnippetsBlock()}
    <p class="dev-note">The key is returned once. Only its hash is kept.</p>
    <h3>Then validate</h3>
    ${validators.map((m) => `<article class="dev-endpoint" id="api-${esc(endpointSlug(m.path))}"><h4><code>${esc(m.method)} ${esc(m.path)}</code></h4><p>${esc(m.summary)}</p>${snippetsBlock(m)}${TOOL_PAGE_FOR[m.path] ? `<p class="dev-note"><a href="${esc(TOOL_PAGE_FOR[m.path])}">Try it in the browser, no key required</a></p>` : ""}</article>`).join("\n    ")}
    <h3>Then cite the receipt</h3>
    <p class="dev-note">Every verdict carries <code>receipt.url</code>. <code>GET /api/v1/receipts/{id}</code>
      returns the stored output, the input hash, and the content hash of every core and contract that
      computed it. The id is the first twenty-four hex characters of the content hash over the canonical
      JSON of endpoint, input hash, output and bindings, so a third party can check it without trusting
      this server.</p>
  </section>

  <section class="dev-section" id="quotas">
    <h2>Quotas, public and enforced from one source</h2>
    <table class="dev-table">
      <thead><tr><th>Limit</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td>Validations per key per UTC day</td><td>${LIMITS.validations_per_key_per_day}</td></tr>
        <tr><td>Keys per client per UTC day</td><td>${LIMITS.keys_per_client_per_day}</td></tr>
        <tr><td>Request body, bytes</td><td>${LIMITS.max_body_bytes}</td></tr>
        <tr><td>Observations per series or rows per matrix</td><td>${LIMITS.max_observations}</td></tr>
        <tr><td>Variants per matrix</td><td>${LIMITS.max_variants}</td></tr>
        <tr><td>CSCV combinations evaluated</td><td>${LIMITS.max_cscv_combinations}</td></tr>
      </tbody>
    </table>
    <p class="dev-note">Every response carries <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>
      and <code>X-RateLimit-Reset</code>. A 429 carries <code>Retry-After</code>.</p>
    <h3>What happens to a key after you have it</h3>
    <ul class="dev-list">
      ${KEY_LIFECYCLE_TEXT.map((t) => `<li>${esc(t)}</li>`).join("\n      ")}
    </ul>
  </section>

  <section class="dev-section" id="not-established">
    <h2>What a verdict does not establish</h2>
    <ul class="dev-list">
      ${LIMITS_TEXT.map((t) => `<li>${esc(t)}</li>`).join("\n      ")}
    </ul>
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
      <article><h3><code>sources</code></h3><p>Every artifact the response was built from, with its
        content hash and a URL, so a consumer can recompute rather than trust.</p></article>
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
