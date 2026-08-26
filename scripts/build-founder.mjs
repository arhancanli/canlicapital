// Build the source-bound founder case study at /founder.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
const AUTHOR = "Arhan Canli";
const PUBLISHER = "Canli Capital";
const PERSON_ID = `${ORIGIN}/#arhan-canli`;
const GITHUB = "https://github.com/arhancanli";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const readJson = (name) => JSON.parse(readFileSync(resolve(GLASSBOX, name), "utf8"));
const countHtml = (dir) =>
  existsSync(resolve(ROOT, dir))
    ? readdirSync(resolve(ROOT, dir)).filter((name) => name.endsWith(".html")).length
    : 0;
const humanizeStatus = (value) =>
  String(value)
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

function assertPositiveFacts(facts) {
  for (const [key, value] of Object.entries(facts)) {
    if (value === undefined || value === null || value === 0) {
      throw new Error(`founder page: derived fact "${key}" is empty`);
    }
  }
}

function assertEvidenceMap(evidenceMap) {
  const contribution = evidenceMap.contribution_map;
  const walkthrough = evidenceMap.ninety_second_walkthrough;
  if (contribution?.status !== "SELF_DISCLOSED_SOURCE_BOUND_NOT_INDEPENDENTLY_ATTESTED") {
    throw new Error("founder page: contribution boundary is missing or weakened");
  }
  if (walkthrough?.total_seconds !== 90 || walkthrough?.chapters?.length !== 6) {
    throw new Error("founder page: 90-second walkthrough contract is incomplete");
  }
  if (walkthrough.chapters[0].start_second !== 0 || walkthrough.chapters.at(-1).end_second !== 90) {
    throw new Error("founder page: walkthrough does not span exactly 90 seconds");
  }
  for (let index = 1; index < walkthrough.chapters.length; index += 1) {
    if (walkthrough.chapters[index - 1].end_second !== walkthrough.chapters[index].start_second) {
      throw new Error("founder page: walkthrough chapters are not continuous");
    }
  }
}

function renderChapter(chapter, index) {
  const timing = `${String(chapter.start_second).padStart(2, "0")}:${String(
    chapter.end_second,
  ).padStart(2, "0")}`;
  return `<li class="founder-spine__item">
    <span class="founder-spine__node" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
    <article class="founder-spine__card">
      <div class="founder-spine__meta"><span>${escapeHtml(timing)}</span><span>${escapeHtml(chapter.label)}</span></div>
      <p>${escapeHtml(chapter.narration)}</p>
      <a href="${escapeHtml(chapter.screen)}">Open evidence path <span aria-hidden="true">↗</span></a>
    </article>
  </li>`;
}

const renderResponsibilities = (items) =>
  items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n");

function main() {
  const killLog = readJson("kill_log.json");
  const trials = readJson("trial_ledger.json");
  const chain = readJson("transparency_log.json");
  const commitment = readJson("founder_commitment.json");
  const track = readJson("track_record.json");
  const evidenceMap = readJson("stanford_cs_evidence_map.json");
  assertEvidenceMap(evidenceMap);

  const contribution = evidenceMap.contribution_map;
  const walkthrough = evidenceMap.ninety_second_walkthrough;
  const forward = evidenceMap.evidence.forward_truth.facts;
  const systems = evidenceMap.evidence.systems_and_provenance.facts;
  const external = contribution.external_validation;
  const ai = contribution.ai_assisted_tooling;
  const services = contribution.libraries_services_and_data;
  const facts = {
    papers: countHtml("research"),
    hubs: countHtml("research/topics"),
    measurements: countHtml("measurements"),
    killed: killLog.killed_count,
    screenKilled: killLog.screen_killed_count,
    survived: killLog.survived_count,
    identities: trials.distinct_hypothesis_identities,
    budget: trials.hypothesis_identity_budget,
    chainEntries: chain.entries.length,
    chainStart: chain.entries[0].date,
    goLive: track.go_live_date,
    liveDays: track.live_days_accrued,
    commitmentUsd: commitment.amount_usd,
    commitmentTrigger: commitment.trigger,
  };
  assertPositiveFacts(facts);
  const totalKilled = facts.killed + facts.screenKilled;

  const description =
    "Arhan Canli explains the decisions, corrections, contribution boundary and open evidence " +
    "burden behind Canli Capital and ALPHAC.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: `${ORIGIN}/founder`,
    dateModified: commitment.as_of,
    mainEntity: {
      "@type": "Person",
      "@id": PERSON_ID,
      name: AUTHOR,
      givenName: "Arhan",
      familyName: "Canli",
      jobTitle: "Founder and Quantitative Researcher",
      url: `${ORIGIN}/founder`,
      mainEntityOfPage: `${ORIGIN}/founder`,
      worksFor: { "@id": `${ORIGIN}/#organization` },
      sameAs: [GITHUB],
      knowsAbout: [
        "Systematic trading",
        "Quantitative research",
        "Research reproducibility",
        "Statistical validation",
        "Paper execution",
        "Evidence provenance",
      ],
      description:
        "Founder, named author and final accountable human for Canli Capital methodology, claims, " +
        "corrections and publication decisions. Development uses reviewed AI-assisted tooling.",
    },
  };
  const foundryStatus = walkthrough.chapters.at(-1).narration.includes("planned not applied")
    ? "Planned, not applied"
    : "Status unavailable";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Arhan Canli, founder and accountable researcher | Canli Capital</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${ORIGIN}/founder" />
