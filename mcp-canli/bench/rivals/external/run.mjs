// Phase 5 proof runner: one question set, one model, the arms asked for, one judge. Every question is
// answered with the same prompt, turn limit and tool-result cap; a JSON line per answer goes to
// results/<set>.jsonl (a rerun skips what is done) and the dollars spent to results/spend.json, which
// the budget guard reads before every question. It never prints a question: only ids and types.
//   node external/run.mjs --set vals --model claude-sonnet-5-5 --arms none,canli --judge claude-sonnet-5-5 --budget-usd 40
//   node external/run.mjs --set dev --model mock --judge mock --arms none,canli      (no keys, no spend)
// Options: --reps N, --limit N, --ids a,b, --types "Beat or Miss,Trends", --max-turns 50,
// --max-question-usd 3, --out DIR. Exit 3: out of credit; exit 4: budget reached.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { answer, closeArm, connectArm, modelClient } from "./agent.mjs";
import { loadSet, SOURCES } from "./datasets.mjs";
import { grade } from "./judge.mjs";

const outOfCredit = (err) => /no credits remaining|insufficient_quota|exceeded your current quota|credit balance is too low/i.test(`${err?.code ?? ""} ${err?.message ?? ""}`);

// Which code the canli arms ran: canli-mcp's commit and the canli-markets-mcp it links to.
function codeVersions() {
  const head = (dir) => { try { return execFileSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
  const version = (pkg) => { try { return JSON.parse(readFileSync(new URL(`../../../node_modules/${pkg}/package.json`, import.meta.url), "utf8")).version; } catch { return null; } };
  return { canli_mcp: head(fileURLToPath(new URL("../../..", import.meta.url))), markets: version("canli-markets-mcp") };
}

export function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) o[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? "true" : argv[++i];
  return {
    set: o.set ?? "dev", model: o.model ?? "mock", judge: o.judge ?? o.model ?? "mock",
    arms: (o.arms ?? "none").split(","), reps: Number(o.reps ?? 1), limit: o.limit ? Number(o.limit) : null,
    ids: o.ids ? o.ids.split(",") : null, types: o.types ? o.types.split(",") : null,
    budgetUsd: Number(o["budget-usd"] ?? 0), maxTurns: Number(o["max-turns"] ?? 50), maxQuestionUsd: Number(o["max-question-usd"] ?? 3),
    out: o.out ?? fileURLToPath(new URL("./results/", import.meta.url)),
  };
}

export async function main(opts, { log = console.log, env = process.env } = {}) {
  if (opts.model !== "mock" && !(opts.budgetUsd > 0)) throw new Error("A paid run needs --budget-usd: the most this run may spend, in US dollars.");
  let items = await loadSet(opts.set);
  if (opts.ids) items = items.filter((x) => opts.ids.includes(x.id));
  if (opts.types) items = items.filter((x) => opts.types.includes(x.type));
  if (opts.limit) items = items.slice(0, opts.limit);
  mkdirSync(opts.out, { recursive: true });
  const file = `${opts.out}/${opts.set}.jsonl`, spendFile = `${opts.out}/spend.json`;
  // Read without checking first: a check and a later read are two looks at a file that can change.
  const prior = (() => { try { return readFileSync(file, "utf8"); } catch { return ""; } })();
  const done = new Set(prior.split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.harness_error && r.pass !== null).map((r) => `${r.model}|${r.arm}|${r.id}|${r.rep}`));
  const spent = () => { try { return JSON.parse(readFileSync(spendFile, "utf8")).usd ?? 0; } catch { return 0; } };
  const charge = (usd) => writeFileSync(spendFile, JSON.stringify({ usd: Number((spent() + usd).toFixed(6)), updated: new Date().toISOString() }) + "\n");
  const client = modelClient(opts.model), judge = modelClient(opts.judge);
  const code = codeVersions(), dataset = SOURCES[opts.set] ? { url: SOURCES[opts.set].url, sha256: SOURCES[opts.set].sha256 } : { file: "dev.json" };
  const tally = { answered: 0, passed: 0, usd: 0 };
  for (const arm of opts.arms) {
    const todo = items.flatMap((item) => Array.from({ length: opts.reps }, (_, rep) => [item, rep])).filter(([item, rep]) => !done.has(`${opts.model}|${arm}|${item.id}|${rep}`));
    if (!todo.length) continue;
    const ctx = await connectArm(arm);
    log(`ARM ${arm}: ${ctx.tools.length} tools; ${todo.length} answers to run`);
    try {
      for (const [item, rep] of todo) {
        if (opts.budgetUsd > 0 && spent() >= opts.budgetUsd) { log(`BUDGET_REACHED: $${spent().toFixed(2)} of $${opts.budgetUsd}`); return { ...tally, exit: 4 }; }
        let a, v;
        try {
          a = await answer(client, ctx, item, { maxTurns: opts.maxTurns, maxQuestionUsd: opts.maxQuestionUsd, env });
          v = await grade(judge, item, a.answer, env);
        } catch (err) {
          if (outOfCredit(err)) { log(`OUT_OF_CREDIT at ${arm} ${item.id}: ${err.message}`); return { ...tally, exit: 3 }; }
          a = { answer: null, stopped: `harness error: ${err.message}`, cost_usd: 0 };
          v = { pass: null, judge_cost_usd: 0 };
        }
        const usd = (a.cost_usd ?? 0) + (v.judge_cost_usd ?? 0);
        charge(usd);
        tally.answered++; tally.passed += v.pass ? 1 : 0; tally.usd += usd;
        appendFileSync(file, `${JSON.stringify({ set: opts.set, id: item.id, type: item.type, model: opts.model, arm, rep, judge: opts.judge, pass: v.pass, met: v.met ?? null, of: v.of ?? null, verdict: v.items ?? v.why ?? v.error ?? null, answer: a.answer, stopped: a.stopped ?? null, ...(a.stopped?.startsWith("harness error") ? { harness_error: true } : {}), turns: a.turns ?? null, calls: a.calls ?? null, errors: a.errors ?? null, usage: a.usage ?? null, cost_usd: a.cost_usd ?? 0, judge_cost_usd: v.judge_cost_usd ?? 0, seconds: a.seconds ?? null, trace: a.trace ?? [], code: arm.startsWith("canli") ? code : null, dataset, at: new Date().toISOString() })}\n`);
        const score = v.of ? ` ${v.met}/${v.of}` : "";
        log(`${arm} ${item.id} [${item.type}] #${rep}: ${v.pass === null ? "ERROR" : v.pass ? "PASS" : "FAIL"}${score} · ${a.turns ?? "-"} turns · $${usd.toFixed(3)}${a.stopped ? ` · ${a.stopped}` : ""}`);
      }
    } finally {
      await closeArm(ctx);
    }
  }
  log(`RUN_DONE: ${tally.passed} of ${tally.answered} passed; $${tally.usd.toFixed(2)} this run, $${spent().toFixed(2)} in all`);
  return { ...tally, exit: 0 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = await main(parseArgs(process.argv.slice(2)));
  process.exit(r.exit);
}
