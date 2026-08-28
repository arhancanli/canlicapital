// Build /tools/evidence-chain from the exact public transparency record and anchor manifest.

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
const GLASSBOX = resolve(ROOT, "public", "glassbox");
const LOG_NAME = "transparency_log.json";
const ANCHORS_NAME = "ots/anchors.json";
const VERIFIER_NAME = "verify_transparency.py";
const LOG_PATH = resolve(GLASSBOX, LOG_NAME);
const ANCHORS_PATH = resolve(GLASSBOX, ANCHORS_NAME);
const VERIFIER_PATH = resolve(GLASSBOX, VERIFIER_NAME);
const ORIGIN = "https://canlicapital.com";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const bytesHash = (path) =>
  `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;

function assertSources(log, anchors) {
  const entries = log.entries;
  const disclosure = log.payload_disclosure;
  if (
    log.schema !== "glassbox.transparency_log/2" ||
    !Array.isArray(entries) ||
    entries.length === 0 ||
    log.entry_count !== entries.length ||
    entries[0].seq !== 0 ||
    entries.at(-1).seq !== entries.length - 1 ||
    log.head?.chain_hash !== entries.at(-1).chain_hash
  ) {
    throw new Error("Evidence-chain tool: transparency source is absent or internally inconsistent");
  }
  const disclosed = entries.filter((entry) => Object.hasOwn(entry, "payload"));
  if (
    disclosed.length !== disclosure.disclosed_entries ||
    entries.length - disclosed.length !== disclosure.opaque_historical_entries ||
    disclosed[0]?.seq !== disclosure.first_disclosed_seq
  ) {
    throw new Error("Evidence-chain tool: disclosure boundary does not match the entries");
  }
  if (
    anchors.schema !== "glassbox.ots_anchors/1" ||
    !Array.isArray(anchors.anchors) ||
    anchors.anchors.length !== anchors.anchor_count ||
    anchors.bitcoin_confirmed_count + anchors.calendar_pending_count !== anchors.anchor_count
  ) {
    throw new Error("Evidence-chain tool: OpenTimestamps manifest is absent or inconsistent");
  }
  for (const anchor of anchors.anchors) {
    const entry = entries[anchor.seq];
    if (!entry || entry.chain_hash !== anchor.chain_hash || entry.date !== anchor.date) {
      throw new Error(`Evidence-chain tool: checkpoint ${anchor.seq} is not bound to the chain`);
    }
  }
}

function main() {
  const log = JSON.parse(readFileSync(LOG_PATH, "utf8"));
  const anchors = JSON.parse(readFileSync(ANCHORS_PATH, "utf8"));
  assertSources(log, anchors);

  const entries = log.entries;
  const first = entries[0];
  const head = entries.at(-1);
  const disclosure = log.payload_disclosure;
  const sourceHashes = {
    log: bytesHash(LOG_PATH),
    anchors: bytesHash(ANCHORS_PATH),
    verifier: bytesHash(VERIFIER_PATH),
  };
  const config = {
    schema: "canli.evidence-chain-explorer-config.v1",
    source_urls: {
      log: "/glassbox/transparency_log.json",
      anchors: "/glassbox/ots/anchors.json",
      verifier: "/glassbox/verify_transparency.py",
    },
    source_hashes: sourceHashes,
    facts: {
      entries: entries.length,
      first_date: first.date,
      last_date: head.date,
      head_seq: head.seq,
      head_chain_hash: head.chain_hash,
      distinct_days: log.distinct_days,
      first_disclosed_seq: disclosure.first_disclosed_seq,
      disclosed_entries: disclosure.disclosed_entries,
      opaque_historical_entries: disclosure.opaque_historical_entries,
      anchors: anchors.anchor_count,
      bitcoin_confirmed_anchors: anchors.bitcoin_confirmed_count,
      calendar_pending_anchors: anchors.calendar_pending_count,
    },
  };
  const description =
    "Inspect and independently verify every predecessor link and Ed25519 signature in Canli " +
    "Capital's public record, with disclosure and Bitcoin checkpoints visible.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Canli Capital evidence-chain explorer",
    url: `${ORIGIN}/tools/evidence-chain`,
    description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any modern web browser",
    author: { "@id": `${ORIGIN}/#arhan-canli` },
    creator: { "@id": `${ORIGIN}/#arhan-canli` },
    isAccessibleForFree: true,
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Evidence-chain explorer | Canli Capital</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${ORIGIN}/tools/evidence-chain" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${LOG_NAME} ${ANCHORS_NAME} ${VERIFIER_NAME}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="Evidence-chain explorer" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${ORIGIN}/tools/evidence-chain" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Evidence-chain explorer" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=optional" />
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=optional" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=optional" /></noscript>
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/evidence-chain-tool.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="chain-page">
<a class="chain-skip" href="#microscope">Skip to the chain microscope</a>
${renderProductShellHeader({ active: "verify" })}
<main>
  <section class="chain-hero" aria-labelledby="chain-title">
    <div class="chain-hero__copy">
      <p class="chain-kicker"><span>Public verification instrument</span><span>Record schema v2</span></p>
      <h1 id="chain-title">Do not trust the timeline. Break it.</h1>
      <p class="chain-hero__lead">This browser re-derives every chain hash, checks every predecessor link and verifies every Ed25519 signature against the published key. Pick any historical entry, inspect what was signed, then alter a local copy and watch the proof fail.</p>
      <div class="chain-hero__actions">
        <a class="chain-button chain-button--primary" href="#microscope">Open the chain microscope</a>
        <a class="chain-button" href="/glassbox/verify_transparency.py">Download the full Python verifier</a>
      </div>
    </div>
    <aside class="chain-terminal" aria-label="Current published chain facts">
      <div class="chain-terminal__head"><span>Published head</span><strong>SEQ ${head.seq}</strong></div>
      <code>${escapeHtml(head.chain_hash)}</code>
      <dl>
        <div><dt>Signed entries</dt><dd>${entries.length}</dd></div>
        <div><dt>Distinct days</dt><dd>${log.distinct_days}</dd></div>
        <div><dt>Public payloads</dt><dd>${disclosure.disclosed_entries}</dd></div>
        <div><dt>Bitcoin checkpoints</dt><dd>${anchors.bitcoin_confirmed_count}</dd></div>
      </dl>
      <p>${escapeHtml(first.date)} to ${escapeHtml(head.date)}. Source facts, not page copy.</p>
    </aside>
  </section>

  <section class="chain-boundary" aria-label="Verification claim boundary">
    <span>What passes here</span>
    <p>Sequence, predecessor links, chain hashes, Ed25519 signatures, the declared payload-disclosure boundary and anchor-manifest bindings.</p>
    <span>What does not</span>
    <p>Broker truth, pre-boundary payload contents, record completeness or the absence of an unpublished alternate chain.</p>
  </section>

  <section class="chain-workbench" id="microscope" aria-labelledby="microscope-title">
    <header class="chain-section-head">
      <div><p class="chain-label">Chain microscope</p><h2 id="microscope-title">${entries.length} entries. Every dependency exposed.</h2></div>
      <div class="chain-verification">
        <span id="chain-verification-label">Loading public sources</span>
        <strong id="chain-verification-status" data-state="loading">WAIT</strong>
        <button type="button" id="chain-verify">Run verification again</button>
      </div>
    </header>

    <div class="chain-map" aria-label="Complete transparency-chain map" style="--disclosure-ratio:${disclosure.first_disclosed_seq / head.seq}">
      <div class="chain-map__legend" aria-hidden="true"><span>Opaque commitment</span><span>Public payload</span><span>Bitcoin checkpoint</span><span>Pending checkpoint</span></div>
      <canvas id="chain-canvas" aria-hidden="true"></canvas>
      <div class="chain-map__boundary" id="chain-disclosure-marker"><span>Payload disclosure starts</span><strong>SEQ ${disclosure.first_disclosed_seq}</strong></div>
      <input id="chain-range" type="range" min="0" max="${head.seq}" value="${head.seq}" step="1" aria-label="Select transparency-chain sequence" />
      <div class="chain-map__axis"><span>GENESIS<br />${escapeHtml(first.date)}</span><span>PUBLIC PAYLOADS FROM ${disclosure.first_disclosed_seq}</span><span>HEAD<br />${escapeHtml(head.date)}</span></div>
      <div class="chain-map__controls">
        <button type="button" id="chain-prev">Previous</button>
        <button type="button" id="chain-boundary-jump">Disclosure boundary</button>
        <button type="button" id="chain-head-jump">Current head</button>
        <button type="button" id="chain-next">Next</button>
      </div>
    </div>

    <div class="chain-inspector">
      <article class="chain-entry" aria-live="polite">
        <header>
          <div><span>Selected entry</span><h3>SEQ <strong id="entry-seq">${head.seq}</strong></h3></div>
          <div class="chain-entry__meta"><span id="entry-date">${escapeHtml(head.date)}</span><strong id="entry-disclosure">PUBLIC PAYLOAD</strong><span id="entry-anchor">NO CHECKPOINT</span></div>
        </header>
        <div class="chain-equation" aria-label="Fields used to calculate the selected chain hash">
          <div><span>01 / predecessor</span><code id="entry-prev">${escapeHtml(head.prev_chain_hash)}</code></div>
          <i aria-hidden="true">+</i>
          <div><span>02 / payload digest</span><code id="entry-payload">${escapeHtml(head.payload_sha256)}</code></div>
          <i aria-hidden="true">+</i>
          <div><span>03 / date and sequence</span><code id="entry-coordinate">${escapeHtml(head.date)} | ${head.seq}</code></div>
          <i aria-hidden="true">=</i>
          <div class="chain-equation__result"><span>04 / signed chain hash</span><code id="entry-hash">${escapeHtml(head.chain_hash)}</code></div>
        </div>
        <div class="chain-entry__signature">
          <span>Ed25519 signature</span><code id="entry-signature">${escapeHtml(head.signature)}</code>
          <button type="button" id="chain-copy">Copy selected entry JSON</button>
        </div>
      </article>

      <aside class="chain-proof" aria-label="Selected entry verification state">
        <div class="chain-proof__score"><span>Browser checks</span><strong id="entry-proof-score">0 / 4</strong></div>
        <ol>
          <li id="proof-sequence"><span>01</span><div><strong>Sequence and link</strong><small>Contiguous and bound to its predecessor</small></div><b>WAIT</b></li>
          <li id="proof-hash"><span>02</span><div><strong>Chain hash</strong><small>Recomputed from four signed fields</small></div><b>WAIT</b></li>
          <li id="proof-signature"><span>03</span><div><strong>Ed25519 signature</strong><small>Checked against the published raw key</small></div><b>WAIT</b></li>
          <li id="proof-anchor"><span>04</span><div><strong>External checkpoint</strong><small id="proof-anchor-note">Not every entry has an OpenTimestamps checkpoint</small></div><b>INFO</b></li>
        </ol>
        <p><span>Public key</span><code>${escapeHtml(log.public_key_ed25519_hex)}</code></p>
      </aside>
    </div>
  </section>

  <section class="chain-mutation" aria-labelledby="mutation-title">
    <div class="chain-mutation__copy">
      <p class="chain-label">Local mutation lab</p>
      <h2 id="mutation-title">Change one signed field. The old signature loses its target.</h2>
      <p>This experiment edits an in-memory copy of the selected date. It never writes to the published record. The new hash will differ, so the existing signature cannot validate it and the next entry will still point to the old hash.</p>
      <button class="chain-button chain-button--primary" type="button" id="chain-mutate">Simulate one-field rewrite</button>
    </div>
    <div class="chain-mutation__lab" id="mutation-lab" data-state="idle">
      <div><span>Published date</span><code id="mutation-original-date">${escapeHtml(head.date)}</code></div>
      <div><span>Local test date</span><code id="mutation-test-date">Awaiting experiment</code></div>
      <div><span>Published hash</span><code id="mutation-original-hash">${escapeHtml(head.chain_hash)}</code></div>
      <div><span>Recomputed test hash</span><code id="mutation-test-hash">Awaiting experiment</code></div>
      <p id="mutation-result">No mutation has been run.</p>
    </div>
  </section>

  <section class="chain-layers" aria-labelledby="layers-title">
    <header class="chain-section-head"><div><p class="chain-label">Four different claims</p><h2 id="layers-title">Integrity is not truth. Timestamping is not completeness.</h2></div></header>
    <div class="chain-layers__grid">
      <article><span>01</span><h3>Link continuity</h3><p>Changing one signed field changes that entry's hash. The next entry still points to the original, so continuity breaks.</p><strong>Verified in this browser</strong></article>
      <article><span>02</span><h3>Signer possession</h3><p>Each chain hash has a valid Ed25519 signature under the one public key printed above.</p><strong>Verified in this browser</strong></article>
      <article><span>03</span><h3>Payload disclosure</h3><p>From sequence ${disclosure.first_disclosed_seq}, canonical payloads are public. Earlier entries expose hashes only and cannot be reconstructed.</p><strong>Full rehash uses Python</strong></article>
      <article><span>04</span><h3>External existence proof</h3><p>${anchors.bitcoin_confirmed_count} selected heads have Bitcoin-confirmed OpenTimestamps proofs. This dates checkpoint existence, not broker accuracy.</p><strong>Proof files published</strong></article>
    </div>
  </section>

  <section class="chain-source" aria-labelledby="source-title">
    <header class="chain-section-head"><div><p class="chain-label">Source ledger</p><h2 id="source-title">Reproduce the claim outside this interface.</h2></div></header>
    <div class="chain-source__grid">
      <a href="/glassbox/transparency_log.json"><span>Signed record</span><strong>${LOG_NAME}</strong><code>${escapeHtml(sourceHashes.log)}</code></a>
      <a href="/glassbox/ots/anchors.json"><span>Checkpoint manifest</span><strong>${ANCHORS_NAME}</strong><code>${escapeHtml(sourceHashes.anchors)}</code></a>
      <a href="/glassbox/verify_transparency.py"><span>Canonical payload verifier</span><strong>${VERIFIER_NAME}</strong><code>${escapeHtml(sourceHashes.verifier)}</code></a>
      <a href="/verify"><span>Complete verification route</span><strong>Commands and claim boundaries</strong><code>canlicapital.com/verify</code></a>
    </div>
    <p class="chain-source__boundary"><strong>Why Python for payload rehashing?</strong> JavaScript parses numeric JSON tokens such as <code>100000.0</code> into the number <code>100000</code>. Re-serializing that value can change canonical bytes even when the data are equivalent. This browser therefore verifies links and signatures without pretending it can reproduce Python's original numeric lexemes. The published Python verifier performs the complete disclosed-payload rehash.</p>
  </section>
</main>
${renderProductShellFooter()}
<script id="evidence-chain-config" type="application/json">${JSON.stringify(config).replaceAll("<", "\\u003c")}</script>
<script type="module" src="/js/evidence-chain-tool.js"></script>
</body>
</html>
`;

  const outputDir = resolve(ROOT, "tools");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "evidence-chain.html"), html);
  console.log(
    `rendered /tools/evidence-chain: ${entries.length} entries, ${anchors.anchor_count} anchors, ` +
      `payload disclosure from seq ${disclosure.first_disclosed_seq}`,
  );
}

main();