<meta name="author" content="${AUTHOR}" />
<meta name="canli:sources" content="stanford_cs_evidence_map.json kill_log.json trial_ledger.json transparency_log.json founder_commitment.json track_record.json" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="profile" />
<meta property="og:site_name" content="${PUBLISHER}" />
<meta property="og:title" content="Arhan Canli, founder and accountable researcher" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${ORIGIN}/founder" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta property="profile:first_name" content="Arhan" />
<meta property="profile:last_name" content="Canli" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Arhan Canli, founder and accountable researcher" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" /></noscript>
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/founder.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="founder-page">
<a class="founder-skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "founder" })}
<main id="content">
  <section class="founder-hero" aria-labelledby="founder-title">
    <div class="founder-hero__grid" aria-hidden="true"></div>
    <div class="founder-hero__copy">
      <p class="founder-kicker"><span>Founder evidence map</span><span>Arhan Canli</span></p>
      <h1 id="founder-title">I built a system that keeps the evidence that proves me wrong.</h1>
      <p class="founder-hero__lead">ALPHAC is my attempt to make quantitative research publicly falsifiable. The interesting part is not a perfect curve. It is the machinery that freezes each attempt, keeps corrections visible and separates what I know from what I still need to prove.</p>
      <div class="founder-hero__actions">
        <a class="founder-button founder-button--primary" href="#walkthrough">Walk the 90-second case</a>
        <a class="founder-button" href="#contribution">Inspect who did what</a>
      </div>
    </div>
    <aside class="founder-status" aria-label="Current evidence status">
      <div class="founder-status__head"><span>Current record</span><strong>Source-bound</strong></div>
      <dl>
        <div><dt>Paper record since</dt><dd>${escapeHtml(facts.goLive)}</dd></div>
        <div><dt>Forward observations</dt><dd>${forward.daily_return_observations}</dd></div>
        <div><dt>Sleeves</dt><dd>${forward.current_sleeves} / ${forward.target_sleeves}</dd></div>
        <div><dt>External reviews</dt><dd>${external.completed_reviews}</dd></div>
        <div><dt>Foundry</dt><dd>${escapeHtml(foundryStatus)}</dd></div>
      </dl>
      <p>These are project facts, not an admissions claim or a performance claim.</p>
    </aside>
  </section>

  <section class="founder-section founder-walkthrough" id="walkthrough" aria-labelledby="walkthrough-title">
    <header class="founder-section__head">
      <p class="founder-label">A 90-second project case</p>
      <h2 id="walkthrough-title">Follow the decision, not the pitch.</h2>
      <p>Six evidence stops tell the story in order. The script is ready. The video has not been recorded.</p>
    </header>
    <ol class="founder-spine">${walkthrough.chapters.map(renderChapter).join("\n")}</ol>
    <p class="founder-boundary">${escapeHtml(walkthrough.claim_boundary)}</p>
  </section>

  <section class="founder-section founder-contribution" id="contribution" aria-labelledby="contribution-title">
    <header class="founder-section__head founder-section__head--split">
      <div><p class="founder-label">Contribution ledger</p><h2 id="contribution-title">Credit should be as inspectable as performance.</h2></div>
      <p class="founder-attestation">Self-disclosed and source-bound.<br />Not independently attested.</p>
    </header>
    <div class="founder-ledger">
      <details open>
        <summary><span>01</span><strong>Arhan Canli</strong><em>Accountable human</em></summary>
        <div class="founder-ledger__body"><p>${escapeHtml(contribution.arhan_canli.role)}</p><ul>${renderResponsibilities(contribution.arhan_canli.responsibilities)}</ul><p class="founder-ledger__boundary">${escapeHtml(contribution.arhan_canli.credit_boundary)}</p></div>
      </details>
      <details>
        <summary><span>02</span><strong>AI-assisted development</strong><em>Reviewed tooling</em></summary>
        <div class="founder-ledger__body"><p>${escapeHtml(ai.role)}</p><p>It cannot claim authorship, independent review, author approval or scientific judgment independent of me. Venue-specific disclosure is required.</p></div>
      </details>
      <details>
        <summary><span>03</span><strong>Libraries, services and data</strong><em>Capabilities and inputs</em></summary>
        <div class="founder-ledger__body"><p>${escapeHtml(services.role)}</p><p class="founder-ledger__boundary">${escapeHtml(services.credit_boundary)}</p></div>
      </details>
      <details>
        <summary><span>04</span><strong>External validation</strong><em>${external.completed_reviews} completed</em></summary>
        <div class="founder-ledger__body"><p>${escapeHtml(external.boundary)}</p><p class="founder-ledger__boundary">Assigned reviewers: ${external.assigned_reviewers}. Independent replications: ${external.independent_replications}.</p></div>
      </details>
    </div>
  </section>

  <section class="founder-section founder-proof" aria-labelledby="proof-title">
    <header class="founder-section__head"><p class="founder-label">Three proof surfaces</p><h2 id="proof-title">What I want a skeptical reader to open next.</h2></header>
    <div class="founder-proof__grid">
      <a href="/progress" class="founder-proof__card"><span>Correction trace</span><strong>See the attractive result, the defect and the repair.</strong><small>${totalKilled} killed or screen-killed candidates remain public.</small></a>
      <a href="/measurements/alpaca-broker-reconciliation" class="founder-proof__card"><span>Broker evidence</span><strong>${systems.alpaca_sleeves_reconciled} of ${systems.alpaca_sleeves_expected} Alpaca sleeves reconcile.</strong><small>Paper accounts only. No client capital. No funded performance.</small></a>
      <a href="/verify" class="founder-proof__card"><span>Signed record</span><strong>Verify the append-only chain from a clean command line.</strong><small>${facts.chainEntries} entries since ${escapeHtml(facts.chainStart)}. Integrity is not profitability.</small></a>
    </div>
  </section>

  <section class="founder-section founder-burden" id="open-burden" aria-labelledby="burden-title">
    <div class="founder-burden__intro"><p class="founder-label">Open burden</p><h2 id="burden-title">The unfinished work belongs in the result.</h2><p>I do not have a mature forward Sharpe, independent review, a deployed research Foundry or funded performance. Those are not footnotes. They define what the next evidence must establish.</p></div>
    <dl class="founder-burden__grid">
      <div><dt>Forward record</dt><dd>${forward.daily_return_observations} observations</dd><small>${escapeHtml(humanizeStatus(forward.sharpe_status))}</small></div>
      <div><dt>Sleeve objective</dt><dd>${forward.current_sleeves} of ${forward.target_sleeves}</dd><small>Target not achieved</small></div>
      <div><dt>Independent review</dt><dd>${external.completed_reviews} completed</dd><small>${external.independent_replications} replications</small></div>
      <div><dt>Foundry deployment</dt><dd>Planned</dd><small>Not applied to DigitalOcean</small></div>
    </dl>
  </section>

  <section class="founder-section founder-commitment" id="commitment" aria-labelledby="commitment-title">
    <div><p class="founder-label">Signed founder commitment</p><h2 id="commitment-title">A precise promise, not a funded track record.</h2><p>I committed USD ${facts.commitmentUsd.toLocaleString("en-US")} of my own capital at ${escapeHtml(facts.commitmentTrigger)} of this book, into the same book and on the same terms as external capital. It activates only at first live deployment. Until then it is a signed forward commitment and nothing more.</p></div>
    <pre tabindex="0" aria-label="Founder commitment verification command"><code>curl -sO ${ORIGIN}/glassbox/founder_commitment.json
