// Agreement between two independent annotators on the same gold packet: raw agreement and Cohen's
// kappa per judgement, and the items where they disagree (for adjudication).
//   node scripts/datasets/filing-facts/agreement.mjs <annotator-a.json> <annotator-b.json> [gold.json]
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { canonicalJson } from "./canonical-json.mjs";
import { packetContent } from "./filing-facts-packet.mjs";

export const JUDGEMENTS = Object.freeze({
  question_clear: ["yes", "no"],
  answer_matches_filing: ["yes", "no", "cannot_find"],
  citation_correct: ["yes", "no"],
});

const ITEM_FIELDS = ["id", "template", "company", "question", "answer", "filings"];
const name = (packet) => (packet?.annotator ?? "").trim();
export const identity = (value) => value.trim().normalize("NFKC").toLowerCase();

/** Bind reviews to the immutable questions, answers and citations, not to editable judgements. */
export function packetDigest(packet) {
  return createHash("sha256").update(packetContent(packet)).digest("hex");
}

export function indexPacket(packet, who, gold) {
  if (packet?.schema !== "canli.filing-facts-gold-packet.v0" || !Array.isArray(packet.labels)) {
    throw new RangeError(`${who}: expected a filing-facts gold packet with a labels array`);
  }
  if (packet.annotator !== undefined && typeof packet.annotator !== "string") throw new RangeError(`${who}: annotator must be a string`);
  const index = new Map();
  for (const label of packet.labels) {
    if (!label || typeof label.id !== "string" || !label.id.trim()) throw new RangeError(`${who}: each item needs a non-empty id`);
    if (index.has(label.id)) throw new RangeError(`${who}: duplicate item ${label.id}`);
    if (gold && !gold.has(label.id)) throw new RangeError(`${who}: unknown gold item ${label.id}`);
    if (label.notes !== undefined && typeof label.notes !== "string") throw new RangeError(`${who}: notes must be a string (item ${label.id})`);
    for (const [field, allowed] of Object.entries(JUDGEMENTS)) {
      if (label[field] !== undefined && label[field] !== "" && !allowed.includes(label[field])) {
        throw new RangeError(`${field} must be one of ${allowed.join(", ")} (item ${label.id}, ${who})`);
      }
    }
    if (gold) {
      for (const key of ITEM_FIELDS) {
        if (label[key] !== undefined && (gold.get(label.id)[key] === undefined || canonicalJson(label[key]) !== canonicalJson(gold.get(label.id)[key]))) {
          throw new RangeError(`${who}: ${key} changed on gold item ${label.id}`);
        }
      }
    }
    index.set(label.id, label);
  }
  return index;
}

export function missingJudgements(label) {
  if (!label) return ["item"];
  const missing = Object.keys(JUDGEMENTS).filter((field) => !JUDGEMENTS[field].includes(label[field]));
  if (Object.keys(JUDGEMENTS).some((field) => label[field] === "no" || label[field] === "cannot_find") && !String(label.notes ?? "").trim()) missing.push("notes");
  return missing;
}

// Cohen's kappa for two raters over the same items: (p_o - p_e) / (1 - p_e), where p_e is the
// agreement expected from each rater's own label frequencies. Undefined (null) when p_e is 1,
// i.e. both raters used one identical label for every item.
export function cohensKappa(a, b) {
  if (a.length !== b.length || !a.length) throw new RangeError("Both raters must label the same, non-empty list of items");
  const n = a.length;
  const labels = [...new Set([...a, ...b])];
  const po = a.filter((x, i) => x === b[i]).length / n;
  const pe = labels.reduce((sum, l) => sum + (a.filter((x) => x === l).length / n) * (b.filter((x) => x === l).length / n), 0);
  return { n, observed: po, expected: pe, kappa: pe === 1 ? null : (po - pe) / (1 - pe) };
}

export function agreement(packetA, packetB, goldPacket) {
  const gold = goldPacket ? indexPacket(goldPacket, "gold") : null;
  const a = indexPacket(packetA, "annotator A", gold);
  const b = indexPacket(packetB, "annotator B", gold);
  const names = [name(packetA), name(packetB)];
  if (names.every(Boolean) && identity(names[0]) === identity(names[1])) throw new RangeError("two independent annotators need distinct identities");
  const digest = goldPacket ? packetDigest(goldPacket) : null;
  for (const packet of [packetA, packetB]) {
    if (digest && packet.packet_sha256 !== undefined && packet.packet_sha256 !== digest) throw new RangeError("review packet digest does not match the gold packet");
  }
  const ids = gold ? [...gold.keys()] : [...new Set([...a.keys(), ...b.keys()])];
  const complete = (index) => ids.filter((id) => !missingJudgements(index.get(id)).length);
  const shared = ids.filter((id) => !missingJudgements(a.get(id)).length && !missingJudgements(b.get(id)).length);
  const result = {
    items: shared.length,
    packet_sha256: digest,
    annotators: names,
    independent_identities_declared: names.every(Boolean) ? true : null,
    coverage: {
      basis: gold ? "canonical_gold_packet" : "union_of_submitted_ids",
      expected: ids.length,
      complete_a: complete(a).length,
      complete_b: complete(b).length,
      complete_pairs: shared.length,
      incomplete: ids.flatMap((id) => [a, b].flatMap((index, i) => {
        const fields = missingJudgements(index.get(id));
        return fields.length ? [{ id, annotator: i === 0 ? "a" : "b", fields }] : [];
      })),
    },
    judgements: {}, disagreements: [],
    limits: ["Agreement is computed only on complete pairs; coverage is reported separately.", "Annotator identities are self-declared; agreement alone is not human or expert verification."],
  };
  for (const field of Object.keys(JUDGEMENTS)) {
    result.judgements[field] = shared.length ? cohensKappa(shared.map((id) => a.get(id)[field]), shared.map((id) => b.get(id)[field])) : null;
  }
  for (const id of shared) {
    const l = a.get(id);
    const other = b.get(id);
    const fields = Object.keys(JUDGEMENTS).filter((k) => l[k] !== other[k]);
    if (fields.length) result.disagreements.push({ id, fields, a: Object.fromEntries(fields.map((k) => [k, l[k]])), b: Object.fromEntries(fields.map((k) => [k, other[k]])) });
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [a, b, gold] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, "utf8")));
  console.log(JSON.stringify(agreement(a, b, gold), null, 1));
}
