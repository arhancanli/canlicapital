// Build /foundry from the public, fail-closed Foundry design receipt.

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
const SOURCE_NAME = "foundry_local_contract_verification.json";
const SOURCE_PATH = resolve(ROOT, "public", "glassbox", SOURCE_NAME);
const ORIGIN = "https://canlicapital.com";
const ALPHAC_COMMIT = "f03bd8f59b99cc83526c8caf582948320d411109";
const SOURCE_URL =
  `https://github.com/arhancanli/alphac/blob/${ALPHAC_COMMIT}/` +
  "artifacts/engineering/foundry_local_contract_verification.json";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const words = (value) =>
  String(value)
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

function assertReceipt(receipt) {
  const payload = { ...receipt };
  delete payload.content_hash;
  const observedHash = `sha256:${createHash("sha256").update(canonical(payload)).digest("hex")}`;
  if (observedHash !== receipt.content_hash) {
    throw new Error("foundry page: source receipt content hash does not reproduce");
  }
  if (
    receipt.schema !== "canli.foundry-local-contract-verification.v1" ||
    receipt.status !== "PASS"
  ) {
    throw new Error("foundry page: local contract receipt is absent or failing");
  }
  const expectedStatuses = {
    deployment: "PLANNED_NOT_APPLIED",
    runtime: "FROZEN_NOT_DEPLOYED",
    lifecycle: "DESIGN_FROZEN_NOT_DEPLOYED",
    acceptance: "INCOMPLETE_NOT_OPERATIONAL",
  };
  for (const [key, expected] of Object.entries(expectedStatuses)) {
    if (receipt.design_status[key] !== expected) {
      throw new Error(`foundry page: ${key} status changed to ${receipt.design_status[key]}`);
    }
  }
  if (
    receipt.acceptance.required_receipts !== 11 ||
    receipt.acceptance.public_receipts_attached !== 0 ||
    receipt.acceptance.missing_receipts.length !== 11
  ) {
    throw new Error("foundry page: acceptance receipt burden is no longer eleven missing receipts");
  }
  if (
    receipt.architecture.broker_write_access !== false ||
    receipt.architecture.execution_reachable_from_research !== false ||
    receipt.architecture.research_and_holdout_separate !== true
  ) {
    throw new Error("foundry page: network or broker isolation contract weakened");
  }
  if (
    receipt.first_migration.status !== "PREPARED_NOT_IMPORTED_OR_REPLAYED" ||
    receipt.first_migration.preserved_state !== "KILLED" ||
    receipt.first_migration.replay_status !== "NOT_RUN_IN_FOUNDRY" ||
    receipt.first_migration.network_policy !== "NONE" ||
    receipt.first_migration.max_attempts !== 1 ||
    receipt.first_migration.new_identity_spend_allowed !== false
  ) {
    throw new Error("foundry page: first migration boundary changed");
  }
}

function renderReceipt(receiptId) {
  return `<li class="foundry-receipt">
    <span aria-hidden="true"></span>
    <strong>${escapeHtml(words(receiptId))}</strong>
    <small>Missing</small>
  </li>`;
}

function renderService(service, index) {
  return `<li class="foundry-service"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(service)}</strong></li>`;
}

