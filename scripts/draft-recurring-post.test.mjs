import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  BOUNDARY_PARAGRAPH,
  buildMonthlyDraft,
  buildWeeklyDraft,
  findRetractedViolations,
  assertNoRetractedViolations,
  parseRetractedClaims,
} from "./draft-recurring-post.mjs";

const EM_DASH = String.fromCodePoint(8212); // kept out of source as a literal on purpose

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function writeJSON(root, relPath, data) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(data, null, 2), "utf8");
}

function writeText(root, relPath, text) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, "utf8");
}

// A fixture universe with a deliberate "as of" date of 2024-01-10, driven by a
// transparency-list entry rather than any top-level generated_at, so the
// "dates derive from the artifacts" rule is actually exercised: the reporting
// window (2024-01-04 .. 2024-01-10) is computed, not hand-typed.
function buildFixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "draft-recurring-post-"));

  writeJSON(root, "public/glassbox/kill_log.json", {
    killed_count: 4,
    screen_killed_count: 11,
    survived_count: 1,
    gate_minimum_sharpe: 0.4,
    honesty_note: "fixture kill log",
  });

  writeJSON(root, "public/glassbox/trial_ledger.json", {
    immutable_execution_records: 50,
    distinct_hypothesis_identities: 40,
    generated_at: "2024-01-04T00:00:00.000000+00:00",
    recent_hypothesis_identities: [
      { hypothesis_key: "abc123", label: "widget_carry", first_recorded_at: "2024-01-07T00:00:00.000000+00:00", annualized_sharpe_observed: 0.5 },
      { hypothesis_key: "def456", label: "widget_old", first_recorded_at: "2023-11-01T00:00:00.000000+00:00", annualized_sharpe_observed: -0.2 },
    ],
  });

  writeJSON(root, "public/glassbox/transparency_log.json", {
    entry_count: 200,
    distinct_days: 20,
    first_date: "2023-12-01",
    last_date: "2024-01-09",
    entries: [
      { seq: 1, date: "2023-12-01" },
      { seq: 190, date: "2024-01-09" },
      { seq: 191, date: "2024-01-10" },
    ],
  });

  writeJSON(root, "public/glassbox/ots/anchors.json", {
    anchor_count: 10,
    bitcoin_confirmed_count: 9,
    calendar_pending_count: 1,
    head_anchor: { seq: 191, date: "2024-01-08" },
    anchors: [
      { seq: 191, date: "2024-01-08", status: "bitcoin", bitcoin_block_height: 900000 },
      { seq: 1, date: "2023-12-01", status: "bitcoin", bitcoin_block_height: 800000 },
    ],
  });

  writeJSON(root, "public/paper-state.json", {
    generated_at: "2024-01-04T00:00:00.000000+00:00",
    transparency: [
      "Research curves are simulations, not evidence.",
      `CORRECTION 2024-01-10 ${EM_DASH} the widget count was mismeasured; the old figure of 300 widgets is WITHDRAWN and replaced below.`,
      `UPDATE 2024-01-04 ${EM_DASH} the replacement pipeline is now wired into the live loop end to end.`,
      `CORRECTION 2023-12-01 ${EM_DASH} an old correction from well outside the window, should not appear.`,
    ],
    book: {
      sleeves: [
        { key: "widget", name: "Widget", standalone_sharpe: 0.4, weight: 0.5 },
        { key: "gadget", name: "Gadget", standalone_sharpe: 0.2, weight: 0.5 },
      ],
    },
  });

  writeJSON(root, "public/glassbox/program_status.json", {
    generated_at: "2024-01-04T00:00:00.000000+00:00",
    forward_record: {
      capital_kind: "PAPER_ONLY",
      go_live_date: "2023-12-01",
      first_mark: "2023-12-01",
      last_mark: "2024-01-09",
      live_days: 39,
    },
  });

  writeJSON(root, "public/api/v1/record.json", {
    generated_at: "2024-01-04T00:00:00Z",
    claim_maturity: {
      establishes: ["A short fixture paper record."],
      does_not_establish: [
        "A forward Sharpe ratio. 252 observations are required and this fixture has 12.",
        "Any funded performance whatsoever. No real capital has been deployed.",
      ],
    },
  });

  // Minimal stand-in for the real scripts/report-arrivals.mjs contract: report(base, fetchImpl, baseline) -> {lines}.
  writeText(
    root,
    "scripts/report-arrivals.mjs",
    `export async function report(base, fetchImpl, baseline) {
  const res = await fetchImpl(base + "/api/v1/validate/status");
  const body = await res.json();
  const usage = (body && body.data && body.data.usage) || {};
  const delta = Number(usage.keys_issued_today || 0) - Number(baseline.keys_issued_today || 0);
  return { lines: ["keys today " + usage.keys_issued_today + " (baseline " + baseline.keys_issued_today + ", delta " + delta + ")"] };
}
`,
  );
  writeJSON(root, "config/arrivals-baseline.json", { keys_issued_today: 5 });

  return root;
}

function buildNoChangeFixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "draft-recurring-post-nochange-"));

  writeJSON(root, "public/glassbox/kill_log.json", {
    killed_count: 4,
    screen_killed_count: 11,
    survived_count: 1,
  });

  writeJSON(root, "public/glassbox/trial_ledger.json", {
    immutable_execution_records: 50,
    distinct_hypothesis_identities: 40,
    generated_at: "2024-01-01T00:00:00.000000+00:00",
    recent_hypothesis_identities: [
      { hypothesis_key: "def456", label: "widget_old", first_recorded_at: "2023-11-01T00:00:00.000000+00:00", annualized_sharpe_observed: -0.2 },
    ],
  });

  writeJSON(root, "public/glassbox/transparency_log.json", {
    entry_count: 100,
    distinct_days: 10,
    first_date: "2023-11-01",
    last_date: "2023-12-01",
    entries: [{ seq: 1, date: "2023-11-01" }],
  });

  writeJSON(root, "public/glassbox/ots/anchors.json", {
    anchor_count: 5,
    bitcoin_confirmed_count: 5,
    calendar_pending_count: 0,
    head_anchor: { seq: 1, date: "2023-11-01" },
    anchors: [{ seq: 1, date: "2023-11-01", status: "bitcoin", bitcoin_block_height: 700000 }],
  });

  writeJSON(root, "public/paper-state.json", {
    generated_at: "2024-01-01T00:00:00.000000+00:00",
    transparency: ["Research curves are simulations, not evidence."],
    book: { sleeves: [] },
  });

  writeJSON(root, "public/glassbox/program_status.json", {
    generated_at: "2024-01-01T00:00:00.000000+00:00",
    forward_record: { capital_kind: "PAPER_ONLY", first_mark: "2023-11-01", last_mark: "2023-12-01", live_days: 30 },
  });

  return root;
}

// ---------------------------------------------------------------------------
// Weekly: changes found
// ---------------------------------------------------------------------------

