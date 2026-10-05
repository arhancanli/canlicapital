// Where each static page's date comes from: build-papers.mjs dates the sitemap's <lastmod> from these
// files, and a generator that states dateModified in its structured data reads the same list, so the
// two can never disagree. Moved here from build-papers.mjs unchanged on 2026-09-28.
import { resolveLastmod } from "../lastmod.mjs";
import { EXECUTION_SOURCE_PATHS } from './execution-workflow.mjs';

// =============================================================================
// LASTMOD SOURCES for every STATIC_ROUTES page.
// -----------------------------------------------------------------------------
// Five of these (/, /systems, /performance, /progress, /open) are hand-authored
// HTML edited directly: their lastmod is the git commit date of that file.
//
// Every other page here is fully OVERWRITTEN on each build by a generator script
// (verified by inspection: none of them sentinel-inject into a hand file the way
// build-papers.mjs does with research.html). Its content therefore changes only
// when (a) the generator script itself is edited, or (b) one of the data files it
// reads as input changes. Both are captured by git commit date.
//
// DELIBERATE CHOICE: for these generated pages we read the git commit date of each
// input file, never a live `generated_at` field written INTO that file. Several of
// these inputs (cost_coverage.json, engineering_open_source.json, public/api/v1/*)
// are themselves regenerated on every build and self-stamp `generated_at:
// new Date().toISOString()` -- trusting that field here would silently reintroduce
// the exact bug this module exists to fix (every dependent page moving on every
// build). A file's git commit date only advances when it is actually committed, so
// it stays stable across repeated builds of the same tree, which is the property
// under test.
// =============================================================================
export const PAGE_SOURCES = {
  "/": ["index.html", "config/home-answers.json", "scripts/build-home-answers.mjs", "scripts/build-hero-fallbacks.mjs", "scripts/lib/paper-curve-controls.mjs"],
  "/systems": ["systems.html"],
  "/performance": ["performance.html"],
  "/progress": ["progress.html"],
  "/open": ["open.html"],
  // "/research" and "/measurements" and "/trials" and "/notes" are hub indexes whose lastmod is
  // computed as max(their own generator, every member page's lastmod) further down, once member
  // lastmods are known.
  "/research": ["research.html", "scripts/build-papers.mjs"],
  "/measurements": ["scripts/build-measurements.mjs"],
  "/trials": ["scripts/build-trials.mjs", "public/glassbox/trial_sharpe_distribution.json"],
  "/notes": ["scripts/build-notes.mjs"],
  "/verify": ["scripts/build-verify.mjs", "public/glassbox"],
  "/review": [
    "scripts/build-review.mjs",
    "public/glassbox/external_submission_plan.json",
    "public/glassbox/stanford_cs_evidence_map.json",
  ],
  "/foundry": ["scripts/build-foundry.mjs", "public/glassbox/foundry_local_contract_verification.json"],
  "/founder": [
    "scripts/build-founder.mjs",
    "public/glassbox/kill_log.json",
    "public/glassbox/trial_ledger.json",
    "public/glassbox/transparency_log.json",
    "public/glassbox/founder_commitment.json",
    "public/glassbox/track_record.json",
    "public/glassbox/stanford_cs_evidence_map.json",
    "research",
    "measurements",
  ],
  "/methodology": [
    "scripts/build-methodology.mjs",
    "public/glassbox/kill_log.json",
    "public/glassbox/trial_ledger.json",
    "public/glassbox/transparency_log.json",
    "public/glassbox/legacy_dsr_restatement.json",
    "public/glassbox/track_record.json",
    "public/glassbox/sleeve_admission_contract.json",
    "research",
    "measurements",
  ],
  "/contributors": ["scripts/build-contributors.mjs", "scripts/lib/contributors.mjs", "config/contributor-program.json"],
  "/engineering": ["scripts/build-engineering.mjs", "public/glassbox/engineering_open_source.json"],
  "/how-to-validate-a-backtest": ["scripts/build-how-to-validate-a-backtest.mjs"],
  "/annotate": ["scripts/build-annotate.mjs", "js/annotate.js", "js/annotate-core.js", "js/filing-facts-packet.js", "scripts/canonical-json.mjs", "public/datasets/filing-facts/v0/gold-packet-v0.json"],
  "/developers": [
    // Owned by another generator (scripts/build-standards-and-developers.mjs) this fix does not
    // edit; listed here only so /developers gets a real content date instead of the build date.
    "scripts/build-standards-and-developers.mjs",
    "standards/paper-evidence/vectors/manifest.json",
    "standards/paper-evidence/schema.json",
    "public/glassbox/paper_evidence_conformance.json",
    "public/api/v1/index.json",
    "public/api/v1/openapi.json",
    "mcp-released/fundamentals/package.json",
    "mcp-released/fundamentals/server.json",
    "mcp-released/fundamentals/src/server.mjs",
    "mcp-released/research/package.json",
    "mcp-released/research/server.json",
    "mcp-released/research/src/server.mjs",
  ],
  ...Object.fromEntries(['', '/validation', '/fundamentals', '/research'].map(suffix => [`/mcp-servers${suffix}`, [
    'scripts/build-mcp-pages.mjs', 'config/mcp-discovery.json', 'config/mcp-hosted-releases.json',
    ...(suffix ? [`mcp-released${suffix}`] : ['mcp-released']),
  ]])),
  "/mcp-servers/execution": [
    "scripts/build-mcp-pages.mjs", "scripts/lib/execution-workflow.mjs",
    "config/execution-workflow-source.json", ...EXECUTION_SOURCE_PATHS,
  ],
  "/costs": ["scripts/build-cost-coverage.mjs"],
  "/standards/paper-evidence": [
    "scripts/build-standards-and-developers.mjs",
    "scripts/build-paper-evidence.mjs",
    "standards/paper-evidence/schema.json",
    "contracts/public-claims.registry.json",
    "public/paper-state.json",
    "public/glassbox/alpaca_broker_reconciliation.json",
    "public/glassbox/cost_coverage.json",
  ],
  "/tools/deflated-sharpe": [
    "scripts/build-dsr-tool.mjs",
    "public/glassbox/deflated_sharpe_calculator_contract.json",
    "public/glassbox/trial_ledger.json",
  ],
  "/tools/evidence-chain": [
    "scripts/build-evidence-chain-tool.mjs",
    "public/glassbox/transparency_log.json",
    "public/glassbox/ots/anchors.json",
    "public/glassbox/verify_transparency.py",
  ],
  "/tools/trial-accounting": [
    "scripts/build-trial-accounting-tool.mjs",
    "public/glassbox/trial_ledger.json",
    "public/glassbox/trial_packet_manifest.json",
    "public/glassbox/trial-packets/index.json",
    "public/glassbox/prospective_trial_record.json",
  ],
  "/tools/selection-risk": ["scripts/build-selection-risk.mjs", "public/glassbox/selection_risk_lab_contract.json"],
  "/tools/breadth": [
    "scripts/build-breadth.mjs",
    "public/glassbox/breadth_lab_contract.json",
    "contracts/public-claims.registry.json",
  ],
  "/tools/execution": ["scripts/build-execution.mjs", "public/glassbox/execution_lab_contract.json"],
  "/tools/backtest-overfitting": ["scripts/build-backtest-overfitting-tool.mjs", "standards/validation-api/vectors.json"],
  "/tools": ["scripts/build-tools-hub.mjs"],
};

// Every editable static route also receives these shared markup transforms.
// Their committed content dates survive generated input timestamps changing in
// a Git-free build, and keep the page's structured date and sitemap aligned.
export const SHARED_PAGE_SOURCES = [
  'scripts/product-shell.mjs',
  'scripts/build-site-design.mjs',
  'scripts/lib/contributors.mjs',
  'config/contributor-program.json',
  'css/product-shell.css', 'css/design-system.css', 'css/story.css', 'css/film.css', 'js/site-motion.js', 'js/evidence-film.js',
  'public/og.png', 'public/favicon.svg', 'public/favicon.ico',
];
for (const files of Object.values(PAGE_SOURCES)) files.push(...SHARED_PAGE_SOURCES);

/**
 * The date a static route's sources last changed, the same as its sitemap <lastmod>; null when no
 * source can be dated (never the build date, which would be an invented dateModified).
 */
export function sourceDate(root, path) {
  const files = PAGE_SOURCES[path];
  if (!files) throw new Error(`no lastmod source declared for static route "${path}" in PAGE_SOURCES`);
  let fellBack = false;
  const date = resolveLastmod({ root, files, buildDate: null, onFallback: () => { fellBack = true; } });
  return fellBack ? null : date;
}
