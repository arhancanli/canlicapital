// The external question sets, each fetched at a pinned commit and checked against its pinned SHA-256
// on every run (they are small; nothing is written to disk):
//   vals          Vals.ai Finance Agent Benchmark, public set: 50 questions, each with a rubric of facts
//                 the answer must state and one reference answer it must not contradict (MIT).
//   financebench  Patronus AI's FinanceBench open-source sample: 150 questions with reference answers
//                 (no licence file in its repository: check the dataset card before publishing transcripts).
//   dev           synthetic questions in dev.json, for building and testing the runner.
// Only six of the 50 Vals questions were read during development (2026-10-14, listed in README.md);
// the other 44 are the final exam. Nothing here prints a question: callers log ids and types only.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const SOURCES = Object.freeze({
  vals: {
    url: "https://raw.githubusercontent.com/vals-ai/finance-agent/43e732835589bebd30c0f66ed765bfda6abb9fbe/data/public.csv",
    sha256: "901e8cff562819007d43ff0c10b43b2e386481eb40f2157ba18da8fbbe05bff5",
    asOf: "2025-04-07",
  },
  financebench: {
    url: "https://raw.githubusercontent.com/patronus-ai/financebench/cc39aeb4afdf33909ee1412188bf89035950c2eb/data/financebench_open_source.jsonl",
    sha256: "a5a2aa673e573e55675fc3c0f9aa38c1cf59d2abc91edb077534f71f10a71877",
    asOf: null,
  },
});

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
export const idOf = (question) => sha256(question).slice(0, 12);

// RFC 4180: quoted fields may hold commas, line breaks and doubled quotes.
export function parseCsv(text) {
  const s = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((f) => f !== ""));
  return body.map((r) => Object.fromEntries(head.map((h, j) => [h, r[j] ?? ""])));
}

export function valsItems(text) {
  return parseCsv(text).map((r) => ({ id: `vals-${idOf(r.Question)}`, set: "vals", type: r["Question Type"], question: r.Question, reference: r.Answer, rubric: JSON.parse(r.Rubric), asOf: SOURCES.vals.asOf }));
}

export function financebenchItems(text) {
  return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).map((r) => ({ id: r.financebench_id, set: "financebench", type: r.question_type, question: r.question, reference: r.answer, rubric: null, asOf: SOURCES.financebench.asOf, company: r.company, document: r.doc_name }));
}

// The set's items, from a download that must match the pinned SHA-256.
export async function loadSet(name, { fetchImpl = fetch } = {}) {
  if (name === "dev") return JSON.parse(readFileSync(new URL("./dev.json", import.meta.url), "utf8"));
  const src = SOURCES[name];
  if (!src) throw new Error(`Unknown set ${name}: vals, financebench or dev.`);
  const res = await fetchImpl(src.url);
  if (!res.ok) throw new Error(`${name}: ${res.status} from ${src.url}`);
  const text = await res.text();
  if (sha256(text) !== src.sha256) throw new Error(`${name}: the file at the pinned commit no longer has the pinned SHA-256; refusing to run on different questions.`);
  return name === "vals" ? valsItems(text) : financebenchItems(text);
}
