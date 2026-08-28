// Build /tools/trial-accounting from the public union ledger and identity packets.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTrialUnion } from "../js/trial-accounting-core.js";
import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GLASSBOX = resolve(ROOT, "public", "glassbox");
const ORIGIN = "https://canlicapital.com";
const SOURCES = Object.freeze({
  ledger: "trial_ledger.json",
  manifest: "trial_packet_manifest.json",
  index: "trial-packets/index.json",
  prospective: "prospective_trial_record.json",
});
const sourcePath = (name) => resolve(GLASSBOX, SOURCES[name]);
const readJson = (name) => JSON.parse(readFileSync(sourcePath(name), "utf8"));
const bytesHash = (name) =>
  `sha256:${createHash("sha256").update(readFileSync(sourcePath(name))).digest("hex")}`;
const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function main() {
  const documents = Object.fromEntries(Object.keys(SOURCES).map((name) => [name, readJson(name)]));
  const union = buildTrialUnion(
    documents.ledger,
    documents.manifest,
    documents.index,
    documents.prospective,
  );
  const { facts } = union;
  const sourceHashes = Object.fromEntries(Object.keys(SOURCES).map((name) => [name, bytesHash(name)]));
  const config = {
    schema: "canli.trial-accounting-explorer-config.v1",
    source_urls: Object.fromEntries(
      Object.entries(SOURCES).map(([name, path]) => [name, `/glassbox/${path}`]),
    ),
    source_hashes: sourceHashes,
    facts,
  };
  const description =
    "Explore every ALPHAC hypothesis identity behind selection N, including duplicate-window removal, family concentration, packet debt and the sealed prospective trial.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "ALPHAC trial-accounting explorer",
    url: `${ORIGIN}/tools/trial-accounting`,
    description,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any modern web browser",
    author: { "@id": `${ORIGIN}/#arhan-canli` },
    creator: { "@id": `${ORIGIN}/#arhan-canli` },
    isAccessibleForFree: true,
  };
  const familyRows = union.families
    .map(
      (family, index) => `<li style="--family-share:${family.identities / facts.selection_n}">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <strong>${escapeHtml(family.title)}</strong>
        <i aria-hidden="true"></i>
        <b>${family.identities}</b>
      </li>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Trial-accounting explorer | Canli Capital</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${ORIGIN}/tools/trial-accounting" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${Object.values(SOURCES).join(" ")}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="ALPHAC trial-accounting explorer" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${ORIGIN}/tools/trial-accounting" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="ALPHAC trial-accounting explorer" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=optional" />
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=optional" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=optional" /></noscript>
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/trial-accounting-tool.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="union-page">
<a class="union-skip" href="#union-explorer">Skip to the trial union</a>
${renderProductShellHeader({ active: "trials" })}
<main>
  <section class="union-hero" aria-labelledby="union-title">
    <div class="union-hero__copy">
      <p class="union-kicker"><span>Complete selection denominator</span><span>Union accounting v2</span></p>
      <h1 id="union-title">The denominator is public.</h1>
      <p>Every measured identity makes the next result less surprising. This is the complete search behind ALPHAC: first measurements, duplicate-window removal, family concentration, incomplete evidence and the one sealed prospective identity.</p>
      <div class="union-actions"><a href="#union-explorer">Interrogate the union</a><a href="/tools/deflated-sharpe">Calculate the selection penalty</a></div>
    </div>
    <div class="union-counter" aria-label="Current selection denominator">
      <span>Selection N</span><strong>${facts.selection_n}</strong><p>Immutable until a new identity is reserved. Filters below never change this number.</p>
    </div>
  </section>

  <section class="union-equation" aria-label="Trial-accounting equation">
    <div><span>Immutable execution records</span><strong>${facts.immutable_execution_records}</strong></div>
    <i>−</i><div><span>Window-only remeasurements</span><strong>${facts.window_only_remeasurements}</strong></div>
    <i>−</i><div><span>Cross-profile duplicates</span><strong>${facts.cross_profile_duplicate_identities}</strong></div>
    <i>=</i><div class="union-equation__result"><span>Distinct union identities</span><strong>${facts.selection_n}</strong></div>
  </section>

  <section class="union-boundary" aria-label="Claim boundary"><strong>Accounting, not performance</strong><p>${escapeHtml(union.claim_boundary)} A complete packet is not a passed strategy, and neither complete packet status nor a positive Sharpe point estimate implies admission.</p></section>

  <section class="union-workbench" id="union-explorer" aria-labelledby="explorer-title">
    <header class="union-section-head"><div><p class="union-label">Search ledger</p><h2 id="explorer-title">${facts.selection_n} identities. One immutable denominator.</h2></div><div class="union-tools"><button id="union-copy" type="button">Copy filtered link</button><button id="union-export" type="button">Export filtered JSON</button></div></header>
    <div class="union-filterbar">
      <label><span>Search identity</span><input id="union-query" type="search" placeholder="Key, config, label or family" /></label>
      <label><span>Research family</span><select id="union-family"><option value="all">All families</option></select></label>
      <label><span>Evidence state</span><select id="union-status"><option value="all">All states</option><option value="legacy_complete_packet">Complete legacy packet</option><option value="legacy_incomplete_packet">Incomplete legacy packet</option><option value="prospective_final_incomplete_not_admitted">Prospective, not admitted</option></select></label>
      <label><span>Sleeve context</span><select id="union-sleeve"><option value="all">All sleeves</option></select></label>
      <button id="union-reset" type="button">Reset</button>
    </div>
    <div class="union-ledger">
      <section class="union-map" aria-label="Identity map and filtered trial list">
        <header><div><span>Visible identities</span><strong id="union-visible">${facts.selection_n}</strong></div><p>Selection N remains <b>${facts.selection_n}</b></p></header>
        <div class="union-matrix" id="union-matrix" role="list" aria-label="Complete identity union"></div>
        <div class="union-list" id="union-list"></div>
      </section>
      <aside class="union-inspector" id="union-inspector" aria-live="polite">
        <p>Select an identity from the matrix or ledger.</p>
      </aside>
    </div>
  </section>

  <section class="union-families" aria-labelledby="families-title">
    <header class="union-section-head"><div><p class="union-label">Search concentration</p><h2 id="families-title">A family count is part of the result.</h2></div></header>
    <div class="union-families__grid"><ol>${familyRows}</ol><div class="union-debt"><span>Legacy packet coverage</span><strong>${facts.legacy_complete_packets}<small> complete</small></strong><strong>${facts.legacy_incomplete_packets}<small> incomplete</small></strong><p>The one prospective packet has complete evidence accounting but a final incomplete, not-admitted disposition. It is shown separately rather than added to the legacy completion rate.</p></div></div>
  </section>

  <section class="union-rules" aria-labelledby="rules-title">
    <header class="union-section-head"><div><p class="union-label">What the number means</p><h2 id="rules-title">Three rules stop the denominator from shrinking.</h2></div></header>
    <div><article><span>01</span><h3>Count the first immutable identity</h3><p>Selection N uses one first record per economic or parameter identity. Better or worse remeasurement windows stay public without becoming extra identities.</p></article><article><span>02</span><h3>Keep the evidence debt</h3><p>An incomplete historical packet remains in N. Missing preregistration, environment or decision evidence cannot be repaired by deleting the attempt.</p></article><article><span>03</span><h3>Separate accounting from admission</h3><p>Packet completeness describes evidence coverage. Admission requires the full current contract. The prospective identity remains not admitted.</p></article></div>
  </section>

  <section class="union-sources" aria-labelledby="sources-title">
    <header class="union-section-head"><div><p class="union-label">Exact sources</p><h2 id="sources-title">Take the denominator with you.</h2></div></header>
    <div>${Object.entries(SOURCES).map(([name, path]) => `<a href="/glassbox/${path}"><span>${escapeHtml(name)}</span><strong>${escapeHtml(path)}</strong><code>${escapeHtml(sourceHashes[name])}</code></a>`).join("")}</div>
    <p>Visible measurements are historical simulation fields carried by the packet manifest. They are not live returns, rankings, admission scores or recommendations.</p>
  </section>
</main>
${renderProductShellFooter()}
<script id="trial-accounting-config" type="application/json">${JSON.stringify(config).replaceAll("<", "\\u003c")}</script>
<script type="module" src="/js/trial-accounting-tool.js"></script>
</body></html>`;

  const outputDir = resolve(ROOT, "tools");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "trial-accounting.html"), html);
  console.log(
    `rendered /tools/trial-accounting: N=${facts.selection_n}, ` +
      `${facts.legacy_complete_packets} complete legacy packets, ${union.families.length} families`,
  );
}

main();
