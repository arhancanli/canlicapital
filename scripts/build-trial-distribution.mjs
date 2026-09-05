// =============================================================================
// build-trial-distribution.mjs
// -----------------------------------------------------------------------------
// Publishes the distribution of first-measurement Sharpe ratios across every
// recorded trial identity, as a glass-box artifact.
//
// WHY IT IS AN ARTIFACT AND NOT A CALCULATION INSIDE THE PAGE TEMPLATE. Each
// trial page will state where its own result sits among all the others, and a
// percentile is a number a reader can see. Every visible numeral on this site
// has to trace to a published file, so the honest way to show a percentile is to
// publish the ranking it came from and let anyone recompute it. A number derived
// in a template is a number nobody can check.
//
// WHAT IT IS FOR. 224 of 228 identities carry a first measurement. Their median
// annualised Sharpe is approximately zero and about half clear zero at all --
// which is the entire argument this site makes about trial accounting, stated
// as a distribution rather than as a sentence. Each page can then place itself
// in it, and a reader can see immediately whether they are looking at a typical
// result or an outlier.
//
// The four identities with no recorded Sharpe are listed by name rather than
// dropped, because a distribution that silently excludes what it could not
// measure reports a cleaner population than the one that exists.
// =============================================================================

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKET_DIR = resolve(ROOT, "public/glassbox/trial-packets");
const GLASSBOX = resolve(ROOT, "public/glassbox");
const SUPERSESSIONS = resolve(ROOT, "public/contracts/superseded-first-measurements.json");
const OUT = resolve(ROOT, "public/glassbox/trial_sharpe_distribution.json");

// ---------------------------------------------------------------------------
// SUPERSEDED FIRST MEASUREMENTS
//
// A first measurement is immutable by design -- it is the number a trial started
// with, and rewriting it would falsify the ledger. But AlphaVintage's first
// measurement, 0.34027975..., rounds to the 0.3403 this record formally withdrew:
// the figure came from a run whose calendar handling dropped zero-exposure
// sessions, and the corrected re-run recorded a verdict of KILLED.
//
// Published bare in a ranked list, that number asserts a retracted claim, and the
// retracted-claim gate correctly refused to publish it -- which is why every
// hourly deploy was skipped and the site went stale. Deleting the entry would be
// the other kind of dishonesty: a distribution that quietly drops the trials that
// went wrong describes a tidier population than the one on disk, which is the
// exact failure this artifact's own header warns about for unmeasured identities.
//
// So the entry stays and its retraction travels with it, in the same object, one
// key away. The correction is READ from the published artifact rather than
// restated, so there is no second copy of the number to drift.
// ---------------------------------------------------------------------------
function loadSupersessions() {
  const contract = JSON.parse(readFileSync(SUPERSESSIONS, "utf8"));
  const withdrawing = new Set(contract.withdrawing_verdicts);
  if (withdrawing.size === 0) throw new Error("supersessions: no withdrawing verdict declared");
  return contract.superseded.map((entry) => {
    const artifactPath = resolve(GLASSBOX, entry.correction_artifact);
    // Fail closed. A supersession that silently does not apply is worse than none:
    // it reads as disclosure while publishing the bare claim anyway.
    let corrected;
    try {
      corrected = JSON.parse(readFileSync(artifactPath, "utf8"));
    } catch {
      throw new Error(`supersessions: ${entry.label} names a missing artifact ${entry.correction_artifact}`);
    }
    if (!withdrawing.has(corrected.verdict)) {
      throw new Error(
        `supersessions: ${entry.correction_artifact} records verdict ${corrected.verdict}, ` +
          `which is not one of ${[...withdrawing].join(", ")} -- nothing was withdrawn`,
      );
    }
    const value = corrected[entry.corrected_value_field];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`supersessions: ${entry.correction_artifact} has no ${entry.corrected_value_field}`);
    }
    return {
      label: entry.label,
      note: {
        status: "SUPERSEDED",
        verdict: corrected.verdict,
        statement:
          `This first measurement is SUPERSEDED and the figure was WITHDRAWN. ` +
          `A corrected re-run of ${entry.public_name} (${entry.label}) recorded a verdict of ` +
          `${corrected.verdict}; the correction was: ${corrected.calendar_correction ?? "see the artifact"}. ` +
          `It is retained here because a trial ledger that deletes its own mistakes is not a ledger.`,
        [`corrected_${entry.corrected_value_field}`]: value,
        correction_source: `/glassbox/${entry.correction_artifact}`,
        why: entry.why,
      },
    };
  });
}

