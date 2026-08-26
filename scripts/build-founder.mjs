// =============================================================================
// CANLI CAPITAL / scripts/build-founder.mjs
// -----------------------------------------------------------------------------
// Render /founder: the page behind the Person entity that eighty-two research
// documents resolve their authorship to.
//
// WHY. Every paper on this site carries author markup pointing at a Person @id,
// and that @id resolved to the homepage, where the entity is DECLARED and never
// described. An authorship claim that leads nowhere is the weakest link in an
// otherwise checkable record.
//
// WHAT THIS PAGE IS NOT. There are no credentials on it, no employers, no
// degrees, no awards, and that absence is deliberate and stated on the page
// itself: a credential is a claim you would have to take on trust, and the whole
// argument of this record is that you do not have to take anything on trust. The
// only personal claim made here is one that is cryptographically checkable — the
// signed founder commitment — and the page shows you how to check it.
//
// Every number is DERIVED from the published artifacts at build time. A founder
// page that hard-coded its own corpus size would be the first thing on the site
// to go quietly stale, and it would be stale in the flattering direction.
// =============================================================================

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    ? readdirSync(resolve(ROOT, dir)).filter((n) => n.endsWith(".html")).length
    : 0;

function main() {
  const killLog = readJson("kill_log.json");
  const trials = readJson("trial_ledger.json");
  const chain = readJson("transparency_log.json");
  const commitment = readJson("founder_commitment.json");
  const track = readJson("track_record.json");

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
  for (const [key, value] of Object.entries(facts)) {
    if (value === undefined || value === null || value === 0) {
      // A derived number that came back empty would be published as a claim about the corpus.
      // Failing here is the only acceptable outcome; a zero on this page reads as modesty.
      console.error(`founder page: derived fact "${key}" is empty — refusing to publish it`);
      process.exit(1);
    }
  }

  const totalKilled = facts.killed + facts.screenKilled;
  const description =
    `Arhan Canli, founder of Canli Capital: what the work is, what the record contains, and the ` +
    `one personal claim here that can be checked with a signature.`;

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
        "Multiple-testing correction",
        "Deflated Sharpe ratio",
        "Point-in-time data",
        "Pre-registration",
        "Reproducible research",
      ],
      description:
        `Founder of Canli Capital and sole author of its published research record: ` +
        `${facts.papers} documents, ${facts.measurements} published measurements, and a signed ` +
        `append-only track record.`,
    },
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Arhan Canli, founder / Canli Capital</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${ORIGIN}/founder" />
<meta name="author" content="${AUTHOR}" />
<meta name="canli:sources" content="kill_log.json trial_ledger.json transparency_log.json founder_commitment.json track_record.json" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="profile" />
<meta property="og:site_name" content="${PUBLISHER}" />
<meta property="og:title" content="Arhan Canli, founder of Canli Capital" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${ORIGIN}/founder" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta property="profile:first_name" content="Arhan" />
<meta property="profile:last_name" content="Canli" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Arhan Canli, founder of Canli Capital" />
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
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
<header class="paper__masthead">
  <a class="paper__brand" href="/">${PUBLISHER}</a>
  <nav class="paper__nav" aria-label="Primary">
    <a href="/open">Evidence</a>
    <a href="/systems">Sleeves</a>
    <a href="/research">Research</a>
    <a href="/methodology">Methodology</a>
    <a class="paper__nav-cta" href="https://app.canlicapital.com/dashboard">Open live record <span aria-hidden="true">↗</span></a>
  </nav>