function main() {
  const receipt = JSON.parse(readFileSync(SOURCE_PATH, "utf8"));
  assertReceipt(receipt);
  const architecture = receipt.architecture;
  const lifecycle = receipt.lifecycle;
  const acceptance = receipt.acceptance;
  const migration = receipt.first_migration;
  const shortHash = receipt.content_hash.replace("sha256:", "").slice(0, 16);
  const description =
    "Inspect the fail-closed ALPHAC Foundry design, its research-to-execution isolation, " +
    "bounded trial lifecycle and eleven still-missing deployment receipts.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "ALPHAC Foundry design status",
    url: `${ORIGIN}/foundry`,
    description,
    author: { "@id": `${ORIGIN}/#arhan-canli` },
    about: {
      "@type": "SoftwareSourceCode",
      name: "ALPHAC Foundry",
      codeRepository: "https://github.com/arhancanli/alphac",
      programmingLanguage: ["Python", "SQL", "HCL"],
      creator: { "@id": `${ORIGIN}/#arhan-canli` },
    },
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ALPHAC Foundry design status | Canli Capital</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${ORIGIN}/foundry" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${SOURCE_NAME}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="ALPHAC Foundry design status" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${ORIGIN}/foundry" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="ALPHAC Foundry design status" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/foundry.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="foundry-page">
<a class="foundry-skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "" })}
<main id="content">
  <section class="foundry-hero" aria-labelledby="foundry-title">
    <div class="foundry-hero__copy">
      <p class="foundry-kicker">ALPHAC Foundry / design status</p>
      <h1 id="foundry-title">A research engine that is not allowed to trade.</h1>
      <p>Foundry is the bounded research system behind future ALPHAC trials. Its contracts pass local verification. Its DigitalOcean deployment does not exist yet, and none of the eleven operational receipts is attached.</p>
      <div class="foundry-actions">
        <a class="foundry-button foundry-button--primary" href="#air-gap">Inspect the isolation boundary</a>
        <a class="foundry-button" href="${SOURCE_URL}" rel="noreferrer">Read the exact receipt <span aria-hidden="true">↗</span></a>
      </div>
    </div>
    <aside class="foundry-verdict" aria-label="Current Foundry status">
      <span>Current verdict</span>
      <strong>Not operational</strong>
      <dl>
        <div><dt>Local contracts</dt><dd>${receipt.status}</dd></div>
        <div><dt>Cloud deployment</dt><dd>Planned, not applied</dd></div>
        <div><dt>Acceptance receipts</dt><dd>${acceptance.public_receipts_attached} / ${acceptance.required_receipts}</dd></div>
        <div><dt>First migration</dt><dd>Not run in Foundry</dd></div>
      </dl>
      <code>receipt ${shortHash}...</code>
    </aside>
  </section>

  <section class="foundry-boundary" aria-label="Foundry claim boundary">
    <span>Claim boundary</span>
    <p>${escapeHtml(receipt.claim_boundary)}</p>
  </section>

  <section class="foundry-section foundry-airgap" id="air-gap" aria-labelledby="airgap-title">
    <header class="foundry-section__head">
      <p class="foundry-kicker">The air-gap ledger</p>
      <h2 id="airgap-title">Research can publish evidence. It cannot reach execution.</h2>
      <p>The contract separates research, holdout and broker execution. The only outward path shown here is sanitized public evidence.</p>
    </header>
    <div class="foundry-network" role="img" aria-label="Research services flow through a sanitizer to the public record while the execution network remains unreachable">
      <div class="foundry-network__research">
        <div class="foundry-network__label"><span>Research network</span><strong>${architecture.provider} target</strong><small>Not provisioned</small></div>
        <ol>${architecture.research_services.map(renderService).join("\n")}</ol>
      </div>
      <div class="foundry-network__sanitizer"><span>Allowlist</span><strong>Sanitizer</strong><small>Public fields only</small></div>
      <div class="foundry-network__public"><span>Output</span><strong>Public evidence</strong><small>Read only</small></div>
      <div class="foundry-network__gap"><span>Denied by contract</span><i aria-hidden="true"></i></div>
      <div class="foundry-network__execution"><span>Separate system</span><strong>ALPHAC execution</strong><small>No broker write access from Foundry</small></div>
    </div>
  </section>

  <section class="foundry-section foundry-lifecycle" aria-labelledby="lifecycle-title">
    <header class="foundry-section__head">
      <p class="foundry-kicker">Bounded lifecycle</p>
      <h2 id="lifecycle-title">The identity is spent before the outcome is visible.</h2>
    </header>
    <dl class="foundry-figures">
      <div><dt>Declared states</dt><dd>${lifecycle.states}</dd><small>From feasibility to terminal verdict</small></div>
      <div><dt>Allowed transitions</dt><dd>${lifecycle.transitions}</dd><small>Every transition names its authority</small></div>
      <div><dt>Holdout consumption</dt><dd>${lifecycle.holdout_max_consumptions_per_identity}</dd><small>Maximum per identity</small></div>
      <div><dt>Human gate override</dt><dd>${lifecycle.gate_failure_can_be_overridden ? "Allowed" : "Forbidden"}</dd><small>A failed gate stays failed</small></div>
    </dl>
    <p class="foundry-rule">A model can propose code. A human must approve outcome-bearing work. No state in the lifecycle grants broker write access.</p>
  </section>

  <section class="foundry-section foundry-migration" aria-labelledby="migration-title">
    <div class="foundry-migration__copy">
      <p class="foundry-kicker">First migration / frozen target</p>
      <h2 id="migration-title">Start with a failure, then prove the system keeps it failed.</h2>
      <p>The first selected migration is an existing killed petroleum-inventory trial. It cannot spend another identity, use the network, reopen the result or take a second replay attempt.</p>
      <a href="/trials/${escapeHtml(migration.historical_identity_key)}">Open the historical trial packet</a>
    </div>
    <dl class="foundry-migration__ledger">
      <div><dt>Public trial</dt><dd><code>${escapeHtml(migration.public_trial_id)}</code></dd></div>
      <div><dt>Preserved state</dt><dd>${escapeHtml(words(migration.preserved_state))}</dd></div>
      <div><dt>Foundry replay</dt><dd>Not run</dd></div>
      <div><dt>Network policy</dt><dd>${escapeHtml(migration.network_policy)}</dd></div>
      <div><dt>Maximum attempts</dt><dd>${migration.max_attempts}</dd></div>
      <div><dt>New identity spend</dt><dd>${migration.new_identity_spend_allowed ? "Allowed" : "Forbidden"}</dd></div>
    </dl>
  </section>

  <section class="foundry-section foundry-acceptance" aria-labelledby="acceptance-title">
    <header class="foundry-section__head">
      <p class="foundry-kicker">Operational burden</p>
      <h2 id="acceptance-title">Eleven receipts stand between source code and an operational claim.</h2>
      <p>Every item must bind to the same infrastructure, source commit, image digest and contract set. A partial deployment stays not operational.</p>
    </header>
    <div class="foundry-acceptance__status"><span>Attached</span><strong>${acceptance.public_receipts_attached} of ${acceptance.required_receipts}</strong><small>${escapeHtml(words(acceptance.current_status))}</small></div>
    <ol class="foundry-receipts">${acceptance.missing_receipts.map(renderReceipt).join("\n")}</ol>
  </section>

  <section class="foundry-section foundry-source" aria-labelledby="source-title">
    <div>
      <p class="foundry-kicker">Machine-verifiable source</p>
      <h2 id="source-title">Local verification is evidence of the contracts. Nothing more.</h2>
      <p>The receipt hashes the deployment manifest, runtime contract, lifecycle, acceptance contract and migration packet. Its PASS does not convert any missing cloud receipt into evidence.</p>
    </div>
    <pre tabindex="0" aria-label="Foundry receipt verification command"><code>curl -sO ${ORIGIN}/glassbox/${SOURCE_NAME}
python3 - &lt;&lt;'PY'
import hashlib, json
p=json.load(open('${SOURCE_NAME}'))
h=p.pop('content_hash')
s=json.dumps(p,sort_keys=True,separators=(',',':')).encode('ascii')
print(h == 'sha256:' + hashlib.sha256(s).hexdigest())
PY</code></pre>
  </section>

  <section class="foundry-section foundry-close" aria-labelledby="close-title">
    <p class="foundry-kicker">The next proof</p>
    <h2 id="close-title">The page changes only when the receipts do.</h2>
    <p>Provisioning requires a reviewed plan, a dedicated DigitalOcean principal and a separate billable apply decision. Until then, Foundry remains a verified design and an unproven deployment.</p>
    <div class="foundry-actions"><a class="foundry-button foundry-button--primary" href="/methodology">Read the research rules</a><a class="foundry-button" href="/review">Review ALPHAC research</a></div>
  </section>
</main>
${renderProductShellFooter()}
</body>
</html>`;

  if (html.includes(String.fromCodePoint(0x2014))) {
    throw new Error("foundry page: rendered copy contains an em dash");
  }
  writeFileSync(resolve(ROOT, "foundry.html"), html);
  console.log(
    `rendered /foundry: ${lifecycle.states} states, ${lifecycle.transitions} transitions, ` +
      `${acceptance.public_receipts_attached}/${acceptance.required_receipts} receipts`,
  );
}

main();
