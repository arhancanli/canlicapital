// The fresh-filings test, week by week: from each FilingFacts weekly set and its scored runs
// (public/datasets/filing-facts/weekly/<week>/), the figures the site prints, in one published file that
// the numbers audit traces them to. Each week's questions come from annual reports filed that week, so no
// model's training data holds the answers.
//   node scripts/build-fresh-filings.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEEKLY = "public/datasets/filing-facts/weekly";
export const OUTPUT = "public/benchmarks/fresh-filings.json";
// The question each week's page shows first, chosen by hand: a company most readers know, answered right
// with the server and not by the model alone. buildFreshFilings refuses one that is not.
export const EXAMPLES = Object.freeze({ "2026-W44": "6adaae947a921109" });

const read = (path) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
const lastLine = (text) => String(text ?? "").trim().split(/\r?\n/).reverse().find((line) => line.trim()) ?? null;

function run(week, day, file) {
  const e = read(`${WEEKLY}/${week}/runs/${day}/${file}`);
  const server = e.capture.tool_contract?.server_info ?? null;
  const rows = e.runs;
  const correct = rows.filter((r) => r.correct).length;
  const wrong = rows.filter((r) => typeof r.parsed === "number" && !r.correct).length;
  return {
    date: day,
    file: `/datasets/filing-facts/weekly/${week}/runs/${day}/${file}`,
    model: e.capture.model,
    per_kind: e.capture.sampling?.per_template ?? null,
    with: server ? { name: server.name, version: server.version } : null,
    questions: rows.length,
    correct,
    wrong_numbers: wrong,
    no_number: rows.length - correct - wrong,
    stopped_at_turn_limit: rows.filter((r) => r.error === "No final response within the six-turn limit").length,
    mean_tokens: Math.round(e.summary.mean_tokens),
    tool_calls: rows.reduce((sum, r) => sum + (r.tool_calls ?? 0), 0),
  };
}

export function weekSummary(week) {
  const dir = `${WEEKLY}/${week}`;
  const manifest = read(`${dir}/manifest.json`);
  const items = readFileSync(resolve(ROOT, `${dir}/items.jsonl`), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const runs = readdirSync(resolve(ROOT, `${dir}/runs`)).sort().flatMap((day) =>
    readdirSync(resolve(ROOT, `${dir}/runs/${day}`)).filter((f) => f.endsWith(".json")).sort().map((f) => run(week, day, f)));
  const out = {
    week, from: manifest.window.start, to: manifest.window.end,
    annual_reports: manifest.annual_filers, companies: manifest.companies.length, questions: items.length, forms: manifest.forms,
    set: `/datasets/filing-facts/weekly/${week}/items.jsonl`, manifest: `/datasets/filing-facts/weekly/${week}/manifest.json`,
    runs,
  };
  const id = EXAMPLES[week];
  if (id) {
    const item = items.find((i) => i.id === id);
    const answers = runs.map((r) => {
      const row = read(`public${r.file}`).runs.find((x) => x.id === id);
      return { with: r.with, model: r.model, said: lastLine(row?.response_text)?.replace(/^ANSWER:\s*/i, "") ?? null, correct: Boolean(row?.correct) };
    });
    if (!item || !answers.some((a) => a.with && a.correct) || !answers.some((a) => !a.with && !a.correct)) throw new Error(`${week}: example ${id} is not a question the server got right and the model alone did not`);
    const fact = item.facts[0];
    out.example = {
      id, company: item.company.name.replace(/ /g, " "), question: item.question.replace(/ /g, " "),
      filed: { value: item.answer.value, unit: item.answer.unit, form: fact.form, date: fact.filed, accession: fact.accn, url: fact.url },
      answers,
    };
  }
  return out;
}

export function buildFreshFilings() {
  const weeks = readdirSync(resolve(ROOT, WEEKLY)).filter((w) => /^\d{4}-W\d{2}$/.test(w)).sort().reverse();
  return {
    schema: "canli.fresh-filings.v1",
    about: "Each week, questions from the annual reports filed that week, answered by a model alone and with an MCP server; scored by scripts/datasets/filing-facts/eval.mjs against the filed figures.",
    weeks: weeks.map(weekSummary),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(resolve(ROOT, OUTPUT), `${JSON.stringify(buildFreshFilings(), null, 1)}\n`);
  console.log(`${OUTPUT} written`);
}
