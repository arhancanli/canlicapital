// =============================================================================
// CANLI CAPITAL / scripts/build-verify.mjs
// -----------------------------------------------------------------------------
// Render /verify: how an outsider checks this record without taking our word for
// anything.
//
// WHY. The verifier already existed and already worked. Nothing on the site
// explained it to somebody who had not already gone looking, which meant the one
// asset this record has — that it can be checked — was reachable only by people
// who already believed it. "Don't trust us, verify us" is a slogan until the
// commands are on a page.
//
// DERIVED, NOT TYPED. The artifact list, the signed files, the chain length and
// the public key are read from what is actually published, at build time. A page
// that hard-coded "23 artifacts" would be wrong the first time the exporter adds
// one, and it would be wrong in the direction that matters: an instruction that
// does not work is worse than no instruction, because the reader spends their
// attempt on it.
//
// It also states what each level does NOT prove. A verification page that only
// lists what it establishes is marketing.
// =============================================================================

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GLASSBOX = resolve(ROOT, "public/glassbox");
const ORIGIN = "https://canlicapital.com";
const AUTHOR = "Arhan Canli";
const PUBLISHER = "Canli Capital";

// reproduce.py's own convention: these two are verified by SIGNATURE, not by content hash, so it
// skips them at L1. Mirrored here from the kit rather than guessed.
const SIGNED_SKIP = new Set(["capacity_commitment.json", "transparency_log.json"]);
const SIGNED_COMMITMENTS = ["capacity_commitment.json", "founder_commitment.json"];

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function hashedArtifacts() {
  return readdirSync(GLASSBOX)
    .filter((name) => name.endsWith(".json") && name !== "repro_manifest.json")
    .filter((name) => !SIGNED_SKIP.has(name))
    .filter((name) => {
      try {
        const parsed = JSON.parse(readFileSync(resolve(GLASSBOX, name), "utf8"));
        return parsed && typeof parsed === "object" && typeof parsed.content_hash === "string";
      } catch {
        return false;
      }
    })
    .sort();
}

function chainFacts() {
  const file = resolve(GLASSBOX, "transparency_log.json");
  if (!existsSync(file)) return null;
  const log = JSON.parse(readFileSync(file, "utf8"));
  const entries = log.entries || [];
  if (entries.length === 0) return null;
  return {
    count: entries.length,
    firstDate: entries[0].date,
    lastDate: entries[entries.length - 1].date,
    publicKey: log.public_key_ed25519_hex,
  };
}

/** Wrap a long space-separated shell list so it stays copy-pasteable. */
function wrapList(names, width = 84, indent = "  ") {
  const lines = [];
  let line = "";
  for (const name of names) {
    const stem = name.replace(/\.json$/, "");
    if (line.length + stem.length + 1 > width) {
      lines.push(line);
      line = "";
    }
    line += (line ? " " : "") + stem;
  }
  if (line) lines.push(line);
  return lines.map((l, i) => (i === 0 ? l : indent + l)).join(" \\\n");
}

