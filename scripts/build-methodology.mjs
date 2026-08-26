// =============================================================================
// CANLI CAPITAL / scripts/build-methodology.mjs
// -----------------------------------------------------------------------------
// Render /methodology: the long-tail questions this corpus answers, answered in
// this project's own words, each linking to the document that DEMONSTRATES the
// answer rather than merely asserting it.
//
// WHY. "What is a deflated Sharpe ratio", "why publish failures", "what is
// point-in-time data", "what does pre-registration actually stop" — these are
// the questions the eighty-two documents here exist to answer, and nothing on
// the site indexed them. A reader arriving on any single kill file has no route
// to the reasoning that makes it worth reading.
//
// TWO RULES, both inherited from earlier items on this backlog:
//
//   1. EVERY ANSWER LINKS TO EVIDENCE. An FAQ that explains a principle without
//      pointing at the document where the principle cost us something is a
//      brochure. Each answer here names the paper or measurement that shows it
//      happening, and the verifier fails the build if any of those links does
//      not resolve.
//
//   2. EVERY NUMBER IS DERIVED. Counts come from the published artifacts at
//      build time. A page that hard-coded "46 kills" would be stale the first
//      time one is added, and stale in the flattering direction.
// =============================================================================

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
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

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const readJson = (name) => JSON.parse(readFileSync(resolve(GLASSBOX, name), "utf8"));
const countHtml = (...parts) =>
  existsSync(resolve(ROOT, ...parts))
    ? readdirSync(resolve(ROOT, ...parts)).filter((n) => n.endsWith(".html")).length
    : 0;

const stripTags = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function facts() {
  const killLog = readJson("kill_log.json");
  const trials = readJson("trial_ledger.json");
  const chain = readJson("transparency_log.json");
  const restatement = readJson("legacy_dsr_restatement.json");
  const track = readJson("track_record.json");
  const admission = readJson("sleeve_admission_contract.json");

  const f = {
    papers: countHtml("research"),
    hubs: countHtml("research", "topics"),
    measurements: countHtml("measurements"),
    kills: killLog.killed_count + killLog.screen_killed_count,
    survived: killLog.survived_count,
    identities: trials.distinct_hypothesis_identities,
    budget: trials.hypothesis_identity_budget,
    chainEntries: chain.entries.length,
    admissionSchema: admission.schema,
    bookMaturityDsr: admission.deflation_policy.book_maturity_threshold,
    dsrMeasuredPerSleeve: admission.deflation_policy.per_sleeve_is_measured_not_gated,
    bookDsrMeasured: admission.thresholds.book_deflated_sharpe_must_be_measured,
    restated: restatement.restated_variants.length,
    clearing: restatement.restated_variants.filter((v) => v.clears_dsr_0_95).length,
    liveDays: track.live_days_accrued,
    goLive: track.go_live_date,
  };
  for (const [key, value] of Object.entries(f)) {
    // `clearing` is legitimately zero and that IS the finding, so it is exempt by name rather
    // than by the check being loosened for everything.
    if (key === "clearing") continue;
    if (value === undefined || value === null || value === 0 || value === "") {
      console.error(`methodology page: derived fact "${key}" is empty — refusing to publish it`);
      process.exit(1);
    }
  }
  return f;
}

