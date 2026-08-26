// Render every AlphaForge hypothesis identity as a stable, evidence-bound HTML page.
// A page is not declared complete unless its packet is complete; historical evidence debt is
// rendered as debt, never upgraded by publication.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKET_DIR = resolve(ROOT, "public/glassbox/trial-packets");
const INDEX_PATH = resolve(PACKET_DIR, "index.json");
const OUT_DIR = resolve(ROOT, "trials");
const ORIGIN = "https://canlicapital.com";
const AUTHOR = "Arhan Canli";
const PUBLISHER = "Canli Capital";

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

function validateHash(payload, path) {
  const declared = payload.content_hash;
  const body = { ...payload };
  delete body.content_hash;
  const observed = `sha256:${createHash("sha256").update(canonical(body)).digest("hex")}`;
  if (declared !== observed) throw new Error(`${path}: content hash mismatch`);
}

const humanise = (value) => String(value)
  .replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatNumber = (value) => {
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return Number(value).toPrecision(7).replace(/\.?0+$/, "");
};

function displayValue(value) {
  if (value === null) return "—";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (value.length > 8) return "List preserved in the machine-readable packet";
    return value.map(displayValue).join(", ");
  }
  const encoded = JSON.stringify(value);
  return encoded.length <= 240 ? encoded : "Nested object preserved in the machine-readable packet";
}

