// Small models that run on this machine, for those who want them. Nothing here runs or downloads until
// someone runs `canli-mcp models install`, and no tool ever installs anything by itself. With them,
// filing_memory can rank by meaning and filing_sentiment can read tone, and no text leaves the machine.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import { htmlToText } from "./html.mjs";
import { readFiling } from "./tools.mjs";

// Pinned, so the same words give the same numbers next year.
export const RUNTIME_PACKAGE = "@huggingface/transformers@4.3.2";
export const MODELS = Object.freeze({
  embedding: { id: "Xenova/all-MiniLM-L6-v2", revision: "751bff37182d3f1213fa05d7196b954e230abad9", dtype: "q8", dimensions: 384, license: "Apache-2.0" },
  sentiment: { id: "Xenova/finbert", revision: "8f269abebfdd9009d7d9b5e96af7e5c6bfe50b20", dtype: "q8", license: "CC BY-NC-SA 4.0, on ProsusAI/finbert's model card: not for commercial use" },
});
export const modelsDir = (env = process.env) => join(env.CANLI_CACHE_DIR ?? join(homedir(), ".cache", "canli-markets"), "models");
export const INSTALL_HINT = "Local models are not installed. Run this once, yourself: canli-mcp models install (about 500 MB of runtime and 140 MB of models). They run on this machine and no text leaves it. The FinBERT model is licensed for non-commercial use.";

export function modelsInstalled(env = process.env) {
  return !env.VERCEL && existsSync(join(modelsDir(env), "node_modules", "@huggingface", "transformers", "package.json"));
}

async function runtime(session) {
  if (session.modelRuntime) return session.modelRuntime;
  if (!modelsInstalled(session.env)) throw new Error(INSTALL_HINT);
  const dir = modelsDir(session.env);
  const entry = createRequire(join(dir, "package.json")).resolve("@huggingface/transformers");
  const mod = await import(pathToFileURL(entry).href);
  mod.env.cacheDir = join(dir, "hf");
  session.modelRuntime = mod;
  return mod;
}

const pipelines = new Map();
async function pipelineFor(session, task, model) {
  const key = `${task}|${model.id}`;
  if (!pipelines.has(key)) pipelines.set(key, (async () => (await runtime(session)).pipeline(task, model.id, { dtype: model.dtype, revision: model.revision }))());
  return pipelines.get(key);
}

// Unit vectors, so a dot product is the cosine.
export async function embed(session, texts, { batch = 16 } = {}) {
  const fx = session.embedder ?? await pipelineFor(session, "feature-extraction", MODELS.embedding);
  const d = MODELS.embedding.dimensions, out = new Float32Array(texts.length * d);
  for (let i = 0; i < texts.length; i += batch) {
    const r = await fx(texts.slice(i, i + batch).map((t) => t.slice(0, 1000)), { pooling: "mean", normalize: true });
    out.set(r.data, i * d);
  }
  return out;
}

export const sentimentInput = z.object({
  text: z.string().min(1).max(40000).optional().describe("Text to read. Or name a filing with company."),
  company: z.string().min(1).max(120).optional().describe("Read this company's latest filing of form."),
  accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/).optional().describe("Read this filing."),
  form: z.string().min(1).max(10).optional().describe("Default 8-K, whose press release (EX-99.1) is read when it has one."),
  document: z.string().min(1).max(100).optional().describe("A document in the filing, such as EX-99.1."),
  section: z.string().min(1).max(40).optional().describe("For a 10-K or 10-Q: a section such as md&a."),
  max_sentences: z.number().int().min(1).max(600).optional().describe("Most sentences to read; default 200."),
}).strict();

export function sentencesOf(text) {
  return String(text).replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z"(])/).map((s) => s.trim()).filter((s) => s.split(" ").length >= 6 && s.length < 800 && !/\s\|\s.*\s\|\s/.test(s));
}

export async function filingSentiment(session, args) {
  const a = sentimentInput.parse(args);
  if (!a.text && !a.company && !a.accession) throw new Error("filing_sentiment needs text, company or accession.");
  let source = "the text given", text = a.text;
  if (!text) {
    const form = a.form ?? "8-K";
    const pull = async (document) => {
      let all = "", head = null, offset = 0;
      for (let page = 0; page < 6; page += 1) {
        const r = await readFiling(session, { ...(a.company ? { company: a.company } : {}), ...(a.accession ? { accession: a.accession } : {}), form, ...(document ? { document } : {}), ...(a.section ? { section: a.section } : {}), max_chars: 100000, offset });
        head ??= r; all += r.text ?? "";
        if (r.next_offset === undefined) break;
        offset = r.next_offset;
      }
      return { head, all };
    };
    const want = a.document ?? (form === "8-K" && !a.section ? "EX-99.1" : undefined);
    const got = await pull(want).catch(async (err) => { if (a.document || !want) throw err; return pull(undefined); });
    text = got.all; source = got.head?.url ?? `${a.company ?? a.accession} ${form}`;
    if (/<html|<\/p>/i.test(text)) text = htmlToText(text);
  }
  const sentences = sentencesOf(text).slice(0, a.max_sentences ?? 200);
  if (!sentences.length) throw new Error("No whole sentences to read in that text.");
  const clf = session.sentimentModel ?? await pipelineFor(session, "text-classification", MODELS.sentiment);
  const scored = [];
  for (let i = 0; i < sentences.length; i += 16) {
    const out = await clf(sentences.slice(i, i + 16));
    out.forEach((o, j) => scored.push({ text: sentences[i + j], label: o.label, score: Number(o.score.toFixed(3)) }));
  }
  const count = (l) => scored.filter((s) => s.label === l).length;
  const top = (l) => scored.filter((s) => s.label === l).sort((x, y) => y.score - x.score).slice(0, 5).map((s) => [s.score, s.text.slice(0, 300)]);
  return {
    source, sentences_read: scored.length,
    positive: count("positive"), negative: count("negative"), neutral: count("neutral"),
    net_tone: Number(((count("positive") - count("negative")) / scored.length).toFixed(3)),
    most_negative: { columns: ["score", "sentence"], rows: top("negative") },
    most_positive: { columns: ["score", "sentence"], rows: top("positive") },
    model: `${MODELS.sentiment.id}, a smaller copy of FinBERT, run on this machine`,
    model_license: MODELS.sentiment.license,
    meaning: "net_tone is the share of positive sentences minus the share of negative ones, from -1 to 1.",
    limits: ["FinBERT learned from finance news sentences, not filings. It reads tone, not truth, and companies choose their tone.", "Nothing here shows that tone predicts a price."],
  };
}