</header>
<main class="paper__main" id="content">
  <article class="paper__article">
    <p class="paper__eyebrow"><a href="/">Canli Capital</a></p>
    <h1 class="paper__title">Arhan Canli</h1>
    <p class="paper__byline">Founder and quantitative researcher, ${PUBLISHER}</p>
    <div class="paper__body">
      <p class="hub__standfirst">I build and publish a systematic trading engine. Everything on
      this site that carries my name as author is my own work, and all of it is written so that
      somebody who does not know me can check it without asking me anything.</p>

      <section class="verify__level" id="the-work">
        <h2>What the work is</h2>
        <p>ALPHAC is a cross-asset book of paper-traded sleeves — crypto funding carry, US equity
        cross-sectional momentum, multi-asset time-series momentum, and a point-in-time
        consumer-price-surprise size spread — combined at equal core weights with a separately
        disclosed directional overlay. The engine behind it handles the whole path: point-in-time
        data, factor construction, covariance-based sizing, a volatility target and drawdown ladder,
        execution against a live order book, and publication into a signed record. That path is
        <a href="/systems">walked stage by stage on the systems page</a>, with the measurement that
        proves each stage linked from it.</p>
        <p>The record it produces is deliberately larger than the part that worked.
        ${facts.papers} research documents are published, organised into ${facts.hubs} subject
        hubs, alongside ${facts.measurements} measurements each rendered with its own claim
        boundary. ${totalKilled} candidates have been killed and published in full against
        ${facts.survived} that survived. ${facts.identities} distinct hypothesis identities have
        been consumed against a declared budget of ${facts.budget}, because a deflated result is
        only honest if the number of attempts behind it is counted in public.</p>
        <p>The live paper record began ${escapeHtml(facts.goLive)} and has accrued
        ${facts.liveDays} days. That is short, it is stated as short everywhere it appears, and no
        conclusion is drawn from it that a record of that length cannot support.</p>
      </section>

      <section class="verify__level" id="no-credentials">
        <h2>What is deliberately not on this page</h2>
        <p>There are no degrees here, no former employers, no awards and no assets under
        management. That is not modesty and it is not an oversight — it is the same rule the rest
        of the site follows. A credential is a claim you would have to take on trust, and the
        entire argument of this record is that you should not have to take anything on trust. If a
        line of biography would change how you read the numbers, it is doing work the numbers
        should be doing themselves.</p>
        <p>So the only personal claim made on this page is one you can check with a command, and
        it is in the next section.</p>
      </section>

      <section class="verify__level" id="commitment">
        <h2>The one claim here you can verify</h2>
        <p>I have committed USD ${facts.commitmentUsd.toLocaleString("en-US")} of my own capital at
        ${escapeHtml(facts.commitmentTrigger)} of this book, into the same book, at the same time,
        on the same terms as any external capital. That commitment is Ed25519-signed, so it cannot
        be quietly edited, softened or backdated after the fact.</p>
        <p>It is a small number and saying so is the point: it is what I can actually commit, stated
        exactly, rather than a figure chosen to impress. No funded performance is included in the
        published ALPHAC record today. This is
        a forward commitment that activates at first live deployment, and until then it is a
        promise with a signature on it and nothing more.</p>
        <pre class="verify__code" tabindex="0" aria-label="Founder commitment verification command"><code>curl -sO ${ORIGIN}/glassbox/founder_commitment.json
curl -sO ${ORIGIN}/glassbox/reproduce.py
pip install cryptography
python3 reproduce.py --dir .</code></pre>
        <p>The same key signs the ${facts.chainEntries}-entry append-only chain behind the track
        record, which has been running since ${escapeHtml(facts.chainStart)}.
        <a href="/verify">The full verification instructions</a> cover both, including what each
        check cannot prove.</p>
      </section>

      <section class="verify__level" id="how-i-work">
        <h2>How the work is done, and where it has been wrong</h2>
        <p>The rules I hold myself to are written down and enforced in code rather than kept as
        intentions: a hypothesis is registered before its data is opened, a threshold is fixed
        before it is measured, a gate is mutation-tested by breaking the thing it guards, and a
        result that is chosen after seeing which population clears it is called selection and
        published as such.</p>
        <p>The most useful thing I can offer a sceptical reader is not the wins. It is that the
        corrections are published in the same place and the same format as everything else — a
        withdrawn figure, a defect found in our own gate, an earlier answer superseded by a better
        measurement of the same thing. <a href="/measurements">The measurements</a> include several
        that exist only because something we had already published turned out to be wrong.</p>
      </section>

      <section class="verify__level" id="elsewhere">
        <h2>Elsewhere</h2>
        <p>Code: <a href="${GITHUB}" rel="me noopener">${escapeHtml(GITHUB)}</a>. The research
        library is at <a href="/research">/research</a>, the published measurements at
        <a href="/measurements">/measurements</a>, and the instructions for checking any of it at
        <a href="/verify">/verify</a>.</p>
        <p>Nothing on this site is investment advice, an offer, or a solicitation. The book trades
        on paper and the published strategy record includes no funded performance.</p>
      </section>
    </div>
  </article>
</main>
</body>
</html>
`;

  writeFileSync(resolve(ROOT, "founder.html"), html);
  console.log(
    `rendered /founder: ${facts.papers} papers, ${facts.measurements} measurements, ` +
      `${totalKilled} kills, ${facts.identities}/${facts.budget} identities, ` +
      `${facts.chainEntries} chain entries`,
  );
}

main();
