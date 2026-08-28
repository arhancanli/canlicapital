// Render every AlphaForge hypothesis identity as a stable, evidence-bound HTML page.
// A page is not declared complete unless its packet is complete; historical evidence debt is
// rendered as debt, never upgraded by publication.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKET_DIR = resolve(ROOT, "public/glassbox/trial-packets");
const INDEX_PATH = resolve(PACKET_DIR, "index.json");
const DISTRIBUTION_PATH = resolve(ROOT, "public/glassbox/trial_sharpe_distribution.json");
const OUT_DIR = resolve(ROOT, "trials");
const ORIGIN = "https://canlicapital.com";
const AUTHOR = "Arhan Canli";
const PUBLISHER = "Canli Capital";
import { editableDashForms, emDashCharacter, normalizeEditableCopy } from "./editable-copy.mjs";

const escapeHtml = (value) => normalizeEditableCopy(value)
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

const ACRONYMS = new Set([
  "eia", "vrp", "cpi", "roe", "bab", "mvo", "arp", "gpe", "ml", "bp",
  "etf", "nav", "fx", "us", "pnl", "iv", "rv",
]);
const humanise = (value) => String(value)
  .replaceAll("_", " ")
  .split(" ")
  .map((word) => (ACRONYMS.has(word.toLowerCase())
    ? word.toUpperCase()
    : word.replace(/^\w/, (letter) => letter.toUpperCase())))
  .join(" ");

const formatNumber = (value) => {
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return Number(value).toPrecision(7).replace(/\.?0+$/, "");
};

function displayValue(value) {
  if (value === null) return "Not reported";
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
  socialTitle = "",
  description,
  canonicalUrl,
  source,
  eyebrow,
  h1,
  hero = "",
  body,
  jsonLd,
  robots = "index, follow, max-snippet:-1, max-image-preview:large",
}) {
  return normalizeEditableCopy(`<!doctype html>
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
<meta property="og:title" content="${escapeHtml(socialTitle || title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${canonicalUrl}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(socialTitle || title)}" />
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
${renderProductShellStylesheet()}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "trials" })}
${hero}
<main class="paper__main" id="content"><article class="paper__article">
  ${hero ? "" : `<p class="paper__eyebrow">${eyebrow}</p>
  <h1 class="paper__title">${escapeHtml(h1)}</h1>`}
  <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, ${PUBLISHER}</p>
  <div class="paper__body">${body}</div>
</article></main>
${renderProductShellFooter()}
</body></html>`);
}

// Research papers are published as canonical HTML routes while the packet records retain the
// raw markdown export path. Internal links must consolidate authority on the HTML document rather
// than invite crawlers to index a second, metadata-free representation of the same paper.
const canonicalPublicPath = (path) =>
  typeof path === "string" && path.startsWith("/research/") && path.endsWith(".md")
    ? path.slice(0, -3)
    : path;

// A strip plot of all 224 measured trials with this one marked. The argument
// this site makes is that most attempts fail and the median attempt is worth
// nothing; showing each trial its own position in that population makes the
// argument on every page instead of once on a summary page.
//
// Coordinates only -- no text -- because the axis labels and the caption carry
// the numbers, and a number inside an SVG path is not something a reader can read.
const formatFigure = (value) => (Number.isFinite(value) ? value.toFixed(2) : "");

function distributionPlot(distribution, sharpe) {
  const values = distribution.ranked.map((r) => r.annualized_sharpe);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const W = 1000;
  const x = (value) => 12 + ((value - lo) / span) * (W - 24);
  const ticks = distribution.ranked
    .map((r) => `<line x1="${x(r.annualized_sharpe).toFixed(1)}" y1="18" x2="${x(r.annualized_sharpe).toFixed(1)}" y2="42" />`)
    .join("");
  const zero = lo <= 0 && hi >= 0
    ? `<line class="trial-dist__zero" x1="${x(0).toFixed(1)}" y1="10" x2="${x(0).toFixed(1)}" y2="50" />` : "";
  const median = `<line class="trial-dist__median" x1="${x(distribution.summary.median).toFixed(1)}" y1="10" x2="${x(distribution.summary.median).toFixed(1)}" y2="50" />`;
  const here = typeof sharpe === "number"
    ? `<line class="trial-dist__here" x1="${x(sharpe).toFixed(1)}" y1="4" x2="${x(sharpe).toFixed(1)}" y2="56" />` +
      `<circle class="trial-dist__dot" cx="${x(sharpe).toFixed(1)}" cy="30" r="5" />` : "";
  return `<svg class="trial-dist__plot" viewBox="0 0 ${W} 60" preserveAspectRatio="none" role="img" aria-label="Position of this trial among every measured trial">
    <g class="trial-dist__ticks">${ticks}</g>${zero}${median}${here}
  </svg>`;
}