function main() {
  const artifacts = hashedArtifacts();
  const chain = chainFacts();
  if (artifacts.length === 0) {
    console.error("no hashed artifacts found — /verify would tell a reader to download nothing");
    process.exit(1);
  }
  if (!chain) {
    console.error("no transparency chain found — /verify cannot describe what it does not have");
    process.exit(1);
  }
  const signedPresent = SIGNED_COMMITMENTS.filter((n) => existsSync(resolve(GLASSBOX, n)));

  const l1Command = `mkdir canli-verify && cd canli-verify

for f in \\
  ${wrapList(artifacts)} ; do
  curl -sO ${ORIGIN}/glassbox/$f.json
done
curl -sO ${ORIGIN}/glassbox/reproduce.py

python3 reproduce.py --dir .`;

  const l2Command = `pip install cryptography

for f in ${signedPresent.map((n) => n.replace(/\.json$/, "")).join(" ")} ; do
  curl -sO ${ORIGIN}/glassbox/$f.json
done
python3 reproduce.py --dir .

# and the append-only chain, which is the part that cannot be quietly rewritten
curl -sO ${ORIGIN}/glassbox/transparency_log.json
curl -sO ${ORIGIN}/glassbox/verify_transparency.py
python3 verify_transparency.py transparency_log.json`;

  const CLONE_URL = "https://github.com/arhancanli/alphac.git";
  const l3Command = `git clone ${CLONE_URL}
cd alphac && uv sync
uv run python scripts/reproduce.py`;

  const description =
    `Recompute every published hash with nothing but Python, check the signatures and the ` +
    `append-only chain, re-run the engine. Exact commands, and what each cannot show.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to verify the Canli Capital published record",
    description,
    url: `${ORIGIN}/verify`,
    author: { "@type": "Person", "@id": `${ORIGIN}/#arhan-canli`, name: AUTHOR },
    publisher: { "@type": "Organization", "@id": `${ORIGIN}/#organization`, name: PUBLISHER },
    step: [
      {
        "@type": "HowToStep",
        name: "Recompute the content hashes",
        text: `Download the ${artifacts.length} published artifacts and reproduce.py, then run it. Python standard library only.`,
        url: `${ORIGIN}/verify#l1`,
      },
      {
        "@type": "HowToStep",
        name: "Check the signatures and the append-only chain",
        text: `Verify the Ed25519 signatures on the signed commitments and re-derive all ${chain.count} links of the transparency chain.`,
        url: `${ORIGIN}/verify#l2`,
      },
      {
        "@type": "HowToStep",
        name: "Re-run the engine determinism test",
        text: "Clone the repository and run the golden-master test, which reproduces a scripted fixture byte for byte.",
        url: `${ORIGIN}/verify#l3`,
      },
    ],
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>How to verify us / Canli Capital</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${ORIGIN}/verify" />
<meta name="author" content="${AUTHOR}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${PUBLISHER}" />
<meta property="og:title" content="How to verify us" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${ORIGIN}/verify" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="How to verify us" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wdth,wght@75..100,400..700&family=Newsreader:opsz,wght@6..72,300..600&display=swap" />
<link rel="stylesheet" href="./css/paper.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
<header class="paper__masthead">
  <a class="paper__brand" href="/">${PUBLISHER}</a>
  <nav class="paper__nav" aria-label="Primary">
    <a href="/systems">Systems</a>
    <a href="/performance">Evidence</a>
    <a href="/research">Research</a>
    <a href="/measurements">Measurements</a>
    <a href="/open">Glass box</a>
  </nav>
</header>
<main class="paper__main" id="content">
  <article class="paper__article">
    <p class="paper__eyebrow"><a href="/open">The glass box</a></p>
    <h1 class="paper__title">How to verify us</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, ${PUBLISHER}</p>
    <div class="paper__body">
      <p class="hub__standfirst">Every claim on this site is meant to be checkable by somebody who
      does not trust us. This page is the instructions. It takes about two minutes for the first
      level, needs no account and no permission, and it is designed to be able to fail — if a
      published number had been edited after the fact, the command below would say so.</p>

      <p>There are three levels, each more hands-on than the last, and each independent of taking
      our word for anything. The first needs nothing but Python. The second adds one library and
      checks the signatures. The third clones the engine and re-runs it. You do not need to do all
      three: the first one alone establishes that the numbers you are reading are the numbers that
      were published.</p>

      <section class="verify__level" id="l1">
        <h2>Level 1 — recompute every hash</h2>
        <p>Each published artifact carries a SHA-256 over its own canonical bytes. This recomputes
        all ${artifacts.length} of them from files downloaded straight off this site and confirms
        every one matches. No repository, no install, no data — the Python standard library is
        enough.</p>
        <pre class="verify__code"><code>${escapeHtml(l1Command)}</code></pre>
        <p>You should see <code>L1 content hashes : ${artifacts.length} reproduced, 0 failed</code>.
        If any line says FAIL, a published file no longer matches the hash it was published with,
        and the kit exits non-zero. That is the kit working, not the kit breaking.</p>
      </section>

      <section class="verify__level" id="l2">
        <h2>Level 2 — check the signatures and the chain</h2>
        <p>Two commitments are Ed25519-signed, and the whole track record is written into an
        append-only hash chain: each entry links to the one before it by hash, and every link is
        signed. Re-deriving that chain is the check that matters most, because it is the one that
        catches a past day being quietly rewritten rather than a present file being edited.</p>
        <pre class="verify__code"><code>${escapeHtml(l2Command)}</code></pre>
        <p>The chain currently holds ${chain.count} entries, from ${escapeHtml(chain.firstDate)} to
        ${escapeHtml(chain.lastDate)}, signed under the public key
        <code class="verify__key">${escapeHtml(chain.publicKey)}</code>. If any earlier entry had
        been altered, that entry's chain hash — and every signature after it — would fail here.</p>
      </section>

      <section class="verify__level" id="l3">
        <h2>Level 3 — re-run the engine</h2>
        <p>The last level checks that the engine which produced the numbers is deterministic and
        unchanged: a golden-master test replays a scripted fixture and requires the output to be
        byte-for-byte identical. This one needs the repository.</p>
        <pre class="verify__code"><code>${escapeHtml(l3Command)}</code></pre>
        <p>Run inside the repo, the same <code>reproduce.py</code> executes all three levels at
        once and prints a summary of each.</p>
      </section>

      <section class="verify__level" id="limits">
        <h2>What this does not prove</h2>
        <p>A verification page that only lists what it establishes is marketing, so here is the
        other half, stated as plainly as the commands above.</p>
        <p><strong>A matching hash does not make a number correct.</strong> It proves the file you
        are reading is the file that was published and has not been edited since. If a figure was
        computed wrongly, it will hash perfectly. What defends against that is a different thing
        entirely — the <a href="/measurements">measurements</a>, each published with its own claim
        boundary, and the published
        <a href="/research/alphavintage-missing-release-correction">corrections</a> we have had to
        make against our own earlier figures.</p>
        <p><strong>A valid chain does not make the history complete.</strong> It proves that
        nothing has been altered or removed since the chain began, at
        ${escapeHtml(chain.firstDate)}. It cannot say anything about what was or was not recorded
        before that date, and it never will. That is a real limit and it does not shrink with
        time.</p>
        <p><strong>A deterministic engine is not an accurate one.</strong> The golden master proves
        the engine reproduces its own output exactly. It says nothing about whether the model of
        the market inside it is any good, which is what the research library exists to argue about
        and what the forward record exists to settle.</p>
        <p><strong>And none of it is a return.</strong> This book trades on paper. No real capital
        is deployed, nothing here is investment advice, and a verified record of a simulation is
        still a record of a simulation.</p>
      </section>

      <section class="verify__level" id="found-something">
        <h2>If something does not reproduce</h2>
        <p>Then we would want to know before you do, and we have deliberately made that easy to
        report: the failing output of <code>reproduce.py</code> is self-describing, name the file
        and the level. A published record whose only asset is that it checks out cannot ship a
        bundle that does not check out, so a genuine failure here is a defect on our side, not a
        support question.</p>
        <p><a href="/open">The glass box</a> &middot;
        <a href="/measurements">Every measurement</a> &middot;
        <a href="/research">The research library</a></p>
      </section>
    </div>
  </article>
</main>
</body>
</html>
`;

  writeFileSync(resolve(ROOT, "verify.html"), html);
  console.log(
    `rendered /verify: ${artifacts.length} hashed artifacts, ${signedPresent.length} signed ` +
      `commitments, ${chain.count} chain entries`,
  );
}

main();
