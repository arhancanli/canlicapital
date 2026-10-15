// Grading, by one judge model for every arm, at temperature 0.
//   A rubric (Vals): the answer passes when it states every "correctness" fact and nothing it asserts
//   contradicts the "contradiction" item, which holds the full reference answer. Vals grades on its own
//   platform; this follows the operators in its public rubrics and says so in every report.
//   A reference answer (FinanceBench): the answer passes when its result matches the reference.
// The mock judge (model "mock") matches numbers by text, for testing the runner without keys.
import { costOf } from "./prices.mjs";

const SYSTEM = "You grade answers to financial research questions. Be strict about facts and numbers and lenient about wording and format: a figure counts when it equals the expected one after rounding to the expected precision, or is the same amount in other units ($65.4 billion for $65,406 million). Judge only what the answer asserts as its result; a figure it later corrects or abandons does not count. Reply with JSON only.";

export function rubricPrompt(item, text) {
  const lines = item.rubric.map((r, i) => `${i + 1}. [${r.operator === "contradiction" ? "does not contradict" : "states"}] ${r.criteria}`);
  return `Question:\n${item.question}\n\nAnswer to grade:\n${text}\n\nRubric:\n${lines.join("\n")}\n\nFor each numbered item decide whether the answer meets it. A "states" item is met when the answer states that fact. A "does not contradict" item is met when nothing the answer asserts as its result contradicts that reference answer; leaving something out is not a contradiction.\nReply as {"items":[{"n":1,"met":true,"why":"<ten words>"}]} with one entry per item.`;
}

export function referencePrompt(item, text) {
  return `Question:\n${item.question}\n\nReference answer:\n${item.reference}\n\nAnswer to grade:\n${text}\n\nIs the answer correct? It is correct when its result matches the reference: figures equal after rounding to the reference's precision, or the same conclusion for a yes-or-no or qualitative question, even with more detail. It is incorrect when the result differs or there is no result.\nReply as {"correct":true,"why":"<ten words>"}.`;
}

// The first JSON object in a reply, fenced or not.
export function parseJson(reply) {
  const s = String(reply ?? "").replace(/```(?:json)?/gi, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

// The numbers in a text, written without separators ("65,406" -> "65406", "6.43%" -> "6.43").
const numbers = (t) => (String(t).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));

function mockGrade(item, text) {
  const has = new Set(numbers(text));
  if (!item.rubric) {
    const first = numbers(item.reference)[0];
    return { pass: first !== undefined && has.has(first), why: "mock: the reference's first number" };
  }
  const items = item.rubric.map((r, i) => ({ n: i + 1, op: r.operator, met: r.operator === "contradiction" ? !/CONTRADICT/.test(text) : numbers(r.criteria).every((n) => has.has(n)), why: "mock" }));
  return { pass: items.every((x) => x.met), met: items.filter((x) => x.met).length, of: items.length, items };
}

async function ask(client, prompt) {
  if (client.kind === "anthropic") {
    const r = await client.api.messages.create({ model: client.model, max_tokens: 3000, temperature: 0, system: SYSTEM, messages: [{ role: "user", content: prompt }] });
    const u = r.usage ?? {};
    return { text: r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"), usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0 } };
  }
  const r = await client.api.chat.completions.create({ model: client.model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }] });
  return { text: r.choices[0].message.content ?? "", usage: { input: r.usage?.prompt_tokens ?? 0, output: r.usage?.completion_tokens ?? 0 } };
}

// A verdict for one answer: { pass, met?, of?, items?, why?, judge_cost_usd, error? }. An answer the
// loop never finished fails without a call. A reply that is not the JSON asked for is asked again once.
export async function grade(client, item, text, env = process.env) {
  if (text === null || text === undefined || !String(text).trim()) return { pass: false, why: "no answer", judge_cost_usd: 0 };
  if (client.kind === "mock") return { ...mockGrade(item, text), judge_cost_usd: 0 };
  const prompt = item.rubric ? rubricPrompt(item, text) : referencePrompt(item, text);
  let spent = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text: reply, usage } = await ask(client, prompt);
    spent += costOf(client.model, usage, env);
    const j = parseJson(reply);
    if (item.rubric && Array.isArray(j?.items) && j.items.length === item.rubric.length) {
      const items = item.rubric.map((r, i) => ({ n: i + 1, op: r.operator, met: j.items[i]?.met === true, why: String(j.items[i]?.why ?? "").slice(0, 200) }));
      return { pass: items.every((x) => x.met), met: items.filter((x) => x.met).length, of: items.length, items, judge_cost_usd: Number(spent.toFixed(6)) };
    }
    if (!item.rubric && typeof j?.correct === "boolean") return { pass: j.correct, why: String(j.why ?? "").slice(0, 200), judge_cost_usd: Number(spent.toFixed(6)) };
  }
  return { pass: null, error: "the judge did not reply with the JSON asked for", judge_cost_usd: Number(spent.toFixed(6)) };
}
