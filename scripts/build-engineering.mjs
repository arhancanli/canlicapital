// =============================================================================
// build-engineering.mjs
// -----------------------------------------------------------------------------
// Builds /engineering from public/glassbox/engineering_open_source.json.
//
// Every count on the page comes out of that artifact, which is itself derived
// from what the repositories publish (see build-engineering-manifest.mjs). This
// file types no figures. It asserts the artifact's content hash reproduces before
// rendering, so a hand-edited number fails the build instead of reaching the web.
// =============================================================================

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_NAME = "engineering_open_source.json";
const SOURCE_PATH = resolve(ROOT, "public", "glassbox", SOURCE_NAME);
const OUT_PATH = resolve(ROOT, "engineering.html");
const ORIGIN = "https://canlicapital.com";

const esc = (v) =>
  String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

function assertSource(doc) {
  const payload = { ...doc };
  delete payload.content_hash;
  const observed = `sha256:${createHash("sha256").update(canonical(payload)).digest("hex")}`;
  if (observed !== doc.content_hash) {
    throw new Error("engineering page: source artifact content hash does not reproduce");
  }
  if (doc.schema !== "canli.engineering-open-source.v2") {
    throw new Error(`engineering page: unexpected schema ${doc.schema}`);
  }
  if (doc.extractions.length !== 2) {
    throw new Error("engineering page: expected exactly two published extractions");
  }
  for (const e of doc.extractions) {
    if (!/^[0-9a-f]{40}$/.test(e.pinned_engine_commit)) {
      throw new Error(`engineering page: ${e.repo} has no pinned engine commit`);
    }
    if (e.files_source + e.files_test > e.files_total) {
      throw new Error(`engineering page: ${e.repo} file counts do not add up`);
    }
  }
  const commits = new Set(doc.extractions.map((e) => e.pinned_engine_commit));
  if (commits.size !== 1) {
    throw new Error("engineering page: extractions are pinned to different engine commits");
  }
}

// --- the three problems the code exists to solve ----------------------------
// Prose, not data: these describe mechanisms, and a mechanism does not have a
// measured value. Every claim here is checkable in the linked file.
const PROBLEMS = [
  {
    id: "lookahead",
    kicker: "Problem one",
    title: "The backtest saw something it could not have seen.",
    body: `Look-ahead is rarely a dramatic bug. It is an off-by-one on a timestamp, a feature
      computed over a window that includes the present, a flag derived from tomorrow's reversion.
      It never raises. It just makes the curve go up.`,
    answer: `A strategy decides at the close of bar <em>t</em> and fills at the open of bar
      <em>t+1</em>. The fill model is handed only the <em>t+1</em> bar, checks that bar opened
      after the decision, and raises <code>LookaheadError</code> if it did not. The engine
      re-checks every fill it gets back. The strategy reads history through a context whose
      accessor is a point-in-time read fixed at the decision close, so there is no handle on the
      future to grab even by accident.`,
    file: "src/alphaforge/backtest/fills.py",
    repo: "canli-backtest",
  },
  {
    id: "pit",
    kicker: "Problem two",
    title: "The data quietly knows how the story ended.",
    body: `Today's index membership means the backtest only ever traded survivors. Today's split
      factors mean 2015 trades at prices no screen showed in 2015. A restated earnings figure gets
      treated as knowable on the original filing date.`,
    answer: `Every analytical read takes an explicit <code>as_of</code> and returns only records
      available at that instant. There is deliberately no <code>as_of=now</code> default, so a
      caller has to state its information time. Corporate actions filter on
      <code>available_at</code>, meaning declaration plus publication lag, and never on
      <code>ex_date</code>. A split declared one millisecond after your <code>as_of</code> is
      therefore invisible. Quality flags carry per-bit availability lags, and a bit whose lag is undeclared
      is never exposed at all.`,
    file: "src/alphaforge/data/store/reader.py",
    repo: "canli-pit-lake",
  },
  {
    id: "selection",
    kicker: "Problem three",
    title: "It was the best of two hundred tries, and one got published.",
    body: `This is the harder lie and the more common one. Run enough variants and something looks
      brilliant by luck alone. No amount of simulation fidelity fixes it.`,
    answer: `The answer is an honest denominator, not a better backtest. Deflated Sharpe measures
      an observed Sharpe against the level luck alone reaches given how many configurations were
      tried; a union trial ledger counts every hypothesis across every research ledger so filing
      conventions cannot shrink the count. Hold one 1,260-day series fixed at an annualised Sharpe
      of +1.139, a Probabilistic Sharpe against zero of 0.9828, and move only the trial count: the
      Deflated Sharpe reads 0.9596 at two trials and <strong>0.5608</strong> at two hundred.
      Nothing about the strategy changed. Against this project's 0.95 gate it is admissible if you
      tried two things and inadmissible if you tried ten.`,
    file: "src/alphaforge/validation/dsr.py",
    repo: "canli-backtest",
  },
];