const round = (value, places) => Number(value.toFixed(places));

function main() {
  const index = JSON.parse(readFileSync(resolve(PACKET_DIR, "index.json"), "utf8"));
  const entries = index.packets ?? index;

  const supersessions = loadSupersessions();
  const supersededByLabel = new Map(supersessions.map((s) => [s.label, s.note]));
  const applied = new Set();

  const measured = [];
  const unmeasured = [];
  for (const entry of entries) {
    const packet = JSON.parse(readFileSync(resolve(PACKET_DIR, `${entry.hypothesis_key}.json`), "utf8"));
    const sharpe = packet.immutable_first_measurement?.annualized_sharpe;
    const superseded = supersededByLabel.get(packet.label);
    if (superseded) applied.add(packet.label);
    const record = {
      hypothesis_key: packet.hypothesis_key,
      research_family_key: packet.research_family_key,
      observations: packet.immutable_first_measurement?.observations ?? null,
      ...(superseded ? { superseded } : {}),
    };
    if (typeof sharpe === "number" && Number.isFinite(sharpe)) {
      measured.push({ ...record, annualized_sharpe: sharpe });
    } else {
      unmeasured.push(record);
    }
  }
  if (measured.length === 0) throw new Error("trial distribution: no measured trial found");
  // A declared supersession that matched no packet is a silent no-op, and a silent
  // no-op here means the bare retracted figure ships. Name it and stop.
  for (const { label } of supersessions) {
    if (!applied.has(label)) {
      throw new Error(`supersessions: declared label ${label} matched no trial packet`);
    }
  }

  // Rank ascending. The percentile a page reports is the share of measured trials
  // that scored at or below it, so "84th percentile" means 84% of everything ever
  // tried here did worse -- including everything that was abandoned.
  measured.sort((a, b) => a.annualized_sharpe - b.annualized_sharpe);
  const values = measured.map((m) => m.annualized_sharpe);
  const quantile = (fraction) => values[Math.min(values.length - 1, Math.max(0, Math.round(fraction * (values.length - 1))))];

  // `superseded` is emitted immediately after the figure it retracts, deliberately.
  // The retracted-claim gate reads a window around the number, so a retraction three
  // hundred keys away in the same document would not be seen -- and a reader
  // scanning the list would not see it either. Adjacency is the requirement.
  const ranked = measured.map(({ superseded, ...trial }, position) => ({
    ...trial,
    annualized_sharpe: round(trial.annualized_sharpe, 4),
    ...(superseded ? { superseded } : {}),
    rank_ascending: position + 1,
    percentile: round(((position + 1) / measured.length) * 100, 1),
  }));

  const aboveZero = values.filter((v) => v > 0).length;
  const aboveOne = values.filter((v) => v > 1).length;

  const payload = {
    schema: "canli.trial-sharpe-distribution.v1",
    claim_boundary:
      "These are first measurements of recorded trial identities, not returns, not a portfolio, " +
      "and not evidence that any of them work. A Sharpe ratio computed once over a historical " +
      "sample is the number a trial STARTED with; the deflation for how many trials were run is " +
      "applied elsewhere and is not reflected here. A measurement later found to have " +
      "been produced by a defect is marked `superseded` in place rather than removed: " +
      "the corrected figure and the artifact recording it travel with the entry.",
    trials_superseded: supersessions.length,
    trials_total: entries.length,
    trials_measured: measured.length,
    trials_unmeasured: unmeasured.length,
    summary: {
      minimum: round(quantile(0), 4),
      p25: round(quantile(0.25), 4),
      median: round(quantile(0.5), 4),
      p75: round(quantile(0.75), 4),
      maximum: round(quantile(1), 4),
      count_above_zero: aboveZero,
      count_above_one: aboveOne,
      share_above_zero_pct: round((aboveZero / values.length) * 100, 1),
      share_above_one_pct: round((aboveOne / values.length) * 100, 1),
    },
    // Named, not dropped. A distribution that quietly excludes what it could not
    // measure describes a tidier population than the one on disk.
    unmeasured_identities: unmeasured.map((u) => u.hypothesis_key).sort(),
    ranked,
  };

  const body = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(OUT, body);
  console.log(
    `  trial distribution: ${measured.length} measured of ${entries.length}, ` +
    `median ${payload.summary.median}, ${payload.summary.share_above_zero_pct}% above zero ` +
    `(sha256 ${createHash("sha256").update(body).digest("hex").slice(0, 12)})`,
  );
}

main();
