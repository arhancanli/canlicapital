// Captures what job_postings reads (node scripts/capture-jobs-fixtures.mjs): Indeed Hiring Lab's files on GitHub,
// once, trimmed to what the tests read. The US totals are kept whole (their peak is in 2022); the other countries'
// totals keep their last 400 days; the US sector and state files keep the days the changes are measured on (the
// latest, four weeks, thirteen weeks and a year before), their total postings only.
// Every response goes into test/fixtures/manifest.json as j###.gz under the exact URL asked for. Responses already
// captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { jobPostings } from "../src/jobs.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^j(\d+)/.exec(f)?.[1] ?? 0)));
const back = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);

function trim(url, text) {
  if (/aggregate_job_postings_US\.csv$/.test(url)) return text;
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const last = lines.reduce((m, l) => (l.slice(0, 10) > m ? l.slice(0, 10) : m), "");
  if (/aggregate_job_postings_/.test(url)) return [head, ...lines.filter((l) => l.slice(0, 10) >= back(last, 400))].join("\n");
  const days = new Set([0, 28, 91, 364].map((d) => back(last, d)));
  return [head, ...lines.filter((l) => days.has(l.slice(0, 10)) && !/new postings/.test(l))].join("\n");
}

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  if (!res.ok) return new Response(await res.arrayBuffer(), { status: res.status });
  const text = trim(url, await res.text());
  const file = `j${String(++n).padStart(3, "0")}.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(Buffer.from(text), { level: 9 }));
  manifest[url] = file;
  return new Response(text, { status: 200 });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
for (const args of [{}, { by: "sector" }, { by: "region" }, { country: "all" }]) {
  try {
    const r = await jobPostings(session, args);
    console.log("ok", JSON.stringify(args), r.rows.length);
  } catch (err) {
    console.log("error", JSON.stringify(args), err.message.slice(0, 200));
  }
}
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
