// =============================================================================
// build-breadth.mjs  ->  /tools/breadth
//
// Publishes the breadth lab and the contract it renders from. The presets are
// read from the site's own published claims, so the tool opens on this project's
// actual position rather than on a flattering hypothetical.
// =============================================================================

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const SOURCE_NAME = "breadth_lab_contract.json";
const OUT = resolve(ROOT, "tools", "breadth.html");

const esc = (v) =>
  String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
};

const claims = JSON.parse(readFileSync(resolve(ROOT, "public/contracts/public-claims.json"), "utf8"));
const claim = (id) => {
  const c = claims.claims.find((x) => x.id === id);
  if (!c) throw new Error(`breadth: no published claim ${id}`);
  return c.value;
};

function buildContract() {
  const payload = {
    schema: "canli.alphac-breadth-lab-contract.v1",
    status: "EDUCATIONAL_INSTRUMENT_NOT_A_FORECAST",
    author: "Arhan Canli",
    published_on: "2026-08-27",
    claim_boundary:
      "Closed-form arithmetic under strong assumptions. It shows the SHAPE of the constraint " +
      "breadth operates under. It is not a forecast of any book, and no output here is a " +
      "performance claim.",
    formula: {
      book_sharpe: "s * sqrt( N / (1 + (N-1) * rho) )",
      ceiling: "s / sqrt(rho), for rho > 0",
      ceiling_note:
        "The ceiling does not contain N. Past a point, breadth is not the lever and correlation is.",
      degenerate:
        "1 + (N-1)*rho must be strictly positive. At zero the equally weighted book has zero " +
        "variance and an infinite Sharpe, which is refused rather than displayed.",
    },
    assumptions: [
      "every sleeve carries the same Sharpe ratio",
      "every sleeve is weighted equally",
      "every pair of sleeves shares one correlation",
      "correlations are stable, which is the assumption that fails first in a crisis",
    ],
    presets: {
      published_book: {
        label: "This book, as published",
        s: 0.5,
        rho: Number(claim("diversification.average-pairwise-correlation").toFixed(4)),
        n: Number(claim("sleeves.current")),
        target: Number(claim("objective.forward-sharpe")),
        note: "Research-curve average pairwise correlation, current sleeve count, declared objective.",
      },
      planned_book: {
        label: "The planned book",
        s: 0.5,
        rho: Number(claim("diversification.average-pairwise-correlation").toFixed(4)),
        n: Number(claim("sleeves.target")),
        target: Number(claim("objective.forward-sharpe")),
        note: "The same correlation at the planned sleeve count.",
      },
      correlation_ceiling: {
        label: "At the live correlation ceiling",
        s: 0.5,
        rho: 0.15,
        n: Number(claim("sleeves.target")),
        target: Number(claim("objective.forward-sharpe")),
        note: "The live contract permits average pairwise correlation up to 0.15. This is what that permits the book to become.",
      },
    },
    sleeve_sharpe_note:
      "0.5 is used as the per-sleeve Sharpe in every preset. It is an illustrative round number, " +
      "not a measured sleeve figure: no sleeve here has an established forward Sharpe.",
    sandbox_safety: [
      "every input is stored in the URL, so a scenario is shareable and reproducible",
      "no write path to any ledger, artifact, broker or published record exists",
      "outputs are arithmetic under stated assumptions, never a forecast",
    ],
  };
  payload.content_hash = `sha256:${createHash("sha256").update(canonical(payload)).digest("hex")}`;
  const target = resolve(ROOT, "public/glassbox", SOURCE_NAME);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

const c = buildContract();
const p = c.presets;

const field = (id, label, value, min, max, step, note) => `<label class="lab-field" for="${id}">
    <span class="lab-field__label">${esc(label)}</span>
    <input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" inputmode="decimal" />
    <span class="lab-field__note">${esc(note)}</span>
  </label>`;

const preset = (key) => {
  const x = p[key];
  return `<button type="button" class="lab-button" data-preset='${JSON.stringify({ s: x.s, rho: x.rho, n: x.n, target: x.target })}'>${esc(x.label)}</button>`;
};

const description =
  "How much a book of N sleeves is worth, and the ceiling that no amount of breadth can pass.";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Breadth Lab",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any modern browser",
  url: `${ORIGIN}/tools/breadth`,
  description,
  author: { "@id": `${ORIGIN}/#arhan-canli` },
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const html = `<!doctype html>
<html lang="en" data-page="breadth">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Breadth Lab | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}/tools/breadth" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${SOURCE_NAME} public-claims.json" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="Breadth Lab" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}/tools/breadth" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Breadth Lab" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/lab.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="lab-page">
<a class="lab-skip" href="#lab">Skip to the lab</a>
${renderProductShellHeader({ active: "" })}
<main>
  <section class="lab-hero" aria-labelledby="lab-title">
    <p class="lab-kicker"><span>Open research instrument</span><span>Arithmetic, not a forecast</span></p>
    <h1 id="lab-title">More sleeves stops working, and you can see where.</h1>
    <p class="lab-lead">A book of equally weighted sleeves, each worth <strong>s</strong>, sharing a
      pairwise correlation <strong>rho</strong>, is worth
      <code>s &times; sqrt(N / (1 + (N-1) &times; rho))</code>. Take that to the limit and the
      ceiling is <code>s / sqrt(rho)</code>, which does not contain N at all. Past a point, breadth
      is not the lever and correlation is. This is the most important arithmetic in this project
      and it decides whether its own objective is reachable.</p>
    <p class="lab-boundary"><strong>What this is.</strong> ${esc(c.claim_boundary)}</p>
  </section>

  <section class="lab-lab" id="lab">
    <div class="lab-controls">
      ${field("lab-sharpe", "Sharpe per sleeve", p.published_book.s, 0, 3, 0.05, "s, the same for every sleeve")}
      ${field("lab-rho", "Average pairwise correlation", p.published_book.rho, -0.5, 1, 0.005, "rho, shared by every pair")}
      ${field("lab-n", "Sleeves", p.published_book.n, 1, 60, 1, "N, equally weighted")}
      ${field("lab-target", "Target book Sharpe", p.published_book.target, 0, 5, 0.1, "the objective to test against")}
      <div class="lab-actions">
        ${preset("published_book")}
        ${preset("planned_book")}
        ${preset("correlation_ceiling")}
      </div>
      <p class="lab-warning" id="lab-warning" role="alert" hidden></p>
    </div>

    <div class="lab-output">
      <div class="lab-chart-wrap">
        <svg id="lab-chart" viewBox="0 0 760 260" preserveAspectRatio="none" role="img" aria-label="Book Sharpe against sleeve count, with the ceiling">
          <path id="lab-ceiling" class="lab-chart__ceiling" d="" />
          <path id="lab-target-line" class="lab-chart__base" d="" />
          <path id="lab-curve" class="lab-chart__line" d="" />
          <circle id="lab-marker" class="lab-chart__marker" cx="0" cy="0" r="4" />
        </svg>
        <p class="lab-causal" id="lab-causal">solid: book Sharpe against N &middot; long dash: the ceiling &middot; short dash: your target</p>
      </div>
      <dl class="lab-stats">
        <div><dt>Book Sharpe</dt><dd id="lab-book">0</dd></div>
        <div><dt>Ceiling at this correlation</dt><dd id="lab-ceiling-value">0</dd></div>
        <div><dt>Share of the ceiling captured</dt><dd id="lab-captured">0</dd></div>
        <div><dt>Sleeves needed for the target</dt><dd id="lab-required">0</dd></div>
      </dl>
    </div>

    <div class="lab-ledger">
      <h3>What this says</h3>
      <p class="lab-verdict" id="lab-verdict" data-state="idle">Move a control.</p>
      <p class="lab-bestparams">${esc(p.correlation_ceiling.note)}</p>
    </div>
  </section>

  <section class="lab-notes" aria-labelledby="lab-notes-title">
    <h2 id="lab-notes-title">The assumptions, which are strong</h2>
    <div class="lab-notes__grid">
      <article>
        <h3>What it assumes</h3>
        <ul>${c.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
        <p>Real books have none of these. The lab is for the shape of the constraint, not for
          forecasting a book.</p>
      </article>
      <article>
        <h3>Where the numbers come from</h3>
        <p>The presets read this project's own published claims: the research-curve average
          pairwise correlation, the current and planned sleeve counts, and the declared forward
          Sharpe objective. ${esc(c.sleeve_sharpe_note)}</p>
      </article>
      <article>
        <h3>The case it refuses</h3>
        <p>${esc(c.formula.degenerate)} A tool that displays an infinite Sharpe for an impossible
          correlation is doing the opposite of its job.</p>
      </article>
      <article>
        <h3>Why it matters here</h3>
        <p>This project's live contract permits an average pairwise correlation up to 0.15. Load
          that preset and read the ceiling: it is the honest answer to whether the declared
          objective is reachable by adding sleeves, and it is not the answer anyone wants.</p>
      </article>
    </div>
    <p class="lab-safety"><strong>Sandbox contract.</strong> ${c.sandbox_safety.map(esc).join(". ")}.</p>
    <p class="lab-source">Rendered from
      <a href="/glassbox/${SOURCE_NAME}"><code>${SOURCE_NAME}</code></a>. Related:
      <a href="/tools/selection-risk">the Selection Risk Lab</a> and
      <a href="/notes/deflating-a-sharpe-ratio">the arithmetic of not fooling yourself</a>.</p>
  </section>
</main>
${renderProductShellFooter()}
<script type="module" src="/js/breadth-lab.js"></script>
</body>
</html>
`;
writeFileSync(OUT, html);
console.log(`  /tools/breadth built; contract ${c.content_hash.slice(0, 23)}`);
