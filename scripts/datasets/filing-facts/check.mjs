// Independent checker for filing-facts items: re-derives each answer from the company record by a
// separate path (a flat index of the record's annual facts), never from the generator's code.
// An item passes only if every cited fact exists in the record with the cited value, accession,
// form and filing date, and the answer recomputes exactly from those facts.

const ANNUAL = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);

function indexRecord(record) {
  const byKey = new Map();
  const byConcept = new Map();
  for (const concept of record.concepts) {
    for (const o of concept.observations) {
      if (o.fp !== "FY" || !ANNUAL.has(o.form)) continue;
      const key = `${concept.tag}|${o.end}|${o.unit}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(o);
      if (!byConcept.has(concept.tag)) byConcept.set(concept.tag, []);
      byConcept.get(concept.tag).push(o.end);
    }
  }
  return { byKey, byConcept };
}

const close = (a, b, tol) => Math.abs(a - b) <= tol;

export function checkItem(item, record) {
  const problems = [];
  if (record.cik !== item.company.cik) problems.push("company mismatch");
  const { byKey, byConcept } = indexRecord(record);
  const cited = item.facts.map((f) => {
    const group = byKey.get(`${f.concept}|${f.end}|${f.unit}`) ?? [];
    const o = group.find((x) => x.accn === f.accn && x.form === f.form && x.filed === f.filed);
    if (!group.length) problems.push(`cited fact ${f.concept} ${f.end} not in record`);
    else if (new Set(group.map((x) => x.val)).size > 1) problems.push(`cited period ${f.concept} ${f.end} is ambiguous: its annual filings disagree`);
    else if (!o || o.val !== f.val) problems.push(`cited fact ${f.concept} ${f.end} differs from record`);
    if (!f.url.includes(f.accn.replaceAll("-", ""))) problems.push(`citation URL does not name accession ${f.accn}`);
    return o;
  });
  if (problems.length) return problems;
  const [a, b] = cited;
  const { kind, value } = item.answer;
  switch (item.template) {
    case "lookup":
      if (value !== a.val) problems.push("lookup value differs");
      break;
    case "change": {
      const [earlier, later] = a.end < b.end ? [a, b] : [b, a];
      if (!close(value, ((later.val - earlier.val) / Math.abs(earlier.val)) * 100, 0.0051)) problems.push("percent change does not recompute");
      if (!item.question.includes(earlier.end) || !item.question.includes(later.end)) problems.push("question does not name both periods");
      break;
    }
    case "ratio":
      if (a.end !== b.end || !close(value, a.val / b.val, 0.00006)) problems.push("ratio does not recompute or periods differ");
      break;
    case "net_assets":
      if (a.end !== b.end || value !== a.val - b.val) problems.push("net assets do not recompute");
      break;
    case "unanswerable": {
      const asked = item.question.match(/(?:as of|fiscal year ended) (\d{4}-\d{2}-\d{2})/)?.[1];
      const concept = item.facts[0].concept;
      if (!asked) problems.push("unanswerable question names no date");
      else if ((byConcept.get(concept) ?? []).includes(asked)) problems.push(`unanswerable item is answerable: ${concept} ${asked} is in the record`);
      if (kind !== "not_reported" || value !== null) problems.push("unanswerable answer is not not_reported");
      break;
    }
    default:
      problems.push(`unknown template ${item.template}`);
  }
  return problems;
}