function questions(f) {
  return [
    {
      id: "deflated-sharpe",
      q: "What is a deflated Sharpe ratio, and why do you keep failing it?",
      a: `<p>A Sharpe ratio measures return per unit of risk. It says nothing about how many
      strategies you tried before you found that one. If you test a hundred variants and report the
      best, the best is partly skill and largely the maximum of a hundred draws — and the more you
      tried, the higher that maximum is expected to be even if every single variant is worthless.</p>
      <p>The deflated Sharpe ratio corrects for exactly that. It asks: given the number of trials
      behind this result and how much they varied, what is the probability the true Sharpe is above
      zero? A figure that looks impressive at one trial is unremarkable at a hundred and fifty.</p>
      <p>Under the contract in force (${f.admissionSchema}), DSR is mandatory to measure and publish
      for each sleeve and for the full-union book. ${f.bookMaturityDsr} is <em>not</em> a per-sleeve
      or incremental-admission gate; it is the full-union book threshold before a portfolio-maturity
      claim. Incremental admission instead requires a strictly positive one-sided bootstrap lower
      bound on the candidate's book-Sharpe improvement, plus the published robustness, execution,
      stress, capacity and trial-accounting gates.</p>
      <p>We keep failing it because it is the correct answer. When every historical result was
      recomputed against the current selection count, ${f.restated} variants were restated and
      <strong>${f.clearing} of them clear ${f.bookMaturityDsr}</strong>. That diagnostic remains
      published in full, variant by variant, but it is not presented as the current per-sleeve gate.</p>`,
      links: [
        ["Model the search pressure with the open calculator", "/tools/deflated-sharpe"],
        ["Inspect every identity behind selection N", "/tools/trial-accounting"],
        ["The full restatement, every variant", "/research/legacy-dsr-restatement"],
        ["The trial ledger the deflation counts against", "/measurements/trial-accounting"],
      ],
    },
    {
      id: "publish-failures",
      q: "Why do you publish strategies that failed?",
      a: `<p>Because the failures are the denominator. A deflated result is only honest if the
      number of attempts behind it is real, and the only way to make that number checkable is to
      publish the attempts. ${f.kills} candidates have been killed here against ${f.survived} that
      survived, and each kill names the specific number it died on.</p>
      <p>There is a second reason, and it is the one that matters to another researcher. A kill log
      is a table: it tells you the outcome. A paper tells you the reasoning — the universe, the
      window, the construction, and what would have had to be true for the candidate to live. The
      outcome saves nobody any work. The reasoning either saves them the experiment or gives them
      the grounds to show we were wrong.</p>`,
      links: [
        [`All ${f.kills} killed candidates`, "/research/topics/killed-candidates"],
        ["An example: a pre-registered momentum variant, killed", "/research/kill-prereg-momentum"],
      ],
    },
    {
      id: "point-in-time",
      q: "What is point-in-time data, and why does it change a result?",
      a: `<p>Point-in-time data is data as it stood on a past date, rather than as it stands today.
      The distinction sounds pedantic and it is usually the difference between a real result and an
      imaginary one. Index membership is revised, macroeconomic series are revised, filings are
      amended, and today's version of the past silently excludes everything that went bankrupt,
      got delisted, or was corrected.</p>
      <p>Two failures follow from getting it wrong, and both flatter. A backtest on today's index
      constituents is a backtest on companies that survived, which will show a quality effect
      whether or not one exists. A signal stamped with the date a fact was <em>measured</em>, rather
      than the date it became <em>knowable</em>, trades on information from the future — and it
      looks wonderful.</p>
      <p>So the vintage discipline is part of the mechanism here rather than a caveat. Where a
      schedule had to be reconstructed, the provenance of the schedule was audited before the effect
      was tested, and that audit turned out to be the larger piece of work.</p>`,
      links: [
        ["Auditing a schedule's provenance before testing the effect", "/research/treasury-auction-identity-timing"],
        ["A missing release, found and corrected in public", "/research/alphavintage-missing-release-correction"],
      ],
    },
    {
      id: "pre-registration",
      q: "What does pre-registration actually stop?",
      a: `<p>It stops the specification moving after the result is visible. A pre-registration fixes
      the universe, the signal, the horizon, the cost assumption and the pass criteria in writing,
      before any return data is opened. Once you have seen how a candidate performed, every
      subsequent choice about it — a different window, a filter, a slightly different construction —
      is informed by the answer, and the result stops being evidence about the market and becomes
      evidence about the researcher.</p>
      <p>The test of whether a pre-registration is real is whether anything ever dies under it. The
      registrations here are published alongside the candidates that were registered and then
      killed, which is the only demonstration that carries any weight.</p>`,
      links: [
        ["A locked specification, published before measurement", "/research/prereg-pre-fomc-announcement-drift"],
        ["A pre-registered candidate, killed under its own criteria", "/research/kill-prereg-value"],
      ],
    },
    {
      id: "feasibility",
      q: "Why decide whether something can be tested before testing it?",
      a: `<p>Because opening return data is the expensive step and it cannot be undone. It consumes
      a hypothesis from a finite budget — ${f.identities} of ${f.budget} consumed so far — and once
      a researcher has seen how a candidate performed, that knowledge contaminates every later
      decision about it.</p>
      <p>A feasibility protocol asks three questions first: does the evidence exist in a
      point-in-time form, can it be extracted at the rate the identity assumes, and are the
      resulting positions executable at a cost the mechanism can pay. If any answer is no, the idea
      is not weak — it is unmeasurable here, which is a different and more useful verdict.</p>
      <p>The move this guards against is specific. A gate that fails by a few points invites exactly
      one response: widen the detector until the number clears. That is tuning a measurement to
      agree with a target. So the ceiling a <em>perfect</em> detector would reach is computed first,
      and the question is settled on arithmetic rather than on effort.</p>`,
      links: [
        ["Asking whether a gate is reachable at all", "/measurements/reachability-harness"],
        ["The same question asked of every untouched family", "/measurements/atlas-reachability-screen"],
        ["What the failures had in common", "/research/identity-redesign-notes"],
      ],
    },
    {
      id: "real-but-untradeable",
      q: "How can a strategy be real and still not worth trading?",
      a: `<p>Because the edge and the cost are measured in the same units and the cost usually wins.
      A signal that predicts a small move over a long horizon can be entirely correct and entirely
      consumed by spread, fees, borrow, financing and market impact — and none of those show up in
      a backtest that prices fills at the mid.</p>
      <p>The more instructive failure is not modelling a cost at the wrong <em>level</em> but as the
      wrong <em>kind of thing</em>. Latency represented as a flat basis-point addition is treated as
      a microstructure effect; an order submitted after the close and filled at the next open is not
      crossing a spread at all, it is holding unhedged overnight exposure with a fat tail. Getting
      the size of such a term right does not fix having the wrong term.</p>
      <p>Which is why the cost check here published what it could not answer as well as what it
      could, and concluded that no cost parameter should move on that evidence — the recording
      schema should.</p>`,
      links: [
        ["The modelled cost against what the live book paid", "/measurements/cost-model-realism"],
        ["How execution is modelled, and its limits", "/research/execution-realism"],
      ],
    },
    {
      id: "correlation",
      q: "Why is correlation between strategies the binding constraint?",
      a: `<p>Because a book's Sharpe ratio depends on how many sleeves it has, how good each one is,
      and how correlated they are — and past a handful of sleeves the correlation term dominates.
      Adding a tenth strategy that moves with the nine you already own adds turnover and almost no
      diversification. The arithmetic is unforgiving and it is published rather than described.</p>
      <p>The uncomfortable finding is that structural intuition gets this backwards. On the only
      correlation structure this book has actually measured, the pair sharing a <em>factor family</em>
      is the most correlated in the book, and the pair sharing an <em>asset class</em> is negatively
      correlated. Breadth counted in asset classes is not breadth.</p>`,
      links: [
        ["The measured structure, and the ordering that follows", "/measurements/orthogonality-prior"],
        ["The book measured with and without one sleeve", "/measurements/book-without-alphavintage"],
      ],
    },
    {
      id: "paper-trading",
      q: "Is this real money, and why is there no return to look at?",
      a: `<p>The published ALPHAC record is not funded. Every sleeve shown here trades on paper,
      nothing on this site
      is investment advice, an offer or a solicitation, and a verified record of a simulation is
      still a record of a simulation.</p>
      <p>The live paper record began ${escapeHtml(f.goLive)} and has accrued ${f.liveDays} days.
      That is far too short to say anything about skill, which is stated everywhere the record
      appears rather than only in a disclaimer. The honest position is that the forward record is
      the only instrument that defeats the multiple-testing problem, and it defeats it by running
      for years, not by being presented confidently.</p>`,
      links: [
        ["The live record, as it accrues", "/open"],
        ["How long it must run before the gap is measurable", "/measurements/execution-gap-power"],
      ],
    },
    {
      id: "corrections",
      q: "Have you ever been wrong, and how would I find out?",
      a: `<p>Repeatedly, and in the same place and format as everything else. A withdrawn figure, a
      defect found in one of our own gates, an earlier published answer superseded by a better
      measurement of the same thing: all of it sits in the same corpus as the results, because a
      record that contains only its wins is not a record.</p>
      <p>The most useful ones are the corrections against our own methodology rather than against a
      number. A drawdown study was re-run through the estimator production actually uses, and it
      superseded an answer already on this site. A macro release was found missing and the affected
      figures were restated in public.</p>`,
      links: [
        ["An earlier answer superseded by a better measurement", "/measurements/drawdown-live-estimator"],
        ["A missing release, restated in public", "/research/alphavintage-missing-release-correction"],
        [`All ${f.measurements} published measurements`, "/measurements"],
      ],
    },
    {
      id: "gate",
      q: "What has to be true before a strategy is added to the book?",
      a: `<p>A written contract, applied by the production evaluator rather than by judgement. It
      sets minimum out-of-sample observations, significance floors that survive autocorrelation, a
      correlation ceiling against the existing book, a capacity floor, and mandatory DSR
      measurement. At incremental admission, DSR is published rather than thresholded; the
      ${f.bookMaturityDsr} full-union book threshold applies before a portfolio-maturity claim. The
      contract is published in full, thresholds and all.</p>
      <p>The contract has been wrong before, and that is published too: an earlier version contained
      floors that no candidate could satisfy simultaneously — a gate nobody can pass is not a strict
      gate, it is a broken one — and each was found by testing the gates against each other rather
      than against a candidate.</p>`,
      links: [
        ["The admission contract in force", "/measurements/sleeve-admission-contract-contract"],
        ["It run against a real candidate", "/measurements/admission-dry-run-result"],
      ],
    },
    {
      id: "check-you",
      q: "How do I check any of this without trusting you?",
      a: `<p>Download the published artifacts and recompute their hashes with nothing but Python;
      verify the Ed25519 signatures and re-derive all ${f.chainEntries} links of the append-only
      chain behind the track record; clone the engine and run its determinism test. The exact
      commands are on one page, and so is a section on what each check <em>cannot</em> prove.</p>
      <p>That last part is the honest half. A matching hash makes a number unedited, not correct. A
      valid chain says nothing about what was recorded before the chain began. A deterministic
      engine is not an accurate one.</p>`,
      links: [
        ["Inspect and challenge the signed chain in your browser", "/tools/evidence-chain"],
        ["The commands, and what they cannot show", "/verify"],
        ["The glass box itself", "/open"],
      ],
    },
    {
      id: "who",
      q: "Who is behind this?",
      a: `<p>One person: ${AUTHOR}, who wrote the engine and every one of the ${f.papers} documents
      published here. There are no credentials on the founder page, deliberately — a credential is a
      claim you would have to take on trust, and the entire argument of this record is that you
      should not have to.</p>`,
      links: [["The founder page, and the one claim on it you can verify", "/founder"]],
    },
  ];
}

