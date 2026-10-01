// Export the gold items with complete independent reviews and an explicit final source decision.
// No networking, label generation or automatic claim of verified expertise.
//   node scripts/datasets/filing-facts/adjudicate.mjs gold.json a.json b.json decisions.json > reviewed.json
import { readFileSync } from "node:fs";

import { agreement, identity, indexPacket, missingJudgements } from "./agreement.mjs";

export function adjudicateGold(gold, packetA, packetB, review) {
  const compared = agreement(packetA, packetB, gold);
  if (!compared.annotators.every(Boolean)) throw new RangeError("gold export needs two named independent annotators");
  if (review?.schema !== "canli.filing-facts-adjudication.v1" || typeof review.adjudicator !== "string" || !review.adjudicator.trim() || !Array.isArray(review.decisions)) {
    throw new RangeError("expected canli.filing-facts-adjudication.v1 with a named adjudicator and decisions array");
  }
  const adjudicator = review.adjudicator.trim();
  if (compared.annotators.some((who) => identity(who) === identity(adjudicator))) throw new RangeError("the adjudicator must be distinct from both annotators");
  if (review.packet_sha256 !== compared.packet_sha256) throw new RangeError("adjudication packet_sha256 must match the canonical gold packet");
  const goldIndex = indexPacket(gold, "gold");
  const a = indexPacket(packetA, "annotator A", goldIndex);
  const b = indexPacket(packetB, "annotator B", goldIndex);
  const decisions = new Map();
  for (const decision of review.decisions) {
    if (!decision || !goldIndex.has(decision.id)) throw new RangeError("adjudication names an unknown gold item");
    if (decisions.has(decision.id)) throw new RangeError(`duplicate adjudication for ${decision.id}`);
    if (!["accept", "reject"].includes(decision.verdict)) throw new RangeError(`invalid adjudication verdict for ${decision.id}`);
    if (typeof decision.notes !== "string" || !decision.notes.trim()) throw new RangeError(`adjudication needs source notes for ${decision.id}`);
    if (!Array.isArray(decision.evidence) || !decision.evidence.length) throw new RangeError(`adjudication needs filing evidence for ${decision.id}`);
    for (const cite of decision.evidence) {
      let url;
      try { url = new URL(cite.url); } catch { throw new RangeError(`invalid filing evidence for ${decision.id}`); }
      const cited = goldIndex.get(decision.id).filings.some((folder) => {
        const source = new URL(folder);
        return url.protocol === "https:" && url.origin === source.origin && url.pathname.startsWith(source.pathname.endsWith("/") ? source.pathname : source.pathname + "/");
      });
      if (!cited || typeof cite.locator !== "string" || !cite.locator.trim()) throw new RangeError(`evidence must name a cited filing and a document/table locator for ${decision.id}`);
    }
    decisions.set(decision.id, decision);
  }
  const items = [];
  const pending = [];
  const rejected = [];
  for (const label of gold.labels) {
    const missing = [a, b].flatMap((index, i) => {
      const fields = missingJudgements(index.get(label.id));
      return fields.length ? [{ annotator: compared.annotators[i], fields }] : [];
    });
    const decision = decisions.get(label.id);
    if (missing.length || !decision) {
      pending.push({ id: label.id, missing_reviews: missing, adjudication_missing: !decision });
    } else if (decision.verdict === "reject") {
      rejected.push({ id: label.id, notes: decision.notes, evidence: decision.evidence });
    } else {
      items.push({
        ...Object.fromEntries(["id", "template", "company", "question", "answer", "filings"].map((key) => [key, label[key]])),
        review: { annotators: compared.annotators, submissions: [a, b].map((index, i) => ({
          annotator: compared.annotators[i],
          judgements: Object.fromEntries(["question_clear", "answer_matches_filing", "citation_correct"].map((key) => [key, index.get(label.id)[key]])),
          notes: index.get(label.id).notes ?? "",
        })), adjudicator, notes: decision.notes, evidence: decision.evidence },
      });
    }
  }
  return {
    schema: "canli.filing-facts-reviewed-gold.v1",
    packet_sha256: compared.packet_sha256,
    counts: { expected: gold.labels.length, accepted: items.length, rejected: rejected.length, pending: pending.length },
    agreement: compared, items, rejected, pending,
    limits: ["This export records submitted human-review claims; it does not authenticate the reviewers or establish expert credentials.", "Incomplete pairs and items without an explicit source-backed adjudication cannot enter the gold set."],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (files.length !== 4) throw new RangeError("usage: adjudicate.mjs gold.json a.json b.json decisions.json");
  console.log(JSON.stringify(adjudicateGold(...files.map((file) => JSON.parse(readFileSync(file, "utf8")))), null, 1));
}
