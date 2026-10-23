// Annotation on Apple's replayed SEC facts: blind packets with machine labels kept apart, two
// people's filled packets, agreement and Cohen's kappa, and a gold set with a reviewer's decision.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSession } from "canli-markets-mcp/src/sources.mjs";

import { annotationAgreement, annotationGold, annotationPacket, kappa, parseCsv, toCsv } from "../src/annotate.mjs";
// SEC responses captured in the markets package's own tests, replayed: no test touches the network.
import { NOW, replayFetch } from "../../mcp-markets/test/replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });

test("CSV round trip keeps commas, quotes and line breaks; kappa is 1 for agreement and 0 at chance", () => {
  const rows = [["a", "b,c", 'say "hi"'], ["line\nbreak", "", "3"]];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
  assert.equal(kappa([["confirmed", "confirmed"], ["contradicted", "contradicted"]]).kappa, 1);
  assert.equal(kappa([["confirmed", "confirmed"], ["confirmed", "contradicted"], ["contradicted", "confirmed"], ["contradicted", "contradicted"]]).kappa, 0);
});

test("packets, agreement and gold: blind by default, the machine's labels kept for comparison", async () => {
  const out = mkdtempSync(join(tmpdir(), "canli-annot-"));
  const items = [
    { company: "AAPL", measure: "revenue", period: "fiscal 2025", value: 416.2, unit: "USD billion" },
    { company: "AAPL", measure: "revenue", period: "fiscal 2025", value: 391.0, unit: "USD billion" },
    { company: "AAPL", measure: "diluted EPS", period: "fiscal 2025", value: 7.46 },
    { company: "AAPL", measure: "net income", period: "fiscal 2031", value: 120, unit: "USD billion" },
  ];
  const p = await annotationPacket(session(), { task: "apple-check", items, out_dir: out });
  assert.equal(p.items, 4); assert.equal(p.packets.length, 2); assert.equal(p.blind, true);
  assert.deepEqual(p.machine_labels, { confirmed: 2, contradicted: 1, "not reported": 1 });
  const header = readFileSync(p.packets[0], "utf8").split("\n")[0];
  assert.ok(!/machine/.test(header), "blind packets carry no machine label");
  // Fill: annotator 1 agrees with the machine; annotator 2 differs on the EPS row.
  const fill = (file, labels) => {
    const rows = parseCsv(readFileSync(file, "utf8")), at = (n) => rows[0].indexOf(n);
    rows.slice(1).forEach((r, i) => { r[at("label")] = labels[i]; if (labels[i] === "contradicted") r[at("correct_value")] = "416.161"; });
    writeFileSync(file, toCsv(rows));
  };
  fill(p.packets[0], ["confirmed", "contradicted", "confirmed", "not_reported"]);
  fill(p.packets[1], ["confirmed", "contradicted", "cannot_find", "not_reported"]);
  const ag = annotationAgreement({ task_dir: p.task_dir });
  assert.deepEqual(ag.labelled, [4, 4]);
  assert.equal(ag.between_annotators[0].agreement, 0.75);
  assert.equal(ag.disagreements.count, 1);
  assert.equal(ag.people_vs_machine.items, 3, "the tied row has no majority");
  const open = annotationGold({ task_dir: p.task_dir });
  assert.equal(open.gold, 3); assert.equal(open.open, 1);
  const id = ag.disagreements.rows[0][0];
  const g = annotationGold({ task_dir: p.task_dir, reviews: [{ item_id: id, label: "confirmed" }] });
  assert.equal(g.gold, 4); assert.equal(g.decided_by.reviewer, 1);
  assert.equal(g.machine_agreement_on_gold, 1);
  const lines = readFileSync(g.gold_file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.find((x) => x.label === "contradicted").correct_value, 416.161);
  assert.match(g.gold_sha256, /^[0-9a-f]{64}$/);
  await assert.rejects(annotationPacket(session(), { task: "xyz" }), /Send items or items_file/);
});