function shell({
  title,
  description,
  canonicalUrl,
  source,
  eyebrow,
  h1,
  body,
  jsonLd,
  robots = "index, follow, max-snippet:-1, max-image-preview:large",
}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${canonicalUrl}" />
<meta name="author" content="${AUTHOR}" />
<meta name="canli:sources" content="${escapeHtml(source)}" />
<meta name="robots" content="${robots}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${PUBLISHER}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${canonicalUrl}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&amp;family=Instrument+Sans:wdth,wght@75..100,400..700&amp;family=Newsreader:opsz,wght@6..72,300..600&amp;display=optional" />
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&amp;family=Instrument+Sans:wdth,wght@75..100,400..700&amp;family=Newsreader:opsz,wght@6..72,300..600&amp;display=optional" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&amp;family=Instrument+Sans:wdth,wght@75..100,400..700&amp;family=Newsreader:opsz,wght@6..72,300..600&amp;display=optional" /></noscript>
<link rel="stylesheet" href="${canonicalUrl.endsWith("/trials") ? "./" : "../"}css/paper.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
<header class="paper__masthead">
  <a class="paper__brand" href="/">${PUBLISHER}</a>
  <nav class="paper__nav" aria-label="Primary">
    <a href="/open">Evidence</a><a href="/systems">Sleeves</a>
    <a href="/research">Research</a><a href="/methodology">Methodology</a>
    <a class="paper__nav-cta" href="https://app.canlicapital.com/dashboard">Open live record <span aria-hidden="true">↗</span></a>
  </nav>
</header>
<main class="paper__main" id="content"><article class="paper__article">
  <p class="paper__eyebrow">${eyebrow}</p>
  <h1 class="paper__title">${escapeHtml(h1)}</h1>
  <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, ${PUBLISHER}</p>
  <div class="paper__body">${body}</div>
</article></main>
</body></html>`;
}

// Research papers are published as canonical HTML routes while the packet records retain the
// raw markdown export path. Internal links must consolidate authority on the HTML document rather
// than invite crawlers to index a second, metadata-free representation of the same paper.
const canonicalPublicPath = (path) =>
  typeof path === "string" && path.startsWith("/research/") && path.endsWith(".md")
    ? path.slice(0, -3)
    : path;

function facts(packet) {
  const measurement = packet.immutable_first_measurement;
  const values = [
    ["Hypothesis key", packet.hypothesis_key],
    ["Configuration hash", packet.config_hash],
    ["Research family", humanise(packet.research_family_key)],
    ["Packet status", packet.packet_status],
    ["Observations", measurement.observations],
    ["Annualized Sharpe", measurement.annualized_sharpe],
    ["Skew", measurement.skew],
    ["Kurtosis", measurement.kurtosis],
  ];
  return `<dl class="trial__facts">${values.map(([label, value]) =>
    `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(displayValue(value))}</dd></div>`).join("")}</dl>`;
}

function renderEvidence(evidence) {
  if (!evidence.length) return `<p class="trial__absence">No identity-level evidence is bound.</p>`;
  return `<ul class="trial__evidence">${evidence.map((item) => {
    const label = humanise(item.type ?? "evidence");
    const name = item.public_path
      ? `<a href="${escapeHtml(canonicalPublicPath(item.public_path))}">${escapeHtml(label)}</a>`
      : `<span>${escapeHtml(label)}</span>`;
    const hash = item.sha256 ? `<code>${escapeHtml(item.sha256)}</code>` : "";
    const sources = item.walkforward_public_path && item.equity_public_path
      ? `<span class="trial__source-links">Original files: <a href="${escapeHtml(item.walkforward_public_path)}">walk-forward JSON</a> · <a href="${escapeHtml(item.equity_public_path)}">equity Parquet</a></span>`
      : "";
    return `<li>${name}${sources}${hash}</li>`;
  }).join("")}</ul>`;
}

function coverage(packet) {
  return `<ol class="trial__spine">${Object.entries(packet.required_sections).map(([name, section]) => {
    const state = section.status === "MISSING_IDENTITY_LEVEL_EVIDENCE"
      ? "missing"
      : section.status === "PARTIAL_IDENTITY_LEVEL_EVIDENCE"
        ? "partial"
        : "verified";
    return `<li class="trial__section trial__section--${state}">
      <div class="trial__section-head"><h3>${escapeHtml(humanise(name))}</h3>
      <span>${state}</span></div>${renderEvidence(section.evidence ?? [])}</li>`;
  }).join("")}</ol>`;
}

function configuration(packet) {
  return `<dl class="trial__config">${Object.entries(packet.configuration).map(([key, value]) =>
    `<div><dt>${escapeHtml(humanise(key))}</dt><dd>${escapeHtml(displayValue(value))}</dd></div>`).join("")}</dl>`;
}

function trialPage(packet) {
  const key = packet.hypothesis_key;
  const rawPath = `trial-packets/${key}.json`;
  const rawUrl = `/glassbox/${rawPath}`;
  const completeLabel = packet.complete ? "complete evidenced packet" : "incomplete evidence packet";
  const description = `Trial ${key}: ${completeLabel}. Inspect its immutable first measurement, configuration, evidence coverage, claim boundary, and machine source.`;
  const status = packet.complete ? "Complete" : "Incomplete";
  const recorded = new Date(packet.immutable_first_measurement.recorded_at_unix_ms).toISOString();
  const familyLink = packet.family_paper_public_path
    ? `<a href="${escapeHtml(canonicalPublicPath(packet.family_paper_public_path))}">Read the family paper</a> · ` : "";
  const blockers = packet.completion_assessment.blockers ?? [];
  const blockerHtml = blockers.length ? `<ul>${blockers.map((blocker) =>
    `<li><strong>${escapeHtml(humanise(blocker.code ?? "blocker"))}.</strong> ${escapeHtml(blocker.finding ?? "")}</li>`).join("")}</ul>` :
    `<p>${escapeHtml(packet.completion_assessment.claim_boundary)}</p>`;
  const body = `
<div class="trial__specimen" aria-label="Trial identity"><span>Hypothesis</span><code>${key}</code>
<strong class="${packet.complete ? "trial__state--complete" : "trial__state--incomplete"}">${status}</strong></div>
<p class="measure__lead">This page is generated from the exact machine-readable packet for
<strong>${escapeHtml(packet.label)}</strong>. Publication makes the evidence inspectable; it does not
upgrade the result, fill a missing section, or establish future performance.</p>
<aside class="measure__boundary"><h2>Claim boundary</h2><p>${escapeHtml(packet.claim_boundary)}</p></aside>
<section class="measure__section"><h2>Immutable first measurement</h2>${facts(packet)}</section>
<section class="measure__section"><h2>Evidence coverage</h2>
<p>The spine below is the trial-packet contract. A missing section stays visibly missing; partial
evidence remains incomplete until the entire section is proved.</p>${coverage(packet)}</section>
<section class="measure__section"><h2>Completion assessment</h2>${blockerHtml}</section>
<section class="measure__section"><h2>Frozen configuration</h2>${configuration(packet)}</section>
<section class="measure__section"><h2>Verify the packet</h2>
<p>${familyLink}<a href="${rawUrl}">Download the machine-readable packet</a> · <a href="/trials">All trials</a></p>
<p class="trial__hash">Packet content hash <code>${escapeHtml(packet.content_hash)}</code></p></section>`;
  return shell({
    title: `Trial ${key} / Canli Capital`, description,
    canonicalUrl: `${ORIGIN}/trials/${key}`, source: rawPath,
    eyebrow: `<a href="/trials">Trial evidence</a> / ${escapeHtml(humanise(packet.research_family_key))}`,
    h1: packet.label,
    body,
    // Incomplete packets stay publicly addressable and their links remain crawlable, but they are
    // evidence-accounting records rather than standalone search documents. Only a packet that
    // satisfies every frozen section is invited into the index.
    robots: packet.complete
      ? "index, follow, max-snippet:-1, max-image-preview:large"
      : "noindex, follow, max-snippet:-1, max-image-preview:large",
    jsonLd: {
      "@context": "https://schema.org", "@type": "Dataset",
      name: `Trial evidence packet ${key}`, description, url: `${ORIGIN}/trials/${key}`,
      identifier: key, dateCreated: recorded, dateModified: packet.evidence_date,
      creator: { "@type": "Person", "@id": `${ORIGIN}/#arhan-canli`, name: AUTHOR, url: `${ORIGIN}/founder` },
      publisher: { "@type": "Organization", name: PUBLISHER, url: `${ORIGIN}/` },
      isAccessibleForFree: true,
      distribution: { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${ORIGIN}${rawUrl}` },
    },
  });
}

function main() {
  if (!existsSync(INDEX_PATH)) throw new Error(`missing ${INDEX_PATH}`);
  const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  validateHash(index, INDEX_PATH);
  if (index.packets.length !== 228) throw new Error(`expected 228 trial packets, found ${index.packets.length}`);
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const packets = index.packets.map((entry) => {
    const path = resolve(PACKET_DIR, `${entry.hypothesis_key}.json`);
    const packet = JSON.parse(readFileSync(path, "utf8"));
    const packetBytes = readFileSync(path);
    const fileHash = createHash("sha256").update(packetBytes).digest("hex");
    if (fileHash !== entry.packet_file_sha256 || packet.content_hash !== entry.packet_content_hash || packet.hypothesis_key !== entry.hypothesis_key) {
      throw new Error(`${entry.hypothesis_key}: index-to-packet binding mismatch`);
    }
    writeFileSync(resolve(OUT_DIR, `${entry.hypothesis_key}.html`), trialPage(packet));
    return packet;
  });

  const groups = new Map();
  for (const packet of packets) {
    const rows = groups.get(packet.research_family_key) ?? [];
    rows.push(packet);
    groups.set(packet.research_family_key, rows);
  }
  const complete = packets.filter((packet) => packet.complete).length;
  const families = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const familyHtml = families.map(([family, rows]) => `<section class="trial__family">
    <h2>${escapeHtml(humanise(family))}</h2><p>Registered identities in this family are listed below.</p>
    <ul class="trial__cards">${rows.sort((a, b) => a.hypothesis_key.localeCompare(b.hypothesis_key)).map((packet) =>
      `<li><a href="/trials/${packet.hypothesis_key}"><code>${packet.hypothesis_key}</code><span>${escapeHtml(packet.label)}</span>` +
      `<strong class="${packet.complete ? "trial__state--complete" : "trial__state--incomplete"}">${packet.complete ? "complete" : "incomplete"}</strong></a></li>`).join("")}</ul>
  </section>`).join("");
  const description = `The complete ALPHAC hypothesis register: 228 immutable trial identities, each with its first measurement, evidence coverage, and machine-readable packet.`;
  const body = `<p class="measure__lead">Every return identity is listed here exactly once. Each page
binds the immutable first measurement to the evidence that survives today. Only ${complete} packets
currently satisfy every required section; the remaining debt is shown rather than hidden.</p>
<aside class="measure__boundary"><h2>Claim boundary</h2><p>${escapeHtml(index.claim_boundary)}</p></aside>
<p><a href="/glassbox/trial-packets/index.json">Download the packet index</a> ·
<a href="/measurements/trial-accounting">Verify trial accounting</a></p>${familyHtml}`;
  writeFileSync(resolve(ROOT, "trials.html"), shell({
    title: "Quantitative research trial register / Canli Capital", description,
    canonicalUrl: `${ORIGIN}/trials`, source: "trial-packets/index.json",
    eyebrow: `<a href="/research">Research</a>`, h1: "Quantitative research trial register", body,
    jsonLd: {
      "@context": "https://schema.org", "@type": "CollectionPage",
      name: "Quantitative research trial register", description, url: `${ORIGIN}/trials`,
      creator: { "@type": "Person", "@id": `${ORIGIN}/#arhan-canli`, name: AUTHOR, url: `${ORIGIN}/founder` },
      hasPart: packets.map((packet) => ({ "@type": "Dataset", name: packet.label, url: `${ORIGIN}/trials/${packet.hypothesis_key}` })),
    },
  }));
  console.log(`rendered ${packets.length} trial evidence pages (${complete} complete, ${packets.length - complete} incomplete)`);
}

main();
