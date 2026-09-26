// Pure logic for /annotate: the volunteer's judgements live in a plain object keyed by item id, and
// these functions turn them into the gold-packet format that scripts/datasets/filing-facts/agreement.mjs
// reads. Nothing here touches the DOM, the network or storage, so it runs under node --test.

export const JUDGEMENTS = ["question_clear", "answer_matches_filing", "citation_correct"];

// An item is complete when all three judgements are chosen; notes are optional except where the
// guidelines ask for one (a "no" or "cannot_find" should say what was found).
export function itemStatus(packet, answers, id) {
  const answer = answers[id] ?? {};
  const chosen = JUDGEMENTS.filter((key) => packet.judgements[key].includes(answer[key]));
  if (chosen.length < JUDGEMENTS.length) return "incomplete";
  const needsNote = JUDGEMENTS.some((key) => answer[key] === "no" || answer[key] === "cannot_find");
  return needsNote && !String(answer.notes ?? "").trim() ? "needs_note" : "complete";
}

export function progress(packet, answers) {
  const statuses = packet.labels.map((label) => itemStatus(packet, answers, label.id));
  return {
    total: statuses.length,
    complete: statuses.filter((status) => status === "complete").length,
    needsNote: statuses.filter((status) => status === "needs_note").length,
  };
}

// The packet with this volunteer's labels filled in: same schema, same item order, only the
// judgement and notes fields changed. Unanswered fields stay empty strings, as in the blank packet.
export function filledPacket(packet, answers, annotator) {
  return {
    ...packet,
    annotator: String(annotator ?? "").trim(),
    labels: packet.labels.map((label) => {
      const answer = answers[label.id] ?? {};
      const out = { ...label };
      for (const key of JUDGEMENTS) out[key] = packet.judgements[key].includes(answer[key]) ? answer[key] : "";
      out.notes = String(answer.notes ?? "").trim();
      return out;
    }),
  };
}

// A compact form for a GitHub comment: only answered items, only the fields that carry judgement.
export function commentBody(packet, answers, annotator) {
  const filled = filledPacket(packet, answers, annotator);
  const answered = filled.labels
    .filter((label) => JUDGEMENTS.every((key) => label[key]))
    .map(({ id, question_clear, answer_matches_filing, citation_correct, notes }) => ({ id, question_clear, answer_matches_filing, citation_correct, notes }));
  const header = `FilingFacts ${packet.schema.split(".").at(-1)} labels by ${filled.annotator || "(name not given)"}: ${answered.length} of ${packet.labels.length} items.`;
  return `${header}\n\n\`\`\`json\n${JSON.stringify({ schema: packet.schema, annotator: filled.annotator, labels: answered }, null, 1)}\n\`\`\`\n`;
}
