// Agreement between two independent annotators on the same gold packet: raw agreement and Cohen's
// kappa per judgement, and the items where they disagree (for adjudication).
//   node scripts/datasets/filing-facts/agreement.mjs <annotator-a.json> <annotator-b.json>
import { readFileSync } from "node:fs";

export const JUDGEMENTS = Object.freeze({
  question_clear: ["yes", "no"],
  answer_matches_filing: ["yes", "no", "cannot_find"],
  citation_correct: ["yes", "no"],
});

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

export function agreement(packetA, packetB) {
  const byId = new Map(packetB.labels.map((l) => [l.id, l]));
  const shared = packetA.labels.filter((l) => byId.has(l.id) && Object.keys(JUDGEMENTS).every((k) => l[k] && byId.get(l.id)[k]));
  const result = { items: shared.length, judgements: {}, disagreements: [] };
  for (const [field, allowed] of Object.entries(JUDGEMENTS)) {
    for (const l of shared) for (const who of [l, byId.get(l.id)]) if (!allowed.includes(who[field])) throw new RangeError(`${field} must be one of ${allowed.join(", ")} (item ${l.id})`);
    result.judgements[field] = cohensKappa(shared.map((l) => l[field]), shared.map((l) => byId.get(l.id)[field]));
  }
  for (const l of shared) {
    const other = byId.get(l.id);
    const fields = Object.keys(JUDGEMENTS).filter((k) => l[k] !== other[k]);
    if (fields.length) result.disagreements.push({ id: l.id, fields, a: Object.fromEntries(fields.map((k) => [k, l[k]])), b: Object.fromEntries(fields.map((k) => [k, other[k]])) });
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, "utf8")));
  console.log(JSON.stringify(agreement(a, b), null, 1));
}