function heroBlock(packet, distribution) {
  const measurement = packet.immutable_first_measurement ?? {};
  const sharpe = typeof measurement.annualized_sharpe === "number" ? measurement.annualized_sharpe : null;
  const entry = distribution.ranked.find((r) => r.hypothesis_key === packet.hypothesis_key) ?? null;
  const state = packet.complete ? "Complete" : "Incomplete";

  // A trial with no recorded first measurement says so. Rendering a dash where a
  // number belongs is the honest output; rendering a zero would invent a result.
  const figure = sharpe === null
    ? `<div class="trial-hero__figure trial-hero__figure--absent"><span>First measurement</span><strong>Not recorded</strong><small>This identity carries no first-measurement Sharpe. It is one of ${distribution.trials_unmeasured} such identities.</small></div>`
    : `<div class="trial-hero__figure"><span>First measurement, annualised Sharpe</span><strong>${formatFigure(sharpe)}</strong><small>over ${formatNumber(measurement.observations)} observations. One historical measurement, not a return and not a forecast.</small></div>`;

  const placement = entry
    ? `<p class="trial-dist__caption">This trial ranks <strong>${entry.rank_ascending} of ${distribution.trials_measured}</strong> measured identities, at the <strong>${entry.percentile}th</strong> percentile. The median trial recorded here scores ${distribution.summary.median}, and ${distribution.summary.share_above_zero_pct}% score above zero at all.</p>`
    : `<p class="trial-dist__caption">Unranked: this identity has no first measurement, so it does not appear in the distribution of ${distribution.trials_measured} measured trials shown above.</p>`;

  return `<section class="trial-hero" aria-labelledby="trial-hero-title">
  <p class="trial-hero__eyebrow"><a href="/trials">Trial evidence</a> <span>/</span> ${escapeHtml(humanise(packet.research_family_key))}</p>
  <h1 class="trial-hero__title" id="trial-hero-title">${escapeHtml(humanise(packet.label))}</h1>
  <p class="trial-hero__key">Hypothesis key <code>${escapeHtml(packet.hypothesis_key)}</code> <em class="trial-hero__state trial-hero__state--${packet.complete ? "complete" : "incomplete"}">${state}</em></p>
  <div class="trial-hero__measure">${figure}</div>
  <div class="trial-dist">
    <p class="trial-dist__label">Where this sits among every trial ever recorded</p>
    ${distributionPlot(distribution, sharpe)}
    <p class="trial-dist__axis"><span>${distribution.summary.minimum}</span><span>Sharpe ratio</span><span>${distribution.summary.maximum}</span></p>
    <p class="trial-dist__legend"><span class="trial-dist__swatch trial-dist__swatch--here"></span>this trial <span class="trial-dist__swatch trial-dist__swatch--median"></span>median <span class="trial-dist__swatch trial-dist__swatch--zero"></span>zero</p>
    ${placement}
  </div>
</section>`;
}

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

function trialPage(packet, distribution) {
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
<aside class="measure__boundary"><h2>Claim boundary</h2><p>${escapeHtml(packet.claim_boundary)}</p></aside>
<section class="measure__section"><h2>Immutable first measurement</h2>${facts(packet)}</section>
<section class="measure__section"><h2>Evidence coverage</h2>${coverage(packet)}</section>
<section class="measure__section"><h2>Completion assessment</h2>${blockerHtml}</section>
<section class="measure__section"><h2>Frozen configuration</h2>${configuration(packet)}</section>
<section class="measure__section"><h2>Verify the packet</h2>
<p>${familyLink}<a href="${rawUrl}">Download the machine-readable packet</a> · <a href="/trials">All trials</a></p>
<p class="trial__hash">Packet content hash <code>${escapeHtml(packet.content_hash)}</code></p></section>`;
  return shell({
    title: `${humanise(packet.research_family_key)} trial ${key.slice(0, 8)} / Canli`,
    socialTitle: `${humanise(packet.label)} / Canli Capital`,
    description,
    canonicalUrl: `${ORIGIN}/trials/${key}`,
    source: `${rawPath} trial_sharpe_distribution.json`,
    eyebrow: `<a href="/trials">Trial evidence</a> / ${escapeHtml(humanise(packet.research_family_key))}`,
    h1: humanise(packet.label),
    hero: heroBlock(packet, distribution),
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
  if (!existsSync(DISTRIBUTION_PATH)) {
    throw new Error(`missing ${DISTRIBUTION_PATH}; run build-trial-distribution.mjs first`);
  }
  const distribution = JSON.parse(readFileSync(DISTRIBUTION_PATH, "utf8"));
  // The distribution is built from these same packets. If it was generated
  // against a different set, every percentile on every page is quietly wrong,
  // so the two are required to agree on the population before anything renders.
  const entries = index.packets ?? index;
  if (distribution.trials_total !== entries.length) {
    throw new Error(
      `trial distribution covers ${distribution.trials_total} identities but the index has ${entries.length}; ` +
      "the percentiles would describe a different population than the pages do",
    );
  }
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
    writeFileSync(resolve(OUT_DIR, `${entry.hypothesis_key}.html`), trialPage(packet, distribution));
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
<p><a href="/tools/trial-accounting">Explore the complete selection denominator</a> ·
<a href="/glassbox/trial-packets/index.json">Download the packet index</a> ·
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