test("weekly draft lists changes in the window with a citation on every numeral", async () => {
  const root = buildFixtureRoot();
  try {
    const fetchImpl = async () => ({ json: async () => ({ data: { usage: { keys_issued_today: 8 } } }) });
    const { path, content } = await buildWeeklyDraft(root, { fetchImpl, now: new Date("2024-01-15T00:00:00Z") });

    assert.match(path, /2024-01-15-what-died-this-week\.md$/);
    assert.equal(readFileSync(path, "utf8"), content);

    // The window is derived from the artifacts (2024-01-04..2024-01-10), not from `now`.
    assert.match(content, /Covering the seven days ending 2024-01-10/);

    // In-window items are listed...
    assert.match(content, /sequence 190 through 191/);
    assert.match(content, /seq 191 \(bitcoin, block 900000\)/);
    assert.match(content, /widget_carry \(recorded 2024-01-07\)/);
    assert.match(content, /CORRECTION 2024-01-10:/);
    assert.match(content, /UPDATE 2024-01-04:/);

    // ...and out-of-window items are not.
    assert.doesNotMatch(content, /2023-12-01.*CORRECTION|CORRECTION.*2023-12-01/s);
    assert.doesNotMatch(content, /widget_old/);

    // The arrivals reading was produced through the real report-arrivals.mjs contract.
    assert.match(content, /keys today 8 \(baseline 5, delta 3\)/);

    // Every line carrying a digit ends up with a citation bracket.
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line || /^#{1,6}\s/.test(line)) continue;
      if (/\d/.test(line)) assert.match(line, /\[[^[\]]*]/, `no citation bracket on: ${line}`);
    }

    assert.ok(content.includes(BOUNDARY_PARAGRAPH));
    assert.ok(content.includes("- [ ] every number above cites its artifact"));
    assert.ok(!content.includes(EM_DASH), "no em dash in weekly output");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("weekly draft with no changes in the window writes a single-line draft and stops", async () => {
  const root = buildNoChangeFixtureRoot();
  try {
    const { content } = await buildWeeklyDraft(root, { now: new Date("2024-01-02T00:00:00Z") });
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    assert.equal(lines.length, 1, `expected exactly one line, got:\n${content}`);
    assert.match(lines[0], /No changes/);
    assert.match(lines[0], /paper record/);
    assert.match(lines[0], /\[[^[\]]*]/);
    assert.ok(!content.includes(EM_DASH), "no em dash in the one-line draft");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Monthly
// ---------------------------------------------------------------------------

test("monthly draft contains the boundary paragraph and cites every numeral", () => {
  const root = buildFixtureRoot();
  try {
    const { path, content } = buildMonthlyDraft(root, { now: new Date("2024-02-03T00:00:00Z") });

    assert.match(path, /2024-02-the-record-so-far\.md$/);
    assert.ok(content.includes(BOUNDARY_PARAGRAPH), "monthly draft must end with the shared boundary paragraph");
    assert.ok(content.includes("- [ ] every number above cites its artifact"));

    // Record length, chain, anchors, sleeves, corrections and trials all appear, each cited.
    assert.match(content, /run 39 days, from 2023-12-01 to 2024-01-09/);
    assert.match(content, /holds 200 entries across 20 distinct days/);
    assert.match(content, /10 chain heads/);
    assert.match(content, /Widget, weight 0\.5/);
    assert.match(content, /2 CORRECTION entries/);
    assert.match(content, /counts 50 immutable execution records, reducing to 40/);

    // The site's own does_not_establish list is quoted verbatim.
    assert.match(content, /252 observations are required and this fixture has 12\./);

    // Regex-based numeral/citation audit over the whole rendered file, per spec.
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line || /^#{1,6}\s/.test(line)) continue;
      if (/\d/.test(line)) assert.match(line, /\[[^[\]]*]/, `no citation bracket on: ${line}`);
    }

    assert.ok(!content.includes(EM_DASH), "no em dash in monthly output");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Retracted-claims self-check
// ---------------------------------------------------------------------------

test("retracted-claims self-check refuses a bare withdrawn number and accepts it inside a retraction", () => {
  const rules = parseRetractedClaims(
    [
      "# comment lines are ignored",
      "",
      '24 :: DSR 0\\.83 :: withdraw|WITHDRAWN|CORRECTION :: ["\']gross_mean["\']\\s*:\\s*0\\.83',
    ].join("\n"),
  );
  assert.equal(rules.length, 1);
  assert.equal(rules[0].seq, "24");

  const bare = "The sleeve's DSR 0.83 proves the edge is real and durable.";
  assert.throws(() => assertNoRetractedViolations(bare, rules), /refusing to write draft/);
  assert.equal(findRetractedViolations(bare, rules).length, 1);

  const retracted = "CORRECTION: we withdraw the earlier claim that DSR 0.83 was real; the re-derived figure is 0.00.";
  assert.doesNotThrow(() => assertNoRetractedViolations(retracted, rules));
  assert.equal(findRetractedViolations(retracted, rules).length, 0);

  const exempted = 'the historical fixture legitimately contains "gross_mean": 0.83 as an unrelated field';
  // Field 2 requires the literal text "DSR 0.83", which is absent here entirely,
  // so this line is not even a candidate match; confirm no violation either way.
  assert.equal(findRetractedViolations(exempted, rules).length, 0);
});

test("the shipped config/retracted-claims.txt parses into a non-empty ruleset", () => {
  const text = readFileSync(new URL("../config/retracted-claims.txt", import.meta.url), "utf8");
  const rules = parseRetractedClaims(text);
  assert.ok(rules.length >= 10, `expected at least 10 rules, got ${rules.length}`);
  for (const rule of rules) {
    assert.ok(rule.blocked && rule.blocked.length > 0, "every rule needs a non-empty blocked pattern");
  }
});