function main() {
  const f = facts();
  const items = questions(f);

  const description =
    `What a deflated Sharpe ratio is, why failures get published, what point-in-time data ` +
    `changes, what pre-registration stops. Each answer links to the paper behind it.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${ORIGIN}/methodology`,
    name: "Quantitative research methodology and frequently asked questions",
    author: { "@id": `${ORIGIN}/#arhan-canli` },
    publisher: { "@id": `${ORIGIN}/#organization` },
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: stripTags(item.a) },
    })),
  };

  const body = items
    .map(
      (item) => `      <section class="verify__level" id="${item.id}">
        <h2>${escapeHtml(item.q)}</h2>
${item.a}
        <p class="faq__evidence">${item.links
          .map(([label, href]) => `<a href="${href}">${escapeHtml(label)}</a>`)
          .join(' <span aria-hidden="true">&middot;</span> ')}</p>
      </section>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Quantitative research methodology / Canli Capital</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${ORIGIN}/methodology" />
<meta name="author" content="${AUTHOR}" />
<meta name="canli:sources" content="kill_log.json trial_ledger.json transparency_log.json sleeve_admission_contract.json legacy_dsr_restatement.json track_record.json" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${PUBLISHER}" />
<meta property="og:title" content="Quantitative research methodology" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${ORIGIN}/methodology" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Quantitative research methodology" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wdth,wght@75..100,400..700&family=Newsreader:opsz,wght@6..72,300..600&display=optional" />
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wdth,wght@75..100,400..700&family=Newsreader:opsz,wght@6..72,300..600&display=optional" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wdth,wght@75..100,400..700&family=Newsreader:opsz,wght@6..72,300..600&display=optional" /></noscript>
<link rel="stylesheet" href="./css/paper.css" />
${renderProductShellStylesheet()}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "methodology" })}
<main class="paper__main" id="content">
  <article class="paper__article">
    <p class="paper__eyebrow"><a href="/research">Research</a></p>
    <h1 class="paper__title">Quantitative research methodology</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, ${PUBLISHER}</p>
    <div class="paper__body">
      <p class="hub__standfirst">${f.papers} research documents, ${f.hubs} subject hubs and
      ${f.measurements} published measurements answer these questions in detail. This page answers
      them briefly, and every answer links to the document where the answer had to be paid for
      rather than asserted.</p>
${body}
      <section class="verify__level" id="elsewhere">
        <h2>Where to go next</h2>
        <p><a href="/research">The research library</a> &middot;
        <a href="/measurements">Every measurement</a> &middot;
        <a href="/systems">How the engine works, stage by stage</a> &middot;
        <a href="/verify">How to check all of it</a></p>
        <p>Nothing on this site is investment advice, an offer, or a solicitation. The book trades
        on paper and the published strategy record includes no funded performance.</p>
      </section>
    </div>
  </article>
</main>
${renderProductShellFooter()}
</body>
</html>
`;

  writeFileSync(resolve(ROOT, "methodology.html"), html);
  console.log(`rendered /methodology: ${items.length} questions, ` +
    `${items.reduce((n, i) => n + i.links.length, 0)} evidence links`);
}

main();