curl -sO ${ORIGIN}/glassbox/reproduce.py
python3 reproduce.py --dir .</code></pre>
  </section>

  <section class="founder-section founder-close" aria-labelledby="close-title">
    <p class="founder-label">The working principle</p>
    <h2 id="close-title">Build the claim. Publish the evidence. Keep the failures.</h2>
    <p>The public record contains ${facts.papers} research documents, ${facts.measurements} measurements and ${facts.identities} recorded hypothesis identities against a declared budget of ${facts.budget}. It is larger than the part that worked because that is the only version worth trusting.</p>
    <div class="founder-hero__actions"><a class="founder-button founder-button--primary" href="/systems">Inspect ALPHAC systems</a><a class="founder-button" href="${GITHUB}" rel="me noopener">Open GitHub <span aria-hidden="true">↗</span></a></div>
  </section>
</main>
${renderProductShellFooter()}
</body>
</html>
`;

  if (
    html.includes(String.fromCodePoint(0x2014)) ||
    html.includes("sole author") ||
    html.includes("my own work")
  ) {
    throw new Error("founder page: prohibited or unsupported authorship language detected");
  }
  writeFileSync(resolve(ROOT, "founder.html"), html);
  console.log(
    `rendered /founder: ${walkthrough.chapters.length} evidence stops, ` +
      `${external.completed_reviews} completed external reviews, ${facts.identities} recorded identities`,
  );
}

main();