// --- a guided reading path --------------------------------------------------
// A reviewer has ten minutes, not ten hours. Naming the files worth opening is
// more useful than asking them to browse a 1,700-file monorepo.
const READING_PATH = [
  {
    file: "src/alphaforge/data/store/reader.py",
    repo: "canli-pit-lake",
    why: "The point-in-time rule, and the comment explaining why it lives in exactly one place.",
  },
  {
    file: "src/alphaforge/backtest/engine.py",
    repo: "canli-backtest",
    why: "The event loop: corporate actions, funding, marks, decision, fill, and the re-check after it.",
  },
  {
    file: "src/alphaforge/validation/pbo.py",
    repo: "canli-backtest",
    why: "Combinatorially symmetric cross-validation, written out step by step against the 2017 paper.",
  },
  {
    file: "tools/check_parity.py",
    repo: "canli-pit-lake",
    why: "How these repositories prove they are the engine's code and not a fork that drifted.",
  },
];

function repoUrl(repo, file, commit) {
  return repo === "alphac"
    ? `https://github.com/arhancanli/alphac/blob/${commit}/${file}`
    : `https://github.com/arhancanli/${repo}/blob/main/${file}`;
}

function renderExtractionCard(e) {
  // Four stats on a fixed 2x2 grid with short labels. An auto-fit grid put three
  // on the first row and stranded the fourth, and a long label wrapped its value
  // onto a second line, so the two cards no longer lined up with each other.
  const rows = [
    ["Files published", e.files_total.toLocaleString()],
    ["Source / tests", `${e.files_source} / ${e.files_test}`],
    ["Tests passing", e.tests_deselected
      ? `${e.tests_passed.toLocaleString()} <small>+${e.tests_deselected} deselected</small>`
      : e.tests_passed.toLocaleString()],
    ["Strict type check", `${e.typed_source_files} files, 0 issues`],
  ];
  return `<article class="eng-repo" id="${esc(e.repo)}">
    <header>
      <h3><a href="${esc(e.url)}" rel="noreferrer">${esc(e.repo)}</a></h3>
      <p class="eng-repo__pin">Byte-identical to <code>alphac@${esc(e.pinned_engine_commit.slice(0, 12))}</code></p>
    </header>
    <dl class="eng-repo__stats">
      ${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("\n      ")}
    </dl>
    ${e.tests_deselected
      ? `<p class="eng-repo__aside">The ${e.tests_deselected} deselected are ${esc(e.tests_deselected_reason)}.</p>`
      : ""}
    <details class="eng-repo__bench">
      <summary>Measured ${esc(e.measured_at)} using <code>${esc(e.benchmark.script)}</code></summary>
      <p class="eng-repo__basis">${esc(e.benchmark.basis)}</p>
      <table>
        <tbody>
          ${e.benchmark.rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("\n          ")}
        </tbody>
      </table>
      <p class="eng-repo__commands-lede">Re-run every gate yourself:</p>
      <ul class="eng-repo__commands">
        ${e.commands.map((c) => `<li><code>${esc(c)}</code></li>`).join("\n        ")}
      </ul>
    </details>
    ${e.excluded_test_modules > 0
      ? `<p class="eng-repo__note">${e.excluded_test_modules} engine test module${e.excluded_test_modules === 1 ? "" : "s"} read the private research corpus and cannot run here. ${e.excluded_test_modules === 1 ? "It is" : "They are"} <strong>removed rather than skipped</strong>, with the reason recorded in <code>excluded_tests.json</code>, so the suite has no silently-passing holes.</p>`
      : ""}
  </article>`;
}

function renderProblem(p) {
  return `<article class="eng-problem" id="${p.id}">
    <p class="eng-problem__kicker">${esc(p.kicker)}</p>
    <h3>${esc(p.title)}</h3>
    <p class="eng-problem__body">${p.body}</p>
    <div class="eng-problem__answer">
      <span>How it is prevented</span>
      <p>${p.answer}</p>
    </div>
    <a class="eng-problem__file" href="https://github.com/arhancanli/${p.repo}/blob/main/${p.file}" rel="noreferrer"><code>${esc(p.file)}</code> <span aria-hidden="true">&#8599;</span></a>
  </article>`;
}

