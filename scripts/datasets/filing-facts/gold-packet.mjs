// Writes a gold packet for human annotators: a stratified sample of items with their citations and
// empty judgement fields. Each annotator fills a copy independently; agreement.mjs compares two.
//   node scripts/datasets/filing-facts/gold-packet.mjs <items.jsonl> <packet.json> [--per-template 10]
import { readFileSync, writeFileSync } from "node:fs";

import { JUDGEMENTS } from "./agreement.mjs";
import { stratifiedSample } from "./eval.mjs";

export function goldPacket(items, perTemplate, seed = 20260927) {
  return {
    schema: "canli.filing-facts-gold-packet.v0",
    guidelines: "scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md",
    judgements: JUDGEMENTS,
    annotator: "",
    labels: stratifiedSample(items, perTemplate, seed).map((item) => ({
      id: item.id,
      template: item.template,
      company: item.company.name,
      question: item.question,
      answer: item.answer.kind === "not_reported" ? "not reported in the company's XBRL filings" : `${item.answer.value} ${item.answer.unit}`,
      filings: [...new Set(item.facts.map((f) => f.url))],
      question_clear: "",
      answer_matches_filing: "",
      citation_correct: "",
      notes: "",
    })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [itemsFile, out] = process.argv.slice(2);
  const i = process.argv.indexOf("--per-template");
  const items = readFileSync(itemsFile, "utf8").trim().split("\n").map(JSON.parse);
  const packet = goldPacket(items, i > 0 ? Number(process.argv[i + 1]) : 10);
  writeFileSync(out, JSON.stringify(packet, null, 1) + "\n");
  console.log(`gold packet: ${packet.labels.length} items -> ${out}`);
}