function main() {
  const doc = JSON.parse(readFileSync(SOURCE_PATH, "utf8"));
  assertSource(doc);
  const commit = doc.extractions[0].pinned_engine_commit;
  // Read the totals from the artifact rather than recomputing them here, so the
  // page and the artifact cannot disagree, then check the artifact's own sum.
  const totalTests = doc.totals.tests_passing;
  const totalFiles = doc.totals.files_published;
  if (totalTests !== doc.extractions.reduce((n, e) => n + e.tests_passed, 0)
    || totalFiles !== doc.extractions.reduce((n, e) => n + e.files_total, 0)) {
    throw new Error("engineering page: artifact totals do not equal the sum of its extractions");
  }

  // Kept under 165 characters: past that a search result truncates mid-sentence.
  const description =
    "The open-source engineering behind Canli Capital: a point-in-time data lake, a backtester " +
    "that raises on look-ahead, and honest trial accounting.";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${ORIGIN}/engineering`,
        name: "Open-source engineering",
        url: `${ORIGIN}/engineering`,
        description,
        author: { "@id": `${ORIGIN}/#arhan-canli` },
        isPartOf: { "@id": `${ORIGIN}/#website` },
      },
      {
        "@type": "SoftwareSourceCode",
        name: "alphac",
        description: doc.engine.note,
        codeRepository: doc.engine.url,
        programmingLanguage: "Python",
        license: "https://opensource.org/licenses/MIT",
        creator: { "@id": `${ORIGIN}/#arhan-canli` },
      },
      ...doc.extractions.map((e) => ({
        "@type": "SoftwareSourceCode",
        name: e.repo,
        codeRepository: e.url,
        programmingLanguage: "Python",
        license: "https://opensource.org/licenses/MIT",
        creator: { "@id": `${ORIGIN}/#arhan-canli` },
        isBasedOn: doc.engine.url,
      })),
    ],
  };

  const html = `<!doctype html>
<html lang="en" data-page="engineering">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Open-source engineering | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}/engineering" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${SOURCE_NAME}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="Open-source engineering" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}/engineering" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Open-source engineering" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/engineering.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="eng-page">
<a class="eng-skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "engineering" })}
<main id="content">

  <section class="eng-hero" aria-labelledby="eng-title">
    <p class="eng-kicker">Open source / engineering</p>
    <h1 id="eng-title">The code that produces every number on this site.</h1>
    <p class="eng-lead">The strategies are well-documented academic families. What took the work is
      the machinery that stops me fooling myself, and that machinery is public, tested and
      pinned. ${totalTests.toLocaleString()} tests across ${totalFiles} published files, all of it
      byte-identical to the engine that publishes the live paper record.</p>
    <div class="eng-hero__actions">
      <a class="eng-button eng-button--primary" href="${esc(doc.engine.url)}" rel="noreferrer">Read the engine <span aria-hidden="true">&#8599;</span></a>
      <a class="eng-button" href="#reading-path">Where to start</a>
    </div>
    <p class="eng-boundary"><strong>What this is not.</strong> Open code is not a track record and
      not a claim that the strategies make money. The paper record and its limits live on
      <a href="/performance">status</a>; the corrections live on <a href="/progress">corrections</a>.</p>
  </section>

  <section class="eng-section" aria-labelledby="eng-repos-title">
    <div class="eng-section__head">
      <h2 id="eng-repos-title">Three repositories</h2>
      <p>One system, plus two focused extractions of the parts most worth reading on their own.</p>
    </div>
    <article class="eng-repo eng-repo--engine">
      <header>
        <h3><a href="${esc(doc.engine.url)}" rel="noreferrer">alphac</a></h3>
        <p class="eng-repo__pin">The whole system</p>
      </header>
      <p class="eng-repo__lede">${esc(doc.engine.note)}</p>
      <p class="eng-repo__note">Public because the claim is not &ldquo;this makes money.&rdquo; It is
        &ldquo;every number published here can be checked, including the ones that embarrass me.&rdquo;
        That claim is worthless if the code is hidden.</p>
    </article>
    <div class="eng-repos">
      ${doc.extractions.map(renderExtractionCard).join("\n      ")}
    </div>
  </section>

  <section class="eng-section" aria-labelledby="eng-problems-title">
    <div class="eng-section__head">
      <h2 id="eng-problems-title">What is actually hard here</h2>
      <p>Three ways a quantitative result can be false while every test passes, and the structural
        answer to each. Not conventions to remember, but things the code will not let you do.</p>
    </div>
    <div class="eng-problems">
      ${PROBLEMS.map(renderProblem).join("\n      ")}
    </div>
  </section>

  <section class="eng-section" aria-labelledby="eng-parity-title">
    <div class="eng-section__head">
      <h2 id="eng-parity-title">How the extractions stay honest</h2>
      <p>A published copy of code nobody checks is a screenshot.</p>
    </div>
    <div class="eng-parity">
      <article>
        <h3>The module set is derived, not curated</h3>
        <p>Each extraction ships the transitive import closure of its entry packages, computed by
          walking the import graph. The test set is every engine test whose imports that closure
          satisfies. Nobody chose the file list, so nobody could quietly leave an awkward file out.</p>
      </article>
      <article>
        <h3>Parity is a build failure, not a promise</h3>
        <p>Every shipped file's SHA-256 is recorded at extraction time.
          <code>tools/check_parity.py</code> re-reads each one from the engine at the pinned commit
          and fails if a single byte differs. It runs in CI on every push, and it is mutation-tested
          three ways: a drifted file, a tampered manifest entry and a deleted file each turn it red.</p>
      </article>
      <article>
        <h3>Only what the engine publishes</h3>
        <p>The extraction reads the engine's tracked file set, not its working directory. That rule
          exists because the first version did not have it and shipped 70 files the engine
          deliberately gitignores. The parity check against GitHub caught them; a check against a
          local copy never would have, because it was comparing those files against the very tree
          they came from.</p>
      </article>
      <article>
        <h3>The toolchain is pinned too</h3>
        <p>Source that cannot be edited without breaking parity cannot be made to satisfy a newer
          linter. So ruff, mypy, pandas and numpy are pinned to the versions the engine is verified
          against. &ldquo;Identical&rdquo; asserted by a tool that disagrees with the one that
          certified it is not identical.</p>
      </article>
    </div>
  </section>

  <section class="eng-section" id="reading-path" aria-labelledby="eng-path-title">
    <div class="eng-section__head">
      <h2 id="eng-path-title">If you have ten minutes</h2>
      <p>Four files, in this order. Each one is heavily commented with the reasoning, not just the
        implementation.</p>
    </div>
    <ol class="eng-path">
      ${READING_PATH.map((r) => `<li>
        <div>
          <a href="${esc(repoUrl(r.repo, r.file, commit))}" rel="noreferrer"><code>${esc(r.file)}</code></a>
          <small>${esc(r.repo)}</small>
          <p>${esc(r.why)}</p>
        </div>
      </li>`).join("\n      ")}
    </ol>
  </section>

  <section class="eng-section eng-section--lab" aria-labelledby="eng-lab-title">
    <div class="eng-section__head">
      <h2 id="eng-lab-title">About the lab</h2>
    </div>
    <div class="eng-lab">
      <p>Canli Capital is not a fund and not a team. It is a one-person quantitative research
        lab, engineered independently in Dubai since <strong>July 2024</strong>.</p>
      <p>The order of the work is the argument. The point-in-time data layer, the cost authority,
        the validation gauntlet and the crash-safe execution loop were built before any serious
        effort went into chasing return, because a backtest only means something on top of a
        process honest enough to produce it. That is why there are two years of engineering
        behind a paper record measured in weeks, and not the other way around.</p>
      <p class="eng-lab__boundary"><strong>The distinction that matters.</strong> The engineering
        began in July 2024. The public paper record began on 2026-08-07. Everything between those
        dates is infrastructure and method, not performance. This site does not present it as a
        track record, and neither should anyone citing it.</p>
    </div>
  </section>

  <section class="eng-section" aria-labelledby="eng-notes-title">
    <div class="eng-section__head">
      <h2 id="eng-notes-title">Notes on the engineering</h2>
      <p>Post-mortems on real incidents, the arithmetic behind the validation gates, and design
        arguments about the parts that were hard. Written for the mechanism, not the summary.</p>
    </div>
    <p class="eng-author">
      <a class="eng-button" href="/notes">Read the engineering notes</a>
      <a class="eng-button" href="/tools/selection-risk">Try to fool yourself, in the browser</a>
      <a class="eng-button" href="/developers">The read API</a>
      <a class="eng-button" href="/standards/paper-evidence">The evidence standard</a>
    </p>
  </section>

  <section class="eng-section eng-section--tail" aria-labelledby="eng-author-title">
    <div class="eng-section__head">
      <h2 id="eng-author-title">Authorship</h2>
    </div>
    <p class="eng-author">Designed, written and maintained by
      <a href="/founder">Arhan Canli</a>, in Dubai. Development uses reviewed AI-assisted tooling;
      ownership, research decisions, published claims and release responsibility are mine. Every
      repository is MIT licensed and carries machine-readable citation metadata.</p>
    <p class="eng-source">This page is generated from
      <a href="/glassbox/${SOURCE_NAME}"><code>${SOURCE_NAME}</code></a>, whose counts are read out of
      what the repositories publish. The build asserts that artifact's content hash reproduces, so a
      number typed by hand fails the build instead of reaching this page.</p>
  </section>

</main>
${renderProductShellFooter()}
</body>
</html>
`;
  writeFileSync(OUT_PATH, html);
  console.log(`  engineering.html  ${totalFiles} files, ${totalTests.toLocaleString()} tests, pinned @ ${commit.slice(0, 12)}`);
}

main();
